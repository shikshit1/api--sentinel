import type {
  GeneratedTestCase,
  NormalizedOperation,
  ParsedSpecSummary,
  ExpectedStatus,
  TestSuite,
} from '@api-sentinel/shared';
import { generatedTestCaseSchema } from '../validators/test-case.validator.js';

export class TestGeneratorService {
  /**
   * Generates a deterministic suite of test cases for all operations in a spec.
   */
  public generateSuite(spec: ParsedSpecSummary): TestSuite {
    const testCases: GeneratedTestCase[] = [];

    for (const operation of spec.operations) {
      const opTests = this.generateTestsForOperation(operation);
      testCases.push(...opTests);
    }

    return {
      id: `suite_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      specTitle: spec.title,
      specVersion: spec.version,
      testCases,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Generates deterministic test cases for an individual operation.
   */
  public generateTestsForOperation(operation: NormalizedOperation): GeneratedTestCase[] {
    const generated: GeneratedTestCase[] = [];

    // 1. Positive Test Case
    const positiveTest = this.buildPositiveTestCase(operation);
    if (positiveTest) {
      generated.push(this.validateTestCase(positiveTest));
    }

    // 2. Negative Test Cases
    const negativeTests = this.buildNegativeTestCases(operation);
    for (const neg of negativeTests) {
      generated.push(this.validateTestCase(neg));
    }

    // 3. Schema Validation Test Case (if 2xx response schema exists)
    const schemaTest = this.buildSchemaValidationTestCase(operation);
    if (schemaTest) {
      generated.push(this.validateTestCase(schemaTest));
    }

    return generated;
  }

  private validateTestCase(testCase: GeneratedTestCase): GeneratedTestCase {
    const parseResult = generatedTestCaseSchema.safeParse(testCase);
    if (!parseResult.success) {
      throw new Error(
        `Generated test case failed validation: ${parseResult.error.message} (Test ID: ${testCase.id})`
      );
    }
    return parseResult.data as GeneratedTestCase;
  }

  /**
   * Builds positive test case with valid inputs adhering to the spec.
   */
  private buildPositiveTestCase(operation: NormalizedOperation): GeneratedTestCase | null {
    const { pathParams, queryParams, headers } = this.buildDefaultParameters(operation);

    let requestBody: unknown = undefined;
    let contentType: string | undefined = undefined;

    if (operation.requestBody) {
      contentType = operation.requestBody.contentType || 'application/json';
      requestBody = this.generateSampleFromSchema(
        operation.requestBody.schema,
        operation.requestBody.example
      );
    }

    const expectedStatus = this.resolveExpectedPositiveStatus(operation);

    return {
      id: `${operation.operationId}_pos_contract`,
      operationId: operation.operationId,
      type: 'positive',
      name: `${operation.operationId} - Happy Path Contract Test`,
      description: `Executes a valid ${operation.method.toUpperCase()} ${operation.path} request with compliant parameters and payload.`,
      method: operation.method,
      path: operation.path,
      pathParams,
      queryParams,
      headers,
      requestBody,
      contentType,
      expectedStatus,
    };
  }

  /**
   * Builds schema validation test case if a 2xx response defines a JSON schema contract.
   */
  private buildSchemaValidationTestCase(operation: NormalizedOperation): GeneratedTestCase | null {
    const primary2xx = operation.responses.find(
      (r) => r.statusCode.startsWith('2') && r.schema && typeof r.schema === 'object'
    );

    if (!primary2xx || !primary2xx.schema) {
      return null;
    }

    const { pathParams, queryParams, headers } = this.buildDefaultParameters(operation);

    let requestBody: unknown = undefined;
    let contentType: string | undefined = undefined;

    if (operation.requestBody) {
      contentType = operation.requestBody.contentType || 'application/json';
      requestBody = this.generateSampleFromSchema(
        operation.requestBody.schema,
        operation.requestBody.example
      );
    }

    const codeNum = parseInt(primary2xx.statusCode, 10);
    const expectedStatus: ExpectedStatus = {
      allowedCodes: [isNaN(codeNum) ? 200 : codeNum],
      isInferred: false,
      rationale: `Validates response payload conforms to documented schema for HTTP ${primary2xx.statusCode}.`,
    };

    return {
      id: `${operation.operationId}_schema_val`,
      operationId: operation.operationId,
      type: 'schema_validation',
      name: `${operation.operationId} - Response Contract Schema Validation`,
      description: `Asserts that the response matches the JSON Schema contract specified for status ${primary2xx.statusCode}.`,
      method: operation.method,
      path: operation.path,
      pathParams,
      queryParams,
      headers,
      requestBody,
      contentType,
      expectedStatus,
      expectedResponseSchema: primary2xx.schema,
    };
  }

  /**
   * Builds deterministic negative test cases for contract violations.
   */
  private buildNegativeTestCases(operation: NormalizedOperation): GeneratedTestCase[] {
    const tests: GeneratedTestCase[] = [];
    const expectedStatus = this.resolveExpectedNegativeStatus(operation);

    // 1. Missing required query or header parameters
    for (const param of operation.parameters) {
      if (param.required && (param.in === 'query' || param.in === 'header')) {
        const { pathParams, queryParams, headers } = this.buildDefaultParameters(operation);
        if (param.in === 'query') {
          delete queryParams[param.name];
        } else if (param.in === 'header') {
          delete headers[param.name];
        }

        tests.push({
          id: `${operation.operationId}_neg_missing_${param.in}_${param.name}`,
          operationId: operation.operationId,
          type: 'negative',
          category: 'missing_required_field',
          name: `${operation.operationId} - Missing required ${param.in} '${param.name}'`,
          description: `Omits required ${param.in} parameter '${param.name}' to verify input validation rejection.`,
          method: operation.method,
          path: operation.path,
          pathParams,
          queryParams,
          headers,
          requestBody: operation.requestBody
            ? this.generateSampleFromSchema(operation.requestBody.schema, operation.requestBody.example)
            : undefined,
          contentType: operation.requestBody?.contentType || 'application/json',
          expectedStatus,
        });
      }
    }

    // 2. Missing required requestBody fields
    if (operation.requestBody?.schema && typeof operation.requestBody.schema === 'object') {
      const bodySchema = operation.requestBody.schema;
      const requiredFields: string[] = Array.isArray(bodySchema.required)
        ? bodySchema.required
        : [];

      for (const field of requiredFields) {
        const { pathParams, queryParams, headers } = this.buildDefaultParameters(operation);
        const fullBody = (this.generateSampleFromSchema(bodySchema, operation.requestBody.example) || {}) as Record<string, unknown>;
        const mutatedBody = { ...fullBody };
        delete mutatedBody[field];

        tests.push({
          id: `${operation.operationId}_neg_missing_body_${field}`,
          operationId: operation.operationId,
          type: 'negative',
          category: 'missing_required_field',
          name: `${operation.operationId} - Missing required body property '${field}'`,
          description: `Omits required property '${field}' from request body to verify validation error.`,
          method: operation.method,
          path: operation.path,
          pathParams,
          queryParams,
          headers,
          requestBody: mutatedBody,
          contentType: operation.requestBody.contentType || 'application/json',
          expectedStatus,
        });
      }
    }

    // 3. Invalid Types for Parameters (e.g. string for integer)
    for (const param of operation.parameters) {
      if (param.schema && typeof param.schema === 'object') {
        const pType = param.schema.type;
        if (pType === 'integer' || pType === 'number') {
          const { pathParams, queryParams, headers } = this.buildDefaultParameters(operation);
          if (param.in === 'query') {
            queryParams[param.name] = 'not_a_valid_number';
          } else if (param.in === 'path') {
            pathParams[param.name] = 'not_a_valid_number';
          } else if (param.in === 'header') {
            headers[param.name] = 'not_a_valid_number';
          }

          tests.push({
            id: `${operation.operationId}_neg_invalid_type_${param.in}_${param.name}`,
            operationId: operation.operationId,
            type: 'negative',
            category: 'invalid_type',
            name: `${operation.operationId} - Invalid type for ${param.in} '${param.name}' (string for ${pType})`,
            description: `Supplies string value for numeric parameter '${param.name}' to verify type checking.`,
            method: operation.method,
            path: operation.path,
            pathParams,
            queryParams,
            headers,
            requestBody: operation.requestBody
              ? this.generateSampleFromSchema(operation.requestBody.schema, operation.requestBody.example)
              : undefined,
            contentType: operation.requestBody?.contentType || 'application/json',
            expectedStatus,
          });
        }
      }
    }

    // 4. Invalid Types in Request Body
    if (operation.requestBody?.schema && typeof operation.requestBody.schema === 'object') {
      const bodySchema = operation.requestBody.schema;
      const properties = (bodySchema.properties || {}) as Record<string, Record<string, unknown>>;

      for (const [propName, propSchema] of Object.entries(properties)) {
        if (propSchema?.type === 'integer' || propSchema?.type === 'number') {
          const { pathParams, queryParams, headers } = this.buildDefaultParameters(operation);
          const fullBody = (this.generateSampleFromSchema(bodySchema, operation.requestBody.example) || {}) as Record<string, unknown>;
          const mutatedBody = { ...fullBody, [propName]: 'invalid_string_instead_of_number' };

          tests.push({
            id: `${operation.operationId}_neg_invalid_type_body_${propName}`,
            operationId: operation.operationId,
            type: 'negative',
            category: 'invalid_type',
            name: `${operation.operationId} - Invalid type for body property '${propName}'`,
            description: `Sends string for numeric field '${propName}' to verify request body rejection.`,
            method: operation.method,
            path: operation.path,
            pathParams,
            queryParams,
            headers,
            requestBody: mutatedBody,
            contentType: operation.requestBody.contentType || 'application/json',
            expectedStatus,
          });
          break; // One type violation per operation is sufficient and clean
        }
      }
    }

    // 5. Enum Violations
    for (const param of operation.parameters) {
      if (param.schema && Array.isArray(param.schema.enum) && param.schema.enum.length > 0) {
        const { pathParams, queryParams, headers } = this.buildDefaultParameters(operation);
        const invalidEnumValue = 'INVALID_ENUM_SENTINEL_XYZ';

        if (param.in === 'query') {
          queryParams[param.name] = invalidEnumValue;
        } else if (param.in === 'path') {
          pathParams[param.name] = invalidEnumValue;
        } else if (param.in === 'header') {
          headers[param.name] = invalidEnumValue;
        }

        tests.push({
          id: `${operation.operationId}_neg_enum_${param.in}_${param.name}`,
          operationId: operation.operationId,
          type: 'negative',
          category: 'enum_violation',
          name: `${operation.operationId} - Enum violation for ${param.in} '${param.name}'`,
          description: `Supplies unlisted value '${invalidEnumValue}' for enum '${param.name}'.`,
          method: operation.method,
          path: operation.path,
          pathParams,
          queryParams,
          headers,
          requestBody: operation.requestBody
            ? this.generateSampleFromSchema(operation.requestBody.schema, operation.requestBody.example)
            : undefined,
          contentType: operation.requestBody?.contentType || 'application/json',
          expectedStatus,
        });
      }
    }

    // 6. Boundary Violations
    for (const param of operation.parameters) {
      if (param.schema && typeof param.schema === 'object') {
        const s = param.schema;
        let outOfBoundsVal: string | number | undefined = undefined;

        if (typeof s.maximum === 'number') {
          outOfBoundsVal = s.maximum + 999999;
        } else if (typeof s.minimum === 'number') {
          outOfBoundsVal = s.minimum - 999999;
        } else if (typeof s.minLength === 'number' && s.minLength > 1) {
          outOfBoundsVal = '';
        }

        if (outOfBoundsVal !== undefined) {
          const { pathParams, queryParams, headers } = this.buildDefaultParameters(operation);
          if (param.in === 'query') {
            queryParams[param.name] = outOfBoundsVal;
          } else if (param.in === 'path') {
            pathParams[param.name] = outOfBoundsVal;
          }

          tests.push({
            id: `${operation.operationId}_neg_boundary_${param.in}_${param.name}`,
            operationId: operation.operationId,
            type: 'negative',
            category: 'boundary_violation',
            name: `${operation.operationId} - Boundary violation for ${param.in} '${param.name}'`,
            description: `Supplies out-of-bounds value '${outOfBoundsVal}' for '${param.name}'.`,
            method: operation.method,
            path: operation.path,
            pathParams,
            queryParams,
            headers,
            requestBody: operation.requestBody
              ? this.generateSampleFromSchema(operation.requestBody.schema, operation.requestBody.example)
              : undefined,
            contentType: operation.requestBody?.contentType || 'application/json',
            expectedStatus,
          });
        }
      }
    }

    return tests;
  }

  /**
   * Resolves expected status codes for positive tests.
   */
  private resolveExpectedPositiveStatus(operation: NormalizedOperation): ExpectedStatus {
    const doc2xx = operation.responses
      .filter((r) => r.statusCode.startsWith('2'))
      .map((r) => parseInt(r.statusCode, 10))
      .filter((code) => !isNaN(code));

    if (doc2xx.length > 0) {
      return {
        allowedCodes: doc2xx,
        isInferred: false,
        rationale: `Matches documented 2xx response status: [${doc2xx.join(', ')}]`,
      };
    }

    // Spec does not define a 2xx response (only default or error codes)
    return {
      allowedCodes: [200, 201, 204],
      isInferred: true,
      rationale:
        'OpenAPI specification does not explicitly define a 2xx response status; inferred standard success codes [200, 201, 204].',
    };
  }

  /**
   * Resolves expected status codes for negative tests without inventing promises.
   */
  private resolveExpectedNegativeStatus(operation: NormalizedOperation): ExpectedStatus {
    const doc4xx = operation.responses
      .filter((r) => r.statusCode.startsWith('4'))
      .map((r) => parseInt(r.statusCode, 10))
      .filter((code) => !isNaN(code));

    if (doc4xx.length > 0) {
      return {
        allowedCodes: doc4xx,
        isInferred: false,
        rationale: `Matches documented 4xx error status in OpenAPI contract: [${doc4xx.join(', ')}]`,
      };
    }

    // Contract did not document negative responses
    return {
      allowedCodes: [400, 422],
      isInferred: true,
      rationale:
        'Contract does not explicitly document a 4xx error status for this operation; inferred standard client error codes [400, 422].',
    };
  }

  /**
   * Builds default parameter values for an operation.
   */
  private buildDefaultParameters(operation: NormalizedOperation): {
    pathParams: Record<string, string | number | boolean>;
    queryParams: Record<string, string | number | boolean>;
    headers: Record<string, string>;
  } {
    const pathParams: Record<string, string | number | boolean> = {};
    const queryParams: Record<string, string | number | boolean> = {};
    const headers: Record<string, string> = {};

    for (const param of operation.parameters) {
      const val = this.generateSampleFromSchema(param.schema, param.example);
      const safeVal = (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
        ? val
        : String(val ?? 'sample');

      if (param.in === 'path') {
        pathParams[param.name] = safeVal;
      } else if (param.in === 'query') {
        if (param.required || val !== undefined) {
          queryParams[param.name] = safeVal;
        }
      } else if (param.in === 'header') {
        if (param.required) {
          headers[param.name] = String(safeVal);
        }
      }
    }

    return { pathParams, queryParams, headers };
  }

  /**
   * Deterministically generates sample data from a JSON schema and example.
   */
  public generateSampleFromSchema(
    schema?: Record<string, unknown>,
    example?: unknown
  ): unknown {
    if (example !== undefined && example !== null) {
      return example;
    }

    if (!schema || typeof schema !== 'object') {
      return 'sample_data';
    }

    if (schema.default !== undefined) {
      return schema.default;
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      return schema.enum[0];
    }

    const type = schema.type;

    if (type === 'string') {
      const format = schema.format;
      if (format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
      if (format === 'date-time') return '2026-01-01T00:00:00.000Z';
      if (format === 'date') return '2026-01-01';
      if (format === 'email') return 'sentinel@example.com';
      if (typeof schema.minLength === 'number' && schema.minLength > 5) {
        return 'sample_long_string'.padEnd(schema.minLength, '_');
      }
      return 'sample_string';
    }

    if (type === 'integer' || type === 'number') {
      if (typeof schema.minimum === 'number') {
        return schema.minimum;
      }
      return type === 'integer' ? 1 : 1.5;
    }

    if (type === 'boolean') {
      return true;
    }

    if (type === 'array') {
      const itemsSchema = schema.items as Record<string, unknown> | undefined;
      return [this.generateSampleFromSchema(itemsSchema, undefined)];
    }

    if (type === 'object' || schema.properties) {
      const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
      const requiredList = Array.isArray(schema.required) ? schema.required : [];
      const result: Record<string, unknown> = {};

      for (const [key, propSchema] of Object.entries(properties)) {
        if (requiredList.includes(key) || propSchema.default !== undefined || propSchema.example !== undefined) {
          result[key] = this.generateSampleFromSchema(propSchema, propSchema.example);
        }
      }

      // If no properties were required or found, provide at least required fields
      for (const reqKey of requiredList) {
        if (result[reqKey] === undefined) {
          result[reqKey] = 'sample_value';
        }
      }

      return result;
    }

    // Fallback for unsupported or ambiguous schemas
    return 'sample_data';
  }
}
