import type { HttpMethod } from './openapi.types.js';

export type TestCaseType = 'positive' | 'negative' | 'schema_validation';

export type NegativeCategory =
  | 'missing_required_field'
  | 'invalid_type'
  | 'enum_violation'
  | 'boundary_violation';

export interface ExpectedStatus {
  allowedCodes: number[];
  isInferred: boolean;
  rationale: string;
}

export interface GeneratedTestCase {
  id: string;
  operationId: string;
  type: TestCaseType;
  category?: NegativeCategory;
  name: string;
  description: string;
  method: HttpMethod;
  path: string;
  queryParams: Record<string, string | number | boolean>;
  pathParams: Record<string, string | number | boolean>;
  headers: Record<string, string>;
  requestBody?: unknown;
  contentType?: string;
  expectedStatus: ExpectedStatus;
  expectedResponseSchema?: Record<string, unknown>;
}

export interface TestAssertion {
  name: string;
  passed: boolean;
  message: string;
  actual?: unknown;
  expected?: unknown;
}

export interface ExecutionRequestDetails {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: unknown;
}

export interface ExecutionResponseDetails {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body?: unknown;
  sizeBytes: number;
}

export interface TestCaseResult {
  testCaseId: string;
  testCaseName: string;
  operationId: string;
  type: TestCaseType;
  category?: NegativeCategory;
  passed: boolean;
  durationMs: number;
  request: ExecutionRequestDetails;
  response?: ExecutionResponseDetails;
  assertions: TestAssertion[];
  error?: {
    code: string;
    message: string;
  };
}

export interface TestSuite {
  id: string;
  specTitle: string;
  specVersion: string;
  testCases: GeneratedTestCase[];
  createdAt: string;
}

export interface TestRunReport {
  runId: string;
  targetBaseUrl: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalTests: number;
  passed: number;
  failed: number;
  errors: number;
  results: TestCaseResult[];
}

export interface ExecuteSuiteRequest {
  targetBaseUrl: string;
  testCases: GeneratedTestCase[];
  concurrencyLimit?: number;
  timeoutMs?: number;
}
