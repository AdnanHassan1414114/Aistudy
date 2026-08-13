import rateLimit from "express-rate-limit";
import { RedisStore, RedisReply } from "rate-limit-redis";
import { env } from "../config/env";
import { getRedisConnection } from "../config/redis";

// A plain per-process in-memory store (express-rate-limit's default) keeps
// its own separate counter on every server instance. Behind a load
// balancer with N instances, that means the *effective* limit becomes
// N times what's configured — each instance only ever sees a fraction of
// total traffic and never notices the others. This app already has a
// shared Redis connection (used for the job queue); pointing the limiter
// at it means every instance shares one real counter, so the configured
// limit is actually enforced regardless of how many instances are running.
const redisStore = () =>
  new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      getRedisConnection().call(command, ...args) as Promise<RedisReply>,
  });

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
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
  store: redisStore(),
});