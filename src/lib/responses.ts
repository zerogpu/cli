export const RESPONSES_ENDPOINT = "https://api.zerogpu.ai/v1/responses";

export interface ResponsesApiResponse {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}
