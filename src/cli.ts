import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

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

  return program;
}

export function run(argv: string[]): void {
  buildProgram().parse(argv);
}
