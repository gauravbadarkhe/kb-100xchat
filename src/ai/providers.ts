import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import type { ProviderName } from "./types";

export function resolveProvider(name: ProviderName) {
  switch (name) {
    case "openai":
      return openai;
    case "anthropic":
      return anthropic;
    case "google":
      return google;
    default:
      return openai;
  }
}
