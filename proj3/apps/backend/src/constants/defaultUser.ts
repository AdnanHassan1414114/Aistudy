import { env } from "../config/env";

/**
 * Milestone 1 & 2 ship without auth. Every Conversation/Knowledge row is
 * tagged with this constant instead of a real session user, so the schema
 * and queries are already shaped correctly for when auth lands later —
 * only this constant needs to be replaced with `req.user.id`.
 */
export const DEFAULT_USER_ID = env.DEFAULT_USER_ID;
