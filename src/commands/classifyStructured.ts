import { Command } from "commander";
import { getApiKey, getProjectId } from "../lib/auth.js";
import {
  RESPONSES_ENDPOINT,
  type ResponsesApiResponse,
} from "../lib/responses.js";
import { recordAndMaybeNotify } from "../lib/savings.js";

const MODEL = "gliner2-base-v1";

export function registerClassifyStructuredCommand(program: Command): void {
  program
    .command("classify_structured <text>")
    .alias("classify-structured")
    .description(
      "Classify text against a structured schema of categories and labels.",
    )
    .requiredOption(
      "-s, --schema <json>",
      'JSON object mapping category name to allowed labels, e.g. \'{"sentiment":["positive","negative","neutral"]}\'',
    )
    .action(async (text: string, opts: { schema: string }) => {
      const apiKey = getApiKey();
      const projectId = getProjectId();

      if (!apiKey || !projectId) {
        console.error(
          "You're not fully signed in yet. Run 'zerogpu login' to set your API key and project ID.",
        );
        process.exit(1);
      }

      let schema: unknown;
      try {
        schema = JSON.parse(opts.schema);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Invalid --schema JSON: ${message}`);
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
              schema,
              usecase: "classification",
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

      recordAndMaybeNotify({ model: MODEL, usage: data.usage });
    });
}
