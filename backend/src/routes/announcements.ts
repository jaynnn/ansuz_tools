import { Router, Response, NextFunction } from 'express';
import { dbRun, dbGet } from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { broadcastMessage } from '../utils/wsManager';
import { logInfo, logWarn } from '../utils/logger';

const router = Router();

// Rate limiter
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

const rateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const key = String(req.userId || req.ip);
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    logWarn('announcement_rate_limit_exceeded', { key });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  next();
};

// Get latest active announcement
router.get('/latest', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const announcement = await dbGet(
      `SELECT id, message, duration, created_at FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1`
    );
    res.json({ announcement: announcement || null });
  } catch (error) {
    console.error('Get announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Internal: create and broadcast announcement (called by script via HTTP)
router.post('/broadcast', async (req: AuthRequest, res: Response) => {
  try {
    const { message, secret, duration } = req.body;

    // Verify admin secret (ANNOUNCEMENT_SECRET or falls back to JWT_SECRET)
    const expectedSecret = process.env.ANNOUNCEMENT_SECRET || process.env.JWT_SECRET;
    if (!secret || secret !== expectedSecret) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const trimmedMessage = message.trim();
    const durationSeconds = (typeof duration === 'number' && duration > 0) ? Math.min(duration, 86400) : null;

    // Deactivate old announcements
    await dbRun('UPDATE announcements SET is_active = 0 WHERE is_active = 1');

    // Insert new announcement
    await dbRun(
      'INSERT INTO announcements (message, is_active, duration) VALUES (?, 1, ?)',
      [trimmedMessage, durationSeconds]
    );

    // Broadcast to all connected WebSocket clients
    const sentCount = broadcastMessage('announcement', { message: trimmedMessage, duration: durationSeconds });

    logInfo('announcement_broadcast', { message: trimmedMessage, duration: durationSeconds, sentTo: sentCount });
    res.json({ message: 'Announcement broadcast successfully', sentTo: sentCount });
  } catch (error) {
    console.error('Broadcast announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Close (deactivate) current announcement
router.post('/close', async (req: AuthRequest, res: Response) => {
  try {
    const { secret } = req.body;

    // Verify admin secret (ANNOUNCEMENT_SECRET or falls back to JWT_SECRET)
    const expectedSecret = process.env.ANNOUNCEMENT_SECRET || process.env.JWT_SECRET;
    if (!secret || secret !== expectedSecret) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await dbRun('UPDATE announcements SET is_active = 0 WHERE is_active = 1');

    logInfo('announcement_closed', {});
    res.json({ message: 'Announcement closed successfully' });
  } catch (error) {
    console.error('Close announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
