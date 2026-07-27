import type { ResponsesUsage } from "./responses.js";

export const CHAT_COMPLETIONS_ENDPOINT =
  "https://api.zerogpu.ai/v1/chat/completions";

export interface ChatCompletionsUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatCompletionsApiResponse {
  model?: string;
  usage?: ChatCompletionsUsage;
  choices?: Array<{
    index?: number;
    finish_reason?: string;
    message?: {
      role?: string;
      content?: string;
      // Reasoning models return their trace alongside the answer.
      reasoning?: string;
    };
  }>;
}

// Savings bookkeeping speaks the Responses API's token names.
export function toResponsesUsage(
  usage: ChatCompletionsUsage | undefined,
): ResponsesUsage | undefined {
  if (!usage) return undefined;
  return {
    input_tokens: usage.prompt_tokens,
    output_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
  };
}
