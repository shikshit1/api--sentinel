import type {
  TestRunReport,
  TestCaseResult,
  RegressionReport,
  TestCaseComparison,
  RegressionSummary,
  StatusCodeDiff,
  SchemaDiff,
  LatencyDiff,
} from '@api-sentinel/shared';
import { FailureClassifierService } from './classifier.service.js';

export interface RegressionServiceOptions {
  defaultLatencyThresholdMs?: number;
}

export class RegressionService {
  private classifier: FailureClassifierService;
  private defaultThresholdMs: number;

  constructor(options: RegressionServiceOptions = {}) {
    this.classifier = new FailureClassifierService();
    this.defaultThresholdMs = options.defaultLatencyThresholdMs ?? 200;
  }

  /**
   * Compares a baseline test run report with a current test run report.
   */
  public compareRuns(
    baselineRun: TestRunReport,
    currentRun: TestRunReport,
    latencyThresholdMs?: number
  ): RegressionReport {
    // 1. Validate latency threshold
    const effectiveThreshold =
      typeof latencyThresholdMs === 'number' &&
      isFinite(latencyThresholdMs) &&
      latencyThresholdMs >= 0
        ? Math.round(latencyThresholdMs)
        : this.defaultThresholdMs;

    const baselineResults = Array.isArray(baselineRun.results) ? baselineRun.results : [];
    const currentResults = Array.isArray(currentRun.results) ? currentRun.results : [];

    // 2. Identify duplicate keys to prevent ambiguous matching
    const baselineKeyCounts = this.countKeys(baselineResults);
    const currentKeyCounts = this.countKeys(currentResults);

    const duplicateKeys = new Set<string>();
    for (const [key, count] of baselineKeyCounts.entries()) {
      if (count > 1) duplicateKeys.add(key);
    }
    for (const [key, count] of currentKeyCounts.entries()) {
      if (count > 1) duplicateKeys.add(key);
    }

    // 3. Index non-duplicate test results
    const baselineMap = new Map<string, TestCaseResult>();
    for (const res of baselineResults) {
      const key = this.getCanonicalTestKey(res);
      if (!duplicateKeys.has(key)) {
        baselineMap.set(key, res);
      }
    }

    const currentMap = new Map<string, TestCaseResult>();
    for (const res of currentResults) {
      const key = this.getCanonicalTestKey(res);
      if (!duplicateKeys.has(key)) {
        currentMap.set(key, res);
      }
    }

    const comparisons: TestCaseComparison[] = [];

    // 4. Handle duplicates explicitly as INDETERMINATE
    for (const res of baselineResults) {
      const key = this.getCanonicalTestKey(res);
      if (duplicateKeys.has(key)) {
        comparisons.push({
          testCaseId: res.testCaseId || key,
          testCaseName: res.testCaseName || 'Unnamed test',
          operationId: res.operationId,
          classification: 'INDETERMINATE',
          classificationReason: `Duplicate test key "${key}" detected in run data (${baselineKeyCounts.get(key) || 0} in baseline, ${currentKeyCounts.get(key) || 0} in current); cannot match deterministically.`,
          baselineResult: res,
        });
      }
    }

    for (const res of currentResults) {
      const key = this.getCanonicalTestKey(res);
      if (duplicateKeys.has(key)) {
        // If already added from baseline loop, skip duplicate comparison entry
        const alreadyAdded = comparisons.some(
          (c) => c.testCaseId === (res.testCaseId || key) && c.currentResult === res
        );
        if (!alreadyAdded) {
          comparisons.push({
            testCaseId: res.testCaseId || key,
            testCaseName: res.testCaseName || 'Unnamed test',
            operationId: res.operationId,
            classification: 'INDETERMINATE',
            classificationReason: `Duplicate test key "${key}" detected in current run data (${currentKeyCounts.get(key) || 0} instances); cannot match deterministically.`,
            currentResult: res,
            failureClassification: this.classifier.classify(res) || undefined,
          });
        }
      }
    }

    // 5. Compare tests present in current run
    for (const [key, currentRes] of currentMap.entries()) {
      const baselineRes = baselineMap.get(key);

      if (!baselineRes) {
        // Added in current run
        comparisons.push({
          testCaseId: currentRes.testCaseId || key,
          testCaseName: currentRes.testCaseName || 'Unnamed test',
          operationId: currentRes.operationId,
          classification: 'ADDED',
          classificationReason: 'Test case exists in current run but was not present in baseline run.',
          currentResult: currentRes,
          failureClassification: this.classifier.classify(currentRes) || undefined,
        });
      } else {
        // Exists in both runs - evaluate regression
        const comparison = this.compareSingleTest(
          key,
          baselineRes,
          currentRes,
          effectiveThreshold
        );
        comparisons.push(comparison);
      }
    }

    // 6. Identify tests removed from current run (present only in baseline)
    for (const [key, baselineRes] of baselineMap.entries()) {
      if (!currentMap.has(key)) {
        comparisons.push({
          testCaseId: baselineRes.testCaseId || key,
          testCaseName: baselineRes.testCaseName || 'Unnamed test',
          operationId: baselineRes.operationId,
          classification: 'REMOVED',
          classificationReason: 'Test case existed in baseline run but is missing from current run.',
          baselineResult: baselineRes,
        });
      }
    }

    // 7. Calculate Summary Totals
    const summary: RegressionSummary = {
      totalCompared: comparisons.length,
      regressions: comparisons.filter((c) => c.classification === 'REGRESSION').length,
      fixed: comparisons.filter((c) => c.classification === 'FIXED').length,
      unchangedPass: comparisons.filter((c) => c.classification === 'UNCHANGED_PASS').length,
      unchangedFail: comparisons.filter((c) => c.classification === 'UNCHANGED_FAIL').length,
      added: comparisons.filter((c) => c.classification === 'ADDED').length,
      removed: comparisons.filter((c) => c.classification === 'REMOVED').length,
      indeterminate: comparisons.filter((c) => c.classification === 'INDETERMINATE').length,
      latencyDegradations: comparisons.filter((c) => c.latencyDiff?.isDegraded).length,
    };

    return {
      baselineRunId: baselineRun.runId,
      currentRunId: currentRun.runId,
      targetBaseUrl: currentRun.targetBaseUrl || baselineRun.targetBaseUrl,
      comparedAt: new Date().toISOString(),
      latencyThresholdMs: effectiveThreshold,
      summary,
      comparisons,
    };
  }

  /**
   * Compares a single test case matched across baseline and current run.
   */
  private compareSingleTest(
    key: string,
    baseline: TestCaseResult,
    current: TestCaseResult,
    latencyThresholdMs: number
  ): TestCaseComparison {
    // Missing execution outcome evidence
    if (
      typeof baseline.passed !== 'boolean' ||
      typeof current.passed !== 'boolean'
    ) {
      return {
        testCaseId: current.testCaseId || baseline.testCaseId || key,
        testCaseName: current.testCaseName || baseline.testCaseName || 'Unnamed test',
        operationId: current.operationId || baseline.operationId,
        classification: 'INDETERMINATE',
        classificationReason: 'Missing boolean passed/failed execution outcome in run data.',
        baselineResult: baseline,
        currentResult: current,
      };
    }

    // Determine classification
    let classification: TestCaseComparison['classification'];
    let classificationReason: string;

    if (baseline.passed && !current.passed) {
      classification = 'REGRESSION';
      classificationReason = 'Test was passing in baseline run, but failed in current run.';
    } else if (!baseline.passed && current.passed) {
      classification = 'FIXED';
      classificationReason = 'Test was failing in baseline run, but now passes in current run.';
    } else if (baseline.passed && current.passed) {
      classification = 'UNCHANGED_PASS';
      classificationReason = 'Test passes consistently in both baseline and current runs.';
    } else {
      classification = 'UNCHANGED_FAIL';
      classificationReason = 'Test fails in both baseline and current runs.';
    }

    // Status code difference
    const statusCodeDiff = this.diffStatusCode(baseline, current);

    // Schema difference
    const schemaDiff = this.diffSchema(baseline, current);

    // Latency difference
    const latencyDiff = this.diffLatency(baseline, current, latencyThresholdMs);

    // Failure classification (for current failure)
    const failureClassification = this.classifier.classify(current) || undefined;

    return {
      testCaseId: current.testCaseId || baseline.testCaseId || key,
      testCaseName: current.testCaseName || baseline.testCaseName || 'Unnamed test',
      operationId: current.operationId || baseline.operationId,
      classification,
      classificationReason,
      baselineResult: baseline,
      currentResult: current,
      statusCodeDiff,
      schemaDiff,
      latencyDiff,
      failureClassification,
    };
  }

  private diffStatusCode(
    baseline: TestCaseResult,
    current: TestCaseResult
  ): StatusCodeDiff | undefined {
    const bCode = baseline.response?.statusCode;
    const cCode = current.response?.statusCode;

    if (bCode === undefined && cCode === undefined) {
      return undefined;
    }

    // An actual status code regression occurs if:
    // 1. Status codes differ AND baseline passed while current failed, OR
    // 2. Both received a status code, but current received an unexpected 5xx / 4xx error that wasn't in baseline
    const isRegressed =
      bCode !== cCode &&
      baseline.passed &&
      !current.passed;

    return {
      baselineStatusCode: bCode,
      currentStatusCode: cCode,
      isRegressed,
    };
  }

  private diffSchema(
    baseline: TestCaseResult,
    current: TestCaseResult
  ): SchemaDiff | undefined {
    const bSchemaAssertion = baseline.assertions?.find(
      (a) => a.name === 'Schema Contract Validation'
    );
    const cSchemaAssertion = current.assertions?.find(
      (a) => a.name === 'Schema Contract Validation'
    );

    if (!bSchemaAssertion && !cSchemaAssertion) {
      return undefined;
    }

    const bPassed = bSchemaAssertion ? bSchemaAssertion.passed : undefined;
    const cPassed = cSchemaAssertion ? cSchemaAssertion.passed : undefined;

    const isRegressed = bPassed === true && cPassed === false;

    return {
      baselineSchemaPassed: bPassed,
      currentSchemaPassed: cPassed,
      isRegressed,
      details: cPassed === false ? cSchemaAssertion?.message : undefined,
    };
  }

  private diffLatency(
    baseline: TestCaseResult,
    current: TestCaseResult,
    thresholdMs: number
  ): LatencyDiff | undefined {
    const bDuration = baseline.durationMs;
    const cDuration = current.durationMs;

    if (
      typeof bDuration !== 'number' ||
      typeof cDuration !== 'number' ||
      !isFinite(bDuration) ||
      !isFinite(cDuration)
    ) {
      return undefined;
    }

    const deltaMs = Math.round(cDuration - bDuration);
    // Latency degradation is triggered strictly when delta exceeds the threshold
    const isDegraded = deltaMs > thresholdMs;

    return {
      baselineLatencyMs: bDuration,
      currentLatencyMs: cDuration,
      deltaMs,
      thresholdMs,
      isDegraded,
    };
  }

  private getCanonicalTestKey(result: TestCaseResult): string {
    if (result.testCaseId && result.testCaseId.trim()) {
      return result.testCaseId.trim();
    }

    // Fallback composite key
    const method = result.request?.method?.toLowerCase() || 'get';
    const url = result.request?.url || result.operationId || 'root';
    const type = result.type || 'unknown';
    const category = result.category || '';

    return `${method}:${url}:${type}:${category}`;
  }

  private countKeys(results: TestCaseResult[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const r of results) {
      const key = this.getCanonicalTestKey(r);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }
}
