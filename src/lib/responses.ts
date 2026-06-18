export const RESPONSES_ENDPOINT = "https://api.zerogpu.ai/v1/responses";

export interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

export interface ResponsesApiResponse {
  model?: string;
  usage?: ResponsesUsage;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}
