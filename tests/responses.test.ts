import { describe, it, expect } from "vitest";
import {
  extractOutputText,
  extractReasoningText,
  type ResponsesApiResponse,
} from "../src/lib/responses.js";
import { toResponsesUsage } from "../src/lib/chatCompletions.js";

// gpt-oss-120b puts its reasoning trace ahead of the assistant message.
const reasoningPayload: ResponsesApiResponse = {
  model: "gpt-oss-120b",
  output: [
    {
      type: "reasoning",
      content: [{ type: "reasoning_text", text: "Think it through first." }],
    },
    {
      type: "message",
      content: [{ type: "output_text", text: "The final answer." }],
    },
  ],
};

describe("extractOutputText", () => {
  it("skips the reasoning item and returns the assistant message", () => {
    expect(extractOutputText(reasoningPayload)).toBe("The final answer.");
  });

  it("reads a single-message response", () => {
    expect(
      extractOutputText({
        output: [
          { type: "message", content: [{ type: "output_text", text: "Hi." }] },
        ],
      }),
    ).toBe("Hi.");
  });

  it("falls back to the first content part when parts are untyped", () => {
    expect(extractOutputText({ output: [{ content: [{ text: "Hi." }] }] })).toBe(
      "Hi.",
    );
  });

  it("returns undefined for an empty response", () => {
    expect(extractOutputText({})).toBeUndefined();
    expect(extractOutputText({ output: [] })).toBeUndefined();
  });
});

describe("extractReasoningText", () => {
  it("returns the reasoning trace when present", () => {
    expect(extractReasoningText(reasoningPayload)).toBe(
      "Think it through first.",
    );
  });

  it("returns undefined when the model returned no reasoning", () => {
    expect(
      extractReasoningText({
        output: [
          { type: "message", content: [{ type: "output_text", text: "Hi." }] },
        ],
      }),
    ).toBeUndefined();
  });
});

describe("toResponsesUsage", () => {
  it("maps Chat Completions token names onto Responses token names", () => {
    expect(
      toResponsesUsage({
        prompt_tokens: 52,
        completion_tokens: 143,
        total_tokens: 195,
      }),
    ).toEqual({ input_tokens: 52, output_tokens: 143, total_tokens: 195 });
  });

  it("passes through an absent usage block", () => {
    expect(toResponsesUsage(undefined)).toBeUndefined();
  });
});
