# CoreLink - Development TODO

## Current Status (2025-02-21)

### ✅ Completed

#### Phase 1: Project Foundation
- [x] Monorepo setup with npm workspaces
- [x] TypeScript configurations for all packages
- [x] ESLint, Prettier, Husky setup
- [x] Drizzle ORM with SQLite schema
- [x] Core types and plugin interface (`@corelink/core`)
- [x] Git repository initialization
- [x] Project documentation (README, SETUP.md)

#### Phase 2: Gmail Integration
- [x] PKCE OAuth implementation (no client secret)
- [x] Gmail plugin with Microsoft Graph API
- [x] OAuth routes (`/oauth/gmail/start`, `/oauth/callback`)
- [x] Credential encryption with AES-256-GCM
- [x] Environment variable loading and validation
- [x] Web UI with Gmail connection

#### Phase 3: Outlook Integration
- [x] Outlook plugin with Microsoft Graph API
- [x] Outlook OAuth routes with PKCE
- [x] Web UI support for Outlook
- [x] Service abstraction demonstration (both use same tools)
- [x] Documentation (OUTLOOK_SETUP.md)

---

## 🚀 Next Steps (Priority Order)

### Phase 4: Policy Engine (HIGH PRIORITY)

**Goal**: Implement rule-based access control using json-logic-js

**Tasks**:
1. **Create PolicyEngine service** (`packages/gateway/src/services/policy-engine.ts`)
   - Load policy rules from database
   - Evaluate rules using json-logic-js
   - Return PolicyResult (ALLOW/BLOCK/REDACT/REQUIRE_APPROVAL)
   - Handle redaction of sensitive fields

2. **Integrate PolicyEngine into execution flow**
   - Intercept all plugin execute() calls
   - Evaluate policy before execution
   - Log policy decisions in audit log
   - Block or redact based on result

3. **Create default policies**
   - Insert sample policies into database on first run
   - Example: "Allow list_emails with max 10 results"
   - Example: "Block all send_email operations"
   - Example: "Redact email body content"

4. **Add Policy Management UI**
   - Web UI page: `/policies`
   - List all active policies
   - Toggle enable/disable
   - Create new policy with visual rule builder
   - Test policy against sample inputs

**Files to create**:
- `packages/gateway/src/services/policy-engine.ts`
- `packages/web/src/pages/Policies.tsx`
- `packages/gateway/src/middleware/policy-middleware.ts`

**Dependencies**: `json-logic-js` (already in package.json)

**Estimated time**: 2-3 days

---

### Phase 5: MCP Server Implementation (HIGH PRIORITY)

**Goal**: Expose plugins as MCP tools for AI agents

**Tasks**:
1. **Create MCP Server** (`packages/gateway/src/mcp/server.ts`)
   - Use `@modelcontextprotocol/sdk`
   - Register all plugin tools as MCP tools
   - Handle tool execution requests
   - Return results in MCP format

2. **Plugin Discovery System**
   - Auto-discover installed plugins
   - Load plugin manifests
   - Register tools dynamically
   - Support hot-reload of plugins

3. **Create MCP CLI**
   - `packages/gateway/src/cli.ts`
   - Start MCP server via stdio
   - Configuration options (--port, --config, etc.)

4. **Test with Claude Code**
   - Add CoreLink as MCP server in Claude Code config
   - Test `list_emails` tool
   - Test `send_email` tool
   - Verify policy enforcement works

**Files to create**:
- `packages/gateway/src/mcp/server.ts`
- `packages/gateway/src/mcp/plugin-loader.ts`
- `packages/gateway/src/cli.ts`

**Dependencies**: `@modelcontextprotocol/sdk` (already in package.json)

**Estimated time**: 3-4 days

---

### Phase 6: Audit Logging UI (MEDIUM PRIORITY)

**Goal**: Visualize all AI agent actions

**Tasks**:
1. **Create AuditLogger service** (`packages/gateway/src/services/audit-logger.ts`)
   - Write audit entries to database
   - Calculate execution time
   - Store policy decisions
   - Track redacted fields

2. **Implement logging in execution flow**
   - Log before policy evaluation
   - Log after execution
   - Log errors and denials
   - Include agent name/version

3. **Create Audit Log UI**
   - Web UI page: `/audit`
   - Real-time log viewer (SSE)
   - Filter by date, plugin, agent, status
   - Export to JSON/CSV
   - Statistics dashboard

4. **Add Statistics**
   - Total requests by plugin
   - Allowed vs blocked ratio
   - Most active agents
   - Average execution time

**Files to create**:
- `packages/gateway/src/services/audit-logger.ts`
- `packages/web/src/pages/AuditLog.tsx`
- `packages/gateway/src/routes/audit.ts` (SSE endpoint)

**Estimated time**: 2-3 days

---

### Phase 7: Todoist Plugin (MEDIUM PRIORITY)

**Goal**: Complete the task abstraction example

**Tasks**:
1. **Implement Todoist Plugin** (`plugins/todoist/src/index.ts`)
   - Use `@doist/todoist-api-typescript`
   - Implement standard task tools: `create_task`, `list_tasks`, `update_task`, `complete_task`
   - OAuth2 flow for Todoist

2. **Add Todoist OAuth routes**
   - `/oauth/todoist/start`
   - `/oauth/todoist/callback`
   - Similar to Gmail/Outlook pattern

3. **Update Web UI**
   - Enable Todoist card (remove "Coming Soon")
   - Add connection functionality

4. **Test service abstraction**
   - Show that both Todoist and Google Tasks (future) use same tools
   - Allow switching active task provider

**Files to modify**:
- `plugins/todoist/src/index.ts` (already scaffolded)
- `packages/gateway/src/routes/todoist-oauth.ts` (new)
- `packages/web/src/App.tsx`

**Dependencies**: `@doist/todoist-api-typescript` (already in package.json)

**Estimated time**: 1-2 days

---

### Phase 8: Token Refresh & Error Handling (HIGH PRIORITY)

**Goal**: Handle expired OAuth tokens gracefully

**Tasks**:
1. **Implement token refresh logic**
   - Detect expired access tokens
   - Use refresh token to get new access token
   - Update credentials in database
   - Retry failed request with new token

2. **Add retry mechanism**
   - Exponential backoff for transient errors
   - Distinguish between 401 (auth) and 500 (server) errors
   - Max retry attempts (3)

3. **Better error messages**
   - User-friendly error messages in UI
   - Guidance on how to fix (e.g., "Reconnect Gmail")
   - Error codes and documentation

**Files to modify**:
- `packages/gateway/src/services/credential-manager.ts`
- `plugins/gmail/src/index.ts`
- `plugins/outlook/src/index.ts`

**Estimated time**: 1-2 days

---

### Phase 9: Active Provider Selection (LOW PRIORITY)

**Goal**: Let users choose which provider to use for each category

**Tasks**:
1. **Add active provider setting**
   - Store in `active_providers` table (already in schema)
   - Default to first connected provider
   - UI to select active provider

2. **Route requests to active provider**
   - When AI agent calls `list_emails`, check active email provider
   - Route to Gmail or Outlook plugin accordingly
   - Fall back if active provider disconnected

3. **Add provider switching UI**
   - Radio buttons: "Use Gmail" vs "Use Outlook"
   - Show which is currently active
   - Disable if provider not connected

**Files to create**:
- `packages/gateway/src/services/provider-router.ts`
- Update `packages/web/src/App.tsx`

**Estimated time**: 1 day

---

### Phase 10: Cloud Policy Sync (FUTURE)

**Goal**: Optional cloud sync for policies (SaaS component)

**Tasks**:
- Design cloud sync protocol
- Build backend API for policy storage
- Implement sync client in gateway
- Add toggle in UI: "Enable cloud sync"
- Conflict resolution strategy

**Status**: Not started (V2 feature)

---

## 🐛 Known Issues

1. **Outlook plugin has TypeScript errors**
   - Missing dependencies: `@microsoft/microsoft-graph-client`, `@azure/identity`
   - Need to run: `npm install @microsoft/microsoft-graph-client @azure/identity`
   - Fix type errors in `plugins/outlook/src/index.ts:162`

2. **No token refresh implemented**
   - Access tokens expire after 1 hour
   - Will fail silently after expiration
   - Need to implement refresh flow

3. **No error handling in UI**
   - Failed OAuth shows generic "NetworkError"
   - Should show user-friendly messages

4. **PKCE verifier storage is in-memory**
   - Verifiers lost on server restart
   - Should persist to database or use Redis

5. **No rate limiting**
   - AI agents could spam requests
   - Need to add rate limiting middleware

---

## 📚 Documentation Needs

- [ ] API documentation for plugins
- [ ] Plugin development guide with examples
- [ ] MCP integration guide for AI agents
- [ ] Policy rule syntax documentation
- [ ] Deployment guide (Docker, systemd)
- [ ] Security best practices guide
- [ ] Contributing guidelines

---

## 🧪 Testing Needs

- [ ] Unit tests for policy engine
- [ ] Integration tests for OAuth flows
- [ ] E2E tests with Playwright
- [ ] Test plugin with mocked APIs
- [ ] Load testing for MCP server
- [ ] Security testing (token encryption, PKCE)

---

## 🎯 V1 Release Checklist

Before releasing V1, ensure:

- [ ] Gmail and Outlook plugins fully working
- [ ] Policy engine with at least 5 example policies
- [ ] MCP server tested with Claude Code
- [ ] Audit logging with export functionality
- [ ] Token refresh implemented
- [ ] Comprehensive README with screenshots
- [ ] Setup guides for Gmail and Outlook
- [ ] Docker deployment option
- [ ] GitHub Actions CI/CD
- [ ] Security audit completed
- [ ] OSS license added (MIT)
- [ ] Code of conduct
- [ ] Contributing guide

---

## 💡 Future Ideas (V2+)

- **More Plugins**: Google Calendar, Notion, Slack, GitHub
- **Policy Templates**: Pre-built policies for common scenarios
- **Plugin Marketplace**: Browse and install community plugins
- **Multi-user Support**: Each user has their own credentials
- **Webhook Support**: Trigger actions on events
- **AI Agent Profiles**: Different policies per agent
- **Mobile App**: iOS/Android dashboard
- **Browser Extension**: Quick access to audit logs
- **Policy Testing**: Dry-run mode to test policies
- **Advanced Redaction**: ML-based PII detection

---

## 📞 Getting Help

- Check `docs/ARCHITECTURE.md` for system design
- See `SETUP.md` for environment setup
- See `OUTLOOK_SETUP.md` for Microsoft OAuth
- Create GitHub issue for bugs
- Join discussions for feature requests

---

**Last Updated**: 2025-02-21
**Status**: Active Development
**Next Milestone**: Policy Engine (Phase 4)
