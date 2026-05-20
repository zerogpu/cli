import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

export interface UpsertResult {
  path: string;
  shell: "zsh" | "bash" | "fish" | "posix" | "windows";
  note?: string;
}

const SENTINEL_START = "# >>> zerogpu cli >>>";
const SENTINEL_END = "# <<< zerogpu cli <<<";

function detectShell(): "zsh" | "bash" | "fish" | "posix" {
  const shell = basename(process.env["SHELL"] ?? "").toLowerCase();
  if (shell === "zsh") return "zsh";
  if (shell === "bash") return "bash";
  if (shell === "fish") return "fish";
  return "posix";
}

function rcPathFor(shell: "zsh" | "bash" | "fish" | "posix"): string {
  const home = homedir();
  switch (shell) {
    case "zsh":
      return join(home, ".zshrc");
    case "bash":
      return join(home, process.platform === "darwin" ? ".bash_profile" : ".bashrc");
    case "fish":
      return join(home, ".config", "fish", "config.fish");
    default:
      return join(home, ".profile");
  }
}

function buildBlock(
  shell: "zsh" | "bash" | "fish" | "posix",
  name: string,
  value: string,
): string {
  const safe = value.replace(/"/g, '\\"');
  const line =
    shell === "fish"
      ? `set -x ${name} "${safe}"`
      : `export ${name}="${safe}"`;
  return `${SENTINEL_START}\n${line}\n${SENTINEL_END}\n`;
}

function stripExisting(content: string): string {
  const startIdx = content.indexOf(SENTINEL_START);
  if (startIdx === -1) return content;
  const endIdx = content.indexOf(SENTINEL_END, startIdx);
  if (endIdx === -1) return content;
  const after = content.slice(endIdx + SENTINEL_END.length);
  const before = content.slice(0, startIdx).replace(/\s+$/, "");
  const trimmedAfter = after.replace(/^\s*\n/, "");
  return (before ? before + "\n" : "") + trimmedAfter;
}

export function upsertEnvExport(name: string, value: string): UpsertResult {
  if (process.platform === "win32") {
    const res = spawnSync("setx", [name, value], { stdio: "ignore" });
    return {
      path: "(Windows user environment via setx)",
      shell: "windows",
      note:
        res.status === 0
          ? "We saved ZEROGPU_API_KEY to your Windows user environment so other tools can use it."
          : "Heads up: we couldn't save ZEROGPU_API_KEY as a system environment variable, but your key is still saved and the CLI will work fine.",
    };
  }

  const shell = detectShell();
  const path = rcPathFor(shell);
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const stripped = stripExisting(existing);
  const block = buildBlock(shell, name, value);
  const needsLeadingNewline = stripped.length > 0 && !stripped.endsWith("\n");
  const next = stripped + (needsLeadingNewline ? "\n" : "") + block;

  if (existsSync(path)) {
    writeFileSync(path, next);
  } else {
    // fish config may need its directory created; for the rest, the parent
    // is always $HOME which exists.
    if (shell === "fish") {
      mkdirSync(join(homedir(), ".config", "fish"), { recursive: true });
    }
    appendFileSync(path, next);
  }

  return { path, shell };
}
