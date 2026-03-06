import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

/**
 * Represents the player's own character within a specific scene.
 * Each user can have one player character per scene.
 */
export interface PlayerCharacterDoc {
  _id: string;
  /** The scene this character belongs to */
  scene_id: string;
  /** The owner user id */
  user_id: number;
  /** Character name */
  name: string;
  /** Age of the character */
  age: string;
  /** Role/occupation within the scene */
  occupation: string;
  /** Backstory and background */
  background: string;
  /** Personality traits */
  personality: string[];
  /** Goals and motivations */
  goals: string;
  /** Special abilities or skills */
  abilities: string;
  /** Short description used when generating avatar */
  appearance: string;
  /** Avatar image as base64 or URL */
  avatar: string | null;
  created_at: Date;
  updated_at: Date;
}

const PlayerCharacterSchema = new Schema<PlayerCharacterDoc>(
  {
    _id: { type: String, default: () => uuidv4() },
    scene_id: { type: String, required: true },
    user_id: { type: Number, required: true },
    name: { type: String, required: true },
    age: { type: String, default: '' },
    occupation: { type: String, default: '' },
    background: { type: String, default: '' },
    personality: [{ type: String }],
    goals: { type: String, default: '' },
    abilities: { type: String, default: '' },
    appearance: { type: String, default: '' },
    avatar: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  {
    _id: false,
    timestamps: false,
    versionKey: false,
  },
);

// One character per user per scene
PlayerCharacterSchema.index({ scene_id: 1, user_id: 1 }, { unique: true });

export const PlayerCharacterModel = mongoose.model<PlayerCharacterDoc>(
  'PlayerCharacter',
  PlayerCharacterSchema,
  'player_characters',
);
