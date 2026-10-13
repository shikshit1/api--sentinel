import type { TestCaseResult, TestRunReport } from './test.types.js';

export type ComparisonClassification =
  | 'REGRESSION'
  | 'FIXED'
  | 'UNCHANGED_PASS'
  | 'UNCHANGED_FAIL'
  | 'ADDED'
  | 'REMOVED'
  | 'INDETERMINATE';

export type FailureCategory =
  | 'HTTP_STATUS_MISMATCH'
  | 'SCHEMA_VALIDATION_VIOLATION'
  | 'REQUEST_TIMEOUT'
  | 'RESPONSE_SIZE_EXCEEDED'
  | 'SSRF_SECURITY_BLOCK'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_FAILURE';

export interface FailureClassification {
  category: FailureCategory;
  reason: string;
  details?: Record<string, unknown>;
}

export interface StatusCodeDiff {
  baselineStatusCode?: number;
  currentStatusCode?: number;
  isRegressed: boolean;
}

export interface SchemaDiff {
  baselineSchemaPassed?: boolean;
  currentSchemaPassed?: boolean;
  isRegressed: boolean;
  details?: string;
}

export interface LatencyDiff {
  baselineLatencyMs?: number;
  currentLatencyMs?: number;
  deltaMs?: number;
  thresholdMs: number;
  isDegraded: boolean;
}

export interface TestCaseComparison {
  testCaseId: string;
  testCaseName: string;
  operationId?: string;
  classification: ComparisonClassification;
  classificationReason: string;
  baselineResult?: TestCaseResult;
  currentResult?: TestCaseResult;
  statusCodeDiff?: StatusCodeDiff;
  schemaDiff?: SchemaDiff;
  latencyDiff?: LatencyDiff;
  failureClassification?: FailureClassification;
}

export interface RegressionSummary {
  totalCompared: number;
  regressions: number;
  fixed: number;
  unchangedPass: number;
  unchangedFail: number;
  added: number;
  removed: number;
  indeterminate: number;
  latencyDegradations: number;
}

export interface RegressionReport {
  baselineRunId?: string;
  currentRunId?: string;
  targetBaseUrl?: string;
  comparedAt: string;
  latencyThresholdMs: number;
  summary: RegressionSummary;
  comparisons: TestCaseComparison[];
}

export interface CompareRunsRequest {
  baselineRun: TestRunReport;
  currentRun: TestRunReport;
  latencyThresholdMs?: number;
}
