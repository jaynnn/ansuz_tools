import mongoose from 'mongoose';
import { logInfo, logError } from './logger';

export const connectMongo = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logInfo('mongodb_skipped', { reason: 'MONGODB_URI not set' });
    return;
  }
  try {
    await mongoose.connect(uri);
    logInfo('mongodb_connected', { uri: uri.replace(/\/\/.*@/, '//***@') });
  } catch (err) {
    logError('mongodb_connect_error', err as Error);
    throw err;
  }
};
