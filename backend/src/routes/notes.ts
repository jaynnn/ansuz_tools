import { Router, Response, NextFunction } from 'express';
import { dbRun, dbGet, dbAll } from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sanitizeString } from '../utils/sanitize';
import { logInfo, logError, logWarn } from '../utils/logger';

const router = Router();

const parseContent = (raw: string): unknown[] => {
  try { return JSON.parse(raw); } catch { return []; }
};

// Rate limiter: 60 requests per minute per user
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap) {
    const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) rateLimitMap.delete(key);
    else rateLimitMap.set(key, valid);
  }
}, 5 * 60 * 1000).unref();

const rateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const key = String(req.userId || req.ip);
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    logWarn('notes_rate_limit_exceeded', { key });
    return res.status(429).json({ error: '操作太频繁，请稍后再试。' });
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  next();
};

// GET /api/notes  –  list all notes for current user
router.get('/', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const notes = await dbAll(
      'SELECT id, user_id, title, icon, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC',
      [req.userId]
    );
    res.json({ notes });
  } catch (error) {
    logError('notes_list_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notes/:id  –  get a single note with content
router.get('/:id', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const note = await dbGet(
      'SELECT * FROM notes WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!note) return res.status(404).json({ error: 'Note not found' });

    note.content = parseContent(note.content);
    res.json({ note });
  } catch (error) {
    logError('notes_get_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notes  –  create a new note
router.post('/', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, icon } = req.body;

    const safeTitle = sanitizeString(title || '无标题', 500);
    const safeIcon = icon ? sanitizeString(icon, 10) : null;
    const safeContent = Array.isArray(content) ? JSON.stringify(content) : '[]';

    const result = await dbRun(
      'INSERT INTO notes (user_id, title, content, icon) VALUES (?, ?, ?, ?)',
      [req.userId, safeTitle, safeContent, safeIcon]
    );

    const note = await dbGet('SELECT * FROM notes WHERE id = ?', [(result as any).lastID]);
    note.content = parseContent(note.content);

    logInfo('note_created', { userId: req.userId, id: note.id });
    res.status(201).json({ note });
  } catch (error) {
    logError('notes_create_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notes/:id  –  update a note
router.put('/:id', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await dbGet(
      'SELECT * FROM notes WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    const { title, content, icon } = req.body;
    const safeTitle = sanitizeString(title !== undefined ? title : existing.title, 500);
    const safeIcon = icon !== undefined ? (icon ? sanitizeString(icon, 10) : null) : existing.icon;
    const safeContent = Array.isArray(content) ? JSON.stringify(content) : existing.content;

    await dbRun(
      'UPDATE notes SET title = ?, content = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [safeTitle, safeContent, safeIcon, req.params.id]
    );

    const note = await dbGet('SELECT * FROM notes WHERE id = ?', [req.params.id]);
    note.content = parseContent(note.content);

    logInfo('note_updated', { userId: req.userId, id: note.id });
    res.json({ note });
  } catch (error) {
    logError('notes_update_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/notes/:id  –  delete a note
router.delete('/:id', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const note = await dbGet(
      'SELECT * FROM notes WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!note) return res.status(404).json({ error: 'Note not found' });

    await dbRun('DELETE FROM notes WHERE id = ?', [req.params.id]);
    logInfo('note_deleted', { userId: req.userId, id: req.params.id });
    res.json({ message: 'Note deleted' });
  } catch (error) {
    logError('notes_delete_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
