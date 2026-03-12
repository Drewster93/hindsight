# @hindsight/mcp-server

Web-hosted MCP server for [Hindsight](https://www.usehindsight.com/) — Win-Loss Intelligence platform.

Provides AI assistants like Claude with access to competitive intelligence, deal data, and win-loss insights. Clients connect with just their Hindsight API key.

## How It Works

The server runs as an HTTP service. MCP clients (Claude Desktop, Cursor, etc.) connect to it via URL and pass their Hindsight API key in the `Authorization` header. The server creates a session per client and proxies all tool calls to the Hindsight API.

```
MCP Client  ──Bearer API_KEY──>  This Server  ──Bearer API_KEY──>  Hindsight API
```

## Quick Start

```bash
npm install
npm run build
npm start
```

The server starts on port 3000 (configurable via `PORT` env var).

## Client Configuration

### Claude Desktop / Cursor / Cline

```json
{
  "mcpServers": {
    "hindsight": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_HINDSIGHT_API_KEY"
      }
    }
  }
}
```

That's it — just your API key.

### Config file locations

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port to listen on |

## Endpoints

| Path | Method | Description |
|---|---|---|
| `/mcp` | POST | MCP messages (initialization + tool calls) |
| `/mcp` | GET | SSE stream for server-initiated messages |
| `/mcp` | DELETE | Tear down a session |
| `/health` | GET | Health check |

## Available Tools

### Search & Query

| Tool | Description |
|---|---|
| `ask_hindsight` | Ask a natural language question and get a synthesized answer with citations |
| `search_knowledge_base` | Search uploaded competitive intelligence documents |
| `search_across_deals` | Semantic search across all deal documents |
| `search_deal_documents` | Deep search within specific deals |
| `search_deals` | Find deals using AI embeddings for conceptual similarity |
| `search_competitors` | Search competitor intelligence (filterable by source: G2, LinkedIn, Reddit, etc.) |
| `select_deal` | Filter deals by stage, amount, competitor, date range |
| `get_assets` | Search documents by name or keyword |

### Document Upload

| Tool | Description |
|---|---|
| `upload_document_to_library` | Upload competitive intel docs to the knowledge base |
| `upload_document_to_deal` | Associate documents with specific deals |

## Example Usage

Once connected, ask Claude:

- "Find deals where we lost to Competitor X in the last quarter"
- "What are the top security objections we've encountered?"
- "Search for pricing discussions in enterprise deals"
- "Show me competitor intel on Salesforce's integration strategy"

## Deployment

Deploy anywhere that runs Node.js. Set the `PORT` env var if needed.

```bash
PORT=8080 npm start
```

## License

MIT
