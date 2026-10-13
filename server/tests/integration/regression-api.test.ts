import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { TestRunReport } from '@api-sentinel/shared';

describe('Regression Comparison API Endpoints (/api/regressions)', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    process.env.STORAGE_MODE = 'demo';
    app = createApp();
  });

  const createDummyReport = (runId: string, passed: boolean, statusCode = 200): TestRunReport => ({
    runId,
    targetBaseUrl: 'https://api.example.com',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 250,
    totalTests: 1,
    passed: passed ? 1 : 0,
    failed: passed ? 0 : 1,
    errors: 0,
    results: [
      {
        testCaseId: 'user_profile_get',
        testCaseName: 'Get User Profile',
        operationId: 'getUserProfile',
        type: 'positive',
        passed,
        durationMs: 120,
        request: {
          url: 'https://api.example.com/user',
          method: 'get',
          headers: {},
        },
        response: {
          statusCode,
          statusText: statusCode === 200 ? 'OK' : 'Internal Server Error',
          headers: {},
          sizeBytes: 128,
        },
        assertions: [
          {
            name: 'Status Code Verification',
            passed,
            message: passed ? 'Status 200 matched' : 'Expected 200, got 500',
          },
        ],
        error: passed ? undefined : { code: 'EXECUTION_ERROR', message: 'HTTP 500' },
      },
    ],
  });

  describe('POST /api/regressions/compare', () => {
    it('should compare baseline and current runs and detect regression with status 200', async () => {
      const baselineRun = createDummyReport('run_base', true, 200);
      const currentRun = createDummyReport('run_curr', false, 500);

      const res = await request(app)
        .post('/api/regressions/compare')
        .send({
          baselineRun,
          currentRun,
          latencyThresholdMs: 300,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.baselineRunId).toBe('run_base');
      expect(res.body.data.currentRunId).toBe('run_curr');
      expect(res.body.data.summary.regressions).toBe(1);
      expect(res.body.data.summary.fixed).toBe(0);

      const comparison = res.body.data.comparisons[0];
      expect(comparison.testCaseId).toBe('user_profile_get');
      expect(comparison.classification).toBe('REGRESSION');
      expect(comparison.statusCodeDiff?.isRegressed).toBe(true);
      expect(comparison.failureClassification?.category).toBe('HTTP_STATUS_MISMATCH');
    });

    it('should return 400 VALIDATION_ERROR when baselineRun is missing', async () => {
      const res = await request(app)
        .post('/api/regressions/compare')
        .send({
          currentRun: createDummyReport('run_curr', true),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR when latencyThresholdMs is negative', async () => {
      const res = await request(app)
        .post('/api/regressions/compare')
        .send({
          baselineRun: createDummyReport('run_base', true),
          currentRun: createDummyReport('run_curr', true),
          latencyThresholdMs: -10, // Invalid negative threshold
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
