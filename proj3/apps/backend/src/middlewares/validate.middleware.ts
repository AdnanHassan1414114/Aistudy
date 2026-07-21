import { NextFunction, Request, Response } from "express";
import { ZodError, ZodTypeAny } from "zod";
import { AppError } from "../utils/appError";

interface ValidationTargets {
  // ZodTypeAny (not AnyZodObject) so discriminated unions — e.g. the
  // Interview Engine's QUICK | CUSTOM start payload — validate too.
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates req.body / req.query / req.params against the given Zod
 * schemas and replaces them with the parsed (typed, coerced) values.
 * Business logic must never trust unvalidated input.
 */
export function validate(schemas: ValidationTargets) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as unknown as typeof req.query;
      if (schemas.params) req.params = schemas.params.parse(req.params) as unknown as typeof req.params;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(AppError.badRequest("Validation failed", err.errors));
        return;
      }
      next(err);
    }
  };
}
