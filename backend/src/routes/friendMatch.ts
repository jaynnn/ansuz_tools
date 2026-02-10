import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logInfo, logError, logWarn } from '../utils/logger';
import { dbRun, dbGet, dbAll } from '../utils/database';
import { triggerImpressionUpdate, triggerUserMatchingDaily } from '../utils/impressionService';

const router = Router();

// Rate limiter for friend match endpoints
const rateLimitMap = new Map<number, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

const rateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    logWarn('friend_match_rate_limit_exceeded', { userId });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  next();
};

// Get top 10 matches for current user (excluding added/blocked users)
router.get('/top', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Get added/blocked user ids to exclude
    const excludedUsers = await dbAll(
      `SELECT target_user_id FROM user_added_list WHERE user_id = ?`,
      [userId]
    );
    const excludedIdSet = new Set(excludedUsers.map((u: any) => u.target_user_id));

    // Fetch more than 10 to account for excluded users, then filter and slice
    const matches = await dbAll(
      `SELECT
        um.score,
        um.dimensions,
        um.updated_at,
        um.user_id_a,
        CASE WHEN um.user_id_a = ? THEN um.user_id_b ELSE um.user_id_a END as matched_user_id
       FROM user_matches um
       WHERE (um.user_id_a = ? OR um.user_id_b = ?)
       ORDER BY um.score DESC
       LIMIT 20`,
      [userId, userId, userId]
    );

    // Enrich with user info and overview, filter out excluded
    const enriched = (await Promise.all(
      matches.map(async (m: any) => {
        if (excludedIdSet.has(m.matched_user_id)) return null;
        const userInfo = await dbGet(
          'SELECT id, nickname, avatar FROM users WHERE id = ?',
          [m.matched_user_id]
        );
        const impression = await dbGet(
          'SELECT overview FROM user_impressions WHERE user_id = ?',
          [m.matched_user_id]
        );
        // Get MBTI type
        const mbtiResult = await dbGet(
          'SELECT mbti_type FROM mbti_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
          [m.matched_user_id]
        );
        let dims: any = {};
        try {
          dims = JSON.parse(m.dimensions);
        } catch {
          dims = {};
        }
        // Determine which reason to show: if current user is A, show reason_a_to_b; otherwise show reason_b_to_a
        const matchReason = m.user_id_a === userId
          ? (dims.reason_a_to_b || dims.summary || null)
          : (dims.reason_b_to_a || dims.summary || null);
        return {
          userId: m.matched_user_id,
          nickname: userInfo?.nickname || 'Unknown',
          avatar: userInfo?.avatar || 'seal',
          mbtiType: mbtiResult?.mbti_type || null,
          score: m.score,
          overview: impression?.overview || null,
          matchReason,
          matchDimensions: dims,
          updatedAt: m.updated_at,
        };
      })
    )).filter(Boolean).slice(0, 10);

    res.json({ matches: enriched });
  } catch (error: any) {
    logError('get_top_matches_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch matches' });
  }
});

// Get/update private info for current user
router.get('/private-info', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
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

router.put('/private-info', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { appearance, contact, extra } = req.body;
    const safeAppearance = appearance || '';
    const safeContact = contact || '';
    const safeExtra = extra || '';

    await dbRun(
      `INSERT INTO user_private_info (user_id, appearance, contact, extra, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET appearance = ?, contact = ?, extra = ?, updated_at = CURRENT_TIMESTAMP`,
      [req.userId, safeAppearance, safeContact, safeExtra, safeAppearance, safeContact, safeExtra]
    );

    logInfo('private_info_updated', { userId: req.userId });
    res.json({ message: 'Private info updated' });

    // Async: trigger impression update and daily-limited matching after private info save
    triggerImpressionUpdate(
      req.userId!,
      '隐私信息更新',
      `用户更新了隐私信息。外貌信息：${safeAppearance}。其他信息：${safeExtra}`
    );
    triggerUserMatchingDaily(req.userId!);
  } catch (error: any) {
    logError('update_private_info_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to update private info' });
  }
});

// Send "want to know you" notification
router.post('/want-to-know', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
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
router.get('/notifications', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
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
router.get('/notifications/unread-count', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
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
router.put('/notifications/read', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
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

// Add user to added list
router.post('/add-user', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.userId!;
    if (!targetUserId || targetUserId === userId) {
      return res.status(400).json({ error: 'Invalid target user' });
    }
    await dbRun(
      `INSERT INTO user_added_list (user_id, target_user_id, status)
       VALUES (?, ?, 'added')
       ON CONFLICT(user_id, target_user_id) DO UPDATE SET status = 'added'`,
      [userId, targetUserId]
    );
    logInfo('user_added', { userId, targetUserId });
    res.json({ message: 'User added' });
  } catch (error: any) {
    logError('add_user_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to add user' });
  }
});

// Remove user from added list (restore to match list)
router.delete('/add-user/:targetUserId', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.targetUserId as string, 10);
    await dbRun(
      'DELETE FROM user_added_list WHERE user_id = ? AND target_user_id = ?',
      [req.userId, targetUserId]
    );
    logInfo('user_removed_from_added', { userId: req.userId, targetUserId });
    res.json({ message: 'User removed from added list' });
  } catch (error: any) {
    logError('remove_added_user_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to remove user' });
  }
});

// Block user (add to blacklist)
router.post('/block-user', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.userId!;
    if (!targetUserId || targetUserId === userId) {
      return res.status(400).json({ error: 'Invalid target user' });
    }
    await dbRun(
      `INSERT INTO user_added_list (user_id, target_user_id, status)
       VALUES (?, ?, 'blocked')
       ON CONFLICT(user_id, target_user_id) DO UPDATE SET status = 'blocked'`,
      [userId, targetUserId]
    );
    logInfo('user_blocked', { userId, targetUserId });
    res.json({ message: 'User blocked' });
  } catch (error: any) {
    logError('block_user_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to block user' });
  }
});

// Unblock user
router.delete('/block-user/:targetUserId', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.targetUserId as string, 10);
    await dbRun(
      'DELETE FROM user_added_list WHERE user_id = ? AND target_user_id = ? AND status = ?',
      [req.userId, targetUserId, 'blocked']
    );
    logInfo('user_unblocked', { userId: req.userId, targetUserId });
    res.json({ message: 'User unblocked' });
  } catch (error: any) {
    logError('unblock_user_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to unblock user' });
  }
});

// Get added users list
router.get('/added-users', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const users = await dbAll(
      `SELECT ual.target_user_id, ual.status, ual.created_at,
              u.nickname, u.avatar
       FROM user_added_list ual
       JOIN users u ON ual.target_user_id = u.id
       WHERE ual.user_id = ?
       ORDER BY ual.created_at DESC`,
      [req.userId]
    );
    res.json({ users });
  } catch (error: any) {
    logError('get_added_users_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch added users' });
  }
});

// Vote on contact info (true/false)
router.post('/contact-vote', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { targetUserId, vote } = req.body;
    const voterId = req.userId!;
    if (!targetUserId || !['true', 'false'].includes(vote)) {
      return res.status(400).json({ error: 'Invalid vote' });
    }
    if (targetUserId === voterId) {
      return res.status(400).json({ error: 'Cannot vote on your own contact' });
    }
    await dbRun(
      `INSERT INTO contact_votes (voter_id, target_user_id, vote)
       VALUES (?, ?, ?)
       ON CONFLICT(voter_id, target_user_id) DO UPDATE SET vote = ?`,
      [voterId, targetUserId, vote, vote]
    );
    logInfo('contact_vote', { voterId, targetUserId, vote });
    res.json({ message: 'Vote recorded' });
  } catch (error: any) {
    logError('contact_vote_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to record vote' });
  }
});

// Get contact vote counts for a user
router.get('/contact-votes/:targetUserId', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.targetUserId as string, 10);
    const trueCount = await dbGet(
      `SELECT COUNT(*) as count FROM contact_votes WHERE target_user_id = ? AND vote = 'true'`,
      [targetUserId]
    );
    const falseCount = await dbGet(
      `SELECT COUNT(*) as count FROM contact_votes WHERE target_user_id = ? AND vote = 'false'`,
      [targetUserId]
    );
    // Get current user's vote if any
    const myVote = await dbGet(
      'SELECT vote FROM contact_votes WHERE voter_id = ? AND target_user_id = ?',
      [req.userId, targetUserId]
    );
    res.json({
      trueCount: trueCount?.count || 0,
      falseCount: falseCount?.count || 0,
      myVote: myVote?.vote || null,
    });
  } catch (error: any) {
    logError('get_contact_votes_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'Failed to fetch votes' });
  }
});

export default router;
