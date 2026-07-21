import winston from "winston";
import path from "path";
import { env } from "../config/env";

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `[${ts}] ${level}: ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), "logs", "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), "logs", "combined.log"),
    }),
  ],
});

if (env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: "HH:mm:ss" }), consoleFormat),
    })
  );
}

/** Creates a child logger scoped to a request/job for correlated logs. */
export function createScopedLogger(scope: Record<string, string>) {
  return logger.child(scope);
}
