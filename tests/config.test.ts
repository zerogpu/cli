import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeConfig, readConfig, configPath } from "../src/lib/config.js";

let tmpHome: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "zerogpu-test-"));
  originalHome = process.env["HOME"];
  originalUserProfile = process.env["USERPROFILE"];
  process.env["HOME"] = tmpHome;
  process.env["USERPROFILE"] = tmpHome;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (originalUserProfile === undefined) delete process.env["USERPROFILE"];
  else process.env["USERPROFILE"] = originalUserProfile;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe("config round trip", () => {
  it("writes and reads the api key", () => {
    writeConfig({ apiKey: "zgpu-api-test-key" });
    expect(readConfig().apiKey).toBe("zgpu-api-test-key");
    const st = statSync(configPath());
    if (process.platform !== "win32") {
      expect(st.mode & 0o777).toBe(0o600);
    }
  });

  it("returns empty object when file missing", () => {
    expect(readConfig()).toEqual({});
  });
});
