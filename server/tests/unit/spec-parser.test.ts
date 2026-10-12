import { describe, it, expect } from 'vitest';
import { SpecParserService, SpecParserError } from '../../src/services/spec-parser.service.js';
import {
  VALID_OPENAPI_YAML,
  VALID_OPENAPI_JSON,
  INVALID_SYNTAX_SPEC,
  INVALID_SCHEMA_SPEC,
} from '../fixtures/sample-specs.js';

describe('SpecParserService', () => {
  const parser = new SpecParserService();

  it('should parse and dereference a valid OpenAPI 3.0 YAML specification', async () => {
    const result = await parser.parse(VALID_OPENAPI_YAML);

    expect(result).toBeDefined();
    expect(result.title).toBe('Task Management API');
    expect(result.version).toBe('1.0.0');
    expect(result.openapiVersion).toBe('3.0.3');
    expect(result.servers).toEqual(['https://api.example.com/v1']);
    expect(result.operationCount).toBe(3);

    // Verify GET /tasks operation
    const getTasks = result.operations.find(
      (op) => op.path === '/tasks' && op.method === 'get'
    );
    expect(getTasks).toBeDefined();
    expect(getTasks?.operationId).toBe('listTasks');
    expect(getTasks?.parameters.length).toBe(1);
    expect(getTasks?.parameters[0].name).toBe('status');
    expect(getTasks?.parameters[0].in).toBe('query');

    // Verify dereferenced schema in 200 response
    const res200 = getTasks?.responses.find((r) => r.statusCode === '200');
    expect(res200).toBeDefined();
    expect(res200?.schema).toBeDefined();
    // In dereferenced schema, items should contain the dereferenced Task object properties
    expect((res200?.schema as any).items?.properties?.title).toBeDefined();

    // Verify POST /tasks with requestBody
    const postTask = result.operations.find(
      (op) => op.path === '/tasks' && op.method === 'post'
    );
    expect(postTask).toBeDefined();
    expect(postTask?.requestBody).toBeDefined();
    expect(postTask?.requestBody?.required).toBe(true);
    expect(postTask?.requestBody?.contentType).toBe('application/json');
    expect((postTask?.requestBody?.schema as any)?.properties?.title).toBeDefined();

    // Verify path-level parameter inheritance on /tasks/{id}
    const getTaskById = result.operations.find(
      (op) => op.path === '/tasks/{id}' && op.method === 'get'
    );
    expect(getTaskById).toBeDefined();
    expect(getTaskById?.parameters.some((p) => p.name === 'id' && p.in === 'path')).toBe(true);
  });

  it('should parse a valid OpenAPI JSON specification', async () => {
    const result = await parser.parse(VALID_OPENAPI_JSON);

    expect(result.title).toBe('Pet Store Simple');
    expect(result.operationCount).toBe(1);
    expect(result.operations[0].path).toBe('/pets');
    expect(result.operations[0].method).toBe('get');
    expect(result.operations[0].operationId).toBe('findPets');
  });

  it('should reject empty or whitespace-only content with EMPTY_SPEC_CONTENT', async () => {
    await expect(parser.parse('   ')).rejects.toThrow(SpecParserError);
    await expect(parser.parse('')).rejects.toMatchObject({
      code: 'EMPTY_SPEC_CONTENT',
    });
  });

  it('should reject malformed syntax with INVALID_SYNTAX', async () => {
    await expect(parser.parse(INVALID_SYNTAX_SPEC)).rejects.toMatchObject({
      code: 'INVALID_SYNTAX',
    });
  });

  it('should reject non-OpenAPI schemas with SPEC_VALIDATION_ERROR', async () => {
    await expect(parser.parse(INVALID_SCHEMA_SPEC)).rejects.toMatchObject({
      code: 'SPEC_VALIDATION_ERROR',
    });
  });
});
