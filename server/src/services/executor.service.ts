import http from 'node:http';
import https from 'node:https';
import { URL, URLSearchParams } from 'node:url';
import type {
  GeneratedTestCase,
  TestCaseResult,
  TestRunReport,
  TestAssertion,
  ExecutionRequestDetails,
  ExecutionResponseDetails,
} from '@api-sentinel/shared';
import { SsrfGuardService, SsrfSecurityError, type SsrfValidationOptions } from './ssrf-guard.service.js';
import { AssertionService } from './assertion.service.js';

export interface ExecutorOptions extends SsrfValidationOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  concurrencyLimit?: number;
  authorizedBaseUrls?: string[];
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024; // 1 MB
const DEFAULT_CONCURRENCY = 3;

const SENSITIVE_HEADER_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'token',
  'secret',
  'password',
];

export class TestExecutorService {
  private ssrfGuard: SsrfGuardService;
  private assertionService: AssertionService;
  private safeAgents: { httpAgent: http.Agent; httpsAgent: https.Agent };
  private allowLoopback: boolean;

  constructor(options: ExecutorOptions = {}) {
    this.ssrfGuard = new SsrfGuardService();
    this.assertionService = new AssertionService();
    this.allowLoopback = Boolean(options.allowLoopbackForTesting);
    this.safeAgents = this.ssrfGuard.createSafeAgents({
      allowLoopbackForTesting: this.allowLoopback,
    });
  }

  /**
   * Executes a full test suite with concurrency limits and SSRF defenses.
   */
  public async executeSuite(
    testCases: GeneratedTestCase[],
    targetBaseUrl: string,
    options: ExecutorOptions = {}
  ): Promise<TestRunReport> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    const concurrency = Math.min(options.concurrencyLimit || DEFAULT_CONCURRENCY, 10);
    const results: TestCaseResult[] = [];

    // Worker pool for concurrency control
    let currentIndex = 0;
    const executeWorker = async () => {
      while (currentIndex < testCases.length) {
        const testCase = testCases[currentIndex++];
        const result = await this.executeTestCase(testCase, targetBaseUrl, options);
        results.push(result);
      }
    };

    const workerPromises = Array.from(
      { length: Math.min(concurrency, testCases.length) },
      () => executeWorker()
    );

    await Promise.all(workerPromises);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const passed = results.filter((r) => r.passed).length;
    const errors = results.filter((r) => r.error).length;
    const failed = results.length - passed;

    return {
      runId: `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      targetBaseUrl,
      startedAt,
      completedAt,
      durationMs,
      totalTests: results.length,
      passed,
      failed,
      errors,
      results,
    };
  }

  /**
   * Executes an individual test case safely.
   */
  public async executeTestCase(
    testCase: GeneratedTestCase,
    targetBaseUrl: string,
    options: ExecutorOptions = {}
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const maxResponseBytes = options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;
    const authorizedBaseUrls = options.authorizedBaseUrls || [targetBaseUrl];

    // 1. Build and sanitize request URL
    const resolvedUrlString = this.buildResolvedUrl(targetBaseUrl, testCase.path, testCase.pathParams, testCase.queryParams);

    // Redacted request headers for recording
    const cleanHeaders = this.redactHeaders(testCase.headers);
    const requestDetails: ExecutionRequestDetails = {
      url: resolvedUrlString,
      method: testCase.method,
      headers: cleanHeaders,
      body: this.sanitizePayload(testCase.requestBody),
    };

    // 2. Pre-flight URL & SSRF Validation
    let targetUrl: URL;
    try {
      targetUrl = await this.ssrfGuard.validateTargetUrl(resolvedUrlString, authorizedBaseUrls, {
        allowLoopbackForTesting: this.allowLoopback,
      });
    } catch (ssrfErr) {
      const err = ssrfErr as Error;
      return {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        operationId: testCase.operationId,
        type: testCase.type,
        category: testCase.category,
        passed: false,
        durationMs: Date.now() - startTime,
        request: requestDetails,
        assertions: [],
        error: {
          code: ssrfErr instanceof SsrfSecurityError ? ssrfErr.code : 'SSRF_VALIDATION_ERROR',
          message: err.message,
        },
      };
    }

    // 3. Dispatch safe HTTP request
    try {
      const httpResult = await this.dispatchHttpRequest(
        targetUrl,
        testCase,
        timeoutMs,
        maxResponseBytes
      );

      const durationMs = Date.now() - startTime;

      // 4. Run Assertions
      const assertions: TestAssertion[] = [];

      // Status code check
      const statusAssertion = this.assertionService.assertStatusCode(
        httpResult.statusCode,
        testCase.expectedStatus
      );
      assertions.push(statusAssertion);

      // Schema contract check (if positive or schema_validation test)
      if (testCase.expectedResponseSchema && (testCase.type === 'positive' || testCase.type === 'schema_validation')) {
        const schemaAssertion = this.assertionService.assertResponseSchema(
          httpResult.body,
          testCase.expectedResponseSchema
        );
        assertions.push(schemaAssertion);
      }

      const allAssertionsPassed = assertions.every((a) => a.passed);

      const responseDetails: ExecutionResponseDetails = {
        statusCode: httpResult.statusCode,
        statusText: httpResult.statusText,
        headers: this.redactHeaders(httpResult.headers),
        body: this.sanitizePayload(httpResult.body),
        sizeBytes: httpResult.sizeBytes,
      };

      return {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        operationId: testCase.operationId,
        type: testCase.type,
        category: testCase.category,
        passed: allAssertionsPassed,
        durationMs,
        request: requestDetails,
        response: responseDetails,
        assertions,
      };
    } catch (execErr) {
      const durationMs = Date.now() - startTime;
      const err = execErr as Error;

      return {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        operationId: testCase.operationId,
        type: testCase.type,
        category: testCase.category,
        passed: false,
        durationMs,
        request: requestDetails,
        assertions: [],
        error: {
          code: (execErr as any).code || 'EXECUTION_ERROR',
          message: err.message,
        },
      };
    }
  }

  /**
   * Dispatches the raw HTTP request using Node's native client with strict timeouts, byte caps, and custom safe agents.
   */
  private dispatchHttpRequest(
    url: URL,
    testCase: GeneratedTestCase,
    timeoutMs: number,
    maxBytes: number
  ): Promise<{
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    body?: unknown;
    sizeBytes: number;
  }> {
    return new Promise((resolve, reject) => {
      const isHttps = url.protocol === 'https:';
      const agent = isHttps ? this.safeAgents.httpsAgent : this.safeAgents.httpAgent;
      const requestModule = isHttps ? https : http;

      const headers: Record<string, string> = {
        ...testCase.headers,
        'User-Agent': 'API-Sentinel/1.0.0',
        Accept: 'application/json, */*',
      };

      let bodyData: string | undefined;
      if (testCase.requestBody !== undefined && testCase.requestBody !== null) {
        if (typeof testCase.requestBody === 'object') {
          bodyData = JSON.stringify(testCase.requestBody);
          headers['Content-Type'] = testCase.contentType || 'application/json';
        } else {
          bodyData = String(testCase.requestBody);
        }
        headers['Content-Length'] = Buffer.byteLength(bodyData).toString();
      }

      const reqOptions: http.RequestOptions = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: testCase.method.toUpperCase(),
        headers,
        agent,
        // Disable automatic redirect following
        maxHeaderSize: 16384,
      };

      const req = requestModule.request(reqOptions, (res) => {
        let receivedBytes = 0;
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > maxBytes) {
            req.destroy(new Error(`Response size exceeded maximum byte limit of ${maxBytes} bytes.`));
            const err = new Error(`Response size limit exceeded (${receivedBytes} bytes).`);
            (err as any).code = 'RESPONSE_PAYLOAD_TOO_LARGE';
            reject(err);
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          let parsedBody: unknown = rawBody;

          const resContentType = (res.headers['content-type'] || '').toLowerCase();
          if (resContentType.includes('json') && rawBody.trim()) {
            try {
              parsedBody = JSON.parse(rawBody);
            } catch {
              parsedBody = rawBody;
            }
          }

          const responseHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) {
              responseHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
            }
          }

          resolve({
            statusCode: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: responseHeaders,
            body: parsedBody,
            sizeBytes: receivedBytes,
          });
        });

        res.on('error', (resErr) => {
          reject(resErr);
        });
      });

      // Strict request timeout
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        const err = new Error(`Request timed out after ${timeoutMs}ms.`);
        (err as any).code = 'REQUEST_TIMEOUT';
        reject(err);
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    });
  }

  private buildResolvedUrl(
    baseUrl: string,
    pathTemplate: string,
    pathParams: Record<string, string | number | boolean>,
    queryParams: Record<string, string | number | boolean>
  ): string {
    let resolvedPath = pathTemplate;

    for (const [paramName, val] of Object.entries(pathParams)) {
      resolvedPath = resolvedPath.replace(
        `{${paramName}}`,
        encodeURIComponent(String(val))
      );
    }

    const base = baseUrl.replace(/\/+$/, '');
    const cleanPath = resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`;
    const fullUrl = new URL(`${base}${cleanPath}`);

    for (const [qKey, qVal] of Object.entries(queryParams)) {
      fullUrl.searchParams.append(qKey, String(qVal));
    }

    return fullUrl.toString();
  }

  public redactHeaders(headers: Record<string, string>): Record<string, string> {
    const redacted: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      const isSensitive = SENSITIVE_HEADER_KEYS.some((sKey) =>
        k.toLowerCase().includes(sKey)
      );
      redacted[k] = isSensitive ? '[REDACTED]' : v;
    }
    return redacted;
  }

  public sanitizePayload(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    try {
      const copy = JSON.parse(JSON.stringify(payload));
      this.redactObjectRecursive(copy);
      return copy;
    } catch {
      return '[UNSERIALIZABLE_PAYLOAD]';
    }
  }

  private redactObjectRecursive(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.redactObjectRecursive(item);
      }
      return;
    }

    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_HEADER_KEYS.some((s) => lower.includes(s))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        this.redactObjectRecursive(obj[key]);
      }
    }
  }
}
