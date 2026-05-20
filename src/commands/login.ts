import { Command } from "commander";
import { validateApiKey, validateProjectId } from "../lib/auth.js";
import { writeConfig, readConfig } from "../lib/config.js";
import { promptMasked, promptPlain } from "../lib/prompt.js";
import { upsertEnvExport } from "../lib/shellEnv.js";

interface LoginOptions {
  apiKey?: string;
  projectId?: string;
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Sign in to ZeroGPU with your API key.")
    .option("--api-key <key>", "Provide your API key directly (skips the prompt).")
    .option(
      "--project-id <id>",
      "Provide your ZeroGPU project ID directly (skips the prompt).",
    )
    .action(async (options: LoginOptions) => {
      let rawKey = options.apiKey;
      if (!rawKey) {
        try {
          rawKey = await promptMasked("Please paste your ZeroGPU API key: ");
        } catch {
          console.error("Login cancelled. No changes were made.");
          process.exit(1);
        }
      }

      const result = validateApiKey(rawKey ?? "");
      if (!result.ok) {
        console.error(`That doesn't look like a valid API key — ${result.reason}`);
        console.error("Your key should start with \"zgpu-api-\". Please try again.");
        process.exit(1);
      }

      let rawProjectId = options.projectId;
      if (!rawProjectId) {
        try {
          rawProjectId = await promptPlain("Please enter your ZeroGPU project ID: ");
        } catch {
          console.error("Login cancelled. No changes were made.");
          process.exit(1);
        }
      }

      const projectResult = validateProjectId(rawProjectId ?? "");
      if (!projectResult.ok) {
        console.error(
          `That doesn't look like a valid project ID — ${projectResult.reason}`,
        );
        console.error(
          "It should be a UUID like 4ed3e5bb-c2ed-4d4a-8a66-2b161a27fd1a. Please try again.",
        );
        process.exit(1);
      }

      const existing = readConfig();
      writeConfig({
        ...existing,
        apiKey: result.key,
        projectId: projectResult.key,
      });

      const env = upsertEnvExport("ZEROGPU_API_KEY", result.key);
      process.env["ZEROGPU_API_KEY"] = result.key;

      console.log("You're logged in. Your API key has been saved.");
      if (env.shell === "windows") {
        console.log(
          env.note ??
            "We also tried to save it as an environment variable for other tools.",
        );
        console.log(
          "Tip: open a new terminal window so other programs can see ZEROGPU_API_KEY.",
        );
      } else {
        console.log(
          `We also added ZEROGPU_API_KEY to your shell config (${env.path}) so other tools can use it.`,
        );
        console.log(
          `To use it right away in this terminal, run:  source ${env.path}`,
        );
        console.log("Or just open a new terminal window — it'll be there automatically.");
      }
    });
}
