import { Command } from "commander";
import { getApiKey, getProjectId } from "../lib/auth.js";
import {
  RESPONSES_ENDPOINT,
  type ResponsesApiResponse,
} from "../lib/responses.js";

const MODEL = "gliner-multi-pii-v1";

export function registerRedactPiiCommand(program: Command): void {
  program
    .command("redact_pii <text>")
    .alias("redact-pii")
    .description(
      "Detect and redact PII entities in text (persons, phone numbers, emails, etc.).",
    )
    .action(async (text: string) => {
      const apiKey = getApiKey();
      const projectId = getProjectId();

      if (!apiKey || !projectId) {
        console.error(
          "You're not fully signed in yet. Run 'zerogpu login' to set your API key and project ID.",
        );
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
              mask: "label",
              usecase: "redact",
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
        console.error("Response did not contain any redaction content.");
        console.error(JSON.stringify(data, null, 2));
        process.exit(1);
      }

      try {
        const parsed = JSON.parse(content);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(content);
      }
    });
}
