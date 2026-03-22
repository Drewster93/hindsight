#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { HindsightClient } from "./hindsight-client.js";
import type { Response } from "express";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY || null;
const SERVER_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${PORT}`;

// ============================================
// MCP OAuth 2.1 Provider (for Claude client auth)
// Replicated from LinkedIn MCP pattern
// ============================================

class McpOAuthClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId) || undefined;
  }

  async registerClient(clientMetadata: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
    const clientId = clientMetadata.client_id || randomUUID();
    const isPublicClient = clientMetadata.token_endpoint_auth_method === "none";
    const client: OAuthClientInformationFull = {
      ...clientMetadata,
      client_id: clientId,
      ...(isPublicClient ? {} : { client_secret: randomUUID() }),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.clients.set(clientId, client);
    return client;
  }
}

class McpOAuthProvider implements OAuthServerProvider {
  private _clientsStore = new McpOAuthClientsStore();
  private codes = new Map<string, { client: OAuthClientInformationFull; params: AuthorizationParams; createdAt: number }>();
  private tokens = new Map<string, { clientId: string; scopes: string[]; expiresAt: number; resource?: URL }>();

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    // Auto-approve: generate an authorization code and redirect back
    const code = randomUUID();
    this.codes.set(code, { client, params, createdAt: Date.now() });

    const targetUrl = new URL(params.redirectUri);
    targetUrl.searchParams.set("code", code);
    if (params.state) {
      targetUrl.searchParams.set("state", params.state);
    }
    res.redirect(targetUrl.toString());
  }

  async challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) throw new Error("Invalid authorization code");
    return codeData.params.codeChallenge;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string, _redirectUri?: string, _resource?: URL): Promise<OAuthTokens> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) throw new Error("Invalid authorization code");
    if (codeData.client.client_id !== client.client_id) {
      throw new Error("Authorization code was not issued to this client");
    }
    this.codes.delete(authorizationCode);

    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    const expiresIn = 3600;
    const tokenData = {
      clientId: client.client_id,
      scopes: codeData.params.scopes || [],
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      resource: codeData.params.resource,
    };
    this.tokens.set(accessToken, tokenData);

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: (codeData.params.scopes || []).join(" "),
    };
  }

  async exchangeRefreshToken(_client: OAuthClientInformationFull, _refreshToken: string, _scopes?: string[], _resource?: URL): Promise<OAuthTokens> {
    const accessToken = randomUUID();
    const expiresIn = 3600;
    const tokenData = {
      clientId: _client.client_id,
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    };
    this.tokens.set(accessToken, tokenData);

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      scope: "",
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tokenData = this.tokens.get(token);
    if (!tokenData) throw new Error("Invalid token");
    if (tokenData.expiresAt < Math.floor(Date.now() / 1000)) {
      this.tokens.delete(token);
      throw new Error("Token expired");
    }
    return {
      token,
      clientId: tokenData.clientId,
      scopes: tokenData.scopes,
      expiresAt: tokenData.expiresAt,
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    this.tokens.delete(request.token);
  }
}

const mcpOAuthProvider = new McpOAuthProvider();

// ============================================
// Express app setup
// ============================================

const app = express();
app.set("trust proxy", 1);

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept", "mcp-session-id", "Authorization", "Last-Event-ID"],
  exposedHeaders: ["mcp-session-id"],
}));
app.use(express.json());

// ============================================
// MCP OAuth 2.1 endpoints for client authentication
// ============================================

const mcpServerUrl = new URL(`${SERVER_URL}/mcp`);
const issuerUrl = new URL(SERVER_URL);

// OAuth protected resource metadata for /sse path (some clients try this)
const sseServerUrl = new URL(`${SERVER_URL}/sse`);
const sseProtectedResourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(sseServerUrl);
app.get(new URL(sseProtectedResourceMetadataUrl).pathname, (_req, res) => {
  res.json({
    resource: sseServerUrl.href,
    authorization_servers: [issuerUrl.href],
    bearer_methods_supported: ["header"],
    scopes_supported: [],
  });
});

// OAuth protected resource metadata for root path (fallback discovery)
const rootProtectedResourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(issuerUrl);
const rootMetadataPath = new URL(rootProtectedResourceMetadataUrl).pathname;
const mcpMetadataPath = new URL(getOAuthProtectedResourceMetadataUrl(mcpServerUrl)).pathname;
if (rootMetadataPath !== mcpMetadataPath) {
  app.get(rootMetadataPath, (_req, res) => {
    res.json({
      resource: mcpServerUrl.href,
      authorization_servers: [issuerUrl.href],
      bearer_methods_supported: ["header"],
      scopes_supported: [],
    });
  });
}

// Mount the OAuth auth router
app.use(mcpAuthRouter({
  provider: mcpOAuthProvider,
  issuerUrl,
  baseUrl: issuerUrl,
  resourceServerUrl: mcpServerUrl,
  scopesSupported: [],
}));

// Bearer auth middleware for MCP endpoint
const mcpBearerAuth = requireBearerAuth({
  verifier: mcpOAuthProvider,
  requiredScopes: [],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
});

// ============================================
// Helper to format a ResponseResult into MCP tool output
// ============================================

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

// ============================================
// Tool registration
// ============================================

function createHindsightServer(client: HindsightClient): McpServer {
  const server = new McpServer({
    name: "hindsight",
    version: "1.0.0",
  });

  // Tool 1: ask_hindsight — AI-orchestrated Q&A with citations
  server.tool(
    "ask_hindsight",
    "Ask Hindsight a question and get a complete, synthesized answer with citations. Uses Hindsight's AI to automatically orchestrate searches across deals, competitors, documents, and the knowledge base. Use this for any question about competitive intelligence, win-loss analysis, deal insights, competitor research, or document search.",
    {
      question: z.string().describe("Natural language question about deals, competitors, or competitive intelligence"),
    },
    async ({ question }) => {
      try {
        const result = await client.createResponse([{ role: "user", content: question }]);
        return formatResponse(result);
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  // Tool 2: upload_library_document — Upload documents to knowledge base
  server.tool(
    "upload_library_document",
    "Upload a competitive intelligence document to the Hindsight knowledge base (library). Supports PDF, Word, PowerPoint, Excel, Markdown, plain text, audio (MP3, WAV, M4A), and video (MP4).",
    {
      file_name: z.string().describe("Name of the file"),
      file_url: z.string().describe("URL to download the file from"),
      content_type: z.string().describe("MIME type (e.g., application/pdf, text/markdown)"),
      type: z.enum(["asset", "intel"]).describe("Document type: 'asset' or 'intel'"),
      competitor_id: z.string().optional().describe("Hindsight competitor ID"),
      competitor_name: z.string().optional().describe("Competitor name (resolved to ID automatically)"),
      source: z.string().optional().describe("Source application: drive, notion, confluence, onedrive, sharepoint, vanta, url, zapier, api"),
    },
    async ({ file_name, file_url, content_type, type, competitor_id, competitor_name, source }) => {
      try {
        const result = await client.uploadLibraryDocument({
          file_name, file_url, content_type, type,
          competitor_id, competitor_name, source,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  // Tool 3: upload_deal_document — Upload documents to a deal
  server.tool(
    "upload_deal_document",
    "Upload a document and associate it with a specific deal for win-loss analysis. Supports PDF, Word, PowerPoint, Excel, Markdown, plain text, audio (MP3, WAV, M4A), and video (MP4).",
    {
      file_name: z.string().describe("Name of the file"),
      file_url: z.string().describe("URL to download the file from"),
      content_type: z.string().describe("MIME type (e.g., application/pdf, audio/mpeg)"),
      deal_id: z.string().optional().describe("Hindsight deal ID"),
      salesforce_id: z.string().optional().describe("Salesforce Opportunity ID"),
      hubspot_id: z.string().optional().describe("HubSpot Deal ID"),
      source: z.string().optional().describe("Source application: gong, clari, fathom, fireflies, avoma, outreach, gmail, Salesforce, Hubspot, api"),
    },
    async ({ file_name, file_url, content_type, deal_id, salesforce_id, hubspot_id, source }) => {
      try {
        const result = await client.uploadDealDocument({
          file_name, file_url, content_type,
          deal_id, salesforce_id, hubspot_id, source,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  // Tool 4: check_auth_status — Verify Hindsight API key is configured and working
  server.tool(
    "check_auth_status",
    "Check if the Hindsight API key is configured and test connectivity to the Hindsight API.",
    {},
    async () => {
      if (!HINDSIGHT_API_KEY) {
        return {
          content: [{
            type: "text" as const,
            text: "Hindsight API key is NOT configured. Set the HINDSIGHT_API_KEY environment variable on the server.",
          }],
          isError: true,
        };
      }
      try {
        // Test connectivity with a simple question
        const result = await client.createResponse([{ role: "user", content: "Hello" }]);
        return {
          content: [{
            type: "text" as const,
            text: `Hindsight API is connected and working. Response received successfully.`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Hindsight API key is configured but connectivity test failed: ${(error as Error).message}`,
          }],
          isError: true,
        };
      }
    }
  );

  return server;
}

// ============================================
// Session management
// ============================================

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

const sessions = new Map<string, Session>();

// ============================================
// Health check
// ============================================

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "hindsight-mcp",
    version: "1.0.0",
    hindsightApiKeyConfigured: !!HINDSIGHT_API_KEY,
  });
});

// ============================================
// MCP endpoint — protected by OAuth 2.1 bearer auth
// ============================================

async function handleMcp(req: express.Request, res: express.Response) {
  // API key comes from server env, not from client
  if (!HINDSIGHT_API_KEY) {
    res.status(503).json({
      error: { code: "service_unavailable", message: "HINDSIGHT_API_KEY environment variable is not configured on the server." },
    });
    return;
  }

  const client = new HindsightClient(HINDSIGHT_API_KEY);
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "GET" || req.method === "DELETE") {
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        error: { code: "bad_request", message: "Invalid or missing session. Send a POST to initialize first." },
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
    await session.transport.handleRequest(req, res);
    return;
  }

  if (req.method === "POST") {
    // Existing session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      try {
        await session.transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error(`[session:${sessionId}] Error handling request:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: { code: "internal_error", message: (error as Error).message } });
        }
      }
      return;
    }

    // New session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const server = createHindsightServer(client);
    await server.connect(transport);

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
        res.status(500).json({ error: { code: "internal_error", message: (error as Error).message } });
      }
    }

    const newSessionId = transport.sessionId;
    if (newSessionId) {
      sessions.set(newSessionId, { transport, server });
    }
    return;
  }

  res.status(405).json({ error: { code: "method_not_allowed", message: "Use POST, GET, or DELETE" } });
}

// Protected MCP endpoints
app.all("/mcp", mcpBearerAuth, async (req, res) => handleMcp(req, res));
app.all("/", mcpBearerAuth, async (req, res) => handleMcp(req, res));

// ============================================
// Start server
// ============================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Hindsight MCP server listening on ${SERVER_URL}`);
  console.log(`API key configured: ${!!HINDSIGHT_API_KEY}`);
  console.log(`MCP endpoint: ${SERVER_URL}/mcp`);
  console.log(`OAuth metadata: ${SERVER_URL}/.well-known/oauth-authorization-server`);
});
