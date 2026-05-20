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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateProjectId(input: string): ValidationResult {
  const id = (input ?? "").trim();
  if (!id) return { ok: false, reason: "Project ID is empty." };
  if (!UUID_RE.test(id)) {
    return { ok: false, reason: "Project ID must be a UUID." };
  }
  return { ok: true, key: id };
}

export interface ResolvedProjectId {
  projectId: string;
  source: "config file" | "env var";
}

export function getProjectId(): ResolvedProjectId | undefined {
  const fromConfig = readConfig().projectId;
  if (fromConfig) return { projectId: fromConfig, source: "config file" };
  const fromEnv = process.env["ZEROGPU_PROJECT_ID"];
  if (fromEnv) return { projectId: fromEnv, source: "env var" };
  return undefined;
}
