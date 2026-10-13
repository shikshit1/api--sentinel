import type { Request, Response, NextFunction } from 'express';
import { TestGeneratorService } from '../services/test-generator.service.js';
import { TestExecutorService } from '../services/executor.service.js';
import { SpecParserService } from '../services/spec-parser.service.js';
import { executeSuiteRequestSchema } from '../validators/test-case.validator.js';
import { parseSpecSchema } from '../validators/spec.validator.js';
import type { ApiResponse, TestSuite, TestRunReport } from '@api-sentinel/shared';

const generatorService = new TestGeneratorService();
const parserService = new SpecParserService();
const executorService = new TestExecutorService();

export async function generateTestsHandler(
  req: Request,
  res: Response<ApiResponse<TestSuite>>,
  next: NextFunction
): Promise<void> {
  try {
    let specSummary = req.body.spec;

    if (!specSummary && req.body.specContent) {
      const validatedInput = parseSpecSchema.parse(req.body);
      specSummary = await parserService.parse(validatedInput.specContent);
    }

    if (!specSummary || !Array.isArray(specSummary.operations)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SPEC',
          message: 'Either "specContent" or a parsed "spec" object must be provided.',
        },
      });
      return;
    }

    const suite = generatorService.generateSuite(specSummary);

    res.status(200).json({
      success: true,
      data: suite,
    });
  } catch (error) {
    next(error);
  }
}

export async function executeTestsHandler(
  req: Request,
  res: Response<ApiResponse<TestRunReport>>,
  next: NextFunction
): Promise<void> {
  try {
    const validatedInput = executeSuiteRequestSchema.parse(req.body);

    const report = await executorService.executeSuite(
      validatedInput.testCases,
      validatedInput.targetBaseUrl,
      {
        concurrencyLimit: validatedInput.concurrencyLimit,
        timeoutMs: validatedInput.timeoutMs,
      }
    );

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
}
