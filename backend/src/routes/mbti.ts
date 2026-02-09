import { Router, Response, NextFunction } from 'express';
import { chatCompletion } from '../utils/llmService';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logInfo, logError, logWarn } from '../utils/logger';
import { dbRun, dbAll, dbGet } from '../utils/database';

const router = Router();

// Simple in-memory rate limiter for LLM-powered endpoints
const rateLimitMap = new Map<number, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5; // max 5 MBTI analyses per minute per user

const mbtiRateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    logWarn('mbti_rate_limit_exceeded', { userId });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  next();
};

// General rate limiter for CRUD endpoints (more permissive)
const generalRateLimitMap = new Map<number, number[]>();
const GENERAL_RATE_LIMIT_MAX = 30; // max 30 requests per minute per user

const generalRateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const now = Date.now();
  const timestamps = (generalRateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= GENERAL_RATE_LIMIT_MAX) {
    logWarn('mbti_general_rate_limit_exceeded', { userId });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  timestamps.push(now);
  generalRateLimitMap.set(userId, timestamps);
  next();
};

interface MBTIAnswer {
  questionId: number;
  dimension: string;
  direction: string;
  value: number;
}

// Analyze MBTI test results using LLM
router.post('/analyze', authMiddleware, mbtiRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { answers, scores } = req.body as {
      answers: MBTIAnswer[];
      scores: { EI: number; SN: number; TF: number; JP: number };
    };

    if (!answers || !scores) {
      return res.status(400).json({ error: 'Answers and scores are required' });
    }

    logInfo('mbti_analyze_request', { userId: req.userId, answerCount: answers.length });

    const scoreBasedType = [
      scores.EI >= 0 ? 'E' : 'I',
      scores.SN >= 0 ? 'S' : 'N',
      scores.TF >= 0 ? 'T' : 'F',
      scores.JP >= 0 ? 'J' : 'P',
    ].join('');

    const systemPrompt = `你是一位专业的MBTI人格类型分析师。请根据用户的MBTI测试答题数据进行深度分析。
请用中文回答，格式如下：
1. **判定的MBTI类型**：给出你判定的类型（四个字母）
2. **各维度分析**：
   - E/I维度：分析外向/内向倾向及程度
   - S/N维度：分析感觉/直觉倾向及程度
   - T/F维度：分析思维/情感倾向及程度
   - J/P维度：分析判断/知觉倾向及程度
3. **人格特征描述**：详细描述该人格类型的特征
4. **优势与潜在挑战**：列出主要优势和可能面临的挑战
5. **适合的职业方向**：推荐适合的职业领域
6. **与基于分值的判定对比**：如果你的判定与分值判定（${scoreBasedType}）不同，请解释原因`;

    const answersDescription = answers.map(a =>
      `题目${a.questionId}(${a.dimension}维度, ${a.direction}方向): 得分${a.value}`
    ).join('\n');

    const userMessage = `以下是我的MBTI测试结果：

基于分值的初步判定: ${scoreBasedType}
各维度原始分值: E/I=${scores.EI}, S/N=${scores.SN}, T/F=${scores.TF}, J/P=${scores.JP}

详细答题数据：
${answersDescription}

请进行深度分析。`;

    const result = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]);

    logInfo('mbti_analyze_success', { userId: req.userId, model: result.model });

    // Auto-save analysis result to history
    let savedId: number | null = null;
    try {
      const saveResult = await dbRun(
        `INSERT INTO mbti_results (user_id, mbti_type, scores, answers, ai_analysis, model)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.userId,
          scoreBasedType,
          JSON.stringify(scores),
          JSON.stringify(answers),
          result.content,
          result.model,
        ]
      );
      savedId = saveResult.lastID ?? null;
      logInfo('mbti_result_saved', { userId: req.userId, resultId: savedId });
    } catch (saveError) {
      logError('mbti_result_save_error', saveError as Error, { userId: req.userId });
    }

    res.json({
      scoreBasedType,
      scores,
      llmAnalysis: result.content,
      model: result.model,
      savedId,
    });
  } catch (error: any) {
    logError('mbti_analyze_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'MBTI analysis failed' });
  }
});

// Save MBTI test result (score-only, without AI analysis)
router.post('/save', authMiddleware, generalRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { mbtiType, scores, answers } = req.body as {
      mbtiType: string;
      scores: { EI: number; SN: number; TF: number; JP: number };
      answers: MBTIAnswer[];
    };

    if (!mbtiType || !scores || !answers) {
      return res.status(400).json({ error: 'mbtiType, scores and answers are required' });
    }

    const result = await dbRun(
      `INSERT INTO mbti_results (user_id, mbti_type, scores, answers)
       VALUES (?, ?, ?, ?)`,
      [req.userId, mbtiType, JSON.stringify(scores), JSON.stringify(answers)]
    );

    logInfo('mbti_result_saved', { userId: req.userId, resultId: result.lastID });

    res.json({ id: result.lastID, message: 'Result saved successfully' });
  } catch (error: any) {
    logError('mbti_save_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to save MBTI result' });
  }
});

// Get MBTI test history
router.get('/history', authMiddleware, generalRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const results = await dbAll(
      `SELECT id, mbti_type, scores, ai_analysis, model, created_at
       FROM mbti_results WHERE user_id = ? ORDER BY created_at DESC`,
      [req.userId]
    );

    const parsed = results.map(r => ({
      ...r,
      scores: JSON.parse(r.scores),
      hasAiAnalysis: !!r.ai_analysis,
    }));

    res.json(parsed);
  } catch (error: any) {
    logError('mbti_history_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch MBTI history' });
  }
});

// Get a specific MBTI test result
router.get('/history/:id', authMiddleware, generalRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const result = await dbGet(
      `SELECT id, mbti_type, scores, answers, ai_analysis, model, created_at
       FROM mbti_results WHERE id = ? AND user_id = ?`,
      [req.params.id, req.userId]
    );

    if (!result) {
      return res.status(404).json({ error: 'Result not found' });
    }

    res.json({
      ...result,
      scores: JSON.parse(result.scores),
      answers: JSON.parse(result.answers),
    });
  } catch (error: any) {
    logError('mbti_history_detail_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch MBTI result' });
  }
});

// Delete a specific MBTI test result
router.delete('/history/:id', authMiddleware, generalRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const result = await dbRun(
      `DELETE FROM mbti_results WHERE id = ? AND user_id = ?`,
      [req.params.id, req.userId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Result not found' });
    }

    logInfo('mbti_result_deleted', { userId: req.userId, resultId: req.params.id });
    res.json({ message: 'Result deleted successfully' });
  } catch (error: any) {
    logError('mbti_delete_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to delete MBTI result' });
  }
});

export default router;
