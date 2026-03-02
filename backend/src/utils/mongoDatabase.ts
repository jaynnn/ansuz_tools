import mongoose from 'mongoose';
import { logInfo, logError } from './logger';

type SeedFn = () => Promise<void>;
const seedCallbacks: SeedFn[] = [];

export const onMongoConnected = (fn: SeedFn): void => {
  seedCallbacks.push(fn);
};

export const connectMongo = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logInfo('mongodb_skipped', { reason: 'MONGODB_URI not set' });
    return;
  }
  try {
    await mongoose.connect(uri);
    logInfo('mongodb_connected', { uri: uri.replace(/\/\/.*@/, '//***@') });
    // Run seed callbacks once connected
    for (const fn of seedCallbacks) {
      fn().catch(err => logError('mongodb_seed_callback_error', err as Error));
    }
  } catch (err) {
    logError('mongodb_connect_error', err as Error);
    throw err;
  }
};
