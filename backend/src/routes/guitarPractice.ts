import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { chatCompletion } from '../utils/llmService';
import { recordTokenUsage } from '../utils/asyncLlmService';
import { sanitizeString } from '../utils/sanitize';
import { logInfo, logError } from '../utils/logger';

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
  "difficulty": "beginner",
  "chords": ["C", "G", "Am", "F"],
  "lyricsWithChords": "带和弦标注的完整歌词（包含主歌、副歌等所有段落），和弦写在对应歌词上方，以空格对齐，换行分隔，用[verse]、[chorus]、[bridge]等标记段落",
  "annotations": [
    {"time": 0, "chord": "C", "lyrics": "第一句歌词"},
    {"time": 4, "chord": "G", "lyrics": "第二句歌词"}
  ]
}

要求：
- difficulty 取值：beginner（初级）、intermediate（中级）或 advanced（高级），根据和弦难度判断
- chords：列出歌曲主要和弦，使用标准吉他和弦名（如 C、G、Am、F、Em、Dm、D、A、E、B7 等）
- lyricsWithChords：包含完整歌词（尽量覆盖主歌、副歌、桥段等所有段落），每行歌词上方标注对应和弦，使用空格对齐，用[verse]、[chorus]、[bridge]等标记段落开始
- annotations：至少 12 条，尽量覆盖完整歌曲，time 为该句在歌曲中的大致秒数（估算），chord 为该时刻和弦，lyrics 为对应歌词

只输出 JSON，不要有其他文字。`;

    const result = await chatCompletion([{ role: 'user', content: prompt }]);

    if (req.userId) {
      recordTokenUsage(req.userId, 'guitar_analyze', result.usage, result.model);
    }

    let songData: {
      difficulty?: string;
      chords?: string[];
      lyricsWithChords?: string;
      annotations?: Array<{ time: number; chord: string; lyrics: string }>;
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

export default router;
