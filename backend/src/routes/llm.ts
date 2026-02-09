import { Router, Response, NextFunction } from 'express';
import { chatCompletion, getLLMConfig } from '../utils/llmService';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logInfo, logError, logWarn } from '../utils/logger';
import type { LLMMessage, LLMConfig } from '../utils/llmService';

const router = Router();

// Simple in-memory rate limiter for LLM endpoints
const rateLimitMap = new Map<number, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // max 10 requests per minute per user

const llmRateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    logWarn('llm_rate_limit_exceeded', { userId });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  next();
};

// Get LLM configuration status
router.get('/config', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const config = getLLMConfig();
    logInfo('get_llm_config', { userId: req.userId });
    res.json(config);
  } catch (error) {
    logError('get_llm_config_error', error as Error);
    res.status(500).json({ error: 'Failed to get LLM configuration' });
  }
});

// Chat completion endpoint
router.post('/chat', authMiddleware, llmRateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { messages, config } = req.body as { messages: LLMMessage[]; config?: LLMConfig };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    logInfo('llm_chat_request', { userId: req.userId, messageCount: messages.length });

    const result = await chatCompletion(messages, config);

    logInfo('llm_chat_success', { userId: req.userId, model: result.model });
    res.json(result);
  } catch (error: any) {
    logError('llm_chat_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'LLM request failed' });
  }
});

export default router;
