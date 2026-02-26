import https from 'https';
import http from 'http';
import { logInfo, logError } from './logger';

export interface ZhipuAudioAnalysisResult {
  lyrics: string;
  annotations: Array<{ time: number; chord: string; lyrics: string; duration: number }>;
  chords: string[];
  difficulty: string;
  lyricsWithChords: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

const DEFAULT_TIMEOUT_MS = 180000; // 180 seconds for audio processing
const DEFAULT_ANNOTATION_DURATION_SECONDS = 4;
// 智谱 API 对请求体大小有限制，base64 编码会使文件体积增加约 33%，因此限制原始音频为 10MB
const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const getZhipuConfig = () => ({
  apiKey: process.env.ZHIPU_API_KEY || '',
  baseUrl: process.env.ZHIPU_API_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
  model: process.env.ZHIPU_AUDIO_MODEL || 'glm-4-flash',
});

export const analyzeAudioWithZhipu = async (
  title: string,
  artist: string
): Promise<ZhipuAudioAnalysisResult> => {
  const config = getZhipuConfig();

  if (!config.apiKey) {
    throw new Error('Zhipu API key is not configured. Set ZHIPU_API_KEY in environment variables.');
  }

  const prompt = `请为歌曲《${title}》（演唱：${artist}）生成吉他练习数据。

请以JSON格式输出以下内容：
{
  "difficulty": "<难度>",
  "chords": ["<该歌曲常用的和弦1>", "<和弦2>", "..."],
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

  // Build the endpoint URL: base URL may or may not have a trailing slash
  const base = config.baseUrl.replace(/\/$/, '');
  const endpointUrl = `${base}/chat/completions`;
  const parsedUrl = new URL(endpointUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const requestModule = isHttps ? https : http;

  const requestBody = JSON.stringify({
    model: config.model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
  });

  logInfo('zhipu_audio_request', {
    model: config.model,
    endpoint: endpointUrl,
    title,
    artist,
  });

  return new Promise((resolve, reject) => {
    const req = requestModule.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Length': Buffer.byteLength(requestBody),
        },
        timeout: DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => { chunks.push(chunk); });
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          try {
            if (res.statusCode && res.statusCode >= 400) {
              logError('zhipu_request_failed', new Error(`Zhipu API returned status ${res.statusCode}`), { response: data });
              reject(new Error(`Zhipu API error (${res.statusCode}): ${data}`));
              return;
            }
            const parsed = JSON.parse(data);
            const content: string = parsed.choices?.[0]?.message?.content || '';
            const usage = parsed.usage;
            const model: string = parsed.model || config.model;

            logInfo('zhipu_request_success', { model, usage });

            // Parse JSON from the LLM response
            let songData: {
              difficulty?: string;
              chords?: string[];
              lyricsWithChords?: string;
              annotations?: Array<{ time: number; chord: string; lyrics: string; duration?: number }>;
            } = {};

            try {
              const text = content.trim();
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                songData = JSON.parse(jsonMatch[0]);
              }
            } catch (e) {
              logError('zhipu_audio_parse_error', e as Error, { content });
              reject(new Error('解析 Zhipu JSON 响应失败，请重试'));
              return;
            }

            const validDifficulties = ['beginner', 'intermediate', 'advanced'];
            const difficulty = validDifficulties.includes(songData.difficulty || '')
              ? (songData.difficulty as string)
              : 'beginner';

            resolve({
              lyrics: content,
              difficulty,
              chords: Array.isArray(songData.chords) ? songData.chords : [],
              lyricsWithChords: typeof songData.lyricsWithChords === 'string' ? songData.lyricsWithChords : '',
              annotations: Array.isArray(songData.annotations)
                ? songData.annotations.map(a => ({
                    time: Number(a.time) || 0,
                    chord: String(a.chord || ''),
                    lyrics: String(a.lyrics || ''),
                    duration: Number(a.duration) || DEFAULT_ANNOTATION_DURATION_SECONDS,
                  }))
                : [],
              usage,
              model,
            });
          } catch (err) {
            logError('zhipu_response_parse_error', err as Error, { data });
            reject(new Error('Failed to parse Zhipu response'));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Zhipu API request timed out'));
    });

    req.on('error', (err) => {
      logError('zhipu_request_error', err);
      reject(err);
    });

    req.write(requestBody);
    req.end();
  });
};

export const isZhipuConfigured = (): boolean => {
  return !!process.env.ZHIPU_API_KEY;
};

export { MAX_AUDIO_SIZE_BYTES };

