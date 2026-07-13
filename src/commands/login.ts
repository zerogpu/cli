import { spawn } from "node:child_process";
import { Command } from "commander";
import { validateApiKey } from "../lib/auth.js";
import { writeConfig, readConfig } from "../lib/config.js";
import { promptMasked } from "../lib/prompt.js";
import { upsertEnvExport } from "../lib/shellEnv.js";

interface LoginOptions {
  apiKey?: string;
}

const DASHBOARD_URL = "https://platform.zerogpu.ai/dashboard";

function openBrowser(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let command: string;
    let args: string[];
    if (process.platform === "darwin") {
      command = "open";
      args = [url];
    } else if (process.platform === "win32") {
      command = "cmd";
      args = ["/c", "start", "", url];
    } else {
      command = "xdg-open";
      args = [url];
    }
    try {
      const child = spawn(command, args, {
        stdio: "ignore",
        detached: true,
      });
      child.on("error", () => resolve(false));
      child.on("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Sign in to ZeroGPU with your API key.")
    .option("--api-key <key>", "Provide your API key directly (skips the prompt).")
    .action(async (options: LoginOptions) => {
      let rawKey = options.apiKey;

      if (!rawKey) {
        const opened = await openBrowser(DASHBOARD_URL);
        if (opened) {
          console.log(
            `Opening ${DASHBOARD_URL} in your browser — grab your API Key from there.`,
          );
        } else {
          console.log(
            `Tip: open ${DASHBOARD_URL} in your browser to grab your API Key.`,
          );
        }
      }

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

      const existing = readConfig();
      writeConfig({ ...existing, apiKey: result.key });

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
