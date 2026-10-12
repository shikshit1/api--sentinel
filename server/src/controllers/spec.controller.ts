import type { Request, Response, NextFunction } from 'express';
import { SpecParserService } from '../services/spec-parser.service.js';
import { parseSpecSchema } from '../validators/spec.validator.js';
import type { ApiResponse, ParsedSpecSummary } from '@api-sentinel/shared';

const parserService = new SpecParserService();

export async function parseSpecHandler(
  req: Request,
  res: Response<ApiResponse<ParsedSpecSummary>>,
  next: NextFunction
): Promise<void> {
  try {
    const validatedInput = parseSpecSchema.parse(req.body);
    const summary = await parserService.parse(validatedInput.specContent);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
}
