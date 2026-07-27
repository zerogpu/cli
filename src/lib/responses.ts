export const RESPONSES_ENDPOINT = "https://api.zerogpu.ai/v1/responses";

export interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

export interface ResponsesContentPart {
  type?: string;
  text?: string;
}

export interface ResponsesOutputItem {
  type?: string;
  content?: ResponsesContentPart[];
}

export interface ResponsesApiResponse {
  model?: string;
  usage?: ResponsesUsage;
  output?: ResponsesOutputItem[];
}

// Reasoning models (gpt-oss-120b) emit a `reasoning` item ahead of the
// assistant message, so the answer is not always output[0].
export function extractOutputText(
  data: ResponsesApiResponse,
): string | undefined {
  const items = data.output ?? [];
  const message = items.find((item) => item.type === "message") ?? items[0];
  const parts = message?.content ?? [];
  return parts.find((p) => p.type === "output_text")?.text ?? parts[0]?.text;
}

export function extractReasoningText(
  data: ResponsesApiResponse,
): string | undefined {
  const parts =
    data.output?.find((item) => item.type === "reasoning")?.content ?? [];
  return parts.find((p) => p.type === "reasoning_text")?.text ?? parts[0]?.text;
}
