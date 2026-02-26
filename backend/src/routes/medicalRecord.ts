import { Router, Response, NextFunction } from 'express';
import { dbRun, dbGet, dbAll } from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { chatCompletion } from '../utils/llmService';
import { recordTokenUsage } from '../utils/asyncLlmService';
import { sanitizeString } from '../utils/sanitize';
import { logInfo, logError, logWarn } from '../utils/logger';

const router = Router();

// Rate limiter: 30 requests per minute per user
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

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
    logWarn('medical_record_rate_limit_exceeded', { key });
    return res.status(429).json({ error: '操作太频繁，请稍后再试。' });
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  next();
};

// GET /api/medical-record  –  list current user's records
router.get('/', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { search, tag } = req.query as { search?: string; tag?: string };

    let sql = 'SELECT * FROM medical_records WHERE user_id = ?';
    const params: any[] = [req.userId];

    if (search) {
      sql += ' AND (condition LIKE ? OR treatment LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like);
    }

    sql += ' ORDER BY created_at DESC';

    let records = await dbAll(sql, params);

    // Parse tags from JSON string
    records = records.map((r: any) => ({
      ...r,
      tags: (() => { try { return JSON.parse(r.tags); } catch { return []; } })(),
    }));

    // Filter by tag after parsing
    if (tag) {
      records = records.filter((r: any) => Array.isArray(r.tags) && r.tags.includes(tag));
    }

    res.json({ records });
  } catch (error) {
    logError('medical_record_list_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/medical-record/public  –  list all public records (must be before /:id routes)
router.get('/public', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { search, tag } = req.query as { search?: string; tag?: string };

    let sql = `
      SELECT mr.*, u.nickname as author_nickname
      FROM medical_records mr
      JOIN users u ON u.id = mr.user_id
      WHERE mr.is_public = 1
    `;
    const params: any[] = [];

    if (search) {
      sql += ' AND (mr.condition LIKE ? OR mr.treatment LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like);
    }

    sql += ' ORDER BY mr.created_at DESC';

    let records = await dbAll(sql, params);

    records = records.map((r: any) => ({
      ...r,
      tags: (() => { try { return JSON.parse(r.tags); } catch { return []; } })(),
    }));

    if (tag) {
      records = records.filter((r: any) => Array.isArray(r.tags) && r.tags.includes(tag));
    }

    res.json({ records });
  } catch (error) {
    logError('medical_record_public_list_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/medical-record  –  create a new record, LLM auto-tags it
router.post('/', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { condition, treatment } = req.body;
    if (!condition) return res.status(400).json({ error: 'condition is required' });
    if (!treatment) return res.status(400).json({ error: 'treatment is required' });

    const safeCondition = sanitizeString(condition, 2000);
    const safeTreatment = sanitizeString(treatment, 2000);

    // Ask LLM to generate classification tags
    let tags: string[] = [];
    try {
      const prompt = `根据以下病情描述和治疗方式，为该病例生成3~5个分类标签（如"感冒"、"消化系统"、"外伤"、"慢性病"等），以JSON数组格式输出，如：["感冒","呼吸系统","发热"]。只输出JSON数组，不要有其他文字。\n\n病情：${safeCondition}\n\n治疗方式：${safeTreatment}`;
      const result = await chatCompletion([{ role: 'user', content: prompt }]);
      if (req.userId) {
        recordTokenUsage(req.userId, 'medical_record_tag', result.usage, result.model);
      }
      const text = result.content.trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          tags = parsed.map((t: any) => String(t)).slice(0, 5);
        }
      }
    } catch (e) {
      logError('medical_record_tag_error', e as Error);
    }

    const result = await dbRun(
      'INSERT INTO medical_records (user_id, condition, treatment, tags) VALUES (?, ?, ?, ?)',
      [req.userId, safeCondition, safeTreatment, JSON.stringify(tags)]
    );
    const record = await dbGet('SELECT * FROM medical_records WHERE id = ?', [(result as any).lastID]);
    record.tags = (() => { try { return JSON.parse(record.tags); } catch { return []; } })();

    logInfo('medical_record_created', { userId: req.userId, id: record.id });
    res.status(201).json({ record });
  } catch (error) {
    logError('medical_record_create_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/medical-record/:id  –  delete a record
router.delete('/:id', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const record = await dbGet(
      'SELECT * FROM medical_records WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!record) return res.status(404).json({ error: 'Record not found' });

    await dbRun('DELETE FROM medical_records WHERE id = ?', [req.params.id]);
    res.json({ message: 'Record deleted' });
  } catch (error) {
    logError('medical_record_delete_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/medical-record/:id/publish  –  toggle publish to public
router.post('/:id/publish', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const record = await dbGet(
      'SELECT * FROM medical_records WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const newPublic = record.is_public ? 0 : 1;
    await dbRun('UPDATE medical_records SET is_public = ? WHERE id = ?', [newPublic, req.params.id]);
    res.json({ is_public: newPublic });
  } catch (error) {
    logError('medical_record_publish_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

