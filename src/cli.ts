import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
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
) as { version: string };

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
  buildProgram().parse(argv);
}
