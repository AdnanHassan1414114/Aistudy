import { Knowledge, KnowledgeOrigin, KnowledgeStatus, Prisma } from "@prisma/client";
import { prisma } from "../database/prismaClient";
import { PaginatedResult, PaginationParams } from "../interfaces";

export interface CreateKnowledgeData {
  title: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  thumbnail?: string | null;
  channelName?: string | null;
  channelUrl?: string | null;
  description?: string | null;
  duration?: number | null;
  publishedAt?: Date | null;
  language?: string | null;
  category?: string | null;
  origin?: KnowledgeOrigin;
}

export interface KnowledgeListFilters extends PaginationParams {
  search?: string;
  status?: KnowledgeStatus;
  sortBy?: "createdAt" | "updatedAt" | "title";
  sortOrder?: "asc" | "desc";
}

/**
 * Encapsulates all Prisma access for the Knowledge entity.
 * Services must never import `prisma` directly for knowledge queries.
 */
export class KnowledgeRepository {
  async findById(id: string, includeDeleted = false): Promise<Knowledge | null> {
    return prisma.knowledge.findFirst({
      where: { id, ...(includeDeleted ? {} : { deletedAt: null }) },
    });
  }

  async findByVideoId(youtubeVideoId: string): Promise<Knowledge | null> {
    return prisma.knowledge.findUnique({ where: { youtubeVideoId } });
  }

  async create(data: CreateKnowledgeData): Promise<Knowledge> {
    return prisma.knowledge.create({
      data: {
        ...data,
        status: KnowledgeStatus.PENDING,
      },
    });
  }

  /** Used when a YouTube video is re-submitted after its previous Knowledge
   *  entry was soft deleted. `youtubeVideoId` is globally unique, so we
   *  cannot create a new row — instead the existing (soft-deleted) row is
   *  revived in place and reset back to a fresh PENDING state so it can
   *  go through the processing pipeline again. */
  async restoreForReprocessing(id: string, data: CreateKnowledgeData): Promise<Knowledge> {
    return prisma.knowledge.update({
      where: { id },
      data: {
        ...data,
        deletedAt: null,
        status: KnowledgeStatus.PENDING,
        transcriptRaw: null,
        transcriptClean: null,
        notes: null,
        processingTime: null,
        aiProvider: null,
        aiModel: null,
        promptVersion: null,
        version: 1,
      },
    });
  }

  /** Used by the chat "Save to Knowledge Base" flow — creates an already-
   *  COMPLETED record (no processing pipeline needed) tagged CHAT_SAVE. */
  async createCompletedFromChat(data: CreateKnowledgeData & { notes: string }): Promise<Knowledge> {
    return prisma.knowledge.create({
      data: {
        ...data,
        origin: KnowledgeOrigin.CHAT_SAVE,
        status: KnowledgeStatus.COMPLETED,
        version: 1,
      },
    });
  }

  async updateStatus(id: string, status: KnowledgeStatus): Promise<Knowledge> {
    return prisma.knowledge.update({ where: { id }, data: { status } });
  }

  async updateTranscripts(
    id: string,
    data: { transcriptRaw?: string; transcriptClean?: string }
  ): Promise<Knowledge> {
    return prisma.knowledge.update({ where: { id }, data });
  }

  async completeProcessing(
    id: string,
    data: {
      notes: string;
      transcriptRaw: string;
      transcriptClean: string;
      processingTime: number;
      aiProvider: string;
      aiModel: string;
      promptVersion: string;
    }
  ): Promise<Knowledge> {
    return prisma.knowledge.update({
      where: { id },
      data: { ...data, status: KnowledgeStatus.COMPLETED, version: 1 },
    });
  }

  async markFailed(id: string): Promise<Knowledge> {
    return prisma.knowledge.update({
      where: { id },
      data: { status: KnowledgeStatus.FAILED },
    });
  }

  /** Updates notes and bumps the version counter. Caller is responsible
   *  for writing the corresponding KnowledgeVersion row transactionally. */
  async updateNotes(id: string, notes: string, newVersion: number): Promise<Knowledge> {
    return prisma.knowledge.update({
      where: { id },
      data: { notes, version: newVersion },
    });
  }

  async softDelete(id: string): Promise<Knowledge> {
    return prisma.knowledge.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async permanentDelete(id: string): Promise<void> {
    await prisma.knowledge.delete({ where: { id } });
  }

  async list(filters: KnowledgeListFilters): Promise<PaginatedResult<Knowledge>> {
    const {
      page,
      pageSize,
      search,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const where: Prisma.KnowledgeWhereInput = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { channelName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      prisma.knowledge.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.knowledge.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };
  }
}

export const knowledgeRepository = new KnowledgeRepository();
