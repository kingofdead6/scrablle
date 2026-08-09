import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB, accountsEnabled } from '../config.js';

let ready = null;

/**
 * Connects once and reuses the connection. Returns false (rather than throwing)
 * when the database isn't configured, so callers can fall back to guest mode.
 */
export async function connectDb() {
  if (!accountsEnabled()) return false;
  if (ready) return ready;

  mongoose.set('strictQuery', true);
  ready = mongoose
    .connect(MONGODB_URI, { dbName: MONGODB_DB, serverSelectionTimeoutMS: 8000 })
    .then(() => {
      console.log(`MongoDB connected (${MONGODB_DB})`);
      return true;
    })
    .catch((err) => {
      console.error('MongoDB connection failed:', err.message);
      ready = null; // let a later call retry
      return false;
    });
  return ready;
}

export const dbUp = () => mongoose.connection.readyState === 1;

export async function disconnectDb() {
  ready = null;
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
