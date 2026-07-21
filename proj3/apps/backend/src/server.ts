import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./database/prismaClient";
import { getRedisConnection } from "./config/redis";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API server listening on port ${env.PORT}`, { baseUrl: env.API_BASE_PATH, env: env.NODE_ENV });
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    getRedisConnection().disconnect();
    logger.info("Shutdown complete");
    process.exit(0);
  });

  // Force-exit if graceful shutdown hangs.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason });
});
