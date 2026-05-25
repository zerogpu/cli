import { Command } from "commander";
import { getApiKey, getProjectId } from "../lib/auth.js";
import {
  RESPONSES_ENDPOINT,
  type ResponsesApiResponse,
} from "../lib/responses.js";

const MODEL = "deberta-v3-small";

function collectLabel(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerClassifyZeroShotCommand(program: Command): void {
  program
    .command("classify_zero_shot <text>")
    .alias("classify-zero-shot")
    .description(
      "Zero-shot classify text against a set of candidate labels using DeBERTa v3.",
    )
    .option(
      "-l, --label <label>",
      "Candidate label (repeatable).",
      collectLabel,
      [],
    )
    .option(
      "--labels <labels>",
      "Comma-separated list of candidate labels (alternative to repeating --label).",
    )
    .action(
      async (
        text: string,
        opts: { label: string[]; labels?: string },
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

        const instructions = `[${labels.join(", ")}]`;

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
              instructions,
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
          console.error("Response did not contain any classification content.");
          console.error(JSON.stringify(data, null, 2));
          process.exit(1);
        }

        try {
          const parsed = JSON.parse(content);
          console.log(JSON.stringify(parsed, null, 2));
        } catch {
          console.log(content);
        }
      },
    );
}
