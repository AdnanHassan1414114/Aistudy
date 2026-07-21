import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendResponse } from "../utils/apiResponse";
import { prisma } from "../database/prismaClient";
import { getRedisConnection } from "../config/redis";

async function checkDatabase(): Promise<"up" | "down"> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "up";
  } catch {
    return "down";
  }
}

async function checkRedis(): Promise<"up" | "down"> {
  try {
    const pong = await getRedisConnection().ping();
    return pong === "PONG" ? "up" : "down";
  } catch {
    return "down";
  }
}

export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const status = database === "up" && redis === "up" ? "healthy" : "degraded";

  sendResponse({
    res,
    statusCode: status === "healthy" ? 200 : 503,
    message: `Application is ${status}.`,
    data: { status, database, redis, application: "up" },
  });
});
