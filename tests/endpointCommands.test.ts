import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProgram } from "../src/cli.js";
import { CHAT_COMPLETIONS_ENDPOINT } from "../src/lib/chatCompletions.js";
import { resolveInput } from "../src/lib/request.js";
import { RESPONSES_ENDPOINT } from "../src/lib/responses.js";
import { readSavings } from "../src/lib/savings.js";

let tmpHome: string;
let originalHome: string | undefined;
let originalApiKey: string | undefined;
let fetchMock: ReturnType<typeof vi.fn>;
let logSpy: MockInstance;
let errorSpy: MockInstance;

function respondWith(payload: unknown, status = 200): void {
  fetchMock.mockResolvedValue(
    new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status }),
  );
}

function sentRequest(): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  };
}

function printed(): string {
  return logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
}

async function zerogpu(...args: string[]): Promise<void> {
  await buildProgram().parseAsync(["node", "zerogpu", ...args]);
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "zerogpu-endpoint-test-"));
  originalHome = process.env["HOME"];
  originalApiKey = process.env["ZEROGPU_API_KEY"];
  process.env["HOME"] = tmpHome;
  process.env["ZEROGPU_API_KEY"] = "zgpu-api-test";

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`exit ${code}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (originalApiKey === undefined) delete process.env["ZEROGPU_API_KEY"];
  else process.env["ZEROGPU_API_KEY"] = originalApiKey;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe("responses", () => {
  const payload = {
    output: [
      { type: "reasoning", content: [{ type: "reasoning_text", text: "thinking" }] },
      { type: "message", content: [{ type: "output_text", text: '{"label":"sports"}' }] },
    ],
    usage: { input_tokens: 12, output_tokens: 4 },
  };

  it("posts the model, input, instructions, and metadata, and prints the output text", async () => {
    respondWith(payload);
    await zerogpu(
      "responses",
      "The Lakers won.",
      "-m",
      "gliner2-base-v1",
      "-i",
      "Be brief.",
      "--metadata",
      '{"usecase":"ner","labels":["team"]}',
    );

    const req = sentRequest();
    expect(req.url).toBe(RESPONSES_ENDPOINT);
    expect(req.headers["x-api-key"]).toBe("zgpu-api-test");
    expect(req.body).toEqual({
      model: "gliner2-base-v1",
      input: "The Lakers won.",
      instructions: "Be brief.",
      metadata: { usecase: "ner", labels: ["team"] },
    });
    expect(printed()).toBe(JSON.stringify({ label: "sports" }, null, 2));
  });

  it("sends a model id no list in the CLI knows about", async () => {
    respondWith(payload);
    await zerogpu("responses", "hi", "-m", "some-model-released-tomorrow");
    expect(sentRequest().body.model).toBe("some-model-released-tomorrow");
  });

  it("merges --body fields, with option-set fields taking precedence", async () => {
    respondWith(payload);
    await zerogpu(
      "responses",
      "hi",
      "-m",
      "gpt-oss-120b",
      "--body",
      '{"max_output_tokens":64,"model":"ignored"}',
    );
    expect(sentRequest().body).toEqual({
      max_output_tokens: 64,
      model: "gpt-oss-120b",
      input: "hi",
    });
  });

  it("prints the whole response with --raw", async () => {
    respondWith(payload);
    await zerogpu("responses", "hi", "-m", "gpt-oss-120b", "--raw");
    expect(printed()).toBe(JSON.stringify(payload, null, 2));
  });

  it("records savings under the requested model", async () => {
    respondWith(payload);
    await zerogpu("responses", "hi", "-m", "gliner2-base-v1");
    const savings = readSavings();
    expect(savings.totalRequests).toBe(1);
    expect(savings.totalTokens).toBe(16);
    expect(savings.byModel["gliner2-base-v1"]?.requests).toBe(1);
  });

  it("exits 1 when the response has no output text", async () => {
    respondWith({ output: [] });
    await expect(zerogpu("responses", "hi", "-m", "gpt-oss-120b")).rejects.toThrow("exit 1");
    expect(errorSpy).toHaveBeenCalledWith("Response did not contain any output text.");
  });
});

describe("chat_completions", () => {
  const payload = {
    choices: [{ message: { content: "Hello there.", reasoning: "hidden" } }],
    usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 },
  };

  it("sends instructions as a system message plus metadata, and prints the content", async () => {
    respondWith(payload);
    await zerogpu(
      "chat_completions",
      "Say hi.",
      "-m",
      "qwen3-30b-a3b-fp8",
      "-i",
      "You are terse.",
      "--metadata",
      '{"usecase":"ner"}',
    );

    const req = sentRequest();
    expect(req.url).toBe(CHAT_COMPLETIONS_ENDPOINT);
    expect(req.body).toEqual({
      model: "qwen3-30b-a3b-fp8",
      messages: [
        { role: "system", content: "You are terse." },
        { role: "user", content: "Say hi." },
      ],
      metadata: { usecase: "ner" },
    });
    expect(printed()).toBe("Hello there.");
  });

  it("is reachable by its dashed alias and maps usage for savings", async () => {
    respondWith(payload);
    await zerogpu("chat-completions", "Say hi.", "-m", "glm-5.2");
    expect(sentRequest().body.messages).toEqual([{ role: "user", content: "Say hi." }]);
    expect(readSavings().totalTokens).toBe(23);
  });
});

describe("moderations and embeddings", () => {
  it("posts to /v1/moderations and prints the envelope", async () => {
    const payload = { results: [{ flagged: false }], usage: { prompt_tokens: 5 } };
    respondWith(payload);
    await zerogpu("moderations", "hello", "-m", "zlm-v1-moderation-edge");
    expect(sentRequest().url).toBe("https://api.zerogpu.ai/v1/moderations");
    expect(sentRequest().body).toEqual({ model: "zlm-v1-moderation-edge", input: "hello" });
    expect(printed()).toBe(JSON.stringify(payload, null, 2));
  });

  it("posts to /v1/embeddings and prints the envelope", async () => {
    const payload = { data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 2 } };
    respondWith(payload);
    await zerogpu("embeddings", "hello", "-m", "all-minilm-l6-v2");
    expect(sentRequest().url).toBe("https://api.zerogpu.ai/v1/embeddings");
    expect(printed()).toBe(JSON.stringify(payload, null, 2));
    expect(readSavings().byModel["all-minilm-l6-v2"]?.requests).toBe(1);
  });
});

describe("shared failures", () => {
  it("exits 1 with the status and body on a non-2xx response", async () => {
    respondWith('{"error":"invalid_api_key"}', 401);
    await expect(zerogpu("embeddings", "hi", "-m", "all-minilm-l6-v2")).rejects.toThrow("exit 1");
    expect(errorSpy).toHaveBeenCalledWith("Request failed with status 401.");
    expect(errorSpy).toHaveBeenCalledWith('{"error":"invalid_api_key"}');
    expect(readSavings().totalRequests).toBe(0);
  });

  it("rejects invalid --metadata before sending anything", async () => {
    await expect(
      zerogpu("responses", "hi", "-m", "gliner2-base-v1", "--metadata", "[1,2]"),
    ).rejects.toThrow("exit 1");
    expect(errorSpy).toHaveBeenCalledWith("--metadata must be a JSON object.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exits 1 when not signed in", async () => {
    delete process.env["ZEROGPU_API_KEY"];
    await expect(zerogpu("moderations", "hi", "-m", "zlm-v1-moderation-edge")).rejects.toThrow(
      "exit 1",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveInput", () => {
  function stream(text: string, isTTY = false) {
    return Object.assign(
      (async function* () {
        yield Buffer.from(text);
      })(),
      { isTTY },
    );
  }

  it("reads piped stdin and drops trailing newlines", async () => {
    expect(await resolveInput(undefined, stream("line one\nline two\n\n"))).toBe(
      "line one\nline two",
    );
  });

  it("prefers the positional argument over stdin", async () => {
    expect(await resolveInput("from argv", stream("from stdin"))).toBe("from argv");
  });

  it("exits 1 when there is no text at all", async () => {
    await expect(resolveInput(undefined, stream("", true))).rejects.toThrow("exit 1");
  });
});
