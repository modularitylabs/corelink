# CoreLink

**The Secure AI Access Layer for Your Workspace**

CoreLink is a local-first, open-source system that acts as a controlled gateway between AI agents and your workspace applications (Gmail, Todoist, Calendar, Notes, etc.). It provides granular access control, service abstraction, and comprehensive audit logging for all AI-driven data access.

## Why CoreLink?

- **Privacy First**: All data stays local. Your credentials and policies are stored on your machine
- **Granular Control**: Define exactly what AI agents can and cannot access
- **Service Abstraction**: AI agents work with universal interfaces (`create_task`) instead of provider-specific APIs
- **Full Transparency**: Comprehensive audit logs of every action taken by AI agents
- **Extensible**: Easy-to-build plugin system for adding new services

## Key Features

- 🔒 **Policy-Based Access Control** - Rule-based engine with allow/block/redact/require-approval actions
- 🔌 **Plugin Architecture** - Modular connectors for different services (Gmail, Todoist, etc.)
- 🤖 **MCP Protocol Support** - Native integration with AI agents via Model Context Protocol
- 📊 **Web Dashboard** - Visual interface for managing policies, plugins, and viewing audit logs
- 🛡️ **Secure Credential Storage** - Encrypted OAuth tokens and API keys
- 📝 **Audit Logging** - Complete history of all AI interactions with your data

## Architecture

```
┌─────────────┐
│  AI Agent   │  (Claude Code, ChatGPT, etc.)
└──────┬──────┘
       │ MCP Protocol
       │
┌──────▼──────────────────────────────────┐
│         CoreLink Gateway                │
│  ┌────────────┐  ┌──────────────────┐   │
│  │   Policy   │  │  Plugin System   │   │
│  │   Engine   │  │                  │   │
│  └────────────┘  └──────────────────┘   │
│  ┌────────────┐  ┌──────────────────┐   │
│  │   Audit    │  │  Credential      │   │
│  │   Logger   │  │  Manager         │   │
│  └────────────┘  └──────────────────┘   │
└──────────────────┬───────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
   ┌────▼───┐ ┌───▼────┐ ┌──▼─────┐
   │ Gmail  │ │Todoist │ │ Future │
   │ Plugin │ │ Plugin │ │Plugins │
   └────────┘ └────────┘ └────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+ LTS
- npm 10+

### Installation

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Start the gateway (Terminal 1)
npm run dev -w @corelink/gateway

# Start the web UI (Terminal 2)
npm run dev -w @corelink/web
```

### Connect Gmail (No Setup Required!)

1. Open `http://localhost:5173` in your browser
2. Click **"Connect Gmail"**
3. Authorize CoreLink in the OAuth popup
4. Done! Start using Gmail with AI agents

**Note:** CoreLink uses PKCE OAuth (same as GitHub CLI) - no API keys or Google Cloud setup needed!

### Connect AI Agents via MCP

CoreLink includes an HTTP-based MCP server that runs automatically with the gateway - no separate process needed!

**Claude Code Configuration:**

Add this to `~/.config/claude-code/config.json`:

```json
{
  "mcpServers": {
    "corelink": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

That's it! No paths, no working directories - just a URL. Restart Claude Code and start using your connected services.

**For detailed setup and troubleshooting**, see [MCP_SETUP.md](./MCP_SETUP.md).

### Next Steps

- Create access policies (coming soon in Web UI)
- View audit logs (coming soon)

## Project Structure

```
CoreLink/
├── packages/
│   ├── core/           # Shared types and interfaces
│   ├── gateway/        # MCP server and policy engine
│   └── web/            # Web dashboard (React + Vite)
├── plugins/
│   ├── gmail/          # Gmail connector
│   └── todoist/        # Todoist connector
└── package.json        # Root workspace config
```

## Building a Plugin

CoreLink plugins implement the `ICoreLinkPlugin` interface:

```typescript
import { ICoreLinkPlugin, ToolDefinition, ActionResult } from '@corelink/core';

export class MyPlugin implements ICoreLinkPlugin {
  readonly id = 'com.example.myplugin';
  readonly name = 'My Plugin';
  readonly version = '1.0.0';
  readonly category = 'task';
  readonly description = 'Example plugin';

  getStandardTools(): ToolDefinition[] {
    return [
      {
        name: 'create_task',
        description: 'Create a new task',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' }
          },
          required: ['title']
        }
      }
    ];
  }

  async execute(toolName: string, args: Record<string, unknown>, context): Promise<ActionResult> {
    // Implementation here
  }

  // ... other required methods
}
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed plugin development guide.

## Technology Stack

- **Runtime**: Node.js 20+ LTS
- **Server**: Fastify + TypeScript
- **Database**: SQLite with Drizzle ORM
- **Web UI**: Vite + React + TypeScript + TailwindCSS
- **Testing**: Vitest + Playwright
- **Policy Engine**: json-logic-js
- **Monorepo**: npm workspaces

## Roadmap

### V1 (Current)
- ✅ Core plugin system and types
- ✅ SQLite database schema
- ⏳ Gmail plugin
- ⏳ Todoist plugin
- ⏳ MCP server implementation
- ⏳ Policy engine with json-logic
- ⏳ Web dashboard
- ⏳ Audit logging

### V2 (Future)
- Calendar plugins (Google Calendar, Outlook)
- Notes plugins (Notion, Obsidian)
- Cloud policy sync (optional)
- Advanced approval workflows
- Policy templates and marketplace

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Development setup
- Code style guidelines
- Testing requirements
- Pull request process

## Security

CoreLink handles sensitive credentials and data access. Please review our [Security Policy](./SECURITY.md) and report vulnerabilities responsibly.

## License

MIT License - see [LICENSE](./LICENSE) for details

## Community

- **Issues**: [GitHub Issues](https://github.com/yourusername/corelink/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/corelink/discussions)

---

Built with ❤️ for privacy-conscious AI users
