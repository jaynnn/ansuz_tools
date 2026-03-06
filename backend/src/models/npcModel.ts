import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface ImpressionFeature {
  key: string;
  label: string;
  description: string;
  score: number;
  values: Array<{
    value: string;
    score: number;
    trigger_suitable: boolean;
  }>;
}

export interface ImpressionReaction {
  trigger_key: string;
  reaction_type: 'first_discovery' | 'repeated_discovery' | 'dialogue_count';
  trigger_probability: number;
  delay_seconds: number;
  dialogue_content: string;
}

/**
 * Full 22-dimension relationship between NPC and player.
 * Legacy fields (trust/intimacy/respect/safety/commitment) are kept for backward compatibility.
 */
export interface NpcRelationship {
  // ── core dimensions (legacy + spec) ──────────────────────────────────
  /** 好感度 – how much the NPC likes/dislikes the player */
  affinity: number;
  /** 信任度 – does the NPC believe the player */
  trust: number;
  /** 尊敬度 – recognition of the player's ability or status */
  respect: number;
  /** 恐惧度 – intimidation the player generates */
  fear: number;
  /** 熟悉度 – degree of acquaintance */
  familiarity: number;
  /** 亲密度 – emotional closeness (primary display dimension) */
  intimacy: number;
  /** 忠诚度 – willingness to stand on the player's side */
  loyalty: number;
  /** 依赖度 – how much the NPC needs the player */
  dependency: number;
  /** 权力差距 – perceived status gap */
  authority_gap: number;
  /** 利益一致度 – alignment of goals */
  interest_alignment: number;
  /** 工具价值 – practical utility of the player to the NPC */
  utility: number;
  /** 债务值 – emotional/material debts between them */
  debt: number;
  /** 竞争度 – resource or goal conflict */
  competition: number;
  /** 共同经历值 – accumulated shared events */
  history: number;
  /** 承诺状态 0-100 (0 = no promise, 100 = strong unbreakable vow) */
  promise: number;
  /** 背叛值 – degree of past betrayal */
  betrayal: number;
  /** 秘密共享度 – how many secrets each knows about the other */
  secret_shared: number;
  /** 道德一致度 – value alignment */
  moral_alignment: number;
  /** 阵营一致度 – faction alignment */
  faction_alignment: number;
  /** 合作倾向 – probability of cooperation */
  cooperation: number;
  /** 敌对倾向 – degree of hostility */
  hostility: number;
  /** 信息共享倾向 – willingness to share information */
  information_share: number;
  // ── legacy compat fields ──────────────────────────────────────────────
  safety: number;
  commitment: number;
}

/**
 * Full 17-dimension fatigue state.
 * Legacy fields (cognitive_load/mental_energy/dialogue_benefit/fatigue_score)
 * are preserved for backward compatibility.
 */
export interface FatigueState {
  /** 精力值 – available social energy */
  energy: number;
  /** 注意力剩余 */
  attention: number;
  /** 耐心值 */
  patience: number;
  /** 社交电量 */
  social_battery: number;
  /** 话题兴趣度 */
  interest: number;
  /** 新鲜度 */
  novelty: number;
  /** 信任表达意愿 */
  trust_willingness: number;
  /** 情绪负担 */
  emotional_load: number;
  /** 认知负担 (legacy: cognitive_load) */
  cognitive_load: number;
  /** 时间预算 */
  time_budget: number;
  /** 好奇心 */
  curiosity: number;
  /** 礼貌约束 */
  politeness_constraint: number;
  /** 烦躁度 */
  annoyance: number;
  /** 防御心 */
  safety_guard: number;
  /** 目标冲突 */
  goal_conflict: number;
  /** 对话惯性 */
  conversation_momentum: number;
  /** 结束倾向 */
  exit_urge: number;
  // ── legacy computed fields ────────────────────────────────────────────
  /** 精神能量 (legacy: mental_energy) */
  mental_energy: number;
  /** 对话收益 (legacy: dialogue_benefit) */
  dialogue_benefit: number;
  /** 综合疲劳分 (legacy: fatigue_score) */
  fatigue_score: number;
}

/**
 * NPC basic settings – 5 dimension groups.
 */
export interface NpcBasicSettings {
  /** 身份特征 */
  identity: string;
  /** 背景经历 */
  history_background: string;
  /** 性格心理 */
  psychology: string;
  /** 能力技能 */
  abilities: string;
  /** 目标冲突 */
  goals_conflicts: string;
}

/**
 * NPC's impression of the player across 15 dimensions.
 */
export interface PlayerImpression {
  /** 外表印象 */
  appearance: string;
  /** 性格印象 */
  personality_impression: string;
  /** 能力印象 */
  ability_impression: string;
  /** 道德印象 */
  moral_impression: string;
  /** 情感态度 */
  emotional_attitude: string;
  /** 信任程度 */
  trust_level: string;
  /** 地位印象 */
  status_impression: string;
  /** 行为印象 */
  behavior_impression: string;
  /** 关系印象 */
  relation_impression: string;
  /** 喜好认知 */
  likes_known: string;
  /** 厌恶认知 */
  dislikes_known: string;
  /** 习惯认知 */
  habits_known: string;
  /** 价值观认知 */
  values_known: string;
  /** 第一印象 */
  first_impression: string;
  /** 当前印象 */
  current_impression: string;
}

export interface MemoryItem {
  content: string;
  importance: number;
  timestamp: Date;
}

export interface Npc2NpcImpression {
  npc_id: string;
  relationship: string;
  summary: string;
  key_impressions: string[];
}

export interface DialogueTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface NpcDoc {
  _id: string;
  /** The scene this NPC belongs to – null means legacy/unscoped NPC */
  scene_id: string | null;
  name: string;
  age: string;
  occupation: string;
  background: string;
  personality: string[];
  mbti: string;
  color: number[];
  location: string;
  current_action: string;
  system_prompt: string;
  specific_rules: {
    opening_mannerisms: string;
    speech_style: string;
    emotional_expression: string;
  };
  /** Extended NPC basic settings */
  basic_settings: NpcBasicSettings;
  impression_features: ImpressionFeature[];
  impression_reactions: ImpressionReaction[];
  relationship: NpcRelationship;
  /** NPC's impression of the player */
  player_impression: PlayerImpression;
  fatigue: FatigueState;
  memories: MemoryItem[];
  npc2npc_impression: Npc2NpcImpression[];
  dialogue_history: DialogueTurn[];
  is_public: boolean;
  owner_user_id: number | null;
  background_image: string | null;
  chat_background_image: string | null;
  created_at: Date;
  updated_at: Date;
}

const ImpressionFeatureSchema = new Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  score: { type: Number, default: 5 },
  values: [{
    value: { type: String },
    score: { type: Number, default: 5 },
    trigger_suitable: { type: Boolean, default: false },
  }],
}, { _id: false });

const ImpressionReactionSchema = new Schema({
  trigger_key: { type: String, required: true },
  reaction_type: { type: String, enum: ['first_discovery', 'repeated_discovery', 'dialogue_count'], required: true },
  trigger_probability: { type: Number, default: 0.5 },
  delay_seconds: { type: Number, default: 5 },
  dialogue_content: { type: String, default: '' },
}, { _id: false });

const NpcSchema = new Schema<NpcDoc>({
  _id: { type: String, default: () => uuidv4() },
  scene_id: { type: String, default: null },
  name: { type: String, required: true },
  age: { type: String, default: '' },
  occupation: { type: String, default: '' },
  background: { type: String, default: '' },
  personality: [{ type: String }],
  mbti: { type: String, default: '' },
  color: [{ type: Number }],
  location: { type: String, default: '' },
  current_action: { type: String, default: '' },
  system_prompt: { type: String, default: '' },
  specific_rules: {
    opening_mannerisms: { type: String, default: '' },
    speech_style: { type: String, default: '' },
    emotional_expression: { type: String, default: '' },
  },
  basic_settings: {
    identity: { type: String, default: '' },
    history_background: { type: String, default: '' },
    psychology: { type: String, default: '' },
    abilities: { type: String, default: '' },
    goals_conflicts: { type: String, default: '' },
  },
  impression_features: [ImpressionFeatureSchema],
  impression_reactions: [ImpressionReactionSchema],
  relationship: {
    affinity: { type: Number, default: 10 },
    trust: { type: Number, default: 10 },
    respect: { type: Number, default: 10 },
    fear: { type: Number, default: 0 },
    familiarity: { type: Number, default: 5 },
    intimacy: { type: Number, default: 10 },
    loyalty: { type: Number, default: 10 },
    dependency: { type: Number, default: 0 },
    authority_gap: { type: Number, default: 50 },
    interest_alignment: { type: Number, default: 50 },
    utility: { type: Number, default: 20 },
    debt: { type: Number, default: 0 },
    competition: { type: Number, default: 0 },
    history: { type: Number, default: 0 },
    promise: { type: Number, default: 0 },
    betrayal: { type: Number, default: 0 },
    secret_shared: { type: Number, default: 0 },
    moral_alignment: { type: Number, default: 50 },
    faction_alignment: { type: Number, default: 50 },
    cooperation: { type: Number, default: 50 },
    hostility: { type: Number, default: 10 },
    information_share: { type: Number, default: 30 },
    // legacy
    safety: { type: Number, default: 10 },
    commitment: { type: Number, default: 10 },
  },
  player_impression: {
    appearance: { type: String, default: '' },
    personality_impression: { type: String, default: '' },
    ability_impression: { type: String, default: '' },
    moral_impression: { type: String, default: '' },
    emotional_attitude: { type: String, default: '' },
    trust_level: { type: String, default: '' },
    status_impression: { type: String, default: '' },
    behavior_impression: { type: String, default: '' },
    relation_impression: { type: String, default: '' },
    likes_known: { type: String, default: '' },
    dislikes_known: { type: String, default: '' },
    habits_known: { type: String, default: '' },
    values_known: { type: String, default: '' },
    first_impression: { type: String, default: '' },
    current_impression: { type: String, default: '' },
  },
  fatigue: {
    energy: { type: Number, default: 100 },
    attention: { type: Number, default: 100 },
    patience: { type: Number, default: 100 },
    social_battery: { type: Number, default: 100 },
    interest: { type: Number, default: 70 },
    novelty: { type: Number, default: 80 },
    trust_willingness: { type: Number, default: 60 },
    emotional_load: { type: Number, default: 0 },
    cognitive_load: { type: Number, default: 0 },
    time_budget: { type: Number, default: 100 },
    curiosity: { type: Number, default: 70 },
    politeness_constraint: { type: Number, default: 80 },
    annoyance: { type: Number, default: 0 },
    safety_guard: { type: Number, default: 50 },
    goal_conflict: { type: Number, default: 0 },
    conversation_momentum: { type: Number, default: 50 },
    exit_urge: { type: Number, default: 0 },
    // legacy
    mental_energy: { type: Number, default: 100 },
    dialogue_benefit: { type: Number, default: 0 },
    fatigue_score: { type: Number, default: 0 },
  },
  memories: [{
    content: { type: String },
    importance: { type: Number },
    timestamp: { type: Date, default: Date.now },
  }],
  npc2npc_impression: [{
    npc_id: { type: String },
    relationship: { type: String },
    summary: { type: String },
    key_impressions: [{ type: String }],
  }],
  dialogue_history: [{
    role: { type: String, enum: ['user', 'assistant'] },
    content: { type: String },
    timestamp: { type: Date, default: Date.now },
  }],
  is_public: { type: Boolean, default: false },
  owner_user_id: { type: Number, default: null },
  background_image: { type: String, default: null },
  chat_background_image: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, {
  _id: false,
  timestamps: false,
  versionKey: false,
});

NpcSchema.index({ scene_id: 1, owner_user_id: 1 });

export const NpcModel = mongoose.model<NpcDoc>('Npc', NpcSchema, 'npcs');
