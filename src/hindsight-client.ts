const BASE_URL = "https://app.usehindsight.com/api/v1";

export interface Citation {
  document_id: string;
  document_name: string;
  deal_id?: string;
  deal_name?: string;
  url: string;
  excerpt: string;
}

export interface ResponseMessage {
  role: string;
  content: string;
  citations: Citation[];
}

export interface ResponseResult {
  message: ResponseMessage;
  tool_calls: string[];
}

export class HindsightClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let message = response.statusText;
      try {
        const errorBody = await response.json();
        message = errorBody?.error?.message ?? errorBody?.message ?? response.statusText;
      } catch {
        // JSON parse failed, use statusText
      }
      throw new Error(
        `Hindsight API error (${response.status}): ${message}`
      );
    }

    return response.json() as Promise<T>;
  }

  // POST /responses — AI-orchestrated Q&A with citations
  async createResponse(
    messages: Array<{ role: string; content: string }>,
    stream: boolean = false
  ): Promise<ResponseResult> {
    return this.request<ResponseResult>("/responses", {
      method: "POST",
      body: JSON.stringify({ messages, stream }),
    });
  }
}
