import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { VALID_OPENAPI_YAML } from '../fixtures/sample-specs.js';

describe('Test API Endpoints (/api/tests)', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    process.env.STORAGE_MODE = 'demo';
    app = createApp();
  });

  describe('POST /api/tests/generate', () => {
    it('should generate test suite from raw specContent', async () => {
      const res = await request(app)
        .post('/api/tests/generate')
        .send({ specContent: VALID_OPENAPI_YAML });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.testCases).toBeDefined();
      expect(res.body.data.testCases.length).toBeGreaterThan(0);
      expect(res.body.data.specTitle).toBe('Task Management API');
    });

    it('should return 400 when neither specContent nor spec is provided', async () => {
      const res = await request(app)
        .post('/api/tests/generate')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MISSING_SPEC');
    });
  });

  describe('POST /api/tests/execute (Production SSRF Defense)', () => {
    it('should reject execution against internal or private targets', async () => {
      const res = await request(app)
        .post('/api/tests/execute')
        .send({
          targetBaseUrl: 'http://169.254.169.254',
          testCases: [
            {
              id: 'test_1',
              operationId: 'op1',
              type: 'positive',
              name: 'Test 1',
              description: 'SSRF test',
              method: 'get',
              path: '/meta-data',
              queryParams: {},
              pathParams: {},
              headers: {},
              expectedStatus: {
                allowedCodes: [200],
                isInferred: false,
                rationale: 'Expected 200',
              },
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // The individual test case result must record an SSRF blocked error
      const result = res.body.data.results[0];
      expect(result.passed).toBe(false);
      expect(result.error?.code).toBe('SSRF_BLOCKED_IP');
    });

    it('should return 400 when payload validation fails (e.g. invalid target URL)', async () => {
      const res = await request(app)
        .post('/api/tests/execute')
        .send({
          targetBaseUrl: 'not-a-valid-url',
          testCases: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
