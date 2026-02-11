import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbRun, dbGet, dbTransaction } from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logWarn, logInfo } from '../utils/logger';
import { sanitizeString } from '../utils/sanitize';

const router = Router();

// Rate limiter for auth endpoints
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

const rateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const key = String(req.userId || req.ip);
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    logWarn('auth_rate_limit_exceeded', { key });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  next();
};

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password, nickname } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const safeUsername = sanitizeString(username, 50);
    const safeNickname = sanitizeString(nickname || username, 50);

    if (!safeUsername) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    // Check if user already exists
    const existingUser = await dbGet('SELECT * FROM users WHERE username = ?', [safeUsername]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await dbRun(
      'INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)',
      [safeUsername, hashedPassword, safeNickname]
    );

    const token = jwt.sign(
      { userId: (result as any).lastID },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: (result as any).lastID,
        username: safeUsername,
        nickname: safeNickname
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user
    const user: any = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user: any = await dbGet('SELECT id, username, nickname, avatar, created_at FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.avatar = user.avatar || 'seal';
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update nickname
router.put('/nickname', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { nickname } = req.body;

    if (!nickname) {
      return res.status(400).json({ error: 'Nickname is required' });
    }

    const safeNickname = sanitizeString(nickname, 50);
    if (!safeNickname) {
      return res.status(400).json({ error: 'Invalid nickname' });
    }

    await dbRun('UPDATE users SET nickname = ? WHERE id = ?', [safeNickname, req.userId]);

    res.json({ message: 'Nickname updated successfully', nickname: safeNickname });
  } catch (error) {
    console.error('Update nickname error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update avatar
router.put('/avatar', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { avatar } = req.body;

    const validAvatars = [
      'seal', 'octopus', 'jellyfish', 'seahorse', 'pufferfish',
      'turtle', 'whale', 'dolphin', 'clownfish', 'starfish'
    ];

    if (!avatar || !validAvatars.includes(avatar)) {
      return res.status(400).json({ error: 'Invalid avatar selection' });
    }

    await dbRun('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.userId]);

    res.json({ message: 'Avatar updated successfully', avatar });
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete account (销号)
router.delete('/account', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete account' });
    }

    // Verify password
    const user: any = await dbGet('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: '密码错误' });
    }

    // Delete all related data in a transaction
    await dbTransaction(async () => {
      await dbRun('DELETE FROM contact_votes WHERE voter_id = ? OR target_user_id = ?', [req.userId, req.userId]);
      await dbRun('DELETE FROM user_added_list WHERE user_id = ? OR target_user_id = ?', [req.userId, req.userId]);
      await dbRun('DELETE FROM notifications WHERE from_user_id = ? OR to_user_id = ?', [req.userId, req.userId]);
      await dbRun('DELETE FROM user_private_info WHERE user_id = ?', [req.userId]);
      await dbRun('DELETE FROM match_cooldown WHERE user_id = ?', [req.userId]);
      await dbRun('DELETE FROM user_matches WHERE user_id_a = ? OR user_id_b = ?', [req.userId, req.userId]);
      await dbRun('DELETE FROM user_impressions WHERE user_id = ?', [req.userId]);
      await dbRun('DELETE FROM mbti_results WHERE user_id = ?', [req.userId]);
      await dbRun('DELETE FROM stock_predictions WHERE user_id = ?', [req.userId]);
      await dbRun('DELETE FROM tools WHERE user_id = ?', [req.userId]);
      await dbRun('DELETE FROM users WHERE id = ?', [req.userId]);
    });

    logInfo('account_deleted', { userId: req.userId, username: user.username });
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
