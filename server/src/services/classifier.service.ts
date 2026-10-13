import type { TestCaseResult, FailureClassification } from '@api-sentinel/shared';

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ECONNRESET',
  'EAI_AGAIN',
  'DNS_RESOLUTION_FAILED',
  'DNS_RESOLUTION_ERROR',
  'EXECUTION_ERROR',
]);

const SSRF_ERROR_CODES = new Set([
  'SSRF_BLOCKED_IP',
  'SSRF_VALIDATION_ERROR',
  'ERR_SSRF_BLOCKED',
  'FORBIDDEN_PROTOCOL',
  'UNAUTHORIZED_TARGET',
]);

export class FailureClassifierService {
  /**
   * Evaluates a test case execution result and returns a deterministic failure classification.
   * Returns null if the test passed.
   */
  public classify(result: TestCaseResult): FailureClassification | null {
    if (result.passed) {
      return null;
    }

    const err = result.error;
    const errCode = err?.code?.toUpperCase();

    // 1. SSRF / Security Policy Violation (Highest precedence)
    if (errCode && SSRF_ERROR_CODES.has(errCode)) {
      return {
        category: 'SSRF_SECURITY_BLOCK',
        reason: `Connection blocked by SSRF defense policy: ${err?.message || 'Access to destination address is prohibited.'}`,
        details: {
          errorCode: err?.code,
          targetUrl: result.request.url,
        },
      };
    }

    // 2. Request Timeout
    if (errCode === 'REQUEST_TIMEOUT' || errCode === 'ETIMEDOUT') {
      return {
        category: 'REQUEST_TIMEOUT',
        reason: err?.message || 'Request timed out before the remote target responded.',
        details: {
          durationMs: result.durationMs,
        },
      };
    }

    // 3. Response Byte Limit Exceeded
    if (
      errCode === 'RESPONSE_PAYLOAD_TOO_LARGE' ||
      errCode === 'PAYLOAD_TOO_LARGE' ||
      errCode === 'ERR_STREAM_PREMATURE_CLOSE'
    ) {
      return {
        category: 'RESPONSE_SIZE_EXCEEDED',
        reason: err?.message?.includes('maximum size limit')
          ? err.message
          : `Response payload exceeded maximum size limit: ${err?.message || 'Byte cap exceeded.'}`,
        details: {
          sizeBytes: result.response?.sizeBytes,
        },
      };
    }

    // 4. Schema Contract Violation
    const schemaAssertion = result.assertions.find(
      (a) => a.name === 'Schema Contract Validation' && !a.passed
    );
    if (schemaAssertion) {
      return {
        category: 'SCHEMA_VALIDATION_VIOLATION',
        reason: schemaAssertion.message,
        details: {
          actual: schemaAssertion.actual,
          expected: schemaAssertion.expected,
        },
      };
    }

    // 5. HTTP Status Code Mismatch
    const statusAssertion = result.assertions.find(
      (a) => a.name === 'Status Code Verification' && !a.passed
    );
    if (statusAssertion) {
      return {
        category: 'HTTP_STATUS_MISMATCH',
        reason: statusAssertion.message,
        details: {
          actualStatusCode: result.response?.statusCode,
          expectedStatus: statusAssertion.expected,
        },
      };
    }

    // 6. Other Failed Assertion (e.g. Content-Type)
    const anyFailedAssertion = result.assertions.find((a) => !a.passed);
    if (anyFailedAssertion) {
      return {
        category: 'SCHEMA_VALIDATION_VIOLATION',
        reason: `${anyFailedAssertion.name} failed: ${anyFailedAssertion.message}`,
        details: {
          assertionName: anyFailedAssertion.name,
          actual: anyFailedAssertion.actual,
          expected: anyFailedAssertion.expected,
        },
      };
    }

    // 7. Transport / Network / DNS Failure (when error code is a network error or connection refused/reset)
    const isNetworkCode = Boolean(errCode && NETWORK_ERROR_CODES.has(errCode));
    if (isNetworkCode || (!result.response && !errCode && err)) {
      return {
        category: 'NETWORK_ERROR',
        reason: `Network transport failure: ${err?.message || 'Connection failed.'}`,
        details: {
          errorCode: err?.code,
        },
      };
    }

    // 8. Fallback / Unknown Failure
    return {
      category: 'UNKNOWN_FAILURE',
      reason: err?.message || 'Test marked as failed without structured assertion or error diagnostics.',
      details: {
        rawError: err,
      },
    };
  }
}
