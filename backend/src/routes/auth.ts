import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbRun, dbGet } from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password, nickname } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if user already exists
    const existingUser = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await dbRun(
      'INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)',
      [username, hashedPassword, nickname || username]
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
        username,
        nickname: nickname || username
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

    await dbRun('UPDATE users SET nickname = ? WHERE id = ?', [nickname, req.userId]);

    res.json({ message: 'Nickname updated successfully', nickname });
  } catch (error) {
    console.error('Update nickname error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update avatar
router.put('/avatar', authMiddleware, async (req: AuthRequest, res: Response) => {
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

export default router;
