import { describe, it, expect } from 'vitest';
import { AssertionService } from '../../src/services/assertion.service.js';

describe('AssertionService', () => {
  const assertions = new AssertionService();

  describe('Status Code Assertions', () => {
    it('should pass when status is in allowedCodes', () => {
      const res = assertions.assertStatusCode(200, {
        allowedCodes: [200, 201],
        isInferred: false,
        rationale: 'Documented 2xx',
      });
      expect(res.passed).toBe(true);
      expect(res.name).toBe('Status Code Verification');
    });

    it('should fail when status is not in allowedCodes', () => {
      const res = assertions.assertStatusCode(500, {
        allowedCodes: [200, 201],
        isInferred: false,
        rationale: 'Documented 2xx',
      });
      expect(res.passed).toBe(false);
      expect(res.message).toContain('Expected status code in [200, 201], but received HTTP 500');
    });
  });

  describe('Schema Contract Assertions', () => {
    const schema = {
      type: 'object',
      required: ['id', 'title'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        title: { type: 'string', minLength: 3 },
        count: { type: 'integer' },
      },
    };

    it('should pass when payload complies with JSON Schema and format', () => {
      const validPayload = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Valid Task',
        count: 10,
      };

      const res = assertions.assertResponseSchema(validPayload, schema);
      expect(res.passed).toBe(true);
    });

    it('should fail when required fields are missing', () => {
      const missingFieldPayload = {
        id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const res = assertions.assertResponseSchema(missingFieldPayload, schema);
      expect(res.passed).toBe(false);
      expect(res.message).toContain("must have required property 'title'");
    });

    it('should fail when format or type is violated', () => {
      const invalidFormatPayload = {
        id: 'not-a-valid-uuid',
        title: 'X', // minLength violation
        count: 'not-an-int', // type violation
      };

      const res = assertions.assertResponseSchema(invalidFormatPayload, schema);
      expect(res.passed).toBe(false);
    });

    it('should pass cleanly when no schema is specified', () => {
      const res = assertions.assertResponseSchema({ any: 'data' }, undefined);
      expect(res.passed).toBe(true);
    });
  });

  describe('Content-Type Assertions', () => {
    it('should pass when actual content-type contains expected type', () => {
      const res = assertions.assertContentType(
        { 'content-type': 'application/json; charset=utf-8' },
        'application/json'
      );
      expect(res).not.toBeNull();
      expect(res?.passed).toBe(true);
    });

    it('should fail when content-type does not match', () => {
      const res = assertions.assertContentType(
        { 'content-type': 'text/html' },
        'application/json'
      );
      expect(res).not.toBeNull();
      expect(res?.passed).toBe(false);
    });
  });
});
