#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HindsightClient } from "./hindsight-client.js";

const apiKey = process.env.HINDSIGHT_API_KEY;
const orgId = process.env.HINDSIGHT_ORG_ID;

if (!apiKey) {
  console.error("HINDSIGHT_API_KEY environment variable is required");
  process.exit(1);
}

if (!orgId) {
  console.error("HINDSIGHT_ORG_ID environment variable is required");
  process.exit(1);
}

const client = new HindsightClient({ apiKey, orgId });

const server = new McpServer({
  name: "hindsight",
  version: "1.0.0",
});

// Tool 1: search_knowledge_base
server.tool(
  "search_knowledge_base",
  "Search across all uploaded competitive intelligence documents in the Hindsight knowledge base",
  {
    query: z.string().describe("Search query for competitive intelligence documents"),
    limit: z.number().optional().default(10).describe("Maximum number of results to return"),
  },
  async ({ query, limit }) => {
    try {
      const result = await client.searchKnowledgeBase({ query, limit });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 2: select_deal
server.tool(
  "select_deal",
  "Find deals based on stage, amount, competitor, product, or other filters",
  {
    status: z
      .array(z.string())
      .optional()
      .describe('Deal statuses to filter by, e.g. ["Closed Won", "Closed Lost"]'),
    amount_min: z.number().optional().describe("Minimum deal amount"),
    amount_max: z.number().optional().describe("Maximum deal amount"),
    competitors: z
      .array(z.string())
      .optional()
      .describe("Competitor IDs to filter by"),
    date_start: z
      .string()
      .optional()
      .describe("Start date for date range filter (YYYY-MM-DD)"),
    date_end: z
      .string()
      .optional()
      .describe("End date for date range filter (YYYY-MM-DD)"),
    limit: z.number().optional().default(20).describe("Maximum number of deals to return"),
  },
  async ({ status, amount_min, amount_max, competitors, date_start, date_end, limit }) => {
    try {
      const filters: Record<string, unknown> = {};
      if (status) filters.status = status;
      if (amount_min !== undefined || amount_max !== undefined) {
        filters.amount = {
          ...(amount_min !== undefined && { min: amount_min }),
          ...(amount_max !== undefined && { max: amount_max }),
        };
      }
      if (competitors) filters.competitors = competitors;
      if (date_start || date_end) {
        filters.date_range = {
          ...(date_start && { start: date_start }),
          ...(date_end && { end: date_end }),
        };
      }

      const result = await client.selectDeal({
        filters: Object.keys(filters).length > 0 ? filters as any : undefined,
        limit,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 3: search_across_deals
server.tool(
  "search_across_deals",
  "Perform semantic vector search across all deal documents to find relevant content",
  {
    query: z.string().describe("Semantic search query across deal documents"),
    limit: z.number().optional().default(15).describe("Maximum number of results to return"),
    include_deal_metadata: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to include deal metadata in results"),
  },
  async ({ query, limit, include_deal_metadata }) => {
    try {
      const result = await client.searchAcrossDeals({
        query,
        limit,
        include_deal_metadata,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 4: search_deal_documents
server.tool(
  "search_deal_documents",
  "Deep search within specific identified deals for relevant document content",
  {
    deal_ids: z.array(z.string()).describe("Array of deal IDs to search within"),
    query: z.string().describe("Search query for deal documents"),
    document_types: z
      .array(z.string())
      .optional()
      .describe('Document types to filter by, e.g. ["email", "meeting"]'),
    limit: z.number().optional().default(30).describe("Maximum number of results to return"),
  },
  async ({ deal_ids, query, document_types, limit }) => {
    try {
      const result = await client.searchDealDocuments({
        deal_ids,
        query,
        document_types,
        limit,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 5: search_deals
server.tool(
  "search_deals",
  "Find deals using AI embeddings to understand conceptual similarity",
  {
    query: z.string().describe("Semantic search query to find conceptually similar deals"),
    limit: z.number().optional().default(10).describe("Maximum number of deals to return"),
  },
  async ({ query, limit }) => {
    try {
      const result = await client.searchDeals({ query, limit });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 6: search_competitors
server.tool(
  "search_competitors",
  "Search competitive intelligence database for specific competitor information",
  {
    query: z.string().describe("Search query for competitor intelligence"),
    competitor_id: z.string().optional().describe("Specific competitor ID to search"),
    source: z
      .enum(["g2", "linkedin", "x", "reddit", "discord", "slack"])
      .optional()
      .describe("Filter results by source platform"),
    limit: z.number().optional().default(20).describe("Maximum number of results to return"),
  },
  async ({ query, competitor_id, source, limit }) => {
    try {
      const result = await client.searchCompetitors({
        query,
        competitor_id,
        source,
        limit,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 7: get_assets (documented as get_documents in overview, get_assets as MCP tool name)
server.tool(
  "get_assets",
  "Search for specific documents by name or keyword in the Hindsight library",
  {
    keyword_query: z.string().describe("Keyword to search for documents"),
  },
  async ({ keyword_query }) => {
    try {
      const result = await client.getAssets({ keyword_query });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 8: ask_hindsight (REST API - synthesized responses with citations)
server.tool(
  "ask_hindsight",
  "Ask Hindsight a question and get a complete, synthesized answer with citations. Uses Hindsight's AI to automatically orchestrate multiple searches and return formatted responses.",
  {
    question: z.string().describe("Natural language question about deals, competitors, or competitive intelligence"),
  },
  async ({ question }) => {
    try {
      const result = await client.createResponse([
        { role: "user", content: question },
      ]);
      let text = result.message.content;
      if (result.message.citations?.length > 0) {
        text += "\n\n---\nCitations:\n";
        for (const citation of result.message.citations) {
          text += `- [${citation.document_name}](${citation.url}): ${citation.excerpt}\n`;
        }
      }
      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 9: upload_document_to_library
server.tool(
  "upload_document_to_library",
  "Upload a competitive intelligence document to the Hindsight knowledge base",
  {
    file_name: z.string().describe("Name of the file"),
    file_url: z.string().describe("URL to download the file from"),
    content_type: z.string().describe("MIME type (e.g., application/pdf, text/markdown)"),
    type: z.enum(["asset", "intel"]).describe('Document type: "asset" or "intel"'),
    competitor_id: z.string().optional().describe("Hindsight competitor ID"),
    competitor_name: z.string().optional().describe("Competitor name (resolved to ID automatically)"),
    source: z
      .string()
      .optional()
      .describe('Source application: "drive", "notion", "confluence", "onedrive", "sharepoint", "vanta", "url", "zapier", "api"'),
  },
  async ({ file_name, file_url, content_type, type, competitor_id, competitor_name, source }) => {
    try {
      if (!competitor_id && !competitor_name) {
        return {
          content: [{ type: "text" as const, text: "Error: Either competitor_id or competitor_name is required" }],
          isError: true,
        };
      }
      const result = await client.uploadToLibrary({
        file_name,
        file_url,
        content_type,
        type,
        competitor_id,
        competitor_name,
        source,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 10: upload_document_to_deal
server.tool(
  "upload_document_to_deal",
  "Associate a document with a specific deal for win-loss analysis",
  {
    file_name: z.string().describe("Name of the file"),
    file_url: z.string().describe("URL to download the file from"),
    content_type: z.string().describe("MIME type (e.g., application/pdf, audio/mpeg)"),
    deal_id: z.string().optional().describe("Hindsight deal ID"),
    salesforce_id: z.string().optional().describe("Salesforce Opportunity ID"),
    hubspot_id: z.string().optional().describe("HubSpot Deal ID"),
    source: z
      .string()
      .optional()
      .describe('Source application: "gong", "clari", "fathom", "fireflies", "avoma", "outreach", "gmail", "Salesforce", "Hubspot", "api"'),
  },
  async ({ file_name, file_url, content_type, deal_id, salesforce_id, hubspot_id, source }) => {
    try {
      if (!deal_id && !salesforce_id && !hubspot_id) {
        return {
          content: [{ type: "text" as const, text: "Error: One of deal_id, salesforce_id, or hubspot_id is required" }],
          isError: true,
        };
      }
      const result = await client.uploadToDeal({
        file_name,
        file_url,
        content_type,
        deal_id,
        salesforce_id,
        hubspot_id,
        source,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hindsight MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
