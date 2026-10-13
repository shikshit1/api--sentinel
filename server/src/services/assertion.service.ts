import { Ajv } from 'ajv';
import type { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import type { ExpectedStatus, TestAssertion } from '@api-sentinel/shared';

export class AssertionService {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateFormats: true,
    });
    // Add standard formats (uuid, date-time, email, etc.)
    (addFormats as any)(this.ajv);
  }

  /**
   * Asserts HTTP response status code against expected contract.
   */
  public assertStatusCode(
    actualStatus: number,
    expectedStatus: ExpectedStatus
  ): TestAssertion {
    const isAllowed = expectedStatus.allowedCodes.includes(actualStatus);
    const codeListStr = expectedStatus.allowedCodes.join(', ');

    return {
      name: 'Status Code Verification',
      passed: isAllowed,
      message: isAllowed
        ? `Response status code ${actualStatus} matches expected [${codeListStr}] (${expectedStatus.rationale}).`
        : `Expected status code in [${codeListStr}], but received HTTP ${actualStatus}.`,
      actual: actualStatus,
      expected: expectedStatus.allowedCodes,
    };
  }

  /**
   * Asserts response body against documented OpenAPI JSON Schema.
   */
  public assertResponseSchema(
    responseBody: unknown,
    schema?: Record<string, unknown>
  ): TestAssertion {
    if (!schema || typeof schema !== 'object') {
      return {
        name: 'Schema Contract Validation',
        passed: true,
        message: 'No response schema specified in OpenAPI contract; schema check skipped.',
      };
    }

    try {
      const validate = this.ajv.compile(schema);
      const valid = validate(responseBody);

      if (valid) {
        return {
          name: 'Schema Contract Validation',
          passed: true,
          message: 'Response body payload strictly conforms to OpenAPI response schema.',
        };
      }

      const errors = (validate.errors || [])
        .map((e: ErrorObject) => `${e.instancePath || '/'} ${e.message}`)
        .join('; ');

      return {
        name: 'Schema Contract Validation',
        passed: false,
        message: `Response body schema violation: ${errors}`,
        actual: responseBody,
        expected: schema,
      };
    } catch (compileErr) {
      const err = compileErr as Error;
      return {
        name: 'Schema Contract Validation',
        passed: false,
        message: `Failed to evaluate schema contract (unsupported schema structure): ${err.message}`,
        expected: schema,
      };
    }
  }

  /**
   * Asserts required response headers if expected.
   */
  public assertContentType(
    actualHeaders: Record<string, string>,
    expectedContentType?: string
  ): TestAssertion | null {
    if (!expectedContentType) return null;

    const actualContentType = actualHeaders['content-type'] || actualHeaders['Content-Type'] || '';
    const matches = actualContentType.toLowerCase().includes(expectedContentType.toLowerCase());

    return {
      name: 'Content-Type Verification',
      passed: matches,
      message: matches
        ? `Response content-type "${actualContentType}" matches expected "${expectedContentType}".`
        : `Expected content-type containing "${expectedContentType}", but received "${actualContentType}".`,
      actual: actualContentType,
      expected: expectedContentType,
    };
  }
}
