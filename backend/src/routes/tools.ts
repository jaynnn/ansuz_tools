import { Router, Response } from 'express';
import { dbRun, dbGet, dbAll } from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { triggerImpressionUpdate } from '../utils/impressionService';

const router = Router();

// Get all tools for the current user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const tools = await dbAll('SELECT * FROM tools WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
    
    // Parse tags from JSON string
    const parsedTools = tools.map((tool: any) => ({
      ...tool,
      tags: tool.tags ? JSON.parse(tool.tags) : []
    }));

    res.json({ tools: parsedTools });
  } catch (error) {
    console.error('Get tools error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific tool
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const tool: any = await dbGet('SELECT * FROM tools WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    // Parse tags from JSON string
    tool.tags = tool.tags ? JSON.parse(tool.tags) : [];

    res.json({ tool });
  } catch (error) {
    console.error('Get tool error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new tool
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, tags, url } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Tool name is required' });
    }

    // Convert tags array to JSON string
    const tagsJson = JSON.stringify(tags || []);

    const result = await dbRun(
      'INSERT INTO tools (user_id, name, description, tags, url) VALUES (?, ?, ?, ?, ?)',
      [req.userId, name, description, tagsJson, url]
    );

    res.status(201).json({
      message: 'Tool created successfully',
      tool: {
        id: (result as any).lastID,
        user_id: req.userId,
        name,
        description,
        tags: tags || [],
        url
      }
    });

    // Async: trigger user impression update
    triggerImpressionUpdate(
      req.userId!,
      '添加工具',
      `用户添加了工具「${name}」，描述：${description || '无'}，标签：${(tags || []).join('、') || '无'}。该工具的使用者通常关注${(tags || []).join('、')}领域。`
    );
  } catch (error) {
    console.error('Create tool error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a tool
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, tags, url } = req.body;

    // Check if tool exists and belongs to user
    const tool = await dbGet('SELECT * FROM tools WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    // Convert tags array to JSON string
    const tagsJson = JSON.stringify(tags || []);

    await dbRun(
      'UPDATE tools SET name = ?, description = ?, tags = ?, url = ? WHERE id = ? AND user_id = ?',
      [name, description, tagsJson, url, req.params.id, req.userId]
    );

    res.json({
      message: 'Tool updated successfully',
      tool: {
        id: req.params.id,
        name,
        description,
        tags: tags || [],
        url
      }
    });
  } catch (error) {
    console.error('Update tool error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a tool
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Check if tool exists and belongs to user
    const tool = await dbGet('SELECT * FROM tools WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    await dbRun('DELETE FROM tools WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);

    res.json({ message: 'Tool deleted successfully' });
  } catch (error) {
    console.error('Delete tool error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
