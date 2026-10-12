import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import {
  VALID_OPENAPI_YAML,
  VALID_OPENAPI_JSON,
  INVALID_SYNTAX_SPEC,
  INVALID_SCHEMA_SPEC,
} from '../fixtures/sample-specs.js';

describe('Spec API Integration Endpoints', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    process.env.STORAGE_MODE = 'demo';
    app = createApp();
  });

  describe('GET /api/health', () => {
    it('should return health status and storage mode', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('api-sentinel');
      expect(res.body.storage?.mode).toBe('demo');
      expect(res.body.storage?.isDemo).toBe(true);
    });
  });

  describe('POST /api/specs/parse', () => {
    it('should parse valid YAML spec and return normalized operations', async () => {
      const res = await request(app)
        .post('/api/specs/parse')
        .send({ specContent: VALID_OPENAPI_YAML });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Task Management API');
      expect(res.body.data.operationCount).toBe(3);
      expect(Array.isArray(res.body.data.operations)).toBe(true);
      expect(res.body.data.operations.length).toBe(3);
    });

    it('should parse valid JSON spec and return normalized operations', async () => {
      const res = await request(app)
        .post('/api/specs/parse')
        .send({ specContent: VALID_OPENAPI_JSON, sourceFormat: 'json' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Pet Store Simple');
      expect(res.body.data.operationCount).toBe(1);
    });

    it('should return 400 validation error when specContent is missing', async () => {
      const res = await request(app)
        .post('/api/specs/parse')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 validation error when specContent is empty string', async () => {
      const res = await request(app)
        .post('/api/specs/parse')
        .send({ specContent: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 syntax error when spec has invalid YAML/JSON syntax', async () => {
      const res = await request(app)
        .post('/api/specs/parse')
        .send({ specContent: INVALID_SYNTAX_SPEC });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_SYNTAX');
    });

    it('should return 422 schema error when spec is not a valid OpenAPI definition', async () => {
      const res = await request(app)
        .post('/api/specs/parse')
        .send({ specContent: INVALID_SCHEMA_SPEC });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SPEC_VALIDATION_ERROR');
    });
  });
});
