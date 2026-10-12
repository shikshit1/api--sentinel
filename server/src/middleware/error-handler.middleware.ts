import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { SpecParserError } from '../services/spec-parser.service.js';
import type { ApiResponse } from '@api-sentinel/shared';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response<ApiResponse<never>>,
  _next: NextFunction
): void {
  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed.',
        details: err.errors.map((e) => ({
          path: e.path.map(String),
          message: e.message,
        })),
      },
    });
    return;
  }

  // 2. Domain SpecParser Errors
  if (err instanceof SpecParserError) {
    const statusCode = err.code === 'EMPTY_SPEC_CONTENT' || err.code === 'INVALID_SYNTAX' ? 400 : 422;
    res.status(statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // 3. Fallback General Errors
  const generalError = err as Error;
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: generalError?.message || 'An unexpected internal error occurred.',
      details: isDev ? generalError?.stack : undefined,
    },
  });
}
