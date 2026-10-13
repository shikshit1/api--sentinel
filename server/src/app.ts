import express from 'express';
import cors from 'cors';
import { specRouter } from './routes/spec.routes.js';
import { testRouter } from './routes/test.routes.js';
import { errorHandler } from './middleware/error-handler.middleware.js';
import { getStorageConfig } from './config/storage.config.js';

export function createApp() {
  const app = express();

  // Basic security and parsing middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health / status endpoint (also reveals storage mode)
  app.get('/api/health', (_req, res) => {
    let storageInfo: { mode: string; isDemo: boolean } | null = null;
    try {
      const config = getStorageConfig();
      storageInfo = { mode: config.mode, isDemo: config.isDemo };
    } catch {
      storageInfo = null;
    }

    res.status(200).json({
      status: 'ok',
      service: 'api-sentinel',
      storage: storageInfo,
    });
  });

  // Domain routes
  app.use('/api/specs', specRouter);
  app.use('/api/tests', testRouter);

  // Global error handler
  app.use(errorHandler);

  return app;
}
