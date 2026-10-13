import { z } from 'zod';

export const expectedStatusSchema = z.object({
  allowedCodes: z.array(z.number().int().min(100).max(599)).min(1),
  isInferred: z.boolean(),
  rationale: z.string().min(1),
});

export const generatedTestCaseSchema = z.object({
  id: z.string().min(1),
  operationId: z.string().min(1),
  type: z.enum(['positive', 'negative', 'schema_validation']),
  category: z
    .enum([
      'missing_required_field',
      'invalid_type',
      'enum_violation',
      'boundary_violation',
    ])
    .optional(),
  name: z.string().min(1),
  description: z.string(),
  method: z.enum(['get', 'post', 'put', 'delete', 'patch', 'options', 'head']),
  path: z.string().min(1),
  queryParams: z.record(z.union([z.string(), z.number(), z.boolean()])),
  pathParams: z.record(z.union([z.string(), z.number(), z.boolean()])),
  headers: z.record(z.string()),
  requestBody: z.unknown().optional(),
  contentType: z.string().optional(),
  expectedStatus: expectedStatusSchema,
  expectedResponseSchema: z.record(z.unknown()).optional(),
});

export const executeSuiteRequestSchema = z.object({
  targetBaseUrl: z.string().url('Target base URL must be a valid URL.'),
  testCases: z.array(generatedTestCaseSchema).min(1, 'At least one test case must be provided.'),
  concurrencyLimit: z.number().int().min(1).max(10).optional().default(3),
  timeoutMs: z.number().int().min(500).max(30000).optional().default(5000),
});
