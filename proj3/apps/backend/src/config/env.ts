import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  API_BASE_PATH: z.string().default("/api/v1"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  GROQ_API_KEY: z.string().default(""),
  GROQ_WHISPER_MODEL: z.string().default("whisper-large-v3"),

  AI_PROVIDER: z.enum(["openai", "groq"]).default("openai"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4.1"),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().default(120000),

  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  EMBEDDING_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_EMBEDDING_MODEL: z.string().default("text-embedding-004"),

  TEMP_STORAGE_DIR: z.string().default("./temp"),
  MAX_TRANSCRIPTION_RETRIES: z.coerce.number().default(2),
  // Caps how many chunks are transcribed concurrently. Uncapped parallelism
  // means a long video's chunks all hit the transcription API at once —
  // if that trips a rate limit, every chunk fails together and (without
  // this cap) retries would also fire together. See TRANSCRIPTION_CONCURRENCY
  // usage in TranscriptionService.
  TRANSCRIPTION_CONCURRENCY: z.coerce.number().default(3),
  AUDIO_CHUNK_TARGET_MB: z.coerce.number().default(24),
  AUDIO_CHUNK_OVERLAP_SECONDS: z.coerce.number().default(3),

  // ── Download flow guards ─────────────────────────────────────────────
  // Videos longer than this are rejected before any download/transcription
  // cost is incurred (see KnowledgeService.submitForProcessing).
  MAX_VIDEO_DURATION_MINUTES: z.coerce.number().default(90),
  // yt-dlp is a child process with no built-in timeout; without one, a
  // stalled network call can hang a worker slot or an HTTP request forever.
  YT_DLP_METADATA_TIMEOUT_MS: z.coerce.number().default(30000),
  YT_DLP_DOWNLOAD_TIMEOUT_MS: z.coerce.number().default(600000),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(30),

  JWT_SECRET: z.string().default("change_me_dev_secret"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // ── Milestone 2: RAG chat ──────────────────────────────────────────────
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),

  RAG_TOP_K: z.coerce.number().default(5),
  RAG_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  RAG_MAX_CONTEXT_CHARS: z.coerce.number().default(12000),

  CHUNK_TARGET_TOKENS: z.coerce.number().default(350),
  CHUNK_OVERLAP_TOKENS: z.coerce.number().default(50),

  CHAT_TEMPERATURE: z.coerce.number().default(0.2),
  CHAT_MAX_TOKENS: z.coerce.number().default(1200),

  DEFAULT_USER_ID: z.string().default("00000000-0000-0000-0000-000000000001"),

  // ── Milestone 3: Interview Engine ──────────────────────────────────────
  INTERVIEW_QUICK_DEFAULT_QUESTIONS: z.coerce.number().default(5),
  INTERVIEW_MAX_QUESTIONS: z.coerce.number().default(20),
  INTERVIEW_TEMPERATURE: z.coerce.number().default(0.4),
  INTERVIEW_MAX_TOKENS: z.coerce.number().default(600),

  // ── Milestone 4 Part 1: AI Answer Evaluation ────────────────────────────
  ANSWER_EVALUATION_TEMPERATURE: z.coerce.number().default(0.2),
  ANSWER_EVALUATION_MAX_TOKENS: z.coerce.number().default(500),

  // ── Milestone 5: Weak Area Detection & Revision Planner ─────────────────
  REVISION_LOW_SCORE_THRESHOLD: z.coerce.number().min(0).max(10).default(6),
  REVISION_MAX_WEAK_TOPICS: z.coerce.number().default(5),
  REVISION_PLAN_TEMPERATURE: z.coerce.number().default(0.3),
  REVISION_PLAN_MAX_TOKENS: z.coerce.number().default(700),

  // ── Milestone 6: Intelligent Learning Agent ──────────────────────────────
  LEARNING_AGENT_INTENT_TEMPERATURE: z.coerce.number().default(0),
  LEARNING_AGENT_INTENT_MAX_TOKENS: z.coerce.number().default(50),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. Check .env against .env.example.");
}

export const env = parsed.data;
export type Env = typeof env;