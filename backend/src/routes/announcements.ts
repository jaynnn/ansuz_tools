import { Router, Response } from 'express';
import { dbRun, dbGet } from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { broadcastMessage } from '../utils/wsManager';
import { logInfo } from '../utils/logger';

const router = Router();

// Get latest active announcement
router.get('/latest', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const announcement = await dbGet(
      `SELECT id, message, created_at FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1`
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
    const { message, secret } = req.body;

    // Verify admin secret (ANNOUNCEMENT_SECRET or falls back to JWT_SECRET)
    const expectedSecret = process.env.ANNOUNCEMENT_SECRET || process.env.JWT_SECRET;
    if (!secret || secret !== expectedSecret) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const trimmedMessage = message.trim();

    // Deactivate old announcements
    await dbRun('UPDATE announcements SET is_active = 0 WHERE is_active = 1');

    // Insert new announcement
    await dbRun(
      'INSERT INTO announcements (message, is_active) VALUES (?, 1)',
      [trimmedMessage]
    );

    // Broadcast to all connected WebSocket clients
    const sentCount = broadcastMessage('announcement', { message: trimmedMessage });

    logInfo('announcement_broadcast', { message: trimmedMessage, sentTo: sentCount });
    res.json({ message: 'Announcement broadcast successfully', sentTo: sentCount });
  } catch (error) {
    console.error('Broadcast announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
