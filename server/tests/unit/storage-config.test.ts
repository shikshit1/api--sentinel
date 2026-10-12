import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { getStorageConfig, verifyStorageConnectivity } from '../../src/config/storage.config.js';

describe('Storage Configuration and Fail-Fast Connectivity', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.STORAGE_MODE;
    delete process.env.MONGODB_URI;
  });

  afterEach(async () => {
    await mongoose.disconnect().catch(() => {});
    process.env = { ...originalEnv };
  });

  it('should throw fatal error when STORAGE_MODE is missing', () => {
    expect(() => getStorageConfig()).toThrow(/STORAGE_MODE is not configured/);
  });

  it('should throw fatal error when STORAGE_MODE is invalid', () => {
    process.env.STORAGE_MODE = 'invalid_mode';
    expect(() => getStorageConfig()).toThrow(/Invalid STORAGE_MODE "invalid_mode"/);
  });

  it('should allow STORAGE_MODE=demo without requiring MONGODB_URI', async () => {
    process.env.STORAGE_MODE = 'demo';
    const config = getStorageConfig();

    expect(config.mode).toBe('demo');
    expect(config.isDemo).toBe(true);

    // Should resolve without error
    await expect(verifyStorageConnectivity(config)).resolves.toBeUndefined();
  });

  it('should throw fatal error if STORAGE_MODE=mongodb but MONGODB_URI is missing', () => {
    process.env.STORAGE_MODE = 'mongodb';
    expect(() => getStorageConfig()).toThrow(/MONGODB_URI environment variable is missing/);
  });

  it('should fail fast when STORAGE_MODE=mongodb and database is unreachable', async () => {
    process.env.STORAGE_MODE = 'mongodb';
    // Use an invalid host with immediate refusal/timeout
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27099/unreachable_db';
    const config = getStorageConfig();

    expect(config.mode).toBe('mongodb');
    expect(config.isDemo).toBe(false);

    await expect(verifyStorageConnectivity(config)).rejects.toThrow(
      /Failed to connect to MongoDB/
    );
  });
});
