import { Response } from "express";

interface SendOptions<T> {
  res: Response;
  statusCode?: number;
  message: string;
  data?: T | null;
  errors?: unknown[] | null;
}

/**
 * Every API response follows the same envelope:
 * { success, message, data, errors, timestamp, requestId }
 */
export function sendResponse<T>({
  res,
  statusCode = 200,
  message,
  data = null,
  errors = null,
}: SendOptions<T>): void {
  res.status(statusCode).json({
    success: statusCode < 400,
    message,
    data,
    errors,
    timestamp: new Date().toISOString(),
    requestId: res.locals.requestId ?? null,
  });
}
