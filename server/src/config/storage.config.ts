import mongoose from 'mongoose';
import type { StorageConfig, StorageMode } from '@api-sentinel/shared';

export function getStorageConfig(): StorageConfig {
  const rawMode = process.env.STORAGE_MODE?.toLowerCase().trim();

  if (!rawMode) {
    throw new Error(
      'FATAL: STORAGE_MODE is not configured. You must explicitly configure STORAGE_MODE as either "demo" or "mongodb" in environment variables.'
    );
  }

  if (rawMode !== 'demo' && rawMode !== 'mongodb') {
    throw new Error(
      `FATAL: Invalid STORAGE_MODE "${rawMode}". Allowed values are strictly "demo" or "mongodb".`
    );
  }

  const mode = rawMode as StorageMode;
  const mongoUri = process.env.MONGODB_URI?.trim();

  if (mode === 'mongodb' && !mongoUri) {
    throw new Error(
      'FATAL: STORAGE_MODE is set to "mongodb", but MONGODB_URI environment variable is missing.'
    );
  }

  return {
    mode,
    mongoUri,
    isDemo: mode === 'demo',
  };
}

export async function verifyStorageConnectivity(config?: StorageConfig): Promise<void> {
  const activeConfig = config ?? getStorageConfig();

  if (activeConfig.isDemo) {
    // Intentional demo mode: in-memory / local storage active
    return;
  }

  // MongoDB mode: fail-fast if unreachable
  try {
    await mongoose.connect(activeConfig.mongoUri!, {
      serverSelectionTimeoutMS: 1500,
      connectTimeoutMS: 1500,
    });
  } catch (error) {
    await mongoose.disconnect().catch(() => {});
    const err = error as Error;
    throw new Error(
      `FATAL: Failed to connect to MongoDB at "${activeConfig.mongoUri}". STORAGE_MODE is "mongodb", failing fast on startup: ${err.message}`
    );
  }
}
