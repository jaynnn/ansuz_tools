import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

/**
 * Whiteboard Document Model (MongoDB)
 *
 * Design decisions:
 * - Document-level storage (entire board as one document) rather than element-level.
 *   Pros: atomic writes, simple reads, no cross-document transactions needed.
 *   Cons: 16 MB limit per document; mitigated by capping element count.
 * - `version` field enables optimistic concurrency control (OCC). An update only
 *   succeeds when the caller's version matches the stored version, preventing
 *   stale overwrites in edge cases (e.g. rapid saves from multiple tabs).
 * - Mongoose chosen over native driver for schema validation & default values,
 *   which accelerates development without sacrificing meaningful control for
 *   this single-user, moderate-complexity use case.
 */

export interface WhiteboardElement {
  id: string;
  type: 'rectangle' | 'ellipse' | 'arrow' | 'free_draw' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  points?: number[][];
  text?: string;
}

export interface WhiteboardAppState {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface WhiteboardDoc {
  _id: string;
  docId: string;
  userId: number;
  name: string;
  elements: WhiteboardElement[];
  appState: WhiteboardAppState;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const WhiteboardElementSchema = new Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['rectangle', 'ellipse', 'arrow', 'free_draw', 'text'], required: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  angle: { type: Number, default: 0 },
  strokeColor: { type: String, default: '#000000' },
  backgroundColor: { type: String, default: 'transparent' },
  strokeWidth: { type: Number, default: 2 },
  points: { type: [[Number]], default: undefined },
  text: { type: String, default: undefined },
}, { _id: false });

const WhiteboardSchema = new Schema<WhiteboardDoc>({
  _id: { type: String, default: () => uuidv4() },
  docId: { type: String, required: true, index: true },
  userId: { type: Number, required: true, index: true },
  name: { type: String, default: '未命名白板' },
  elements: { type: [WhiteboardElementSchema], default: [] },
  appState: {
    zoom: { type: Number, default: 1 },
    offsetX: { type: Number, default: 0 },
    offsetY: { type: Number, default: 0 },
  },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  _id: false,
  timestamps: false,
  versionKey: false,
});

// Compound index for fast per-user lookups & OCC writes
WhiteboardSchema.index({ docId: 1, userId: 1 }, { unique: true });

export const WhiteboardModel = mongoose.model<WhiteboardDoc>(
  'Whiteboard',
  WhiteboardSchema,
  'whiteboard_documents',
);
