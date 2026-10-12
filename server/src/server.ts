import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { verifyStorageConnectivity, getStorageConfig } from './config/storage.config.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

async function bootstrap() {
  try {
    // 1. Storage connectivity & configuration check
    const storageConfig = getStorageConfig();
    console.log(`[Storage] Initializing storage in mode: ${storageConfig.mode.toUpperCase()}`);
    await verifyStorageConnectivity(storageConfig);
    console.log(`[Storage] Storage verification passed (Demo: ${storageConfig.isDemo})`);

    // 2. Start HTTP server
    const app = createApp();
    app.listen(PORT, () => {
      console.log(`[Server] API Sentinel backend listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    const err = error as Error;
    console.error(`[Server] Fatal startup error: ${err.message}`);
    process.exit(1);
  }
}

bootstrap();
