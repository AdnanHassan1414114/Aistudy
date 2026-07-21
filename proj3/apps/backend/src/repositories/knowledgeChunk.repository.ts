import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../database/prismaClient";
import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";

export interface ChunkToStore {
  chunkIndex: number;
  heading: string | null;
  section: string | null;
  content: string;
  tokenCount: number;
  embedding: number[];
  embeddingModel: string;
}

export interface RetrievedChunk {
  id: string;
  knowledgeId: string;
  knowledgeTitle: string;
  category: string | null;
  heading: string | null;
  section: string | null;
  content: string;
  similarity: number;
}

/** Postgres `vector` has no native pg driver type, so we validate and
 *  serialize it ourselves rather than trust arbitrary input into raw SQL. */
function toVectorLiteral(embedding: number[]): string {
  if (embedding.length === 0 || !embedding.every((n) => Number.isFinite(n))) {
    throw new Error("Invalid embedding vector");
  }
  return `[${embedding.join(",")}]`;
}

/**
 * Encapsulates all pgvector access for KnowledgeChunk. The `embedding`
 * column is an Unsupported type in the Prisma schema, so every read/write
 * that touches it goes through raw SQL here — never through the normal
 * Prisma query builder.
 */
export class KnowledgeChunkRepository {
  async deleteForKnowledge(knowledgeId: string): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "knowledge_chunks" WHERE "knowledgeId" = ${knowledgeId}`;
  }

  async createMany(knowledgeId: string, chunks: ChunkToStore[]): Promise<number> {
    if (chunks.length === 0) return 0;

    try {
      const queries = chunks.map((c) => {
        const vectorLiteral = toVectorLiteral(c.embedding);
        return prisma.$executeRaw`
          INSERT INTO "knowledge_chunks"
            ("id", "knowledgeId", "chunkIndex", "heading", "section", "content", "tokenCount", "embedding", "embeddingModel", "createdAt")
          VALUES
            (${randomUUID()}, ${knowledgeId}, ${c.chunkIndex}, ${c.heading}, ${c.section}, ${c.content}, ${c.tokenCount},
             ${Prisma.raw(`'${vectorLiteral}'::vector`)}, ${c.embeddingModel}, now())
        `;
      });
      await prisma.$transaction(queries);
      return chunks.length;
    } catch (err) {
      logger.error("Failed to store knowledge chunks", { knowledgeId, error: (err as Error).message });
      throw AppError.internal("Failed to store knowledge chunk embeddings.");
    }
  }

  /**
   * Atomically replaces a Knowledge's chunk set: delete-then-insert runs as
   * a single DB transaction, so a failure partway through (e.g. an invalid
   * embedding vector) rolls back the delete too — previously indexed
   * chunks are left intact instead of the Knowledge ending up unsearchable.
   */
  async replaceForKnowledge(knowledgeId: string, chunks: ChunkToStore[]): Promise<number> {
    if (chunks.length === 0) {
      await this.deleteForKnowledge(knowledgeId);
      return 0;
    }

    try {
      const deleteQuery = prisma.$executeRaw`DELETE FROM "knowledge_chunks" WHERE "knowledgeId" = ${knowledgeId}`;
      const insertQueries = chunks.map((c) => {
        const vectorLiteral = toVectorLiteral(c.embedding);
        return prisma.$executeRaw`
          INSERT INTO "knowledge_chunks"
            ("id", "knowledgeId", "chunkIndex", "heading", "section", "content", "tokenCount", "embedding", "embeddingModel", "createdAt")
          VALUES
            (${randomUUID()}, ${knowledgeId}, ${c.chunkIndex}, ${c.heading}, ${c.section}, ${c.content}, ${c.tokenCount},
             ${Prisma.raw(`'${vectorLiteral}'::vector`)}, ${c.embeddingModel}, now())
        `;
      });

      await prisma.$transaction([deleteQuery, ...insertQueries]);
      return chunks.length;
    } catch (err) {
      logger.error("Failed to atomically replace knowledge chunks", {
        knowledgeId,
        error: (err as Error).message,
      });
      throw AppError.internal("Failed to store knowledge chunk embeddings.");
    }
  }

  async countForKnowledge(knowledgeId: string): Promise<number> {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "knowledge_chunks" WHERE "knowledgeId" = ${knowledgeId}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Cosine similarity search restricted to the user's own (COMPLETED,
   * non-deleted) knowledge, optionally scoped to a category. `1 - cosine
   * distance` gives similarity in [0, 1] (well-behaved for normalized
   * embeddings such as OpenAI's).
   */
  async similaritySearch(
    queryEmbedding: number[],
    options: { topK: number; category?: string | null; excludeKnowledgeId?: string }
  ): Promise<RetrievedChunk[]> {
    let vectorLiteral: string;
    try {
      vectorLiteral = toVectorLiteral(queryEmbedding);
    } catch (err) {
      logger.error("Invalid query embedding for similarity search", { error: (err as Error).message });
      throw AppError.internal("Vector search failed: invalid query embedding.");
    }

    const vectorParam = Prisma.raw(`'${vectorLiteral}'::vector`);
    const categoryFilter = options.category
      ? Prisma.sql`AND k."category" = ${options.category}`
      : Prisma.empty;
    const excludeFilter = options.excludeKnowledgeId
      ? Prisma.sql`AND k."id" != ${options.excludeKnowledgeId}`
      : Prisma.empty;

    try {
      const rows = await prisma.$queryRaw<RetrievedChunk[]>(Prisma.sql`
        SELECT
          kc."id" AS "id",
          kc."knowledgeId" AS "knowledgeId",
          k."title" AS "knowledgeTitle",
          k."category" AS "category",
          kc."heading" AS "heading",
          kc."section" AS "section",
          kc."content" AS "content",
          (1 - (kc."embedding" <=> ${vectorParam}))::float AS "similarity"
        FROM "knowledge_chunks" kc
        JOIN "knowledge" k ON k."id" = kc."knowledgeId"
        WHERE k."deletedAt" IS NULL
          AND k."status" = 'COMPLETED'
          ${categoryFilter}
          ${excludeFilter}
        ORDER BY kc."embedding" <=> ${vectorParam}
        LIMIT ${options.topK}
      `);

      // Never leak the raw embedding vector to callers.
      return rows.map((r) => ({
        id: r.id,
        knowledgeId: r.knowledgeId,
        knowledgeTitle: r.knowledgeTitle,
        category: r.category,
        heading: r.heading,
        section: r.section,
        content: r.content,
        similarity: r.similarity,
      }));
    } catch (err) {
      logger.error("pgvector similarity search failed", { error: (err as Error).message });
      throw AppError.internal("Vector search failed. Please try again.");
    }
  }
}

export const knowledgeChunkRepository = new KnowledgeChunkRepository();
