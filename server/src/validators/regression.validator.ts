import { z } from 'zod';

const testAssertionSchema = z.object({
  name: z.string().min(1),
  passed: z.boolean(),
  message: z.string(),
  actual: z.unknown().optional(),
  expected: z.unknown().optional(),
});

const executionRequestDetailsSchema = z.object({
  url: z.string(),
  method: z.enum(['get', 'post', 'put', 'delete', 'patch', 'options', 'head']),
  headers: z.record(z.string()),
  body: z.unknown().optional(),
});

const executionResponseDetailsSchema = z.object({
  statusCode: z.number().int(),
  statusText: z.string(),
  headers: z.record(z.string()),
  body: z.unknown().optional(),
  sizeBytes: z.number().int(),
});

const testCaseResultSchema = z.object({
  testCaseId: z.string(),
  testCaseName: z.string(),
  operationId: z.string(),
  type: z.enum(['positive', 'negative', 'schema_validation']),
  category: z
    .enum([
      'missing_required_field',
      'invalid_type',
      'enum_violation',
      'boundary_violation',
    ])
    .optional(),
  passed: z.boolean(),
  durationMs: z.number(),
  request: executionRequestDetailsSchema,
  response: executionResponseDetailsSchema.optional(),
  assertions: z.array(testAssertionSchema),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export const testRunReportSchema = z.object({
  runId: z.string().optional(),
  targetBaseUrl: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  durationMs: z.number().optional(),
  totalTests: z.number().optional(),
  passed: z.number().optional(),
  failed: z.number().optional(),
  errors: z.number().optional(),
  results: z.array(testCaseResultSchema),
});

export const compareRunsRequestSchema = z.object({
  baselineRun: testRunReportSchema,
  currentRun: testRunReportSchema,
  latencyThresholdMs: z
    .number({ invalid_type_error: 'Field "latencyThresholdMs" must be a number.' })
    .min(0, 'Latency threshold must be greater than or equal to 0ms.')
    .max(60000, 'Latency threshold cannot exceed 60,000ms.')
    .optional(),
});

export type CompareRunsInput = z.infer<typeof compareRunsRequestSchema>;
