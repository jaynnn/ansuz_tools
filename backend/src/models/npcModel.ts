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

export interface NpcRelationship {
  trust: number;
  intimacy: number;
  respect: number;
  safety: number;
  commitment: number;
}

export interface FatigueState {
  cognitive_load: number;
  mental_energy: number;
  dialogue_benefit: number;
  fatigue_score: number;
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
  impression_features: ImpressionFeature[];
  impression_reactions: ImpressionReaction[];
  relationship: NpcRelationship;
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
  impression_features: [ImpressionFeatureSchema],
  impression_reactions: [ImpressionReactionSchema],
  relationship: {
    trust: { type: Number, default: 10 },
    intimacy: { type: Number, default: 10 },
    respect: { type: Number, default: 10 },
    safety: { type: Number, default: 10 },
    commitment: { type: Number, default: 10 },
  },
  fatigue: {
    cognitive_load: { type: Number, default: 0 },
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

export const NpcModel = mongoose.model<NpcDoc>('Npc', NpcSchema, 'npcs');
