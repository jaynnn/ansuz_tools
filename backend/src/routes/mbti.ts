import { Router, Response, NextFunction } from 'express';
import { chatCompletion } from '../utils/llmService';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logInfo, logError, logWarn } from '../utils/logger';
import { dbRun, dbAll, dbGet } from '../utils/database';
import { triggerImpressionUpdate, triggerUserMatching } from '../utils/impressionService';

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

    const systemPrompt = `你是一位资深的MBTI人格类型分析师，拥有心理学专业背景。请根据用户的MBTI测试答题数据进行全面深度分析。

请用中文回答，使用Markdown格式，按以下结构组织分析报告：

### 📋 判定的MBTI类型
明确给出你判定的MBTI四字母类型，并给出该类型的中文名称和一句话概述。

### 📊 四维度深度解析
对每个维度进行专业分析，包含倾向程度和具体行为表现：
- **E/I 精力维度**：分析外向/内向倾向及程度，描述在社交、独处中的典型表现
- **S/N 信息维度**：分析感觉/直觉倾向及程度，描述在获取和处理信息时的偏好
- **T/F 决策维度**：分析思维/情感倾向及程度，描述在做决定时的判断依据
- **J/P 生活维度**：分析判断/知觉倾向及程度，描述在规划和适应方面的习惯

### 🧠 核心人格特征
用3-5个关键词概括核心特征，并对每个关键特征进行详细描述，包括在工作、生活、人际关系中的具体表现。

### 💪 优势与潜在挑战

**核心优势：**
列出4-5个主要优势，每个优势配有具体说明

**潜在挑战：**
列出3-4个可能的挑战或盲区，并给出改善建议

### 🎯 职业发展建议
推荐3-5个最适合的职业领域，说明为什么这些领域与该人格类型匹配，以及在职场中的发展策略。

### 💕 人际关系洞察
分析在友情、爱情、团队协作中的表现模式，给出人际交往建议。

### 🔄 与分值判定对比
如果你的判定与基于分值的判定（${scoreBasedType}）不同，请详细解释原因和差异分析。如果一致，请说明判定的信心程度。`;

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

    // Async: trigger impression update with MBTI result
    triggerImpressionUpdate(
      req.userId!,
      'MBTI测试完成',
      `用户完成了MBTI测试，结果为${scoreBasedType}。各维度分值：E/I=${scores.EI}, S/N=${scores.SN}, T/F=${scores.TF}, J/P=${scores.JP}。`
    );

    // Async: trigger user matching (respects weekly cooldown)
    triggerUserMatching(req.userId!);
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
