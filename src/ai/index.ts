import { generateObject, embed, embedMany } from "ai";
import { z } from "zod";
import { resolveProvider } from "./providers";
import type { AIConfig } from "./types";

// Reads env and returns a normalized config
export function getAIConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER ||
    "openai") as AIConfig["provider"];
  return {
    provider,
    chatModel: process.env.AI_CHAT_MODEL || defaultChatModel(provider),
    embedModel: process.env.AI_EMBED_MODEL || defaultEmbedModel(provider),
  };
}

function defaultChatModel(p: string) {
  if (p === "anthropic") return "claude-3-5-sonnet-latest";
  if (p === "google") return "gemini-1.5-pro";
  return "gpt-4o-mini";
}

function defaultEmbedModel(p: string) {
  // most providers proxy OpenAI embeddings for now; keep OpenAI as default
  return "text-embedding-3-small";
}

// Chat that returns a Zod-validated object (JSON) — perfect for RAG answers
export async function chatAsObject<T extends z.ZodTypeAny>(opts: {
  system: string;
  user: string;
  schema: T;
}) {
  const cfg = getAIConfig();
  const provider = resolveProvider(cfg.provider);
  const { object } = await generateObject({
    model: provider(cfg.chatModel),
    system: opts.system,
    prompt: opts.user,
    schema: opts.schema,
    temperature: 0.2,
  });
  return object as z.infer<T>;
}

// Single embedding
export async function embedOneAI(text: string) {
  const cfg = getAIConfig();
  const provider = resolveProvider(cfg.provider);
  const { embedding } = await embed({
    model:
      provider.textEmbeddingModel?.(cfg.embedModel) ??
      resolveProvider("openai").textEmbeddingModel(cfg.embedModel),
    value: text,
  });
  return embedding;
}

// Batch embeddings
export async function embedBatchAI(texts: string[]) {
  const cfg = getAIConfig();
  const provider = resolveProvider(cfg.provider);
  const { embeddings } = await embedMany({
    model:
      provider.textEmbeddingModel?.(cfg.embedModel) ??
      resolveProvider("openai").textEmbeddingModel(cfg.embedModel),
    values: texts,
  });
  return embeddings;
}
