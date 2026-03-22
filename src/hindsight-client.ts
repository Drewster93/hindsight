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

export interface DocumentUploadResult {
  document: {
    id: string;
    file_name: string;
    status: string;
    url: string;
    deal_id?: string;
    created_at: string;
  };
  run_id: string;
}

export interface LibraryUploadParams {
  file_name: string;
  file_url: string;
  content_type: string;
  type: string;
  competitor_id?: string;
  competitor_name?: string;
  source?: string;
}

export interface DealDocumentUploadParams {
  file_name: string;
  file_url: string;
  content_type: string;
  deal_id?: string;
  salesforce_id?: string;
  hubspot_id?: string;
  source?: string;
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

  private async requestFormData<T>(
    path: string,
    params: Record<string, string | undefined>
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const formBody = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        formBody.append(key, value);
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
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

  // POST /documents/library — Upload document to knowledge base
  async uploadLibraryDocument(params: LibraryUploadParams): Promise<DocumentUploadResult> {
    return this.requestFormData<DocumentUploadResult>("/documents/library", {
      file_name: params.file_name,
      file_url: params.file_url,
      content_type: params.content_type,
      type: params.type,
      competitor_id: params.competitor_id,
      competitor_name: params.competitor_name,
      source: params.source,
    });
  }

  // POST /deals/documents — Upload document to a deal
  async uploadDealDocument(params: DealDocumentUploadParams): Promise<DocumentUploadResult> {
    return this.requestFormData<DocumentUploadResult>("/deals/documents", {
      file_name: params.file_name,
      file_url: params.file_url,
      content_type: params.content_type,
      deal_id: params.deal_id,
      salesforce_id: params.salesforce_id,
      hubspot_id: params.hubspot_id,
      source: params.source,
    });
  }
}
