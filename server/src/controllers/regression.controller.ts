import type { Request, Response, NextFunction } from 'express';
import { RegressionService } from '../services/regression.service.js';
import { compareRunsRequestSchema } from '../validators/regression.validator.js';
import type { ApiResponse, RegressionReport } from '@api-sentinel/shared';

const regressionService = new RegressionService();

export async function compareRunsHandler(
  req: Request,
  res: Response<ApiResponse<RegressionReport>>,
  next: NextFunction
): Promise<void> {
  try {
    const validatedInput = compareRunsRequestSchema.parse(req.body);

    const report = regressionService.compareRuns(
      validatedInput.baselineRun as any,
      validatedInput.currentRun as any,
      validatedInput.latencyThresholdMs
    );

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
}
