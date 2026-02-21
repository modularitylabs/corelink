# CoreLink MCP Server Setup Guide

This guide explains how to connect AI agents (like Claude Code) to CoreLink via the Model Context Protocol (MCP).

---

## 🎯 What is MCP?

The **Model Context Protocol (MCP)** is a standard protocol that allows AI agents to access external tools and data sources. CoreLink implements an MCP server that exposes your connected services (Gmail, Outlook, etc.) as tools that AI agents can use.

---

## 📋 Prerequisites

1. **CoreLink Gateway installed and configured**
   - See [SETUP.md](./SETUP.md) for Gmail setup
   - See [docs/OUTLOOK_SETUP.md](./docs/OUTLOOK_SETUP.md) for Outlook setup

2. **Services connected**
   - Start the HTTP server: `npm run dev -w @corelink/gateway`
   - Start the web UI: `npm run dev -w @corelink/web`
   - Visit http://localhost:5173 and connect Gmail/Outlook

3. **Build the gateway** (for production use)
   ```bash
   npm run build -w @corelink/gateway
   ```

---

## 🚀 Quick Start (Claude Code)

### Option 1: Development Mode (Recommended for Testing)

1. **Add CoreLink to your Claude Code MCP settings**

   Edit your Claude Code configuration file:
   - **macOS/Linux**: `~/.config/claude-code/config.json`
   - **Windows**: `%APPDATA%\claude-code\config.json`

   Add CoreLink to the `mcpServers` section:

   ```json
   {
     "mcpServers": {
       "corelink": {
         "command": "npm",
         "args": ["run", "dev:mcp", "-w", "@corelink/gateway"],
         "cwd": "/absolute/path/to/CoreLink",
         "env": {}
       }
     }
   }
   ```

   **Replace `/absolute/path/to/CoreLink`** with the actual path to your CoreLink project directory.

2. **Restart Claude Code**

   Close and reopen Claude Code to load the new MCP server.

3. **Verify the connection**

   In Claude Code, you should now see CoreLink tools available. Try:
   ```
   List my recent emails
   ```

### Option 2: Production Mode (Built Binary)

1. **Build CoreLink**
   ```bash
   cd /path/to/CoreLink
   npm run build
   ```

2. **Configure Claude Code**

   ```json
   {
     "mcpServers": {
       "corelink": {
         "command": "node",
         "args": ["/absolute/path/to/CoreLink/packages/gateway/dist/mcp-server.js"],
         "env": {}
       }
     }
   }
   ```

3. **Restart Claude Code**

---

## 🔧 Configuration Options

### Environment Variables

You can pass environment variables to configure CoreLink:

```json
{
  "mcpServers": {
    "corelink": {
      "command": "npm",
      "args": ["run", "dev:mcp", "-w", "@corelink/gateway"],
      "cwd": "/absolute/path/to/CoreLink",
      "env": {
        "LOG_LEVEL": "debug",
        "CORELINK_DB_PATH": "/custom/path/to/database.sqlite"
      }
    }
  }
}
```

### Available Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |
| `CORELINK_DB_PATH` | Custom database path | `.corelink/database.sqlite` |

---

## 🛠️ Available Tools

Once connected, CoreLink exposes the following tools to AI agents:

### Email Tools (Gmail/Outlook)

- **`list_emails`** - List recent emails
  ```typescript
  {
    max_results?: number,  // Default: 10
    query?: string         // Search query (optional)
  }
  ```

- **`read_email`** - Read a specific email
  ```typescript
  {
    email_id: string       // Email ID from list_emails
  }
  ```

- **`send_email`** - Send an email
  ```typescript
  {
    to: string,            // Recipient email
    subject: string,       // Email subject
    body: string           // Email body (plain text)
  }
  ```

- **`search_emails`** - Search emails
  ```typescript
  {
    query: string,         // Search query
    max_results?: number   // Default: 20
  }
  ```

### Task Tools (Coming Soon)

- `create_task`
- `list_tasks`
- `update_task`
- `complete_task`

---

## 📝 Example Usage

### In Claude Code

```
You: Can you list my 5 most recent emails?

Claude: I'll list your recent emails using CoreLink.
[Calls list_emails tool with max_results: 5]

Here are your 5 most recent emails:
1. From: boss@company.com
   Subject: Q1 Planning Meeting
   Date: 2025-02-20

2. From: newsletter@tech.com
   Subject: Weekly Tech Digest
   ...
```

```
You: Send an email to john@example.com with subject "Meeting Tomorrow"
     and body "Let's meet at 2pm in the conference room."

Claude: I'll send that email for you.
[Calls send_email tool]

✓ Email sent successfully to john@example.com
```

---

## 🔍 Troubleshooting

### "Plugin is not authenticated"

**Problem**: You see an error like:
```
Error: Plugin "Gmail" is not authenticated. Please connect it first via the web dashboard.
```

**Solution**:
1. Start the HTTP server: `npm run dev -w @corelink/gateway`
2. Start the web UI: `npm run dev -w @corelink/web`
3. Visit http://localhost:5173
4. Click "Connect Gmail" or "Connect Outlook"
5. Complete the OAuth flow

### "Unknown tool"

**Problem**: The tool you're trying to use isn't available.

**Solution**:
1. Check which plugins are loaded: Look at the MCP server startup logs
2. Make sure the plugin is in the `plugins/` directory
3. Verify the plugin exports a default class
4. Restart the MCP server

### MCP Server Won't Start

**Problem**: Claude Code shows "MCP server failed to start"

**Solution**:
1. Check the logs in Claude Code's developer console
2. Verify the `cwd` path is correct in your config
3. Make sure dependencies are installed: `npm install`
4. Try running manually: `npm run dev:mcp -w @corelink/gateway`

### No Plugins Loaded

**Problem**: Server starts but shows "Loaded 0 plugins"

**Solution**:
1. Check that `plugins/` directory exists in the project root
2. Verify plugin structure:
   ```
   plugins/
   ├── gmail/
   │   └── src/
   │       └── index.ts  ← Must exist
   └── outlook/
       └── src/
           └── index.ts  ← Must exist
   ```
3. Build the plugins: `npm run build`

---

## 🔐 Security Notes

### Credential Storage

- CoreLink stores OAuth tokens in an encrypted SQLite database
- Encryption key is stored in `.corelink/encryption.key` (600 permissions)
- Never commit `.corelink/` to version control

### MCP Communication

- MCP uses stdio (standard input/output) for communication
- All communication stays local on your machine
- No data is sent to external servers (except when calling APIs like Gmail)

### Policy Enforcement (Coming Soon)

CoreLink will support policy-based access control:
```json
{
  "action": "ALLOW",
  "condition": {
    "<=": [{"var": "args.max_results"}, 10]
  }
}
```

This will let you restrict what AI agents can do (e.g., limit to 10 emails at a time).

---

## 🧪 Testing the MCP Server

### Manual Testing (Without Claude Code)

You can test the MCP server using the MCP Inspector tool:

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Run CoreLink MCP server
npx @modelcontextprotocol/inspector npm run dev:mcp -w @corelink/gateway
```

This opens a web UI where you can:
- See available tools
- Test tool execution
- View request/response logs

---

## 🚀 Next Steps

1. **Connect more services** - Add Todoist, Calendar, etc.
2. **Set up policies** - Control what AI agents can access
3. **Review audit logs** - Track all AI actions (coming soon)
4. **Build custom plugins** - Extend CoreLink with your own integrations

---

## 📚 Additional Resources

- [CoreLink Architecture](./docs/ARCHITECTURE.md)
- [Plugin Development Guide](./docs/ARCHITECTURE.md#plugin-development)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Claude Code Documentation](https://docs.claude.com/claude-code)

---

## 🐛 Need Help?

- **GitHub Issues**: https://github.com/yourusername/corelink/issues
- **Documentation**: See [README.md](./README.md)
- **Architecture**: See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

**Last Updated**: 2025-02-21
**Version**: 0.1.0
