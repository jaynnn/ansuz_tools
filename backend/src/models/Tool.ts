import mongoose, { Document, Schema } from 'mongoose';

export interface ITool extends Document {
  name: string;
  description: string;
  tags: string[];
  icon?: string;
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const ToolSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  icon: {
    type: String,
    default: '🛠️'
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model<ITool>('Tool', ToolSchema);
