export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors: unknown[] | null;

  constructor(message: string, statusCode = 500, errors: unknown[] | null = null) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors: unknown[] | null = null) {
    return new AppError(message, 400, errors);
  }

  static notFound(message = "Resource not found") {
    return new AppError(message, 404);
  }

  static conflict(message: string) {
    return new AppError(message, 409);
  }

  static unauthorized(message = "Unauthorized") {
    return new AppError(message, 401);
  }

  static tooManyRequests(message = "Too many requests") {
    return new AppError(message, 429);
  }

  static internal(message = "Internal server error") {
    return new AppError(message, 500);
  }
}
