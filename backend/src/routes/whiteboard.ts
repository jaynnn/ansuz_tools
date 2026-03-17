import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { WhiteboardModel } from '../models/whiteboardModel';
import { sanitizeString } from '../utils/sanitize';

const router = Router();

// Max elements per document to stay well within MongoDB's 16 MB limit
const MAX_ELEMENTS = 5000;

// ─── List all whiteboard documents for the current user ─────────────────────
router.get('/documents', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const docs = await WhiteboardModel.find(
      { userId: req.userId },
      { docId: 1, name: 1, version: 1, createdAt: 1, updatedAt: 1 },
    ).sort({ updatedAt: -1 }).lean();
    res.json({ documents: docs });
  } catch (error) {
    console.error('Whiteboard list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Create a new whiteboard document ───────────────────────────────────────
router.post('/documents', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const name = sanitizeString(req.body.name || '未命名白板', 200);
    const docId = uuidv4();

    const doc = await WhiteboardModel.create({
      docId,
      userId: req.userId,
      name,
      elements: [],
      appState: { zoom: 1, offsetX: 0, offsetY: 0 },
      version: 1,
    });

    res.status(201).json({ document: { docId: doc.docId, name: doc.name, version: doc.version } });
  } catch (error) {
    console.error('Whiteboard create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Get a single whiteboard document ───────────────────────────────────────
router.get('/documents/:docId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const doc = await WhiteboardModel.findOne({
      docId: req.params.docId,
      userId: req.userId,
    }).lean();

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ document: doc });
  } catch (error) {
    console.error('Whiteboard get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Update a whiteboard document (optimistic concurrency via version) ──────
router.put('/documents/:docId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { elements, appState, name, version } = req.body;

    if (version == null || typeof version !== 'number') {
      return res.status(400).json({ error: 'version is required for updates' });
    }

    // Validate element count
    if (Array.isArray(elements) && elements.length > MAX_ELEMENTS) {
      return res.status(400).json({ error: `Too many elements (max ${MAX_ELEMENTS})` });
    }

    // Validate appState if provided
    if (appState !== undefined) {
      if (typeof appState !== 'object' || appState === null ||
          typeof appState.zoom !== 'number' || typeof appState.offsetX !== 'number' || typeof appState.offsetY !== 'number') {
        return res.status(400).json({ error: 'Invalid appState: must contain numeric zoom, offsetX, offsetY' });
      }
      if (appState.zoom < 0.1 || appState.zoom > 10) {
        return res.status(400).json({ error: 'appState.zoom must be between 0.1 and 10' });
      }
    }

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (elements !== undefined) updateFields.elements = elements;
    if (appState !== undefined) updateFields.appState = appState;
    if (name !== undefined) updateFields.name = sanitizeString(name, 200);

    // OCC: only update if version matches, then increment
    const result = await WhiteboardModel.findOneAndUpdate(
      { docId: req.params.docId, userId: req.userId, version },
      { $set: updateFields, $inc: { version: 1 } },
      { new: true, projection: { docId: 1, name: 1, version: 1, updatedAt: 1 } },
    );

    if (!result) {
      // Could be a missing doc or a version mismatch
      const exists = await WhiteboardModel.exists({ docId: req.params.docId, userId: req.userId });
      if (!exists) {
        return res.status(404).json({ error: 'Document not found' });
      }
      // Version mismatch – single-user scenario: client should reload
      return res.status(409).json({ error: 'Version conflict. Please reload the document.' });
    }

    res.json({ document: result });
  } catch (error) {
    console.error('Whiteboard update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete a whiteboard document ───────────────────────────────────────────
router.delete('/documents/:docId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await WhiteboardModel.deleteOne({
      docId: req.params.docId,
      userId: req.userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Whiteboard delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
