import { getApiKey } from "./auth.js";

// Shared plumbing for the endpoint commands — `responses`, `chat_completions`,
// `moderations`, and `embeddings`. They send whatever model the caller names
// and keep no model list, so a new or renamed model never needs a CLI release.

export function fail(...lines: string[]): never {
  for (const line of lines) console.error(line);
  process.exit(1);
}

export function requireApiKey(): string {
  const resolved = getApiKey();
  if (!resolved) {
    fail("You're not fully signed in yet. Run 'zerogpu login' to set your API key.");
  }
  return resolved.apiKey;
}

export interface InputStream extends AsyncIterable<Buffer | string> {
  isTTY?: boolean;
}

// Text comes from the positional argument, or from stdin when it is piped, which
// keeps very large prompts off the command line. Trailing newlines from stdin are
// dropped, the same way shell `$(...)` drops them.
export async function resolveInput(
  text: string | undefined,
  stdin: InputStream = process.stdin,
): Promise<string> {
  let input = text;
  if (input === undefined && !stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
    input = Buffer.concat(chunks).toString("utf8").replace(/[\r\n]+$/, "");
  }
  if (!input) fail("No input text. Pass it as an argument or pipe it on stdin.");
  return input;
}

export function parseJsonObject(
  value: string | undefined,
  flag: string,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Invalid ${flag} JSON: ${message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${flag} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

export async function postJson(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Request failed: ${message}`);
  }

  if (!response.ok) {
    const errBody = await response.text();
    fail(`Request failed with status ${response.status}.`, ...(errBody ? [errBody] : []));
  }

  return response.json();
}

// Pretty-print model output that is JSON; print anything else verbatim.
export function printContent(content: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.log(content);
    return;
  }
  console.log(JSON.stringify(parsed, null, 2));
}

export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}
