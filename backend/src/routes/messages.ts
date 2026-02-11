import { Router, Response, NextFunction } from 'express';
import { dbRun, dbAll } from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logInfo, logWarn } from '../utils/logger';
import { sanitizeString } from '../utils/sanitize';

const router = Router();

// Rate limiter: 5 messages per minute per user
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;

// Periodic cleanup of expired rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap) {
    const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, valid);
    }
  }
}, 5 * 60 * 1000).unref();

const rateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const key = String(req.userId || req.ip);
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    logWarn('message_rate_limit_exceeded', { key });
    return res.status(429).json({ error: '留言太频繁，请稍后再试。' });
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  next();
};

const VALID_CATEGORIES = ['tool_request', 'suggestion', 'bug_report', 'other'];

// Submit a message
router.post('/', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { category, content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: '留言内容不能为空' });
    }

    const sanitizedContent = sanitizeString(content, 2000);
    if (sanitizedContent.length === 0) {
      return res.status(400).json({ error: '留言内容无效' });
    }

    const sanitizedCategory = VALID_CATEGORIES.includes(category) ? category : 'other';

    await dbRun(
      'INSERT INTO messages (user_id, category, content) VALUES (?, ?, ?)',
      [req.userId, sanitizedCategory, sanitizedContent]
    );

    logInfo('message_created', { userId: req.userId, category: sanitizedCategory });
    res.status(201).json({ message: '留言成功，感谢您的反馈！' });
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get my messages
router.get('/mine', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const messages = await dbAll(
      'SELECT id, category, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.userId]
    );
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
