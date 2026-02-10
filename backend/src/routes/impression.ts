import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logInfo, logError, logWarn } from '../utils/logger';
import { dbRun, dbGet, dbAll } from '../utils/database';
import { chatCompletion } from '../utils/llmService';

const router = Router();

// Rate limiter
const rateLimitMap = new Map<number, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

const rateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    logWarn('impression_rate_limit_exceeded', { userId });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  next();
};

// Get current user's impression
router.get('/me', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const impression = await dbGet(
      'SELECT dimensions, overview, overview_self, updated_at FROM user_impressions WHERE user_id = ?',
      [req.userId]
    );

    if (!impression) {
      return res.json({ dimensions: {}, overview: null, overview_self: null, updated_at: null });
    }

    res.json({
      dimensions: JSON.parse(impression.dimensions),
      overview: impression.overview,
      overview_self: impression.overview_self,
      updated_at: impression.updated_at,
    });
  } catch (error: any) {
    logError('get_impression_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch impression' });
  }
});

// Get another user's impression overview (public)
router.get('/user/:userId', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.userId as string, 10);
    const impression = await dbGet(
      'SELECT overview, updated_at FROM user_impressions WHERE user_id = ?',
      [targetUserId]
    );

    const userInfo = await dbGet(
      'SELECT id, username, nickname, avatar FROM users WHERE id = ?',
      [targetUserId]
    );

    if (!userInfo) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get contact info only if the user has provided it
    const privateInfo = await dbGet(
      'SELECT contact FROM user_private_info WHERE user_id = ?',
      [targetUserId]
    );

    res.json({
      user: {
        id: userInfo.id,
        nickname: userInfo.nickname,
        avatar: userInfo.avatar || 'seal',
      },
      overview: impression?.overview || null,
      contact: privateInfo?.contact || null,
    });
  } catch (error: any) {
    logError('get_user_impression_error', error as Error, { targetUserId: req.params.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch user impression' });
  }
});

// Generate detailed user profile via LLM
router.get('/user/:userId/profile', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.userId as string, 10);

    const userInfo = await dbGet(
      'SELECT id, nickname FROM users WHERE id = ?',
      [targetUserId]
    );
    if (!userInfo) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Gather impression dimensions
    const impression = await dbGet(
      'SELECT dimensions, overview FROM user_impressions WHERE user_id = ?',
      [targetUserId]
    );

    // Gather private info
    const privateInfo = await dbGet(
      'SELECT appearance, extra FROM user_private_info WHERE user_id = ?',
      [targetUserId]
    );

    const parts: string[] = [];
    if (impression?.dimensions) {
      try {
        const dims = JSON.parse(impression.dimensions);
        const dimDesc = Object.entries(dims)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join('；');
        if (dimDesc) parts.push(`印象维度：${dimDesc}`);
      } catch { /* ignore */ }
    }
    if (impression?.overview) {
      parts.push(`印象概览：${impression.overview}`);
    }
    if (privateInfo?.appearance) {
      try {
        const appearance = JSON.parse(privateInfo.appearance);
        const appDesc = Object.entries(appearance)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join('，');
        if (appDesc) parts.push(`外貌信息：${appDesc}`);
      } catch { /* ignore */ }
    }
    if (privateInfo?.extra) {
      try {
        const extra = JSON.parse(privateInfo.extra);
        if (extra.location) parts.push(`所在地：${extra.location}`);
        if (extra.hobbies) parts.push(`兴趣爱好：${extra.hobbies}`);
        if (Array.isArray(extra.items)) {
          for (const item of extra.items) {
            if (item.field && item.detail) parts.push(`${item.field}：${item.detail}`);
          }
        }
      } catch { /* ignore */ }
    }

    if (parts.length === 0) {
      return res.json({ profile: '该用户暂未填写详细资料。' });
    }

    const systemPrompt = `你是一个社交资料撰写专家。请根据以下用户信息，生成一段自然流畅的个人介绍。
要求：
1. 不要逐条罗列信息（如身高、体重），而是将信息融合成一段自然的描述。
2. 语气自然客观，基于事实描述，不要刻意夸张或美化。
3. 必须基于客观事实，不允许无中生有或过度美化。例如：男性身高165cm就如实描述，不要说成"身材挺拔"或将其当作优势。
4. 不超过200字。
5. 使用第三人称。
6. 直接输出描述文字，不要包含任何标记或前缀。
7. 不要使用"非凡"、"卓越"、"出色"、"顶尖"等夸张修饰词，用平实的语言描述即可。`;

    const userMessage = `用户昵称：${userInfo.nickname}\n${parts.join('\n')}`;

    let profile: string;
    try {
      const llmResponse = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ]);
      profile = llmResponse.content.trim();
    } catch (llmError) {
      logError('user_profile_llm_error', llmError as Error, { targetUserId });
      return res.status(500).json({ error: '无法生成详细资料，请稍后再试' });
    }

    logInfo('user_profile_generated', { targetUserId, requestedBy: req.userId });
    res.json({ profile });
  } catch (error: any) {
    logError('get_user_profile_error', error as Error, { targetUserId: req.params.userId });
    res.status(500).json({ error: 'Failed to generate profile' });
  }
});

export default router;
