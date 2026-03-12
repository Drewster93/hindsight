const BASE_URL = "https://app.usehindsight.com/api/v1";

export interface HindsightConfig {
  apiKey: string;
  orgId: string;
}

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

export interface KnowledgeBaseResult {
  results: Array<{
    chunk_id: string;
    document_id: string;
    document_name: string;
    content: string;
    similarity_score: number;
    metadata: Record<string, unknown>;
  }>;
}

export interface Deal {
  id: string;
  name: string;
  status?: string;
  amount?: number;
  close_date?: string;
  client?: { name: string; industry?: string };
  competitors?: string[];
  summary?: string;
  similarity_score?: number;
  semantic_match_reasons?: string[];
}

export interface SelectDealResult {
  deals: Deal[];
  total_count: number;
}

export interface SearchDealsResult {
  deals: Deal[];
}

export interface SearchAcrossDealsResult {
  results: Array<{
    deal_id: string;
    deal_name: string;
    deal_stage?: string;
    document_id: string;
    document_name: string;
    content: string;
    similarity_score: number;
    created_at?: string;
  }>;
}

export interface SearchDealDocumentsResult {
  results: Array<{
    deal_id: string;
    deal_name: string;
    document_id: string;
    document_name: string;
    document_type?: string;
    content: string;
    similarity_score: number;
    metadata?: Record<string, unknown>;
  }>;
}

export interface SearchCompetitorsResult {
  competitor: {
    id: string;
    name: string;
    website?: string;
  };
  results: Array<{
    chunk_id: string;
    document_id: string;
    document_name: string;
    content: string;
    similarity_score: number;
    source?: string;
    metadata?: Record<string, unknown>;
  }>;
  battlecard_url?: string;
}

export interface GetAssetsResult {
  documents: Array<{
    id: string;
    file_name: string;
    created_at: string;
    competitor_id?: string;
    url: string;
  }>;
}

export interface HindsightError {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export class HindsightClient {
  private apiKey: string;
  private orgId: string;

  constructor(config: HindsightConfig) {
    this.apiKey = config.apiKey;
    this.orgId = config.orgId;
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

    // Only set Content-Type for JSON bodies
    if (options.body && typeof options.body === "string") {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({
        error: {
          code: `http_${response.status}`,
          message: response.statusText,
          details: {},
        },
      }))) as HindsightError;
      throw new Error(
        `Hindsight API error (${response.status}): ${errorBody.error.message}`
      );
    }

    return response.json() as Promise<T>;
  }

  // REST API: POST /responses
  async createResponse(
    messages: Array<{ role: string; content: string }>,
    stream: boolean = false
  ): Promise<ResponseResult> {
    return this.request<ResponseResult>("/responses", {
      method: "POST",
      body: JSON.stringify({ messages, stream }),
    });
  }

  // Document Upload: POST /documents/library
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

  // Document Upload: POST /deals/documents
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

  // MCP Tool: search_knowledge_base
  async searchKnowledgeBase(params: {
    query: string;
    limit?: number;
  }): Promise<KnowledgeBaseResult> {
    return this.request<KnowledgeBaseResult>("/mcp/search_knowledge_base", {
      method: "POST",
      body: JSON.stringify({
        query: params.query,
        org_id: this.orgId,
        limit: params.limit ?? 10,
      }),
    });
  }

  // MCP Tool: select_deal
  async selectDeal(params: {
    filters?: {
      status?: string[];
      amount?: { min?: number; max?: number };
      competitors?: string[];
      date_range?: { start?: string; end?: string };
    };
    limit?: number;
  }): Promise<SelectDealResult> {
    return this.request<SelectDealResult>("/mcp/select_deal", {
      method: "POST",
      body: JSON.stringify({
        org_id: this.orgId,
        filters: params.filters,
        limit: params.limit ?? 20,
      }),
    });
  }

  // MCP Tool: search_across_deals
  async searchAcrossDeals(params: {
    query: string;
    limit?: number;
    include_deal_metadata?: boolean;
  }): Promise<SearchAcrossDealsResult> {
    return this.request<SearchAcrossDealsResult>("/mcp/search_across_deals", {
      method: "POST",
      body: JSON.stringify({
        query: params.query,
        org_id: this.orgId,
        limit: params.limit ?? 15,
        include_deal_metadata: params.include_deal_metadata ?? true,
      }),
    });
  }

  // MCP Tool: search_deal_documents
  async searchDealDocuments(params: {
    deal_ids: string[];
    query: string;
    document_types?: string[];
    limit?: number;
  }): Promise<SearchDealDocumentsResult> {
    return this.request<SearchDealDocumentsResult>(
      "/mcp/search_deal_documents",
      {
        method: "POST",
        body: JSON.stringify({
          deal_ids: params.deal_ids,
          query: params.query,
          org_id: this.orgId,
          document_types: params.document_types,
          limit: params.limit ?? 30,
        }),
      }
    );
  }

  // MCP Tool: search_deals
  async searchDeals(params: {
    query: string;
    limit?: number;
  }): Promise<SearchDealsResult> {
    return this.request<SearchDealsResult>("/mcp/search_deals", {
      method: "POST",
      body: JSON.stringify({
        query: params.query,
        org_id: this.orgId,
        limit: params.limit ?? 10,
      }),
    });
  }

  // MCP Tool: search_competitors
  async searchCompetitors(params: {
    query: string;
    competitor_id?: string;
    source?: string;
    limit?: number;
  }): Promise<SearchCompetitorsResult> {
    return this.request<SearchCompetitorsResult>("/mcp/search_competitors", {
      method: "POST",
      body: JSON.stringify({
        query: params.query,
        competitor_id: params.competitor_id,
        org_id: this.orgId,
        source: params.source,
        limit: params.limit ?? 20,
      }),
    });
  }

  // MCP Tool: get_assets
  async getAssets(params: {
    keyword_query: string;
  }): Promise<GetAssetsResult> {
    return this.request<GetAssetsResult>("/mcp/get_assets", {
      method: "POST",
      body: JSON.stringify({
        keyword_query: params.keyword_query,
        org_id: this.orgId,
      }),
    });
  }
}
