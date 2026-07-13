import { Command } from "commander";
import { getApiKey } from "../lib/auth.js";
import {
  RESPONSES_ENDPOINT,
  type ResponsesApiResponse,
} from "../lib/responses.js";
import { recordAndMaybeNotify } from "../lib/savings.js";

const MODEL = "gliner-multi-pii-v1";
const DEFAULT_THRESHOLD = 0.5;
const DEFAULT_CATEGORIES = ["identity", "contact"];

export function registerExtractPiiCommand(program: Command): void {
  program
    .command("extract_pii <text>")
    .alias("extract-pii")
    .description(
      "Extract PII entities from text (persons, emails, phone numbers, etc.).",
    )
    .option(
      "-t, --threshold <number>",
      "Confidence threshold for entity extraction.",
      String(DEFAULT_THRESHOLD),
    )
    .option(
      "-c, --categories <list>",
      "Comma-separated list of PII categories to extract.",
      DEFAULT_CATEGORIES.join(","),
    )
    .action(
      async (
        text: string,
        opts: { threshold: string; categories: string },
      ) => {
        const apiKey = getApiKey();

        if (!apiKey) {
          console.error(
            "You're not fully signed in yet. Run 'zerogpu login' to set your API key.",
          );
          process.exit(1);
        }

        const threshold = Number(opts.threshold);
        if (!Number.isFinite(threshold)) {
          console.error(`Invalid threshold: ${opts.threshold}`);
          process.exit(1);
        }
        const categories = opts.categories
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c.length > 0);

        let response: Response;
        try {
          response = await fetch(RESPONSES_ENDPOINT, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey.apiKey,
            },
            body: JSON.stringify({
              model: MODEL,
              input: text,
              metadata: {
                usecase: "extract-pii",
                threshold,
                categories,
              },
            }),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Request failed: ${message}`);
          process.exit(1);
        }

        if (!response.ok) {
          const body = await response.text();
          console.error(`Request failed with status ${response.status}.`);
          if (body) console.error(body);
          process.exit(1);
        }

        const data = (await response.json()) as ResponsesApiResponse;
        const content =
          data.output?.[0]?.content?.find((c) => c.type === "output_text")
            ?.text ?? data.output?.[0]?.content?.[0]?.text;
        if (!content) {
          console.error("Response did not contain any extraction content.");
          console.error(JSON.stringify(data, null, 2));
          process.exit(1);
        }

        try {
          const parsed = JSON.parse(content);
          console.log(JSON.stringify(parsed, null, 2));
        } catch {
          console.log(content);
        }

        recordAndMaybeNotify({ model: MODEL, usage: data.usage });
      },
    );
}
