import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import updateNotifier from "update-notifier";
import { registerChatCommand } from "./commands/chat.js";
import { registerChatThinkingCommand } from "./commands/chatThinking.js";
import { registerClassifyIabCommand } from "./commands/classifyIab.js";
import { registerClassifyIabEnrichedCommand } from "./commands/classifyIabEnriched.js";
import { registerClassifyStructuredCommand } from "./commands/classifyStructured.js";
import { registerClassifyZeroShotCommand } from "./commands/classifyZeroShot.js";
import { registerExtractEntitiesCommand } from "./commands/extractEntities.js";
import { registerExtractJsonCommand } from "./commands/extractJson.js";
import { registerExtractPiiCommand } from "./commands/extractPii.js";
import { registerGenerateFollowupsCommand } from "./commands/generateFollowups.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerRedactPiiCommand } from "./commands/redactPii.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerSummarizeCommand } from "./commands/summarize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "..", "package.json"), "utf8"),
) as { name: string; version: string };

const MIN_SUPPORTED_VERSION = "2.0.0";

function parseVersion(v: string): [number, number, number] {
  const parts = (v.split("-")[0] ?? "0.0.0")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isVersionBelow(current: string, minimum: string): boolean {
  const [ca, cb, cc] = parseVersion(current);
  const [ma, mb, mc] = parseVersion(minimum);
  if (ca !== ma) return ca < ma;
  if (cb !== mb) return cb < mb;
  return cc < mc;
}

function warnIfBelowMinimum(): void {
  if (isVersionBelow(pkg.version, MIN_SUPPORTED_VERSION)) {
    process.stderr.write(
      `\x1b[33m⚠️  zerogpu-cli ${pkg.version} is below the minimum supported version (${MIN_SUPPORTED_VERSION}).\x1b[0m\n` +
        `Some features may not work correctly. Please update:\n` +
        `  npm i -g zerogpu-cli@latest\n\n`,
    );
  }
}

function notifyUpdate(): void {
  const notifier = updateNotifier({
    pkg,
    updateCheckInterval: 1000 * 60 * 60 * 24,
  });
  const update = notifier.update;
  if (!update) return;

  if (update.type === "major") {
    notifier.notify({
      defer: false,
      isGlobal: true,
      message:
        "⚠️  BREAKING update available: {currentVersion} → {latestVersion}\n" +
        "This is a major release and may include breaking changes.\n" +
        "Update now: {updateCommand}",
    });
  } else if (update.type === "minor") {
    notifier.notify({
      defer: false,
      isGlobal: true,
      message:
        "New features available: {currentVersion} → {latestVersion}\n" +
        "Please update: {updateCommand}",
    });
  } else {
    process.stderr.write(
      `\x1b[2m(zerogpu-cli ${update.latest} available — run \`npm i -g zerogpu-cli@latest\` to update)\x1b[0m\n`,
    );
  }
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("zerogpu")
    .description("Command-line interface for ZeroGPU.")
    .version(pkg.version, "-v, --version", "Output the current version.");

  registerLoginCommand(program);
  registerStatusCommand(program);
  registerClassifyIabCommand(program);
  registerClassifyIabEnrichedCommand(program);
  registerClassifyStructuredCommand(program);
  registerClassifyZeroShotCommand(program);
  registerGenerateFollowupsCommand(program);
  registerRedactPiiCommand(program);
  registerExtractPiiCommand(program);
  registerExtractEntitiesCommand(program);
  registerExtractJsonCommand(program);
  registerSummarizeCommand(program);
  registerChatCommand(program);
  registerChatThinkingCommand(program);

  return program;
}

export function run(argv: string[]): void {
  warnIfBelowMinimum();
  notifyUpdate();
  buildProgram().parse(argv);
}
