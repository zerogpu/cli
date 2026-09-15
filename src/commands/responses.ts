import { Command } from "commander";
import {
  fail,
  parseJsonObject,
  postJson,
  printContent,
  printJson,
  requireApiKey,
  resolveInput,
} from "../lib/request.js";
import {
  RESPONSES_ENDPOINT,
  extractOutputText,
  type ResponsesApiResponse,
} from "../lib/responses.js";
import { recordAndMaybeNotify } from "../lib/savings.js";

interface ResponsesOptions {
  model: string;
  instructions?: string;
  metadata?: string;
  body?: string;
  raw?: boolean;
}

export function registerResponsesCommand(program: Command): void {
  program
    .command("responses [text]")
    .description(
      "Call the Responses API (/v1/responses) with any model. Reads text from stdin when no argument is given.",
    )
    .requiredOption("-m, --model <model>", "Model id, sent exactly as given.")
    .option("-i, --instructions <instructions>", "System instructions.")
    .option(
      "--metadata <json>",
      'JSON object sent as `metadata`, e.g. \'{"usecase":"redact","mask":"label"}\'',
    )
    .option(
      "--body <json>",
      "JSON object of extra top-level request fields. Fields set by other options take precedence.",
    )
    .option("--raw", "Print the full API response instead of only the output text.")
    .action(async (text: string | undefined, opts: ResponsesOptions) => {
      const apiKey = requireApiKey();
      const extra = parseJsonObject(opts.body, "--body");
      const metadata = parseJsonObject(opts.metadata, "--metadata");
      const input = await resolveInput(text);

      const body: Record<string, unknown> = { ...extra, model: opts.model, input };
      if (opts.instructions !== undefined) body.instructions = opts.instructions;
      if (metadata) body.metadata = metadata;

      const data = (await postJson(RESPONSES_ENDPOINT, apiKey, body)) as ResponsesApiResponse;

      if (opts.raw) {
        printJson(data);
      } else {
        const content = extractOutputText(data);
        if (!content) {
          fail("Response did not contain any output text.", JSON.stringify(data, null, 2));
        }
        printContent(content);
      }

      recordAndMaybeNotify({ model: opts.model, usage: data.usage });
    });
}
