import { Command } from "commander";
import { formatReport, readSavings, resetSavings } from "../lib/savings.js";

export function registerCostSavingsCommand(program: Command): void {
  program
    .command("cost_savings")
    .alias("cost-savings")
    .description(
      "Show how much you've saved by routing tasks to ZeroGPU instead of your frontier model.",
    )
    .option("--json", "Output the raw savings data as JSON.")
    .option("--reset", "Clear all recorded savings and start over.")
    .action((opts: { json?: boolean; reset?: boolean }) => {
      if (opts.reset) {
        resetSavings();
        console.log("ZeroGPU savings have been reset.");
        return;
      }

      const state = readSavings();
      if (opts.json) {
        console.log(JSON.stringify(state, null, 2));
        return;
      }

      console.log(formatReport(state));
    });
}
