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

#### Phase 4: Policy Engine ✅ COMPLETED (2025-02-22)
- [x] PolicyEngine service with JSON Logic evaluation
- [x] AuditLogger service for tracking all actions
- [x] Integration with MCP Server tool execution flow
- [x] All 4 policy actions: ALLOW, BLOCK, REDACT, REQUIRE_APPROVAL
- [x] Redaction pattern system with regex support
- [x] Approval request workflow
- [x] Default policies and redaction patterns seeding
- [x] REST API routes for policy management
- [x] REST API routes for audit log queries

---

## 🚀 Next Steps (Priority Order)

### Phase 4.5: Policy & Audit UI (MEDIUM PRIORITY)

**Goal**: Build web interfaces for managing policies and viewing audit logs

**Tasks**:
1. **Policy Management UI** (`packages/web/src/pages/Policies.tsx`)
   - List all policy rules with filtering
   - Create/edit/delete policies
   - Visual JSON Logic rule builder
   - Enable/disable toggle
   - Priority ordering
   - Test policies against sample data

2. **Audit Log Viewer** (`packages/web/src/pages/AuditLog.tsx`)
   - Paginated table of audit entries
   - Filter by: date, agent, plugin, tool, action, status
   - View full request/response details
   - Export logs to CSV/JSON
   - Real-time updates (SSE)

3. **Redaction Pattern Management**
   - List redaction patterns
   - Create/edit regex patterns
   - Test patterns against sample text
   - Enable/disable patterns

4. **Approval Request Dashboard**
   - List pending approval requests
   - Approve/deny with optional arg modification
   - View approval history

**Estimated time**: 1-2 days

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

#### 5.5.4: ProtonMail/IMAP Plugin (NEW - 3rd Provider!)

**Goal**: Validate email abstraction with non-OAuth provider

1. **Create ProtonMail Bridge IMAP plugin**
   - Use ProtonMail Bridge (provides IMAP/SMTP interface)
   - Authentication: username + password (not OAuth!)
   - Tests that IEmailProvider works beyond Google/Microsoft

2. **Implement IEmailProvider for IMAP**
   - Use `node-imap` library for IMAP operations
   - Use `nodemailer` for SMTP sending
   - Map IMAP folders to standard email concepts
   - Handle IMAP-specific quirks (UIDs, flags, folder structure)

3. **Create IMAP/SMTP credential flow**
   - Different from OAuth - needs server, port, username, password
   - Add configuration UI for IMAP settings
   - Test connection before saving credentials
   - Support generic IMAP (not just ProtonMail)

4. **Edge cases to handle**
   - No calendar/tasks support (ProtonMail is email-only)
   - Different authentication model (no refresh tokens)
   - Manual server configuration (imap.protonmail.com:1143)

**Why this validates the abstraction:**
- Tests non-OAuth authentication
- Proves IEmailProvider isn't coupled to REST APIs
- Shows edge cases (no multi-use-case support)
- Generic IMAP means works with any email provider (Gmail IMAP, FastMail, etc.)

**Files to create**:
- `plugins/protonmail/src/index.ts`
- `plugins/protonmail/src/imap-client.ts`
- `packages/gateway/src/services/email/providers/ProtonMailProvider.ts`
- `packages/gateway/src/routes/protonmail-config.ts` (manual config, not OAuth)

**Dependencies**:
- `node-imap` (IMAP client)
- `nodemailer` (SMTP client)
- `mailparser` (parse IMAP messages)

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
- [ ] **Multi-account support (Phase 5.5)** - Multiple Gmail/Outlook accounts
- [ ] **Universal service interface** - Generic `list_emails` tool that queries all accounts
- [ ] **Task-based execution (Phase 11)** - Persistent task queue with session isolation
- [ ] **REQUIRE_APPROVAL workflow** - Tasks wait for user approval, UI for approval management
- [ ] **Cancellation support** - User can cancel runaway agents from UI
- [ ] Policy engine with at least 5 example policies
- [ ] MCP server tested with Claude Code (both MCP Tasks and non-MCP-Tasks clients)
- [ ] Audit logging with export functionality
- [ ] Token refresh implemented
- [ ] Email cache for cross-provider tracking
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

- **More Plugins**: Google Calendar, Notion, Slack, GitHub, Google Tasks
- **Policy Templates**: Pre-built policies for common scenarios
- **Plugin Marketplace**: Browse and install community plugins
- **Multi-user Support**: Each user has their own accounts (team collaboration)
- **Webhook Support**: Trigger actions on events (e.g., new email → Slack notification)
- **AI Agent Profiles**: Different policies per agent (Claude strict, GPT permissive)
- **Mobile App**: iOS/Android dashboard for audit logs and account management
- **Browser Extension**: Quick access to audit logs and approve/deny requests
- **Policy Testing**: Dry-run mode to test policies before enabling
- **Advanced Redaction**: ML-based PII detection (emails, phone numbers, SSNs)
- **Email Sync Optimization**: Background workers to keep email cache fresh
- **Smart Deduplication**: ML to detect duplicate emails across accounts (beyond Message-ID)

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
