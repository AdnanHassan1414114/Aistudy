import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const requestId = res.locals.requestId ?? "unknown";

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { requestId, stack: err.stack });
    } else {
      logger.warn(err.message, { requestId, statusCode: err.statusCode });
    }

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      data: null,
      errors: err.errors,
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Unknown/unexpected error — never expose internals to the client.
  const error = err as Error;
  logger.error("Unhandled error", { requestId, message: error?.message, stack: error?.stack });

  res.status(500).json({
    success: false,
    message: "Internal server error",
    data: null,
    errors: null,
    timestamp: new Date().toISOString(),
    requestId,
  });
}
