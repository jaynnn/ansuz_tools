import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

/**
 * A scene represents a role-playing environment (e.g. Qin Dynasty, Modern City).
 * Each scene contains NPCs and allows the player to define their own character.
 */
export interface SceneDoc {
  _id: string;
  /** Display name of the scene */
  name: string;
  /** Short description shown on the scene card */
  description: string;
  /** Historical era or time period label */
  era: string;
  /** Detailed setting description fed to LLM */
  setting: string;
  /** Thematic keywords */
  theme: string;
  /** RGB color for the scene card gradient [r, g, b] */
  color: number[];
  /** Free-text hint used when generating scene background images */
  background_hint: string;
  /** Language/knowledge constraint injected into every NPC system prompt */
  language_constraints: string;
  /** Background image as base64 or URL; null means no image yet */
  background_image: string | null;
  /**
   * Whether this is a preset (bundled) scene.
   * Preset scenes are visible to all users; custom scenes are private.
   */
  is_preset: boolean;
  /** Owner user id – null for preset scenes */
  owner_user_id: number | null;
  created_at: Date;
  updated_at: Date;
}

const SceneSchema = new Schema<SceneDoc>(
  {
    _id: { type: String, default: () => uuidv4() },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    era: { type: String, default: '' },
    setting: { type: String, default: '' },
    theme: { type: String, default: '' },
    color: [{ type: Number }],
    background_hint: { type: String, default: '' },
    language_constraints: { type: String, default: '' },
    background_image: { type: String, default: null },
    is_preset: { type: Boolean, default: false },
    owner_user_id: { type: Number, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  {
    _id: false,
    timestamps: false,
    versionKey: false,
  },
);

export const SceneModel = mongoose.model<SceneDoc>('Scene', SceneSchema, 'scenes');
