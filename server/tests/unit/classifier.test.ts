import { describe, it, expect } from 'vitest';
import { FailureClassifierService } from '../../src/services/classifier.service.js';
import type { TestCaseResult } from '@api-sentinel/shared';

describe('FailureClassifierService', () => {
  const classifier = new FailureClassifierService();

  const createBaseResult = (overrides: Partial<TestCaseResult> = {}): TestCaseResult => ({
    testCaseId: 'test_1',
    testCaseName: 'Test Case 1',
    operationId: 'op1',
    type: 'positive',
    passed: false,
    durationMs: 50,
    request: {
      url: 'https://api.example.com/items',
      method: 'get',
      headers: {},
    },
    assertions: [],
    ...overrides,
  });

  it('should return null when the test passed', () => {
    const passedResult = createBaseResult({ passed: true });
    expect(classifier.classify(passedResult)).toBeNull();
  });

  describe('Specific Failure Category Classifications', () => {
    it('should classify SSRF / security block errors with SSRF_SECURITY_BLOCK', () => {
      const res = createBaseResult({
        error: {
          code: 'SSRF_BLOCKED_IP',
          message: 'Direct connection to forbidden IP address 127.0.0.1 is blocked.',
        },
      });

      const classification = classifier.classify(res);
      expect(classification).not.toBeNull();
      expect(classification?.category).toBe('SSRF_SECURITY_BLOCK');
      expect(classification?.reason).toContain('SSRF defense policy');
      expect(classification?.details?.errorCode).toBe('SSRF_BLOCKED_IP');
    });

    it('should classify request timeouts with REQUEST_TIMEOUT', () => {
      const res = createBaseResult({
        durationMs: 5002,
        error: {
          code: 'REQUEST_TIMEOUT',
          message: 'Request timed out after 5000ms.',
        },
      });

      const classification = classifier.classify(res);
      expect(classification).not.toBeNull();
      expect(classification?.category).toBe('REQUEST_TIMEOUT');
      expect(classification?.reason).toContain('timed out');
      expect(classification?.details?.durationMs).toBe(5002);
    });

    it('should classify oversized payloads with RESPONSE_SIZE_EXCEEDED', () => {
      const res = createBaseResult({
        response: {
          statusCode: 200,
          statusText: 'OK',
          headers: {},
          sizeBytes: 1500000,
        },
        error: {
          code: 'RESPONSE_PAYLOAD_TOO_LARGE',
          message: 'Response size limit exceeded (1500000 bytes).',
        },
      });

      const classification = classifier.classify(res);
      expect(classification).not.toBeNull();
      expect(classification?.category).toBe('RESPONSE_SIZE_EXCEEDED');
      expect(classification?.reason).toContain('maximum size limit');
      expect(classification?.details?.sizeBytes).toBe(1500000);
    });

    it('should classify network / transport connection errors with NETWORK_ERROR', () => {
      const res = createBaseResult({
        error: {
          code: 'ECONNREFUSED',
          message: 'connect ECONNREFUSED 198.51.100.1:443',
        },
      });

      const classification = classifier.classify(res);
      expect(classification).not.toBeNull();
      expect(classification?.category).toBe('NETWORK_ERROR');
      expect(classification?.reason).toContain('Network transport failure');
    });

    it('should classify schema violations with SCHEMA_VALIDATION_VIOLATION', () => {
      const res = createBaseResult({
        response: {
          statusCode: 200,
          statusText: 'OK',
          headers: {},
          body: { id: 123 },
          sizeBytes: 20,
        },
        assertions: [
          {
            name: 'Status Code Verification',
            passed: true,
            message: 'Status 200 matched',
          },
          {
            name: 'Schema Contract Validation',
            passed: false,
            message: 'Response body schema violation: /id must be string',
            actual: { id: 123 },
          },
        ],
      });

      const classification = classifier.classify(res);
      expect(classification).not.toBeNull();
      expect(classification?.category).toBe('SCHEMA_VALIDATION_VIOLATION');
      expect(classification?.reason).toContain('/id must be string');
      expect(classification?.details?.actual).toEqual({ id: 123 });
    });

    it('should classify status code mismatches with HTTP_STATUS_MISMATCH', () => {
      const res = createBaseResult({
        response: {
          statusCode: 500,
          statusText: 'Internal Server Error',
          headers: {},
          body: { error: 'DB down' },
          sizeBytes: 50,
        },
        assertions: [
          {
            name: 'Status Code Verification',
            passed: false,
            message: 'Expected status code in [200], but received HTTP 500.',
            actual: 500,
            expected: [200],
          },
        ],
      });

      const classification = classifier.classify(res);
      expect(classification).not.toBeNull();
      expect(classification?.category).toBe('HTTP_STATUS_MISMATCH');
      expect(classification?.reason).toContain('received HTTP 500');
      expect(classification?.details?.actualStatusCode).toBe(500);
    });

    it('should fallback to UNKNOWN_FAILURE when evidence is unclassified', () => {
      const res = createBaseResult({
        error: {
          code: 'STRANGE_CUSTOM_CODE',
          message: 'Some undocumented unexpected error',
        },
        assertions: [],
      });

      const classification = classifier.classify(res);
      expect(classification).not.toBeNull();
      expect(classification?.category).toBe('UNKNOWN_FAILURE');
      expect(classification?.reason).toContain('Some undocumented unexpected error');
    });
  });

  describe('Precedence Order When Multiple Signals Are Present', () => {
    it('should give SSRF_SECURITY_BLOCK precedence over assertion failures', () => {
      const res = createBaseResult({
        error: {
          code: 'SSRF_BLOCKED_IP',
          message: 'Blocked destination address',
        },
        assertions: [
          {
            name: 'Status Code Verification',
            passed: false,
            message: 'Expected 200',
          },
        ],
      });

      const classification = classifier.classify(res);
      expect(classification?.category).toBe('SSRF_SECURITY_BLOCK');
    });

    it('should give REQUEST_TIMEOUT precedence over status assertions', () => {
      const res = createBaseResult({
        error: {
          code: 'REQUEST_TIMEOUT',
          message: 'Timeout occurred',
        },
        assertions: [
          {
            name: 'Status Code Verification',
            passed: false,
            message: 'Status check failed',
          },
        ],
      });

      const classification = classifier.classify(res);
      expect(classification?.category).toBe('REQUEST_TIMEOUT');
    });

    it('should give SCHEMA_VALIDATION_VIOLATION precedence over status assertion if status passed', () => {
      const res = createBaseResult({
        response: {
          statusCode: 200,
          statusText: 'OK',
          headers: {},
          sizeBytes: 100,
        },
        assertions: [
          {
            name: 'Status Code Verification',
            passed: true,
            message: 'Status 200 is allowed',
          },
          {
            name: 'Schema Contract Validation',
            passed: false,
            message: 'Schema violation in items',
          },
        ],
      });

      const classification = classifier.classify(res);
      expect(classification?.category).toBe('SCHEMA_VALIDATION_VIOLATION');
    });
  });
});
