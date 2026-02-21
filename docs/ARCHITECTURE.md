# CoreLink Architecture

**Version**: 0.1.0
**Last Updated**: 2025-02-21
**Status**: Active Development

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Component Details](#component-details)
4. [Data Flow](#data-flow)
5. [Database Schema](#database-schema)
6. [Security Model](#security-model)
7. [Plugin System](#plugin-system)
8. [Technology Stack](#technology-stack)

---

## Overview

CoreLink is a **local-first, open-source system** that acts as a secure gateway between AI agents and workspace applications (Gmail, Outlook, Todoist, etc.). It provides:

- **Granular access control** via policy engine
- **Service abstraction** (Gmail and Outlook both implement `list_emails`)
- **Complete audit logging** of all AI actions
- **Privacy-first design** (all data stays local)
- **Extensible plugin architecture**

### Core Principles

1. **Local-First**: All credentials, policies, and audit logs stored locally in SQLite
2. **Zero Trust**: Every AI request evaluated against policy rules
3. **Transparency**: Complete audit trail of all actions
4. **Abstraction**: AI agents work with universal interfaces, not provider-specific APIs
5. **Extensibility**: Easy to add new service plugins

---

## System Architecture

```mermaid
graph TB
    subgraph "AI Agents"
        A1[Claude Code]
        A2[ChatGPT]
        A3[Other AI Agents]
    end

    subgraph "CoreLink Gateway"
        MCP[MCP Server]
        PE[Policy Engine]
        AL[Audit Logger]
        CM[Credential Manager]
        PL[Plugin Loader]

        MCP --> PE
        PE --> AL
        PE --> PL
        PL --> CM
    end

    subgraph "Plugins"
        P1[Gmail Plugin]
        P2[Outlook Plugin]
        P3[Todoist Plugin]
    end

    subgraph "Web Dashboard"
        UI[React UI]
        API[REST API]
    end

    subgraph "Data Layer"
        DB[(SQLite Database)]
        ENC[Encryption Layer]
    end

    subgraph "External Services"
        S1[Gmail API]
        S2[Microsoft Graph]
        S3[Todoist API]
    end

    A1 & A2 & A3 -.MCP Protocol.-> MCP
    UI --> API
    API --> CM
    API --> AL

    PL --> P1 & P2 & P3
    P1 --> S1
    P2 --> S2
    P3 --> S3

    CM --> ENC
    AL --> DB
    ENC --> DB

    style MCP fill:#667eea
    style PE fill:#f59e0b
    style AL fill:#10b981
    style DB fill:#3b82f6
```

---

## Component Details

### 1. MCP Server (`packages/gateway/src/mcp/`)

**Purpose**: Expose plugin tools to AI agents via Model Context Protocol

**Responsibilities**:
- Register all plugin tools as MCP tools
- Handle tool execution requests from AI agents
- Route requests through Policy Engine
- Return results in MCP format

**Technology**: `@modelcontextprotocol/sdk`

**Status**: ⏳ Not yet implemented

---

### 2. Policy Engine (`packages/gateway/src/services/policy-engine.ts`)

**Purpose**: Evaluate access control rules before allowing AI actions

**Responsibilities**:
- Load policy rules from database
- Evaluate rules using json-logic-js
- Return policy decision: ALLOW / BLOCK / REDACT / REQUIRE_APPROVAL
- Redact sensitive fields based on redaction patterns

**Policy Evaluation Flow**:

```mermaid
graph LR
    A[AI Request] --> B{Load Rules}
    B --> C{Evaluate}
    C -->|ALLOW| D[Execute]
    C -->|BLOCK| E[Deny]
    C -->|REDACT| F[Redact & Execute]
    C -->|REQUIRE_APPROVAL| G[Request Approval]

    D & E & F & G --> H[Log Decision]

    style C fill:#f59e0b
    style E fill:#ef4444
    style D fill:#10b981
```

**Example Policy**:
```json
{
  "id": "pol-001",
  "action": "ALLOW",
  "condition": {
    "and": [
      {"==": [{"var": "tool"}, "list_emails"]},
      {"<=": [{"var": "args.max_results"}, 10]}
    ]
  },
  "description": "Allow listing up to 10 emails"
}
```

**Status**: ⏳ Not yet implemented

---

### 3. Credential Manager (`packages/gateway/src/services/credential-manager.ts`)

**Purpose**: Securely store and retrieve OAuth tokens

**Responsibilities**:
- Store encrypted OAuth tokens in database
- Retrieve and decrypt credentials for plugin execution
- Update tokens after refresh
- Delete credentials on disconnect

**Encryption**: AES-256-GCM with random IV per credential

**Status**: ✅ Implemented

---

### 4. Audit Logger (`packages/gateway/src/services/audit-logger.ts`)

**Purpose**: Track all AI agent actions for transparency

**Logged Information**:
- Timestamp
- Agent name and version
- Plugin and tool name
- Input arguments
- Policy decision (ALLOW/BLOCK/REDACT)
- Execution result (success/error)
- Execution time
- Redacted fields (if applicable)

**Status**: ⏳ Not yet implemented (schema exists)

---

### 5. Plugin System

**Architecture**:

```mermaid
graph TB
    subgraph "Plugin Interface (ICoreLinkPlugin)"
        I1[getStandardTools]
        I2[getConfigSchema]
        I3[execute]
    end

    subgraph "Gmail Plugin"
        G1[Standard Tools]
        G2[Gmail API Client]
        G1 --> G2
    end

    subgraph "Outlook Plugin"
        O1[Standard Tools]
        O2[Graph API Client]
        O1 --> O2
    end

    I1 -.implements.-> G1
    I1 -.implements.-> O1

    style I1 fill:#667eea
    style G1 fill:#ea4335
    style O1 fill:#0078d4
```

**Standard Tools** (Service Abstraction):
- `list_emails` - List emails from inbox
- `read_email` - Read specific email
- `send_email` - Send an email
- `search_emails` - Search emails
- `create_task` - Create a task (Todoist, Google Tasks)
- `list_tasks` - List tasks
- `complete_task` - Mark task complete

**Plugin Lifecycle**:
1. Plugin loaded by Plugin Loader
2. Tools registered in MCP Server
3. User connects via OAuth (credentials stored)
4. AI agent calls tool via MCP
5. Request evaluated by Policy Engine
6. Plugin executes if allowed
7. Result logged in Audit Log

**Status**: ✅ Gmail and Outlook plugins implemented

---

### 6. Web Dashboard (`packages/web/`)

**Purpose**: User interface for managing CoreLink

**Pages**:
- **Home** (`/`) - Connection status, connect services
- **Policies** (`/policies`) - Manage access control rules [TODO]
- **Audit Log** (`/audit`) - View AI action history [TODO]
- **Settings** (`/settings`) - Configure CoreLink [TODO]

**Technology**: Vite + React + TypeScript + TailwindCSS

**Status**: ✅ Home page implemented

---

## Data Flow

### OAuth Connection Flow

```mermaid
sequenceDiagram
    participant U as User
    participant W as Web UI
    participant G as Gateway
    participant OAuth as OAuth Provider
    participant DB as Database

    U->>W: Click "Connect Gmail"
    W->>G: GET /oauth/gmail/start
    G->>G: Generate PKCE challenge
    G->>G: Store code verifier
    G->>W: Return auth URL
    W->>OAuth: Open OAuth popup
    OAuth->>U: Show consent screen
    U->>OAuth: Authorize
    OAuth->>G: GET /oauth/callback?code=...
    G->>G: Retrieve code verifier
    G->>OAuth: Exchange code + verifier for tokens
    OAuth->>G: Return access + refresh token
    G->>G: Encrypt tokens
    G->>DB: Store encrypted credentials
    G->>W: Show success page
    W->>U: "Gmail Connected!"
```

### AI Tool Execution Flow

```mermaid
sequenceDiagram
    participant AI as AI Agent
    participant MCP as MCP Server
    participant PE as Policy Engine
    participant Plugin as Plugin
    participant API as External API
    participant AL as Audit Logger
    participant DB as Database

    AI->>MCP: Call list_emails(max=5)
    MCP->>PE: Evaluate policy
    PE->>DB: Load policy rules
    DB->>PE: Return rules
    PE->>PE: Evaluate with json-logic

    alt ALLOW
        PE->>Plugin: Execute
        Plugin->>API: GET /messages?max=5
        API->>Plugin: Return emails
        Plugin->>MCP: Return result
        MCP->>AL: Log success
    else BLOCK
        PE->>MCP: Return error
        MCP->>AL: Log denial
    else REDACT
        PE->>Plugin: Execute with redacted args
        Plugin->>API: Request data
        API->>Plugin: Return data
        Plugin->>PE: Redact response
        PE->>MCP: Return redacted result
        MCP->>AL: Log redaction
    end

    AL->>DB: Store audit entry
    MCP->>AI: Return result
```

---

## Database Schema

### Tables

```mermaid
erDiagram
    CREDENTIALS ||--o{ PLUGIN_SETTINGS : "for"
    POLICY_RULES ||--o{ AUDIT_LOGS : "applied by"
    ACTIVE_PROVIDERS ||--|| PLUGIN_SETTINGS : "references"

    CREDENTIALS {
        text id PK
        text plugin_id
        text type
        text encrypted_data
        text created_at
        text updated_at
    }

    PLUGIN_SETTINGS {
        text plugin_id PK
        int enabled
        text settings
        text updated_at
    }

    POLICY_RULES {
        text id PK
        text plugin_id
        text action
        text condition
        text description
        int priority
        int enabled
        text created_at
        text updated_at
    }

    REDACTION_PATTERNS {
        text id PK
        text name
        text pattern
        text replacement
        text description
        int enabled
        text created_at
    }

    AUDIT_LOGS {
        text id PK
        text timestamp
        text agent_name
        text agent_version
        text plugin_id
        text tool_name
        text input_args
        text policy_action
        text policy_rule_id
        text redacted_fields
        text status
        text error_message
        int execution_time_ms
        text data_summary
        text metadata
    }

    APPROVAL_REQUESTS {
        text id PK
        text timestamp
        text plugin_id
        text tool_name
        text args
        text rule_id
        text status
        text approved_args
        text resolved_at
    }

    ACTIVE_PROVIDERS {
        text category PK
        text plugin_id
        text updated_at
    }
```

### Key Relationships

- **CREDENTIALS** stores encrypted OAuth tokens per plugin
- **POLICY_RULES** can be global or plugin-specific
- **AUDIT_LOGS** references the policy rule that was applied
- **ACTIVE_PROVIDERS** maps categories (email, task) to active plugin

---

## Security Model

### Threat Model

**Assets to Protect**:
1. OAuth tokens (access & refresh)
2. Email content
3. Task data
4. Policy configurations

**Threats**:
1. Token theft from database
2. Unauthorized AI access to data
3. Policy bypass
4. Token exfiltration via compromised plugin

### Security Controls

#### 1. Credential Encryption
- **Algorithm**: AES-256-GCM
- **Key Storage**: `.corelink/encryption.key` (600 permissions)
- **IV**: Random per credential
- **Auth Tag**: Verified on decrypt

#### 2. PKCE OAuth Flow
- **No client secret** stored (public Client ID only)
- **Code verifier**: 128 random bytes
- **Code challenge**: SHA-256 hash
- **State parameter**: CSRF protection
- **Verifier storage**: In-memory (expires after 10 minutes)

#### 3. Policy Enforcement
- **Zero trust**: Every request evaluated
- **json-logic-js**: Sandboxed expression evaluation
- **Priority-based**: Higher priority rules evaluated first
- **Default deny**: If no rules match, deny

#### 4. Audit Logging
- **Immutable**: Audit logs cannot be deleted via API
- **Complete**: All requests logged (allowed and denied)
- **Timestamped**: ISO8601 format
- **Redaction tracking**: Which fields were redacted

---

## Plugin System

### Plugin Interface

```typescript
interface ICoreLinkPlugin {
  // Metadata
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly category: PluginCategory;
  readonly description: string;

  // Tool definitions
  getStandardTools(): ToolDefinition[];
  getNativeTools?(): ToolDefinition[];

  // Configuration
  getConfigSchema(): Record<string, ConfigField>;

  // Execution
  execute(toolName: string, args: Record<string, unknown>, context: ExecutionContext): Promise<ActionResult>;

  // Lifecycle
  initialize?(context: ExecutionContext): Promise<void>;
  destroy?(): Promise<void>;
}
```

### Plugin Discovery

**Current**: Manual registration in gateway
**Future**: Auto-discovery from `plugins/` directory

### Plugin Development

1. Create plugin package in `plugins/<name>/`
2. Implement `ICoreLinkPlugin` interface
3. Export plugin class as default
4. Add to `package.json` workspaces
5. Register in gateway (currently manual)

Example:
```typescript
export class MyPlugin implements ICoreLinkPlugin {
  readonly id = 'com.example.myplugin';
  readonly name = 'My Plugin';
  readonly version = '1.0.0';
  readonly category = 'email';
  readonly description = 'Example plugin';

  getStandardTools() {
    return [{
      name: 'list_emails',
      description: 'List emails',
      inputSchema: { /* JSON schema */ }
    }];
  }

  async execute(toolName, args, context) {
    // Implementation
  }
}
```

---

## Technology Stack

### Backend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | 20+ LTS | JavaScript runtime |
| Language | TypeScript | 5.3+ | Type safety |
| Server | Fastify | 4.25+ | HTTP server |
| Database | SQLite | - | Local data storage |
| ORM | Drizzle ORM | 0.29+ | Type-safe database queries |
| Protocol | MCP SDK | 0.5+ | AI agent communication |
| Policy | json-logic-js | 2.0+ | Rule evaluation |
| Crypto | Node.js crypto | Built-in | Encryption |

### Frontend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Framework | React | 18.2+ | UI framework |
| Build Tool | Vite | 5.0+ | Fast bundler |
| Language | TypeScript | 5.3+ | Type safety |
| Styling | TailwindCSS | 3.4+ | Utility CSS |
| Router | React Router | 6.21+ | Client-side routing |

### Plugins

| Plugin | API | Library | Purpose |
|--------|-----|---------|---------|
| Gmail | Gmail API | googleapis | Email integration |
| Outlook | Microsoft Graph | @microsoft/microsoft-graph-client | Email integration |
| Todoist | Todoist API | @doist/todoist-api-typescript | Task management |

### Development

| Tool | Purpose |
|------|---------|
| ESLint | Linting |
| Prettier | Code formatting |
| Husky | Git hooks |
| lint-staged | Pre-commit formatting |
| Vitest | Unit testing |
| Playwright | E2E testing |
| tsx | TypeScript execution |
| Drizzle Kit | Database migrations |

---

## Design Decisions

### Why SQLite?

✅ **Local-first** - No external database required
✅ **Single file** - Easy backup and migration
✅ **Fast** - Sufficient for single-user workloads
✅ **Zero config** - Works out of the box

### Why PKCE OAuth?

✅ **No secrets** - Client ID is public (safe for open source)
✅ **Industry standard** - Same as GitHub CLI, gcloud
✅ **Secure** - Code challenge prevents token theft
✅ **User-friendly** - No OAuth app setup required

### Why json-logic-js?

✅ **Sandboxed** - Safe expression evaluation
✅ **Flexible** - Complex rules with AND/OR/NOT
✅ **JSON-based** - Easy to store and serialize
✅ **Proven** - Used in many production systems

### Why Fastify over Express?

✅ **Fast** - 2x faster than Express
✅ **TypeScript-first** - Better type support
✅ **Plugin system** - Matches CoreLink architecture
✅ **Schema validation** - Built-in with JSON Schema

### Why Monorepo?

✅ **Shared types** - `@corelink/core` used by all packages
✅ **Atomic changes** - Change core types and plugins together
✅ **Single build** - `npm run build` builds everything
✅ **npm workspaces** - Built-in, no external tools needed

---

## Future Architecture Changes

### V2 Considerations

1. **Multi-user Support**
   - Separate credential storage per user
   - User authentication (passkeys, OAuth)
   - User-specific policies

2. **Cloud Sync (Optional)**
   - Replicate policies to cloud
   - Conflict resolution
   - End-to-end encryption

3. **Plugin Marketplace**
   - Discover and install plugins via UI
   - Plugin versioning
   - Plugin permissions system

4. **Distributed Architecture**
   - Gateway as separate service
   - Web UI as separate service
   - Load balancing for multi-instance

5. **Advanced Policy Engine**
   - Machine learning-based anomaly detection
   - Time-based policies (work hours only)
   - Context-aware policies (location, device)

---

## References

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [PKCE RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)
- [OAuth 2.0 for Native Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [json-logic Documentation](http://jsonlogic.com/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)

---

**Maintained by**: CoreLink Team
**Last Review**: 2025-02-21
**Next Review**: 2025-03-21
