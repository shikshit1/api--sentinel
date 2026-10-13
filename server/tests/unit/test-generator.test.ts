import { describe, it, expect } from 'vitest';
import { TestGeneratorService } from '../../src/services/test-generator.service.js';
import { SpecParserService } from '../../src/services/spec-parser.service.js';
import { VALID_OPENAPI_YAML, VALID_OPENAPI_JSON } from '../fixtures/sample-specs.js';
import type { NormalizedOperation } from '@api-sentinel/shared';

describe('TestGeneratorService', () => {
  const parser = new SpecParserService();
  const generator = new TestGeneratorService();

  it('should generate positive, negative, and schema validation tests from a valid spec', async () => {
    const spec = await parser.parse(VALID_OPENAPI_YAML);
    const suite = generator.generateSuite(spec);

    expect(suite).toBeDefined();
    expect(suite.testCases.length).toBeGreaterThan(0);

    const positiveTests = suite.testCases.filter((t) => t.type === 'positive');
    const negativeTests = suite.testCases.filter((t) => t.type === 'negative');
    const schemaTests = suite.testCases.filter((t) => t.type === 'schema_validation');

    expect(positiveTests.length).toBeGreaterThanOrEqual(2);
    expect(negativeTests.length).toBeGreaterThanOrEqual(1);
    expect(schemaTests.length).toBeGreaterThanOrEqual(1);

    // Verify positive test structure
    const postTaskPos = positiveTests.find((t) => t.operationId === 'createTask');
    expect(postTaskPos).toBeDefined();
    expect(postTaskPos?.expectedStatus.allowedCodes).toContain(201);
    expect(postTaskPos?.expectedStatus.isInferred).toBe(false);
    expect(postTaskPos?.requestBody).toBeDefined();
    expect((postTaskPos?.requestBody as any).title).toBeDefined();
  });

  it('should generate negative test cases for missing required requestBody properties', async () => {
    const spec = await parser.parse(VALID_OPENAPI_YAML);
    const suite = generator.generateSuite(spec);

    const missingTitleTest = suite.testCases.find(
      (t) => t.operationId === 'createTask' && t.category === 'missing_required_field'
    );

    expect(missingTitleTest).toBeDefined();
    expect(missingTitleTest?.type).toBe('negative');
    expect(missingTitleTest?.category).toBe('missing_required_field');
    expect(missingTitleTest?.requestBody).toBeDefined();
    // The mutated body should NOT have title
    expect((missingTitleTest?.requestBody as any).title).toBeUndefined();
  });

  it('should generate negative test cases for enum violations', () => {
    const operationWithEnum: NormalizedOperation = {
      operationId: 'filterTasks',
      method: 'get',
      path: '/tasks',
      tags: ['tasks'],
      parameters: [
        {
          name: 'status',
          in: 'query',
          required: false,
          schema: {
            type: 'string',
            enum: ['pending', 'completed'],
          },
        },
      ],
      responses: [
        {
          statusCode: '200',
          description: 'OK',
        },
      ],
      servers: [],
    };

    const tests = generator.generateTestsForOperation(operationWithEnum);
    const enumTest = tests.find((t) => t.category === 'enum_violation');

    expect(enumTest).toBeDefined();
    expect(enumTest?.queryParams.status).toBe('INVALID_ENUM_SENTINEL_XYZ');
  });

  it('should generate negative test cases for boundary violations', () => {
    const operationWithBounds: NormalizedOperation = {
      operationId: 'paginateItems',
      method: 'get',
      path: '/items',
      tags: ['items'],
      parameters: [
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: {
            type: 'integer',
            maximum: 100,
          },
        },
      ],
      responses: [
        {
          statusCode: '200',
          description: 'OK',
        },
      ],
      servers: [],
    };

    const tests = generator.generateTestsForOperation(operationWithBounds);
    const boundaryTest = tests.find((t) => t.category === 'boundary_violation');

    expect(boundaryTest).toBeDefined();
    expect(boundaryTest?.queryParams.limit).toBeGreaterThan(100);
  });

  it('should generate negative test cases for invalid data types', () => {
    const operationWithNumber: NormalizedOperation = {
      operationId: 'getItemCount',
      method: 'get',
      path: '/count',
      tags: ['count'],
      parameters: [
        {
          name: 'count',
          in: 'query',
          required: true,
          schema: {
            type: 'integer',
          },
        },
      ],
      responses: [
        {
          statusCode: '200',
          description: 'OK',
        },
        {
          statusCode: '400',
          description: 'Bad Request',
        },
      ],
      servers: [],
    };

    const tests = generator.generateTestsForOperation(operationWithNumber);
    const typeTest = tests.find((t) => t.category === 'invalid_type');

    expect(typeTest).toBeDefined();
    expect(typeTest?.queryParams.count).toBe('not_a_valid_number');
    expect(typeTest?.expectedStatus.allowedCodes).toEqual([400]);
    expect(typeTest?.expectedStatus.isInferred).toBe(false);
  });

  it('should tag inferred status when contract does not document 4xx response', () => {
    const operationWithout4xx: NormalizedOperation = {
      operationId: 'getNoDocErrors',
      method: 'get',
      path: '/nodes',
      tags: ['nodes'],
      parameters: [
        {
          name: 'reqHeader',
          in: 'header',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: [
        {
          statusCode: '200',
          description: 'OK only',
        },
      ],
      servers: [],
    };

    const tests = generator.generateTestsForOperation(operationWithout4xx);
    const missingHeaderTest = tests.find((t) => t.category === 'missing_required_field');

    expect(missingHeaderTest).toBeDefined();
    expect(missingHeaderTest?.expectedStatus.isInferred).toBe(true);
    expect(missingHeaderTest?.expectedStatus.allowedCodes).toEqual([400, 422]);
  });

  it('should handle unsupported or empty schemas gracefully without throwing', () => {
    const operationWithEmptySchema: NormalizedOperation = {
      operationId: 'emptyOperation',
      method: 'get',
      path: '/empty',
      tags: [],
      parameters: [
        {
          name: 'unknownParam',
          in: 'query',
          required: false,
          schema: {} as any, // empty schema
        },
      ],
      responses: [
        {
          statusCode: '204',
          description: 'No Content',
        },
      ],
      servers: [],
    };

    const tests = generator.generateTestsForOperation(operationWithEmptySchema);
    expect(tests.length).toBeGreaterThan(0);
    expect(tests[0].expectedStatus.allowedCodes).toContain(204);
  });
});
