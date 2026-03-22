#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";
import { HindsightClient } from "./hindsight-client.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const PORT = parseInt(process.env.PORT || "3000", 10);

// --- Helper to format a ResponseResult into MCP tool output ---

function formatResponse(result: { message: { content: string; citations?: Array<{ document_name: string; url: string; excerpt: string }> } }): { content: Array<{ type: "text"; text: string }> } {
  let text = result.message.content;
  if (result.message.citations && result.message.citations.length > 0) {
    text += "\n\n---\nCitations:\n";
    for (const citation of result.message.citations) {
      text += `- [${citation.document_name}](${citation.url}): ${citation.excerpt}\n`;
    }
  }
  return { content: [{ type: "text" as const, text }] };
}

// --- Tool registration (shared across all sessions) ---

function createHindsightServer(getClient: () => HindsightClient): McpServer {
  const server = new McpServer({
    name: "hindsight",
    version: "1.0.0",
  });

  // Tool 1: ask_hindsight
  server.tool(
    "ask_hindsight",
    "Ask Hindsight a question and get a complete, synthesized answer with citations. Uses Hindsight's AI to automatically orchestrate searches across deals, competitors, documents, and the knowledge base. Use this for any question about competitive intelligence, win-loss analysis, deal insights, competitor research, or document search.",
    {
      question: z.string().describe("Natural language question about deals, competitors, or competitive intelligence"),
    },
    async ({ question }) => {
      try {
        const result = await getClient().createResponse([{ role: "user", content: question }]);
        return formatResponse(result);
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
  // Delegate to the shared handler
  return handleMcp(req, res);
});

// Also serve MCP at root path for clients that connect without /mcp suffix
app.all("/", async (req, res) => {
  return handleMcp(req, res);
});

async function handleMcp(req: import("express").Request, res: import("express").Response) {
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
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Hindsight MCP server listening on http://0.0.0.0:${PORT}`);
  console.log("Connect with: { \"url\": \"http://localhost:" + PORT + "/mcp\", \"headers\": { \"Authorization\": \"Bearer YOUR_API_KEY\" } }");
});
