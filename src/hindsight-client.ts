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

export interface DocumentResult {
  document: {
    id: string;
    file_name: string;
    status: string;
    deal_id?: string;
    url: string;
    created_at: string;
  };
  run_id: string;
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
      ...((options.headers as Record<string, string>) || {}),
    };

    const isFormData = typeof options.body === "object" && options.body !== null && typeof options.body !== "string";

    if (options.body && typeof options.body === "string") {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      ...options,
      // For FormData, omit explicit headers so fetch auto-sets Content-Type with boundary
      headers: isFormData ? { Authorization: headers.Authorization } : headers,
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

  // POST /documents/library — upload to knowledge base
  async uploadToLibrary(params: {
    file_name: string;
    file_url?: string;
    content_type: string;
    type: "asset" | "intel";
    competitor_id?: string;
    competitor_name?: string;
    source?: string;
  }): Promise<DocumentResult> {
    const formData = new FormData();
    formData.append("file_name", params.file_name);
    if (params.file_url) formData.append("file_url", params.file_url);
    formData.append("content_type", params.content_type);
    formData.append("type", params.type);
    if (params.competitor_id)
      formData.append("competitor_id", params.competitor_id);
    if (params.competitor_name)
      formData.append("competitor_name", params.competitor_name);
    if (params.source) formData.append("source", params.source);

    return this.request<DocumentResult>("/documents/library", {
      method: "POST",
      body: formData as unknown as BodyInit,
    });
  }

  // POST /deals/documents — upload document to deal
  async uploadToDeal(params: {
    file_name: string;
    file_url?: string;
    content_type: string;
    deal_id?: string;
    salesforce_id?: string;
    hubspot_id?: string;
    source?: string;
  }): Promise<DocumentResult> {
    const formData = new FormData();
    formData.append("file_name", params.file_name);
    if (params.file_url) formData.append("file_url", params.file_url);
    formData.append("content_type", params.content_type);
    if (params.deal_id) formData.append("deal_id", params.deal_id);
    if (params.salesforce_id)
      formData.append("salesforce_id", params.salesforce_id);
    if (params.hubspot_id) formData.append("hubspot_id", params.hubspot_id);
    if (params.source) formData.append("source", params.source);

    return this.request<DocumentResult>("/deals/documents", {
      method: "POST",
      body: formData as unknown as BodyInit,
    });
  }
}
