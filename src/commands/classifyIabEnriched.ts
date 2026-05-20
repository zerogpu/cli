import { Command } from "commander";
import { getApiKey, getProjectId } from "../lib/auth.js";

const ENDPOINT = "https://api.zerogpu.ai/v1/responses";
const MODEL = "zlm-v1-iab-classify-edge-enriched";

interface ResponsesApiResponse {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

export function registerClassifyIabEnrichedCommand(program: Command): void {
  program
    .command("classify_iab_enriched <text>")
    .description(
      "Classify text with the IAB enriched edge model (audience, topics, keywords, intent).",
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
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey.apiKey,
            "x-project-id": projectId.projectId,
          },
          body: JSON.stringify({
            model: MODEL,
            input: text,
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
    });
}
