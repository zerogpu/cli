import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertEnvExport } from "../src/lib/shellEnv.js";

let tmpHome: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;
let originalShell: string | undefined;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "zerogpu-rc-"));
  originalHome = process.env["HOME"];
  originalUserProfile = process.env["USERPROFILE"];
  originalShell = process.env["SHELL"];
  process.env["HOME"] = tmpHome;
  process.env["USERPROFILE"] = tmpHome;
  process.env["SHELL"] = "/bin/zsh";
});

afterEach(() => {
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (originalUserProfile === undefined) delete process.env["USERPROFILE"];
  else process.env["USERPROFILE"] = originalUserProfile;
  if (originalShell === undefined) delete process.env["SHELL"];
  else process.env["SHELL"] = originalShell;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe("upsertEnvExport", () => {
  it("appends an export block to a fresh rc file", () => {
    if (process.platform === "win32") return;
    const res = upsertEnvExport("ZEROGPU_API_KEY", "zgpu-api-aaa");
    expect(res.path).toBe(join(tmpHome, ".zshrc"));
    const contents = readFileSync(res.path, "utf8");
    expect(contents).toContain('export ZEROGPU_API_KEY="zgpu-api-aaa"');
    expect(contents).toContain("# >>> zerogpu cli >>>");
    expect(contents).toContain("# <<< zerogpu cli <<<");
  });

  it("replaces the existing block, no duplicates", () => {
    if (process.platform === "win32") return;
    writeFileSync(join(tmpHome, ".zshrc"), "echo hi\n");
    upsertEnvExport("ZEROGPU_API_KEY", "zgpu-api-aaa");
    upsertEnvExport("ZEROGPU_API_KEY", "zgpu-api-bbb");
    const contents = readFileSync(join(tmpHome, ".zshrc"), "utf8");
    expect(contents).toContain("echo hi");
    expect(contents).toContain('export ZEROGPU_API_KEY="zgpu-api-bbb"');
    expect(contents).not.toContain("zgpu-api-aaa");
    const occurrences = contents.match(/# >>> zerogpu cli >>>/g) ?? [];
    expect(occurrences.length).toBe(1);
  });
});
