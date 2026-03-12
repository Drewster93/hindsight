# @hindsight/mcp-server

MCP (Model Context Protocol) server for [Hindsight](https://www.usehindsight.com/) — Win-Loss Intelligence platform.

Provides AI assistants like Claude with access to competitive intelligence, deal data, and win-loss insights through Hindsight's API.

## Quick Setup

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hindsight": {
      "command": "npx",
      "args": ["-y", "@hindsight/mcp-server"],
      "env": {
        "HINDSIGHT_API_KEY": "your_api_key",
        "HINDSIGHT_ORG_ID": "your_org_id"
      }
    }
  }
}
```

### Config file locations

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `HINDSIGHT_API_KEY` | Yes | Your Hindsight API key (from the dashboard) |
| `HINDSIGHT_ORG_ID` | Yes | Your Hindsight organization ID |

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

Once configured, ask Claude:

- "Find deals where we lost to Competitor X in the last quarter"
- "What are the top security objections we've encountered?"
- "Search for pricing discussions in enterprise deals"
- "Show me competitor intel on Salesforce's integration strategy"

## Development

```bash
npm install
npm run build
npm start
```

## License

MIT
