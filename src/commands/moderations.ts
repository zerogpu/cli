import { Command } from "commander";
import { toResponsesUsage, type ChatCompletionsUsage } from "../lib/chatCompletions.js";
import {
  parseJsonObject,
  postJson,
  printJson,
  requireApiKey,
  resolveInput,
} from "../lib/request.js";
import { recordAndMaybeNotify } from "../lib/savings.js";

export const MODERATIONS_ENDPOINT = "https://api.zerogpu.ai/v1/moderations";

export function registerModerationsCommand(program: Command): void {
  program
    .command("moderations [text]")
    .description(
      "Call the Moderations API (/v1/moderations) with any model and print the response. Reads text from stdin when no argument is given.",
    )
    .requiredOption("-m, --model <model>", "Model id, sent exactly as given.")
    .option(
      "--body <json>",
      "JSON object of extra top-level request fields. Fields set by other options take precedence.",
    )
    .action(async (text: string | undefined, opts: { model: string; body?: string }) => {
      const apiKey = requireApiKey();
      const extra = parseJsonObject(opts.body, "--body");
      const input = await resolveInput(text);

      const data = (await postJson(MODERATIONS_ENDPOINT, apiKey, {
        ...extra,
        model: opts.model,
        input,
      })) as { usage?: ChatCompletionsUsage };

      printJson(data);

      recordAndMaybeNotify({ model: opts.model, usage: toResponsesUsage(data.usage) });
    });
}
