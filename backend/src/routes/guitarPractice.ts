import { Router, Response, Request, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { chatCompletion } from '../utils/llmService';
import { recordTokenUsage } from '../utils/asyncLlmService';
import { analyzeAudioWithZhipu, isZhipuConfigured, MAX_AUDIO_SIZE_BYTES } from '../utils/zhipuService';
import { sanitizeString } from '../utils/sanitize';
import { logInfo, logError, logWarn } from '../utils/logger';
import { dbRun, dbGet, dbAll } from '../utils/database';

// Multer: store audio in memory, limit file size, accept audio only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持音频文件'));
    }
  },
});

// Rate limiter for audio analysis (expensive LLM call): 5 requests per user per minute
const audioRateLimitMap = new Map<string, number[]>();
const AUDIO_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AUDIO_RATE_LIMIT_MAX = 5;

const audioRateLimit = (req: AuthRequest, res: Response, next: NextFunction) => {
  const key = String(req.userId || req.ip);
  const now = Date.now();
  const timestamps = (audioRateLimitMap.get(key) || []).filter(t => now - t < AUDIO_RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= AUDIO_RATE_LIMIT_MAX) {
    logWarn('guitar_audio_rate_limit_exceeded', { key });
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  timestamps.push(now);
  audioRateLimitMap.set(key, timestamps);
  next();
};

const router = Router();

// POST /api/guitar-practice/analyze
// Use LLM to generate chord chart and practice data for a given song title + artist
router.post('/analyze', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { title, artist } = req.body as { title?: string; artist?: string };

    if (!title || !artist) {
      return res.status(400).json({ error: '请提供歌曲名称和艺术家' });
    }

    const safeTitle = sanitizeString(title, 200);
    const safeArtist = sanitizeString(artist, 200);

    logInfo('guitar_analyze_request', { userId: req.userId, title: safeTitle, artist: safeArtist });

    const prompt = `请为歌曲《${safeTitle}》（演唱：${safeArtist}）生成吉他练习数据。

请以JSON格式输出以下内容：
{
  "difficulty": "<难度>",
  "chords": ["<该歌曲实际使用的和弦1>", "<和弦2>", "..."],
  "lyricsWithChords": "带和弦标注的完整歌词（包含主歌、副歌等所有段落），和弦写在对应歌词上方，以空格对齐，换行分隔，用[verse]、[chorus]、[bridge]等标记段落",
  "annotations": [
    {"time": 0, "chord": "<和弦>", "lyrics": "第一句歌词", "duration": 4},
    {"time": 4, "chord": "<和弦>", "lyrics": "第二句歌词", "duration": 4}
  ]
}

要求：
- difficulty 取值：beginner（初级）、intermediate（中级）或 advanced（高级），根据和弦难度判断
- chords：列出歌曲主要和弦，使用标准吉他和弦名（如 C、G、Am、F、Em、Dm、D、A、E、B7 等）
- lyricsWithChords：包含完整歌词（尽量覆盖主歌、副歌、桥段等所有段落），每行歌词上方标注对应和弦，使用空格对齐，用[verse]、[chorus]、[bridge]等标记段落开始
- annotations：至少 12 条，尽量覆盖完整歌曲，time 为该句在歌曲中的大致秒数（估算），chord 为该时刻和弦，lyrics 为对应歌词，duration 为该句歌词演唱时长（秒，估算）

只输出 JSON，不要有其他文字。`;

    const result = await chatCompletion([{ role: 'user', content: prompt }]);

    if (req.userId) {
      recordTokenUsage(req.userId, 'guitar_analyze', result.usage, result.model);
    }

    let songData: {
      difficulty?: string;
      chords?: string[];
      lyricsWithChords?: string;
      annotations?: Array<{ time: number; chord: string; lyrics: string; duration?: number }>;
    } = {};

    try {
      const text = result.content.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        songData = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      logError('guitar_analyze_parse_error', e as Error, { content: result.content });
      return res.status(500).json({ error: '解析 AI 响应失败，请重试' });
    }

    const validDifficulties = ['beginner', 'intermediate', 'advanced'];
    const difficulty = validDifficulties.includes(songData.difficulty || '') ? songData.difficulty : 'beginner';

    res.json({
      difficulty,
      chords: Array.isArray(songData.chords) ? songData.chords : [],
      lyricsWithChords: typeof songData.lyricsWithChords === 'string' ? songData.lyricsWithChords : '',
      annotations: Array.isArray(songData.annotations) ? songData.annotations : [],
    });
  } catch (error: any) {
    logError('guitar_analyze_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || 'AI 分析失败，请重试' });
  }
});

// GET /api/guitar-practice/songs - Get public community songs
router.get('/songs', async (_req: Request, res: Response) => {
  try {
    const songs = await dbAll(
      'SELECT * FROM guitar_community_songs WHERE is_public = 1 ORDER BY updated_at DESC'
    );
    res.json(songs.map((s: any) => ({
      id: `community-${s.id}`,
      song_key: s.song_key,
      title: s.title,
      artist: s.artist,
      difficulty: s.difficulty,
      chords: JSON.parse(s.chords || '[]'),
      lyricsWithChords: s.lyrics_with_chords,
      annotations: JSON.parse(s.annotations || '[]'),
      uploadedBy: '社区',
      createdAt: s.updated_at ? s.updated_at.slice(0, 10) : '',
      submissionCount: s.submission_count,
    })));
  } catch (error: any) {
    logError('guitar_songs_get_error', error as Error);
    res.status(500).json({ error: '获取社区歌曲失败' });
  }
});

// POST /api/guitar-practice/songs - Submit a song to community
router.post('/songs', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { title, artist, difficulty, chords, lyricsWithChords, annotations } = req.body as {
      title?: string;
      artist?: string;
      difficulty?: string;
      chords?: string[];
      lyricsWithChords?: string;
      annotations?: Array<{ time: number; chord: string; lyrics: string; duration?: number }>;
    };

    if (!title || !artist) {
      return res.status(400).json({ error: '请提供歌曲名称和艺术家' });
    }

    const safeTitle = sanitizeString(title, 200);
    const safeArtist = sanitizeString(artist, 200);
    const songKey = `${safeTitle}_${safeArtist}`.toLowerCase().replace(/\s+/g, '_');

    logInfo('guitar_song_submit', { userId: req.userId, title: safeTitle, artist: safeArtist });

    // Record this user as a submitter (ignore if already submitted)
    await dbRun(
      'INSERT OR IGNORE INTO guitar_song_submitters (song_key, user_id) VALUES (?, ?)',
      [songKey, req.userId]
    );

    // Count unique submitters for this song
    const row = await dbGet(
      'SELECT COUNT(*) as count FROM guitar_song_submitters WHERE song_key = ?',
      [songKey]
    );
    const submissionCount: number = row?.count ?? 1;
    const isPublic = submissionCount >= 2 ? 1 : 0;

    const existing = await dbGet(
      'SELECT id FROM guitar_community_songs WHERE song_key = ?',
      [songKey]
    );

    const chordsJson = JSON.stringify(Array.isArray(chords) ? chords : []);
    const annotationsJson = JSON.stringify(Array.isArray(annotations) ? annotations : []);
    const safelyrics = typeof lyricsWithChords === 'string' ? lyricsWithChords : '';
    const safeDifficulty = ['beginner', 'intermediate', 'advanced'].includes(difficulty || '')
      ? difficulty
      : 'beginner';

    if (existing) {
      await dbRun(
        `UPDATE guitar_community_songs
         SET title=?, artist=?, difficulty=?, chords=?, lyrics_with_chords=?, annotations=?,
             submitted_by=?, submission_count=?, is_public=?, updated_at=CURRENT_TIMESTAMP
         WHERE song_key=?`,
        [safeTitle, safeArtist, safeDifficulty, chordsJson, safelyrics, annotationsJson,
         req.userId, submissionCount, isPublic, songKey]
      );
    } else {
      await dbRun(
        `INSERT INTO guitar_community_songs
         (song_key, title, artist, difficulty, chords, lyrics_with_chords, annotations,
          submitted_by, submission_count, is_public)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [songKey, safeTitle, safeArtist, safeDifficulty, chordsJson, safelyrics, annotationsJson,
         req.userId, submissionCount, isPublic]
      );
    }

    res.json({
      message: '提交成功',
      isPublic: isPublic === 1,
      submissionCount,
    });
  } catch (error: any) {
    logError('guitar_song_submit_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || '提交失败，请重试' });
  }
});

// POST /api/guitar-practice/analyze-audio
// Use Zhipu LLM to analyze uploaded audio: extract lyrics, timeline, and chord progression
router.post('/analyze-audio', authMiddleware, audioRateLimit, (req: AuthRequest, res: Response, next: NextFunction) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const limitMB = Math.round(MAX_AUDIO_SIZE_BYTES / 1024 / 1024);
        return res.status(413).json({ error: `音频文件过大，请上传不超过 ${limitMB} MB 的音频文件` });
      }
      return res.status(400).json({ error: err.message || '文件上传失败' });
    }
    next();
  });
}, async (req: AuthRequest, res: Response) => {
  try {
    if (!isZhipuConfigured()) {
      return res.status(503).json({ error: '智谱 AI 服务未配置，请在环境变量中设置 ZHIPU_API_KEY' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传音频文件' });
    }

    const { title, artist } = req.body as { title?: string; artist?: string };
    const safeTitle = title ? sanitizeString(title, 200) : undefined;
    const safeArtist = artist ? sanitizeString(artist, 200) : undefined;

    logInfo('guitar_analyze_audio_request', {
      userId: req.userId,
      title: safeTitle,
      artist: safeArtist,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    const audioBase64 = req.file.buffer.toString('base64');
    const result = await analyzeAudioWithZhipu(audioBase64, req.file.mimetype, safeTitle, safeArtist);

    if (req.userId && result.usage) {
      recordTokenUsage(req.userId, 'guitar_analyze_audio', result.usage, result.model);
    }

    res.json({
      difficulty: result.difficulty,
      chords: result.chords,
      lyricsWithChords: result.lyricsWithChords,
      annotations: result.annotations,
    });
  } catch (error: any) {
    logError('guitar_analyze_audio_error', error as Error, { userId: req.userId });
    res.status(500).json({ error: error.message || '音频分析失败，请重试' });
  }
});

export default router;
