# CoreLink MCP Setup Guide

**Connect AI Agents to CoreLink via HTTP**

---

## 🎯 What You'll Get

After following this guide, AI agents like Claude Code can access your Gmail, Outlook, and other services through CoreLink's secure gateway using a simple HTTP connection - no complex configuration needed!

---

## ✅ Prerequisites

1. **CoreLink Gateway Running**
   ```bash
   npm run dev -w @corelink/gateway
   ```

2. **Services Connected** (Gmail and/or Outlook)
   - Start web UI: `npm run dev -w @corelink/web`
   - Visit http://localhost:5173
   - Click "Connect Gmail" or "Connect Outlook" and authorize

---

## 🚀 Quick Setup (Recommended)

### For Claude Code

The MCP server now runs **on the same port** as the HTTP API (default: 3000).

**1. Add to your Claude Code config:**

Edit `~/.config/claude-code/config.json` (macOS/Linux) or `%APPDATA%\claude-code\config.json` (Windows):

```json
{
  "mcpServers": {
    "corelink": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

**That's it!** No paths, no working directories, just a URL.

**2. Restart Claude Code**

Close and reopen Claude Code to load the new configuration.

**3. Test it**

Try asking Claude:
```
List my 5 most recent emails
```

---

## 🛠️ Available Tools

CoreLink exposes tools with plugin prefixes to support multiple email providers:

### Gmail Tools
- **`com.corelink.gmail__list_emails`** - List recent Gmail messages
- **`com.corelink.gmail__read_email`** - Read a specific Gmail message
- **`com.corelink.gmail__send_email`** - Send an email via Gmail
- **`com.corelink.gmail__search_emails`** - Search Gmail

### Outlook Tools
- **`com.corelink.outlook__list_emails`** - List recent Outlook messages
- **`com.corelink.outlook__read_email`** - Read a specific Outlook message
- **`com.corelink.outlook__send_email`** - Send an email via Outlook
- **`com.corelink.outlook__search_emails`** - Search Outlook

**Note:** Claude Code will see these tools and can use them automatically. The prefix ensures Gmail and Outlook tools don't conflict.

---

## 📝 Example Usage

```
You: Can you list my 5 most recent Gmail emails?

Claude: I'll use the Gmail list_emails tool.
[Calls com.corelink.gmail__list_emails with max_results: 5]

Here are your 5 most recent emails:
1. From: boss@company.com
   Subject: Q1 Planning Meeting
   ...
```

```
You: Send an email via Outlook to john@example.com saying "Meeting at 2pm"

Claude: I'll send that email using Outlook.
[Calls com.corelink.outlook__send_email]

✓ Email sent successfully via Outlook
```

---

## 🔍 Troubleshooting

### "Plugin is not authenticated"

**Problem:**
```
Error: Plugin "Gmail" is not authenticated. Please connect it first via the web dashboard
```

**Solution:**
1. Make sure the HTTP server is running: `npm run dev -w @corelink/gateway`
2. Start the web UI: `npm run dev -w @corelink/web`
3. Visit http://localhost:5173
4. Click "Connect Gmail" or "Connect Outlook"
5. Complete the OAuth flow

### "Connection refused" or "Cannot connect"

**Problem:** Claude Code can't connect to `http://localhost:3000/mcp`

**Solution:**
1. Verify CoreLink is running:
   ```bash
   curl http://localhost:3000/health
   ```
   Should return JSON with status "ok"

2. Check the port in your config matches the server port (default: 3000)

3. If you changed the port, update your config:
   ```json
   {
     "mcpServers": {
       "corelink": {
         "url": "http://localhost:YOUR_PORT/mcp"
       }
     }
   }
   ```

### No tools showing up

**Problem:** Claude Code connected but no tools are available

**Solution:**
1. Check server logs - should show "Plugins loaded: 2" (or more)
2. Verify plugins loaded successfully:
   ```bash
   curl http://localhost:3000/health
   ```
3. Restart CoreLink gateway if plugins didn't load

### Wrong email account

**Problem:** Using Outlook but want Gmail (or vice versa)

**Solution:** Specify the plugin in your request:
- "List my Gmail emails" → Uses Gmail
- "List my Outlook emails" → Uses Outlook

Claude Code will choose the appropriate tool based on your request.

---

## ⚙️ Advanced Configuration

### Custom Port

If you're running CoreLink on a different port:

1. Set the PORT environment variable:
   ```bash
   PORT=8080 npm run dev -w @corelink/gateway
   ```

2. Update Claude Code config:
   ```json
   {
     "mcpServers": {
       "corelink": {
         "url": "http://localhost:8080/mcp"
       }
     }
   }
   ```

### Remote Server

To connect to a remote CoreLink instance:

```json
{
  "mcpServers": {
    "corelink": {
      "url": "https://your-domain.com/mcp"
    }
  }
}
```

**Security Note:** Always use HTTPS for remote connections to protect your credentials.

---

## 🔐 Security

### Local Connections
- MCP server runs on localhost (127.0.0.1) by default
- Protected by DNS rebinding prevention
- All data stays on your machine

### Credentials
- OAuth tokens encrypted in SQLite database
- Encryption key stored in `.corelink/encryption.key` (600 permissions)
- Never commit `.corelink/` to version control

### Future: Policy Engine
Coming soon - fine-grained control over what AI agents can access:
```json
{
  "action": "ALLOW",
  "condition": {
    "<=": [{"var": "args.max_results"}, 10]
  }
}
```

---

## 📊 Monitoring

### Check Server Status

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "mcp": {
    "enabled": true,
    "sessions": 1,
    "plugins": 2,
    "tools": 8
  }
}
```

### View Active Sessions

Check the server logs for session information:
```
[MCP HTTP] Session initialized: a1b2c3d4-...
[MCP HTTP] Request for session: a1b2c3d4-...
```

---

## 🆚 HTTP vs stdio Transport

CoreLink supports **both** transports:

| Feature | HTTP (Recommended) | stdio |
|---------|-------------------|-------|
| Configuration | Just a URL | Absolute path required |
| Setup complexity | ⭐ Simple | ⭐⭐⭐ Complex |
| Multi-client | ✅ Yes | ❌ No |
| Debugging | ✅ Easy (curl/browser) | ❌ Harder |
| Production ready | ✅ Yes | ⚠️ Development only |

**Use HTTP unless you have a specific need for stdio.**

---

## 🚀 Next Steps

1. **Add more services** - Connect Todoist, Calendar, etc.
2. **Explore tools** - Try different email operations
3. **Set up policies** - Control AI access (coming soon)
4. **Review audit logs** - Track AI actions (coming soon)

---

## 📚 Additional Resources

- [CoreLink Architecture](./docs/ARCHITECTURE.md)
- [Plugin Development](./docs/ARCHITECTURE.md#plugin-development)
- [Main README](./README.md)

---

**Last Updated**: 2025-02-21
**Version**: 0.1.0 with HTTP Transport
