import { Command } from "commander";
import { API_KEY_PREFIX, getApiKey } from "../lib/auth.js";

function maskKey(key: string): string {
  const body = key.startsWith(API_KEY_PREFIX)
    ? key.slice(API_KEY_PREFIX.length)
    : key;
  const last4 = body.slice(-4);
  return `${API_KEY_PREFIX}****${last4}`;
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Check whether you're signed in to ZeroGPU.")
    .action(() => {
      const resolved = getApiKey();
      if (resolved) {
        const where =
          resolved.source === "config file"
            ? "saved on this computer"
            : "from your ZEROGPU_API_KEY environment variable";
        console.log("You're signed in to ZeroGPU.");
        console.log(`  API key: ${maskKey(resolved.apiKey)}  (${where})`);
      } else {
        console.log("You're not signed in yet.");
        console.log("Run 'zerogpu login' to get started.");
        process.exit(1);
      }
    });
}
