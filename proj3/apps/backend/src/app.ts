import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { requestIdMiddleware } from "./middlewares/requestId.middleware";
import { apiRateLimiter } from "./middlewares/rateLimiter.middleware";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.middleware";
import v1Routes from "./routes/v1";
import { logger } from "./utils/logger";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);
  app.use(apiRateLimiter);

  app.use((req, res, next) => {
    logger.info("Incoming request", { requestId: res.locals.requestId, method: req.method, path: req.path });
    next();
  });

  app.use(env.API_BASE_PATH, v1Routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
