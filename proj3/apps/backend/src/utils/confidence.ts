import { ConfidenceLevel } from "@prisma/client";

/**
 * Confidence uses only the two numbers retrieval already produces: the
 * strongest match and the average across all retrieved chunks. A single
 * lucky match won't read as HIGH unless the rest of the retrieved set is
 * also strong.
 */
export function calculateConfidence(topSimilarity: number, averageSimilarity: number): ConfidenceLevel {
  if (topSimilarity >= 0.88 && averageSimilarity >= 0.8) return ConfidenceLevel.HIGH;
  if (topSimilarity >= 0.75) return ConfidenceLevel.MEDIUM;
  return ConfidenceLevel.LOW;
}
