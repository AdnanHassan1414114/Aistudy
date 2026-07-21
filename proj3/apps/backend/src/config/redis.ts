import IORedis, { Redis } from "ioredis";
import { env } from "./env";
import { logger } from "../utils/logger";

let connection: Redis | undefined;

/**
 * Shared ioredis connection. BullMQ requires `maxRetriesPerRequest: null`
 * on connections used by Workers/QueueEvents.
 */
export function getRedisConnection(): Redis {
  if (connection) return connection;

  connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  connection.on("error", (err) => {
    logger.error("Redis connection error", { error: err.message });
  });

  connection.on("connect", () => {
    logger.info("Redis connected");
  });

  return connection;
}
