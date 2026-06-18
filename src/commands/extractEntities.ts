import { Command } from "commander";
import { getApiKey, getProjectId } from "../lib/auth.js";
import {
  RESPONSES_ENDPOINT,
  type ResponsesApiResponse,
} from "../lib/responses.js";
import { recordAndMaybeNotify } from "../lib/savings.js";

const MODEL = "gliner2-base-v1";
const DEFAULT_THRESHOLD = 0.3;

function collectLabel(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerExtractEntitiesCommand(program: Command): void {
  program
    .command("extract_entities <text>")
    .alias("extract-entities")
    .description(
      "Extract named entities from text using the GLiNER2 model with custom labels.",
    )
    .option(
      "-l, --label <label>",
      "Entity label to extract (repeatable).",
      collectLabel,
      [],
    )
    .option(
      "--labels <labels>",
      "Comma-separated list of entity labels (alternative to repeating --label).",
    )
    .option(
      "-t, --threshold <number>",
      "Confidence threshold between 0 and 1.",
      `${DEFAULT_THRESHOLD}`,
    )
    .action(
      async (
        text: string,
        opts: { label: string[]; labels?: string; threshold: string },
      ) => {
        const apiKey = getApiKey();
        const projectId = getProjectId();

        if (!apiKey || !projectId) {
          console.error(
            "You're not fully signed in yet. Run 'zerogpu login' to set your API key and project ID.",
          );
          process.exit(1);
        }

        const labels = [
          ...opts.label,
          ...(opts.labels
            ? opts.labels.split(",").map((l) => l.trim()).filter(Boolean)
            : []),
        ];
        if (labels.length === 0) {
          console.error(
            "At least one label is required. Use --label <name> (repeatable) or --labels a,b,c.",
          );
          process.exit(1);
        }

        const threshold = Number(opts.threshold);
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
          console.error("--threshold must be a number between 0 and 1.");
          process.exit(1);
        }

        let response: Response;
        try {
          response = await fetch(RESPONSES_ENDPOINT, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey.apiKey,
              "x-project-id": projectId.projectId,
            },
            body: JSON.stringify({
              model: MODEL,
              input: text,
              metadata: {
                labels,
                usecase: "ner",
                threshold,
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
        const content = data.output?.[0]?.content?.find(
          (c) => c.type === "output_text",
        )?.text ?? data.output?.[0]?.content?.[0]?.text;
        if (!content) {
          console.error("Response did not contain any entity content.");
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
