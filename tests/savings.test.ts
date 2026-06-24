import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeCallSavings,
  estimateTokens,
  resolveBaselineModel,
  shouldShowNotice,
  recordAndMaybeNotify,
  readSavings,
  savingsPath,
  formatNotice,
  formatReport,
  type SavingsState,
} from "../src/lib/savings.js";

let tmpHome: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;
let originalSavingsModel: string | undefined;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "zerogpu-savings-test-"));
  originalHome = process.env["HOME"];
  originalUserProfile = process.env["USERPROFILE"];
  originalSavingsModel = process.env["ZEROGPU_SAVINGS_MODEL"];
  process.env["HOME"] = tmpHome;
  process.env["USERPROFILE"] = tmpHome;
  delete process.env["ZEROGPU_SAVINGS_MODEL"];
});

afterEach(() => {
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (originalUserProfile === undefined) delete process.env["USERPROFILE"];
  else process.env["USERPROFILE"] = originalUserProfile;
  if (originalSavingsModel === undefined) delete process.env["ZEROGPU_SAVINGS_MODEL"];
  else process.env["ZEROGPU_SAVINGS_MODEL"] = originalSavingsModel;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe("computeCallSavings", () => {
  it("values the sample call (Opus baseline, summarize model)", () => {
    // 740 input + 280 output tokens — the real API sample, on llama-3.1-8b-instruct-fast
    const { tokens, savingsUsd } = computeCallSavings(
      740,
      280,
      "claude-opus-4-8",
      "llama-3.1-8b-instruct-fast",
    );
    expect(tokens).toBe(1020);
    const claude = (740 * 5 + 280 * 25) / 1e6; // 0.0107
    const zgpu = (740 * 0.02 + 280 * 0.05) / 1e6; // real ZeroGPU cost
    expect(savingsUsd).toBeCloseTo(claude - zgpu, 8);
  });

  it("is cheaper against the Sonnet baseline", () => {
    const opus = computeCallSavings(740, 280, "claude-opus-4-8", "gliner2-base-v1").savingsUsd;
    const sonnet = computeCallSavings(740, 280, "claude-sonnet-4-6", "gliner2-base-v1").savingsUsd;
    expect(sonnet).toBeLessThan(opus);
    const claude = (740 * 3 + 280 * 15) / 1e6; // Sonnet: 0.00642
    const zgpu = (740 * 0.05 + 280 * 0.4) / 1e6; // gliner2 real cost
    expect(sonnet).toBeCloseTo(claude - zgpu, 8);
  });

  it("uses the per-model ZeroGPU rate (different models, different cost)", () => {
    // Same Claude baseline + same tokens, but a pricier ZeroGPU model → smaller savings.
    const cheap = computeCallSavings(740, 280, "claude-opus-4-8", "LFM2.5-1.2B-Instruct").savingsUsd;
    const pricier = computeCallSavings(740, 280, "claude-opus-4-8", "gliner2-base-v1").savingsUsd;
    expect(cheap).toBeGreaterThan(pricier);
  });

  it("falls back to Opus pricing for an unknown baseline", () => {
    const unknown = computeCallSavings(740, 280, "totally-made-up", "gliner2-base-v1").savingsUsd;
    const opus = computeCallSavings(740, 280, "claude-opus-4-8", "gliner2-base-v1").savingsUsd;
    expect(unknown).toBeCloseTo(opus, 10);
  });

  it("falls back to a default ZeroGPU rate for an unknown model", () => {
    const known = computeCallSavings(740, 280, "claude-opus-4-8", "gliner2-base-v1").savingsUsd;
    const unknown = computeCallSavings(740, 280, "claude-opus-4-8", "some-new-zgpu-model").savingsUsd;
    // fallback equals gliner2's {0.05, 0.4} rate
    expect(unknown).toBeCloseTo(known, 10);
  });
});

describe("resolveBaselineModel", () => {
  it("defaults to claude-opus-4-8", () => {
    expect(resolveBaselineModel()).toBe("claude-opus-4-8");
  });

  it("honors a known ZEROGPU_SAVINGS_MODEL override", () => {
    process.env["ZEROGPU_SAVINGS_MODEL"] = "claude-sonnet-4-6";
    expect(resolveBaselineModel()).toBe("claude-sonnet-4-6");
  });

  it("ignores an unknown override and falls back to default", () => {
    process.env["ZEROGPU_SAVINGS_MODEL"] = "not-a-model";
    expect(resolveBaselineModel()).toBe("claude-opus-4-8");
  });
});

describe("estimateTokens (fallback)", () => {
  it("approximates ~4 chars per token, min 1", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateTokens("")).toBe(1);
    expect(estimateTokens(undefined)).toBe(1);
  });
});

function baseState(overrides: Partial<SavingsState> = {}): SavingsState {
  return {
    version: 1,
    totalSavingsUsd: 0,
    totalTokens: 0,
    totalRequests: 0,
    firstRecordedAt: null,
    lastRecordedAt: null,
    byModel: {},
    notice: { lastShownAtRequest: 0, lastMilestoneUsd: 0 },
    ...overrides,
  };
}

describe("shouldShowNotice cadence", () => {
  it("never shows within the cooldown (no two in a row)", () => {
    const s = baseState({ totalRequests: 11, notice: { lastShownAtRequest: 10, lastMilestoneUsd: 0 } });
    // gap = 1 < MIN_GAP(2) → false regardless of random
    expect(shouldShowNotice(s, () => 0)).toBe(false);
    expect(shouldShowNotice(s, () => 0.99)).toBe(false);
  });

  it("is guaranteed once the gap reaches MAX_GAP", () => {
    const s = baseState({ totalRequests: 14, notice: { lastShownAtRequest: 10, lastMilestoneUsd: 0 } });
    // gap = 4 >= MAX_GAP → always true
    expect(shouldShowNotice(s, () => 0.99)).toBe(true);
  });

  it("uses probability in the eligible window", () => {
    const s = baseState({ totalRequests: 13, notice: { lastShownAtRequest: 10, lastMilestoneUsd: 0 } });
    // gap = 3, between MIN_GAP and MAX_GAP
    expect(shouldShowNotice(s, () => 0.1)).toBe(true); // < 0.6
    expect(shouldShowNotice(s, () => 0.9)).toBe(false); // >= 0.6
  });

  it("forces a show when a new dollar milestone is crossed", () => {
    const s = baseState({
      totalRequests: 100,
      totalSavingsUsd: 1.2, // crosses the $1 milestone
      notice: { lastShownAtRequest: 98, lastMilestoneUsd: 0.5 },
    });
    // gap = 2 (>= 2) and milestone crossed → true even though cooldown would block a normal show
    expect(shouldShowNotice(s, () => 0.99)).toBe(true);
  });
});

describe("CTA in savings messages", () => {
  it("appends the platform/learn-more CTA to the inline notice", () => {
    const s = baseState({ totalRequests: 2, totalTokens: 1020, totalSavingsUsd: 0.01 });
    const out = formatNotice(s);
    expect(out).toContain("platform.zerogpu.ai");
    expect(out).toContain("zerogpu.ai to learn more");
  });

  it("appends the CTA to the full report (with and without data)", () => {
    const empty = formatReport(baseState());
    expect(empty).toContain("platform.zerogpu.ai");
    expect(empty).toContain("zerogpu.ai");

    const populated = formatReport(
      baseState({
        totalRequests: 5,
        totalTokens: 5000,
        totalSavingsUsd: 0.5,
        firstRecordedAt: "2026-06-01T00:00:00.000Z",
        byModel: { "gliner2-base-v1": { requests: 5, savingsUsd: 0.5, tokens: 5000 } },
      }),
    );
    expect(populated).toContain("platform.zerogpu.ai");
    expect(populated).toContain("zerogpu.ai");
  });
});

describe("recordAndMaybeNotify persistence", () => {
  it("accumulates totals and per-model breakdown in ~/.zerogpu/savings.json", () => {
    recordAndMaybeNotify({
      model: "zlm-v1-iab-classify-edge",
      usage: { input_tokens: 740, output_tokens: 280 },
    });
    recordAndMaybeNotify({
      model: "zlm-v1-iab-classify-edge",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    expect(existsSync(savingsPath())).toBe(true);
    const s = readSavings();
    expect(s.totalRequests).toBe(2);
    expect(s.totalTokens).toBe(1020 + 150);
    expect(s.byModel["zlm-v1-iab-classify-edge"]?.requests).toBe(2);
    expect(s.totalSavingsUsd).toBeGreaterThan(0);
    expect(s.firstRecordedAt).not.toBeNull();

    if (process.platform !== "win32") {
      expect(statSync(savingsPath()).mode & 0o777).toBe(0o600);
    }
  });

  it("falls back to estimated tokens when usage is absent", () => {
    recordAndMaybeNotify({
      model: "LFM2.5-1.2B-Instruct",
      inputText: "12345678", // ~2 tokens
      outputText: "1234", // ~1 token
    });
    const s = readSavings();
    expect(s.totalRequests).toBe(1);
    expect(s.totalTokens).toBe(3);
  });
});
