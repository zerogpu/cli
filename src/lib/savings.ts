import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./config.js";
import type { ResponsesUsage } from "./responses.js";

// What the offloaded work would have cost on Claude, per 1M tokens (in / out).
// Tweak these in one place if Anthropic pricing changes.
const CLAUDE_PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-opus-4-6": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-fable-5": { in: 10, out: 50 },
};

const DEFAULT_BASELINE = "claude-opus-4-8";

// Actual ZeroGPU pricing per 1M tokens (in / out), per model.
// Source: https://docs.zerogpu.ai model catalog.
const ZGPU_PRICING: Record<string, { in: number; out: number }> = {
  "llama-3.1-8b-instruct-fast": { in: 0.02, out: 0.05 },
  "zlm-v1-iab-classify-edge": { in: 0.05, out: 0.4 },
  "zlm-v1-iab-classify-edge-enriched": { in: 0.05, out: 0.4 },
  "zlm-v1-followup-questions-edge": { in: 0.05, out: 0.4 },
  "gliner-multi-pii-v1": { in: 0.05, out: 0.4 },
  "gliner2-base-v1": { in: 0.05, out: 0.4 },
  "deberta-v3-small": { in: 0.04, out: 0.1 },
  "LFM2.5-1.2B-Thinking": { in: 0.02, out: 0.1 },
  "LFM2.5-1.2B-Instruct": { in: 0.02, out: 0.1 },
};
// Conservative fallback for any model id not in the table above.
const ZGPU_FALLBACK = { in: 0.05, out: 0.4 };

// Cadence: aim to show the savings note roughly once every 4–5 routed calls,
// never twice in a row, and guaranteed within a bounded window.
const MIN_GAP = 3; // never show within this many calls of the last one
const MAX_GAP = 6; // guaranteed by here
const SHOW_PROBABILITY = 0.5; // per eligible call between MIN_GAP and MAX_GAP

// Force a celebratory note when cumulative savings crosses one of these dollar
// thresholds (subject to a small anti-clustering cooldown).
const MILESTONES_USD = [0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

export interface ModelSavings {
  requests: number;
  savingsUsd: number;
  tokens: number;
}

export interface SavingsState {
  version: number;
  totalSavingsUsd: number;
  totalTokens: number;
  totalRequests: number;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  byModel: Record<string, ModelSavings>;
  notice: { lastShownAtRequest: number; lastMilestoneUsd: number };
}

function freshState(): SavingsState {
  return {
    version: 1,
    totalSavingsUsd: 0,
    totalTokens: 0,
    totalRequests: 0,
    firstRecordedAt: null,
    lastRecordedAt: null,
    byModel: {},
    notice: { lastShownAtRequest: 0, lastMilestoneUsd: 0 },
  };
}

export function savingsPath(): string {
  return join(configDir(), "savings.json");
}

export function resolveBaselineModel(): string {
  const override = process.env["ZEROGPU_SAVINGS_MODEL"];
  if (override && CLAUDE_PRICING[override]) return override;
  return DEFAULT_BASELINE;
}

function pricingFor(model: string): { in: number; out: number } {
  return CLAUDE_PRICING[model] ?? CLAUDE_PRICING[DEFAULT_BASELINE]!;
}

// Fallback only — the API returns real token counts in `usage`.
export function estimateTokens(text: string | undefined): number {
  return Math.max(1, Math.ceil((text?.length ?? 0) / 4));
}

export function computeCallSavings(
  inputTokens: number,
  outputTokens: number,
  baseline: string,
  zgpuModel: string,
): { tokens: number; savingsUsd: number } {
  const claude = pricingFor(baseline);
  const zgpu = ZGPU_PRICING[zgpuModel] ?? ZGPU_FALLBACK;
  const claudeCost =
    (inputTokens * claude.in) / 1_000_000 +
    (outputTokens * claude.out) / 1_000_000;
  const zgpuCost =
    (inputTokens * zgpu.in) / 1_000_000 + (outputTokens * zgpu.out) / 1_000_000;
  return {
    tokens: inputTokens + outputTokens,
    savingsUsd: Math.max(0, claudeCost - zgpuCost),
  };
}

export function readSavings(): SavingsState {
  const path = savingsPath();
  if (!existsSync(path)) return freshState();
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<SavingsState>;
    if (!parsed || typeof parsed !== "object") return freshState();
    return { ...freshState(), ...parsed, notice: { ...freshState().notice, ...parsed.notice } };
  } catch {
    return freshState();
  }
}

export function writeSavings(state: SavingsState): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(savingsPath(), JSON.stringify(state, null, 2), { mode: 0o600 });
}

export function resetSavings(): void {
  writeSavings(freshState());
}

function highestMilestoneCrossed(usd: number): number {
  let crossed = 0;
  for (const m of MILESTONES_USD) {
    if (usd >= m) crossed = m;
  }
  return crossed;
}

// Decide whether to surface the note for the just-recorded state.
export function shouldShowNotice(
  state: SavingsState,
  random: () => number = Math.random,
): boolean {
  const gap = state.totalRequests - state.notice.lastShownAtRequest;
  const milestoneCrossed =
    highestMilestoneCrossed(state.totalSavingsUsd) > state.notice.lastMilestoneUsd;
  if (milestoneCrossed && gap >= 2) return true;
  if (gap < MIN_GAP) return false;
  if (gap >= MAX_GAP) return true;
  return random() < SHOW_PROBABILITY;
}

export interface RecordInput {
  model: string;
  usage?: ResponsesUsage;
  // Fallback text if the API ever omits usage.
  inputText?: string;
  outputText?: string;
}

// Best-effort: records the call and prints the savings note to stderr when the
// cadence says so. Never throws — savings tracking must not affect command
// output or exit codes.
export function recordAndMaybeNotify(input: RecordInput): void {
  try {
    const inputTokens =
      input.usage?.input_tokens ?? estimateTokens(input.inputText);
    const outputTokens =
      input.usage?.output_tokens ?? estimateTokens(input.outputText);

    const baseline = resolveBaselineModel();
    const { tokens, savingsUsd } = computeCallSavings(
      inputTokens,
      outputTokens,
      baseline,
      input.model,
    );

    const state = readSavings();
    const now = new Date().toISOString();

    state.totalSavingsUsd += savingsUsd;
    state.totalTokens += tokens;
    state.totalRequests += 1;
    state.firstRecordedAt = state.firstRecordedAt ?? now;
    state.lastRecordedAt = now;

    const m = (state.byModel[input.model] ??= {
      requests: 0,
      savingsUsd: 0,
      tokens: 0,
    });
    m.requests += 1;
    m.savingsUsd += savingsUsd;
    m.tokens += tokens;

    const show = shouldShowNotice(state);
    if (show) {
      state.notice.lastShownAtRequest = state.totalRequests;
      state.notice.lastMilestoneUsd = Math.max(
        state.notice.lastMilestoneUsd,
        highestMilestoneCrossed(state.totalSavingsUsd),
      );
    }

    writeSavings(state);

    if (show) process.stderr.write(formatNotice(state) + "\n");
  } catch {
    // swallow — never break a command over savings bookkeeping
  }
}

// ── formatting ──────────────────────────────────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtUsd(n: number): string {
  if (n >= 0.01) return `~$${n.toFixed(2)}`;
  return `~$${n.toFixed(4)}`;
}

function fmtTokensShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function fmtDate(iso: string | null, withYear: boolean): string {
  if (!iso) return "today";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "today";
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return withYear ? `${base}, ${d.getFullYear()}` : base;
}

export function formatNotice(state: SavingsState): string {
  return (
    `💰 ZeroGPU savings so far: ${fmtUsd(state.totalSavingsUsd)}  ` +
    `(≈ ${fmtTokensShort(state.totalTokens)} Claude tokens offloaded across ` +
    `${state.totalRequests} routed call${state.totalRequests === 1 ? "" : "s"} ` +
    `since ${fmtDate(state.firstRecordedAt, false)})`
  );
}

export function formatReport(state: SavingsState): string {
  const baseline = resolveBaselineModel();
  const lines: string[] = [];
  lines.push("💰 ZeroGPU Cost Savings");
  lines.push("───────────────────────");

  if (state.totalRequests === 0) {
    lines.push("No routed calls recorded yet.");
    lines.push("");
    lines.push(
      "Run a ZeroGPU task (chat, classify, extract, redact, summarize…) and your",
    );
    lines.push("savings will start accumulating here.");
    return lines.join("\n");
  }

  const avg = state.totalSavingsUsd / state.totalRequests;
  lines.push(`Saved so far:     ${fmtUsd(state.totalSavingsUsd)}`);
  lines.push(
    `Tokens offloaded: ≈ ${state.totalTokens.toLocaleString("en-US")} Claude tokens`,
  );
  lines.push(`Routed calls:     ${state.totalRequests}`);
  lines.push(`Avg per call:     ${fmtUsd(avg)}`);
  lines.push(`Since:            ${fmtDate(state.firstRecordedAt, true)}`);

  const models = Object.entries(state.byModel).sort(
    (a, b) => b[1].savingsUsd - a[1].savingsUsd,
  );
  if (models.length > 0) {
    lines.push("");
    lines.push("By model:");
    for (const [name, m] of models) {
      lines.push(
        `  ${name}  —  ${m.requests} call${m.requests === 1 ? "" : "s"}, ` +
          `${fmtUsd(m.savingsUsd)}, ${fmtTokensShort(m.tokens)} tok`,
      );
    }
  }

  lines.push("");
  lines.push(
    "Token counts and ZeroGPU costs are actual. Dollar savings estimate the Claude",
  );
  lines.push(
    `spend avoided: what these exact tokens would have cost on ${baseline}, minus the`,
  );
  lines.push(
    "real ZeroGPU cost. Set ZEROGPU_SAVINGS_MODEL to compare against another Claude model.",
  );

  return lines.join("\n");
}
