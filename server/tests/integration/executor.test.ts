import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestExecutorService } from '../../src/services/executor.service.js';
import { MockTargetApi } from '../fixtures/mock-target-api.js';
import type { GeneratedTestCase } from '@api-sentinel/shared';

describe('TestExecutorService Integration Suite', () => {
  const mockApi = new MockTargetApi();
  let baseUrl: string;

  beforeAll(async () => {
    baseUrl = await mockApi.start();
  });

  afterAll(async () => {
    await mockApi.stop();
  });

  it('should reject localhost execution when allowLoopbackForTesting is false (production defense)', async () => {
    const prodExecutor = new TestExecutorService({ allowLoopbackForTesting: false });

    const dummyTest: GeneratedTestCase = {
      id: 'prod_defense_test',
      operationId: 'listTasks',
      type: 'positive',
      name: 'Loopback Target Test',
      description: 'Tests that loopback is blocked in production mode',
      method: 'get',
      path: '/tasks',
      queryParams: {},
      pathParams: {},
      headers: {},
      expectedStatus: {
        allowedCodes: [200],
        isInferred: false,
        rationale: 'Expected 200',
      },
    };

    const result = await prodExecutor.executeTestCase(dummyTest, baseUrl);
    expect(result.passed).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('SSRF_BLOCKED_IP');
  });

  describe('Isolated Test Target Execution (allowLoopbackForTesting: true)', () => {
    let testExecutor: TestExecutorService;

    beforeAll(() => {
      testExecutor = new TestExecutorService({ allowLoopbackForTesting: true });
    });

    it('should successfully execute a valid positive GET test and pass assertions', async () => {
      const getTasksTest: GeneratedTestCase = {
        id: 'test_get_tasks_success',
        operationId: 'listTasks',
        type: 'positive',
        name: 'Get Tasks Success',
        description: 'Fetches tasks and validates 200 status',
        method: 'get',
        path: '/tasks',
        queryParams: {},
        pathParams: {},
        headers: {},
        expectedStatus: {
          allowedCodes: [200],
          isInferred: false,
          rationale: 'Documented 200',
        },
        expectedResponseSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'title'],
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
            },
          },
        },
      };

      const result = await testExecutor.executeTestCase(getTasksTest, baseUrl);

      expect(result.passed).toBe(true);
      expect(result.response?.statusCode).toBe(200);
      expect(result.assertions.length).toBe(2); // status assertion + schema assertion
      expect(result.assertions.every((a) => a.passed)).toBe(true);
    });

    it('should execute a negative test and pass when target correctly returns 400', async () => {
      const missingTitleTest: GeneratedTestCase = {
        id: 'test_missing_title_neg',
        operationId: 'createTask',
        type: 'negative',
        category: 'missing_required_field',
        name: 'Missing Title in POST /tasks',
        description: 'Sends empty object to trigger 400 Bad Request',
        method: 'post',
        path: '/tasks',
        queryParams: {},
        pathParams: {},
        headers: { 'Content-Type': 'application/json' },
        requestBody: {},
        expectedStatus: {
          allowedCodes: [400],
          isInferred: false,
          rationale: 'Documented 400',
        },
      };

      const result = await testExecutor.executeTestCase(missingTitleTest, baseUrl);

      expect(result.passed).toBe(true);
      expect(result.response?.statusCode).toBe(400);
      expect(result.assertions[0].passed).toBe(true);
    });

    it('should detect schema violations and mark test as failed', async () => {
      const schemaTest: GeneratedTestCase = {
        id: 'test_schema_mismatch',
        operationId: 'getTaskSchemaMismatch',
        type: 'schema_validation',
        name: 'Detect Schema Contract Violation',
        description: 'Endpoint returns numbers where strings are expected in contract',
        method: 'get',
        path: '/tasks/schema-violation',
        queryParams: {},
        pathParams: {},
        headers: {},
        expectedStatus: {
          allowedCodes: [200],
          isInferred: false,
          rationale: 'Expected 200',
        },
        expectedResponseSchema: {
          type: 'object',
          required: ['id', 'title', 'completed'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            completed: { type: 'boolean' },
          },
        },
      };

      const result = await testExecutor.executeTestCase(schemaTest, baseUrl);

      expect(result.passed).toBe(false);
      expect(result.response?.statusCode).toBe(200);
      const schemaAssertion = result.assertions.find(
        (a) => a.name === 'Schema Contract Validation'
      );
      expect(schemaAssertion?.passed).toBe(false);
      expect(schemaAssertion?.message).toContain('Response body schema violation');
    });

    it('should handle request timeout and abort safely', async () => {
      const timeoutTest: GeneratedTestCase = {
        id: 'test_timeout',
        operationId: 'getSlowEndpoint',
        type: 'positive',
        name: 'Timeout Test',
        description: 'Endpoint takes 4000ms, timeout configured to 800ms',
        method: 'get',
        path: '/slow',
        queryParams: {},
        pathParams: {},
        headers: {},
        expectedStatus: {
          allowedCodes: [200],
          isInferred: false,
          rationale: 'Expected 200',
        },
      };

      const result = await testExecutor.executeTestCase(timeoutTest, baseUrl, {
        timeoutMs: 800,
      });

      expect(result.passed).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('REQUEST_TIMEOUT');
    });

    it('should enforce response byte limits and abort on oversized payload', async () => {
      const hugePayloadTest: GeneratedTestCase = {
        id: 'test_huge_payload',
        operationId: 'getHugePayload',
        type: 'positive',
        name: 'Oversized Payload Test',
        description: 'Endpoint returns 1.5MB, limit set to 64KB',
        method: 'get',
        path: '/huge',
        queryParams: {},
        pathParams: {},
        headers: {},
        expectedStatus: {
          allowedCodes: [200],
          isInferred: false,
          rationale: 'Expected 200',
        },
      };

      const result = await testExecutor.executeTestCase(hugePayloadTest, baseUrl, {
        maxResponseBytes: 64 * 1024, // 64 KB limit
      });

      expect(result.passed).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('RESPONSE_PAYLOAD_TOO_LARGE');
    });

    it('should disable redirects by default (returns 302 directly rather than following)', async () => {
      const redirectTest: GeneratedTestCase = {
        id: 'test_redirect_block',
        operationId: 'getRedirect',
        type: 'positive',
        name: 'Redirect Block Test',
        description: 'Verifies redirects are not followed automatically',
        method: 'get',
        path: '/redirect',
        queryParams: {},
        pathParams: {},
        headers: {},
        expectedStatus: {
          allowedCodes: [302],
          isInferred: false,
          rationale: 'Verify redirect is not followed',
        },
      };

      const result = await testExecutor.executeTestCase(redirectTest, baseUrl);

      expect(result.response?.statusCode).toBe(302);
      expect(result.passed).toBe(true);
    });

    it('should redact sensitive authorization headers and secret payload fields', async () => {
      const sensitiveTest: GeneratedTestCase = {
        id: 'test_redaction',
        operationId: 'postAuthSensitive',
        type: 'positive',
        name: 'Redaction Test',
        description: 'Ensures Authorization header and passwords are never logged',
        method: 'post',
        path: '/tasks',
        queryParams: {},
        pathParams: {},
        headers: {
          Authorization: 'Bearer super-secret-jwt-token-12345',
          'X-Api-Key': 'private-api-key-999',
        },
        requestBody: {
          title: 'Secure Task',
          password: 'plain-text-secret-password',
        },
        expectedStatus: {
          allowedCodes: [201],
          isInferred: false,
          rationale: 'Expected 201',
        },
      };

      const result = await testExecutor.executeTestCase(sensitiveTest, baseUrl);

      // Verify request headers were redacted
      expect(result.request.headers['Authorization']).toBe('[REDACTED]');
      expect(result.request.headers['X-Api-Key']).toBe('[REDACTED]');

      // Verify request body password was redacted
      const recordedBody = result.request.body as Record<string, unknown>;
      expect(recordedBody.password).toBe('[REDACTED]');
      expect(recordedBody.title).toBe('Secure Task');
    });

    it('should execute a suite concurrently with batch limits', async () => {
      const suiteTests: GeneratedTestCase[] = Array.from({ length: 6 }, (_, i) => ({
        id: `batch_test_${i}`,
        operationId: 'listTasks',
        type: 'positive',
        name: `Batch Test ${i}`,
        description: 'Concurrent suite execution test',
        method: 'get',
        path: '/tasks',
        queryParams: {},
        pathParams: {},
        headers: {},
        expectedStatus: {
          allowedCodes: [200],
          isInferred: false,
          rationale: 'Expected 200',
        },
      }));

      const report = await testExecutor.executeSuite(suiteTests, baseUrl, {
        concurrencyLimit: 2,
      });

      expect(report.totalTests).toBe(6);
      expect(report.passed).toBe(6);
      expect(report.failed).toBe(0);
      expect(report.results.length).toBe(6);
      expect(report.durationMs).toBeGreaterThan(0);
    });
  });
});
