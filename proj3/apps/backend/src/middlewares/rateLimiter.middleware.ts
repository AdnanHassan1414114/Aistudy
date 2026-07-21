import rateLimit from "express-rate-limit";
import { env } from "../config/env";

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again shortly.",
    data: null,
    errors: null,
    timestamp: new Date().toISOString(),
  },
});

/** Stricter limiter specifically for the URL-submission endpoint. */
export const submissionRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: Math.max(5, Math.floor(env.RATE_LIMIT_MAX_REQUESTS / 3)),
  standardHeaders: true,
  legacyHeaders: false,
});
