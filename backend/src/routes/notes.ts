import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
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

// ─── Image upload setup ──────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '../../uploads/notes');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const name = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'));
    }
  },
});

// ─── Public endpoints (no auth required) ─────────────────────────────────────

// GET /api/notes/public/:shareId  –  get a published note by share ID
router.get('/public/:shareId', async (req: Request, res: Response) => {
  try {
    const note = await dbGet(
      'SELECT * FROM notes WHERE share_id = ? AND is_published = 1',
      [req.params.shareId]
    );
    if (!note) return res.status(404).json({ error: 'Page not found' });
    note.content = parseContent(note.content);
    res.json({ note });
  } catch (error) {
    logError('notes_public_get_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notes/public/:shareId/tree  –  get published note + subtree for sidebar
router.get('/public/:shareId/tree', async (req: Request, res: Response) => {
  try {
    const root = await dbGet(
      'SELECT id, user_id, parent_id, title, icon, share_id, is_published, created_at, updated_at FROM notes WHERE share_id = ? AND is_published = 1',
      [req.params.shareId]
    );
    if (!root) return res.status(404).json({ error: 'Page not found' });

    // Recursively collect all descendants
    const collectDescendants = async (parentId: number): Promise<any[]> => {
      const children = await dbAll(
        'SELECT id, user_id, parent_id, title, icon, share_id, is_published, created_at, updated_at FROM notes WHERE parent_id = ? AND user_id = ?',
        [parentId, root.user_id]
      );
      const result: any[] = [];
      for (const child of children) {
        result.push(child);
        const grandChildren = await collectDescendants(child.id);
        result.push(...grandChildren);
      }
      return result;
    };

    const descendants = await collectDescendants(root.id);
    res.json({ root, descendants });
  } catch (error) {
    logError('notes_public_tree_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notes/public/:shareId/note/:noteId  –  get a specific note within a published tree
router.get('/public/:shareId/note/:noteId', async (req: Request, res: Response) => {
  try {
    // First verify the shareId root is published
    const root = await dbGet(
      'SELECT id, user_id FROM notes WHERE share_id = ? AND is_published = 1',
      [req.params.shareId]
    );
    if (!root) return res.status(404).json({ error: 'Page not found' });

    // Check if the requested note is the root or a descendant
    const targetId = Number(req.params.noteId);
    if (targetId === root.id) {
      const note = await dbGet('SELECT * FROM notes WHERE id = ?', [root.id]);
      note.content = parseContent(note.content);
      return res.json({ note });
    }

    // Verify the note belongs to the same user and is a descendant
    const isDescendant = async (noteId: number): Promise<boolean> => {
      const note = await dbGet('SELECT id, parent_id FROM notes WHERE id = ? AND user_id = ?', [noteId, root.user_id]);
      if (!note) return false;
      if (note.parent_id === root.id) return true;
      if (!note.parent_id) return false;
      return isDescendant(note.parent_id);
    };

    if (!(await isDescendant(targetId))) {
      return res.status(404).json({ error: 'Note not found in this tree' });
    }

    const note = await dbGet('SELECT * FROM notes WHERE id = ?', [targetId]);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    note.content = parseContent(note.content);
    res.json({ note });
  } catch (error) {
    logError('notes_public_note_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Authenticated endpoints ─────────────────────────────────────────────────

// GET /api/notes  –  list all notes for current user
router.get('/', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const notes = await dbAll(
      'SELECT id, user_id, parent_id, title, icon, share_id, is_published, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC',
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
    const { title, content, icon, parent_id } = req.body;

    const safeTitle = sanitizeString(title || '无标题', 500);
    const safeIcon = icon ? sanitizeString(icon, 10) : null;
    const safeContent = Array.isArray(content) ? JSON.stringify(content) : '[]';
    const safeParentId = parent_id ? Number(parent_id) : null;

    // Validate parent note exists and belongs to user
    if (safeParentId) {
      const parentNote = await dbGet(
        'SELECT id FROM notes WHERE id = ? AND user_id = ?',
        [safeParentId, req.userId]
      );
      if (!parentNote) return res.status(400).json({ error: 'Parent note not found' });
    }

    const result = await dbRun(
      'INSERT INTO notes (user_id, title, content, icon, parent_id) VALUES (?, ?, ?, ?, ?)',
      [req.userId, safeTitle, safeContent, safeIcon, safeParentId]
    );

    const note = await dbGet('SELECT * FROM notes WHERE id = ?', [(result as any).lastID]);
    note.content = parseContent(note.content);

    logInfo('note_created', { userId: req.userId, id: note.id, parent_id: safeParentId });
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

// POST /api/notes/:id/publish  –  toggle publish status
router.post('/:id/publish', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const note = await dbGet(
      'SELECT * FROM notes WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const newPublished = note.is_published ? 0 : 1;
    let shareId = note.share_id;

    // Generate share_id on first publish
    if (newPublished === 1 && !shareId) {
      shareId = crypto.randomBytes(12).toString('hex');
    }

    await dbRun(
      'UPDATE notes SET is_published = ?, share_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPublished, shareId, req.params.id]
    );

    logInfo('note_publish_toggled', { userId: req.userId, id: note.id, is_published: newPublished });
    res.json({ is_published: newPublished, share_id: shareId });
  } catch (error) {
    logError('notes_publish_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notes/upload-image  –  upload an image for notes
router.post('/upload-image', authMiddleware, upload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const url = `/api/notes/uploads/${req.file.filename}`;
    logInfo('note_image_uploaded', { userId: req.userId, filename: req.file.filename });
    res.json({ url });
  } catch (error) {
    logError('notes_upload_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notes/uploads/:filename  –  serve uploaded images
router.get('/uploads/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename); // strip directory components
  const filePath = path.resolve(UPLOADS_DIR, filename);
  // Ensure resolved path is within UPLOADS_DIR
  if (!filePath.startsWith(path.resolve(UPLOADS_DIR) + path.sep) && filePath !== path.resolve(UPLOADS_DIR, filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// DELETE /api/notes/:id  –  delete a note and its children
router.delete('/:id', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const note = await dbGet(
      'SELECT * FROM notes WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!note) return res.status(404).json({ error: 'Note not found' });

    // Recursively delete all descendants, then the note itself
    const deleteDescendants = async (parentId: string) => {
      const children = await dbAll('SELECT id FROM notes WHERE parent_id = ? AND user_id = ?', [parentId, req.userId]);
      for (const child of children) {
        await deleteDescendants(child.id);
      }
      await dbRun('DELETE FROM notes WHERE id = ?', [parentId]);
    };
    await deleteDescendants(req.params.id);

    logInfo('note_deleted', { userId: req.userId, id: req.params.id });
    res.json({ message: 'Note deleted' });
  } catch (error) {
    logError('notes_delete_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
