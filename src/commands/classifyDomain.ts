import { Command } from "commander";
import { getApiKey } from "../lib/auth.js";
import {
  RESPONSES_ENDPOINT,
  extractOutputText,
  type ResponsesApiResponse,
} from "../lib/responses.js";
import { recordAndMaybeNotify } from "../lib/savings.js";

const MODEL = "zlm-v1-iab-domain-classifier";

export function registerClassifyDomainCommand(program: Command): void {
  program
    .command("classify_domain <domain>")
    .alias("classify-domain")
    .description(
      "Classify a domain name with the IAB domain edge model (content, topics, keywords, intent).",
    )
    .action(async (domain: string) => {
      const apiKey = getApiKey();

      if (!apiKey) {
        console.error(
          "You're not fully signed in yet. Run 'zerogpu login' to set your API key.",
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
          },
          body: JSON.stringify({
            model: MODEL,
            input: domain,
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
      const content = extractOutputText(data);
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
