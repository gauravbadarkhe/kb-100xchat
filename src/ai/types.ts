export type ProviderName = "openai" | "anthropic" | "google";

export type AIConfig = {
  provider: ProviderName;
  chatModel: string; // e.g. "gpt-4o-mini", "claude-3-5-sonnet-latest", "gemini-1.5-pro"
  embedModel: string; // e.g. "text-embedding-3-small"
};
