import { readConfig } from "./config.js";

export const API_KEY_PREFIX = "zgpu-api-";

export type ValidationResult =
  | { ok: true; key: string }
  | { ok: false; reason: string };

export function validateApiKey(input: string): ValidationResult {
  const key = (input ?? "").trim();
  if (!key) return { ok: false, reason: "API key is empty." };
  if (!key.startsWith(API_KEY_PREFIX)) {
    return {
      ok: false,
      reason: `API key must start with "${API_KEY_PREFIX}".`,
    };
  }
  if (key.length <= API_KEY_PREFIX.length) {
    return { ok: false, reason: "API key is missing its body after the prefix." };
  }
  return { ok: true, key };
}

export interface ResolvedKey {
  apiKey: string;
  source: "config file" | "env var";
}

export function getApiKey(): ResolvedKey | undefined {
  const fromConfig = readConfig().apiKey;
  if (fromConfig) return { apiKey: fromConfig, source: "config file" };
  const fromEnv = process.env["ZEROGPU_API_KEY"];
  if (fromEnv) return { apiKey: fromEnv, source: "env var" };
  return undefined;
}
