import type { LlmClient } from "./types.js";
import { createGeminiClient } from "./geminiClient.js";

let client: LlmClient | null = null;

export function getLlmClient(): LlmClient {
  if (!client) {
    client = createGeminiClient();
  }
  return client;
}
