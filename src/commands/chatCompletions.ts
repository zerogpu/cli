import { Command } from "commander";
import {
  CHAT_COMPLETIONS_ENDPOINT,
  toResponsesUsage,
  type ChatCompletionsApiResponse,
} from "../lib/chatCompletions.js";
import {
  fail,
  parseJsonObject,
  postJson,
  printContent,
  printJson,
  requireApiKey,
  resolveInput,
} from "../lib/request.js";
import { recordAndMaybeNotify } from "../lib/savings.js";

interface ChatCompletionsOptions {
  model: string;
  instructions?: string;
  metadata?: string;
  body?: string;
  raw?: boolean;
}

export function registerChatCompletionsCommand(program: Command): void {
  program
    .command("chat_completions [text]")
    .alias("chat-completions")
    .description(
      "Call the Chat Completions API (/v1/chat/completions) with any model. Reads text from stdin when no argument is given.",
    )
    .requiredOption("-m, --model <model>", "Model id, sent exactly as given.")
    .option("-i, --instructions <instructions>", "System message sent ahead of the text.")
    .option(
      "--metadata <json>",
      'JSON object sent as `metadata`, e.g. \'{"usecase":"ner","labels":["person"],"threshold":0.3}\'',
    )
    .option(
      "--body <json>",
      "JSON object of extra top-level request fields. Fields set by other options take precedence.",
    )
    .option("--raw", "Print the full API response instead of only the message content.")
    .action(async (text: string | undefined, opts: ChatCompletionsOptions) => {
      const apiKey = requireApiKey();
      const extra = parseJsonObject(opts.body, "--body");
      const metadata = parseJsonObject(opts.metadata, "--metadata");
      const input = await resolveInput(text);

      const body: Record<string, unknown> = {
        ...extra,
        model: opts.model,
        messages: [
          ...(opts.instructions !== undefined
            ? [{ role: "system", content: opts.instructions }]
            : []),
          { role: "user", content: input },
        ],
      };
      if (metadata) body.metadata = metadata;

      const data = (await postJson(
        CHAT_COMPLETIONS_ENDPOINT,
        apiKey,
        body,
      )) as ChatCompletionsApiResponse;

      if (opts.raw) {
        printJson(data);
      } else {
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          fail("Response did not contain any message content.", JSON.stringify(data, null, 2));
        }
        printContent(content);
      }

      recordAndMaybeNotify({ model: opts.model, usage: toResponsesUsage(data.usage) });
    });
}
