import { Router, Response } from 'express';
import { chatCompletion, getLLMConfig } from '../utils/llmService';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logInfo, logError } from '../utils/logger';
import type { LLMMessage, LLMConfig } from '../utils/llmService';

const router = Router();

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
router.post('/chat', authMiddleware, async (req: AuthRequest, res: Response) => {
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
