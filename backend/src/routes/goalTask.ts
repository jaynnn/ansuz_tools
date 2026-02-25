import { Router, Response } from 'express';
import { dbRun, dbGet, dbAll } from '../utils/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { chatCompletion } from '../utils/llmService';
import { recordTokenUsage } from '../utils/asyncLlmService';
import { sanitizeString } from '../utils/sanitize';
import { logInfo, logError } from '../utils/logger';

const router = Router();

// ─── Goals ───────────────────────────────────────────────────────────────────

// GET /api/goal-task/goals  –  list all goals for the current user
router.get('/goals', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const goals = await dbAll(
      `SELECT * FROM goal_task_goals WHERE user_id = ? ORDER BY
        CASE status
          WHEN 'in_progress' THEN 0
          WHEN 'not_started' THEN 1
          ELSE 2
        END, created_at DESC`,
      [req.userId]
    );
    res.json({ goals });
  } catch (error) {
    logError('goal_task_list_goals_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/goal-task/goals  –  create a new goal
router.post('/goals', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { target_text, current_level } = req.body;
    if (!target_text) return res.status(400).json({ error: 'target_text is required' });

    const safeTarget = sanitizeString(target_text, 500);
    const safeLevel = sanitizeString(current_level || '', 500);

    const result = await dbRun(
      'INSERT INTO goal_task_goals (user_id, target_text, current_level, status) VALUES (?, ?, ?, ?)',
      [req.userId, safeTarget, safeLevel || null, 'not_started']
    );

    const goal = await dbGet('SELECT * FROM goal_task_goals WHERE id = ?', [(result as any).lastID]);
    res.status(201).json({ goal });
  } catch (error) {
    logError('goal_task_create_goal_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/goal-task/goals/:id  –  delete a goal
router.delete('/goals/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const goal = await dbGet(
      'SELECT * FROM goal_task_goals WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    await dbRun('DELETE FROM goal_task_goals WHERE id = ?', [req.params.id]);
    res.json({ message: 'Goal deleted' });
  } catch (error) {
    logError('goal_task_delete_goal_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── LLM: Level options ───────────────────────────────────────────────────────

// POST /api/goal-task/level-options  –  ask LLM for level options for a target
router.post('/level-options', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { target } = req.body;
    if (!target) return res.status(400).json({ error: 'target is required' });

    const safeTarget = sanitizeString(target, 500);

    // Extract keyword from target (use the whole target as context)
    const prompt = `请生成不同阶段的【${safeTarget}】追求者的水平选项及其选项的提示，以json形式呈现，数组长度为4~6个选项。格式如：[{"option1": "初级跑者", "detail1": "能跑5公里，均速6min/km"}, {"option2":"中级跑者", "detail2":"能跑半马，均速5.5min/km"}]。只输出json，不要有其他文字。`;

    const result = await chatCompletion([
      { role: 'user', content: prompt }
    ]);

    if (req.userId) {
      recordTokenUsage(req.userId, 'goal_task_level_options', result.usage, result.model);
    }

    // Parse the JSON from the LLM response
    let options: any[] = [];
    try {
      const text = result.content.trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        options = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      logError('goal_task_level_options_parse_error', e as Error, { content: result.content });
      options = [];
    }

    res.json({ options });
  } catch (error) {
    logError('goal_task_level_options_error', error as Error);
    res.status(500).json({ error: 'Failed to get level options' });
  }
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

// GET /api/goal-task/goals/:goalId/sessions  –  list sessions for a goal
router.get('/goals/:goalId/sessions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const goal = await dbGet(
      'SELECT * FROM goal_task_goals WHERE id = ? AND user_id = ?',
      [req.params.goalId, req.userId]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const sessions = await dbAll(
      'SELECT * FROM goal_task_sessions WHERE goal_id = ? ORDER BY created_at DESC',
      [req.params.goalId]
    );

    // Attach trainings to each session
    const sessionsWithTrainings = await Promise.all(sessions.map(async (s: any) => {
      const trainings = await dbAll(
        'SELECT * FROM goal_task_trainings WHERE session_id = ? ORDER BY id ASC',
        [s.id]
      );
      return { ...s, trainingItems: trainings };
    }));

    res.json({ sessions: sessionsWithTrainings });
  } catch (error) {
    logError('goal_task_list_sessions_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/goal-task/goals/:goalId/sessions  –  create a session and generate trainings
router.post('/goals/:goalId/sessions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { available_minutes } = req.body;
    if (!available_minutes) return res.status(400).json({ error: 'available_minutes is required' });

    const goal = await dbGet(
      'SELECT * FROM goal_task_goals WHERE id = ? AND user_id = ?',
      [req.params.goalId, req.userId]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    // Check: only one in-progress session at a time across all goals for this user
    const inProgress = await dbGet(
      `SELECT g.id FROM goal_task_goals g
       JOIN goal_task_sessions s ON s.goal_id = g.id
       WHERE g.user_id = ? AND g.status = 'in_progress'
       LIMIT 1`,
      [req.userId]
    );
    if (inProgress && inProgress.id !== goal.id) {
      return res.status(409).json({ error: '请先完成当前在进行的任务' });
    }

    // Fetch previous sessions for history context
    const prevSessions = await dbAll(
      `SELECT s.created_at, s.available_minutes, s.is_complete, s.session_target, s.trainings
       FROM goal_task_sessions s
       WHERE s.goal_id = ? AND s.is_complete = 1
       ORDER BY s.created_at DESC LIMIT 5`,
      [goal.id]
    );

    const historyText = prevSessions.map((s: any) => {
      const dateStr = new Date(s.created_at).toLocaleDateString('zh-CN');
      const status = s.is_complete ? '已完成' : '未完成';
      return `${dateStr} 训练${s.available_minutes}分钟 ${status}${s.session_target ? ' 目标："' + s.session_target + '"' : ''}`;
    }).join('；');

    const now = new Date();
    const startDate = now.toLocaleDateString('zh-CN');

    const prompt = `我想要【${goal.target_text}】，我当前的水平是【${goal.current_level || '未设置'}】，我当前拥有的时间是【${available_minutes}分钟】，我的训练起始时间为【${startDate}】。${historyText ? '我的历史训练记录为：【' + historyText + '】。' : ''}请在此基础上帮我设计合理的具体的训练条目，以及我本阶段训练的目标，以json格式给出，如：{"trainings": ["做高抬腿热身1分钟","做左右压腿20个"], "target": "在均速5.5min/km以内跑完5km"}。只输出json，不要有其他文字。`;

    const result = await chatCompletion([
      { role: 'user', content: prompt }
    ]);

    if (req.userId) {
      recordTokenUsage(req.userId, 'goal_task_generate_training', result.usage, result.model);
    }

    let trainings: string[] = [];
    let sessionTarget = '';
    try {
      const text = result.content.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        trainings = Array.isArray(parsed.trainings) ? parsed.trainings : [];
        sessionTarget = parsed.target || '';
      }
    } catch (e) {
      logError('goal_task_generate_training_parse_error', e as Error, { content: result.content });
    }

    // Create session
    const sessionResult = await dbRun(
      'INSERT INTO goal_task_sessions (goal_id, user_id, available_minutes, session_target, trainings) VALUES (?, ?, ?, ?, ?)',
      [goal.id, req.userId, available_minutes, sessionTarget, JSON.stringify(trainings)]
    );
    const sessionId = (sessionResult as any).lastID;

    // Create training items
    for (const desc of trainings) {
      await dbRun(
        'INSERT INTO goal_task_trainings (session_id, description, is_completed) VALUES (?, ?, 0)',
        [sessionId, desc]
      );
    }

    // Mark goal as in_progress
    await dbRun(
      "UPDATE goal_task_goals SET status = 'in_progress' WHERE id = ?",
      [goal.id]
    );

    const session = await dbGet('SELECT * FROM goal_task_sessions WHERE id = ?', [sessionId]);
    const trainingItems = await dbAll(
      'SELECT * FROM goal_task_trainings WHERE session_id = ? ORDER BY id ASC',
      [sessionId]
    );

    res.status(201).json({ session, trainingItems, analysisText: result.content });
  } catch (error) {
    logError('goal_task_create_session_error', error as Error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});

// ─── Active session for a goal ────────────────────────────────────────────────

// GET /api/goal-task/goals/:goalId/active-session  –  get the latest in-progress session
router.get('/goals/:goalId/active-session', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const goal = await dbGet(
      'SELECT * FROM goal_task_goals WHERE id = ? AND user_id = ?',
      [req.params.goalId, req.userId]
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const session = await dbGet(
      'SELECT * FROM goal_task_sessions WHERE goal_id = ? AND is_complete = 0 ORDER BY created_at DESC LIMIT 1',
      [goal.id]
    );
    if (!session) return res.json({ session: null, trainingItems: [] });

    const trainingItems = await dbAll(
      'SELECT * FROM goal_task_trainings WHERE session_id = ? ORDER BY id ASC',
      [session.id]
    );
    res.json({ session, trainingItems });
  } catch (error) {
    logError('goal_task_active_session_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Training items ───────────────────────────────────────────────────────────

// PUT /api/goal-task/trainings/:id/complete  –  toggle completion of a training item
router.put('/trainings/:id/complete', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const training = await dbGet(
      `SELECT t.* FROM goal_task_trainings t
       JOIN goal_task_sessions s ON s.id = t.session_id
       WHERE t.id = ? AND s.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!training) return res.status(404).json({ error: 'Training not found' });

    const newCompleted = training.is_completed ? 0 : 1;
    await dbRun(
      'UPDATE goal_task_trainings SET is_completed = ? WHERE id = ?',
      [newCompleted, req.params.id]
    );

    // Check if all trainings in the session are now complete
    const sessionTrainings = await dbAll(
      'SELECT * FROM goal_task_trainings WHERE session_id = ?',
      [training.session_id]
    );
    const allDone = sessionTrainings.every((t: any) => (t.id === training.id ? newCompleted : t.is_completed));

    if (allDone && newCompleted) {
      // Mark session as complete
      await dbRun(
        'UPDATE goal_task_sessions SET is_complete = 1, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [training.session_id]
      );
      // Mark goal as done
      const session = await dbGet('SELECT * FROM goal_task_sessions WHERE id = ?', [training.session_id]);
      await dbRun(
        "UPDATE goal_task_goals SET status = 'done' WHERE id = ?",
        [session.goal_id]
      );
      return res.json({ is_completed: newCompleted, sessionCompleted: true });
    }

    res.json({ is_completed: newCompleted, sessionCompleted: false });
  } catch (error) {
    logError('goal_task_complete_training_error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Training chat ────────────────────────────────────────────────────────────

// POST /api/goal-task/trainings/:id/chat  –  chat with LLM about a training item
router.post('/trainings/:id/chat', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { messages } = req.body as { messages: Array<{ role: string; content: string }> };
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages is required' });
    }

    const training = await dbGet(
      `SELECT t.*, s.session_target, g.target_text, g.current_level
       FROM goal_task_trainings t
       JOIN goal_task_sessions s ON s.id = t.session_id
       JOIN goal_task_goals g ON g.id = s.goal_id
       WHERE t.id = ? AND s.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!training) return res.status(404).json({ error: 'Training not found' });

    const systemPrompt = `你是一位专业的训练教练，用户正在进行目标：「${training.target_text}」，当前水平：「${training.current_level || '未知'}」，本次训练项目：「${training.description}」。请详细回答用户关于该训练项目的问题，提供专业、实用的建议。`;

    const llmMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    ];

    const result = await chatCompletion(llmMessages);

    if (req.userId) {
      recordTokenUsage(req.userId, 'goal_task_training_chat', result.usage, result.model);
    }

    res.json({ content: result.content });
  } catch (error) {
    logError('goal_task_training_chat_error', error as Error);
    res.status(500).json({ error: 'Failed to get chat response' });
  }
});

export default router;
