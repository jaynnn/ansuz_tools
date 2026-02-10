import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logInfo, logError } from '../utils/logger';
import { dbRun, dbGet, dbAll } from '../utils/database';

const router = Router();

// Get current user's impression
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const impression = await dbGet(
      'SELECT dimensions, overview, updated_at FROM user_impressions WHERE user_id = ?',
      [req.userId]
    );

    if (!impression) {
      return res.json({ dimensions: {}, overview: null, updated_at: null });
    }

    res.json({
      dimensions: JSON.parse(impression.dimensions),
      overview: impression.overview,
      updated_at: impression.updated_at,
    });
  } catch (error: any) {
    logError('get_impression_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch impression' });
  }
});

// Get another user's impression overview (public)
router.get('/user/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
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

export default router;
