import { describe, it, expect } from "vitest";
import { validateApiKey, API_KEY_PREFIX } from "../src/lib/auth.js";

describe("validateApiKey", () => {
  it("accepts a properly prefixed key", () => {
    const r = validateApiKey(`${API_KEY_PREFIX}abc123`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.key).toBe(`${API_KEY_PREFIX}abc123`);
  });

  it("trims whitespace", () => {
    const r = validateApiKey(`   ${API_KEY_PREFIX}xyz  `);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.key).toBe(`${API_KEY_PREFIX}xyz`);
  });

  it("rejects an empty key", () => {
    const r = validateApiKey("   ");
    expect(r.ok).toBe(false);
  });

  it("rejects a key without the prefix", () => {
    const r = validateApiKey("nope-abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/zgpu-api-/);
  });

  it("rejects a key that is only the prefix", () => {
    const r = validateApiKey(API_KEY_PREFIX);
    expect(r.ok).toBe(false);
  });
});
