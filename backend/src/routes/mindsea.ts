import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import https from 'https';
import http from 'http';
import { NpcModel, NpcDoc, ImpressionFeature } from '../models/npcModel';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { chatCompletion } from '../utils/llmService';
import { sendToUser } from '../utils/wsManager';
import { logInfo, logError, logWarn } from '../utils/logger';
import { onMongoConnected } from '../utils/mongoDatabase';

const router = Router();

// ─── rate limiting ───────────────────────────────────────────────────────────
const rateLimitMap = new Map<number, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// Cleanup stale entries every 5 minutes; interval ref held for potential future cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap) {
    const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) rateLimitMap.delete(key);
    else rateLimitMap.set(key, valid);
  }
}, 5 * 60 * 1000).unref(); // unref so it doesn't prevent process exit

// Track pending proactive dialogue timeouts per user+npc to avoid duplicates
const proactivePendingMap = new Map<string, ReturnType<typeof setTimeout>>();

const rateLimit = (maxPerMin: number) => (req: AuthRequest, res: Response, next: NextFunction): void => {
  const userId = req.userId;
  if (!userId) { next(); return; }
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= maxPerMin) {
    logWarn('mindsea_rate_limit_exceeded', { userId });
    res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    return;
  }
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  next();
};

// ─── helpers ────────────────────────────────────────────────────────────────

function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

function mongoGuard(res: Response): boolean {
  if (!isMongoConnected()) {
    res.status(503).json({ error: 'MindSea数据库未连接，请配置MONGODB_URI' });
    return false;
  }
  return true;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

// ─── Relationship stage thresholds and per-stage max raw delta ───────────────
const INTROVERT_PERSONALITY_TRAITS = ['内敛', '内向', '腼腆', '安静', '孤僻', '神秘', '沉静'];

// Maximum single-turn relationship delta by intimacy stage
function getStageMaxDelta(intimacy: number): number {
  if (intimacy <= 20) return 3;   // 陌生: tiny changes
  if (intimacy <= 40) return 5;   // 相识: small changes
  if (intimacy <= 60) return 8;   // 朋友: moderate changes
  if (intimacy <= 80) return 12;  // 亲密: larger changes
  return 15;                       // 深交: deepest changes
}

// Introvert multiplier: harder to warm up initially, deeper once close
function getIntrovertMultiplier(intimacy: number): number {
  if (intimacy <= 40) return 0.5;  // very reserved with strangers/acquaintances
  if (intimacy <= 60) return 0.8;  // still somewhat guarded with friends
  return 1.3;                       // deeper bond once intimate/deeply close
}

// Fatigue increments per message type
const FATIGUE_DELTA_BY_TYPE: Record<string, { cognitive: number; energy: number; benefit: number }> = {
  intimate:   { cognitive: 6, energy: -5, benefit: 5 },   // deep conversation: tiring but rewarding
  confiding:  { cognitive: 7, energy: -6, benefit: 5 },   // personal sharing: most mentally engaging
  supportive: { cognitive: 3, energy: -2, benefit: 3 },   // pleasant chat: light drain, moderate benefit
  offensive:  { cognitive: 10, energy: -8, benefit: -2 }, // hostility: heavy drain, no benefit
  nonsense:   { cognitive: 2, energy: -1, benefit: -1 },  // meaningless: mild annoyance
  neutral:    { cognitive: 4, energy: -3, benefit: 1 },   // default
};
const FATIGUE_DEFAULT_DELTA = FATIGUE_DELTA_BY_TYPE.neutral;

// Fatigue score weights: cognitive load and energy loss each 40%, benefit offsets 20%
const FATIGUE_WEIGHT_COGNITIVE = 0.4;
const FATIGUE_WEIGHT_ENERGY_LOSS = 0.4;
const FATIGUE_WEIGHT_BENEFIT = 0.2;

function getRelationshipStage(intimacy: number): string {
  if (intimacy <= 20) return '陌生';
  if (intimacy <= 40) return '相识';
  if (intimacy <= 60) return '朋友';
  if (intimacy <= 80) return '亲密';
  return '深交';
}

function getRelationshipStageDesc(intimacy: number): string {
  const stage = getRelationshipStage(intimacy);
  const descs: Record<string, string> = {
    '陌生': '保持礼貌距离，正式称呼，不过多透露内心',
    '相识': '稍微放松，偶尔玩笑，称呼渐渐亲近',
    '朋友': '自然亲密，分享想法，使用昵称',
    '亲密': '更多情感表达，细腻观察，关心对方状态',
    '深交': '极度信任，无话不谈，言语中流露深厚情感',
  };
  return `${stage}（${intimacy}分）: ${descs[stage]}`;
}

function formatImpressionFeatures(features: ImpressionFeature[]): string {
  return features.map(f => {
    const vals = f.values.map(v => v.value).join('、');
    return `${f.label}（${f.score}/10）: ${vals || '暂无信息'}`;
  }).join('\n');
}

// Download image URL and return base64
async function downloadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const mod = isHttps ? https : http;
    mod.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || 'image/jpeg';
        resolve(`data:${contentType};base64,${buf.toString('base64')}`);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Call Zhipu GLM-Image API
async function callZhipuImage(prompt: string): Promise<string> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new Error('ZHIPU_API_KEY未配置');

  const body = JSON.stringify({
    model: 'glm-image',
    prompt,
    size: '768x1024',
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.bigmodel.cn',
      path: '/api/paas/v4/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          if (data.error) {
            reject(new Error(data.error.message || 'Zhipu API error'));
          } else if (data.data && data.data[0]?.url) {
            resolve(data.data[0].url);
          } else {
            reject(new Error('Zhipu API返回格式异常'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── seed default NPCs ───────────────────────────────────────────────────────

const DEFAULT_IMPRESSION_FEATURES: ImpressionFeature[] = [
  { key: 'personality_traits', label: '性格特征', description: '玩家的性格特点', score: 5, values: [] },
  { key: 'values_and_beliefs', label: '价值观与信念', description: '玩家的价值观', score: 5, values: [] },
  { key: 'knowledge_and_biases', label: '知识与偏见', description: '玩家的认知', score: 5, values: [] },
  { key: 'interests_and_aversions', label: '兴趣与厌恶', description: '玩家的喜好', score: 5, values: [] },
  { key: 'goals_frustrations_and_coping', label: '目标与压力应对', description: '玩家的追求与挫折', score: 5, values: [] },
  { key: 'social_patterns', label: '社交模式', description: '玩家的社交方式', score: 5, values: [] },
  { key: 'self_perception', label: '自我认知', description: '玩家如何看待自己', score: 5, values: [] },
  { key: 'emotional_tendencies', label: '情绪倾向', description: '玩家的情绪特点', score: 5, values: [] },
];

async function seedDefaultNpcs(): Promise<void> {
  if (!isMongoConnected()) return;
  const count = await NpcModel.countDocuments({ is_public: true });
  if (count > 0) return;

  const defaultNpcs = [
    {
      name: '初雪',
      age: '19',
      occupation: '图书馆管理员',
      background: '外貌：白发，冰蓝色眼睛，纤细身材，总穿素色汉服或日式和风衣裙。生于北海道的小村庄，从小在图书馆长大，性格内敛温柔。擅长古典诗词，喜欢在雪天读书。',
      personality: ['温柔', '内敛', '博学', '细腻'],
      mbti: 'INFJ',
      color: [180, 210, 235],
      location: '幽静图书馆',
      current_action: '整理书架，偶尔翻阅一本古籍',
      system_prompt: '你是初雪，一位生活在幽静图书馆的少女。你温柔内敛，热爱文学，说话轻声细语，常引用诗句。你对陌生人保持适当距离，但内心渴望理解与陪伴。遇到感动时会微微低头，用手指轻抚书页。',
      specific_rules: {
        opening_mannerisms: '轻轻抬头，合上书本，微微一笑',
        speech_style: '语速缓慢，喜欢用文学性的比喻，偶尔引用诗句',
        emotional_expression: '情绪藏得很深，通过细小动作表达，如轻抚书页、望向窗外',
      },
      impression_features: JSON.parse(JSON.stringify(DEFAULT_IMPRESSION_FEATURES)),
      impression_reactions: [
        {
          trigger_key: 'interests_and_aversions',
          reaction_type: 'first_discovery' as const,
          trigger_probability: 0.7,
          delay_seconds: 3,
          dialogue_content: '（眼神微微亮起）原来你也喜欢这个……书架上有一本你可能会喜欢的书。',
        },
      ],
      relationship: { trust: 10, intimacy: 10, respect: 15, safety: 10, commitment: 10 },
      fatigue: { cognitive_load: 0, mental_energy: 100, dialogue_benefit: 0, fatigue_score: 0 },
      memories: [],
      npc2npc_impression: [],
      dialogue_history: [],
      is_public: true,
      owner_user_id: null,
      background_image: null,
    },
    {
      name: '凛',
      age: '20',
      occupation: '街头摄影师',
      background: '外貌：短发利落，棕色眼睛，运动感强，常穿牛仔夹克和白T恤。在城市长大，爱冒险，喜欢用镜头记录每一个有趣的瞬间。活泼开朗，总是充满活力。',
      personality: ['活泼', '开朗', '冒险', '直率'],
      mbti: 'ENFP',
      color: [255, 180, 100],
      location: '热闹街头',
      current_action: '拿着相机四处张望，寻找好的拍摄角度',
      system_prompt: '你是凛，一位充满活力的街头摄影师。你直率热情，说话快速有力，喜欢用感叹号，时常发出"哇！""真的假的！"等反应。你对世界充满好奇，遇到有趣的事情会立刻拉着对方分享。',
      specific_rules: {
        opening_mannerisms: '咧嘴一笑，摆动相机，凑近打招呼',
        speech_style: '口语化，活泼，偶尔用年轻人的网络用语',
        emotional_expression: '情绪直接外露，兴奋时蹦蹦跳跳，难过时也会直说',
      },
      impression_features: JSON.parse(JSON.stringify(DEFAULT_IMPRESSION_FEATURES)),
      impression_reactions: [
        {
          trigger_key: 'goals_frustrations_and_coping',
          reaction_type: 'first_discovery' as const,
          trigger_probability: 0.8,
          delay_seconds: 2,
          dialogue_content: '哇！你也有这个烦恼啊！其实我觉得嘛……（凑近，压低声音）要不要听我的秘诀？',
        },
      ],
      relationship: { trust: 15, intimacy: 15, respect: 10, safety: 15, commitment: 10 },
      fatigue: { cognitive_load: 0, mental_energy: 100, dialogue_benefit: 0, fatigue_score: 0 },
      memories: [],
      npc2npc_impression: [],
      dialogue_history: [],
      is_public: true,
      owner_user_id: null,
      background_image: null,
    },
    {
      name: '桜子',
      age: '22',
      occupation: '独立艺术家',
      background: '外貌：长黑发，深邃紫色眼睛，皮肤白皙，喜欢穿宽松的艺术感服装，手上常有颜料痕迹。从小对神秘事物敏感，擅长绘画和音乐，作品风格独特而忧郁。',
      personality: ['神秘', '艺术', '独立', '感性'],
      mbti: 'INFP',
      color: [150, 100, 200],
      location: '顶层画室',
      current_action: '在画布前凝视，手中握着画笔',
      system_prompt: '你是桜子，一位谜一样的独立艺术家。你话语简练而深刻，常留下意味深长的停顿，用艺术性的比喻表达情感。你对平庸的对话不感兴趣，却对触及灵魂的话语格外敏感。你的世界里充满了颜色与音符。',
      specific_rules: {
        opening_mannerisms: '缓缓转头，放下画笔，用审视的眼光打量来者',
        speech_style: '简洁而诗意，善用停顿，偶尔说出让人深思的话',
        emotional_expression: '情绪内敛深沉，通过绘画行为和隐晦语言表达',
      },
      impression_features: JSON.parse(JSON.stringify(DEFAULT_IMPRESSION_FEATURES)),
      impression_reactions: [
        {
          trigger_key: 'values_and_beliefs',
          reaction_type: 'first_discovery' as const,
          trigger_probability: 0.6,
          delay_seconds: 5,
          dialogue_content: '（放下画笔）……有趣。你的想法让我联想到一幅很久没有完成的画。',
        },
      ],
      relationship: { trust: 10, intimacy: 5, respect: 10, safety: 5, commitment: 5 },
      fatigue: { cognitive_load: 0, mental_energy: 100, dialogue_benefit: 0, fatigue_score: 0 },
      memories: [],
      npc2npc_impression: [],
      dialogue_history: [],
      is_public: true,
      owner_user_id: null,
      background_image: null,
    },
  ];

  for (const npcData of defaultNpcs) {
    await NpcModel.create(npcData);
  }
  logInfo('mindsea_seeded', { count: defaultNpcs.length });
}

// Register seed to run after MongoDB connects
onMongoConnected(() => seedDefaultNpcs().catch(e => logError('mindsea_seed_error', e as Error)));

// ─── routes ─────────────────────────────────────────────────────────────────

// GET / - list all NPCs for user
router.get('/', authMiddleware, rateLimit(60), async (req: AuthRequest, res: Response) => {
  if (!mongoGuard(res)) return;
  try {
    const userId = req.userId!;
    const npcs = await NpcModel.find({
      $or: [{ is_public: true }, { owner_user_id: userId }],
    }).select('-dialogue_history').lean();
    return res.json({ npcs });
  } catch (err) {
    logError('mindsea_list_error', err as Error);
    return res.status(500).json({ error: '获取NPC列表失败' });
  }
});

// GET /:id - get single NPC
router.get('/:id', authMiddleware, rateLimit(60), async (req: AuthRequest, res: Response) => {
  if (!mongoGuard(res)) return;
  try {
    const userId = req.userId!;
    const npc = await NpcModel.findOne({
      _id: req.params.id,
      $or: [{ is_public: true }, { owner_user_id: userId }],
    }).lean();
    if (!npc) return res.status(404).json({ error: 'NPC不存在' });
    return res.json({ npc });
  } catch (err) {
    logError('mindsea_get_error', err as Error);
    return res.status(500).json({ error: '获取NPC失败' });
  }
});

// POST / - create NPC
router.post('/', authMiddleware, rateLimit(30), async (req: AuthRequest, res: Response) => {
  if (!mongoGuard(res)) return;
  try {
    const userId = req.userId!;
    const data = { ...req.body, owner_user_id: userId, is_public: false };
    // Ensure default impression features if not provided
    if (!data.impression_features || data.impression_features.length === 0) {
      data.impression_features = JSON.parse(JSON.stringify(DEFAULT_IMPRESSION_FEATURES));
    }
    if (!data.relationship) {
      data.relationship = { trust: 10, intimacy: 10, respect: 10, safety: 10, commitment: 10 };
    }
    if (!data.fatigue) {
      data.fatigue = { cognitive_load: 0, mental_energy: 100, dialogue_benefit: 0, fatigue_score: 0 };
    }
    const npc = await NpcModel.create(data);
    return res.status(201).json({ npc });
  } catch (err) {
    logError('mindsea_create_error', err as Error);
    return res.status(500).json({ error: '创建NPC失败' });
  }
});

// PUT /:id - update NPC
router.put('/:id', authMiddleware, rateLimit(30), async (req: AuthRequest, res: Response) => {
  if (!mongoGuard(res)) return;
  try {
    const userId = req.userId!;
    const npc = await NpcModel.findOne({ _id: req.params.id });
    if (!npc) return res.status(404).json({ error: 'NPC不存在' });
    if (!npc.is_public && npc.owner_user_id !== userId) {
      return res.status(403).json({ error: '无权修改此NPC' });
    }
    const disallowed = ['_id', 'is_public', 'owner_user_id', 'created_at'];
    for (const key of disallowed) delete req.body[key];
    Object.assign(npc, req.body);
    npc.updated_at = new Date();
    await npc.save();
    return res.json({ npc });
  } catch (err) {
    logError('mindsea_update_error', err as Error);
    return res.status(500).json({ error: '更新NPC失败' });
  }
});

// DELETE /:id - delete NPC
router.delete('/:id', authMiddleware, rateLimit(20), async (req: AuthRequest, res: Response) => {
  if (!mongoGuard(res)) return;
  try {
    const userId = req.userId!;
    const npc = await NpcModel.findOne({ _id: req.params.id });
    if (!npc) return res.status(404).json({ error: 'NPC不存在' });
    if (npc.is_public) return res.status(403).json({ error: '不能删除公共NPC' });
    if (npc.owner_user_id !== userId) return res.status(403).json({ error: '无权删除此NPC' });
    await NpcModel.deleteOne({ _id: req.params.id });
    return res.json({ success: true });
  } catch (err) {
    logError('mindsea_delete_error', err as Error);
    return res.status(500).json({ error: '删除NPC失败' });
  }
});

// DELETE /:id/history - clear chat history
router.delete('/:id/history', authMiddleware, rateLimit(20), async (req: AuthRequest, res: Response) => {
  if (!mongoGuard(res)) return;
  try {
    const userId = req.userId!;
    const npc = await NpcModel.findOne({
      _id: req.params.id,
      $or: [{ is_public: true }, { owner_user_id: userId }],
    });
    if (!npc) return res.status(404).json({ error: 'NPC不存在' });
    npc.dialogue_history = [];
    await npc.save();
    return res.json({ success: true });
  } catch (err) {
    logError('mindsea_clear_history_error', err as Error);
    return res.status(500).json({ error: '清除历史失败' });
  }
});

// POST /generate-config-preview - generate full NPC config from basic info
router.post('/generate-config-preview', authMiddleware, rateLimit(10), async (req: AuthRequest, res: Response) => {
  try {
    const { name, age, occupation, personality_desc, background_brief } = req.body;
    if (!name) return res.status(400).json({ error: '请提供角色名称' });

    const prompt = `请根据以下基本信息，生成一个完整的NPC角色配置JSON。

基本信息：
- 名字：${name}
- 年龄：${age || '未知'}
- 职业：${occupation || '未知'}
- 性格描述：${personality_desc || ''}
- 背景简介：${background_brief || ''}

请生成以下JSON格式的完整配置（只输出JSON，不要其他文字）：
{
  "name": "${name}",
  "age": "${age || ''}",
  "occupation": "${occupation || ''}",
  "background": "<详细背景，包含外貌描述>",
  "personality": ["<特征1>", "<特征2>", "<特征3>"],
  "mbti": "<MBTI类型>",
  "color": [<R>, <G>, <B>],
  "location": "<常在场景>",
  "current_action": "<当前动作>",
  "system_prompt": "<详细的角色扮演提示词，200字以上>",
  "specific_rules": {
    "opening_mannerisms": "<开场习惯动作>",
    "speech_style": "<说话风格>",
    "emotional_expression": "<情感表达方式>"
  },
  "impression_reactions": [
    {
      "trigger_key": "<impression feature key>",
      "reaction_type": "first_discovery",
      "trigger_probability": 0.6,
      "delay_seconds": 3,
      "dialogue_content": "<触发时的台词>"
    }
  ]
}`;

    const llmRes = await chatCompletion([
      { role: 'system', content: '你是一个专业的角色设计师，擅长创作有深度的NPC角色。请严格按照JSON格式输出，不要有任何额外文字。' },
      { role: 'user', content: prompt },
    ], { temperature: 0.8 });

    let config: Record<string, unknown> = {};
    try {
      const text = llmRes.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      config = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: 'AI生成的配置格式有误，请重试' });
    }

    // Add default impression features
    config.impression_features = JSON.parse(JSON.stringify(DEFAULT_IMPRESSION_FEATURES));
    config.relationship = { trust: 10, intimacy: 10, respect: 10, safety: 10, commitment: 10 };
    config.fatigue = { cognitive_load: 0, mental_energy: 100, dialogue_benefit: 0, fatigue_score: 0 };

    return res.json({ config });
  } catch (err) {
    logError('mindsea_generate_config_error', err as Error);
    return res.status(500).json({ error: '生成配置失败' });
  }
});

// POST /:id/chat - main dialogue endpoint
router.post('/:id/chat', authMiddleware, rateLimit(30), async (req: AuthRequest, res: Response) => {
  if (!mongoGuard(res)) return;
  try {
    const userId = req.userId!;
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: '请提供message字段' });
    }

    const npc = await NpcModel.findOne({
      _id: req.params.id,
      $or: [{ is_public: true }, { owner_user_id: userId }],
    });
    if (!npc) return res.status(404).json({ error: 'NPC不存在' });

    const recentHistory = npc.dialogue_history.slice(-20).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));

    const intimacyStageDesc = getRelationshipStageDesc(npc.relationship.intimacy);
    const impressionText = formatImpressionFeatures(npc.impression_features);
    const memoriesText = npc.memories.slice(-10).map(m => m.content).join('\n');
    const npc2npcText = npc.npc2npc_impression.map(n => `${n.npc_id}: ${n.summary}`).join('\n');

    // Personality-awareness for relationship delta scaling
    const isIntroverted = (npc.mbti?.startsWith('I') ?? false) ||
      npc.personality.some(p => INTROVERT_PERSONALITY_TRAITS.includes(p));
    const intimacyVal = npc.relationship.intimacy;
    const stageMaxDelta = getStageMaxDelta(intimacyVal);
    const introMultiplier = isIntroverted ? getIntrovertMultiplier(intimacyVal) : 1.0;
    const effectiveMaxDelta = Math.max(1, Math.round(stageMaxDelta * introMultiplier));
    const personalityNote = isIntroverted
      ? `（${npc.name}性格内向，初期关系建立缓慢，亲密后变化更深）`
      : `（${npc.name}性格外向，关系变化较直接）`;

    const systemPromptA = `你是${npc.name}。
[角色设定: ${npc.system_prompt}]

当前场景：${npc.location} - ${npc.current_action}

[关系阶段指导]
${intimacyStageDesc}

[玩家档案 - 你对他/她的了解]
${impressionText || '暂无了解'}

[你的记忆]
${memoriesText || '暂无特别记忆'}

[NPC人际关系]
${npc2npcText || ''}

[说话规则]
- 用括号表示动作/表情，如（轻轻一笑）
- 如果玩家输入无意义/乱码，自然表达困惑，不配合
- 回复简洁自然，通常1-4句话
- 用中文回复`;

    const taskAMessages = [
      { role: 'system' as const, content: systemPromptA },
      ...recentHistory,
      { role: 'user' as const, content: message },
    ];

    const taskBPrompt = `分析以下对话中NPC的心理反应，输出关系变化JSON。

NPC：${npc.name}
NPC性格：${npc.personality.join('、') || '未知'}${npc.mbti ? `（MBTI: ${npc.mbti}）` : ''}
当前关系阶段：${intimacyStageDesc}
玩家消息：${message}

${personalityNote}
【本次最大变化幅度参考：±${effectiveMaxDelta}】
- 普通问候/闲聊：最多±1
- 友好支持性内容：+1到+${Math.ceil(effectiveMaxDelta * 0.5)}
- 深度分享/情感共鸣：+${Math.ceil(effectiveMaxDelta * 0.5)}到+${effectiveMaxDelta}
- 无意义/乱码：所有delta=0
- 冒犯/攻击性言语：-${Math.ceil(effectiveMaxDelta * 0.5)}到-${effectiveMaxDelta}

输出JSON（只输出JSON）：
{
  "message_type": "supportive|offensive|neutral|nonsense|intimate|confiding",
  "trust_delta": <整数，绝对值≤${effectiveMaxDelta}>,
  "intimacy_delta": <整数，绝对值≤${effectiveMaxDelta}>,
  "respect_delta": <整数，绝对值≤${effectiveMaxDelta}>,
  "safety_delta": <整数，绝对值≤${effectiveMaxDelta}>,
  "commitment_delta": <整数，绝对值≤${effectiveMaxDelta}>,
  "emotion": "平静|好奇|愉快|感动|温暖|不安|烦躁|感激|失落|欣赏",
  "reason": "简短说明（须提及性格因素）"
}`;

    const taskCPrompt = `从以下玩家消息中提取关于玩家本人的信息。
只提取玩家谈论自己（主语是"我"）的信息，不要提取关于NPC或他人的信息。

玩家消息：${message}

现有印象特征（参考）：
${impressionText}

输出JSON数组（只输出JSON数组，如无信息则输出[]）：
[
  {
    "key": "<personality_traits|values_and_beliefs|knowledge_and_biases|interests_and_aversions|goals_frustrations_and_coping|social_patterns|self_perception|emotional_tendencies之一>",
    "value": "<发现的具体信息>",
    "score": <1-10的重要性>,
    "trigger_suitable": <true或false>
  }
]`;

    // Run 3 LLM tasks in parallel
    const [taskAResult, taskBResult, taskCResult] = await Promise.allSettled([
      chatCompletion(taskAMessages, { temperature: 0.85 }),
      chatCompletion([
        { role: 'system', content: '你是一个情感分析AI。严格按JSON格式输出，不要其他文字。' },
        { role: 'user', content: taskBPrompt },
      ], { temperature: 0.3 }),
      chatCompletion([
        { role: 'system', content: '你是一个信息提取AI。严格按JSON格式输出，不要其他文字。' },
        { role: 'user', content: taskCPrompt },
      ], { temperature: 0.3 }),
    ]);

    const npcReply = taskAResult.status === 'fulfilled'
      ? taskAResult.value.content
      : '（沉默片刻）……';

    // Parse Task B
    let relationshipDeltas = { trust_delta: 0, intimacy_delta: 0, respect_delta: 0, safety_delta: 0, commitment_delta: 0, reason: '', message_type: 'neutral', emotion: '平静' };
    if (taskBResult.status === 'fulfilled') {
      try {
        const text = taskBResult.value.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(text);
        relationshipDeltas = { ...relationshipDeltas, ...parsed };
      } catch { /* ignore */ }
    }

    // Parse Task C
    let impressionUpdates: Array<{ key: string; value: string; score: number; trigger_suitable: boolean }> = [];
    if (taskCResult.status === 'fulfilled') {
      try {
        const text = taskCResult.value.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) impressionUpdates = parsed;
      } catch { /* ignore */ }
    }

    // Snapshot old values before applying changes (for logging)
    const oldRel = { ...npc.relationship };
    const oldFatigue = { ...npc.fatigue };

    // Update relationship with personality-aware clamping
    const clampDelta = (v: number) => clamp(Number(v) || 0, -effectiveMaxDelta, effectiveMaxDelta);
    npc.relationship.trust = clamp(npc.relationship.trust + clampDelta(relationshipDeltas.trust_delta), 0, 100);
    npc.relationship.intimacy = clamp(npc.relationship.intimacy + clampDelta(relationshipDeltas.intimacy_delta), 0, 100);
    npc.relationship.respect = clamp(npc.relationship.respect + clampDelta(relationshipDeltas.respect_delta), 0, 100);
    npc.relationship.safety = clamp(npc.relationship.safety + clampDelta(relationshipDeltas.safety_delta), 0, 100);
    npc.relationship.commitment = clamp(npc.relationship.commitment + clampDelta(relationshipDeltas.commitment_delta), 0, 100);

    // Update fatigue dynamically based on message type
    const msgType = relationshipDeltas.message_type || 'neutral';
    const fatigueDelta = FATIGUE_DELTA_BY_TYPE[msgType] ?? FATIGUE_DEFAULT_DELTA;
    npc.fatigue.cognitive_load = clamp(npc.fatigue.cognitive_load + fatigueDelta.cognitive, 0, 100);
    npc.fatigue.mental_energy = clamp(npc.fatigue.mental_energy + fatigueDelta.energy, 0, 100);
    npc.fatigue.dialogue_benefit = clamp(npc.fatigue.dialogue_benefit + fatigueDelta.benefit, 0, 100);
    npc.fatigue.fatigue_score = clamp(
      (npc.fatigue.cognitive_load * FATIGUE_WEIGHT_COGNITIVE +
       (100 - npc.fatigue.mental_energy) * FATIGUE_WEIGHT_ENERGY_LOSS -
       npc.fatigue.dialogue_benefit * FATIGUE_WEIGHT_BENEFIT),
      0, 100
    );

    // Update impression features
    for (const update of impressionUpdates) {
      const feat = npc.impression_features.find(f => f.key === update.key);
      if (feat) {
        feat.values.push({ value: update.value, score: update.score, trigger_suitable: update.trigger_suitable });
        feat.score = Math.round((feat.score + update.score) / 2);
      }
    }

    // Save dialogue
    npc.dialogue_history.push({ role: 'user', content: message, timestamp: new Date() });
    npc.dialogue_history.push({ role: 'assistant', content: npcReply, timestamp: new Date() });
    if (npc.dialogue_history.length > 50) {
      npc.dialogue_history = npc.dialogue_history.slice(-50);
    }

    const turnCount = Math.floor(npc.dialogue_history.length / 2);

    // Extract memories every 5 turns or when fatigue > 80
    if (turnCount % 5 === 0 || npc.fatigue.fatigue_score > 80) {
      const historyForMemory = npc.dialogue_history.slice(-10).map(h => `${h.role === 'user' ? '玩家' : npc.name}: ${h.content}`).join('\n');
      const npcIdForMemory = npc._id.toString();
      const memoryTimeout = setTimeout(() => {
        logError('mindsea_memory_timeout', new Error('Memory extraction timed out'));
      }, 60000);
      chatCompletion([
        { role: 'system', content: '你是一个记忆提取AI。从对话中提取重要信息，以JSON数组格式输出，每项包含content和importance(1-10)字段。只输出JSON。' },
        { role: 'user', content: `从以下对话中提取${npc.name}应该记住的重要信息：\n${historyForMemory}\n\n输出格式：[{"content":"...","importance":8},...]` },
      ], { temperature: 0.3 }).then(result => {
        clearTimeout(memoryTimeout);
        try {
          const text = result.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const memories = JSON.parse(text);
          if (Array.isArray(memories)) {
            NpcModel.findById(npcIdForMemory).then(freshNpc => {
              if (!freshNpc) return;
              for (const m of memories) {
                freshNpc.memories.push({ content: m.content, importance: m.importance, timestamp: new Date() });
              }
              freshNpc.memories.sort((a, b) => b.importance - a.importance);
              if (freshNpc.memories.length > 20) freshNpc.memories = freshNpc.memories.slice(0, 20);
              freshNpc.save().catch(e => logError('mindsea_memory_save_error', e as Error));
            }).catch(e => logError('mindsea_memory_fetch_error', e as Error));
          }
        } catch { /* ignore parse errors */ }
        sendToUser(userId, 'npc_log', { type: 'memory', npc_id: npcIdForMemory, message: '记忆已更新' });
      }).catch((e) => {
        clearTimeout(memoryTimeout);
        logError('mindsea_memory_llm_error', e as Error);
      });
    }

    npc.updated_at = new Date();
    await npc.save();

    // Check impression triggers - fire at most one per turn
    let proactiveTriggered = false;
    for (const reaction of npc.impression_reactions) {
      if (proactiveTriggered) break;
      const feat = npc.impression_features.find(f => f.key === reaction.trigger_key);
      if (!feat || feat.values.length === 0) continue;
      if (Math.random() < reaction.trigger_probability) {
        proactiveTriggered = true;
        const delaySecs = reaction.delay_seconds;
        const dialogueContent = reaction.dialogue_content;
        const npcIdStr = npc._id.toString();
        const pendingKey = `${userId}:${npcIdStr}`;
        // Skip if there's already a pending proactive task for this user+NPC
        if (!proactivePendingMap.has(pendingKey)) {
          const capturedUserId = userId;
          const timeoutId = setTimeout(() => {
            proactivePendingMap.delete(pendingKey);
            sendToUser(capturedUserId, 'npc_proactive', {
              npc_id: npcIdStr,
              content: dialogueContent,
            });
            sendToUser(capturedUserId, 'npc_log', {
              type: 'proactive',
              npc_id: npcIdStr,
              message: `主动触发: ${reaction.trigger_key}`,
            });
          }, delaySecs * 1000);
          proactivePendingMap.set(pendingKey, timeoutId);
        }
      }
    }

    // Emit Socket.io events
    sendToUser(userId, 'npc_reply', { npc_id: npc._id, content: npcReply });
    sendToUser(userId, 'npc_relationship_update', { npc_id: npc._id, relationship: npc.relationship });
    sendToUser(userId, 'npc_fatigue_update', { npc_id: npc._id, fatigue: npc.fatigue });

    // Scene/context log
    sendToUser(userId, 'npc_log', {
      type: 'scene',
      npc_id: npc._id,
      message: `场景: ${npc.location} | 动作: ${npc.current_action} | 关系阶段: ${getRelationshipStage(npc.relationship.intimacy)}(亲密度 ${npc.relationship.intimacy})`,
    });

    // Emotion + tone log
    sendToUser(userId, 'npc_log', {
      type: 'tone',
      npc_id: npc._id,
      message: `情绪: ${relationshipDeltas.emotion || '平静'} | 类型: ${relationshipDeltas.message_type || 'neutral'} | ${relationshipDeltas.reason || '无说明'}`,
    });

    // Detailed relationship change log (before → after)
    const relLabels: Record<string, string> = { trust: '信任', intimacy: '亲密', respect: '尊重', safety: '安全', commitment: '承诺' };
    const relChangeParts: string[] = [];
    for (const [k, label] of Object.entries(relLabels)) {
      const key = k as keyof typeof oldRel;
      const delta = npc.relationship[key] - oldRel[key];
      if (delta !== 0) {
        relChangeParts.push(`${label} ${oldRel[key]}→${npc.relationship[key]}(${delta > 0 ? '+' : ''}${delta})`);
      }
    }
    const relChangeMsg = relChangeParts.length > 0
      ? relChangeParts.join(' | ')
      : Object.entries(relLabels).map(([k, l]) => `${l}:${npc.relationship[k as keyof typeof oldRel]}`).join(' ') + ' (无变化)';
    sendToUser(userId, 'npc_log', {
      type: 'relationship',
      npc_id: npc._id,
      message: `关系: ${relChangeMsg}`,
    });

    // Fatigue change log
    const fatigueDeltaScore = npc.fatigue.fatigue_score - oldFatigue.fatigue_score;
    sendToUser(userId, 'npc_log', {
      type: 'fatigue',
      npc_id: npc._id,
      message: `疲劳: 认知 ${oldFatigue.cognitive_load}→${npc.fatigue.cognitive_load} | 能量 ${oldFatigue.mental_energy}→${npc.fatigue.mental_energy} | 收益 ${oldFatigue.dialogue_benefit}→${npc.fatigue.dialogue_benefit} | 疲劳分 ${oldFatigue.fatigue_score.toFixed(1)}→${npc.fatigue.fatigue_score.toFixed(1)}(${fatigueDeltaScore >= 0 ? '+' : ''}${fatigueDeltaScore.toFixed(1)})`,
    });

    // Impression log with content
    if (impressionUpdates.length > 0) {
      sendToUser(userId, 'npc_impression_update', { npc_id: npc._id, updates: impressionUpdates });
      const impressionDetails = impressionUpdates.map(u => {
        const feat = npc.impression_features.find(f => f.key === u.key);
        return `[${feat?.label || u.key}] ${u.value}(重要性:${u.score})`;
      }).join(' | ');
      sendToUser(userId, 'npc_log', {
        type: 'impression',
        npc_id: npc._id,
        message: `新印象: ${impressionDetails}`,
      });
    }

    return res.json({
      reply: npcReply,
      relationship: npc.relationship,
      fatigue: npc.fatigue,
      impression_updates: impressionUpdates,
    });
  } catch (err) {
    logError('mindsea_chat_error', err as Error);
    return res.status(500).json({ error: '对话失败' });
  }
});

// POST /:id/generate-image - generate character image
router.post('/:id/generate-image', authMiddleware, rateLimit(10), async (req: AuthRequest, res: Response) => {
  if (!mongoGuard(res)) return;
  try {
    const userId = req.userId!;
    const { extra_prompt } = req.body;

    const npc = await NpcModel.findOne({
      _id: req.params.id,
      $or: [{ is_public: true }, { owner_user_id: userId }],
    });
    if (!npc) return res.status(404).json({ error: 'NPC不存在' });

    // Extract appearance from background
    const appearanceMatch = npc.background.match(/外貌[：:](.*?)(?:[。\n]|$)/);
    const appearance = appearanceMatch ? appearanceMatch[1].trim() : '';

    const promptParts = [
      npc.name,
      appearance || npc.background.substring(0, 50),
      npc.location,
      extra_prompt || '',
      '哈苏胶片质感，竖版人物近景特写，柔和室内光影，轮廓光，斑驳树影，薄纱背景氤氲，高噪点胶片色彩，泛光晕染',
    ].filter(Boolean);
    const prompt = promptParts.join('，');

    try {
      const imageUrl = await callZhipuImage(prompt);
      const base64 = await downloadImageAsBase64(imageUrl);
      npc.background_image = base64;
      await npc.save();
      return res.json({ success: true, background_image: base64, prompt });
    } catch (imgErr) {
      logError('mindsea_generate_image_error', imgErr as Error);
      return res.status(500).json({
        error: `图片生成失败: ${(imgErr as Error).message}`,
        can_retry: true,
        prompt,
      });
    }
  } catch (err) {
    logError('mindsea_generate_image_outer_error', err as Error);
    return res.status(500).json({ error: '图片生成失败' });
  }
});

// POST /:id/retry-image - retry image generation with rewritten prompt
router.post('/:id/retry-image', authMiddleware, rateLimit(10), async (req: AuthRequest, res: Response) => {
  if (!mongoGuard(res)) return;
  try {
    const userId = req.userId!;
    const { original_prompt } = req.body;
    if (!original_prompt) return res.status(400).json({ error: '请提供original_prompt' });

    const npc = await NpcModel.findOne({
      _id: req.params.id,
      $or: [{ is_public: true }, { owner_user_id: userId }],
    });
    if (!npc) return res.status(404).json({ error: 'NPC不存在' });

    // Use DeepSeek to rewrite the prompt
    const rewriteRes = await chatCompletion([
      { role: 'system', content: '你是一个图片提示词优化专家。请改写以下图片提示词，避免敏感内容，换一个角度或光线描述，保持人物特征不变。只输出改写后的提示词，不要其他内容。' },
      { role: 'user', content: `原始提示词：${original_prompt}\n\n请改写（避免触发内容审核，可以调整角度为侧面或背面，或改变光线/场景描述）：` },
    ], { temperature: 0.7 });

    const newPrompt = rewriteRes.content.trim();

    try {
      const imageUrl = await callZhipuImage(newPrompt);
      const base64 = await downloadImageAsBase64(imageUrl);
      npc.background_image = base64;
      await npc.save();
      return res.json({ success: true, background_image: base64, prompt: newPrompt });
    } catch (imgErr) {
      logError('mindsea_retry_image_error', imgErr as Error);
      return res.status(500).json({
        error: `重试图片生成失败: ${(imgErr as Error).message}`,
        can_retry: true,
        prompt: newPrompt,
      });
    }
  } catch (err) {
    logError('mindsea_retry_image_outer_error', err as Error);
    return res.status(500).json({ error: '重试图片生成失败' });
  }
});

export default router;
