import { Command } from "commander";
import { getApiKey } from "../lib/auth.js";
import {
  CHAT_COMPLETIONS_ENDPOINT,
  toResponsesUsage,
  type ChatCompletionsApiResponse,
} from "../lib/chatCompletions.js";
import {
  RESPONSES_ENDPOINT,
  extractOutputText,
  extractReasoningText,
  type ResponsesApiResponse,
  type ResponsesUsage,
} from "../lib/responses.js";
import { recordAndMaybeNotify } from "../lib/savings.js";

const DEFAULT_MODEL = "LFM2.5-1.2B-Instruct";

// Text-generation models `--model` accepts, and the API each one speaks.
// qwen3-30b-a3b-fp8, glm-5.2, and deepseek-v4-flash are Chat Completions only —
// they have no Responses endpoint.
// Source: https://docs.zerogpu.ai/docs/text-generation
const CHAT_MODELS: Record<string, "responses" | "chat-completions"> = {
  "LFM2.5-1.2B-Instruct": "responses",
  "LFM2.5-1.2B-Thinking": "responses",
  "gpt-oss-120b": "responses",
  "qwen3-30b-a3b-fp8": "chat-completions",
  "glm-5.2": "chat-completions",
  "deepseek-v4-flash": "chat-completions",
};

// Model ids are case-sensitive to the API but not to the person typing them.
function resolveModel(name: string): string | undefined {
  return Object.keys(CHAT_MODELS).find(
    (id) => id.toLowerCase() === name.toLowerCase(),
  );
}

export function registerChatCommand(program: Command): void {
  program
    .command("chat <text>")
    .description(
      `Chat with a ZeroGPU text-generation model (default ${DEFAULT_MODEL}).`,
    )
    .option(
      "-i, --instructions <instructions>",
      "System instructions that steer the assistant's behavior.",
    )
    .option(
      "-m, --model <model>",
      `Model to use: ${Object.keys(CHAT_MODELS).join(", ")}.`,
      DEFAULT_MODEL,
    )
    .option(
      "-r, --reasoning",
      "Also print the reasoning trace, for models that return one.",
    )
    .action(
      async (
        text: string,
        opts: { instructions?: string; model: string; reasoning?: boolean },
      ) => {
        const model = resolveModel(opts.model);

        if (!model) {
          console.error(
            `Unknown model '${opts.model}'. Available models: ${Object.keys(
              CHAT_MODELS,
            ).join(", ")}.`,
          );
          process.exit(1);
        }

        const apiKey = getApiKey();

        if (!apiKey) {
          console.error(
            "You're not fully signed in yet. Run 'zerogpu login' to set your API key.",
          );
          process.exit(1);
        }

        const useChatCompletions = CHAT_MODELS[model] === "chat-completions";

        const body: Record<string, unknown> = useChatCompletions
          ? {
              model,
              messages: [
                ...(opts.instructions
                  ? [{ role: "system", content: opts.instructions }]
                  : []),
                { role: "user", content: text },
              ],
            }
          : { model, input: text };
        if (!useChatCompletions && opts.instructions) {
          body.instructions = opts.instructions;
        }

        let response: Response;
        try {
          response = await fetch(
            useChatCompletions ? CHAT_COMPLETIONS_ENDPOINT : RESPONSES_ENDPOINT,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-api-key": apiKey.apiKey,
              },
              body: JSON.stringify(body),
            },
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Request failed: ${message}`);
          process.exit(1);
        }

        if (!response.ok) {
          const errBody = await response.text();
          console.error(`Request failed with status ${response.status}.`);
          if (errBody) console.error(errBody);
          process.exit(1);
        }

        const payload: unknown = await response.json();

        let content: string | undefined;
        let reasoning: string | undefined;
        let usage: ResponsesUsage | undefined;

        if (useChatCompletions) {
          const data = payload as ChatCompletionsApiResponse;
          const message = data.choices?.[0]?.message;
          content = message?.content;
          reasoning = message?.reasoning;
          usage = toResponsesUsage(data.usage);
        } else {
          const data = payload as ResponsesApiResponse;
          content = extractOutputText(data);
          reasoning = extractReasoningText(data);
          usage = data.usage;
        }

        if (!content) {
          console.error("Response did not contain any chat content.");
          console.error(JSON.stringify(payload, null, 2));
          process.exit(1);
        }

        if (opts.reasoning && reasoning) {
          console.log(`Reasoning:\n${reasoning}\n`);
        }

        try {
          const parsed = JSON.parse(content);
          console.log(JSON.stringify(parsed, null, 2));
        } catch {
          console.log(content);
        }

        recordAndMaybeNotify({ model, usage });
      },
    );
}
