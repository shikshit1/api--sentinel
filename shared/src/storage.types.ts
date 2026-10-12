export type StorageMode = 'demo' | 'mongodb';

export interface StorageConfig {
  mode: StorageMode;
  mongoUri?: string;
  isDemo: boolean;
}
