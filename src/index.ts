#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";
import { HindsightClient } from "./hindsight-client.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const PORT = parseInt(process.env.PORT || "3000", 10);

// --- Tool registration (shared across all sessions) ---

function createHindsightServer(getClient: () => HindsightClient): McpServer {
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
        const result = await getClient().searchKnowledgeBase({ query, limit });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  // Tool 2: select_deal
  server.tool(
    "select_deal",
    "Find deals based on stage, amount, competitor, product, or other filters",
    {
      status: z.array(z.string()).optional().describe('Deal statuses to filter by, e.g. ["Closed Won", "Closed Lost"]'),
      amount_min: z.number().optional().describe("Minimum deal amount"),
      amount_max: z.number().optional().describe("Maximum deal amount"),
      competitors: z.array(z.string()).optional().describe("Competitor IDs to filter by"),
      date_start: z.string().optional().describe("Start date for date range filter (YYYY-MM-DD)"),
      date_end: z.string().optional().describe("End date for date range filter (YYYY-MM-DD)"),
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
        const result = await getClient().selectDeal({
          filters: Object.keys(filters).length > 0 ? (filters as any) : undefined,
          limit,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
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
      include_deal_metadata: z.boolean().optional().default(true).describe("Whether to include deal metadata in results"),
    },
    async ({ query, limit, include_deal_metadata }) => {
      try {
        const result = await getClient().searchAcrossDeals({ query, limit, include_deal_metadata });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
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
      document_types: z.array(z.string()).optional().describe('Document types to filter by, e.g. ["email", "meeting"]'),
      limit: z.number().optional().default(30).describe("Maximum number of results to return"),
    },
    async ({ deal_ids, query, document_types, limit }) => {
      try {
        const result = await getClient().searchDealDocuments({ deal_ids, query, document_types, limit });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
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
        const result = await getClient().searchDeals({ query, limit });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
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
      source: z.enum(["g2", "linkedin", "x", "reddit", "discord", "slack"]).optional().describe("Filter results by source platform"),
      limit: z.number().optional().default(20).describe("Maximum number of results to return"),
    },
    async ({ query, competitor_id, source, limit }) => {
      try {
        const result = await getClient().searchCompetitors({ query, competitor_id, source, limit });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  // Tool 7: get_assets
  server.tool(
    "get_assets",
    "Search for specific documents by name or keyword in the Hindsight library",
    {
      keyword_query: z.string().describe("Keyword to search for documents"),
    },
    async ({ keyword_query }) => {
      try {
        const result = await getClient().getAssets({ keyword_query });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  // Tool 8: ask_hindsight
  server.tool(
    "ask_hindsight",
    "Ask Hindsight a question and get a complete, synthesized answer with citations. Uses Hindsight's AI to automatically orchestrate multiple searches and return formatted responses.",
    {
      question: z.string().describe("Natural language question about deals, competitors, or competitive intelligence"),
    },
    async ({ question }) => {
      try {
        const result = await getClient().createResponse([{ role: "user", content: question }]);
        let text = result.message.content;
        if (result.message.citations?.length > 0) {
          text += "\n\n---\nCitations:\n";
          for (const citation of result.message.citations) {
            text += `- [${citation.document_name}](${citation.url}): ${citation.excerpt}\n`;
          }
        }
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
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
      source: z.string().optional().describe('Source application: "drive", "notion", "confluence", "onedrive", "sharepoint", "vanta", "url", "zapier", "api"'),
    },
    async ({ file_name, file_url, content_type, type, competitor_id, competitor_name, source }) => {
      try {
        if (!competitor_id && !competitor_name) {
          return { content: [{ type: "text" as const, text: "Error: Either competitor_id or competitor_name is required" }], isError: true };
        }
        const result = await getClient().uploadToLibrary({ file_name, file_url, content_type, type, competitor_id, competitor_name, source });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
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
      source: z.string().optional().describe('Source application: "gong", "clari", "fathom", "fireflies", "avoma", "outreach", "gmail", "Salesforce", "Hubspot", "api"'),
    },
    async ({ file_name, file_url, content_type, deal_id, salesforce_id, hubspot_id, source }) => {
      try {
        if (!deal_id && !salesforce_id && !hubspot_id) {
          return { content: [{ type: "text" as const, text: "Error: One of deal_id, salesforce_id, or hubspot_id is required" }], isError: true };
        }
        const result = await getClient().uploadToDeal({ file_name, file_url, content_type, deal_id, salesforce_id, hubspot_id, source });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  return server;
}

// --- Session management ---

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  client: HindsightClient;
}

const sessions = new Map<string, Session>();

function extractApiKey(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// --- Express app ---

const app = createMcpExpressApp({ host: "0.0.0.0" });

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "hindsight-mcp", version: "1.0.0" });
});

// MCP endpoint — handles POST (messages) and GET (SSE stream) and DELETE (session teardown)
app.all("/mcp", async (req, res) => {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    res.status(401).json({
      error: { code: "unauthorized", message: "Authorization header with Bearer API key is required", details: {} },
    });
    return;
  }

  // Get or create session from Mcp-Session-Id header
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "GET" || req.method === "DELETE") {
    // GET (SSE stream) and DELETE (teardown) require an existing session
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        error: { code: "bad_request", message: "Invalid or missing session. Send a POST to initialize first.", details: {} },
      });
      return;
    }
    const session = sessions.get(sessionId)!;
    if (req.method === "DELETE") {
      await session.transport.close();
      sessions.delete(sessionId);
      res.status(200).end();
      return;
    }
    // GET — hand off to transport for SSE
    await session.transport.handleRequest(req, res);
    return;
  }

  // POST — either initialization or ongoing messages
  if (req.method === "POST") {
    // Existing session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      try {
        await session.transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error(`[session:${sessionId}] Error handling request:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: { code: "internal_error", message: (error as Error).message, details: {} } });
        }
      }
      return;
    }

    // New session — create transport, server, and client
    const client = new HindsightClient(apiKey);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const server = createHindsightServer(() => client);
    await server.connect(transport);

    // Store the session once we know its ID (set after first handleRequest)
    const onClose = () => {
      const sid = transport.sessionId;
      if (sid) sessions.delete(sid);
    };
    transport.onclose = onClose;

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[new-session] Error handling request:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: { code: "internal_error", message: (error as Error).message, details: {} } });
      }
    }

    // Now the transport has a sessionId
    const newSessionId = transport.sessionId;
    if (newSessionId) {
      sessions.set(newSessionId, { transport, server, client });
    }
    return;
  }

  res.status(405).json({ error: { code: "method_not_allowed", message: "Use POST, GET, or DELETE", details: {} } });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Hindsight MCP server listening on http://0.0.0.0:${PORT}/mcp`);
  console.log("Connect with: { \"url\": \"http://localhost:" + PORT + "/mcp\", \"headers\": { \"Authorization\": \"Bearer YOUR_API_KEY\" } }");
});
