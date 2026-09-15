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

export const EMBEDDINGS_ENDPOINT = "https://api.zerogpu.ai/v1/embeddings";

export function registerEmbeddingsCommand(program: Command): void {
  program
    .command("embeddings [text]")
    .description(
      "Call the Embeddings API (/v1/embeddings) with any model and print the response. Reads text from stdin when no argument is given.",
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

      const data = (await postJson(EMBEDDINGS_ENDPOINT, apiKey, {
        ...extra,
        model: opts.model,
        input,
      })) as { usage?: ChatCompletionsUsage };

      printJson(data);

      // Embedding models bill input tokens only; the API reports no completion
      // tokens, so the output side is estimated and priced at zero.
      recordAndMaybeNotify({ model: opts.model, usage: toResponsesUsage(data.usage) });
    });
}
