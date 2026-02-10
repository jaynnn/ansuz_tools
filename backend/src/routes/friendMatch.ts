import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logInfo, logError } from '../utils/logger';
import { dbRun, dbGet, dbAll } from '../utils/database';

const router = Router();

// Get top 10 matches for current user
router.get('/top', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const matches = await dbAll(
      `SELECT
        um.score,
        um.dimensions,
        um.updated_at,
        CASE WHEN um.user_id_a = ? THEN um.user_id_b ELSE um.user_id_a END as matched_user_id
       FROM user_matches um
       WHERE um.user_id_a = ? OR um.user_id_b = ?
       ORDER BY um.score DESC
       LIMIT 10`,
      [userId, userId, userId]
    );

    // Enrich with user info and overview
    const enriched = await Promise.all(
      matches.map(async (m: any) => {
        const userInfo = await dbGet(
          'SELECT id, nickname, avatar FROM users WHERE id = ?',
          [m.matched_user_id]
        );
        const impression = await dbGet(
          'SELECT overview FROM user_impressions WHERE user_id = ?',
          [m.matched_user_id]
        );
        return {
          userId: m.matched_user_id,
          nickname: userInfo?.nickname || 'Unknown',
          avatar: userInfo?.avatar || 'seal',
          score: m.score,
          overview: impression?.overview || null,
          matchDimensions: JSON.parse(m.dimensions),
          updatedAt: m.updated_at,
        };
      })
    );

    res.json({ matches: enriched });
  } catch (error: any) {
    logError('get_top_matches_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch matches' });
  }
});

// Get/update private info for current user
router.get('/private-info', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const info = await dbGet(
      'SELECT appearance, contact, extra FROM user_private_info WHERE user_id = ?',
      [req.userId]
    );
    res.json(info || { appearance: '', contact: '', extra: '' });
  } catch (error: any) {
    logError('get_private_info_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch private info' });
  }
});

router.put('/private-info', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { appearance, contact, extra } = req.body;

    await dbRun(
      `INSERT INTO user_private_info (user_id, appearance, contact, extra, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET appearance = ?, contact = ?, extra = ?, updated_at = CURRENT_TIMESTAMP`,
      [req.userId, appearance || '', contact || '', extra || '', appearance || '', contact || '', extra || '']
    );

    logInfo('private_info_updated', { userId: req.userId });
    res.json({ message: 'Private info updated' });
  } catch (error: any) {
    logError('update_private_info_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to update private info' });
  }
});

// Send "want to know you" notification
router.post('/want-to-know', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { targetUserId } = req.body;
    const fromUserId = req.userId!;

    if (!targetUserId || targetUserId === fromUserId) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    // Check if already sent
    const existing = await dbGet(
      `SELECT id FROM notifications WHERE from_user_id = ? AND to_user_id = ? AND type = 'want_to_know'`,
      [fromUserId, targetUserId]
    );
    if (existing) {
      return res.status(400).json({ error: 'Already sent a request to this user' });
    }

    await dbRun(
      `INSERT INTO notifications (from_user_id, to_user_id, type) VALUES (?, ?, 'want_to_know')`,
      [fromUserId, targetUserId]
    );

    logInfo('want_to_know_sent', { fromUserId, targetUserId });
    res.json({ message: 'Request sent successfully' });
  } catch (error: any) {
    logError('want_to_know_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to send request' });
  }
});

// Get notifications for current user
router.get('/notifications', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const notifications = await dbAll(
      `SELECT n.id, n.from_user_id, n.is_read, n.created_at,
              u.nickname, u.avatar
       FROM notifications n
       JOIN users u ON n.from_user_id = u.id
       WHERE n.to_user_id = ?
       ORDER BY n.created_at DESC`,
      [req.userId]
    );

    res.json({ notifications });
  } catch (error: any) {
    logError('get_notifications_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch notifications' });
  }
});

// Get unread notification count
router.get('/notifications/unread-count', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await dbGet(
      'SELECT COUNT(*) as count FROM notifications WHERE to_user_id = ? AND is_read = 0',
      [req.userId]
    );
    res.json({ count: result?.count || 0 });
  } catch (error: any) {
    logError('get_unread_count_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch unread count' });
  }
});

// Mark notifications as read
router.put('/notifications/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await dbRun(
      'UPDATE notifications SET is_read = 1 WHERE to_user_id = ?',
      [req.userId]
    );
    res.json({ message: 'Notifications marked as read' });
  } catch (error: any) {
    logError('mark_read_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to mark as read' });
  }
});

export default router;
