import { describe, it, expect } from 'vitest';
import { RegressionService } from '../../src/services/regression.service.js';
import type { TestRunReport, TestCaseResult } from '@api-sentinel/shared';

describe('RegressionService', () => {
  const regressionService = new RegressionService({ defaultLatencyThresholdMs: 200 });

  const makeResult = (
    id: string,
    passed: boolean,
    durationMs: number = 100,
    statusCode: number = 200,
    schemaPassed: boolean = true
  ): TestCaseResult => ({
    testCaseId: id,
    testCaseName: `Test ${id}`,
    operationId: 'op1',
    type: 'positive',
    passed,
    durationMs,
    request: {
      url: `https://api.example.com/${id}`,
      method: 'get',
      headers: {},
    },
    response: {
      statusCode,
      statusText: statusCode === 200 ? 'OK' : 'Error',
      headers: {},
      sizeBytes: 150,
    },
    assertions: [
      {
        name: 'Status Code Verification',
        passed: statusCode === 200,
        message: `Status was ${statusCode}`,
      },
      {
        name: 'Schema Contract Validation',
        passed: schemaPassed,
        message: schemaPassed ? 'Schema valid' : 'Schema contract violated',
      },
    ],
  });

  const makeReport = (runId: string, results: TestCaseResult[]): TestRunReport => ({
    runId,
    targetBaseUrl: 'https://api.example.com',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 500,
    totalTests: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    errors: 0,
    results,
  });

  describe('Core State Transition Classifications', () => {
    it('should classify passing → failing as REGRESSION', () => {
      const baseline = makeReport('run_1', [makeResult('t1', true, 100, 200)]);
      const current = makeReport('run_2', [makeResult('t1', false, 120, 500)]);

      const report = regressionService.compareRuns(baseline, current);

      expect(report.summary.regressions).toBe(1);
      expect(report.summary.fixed).toBe(0);
      const comp = report.comparisons.find((c) => c.testCaseId === 't1');
      expect(comp?.classification).toBe('REGRESSION');
      expect(comp?.statusCodeDiff?.isRegressed).toBe(true);
      expect(comp?.statusCodeDiff?.baselineStatusCode).toBe(200);
      expect(comp?.statusCodeDiff?.currentStatusCode).toBe(500);
    });

    it('should classify failing → passing as FIXED', () => {
      const baseline = makeReport('run_1', [makeResult('t1', false, 100, 500)]);
      const current = makeReport('run_2', [makeResult('t1', true, 110, 200)]);

      const report = regressionService.compareRuns(baseline, current);

      expect(report.summary.fixed).toBe(1);
      expect(report.summary.regressions).toBe(0);
      const comp = report.comparisons.find((c) => c.testCaseId === 't1');
      expect(comp?.classification).toBe('FIXED');
    });

    it('should classify passing → passing as UNCHANGED_PASS', () => {
      const baseline = makeReport('run_1', [makeResult('t1', true, 100, 200)]);
      const current = makeReport('run_2', [makeResult('t1', true, 105, 200)]);

      const report = regressionService.compareRuns(baseline, current);

      expect(report.summary.unchangedPass).toBe(1);
      const comp = report.comparisons.find((c) => c.testCaseId === 't1');
      expect(comp?.classification).toBe('UNCHANGED_PASS');
    });

    it('should classify failing → failing as UNCHANGED_FAIL', () => {
      const baseline = makeReport('run_1', [makeResult('t1', false, 100, 500)]);
      const current = makeReport('run_2', [makeResult('t1', false, 110, 500)]);

      const report = regressionService.compareRuns(baseline, current);

      expect(report.summary.unchangedFail).toBe(1);
      const comp = report.comparisons.find((c) => c.testCaseId === 't1');
      expect(comp?.classification).toBe('UNCHANGED_FAIL');
    });
  });

  describe('Schema Contract Regressions', () => {
    it('should detect schema contract regression when schema passed in baseline but failed in current', () => {
      const baseline = makeReport('run_1', [makeResult('t1', true, 100, 200, true)]);
      const current = makeReport('run_2', [makeResult('t1', false, 110, 200, false)]);

      const report = regressionService.compareRuns(baseline, current);

      const comp = report.comparisons.find((c) => c.testCaseId === 't1');
      expect(comp?.classification).toBe('REGRESSION');
      expect(comp?.schemaDiff?.isRegressed).toBe(true);
      expect(comp?.schemaDiff?.baselineSchemaPassed).toBe(true);
      expect(comp?.schemaDiff?.currentSchemaPassed).toBe(false);
      expect(comp?.failureClassification?.category).toBe('SCHEMA_VALIDATION_VIOLATION');
    });
  });

  describe('Latency Degradation Threshold Boundary Conditions', () => {
    const threshold = 200;

    it('should not flag degradation when latency delta is just below the threshold (delta = 199ms)', () => {
      const baseline = makeReport('run_1', [makeResult('t1', true, 100)]);
      const current = makeReport('run_2', [makeResult('t1', true, 299)]); // delta = 199ms

      const report = regressionService.compareRuns(baseline, current, threshold);
      const comp = report.comparisons.find((c) => c.testCaseId === 't1');

      expect(comp?.latencyDiff?.deltaMs).toBe(199);
      expect(comp?.latencyDiff?.isDegraded).toBe(false);
      expect(report.summary.latencyDegradations).toBe(0);
    });

    it('should not flag degradation when latency delta is exactly at the threshold (delta = 200ms)', () => {
      const baseline = makeReport('run_1', [makeResult('t1', true, 100)]);
      const current = makeReport('run_2', [makeResult('t1', true, 300)]); // delta = 200ms

      const report = regressionService.compareRuns(baseline, current, threshold);
      const comp = report.comparisons.find((c) => c.testCaseId === 't1');

      expect(comp?.latencyDiff?.deltaMs).toBe(200);
      expect(comp?.latencyDiff?.isDegraded).toBe(false);
      expect(report.summary.latencyDegradations).toBe(0);
    });

    it('should flag degradation when latency delta is just above the threshold (delta = 201ms)', () => {
      const baseline = makeReport('run_1', [makeResult('t1', true, 100)]);
      const current = makeReport('run_2', [makeResult('t1', true, 301)]); // delta = 201ms

      const report = regressionService.compareRuns(baseline, current, threshold);
      const comp = report.comparisons.find((c) => c.testCaseId === 't1');

      expect(comp?.latencyDiff?.deltaMs).toBe(201);
      expect(comp?.latencyDiff?.isDegraded).toBe(true);
      expect(report.summary.latencyDegradations).toBe(1);
    });
  });

  describe('Missing and Added Tests', () => {
    it('should classify test as ADDED when present only in current run', () => {
      const baseline = makeReport('run_1', [makeResult('t1', true)]);
      const current = makeReport('run_2', [makeResult('t1', true), makeResult('t2_new', true)]);

      const report = regressionService.compareRuns(baseline, current);

      expect(report.summary.added).toBe(1);
      expect(report.summary.removed).toBe(0);
      const comp = report.comparisons.find((c) => c.testCaseId === 't2_new');
      expect(comp?.classification).toBe('ADDED');
    });

    it('should classify test as REMOVED when present only in baseline run', () => {
      const baseline = makeReport('run_1', [makeResult('t1', true), makeResult('t2_old', true)]);
      const current = makeReport('run_2', [makeResult('t1', true)]);

      const report = regressionService.compareRuns(baseline, current);

      expect(report.summary.removed).toBe(1);
      expect(report.summary.added).toBe(0);
      const comp = report.comparisons.find((c) => c.testCaseId === 't2_old');
      expect(comp?.classification).toBe('REMOVED');
    });
  });

  describe('Robust Matching: Reordering, Duplicates, and Incomplete Data', () => {
    it('should match tests by stable ID regardless of array ordering', () => {
      const baseline = makeReport('run_1', [
        makeResult('t_alpha', true),
        makeResult('t_beta', false),
        makeResult('t_gamma', true),
      ]);

      // Reversed order in current run
      const current = makeReport('run_2', [
        makeResult('t_gamma', true),
        makeResult('t_beta', true), // fixed
        makeResult('t_alpha', false), // regressed
      ]);

      const report = regressionService.compareRuns(baseline, current);

      expect(report.summary.regressions).toBe(1);
      expect(report.summary.fixed).toBe(1);
      expect(report.summary.unchangedPass).toBe(1);

      expect(report.comparisons.find((c) => c.testCaseId === 't_alpha')?.classification).toBe('REGRESSION');
      expect(report.comparisons.find((c) => c.testCaseId === 't_beta')?.classification).toBe('FIXED');
      expect(report.comparisons.find((c) => c.testCaseId === 't_gamma')?.classification).toBe('UNCHANGED_PASS');
    });

    it('should explicitly flag duplicate test keys as INDETERMINATE and not silently mismatch', () => {
      const baseline = makeReport('run_1', [
        makeResult('duplicate_id', true),
        makeResult('duplicate_id', false), // duplicate key in baseline!
      ]);
      const current = makeReport('run_2', [makeResult('duplicate_id', true)]);

      const report = regressionService.compareRuns(baseline, current);

      expect(report.summary.indeterminate).toBeGreaterThan(0);
      const dupComp = report.comparisons.find((c) => c.testCaseId === 'duplicate_id');
      expect(dupComp?.classification).toBe('INDETERMINATE');
      expect(dupComp?.classificationReason).toContain('Duplicate test key');
    });

    it('should handle missing latency without throwing or producing NaN delta', () => {
      const baselineResult = makeResult('t1', true);
      delete (baselineResult as any).durationMs;

      const currentResult = makeResult('t1', true, 150);

      const baseline = makeReport('run_1', [baselineResult]);
      const current = makeReport('run_2', [currentResult]);

      const report = regressionService.compareRuns(baseline, current);

      const comp = report.comparisons.find((c) => c.testCaseId === 't1');
      expect(comp?.classification).toBe('UNCHANGED_PASS');
      expect(comp?.latencyDiff).toBeUndefined();
    });

    it('should classify test as INDETERMINATE if boolean passed outcome is missing', () => {
      const baselineResult = makeResult('t1', true);
      const currentResult = makeResult('t1', false);
      delete (currentResult as any).passed; // missing passed boolean

      const baseline = makeReport('run_1', [baselineResult]);
      const current = makeReport('run_2', [currentResult]);

      const report = regressionService.compareRuns(baseline, current);

      const comp = report.comparisons.find((c) => c.testCaseId === 't1');
      expect(comp?.classification).toBe('INDETERMINATE');
      expect(comp?.classificationReason).toContain('Missing boolean passed/failed execution outcome');
    });

    it('should use default threshold when invalid or negative latency threshold is provided', () => {
      const baseline = makeReport('run_1', [makeResult('t1', true, 100)]);
      const current = makeReport('run_2', [makeResult('t1', true, 350)]); // delta = 250ms

      // Pass negative threshold -> fallback to default (200ms)
      const report = regressionService.compareRuns(baseline, current, -50);

      expect(report.latencyThresholdMs).toBe(200);
      expect(report.summary.latencyDegradations).toBe(1);
    });
  });
});
