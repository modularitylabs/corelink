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

### Phase 5.5: Multi-Account Support & Universal Service Interface (HIGH PRIORITY)

**Goal**: Enable multiple accounts per provider (e.g., 3 Gmail accounts) and expose universal service-agnostic tools

**Architecture Decision**: Hybrid approach
- Universal tools (`list_emails`) that query ALL configured accounts/providers
- Provider-specific tools (`com.corelink.gmail__list_emails`) for explicit control
- Account identification via email address (e.g., `work@gmail.com`, `personal@gmail.com`)

**Tasks**:

#### 5.5.1: Multi-Account Database Foundation

1. **Add `accounts` table** to schema
   ```sql
   accounts:
   - id (UUID, primary key)
   - pluginId (foreign key to plugins.id)
   - email (text, account identifier - e.g., "work@gmail.com")
   - displayName (text, optional friendly name)
   - isPrimary (boolean, default false - one primary per plugin)
   - metadata (JSON, provider-specific data)
   - createdAt, updatedAt (timestamps)
   - UNIQUE constraint on (pluginId, email)
   ```

2. **Update `credentials` table**
   - Add `accountId` column (foreign key to accounts.id)
   - Migration: Create default account for existing credentials
   - Change unique constraint from `pluginId` to `accountId`

3. **Update `auditLogs` table**
   - Add `accountId` column (foreign key to accounts.id)
   - Add `accountEmail` column (denormalized for quick filtering)
   - Enable queries like "show all actions on work@gmail.com"

**Files to modify**:
- `packages/gateway/src/db/schema.ts` (add accounts table, update credentials)
- `packages/gateway/src/db/migrations/` (new migration file)

#### 5.5.2: Multi-Account Credential Management

1. **Extend `CredentialManager` service**
   - `createAccount(pluginId, email, displayName?)` → accountId
   - `listAccounts(pluginId?)` → Account[]
   - `getAccountCredentials(accountId)` → PluginCredentials
   - `setAccountCredentials(accountId, credentials)` → void
   - `deleteAccount(accountId)` → void
   - `setPrimaryAccount(accountId)` → void

2. **Update OAuth flows**
   - Capture email address during OAuth callback
   - Gmail: Extract from `userinfo` endpoint
   - Outlook: Extract from Graph API `/me` endpoint
   - Create account record before storing credentials
   - Prompt user to confirm/rename account

3. **Migration strategy**
   - Auto-create account for existing single credentials
   - Use email from OAuth provider as account identifier
   - Mark as primary by default

**Files to modify**:
- `packages/gateway/src/services/credential-manager.ts`
- `packages/gateway/src/routes/oauth.ts` (Gmail)
- `packages/gateway/src/routes/outlook-oauth.ts`

#### 5.5.3: Universal Service Router

1. **Create `UniversalServiceRouter` service**
   - Accepts generic tool calls without plugin prefix
   - Routes to ALL active accounts across providers
   - Aggregates results from multiple providers
   - Handles parallel execution with Promise.all()
   - Sorts merged results by timestamp

   Example flow:
   ```
   AI calls: list_emails(max_results: 10)

   Router queries:
   - Gmail account: work@gmail.com
   - Gmail account: personal@gmail.com
   - Outlook account: corporate@outlook.com

   Returns: Merged 30 emails, sorted by date, limited to 10 most recent
   ```

2. **Implement universal tools**
   - `list_emails(max_results?, query?)` → Email[]
   - `read_email(email_id, provider?)` → Email (provider auto-detected from cache)
   - `send_email(to, subject, body, from_account?)` → EmailResult
   - `search_emails(query, max_results?)` → Email[]

3. **Add provider detection logic**
   - When reading email, check `emailCache` to find source account
   - Fallback: try all providers until found
   - Error if email not found in any account

**Files to create**:
- `packages/gateway/src/services/universal-service-router.ts`
- `packages/gateway/src/services/email-aggregator.ts`

#### 5.5.4: Email Cache & Cross-Provider Tracking

1. **Add `emailCache` table**
   ```sql
   emailCache:
   - id (UUID, primary key)
   - accountId (foreign key to accounts.id)
   - providerId (text, e.g., "com.corelink.gmail")
   - providerEmailId (text, provider's email ID)
   - subject (text, indexed)
   - from (text, indexed)
   - to (text)
   - timestamp (integer, indexed)
   - snippet (text, first 200 chars)
   - isRead (boolean)
   - labels (JSON array)
   - cachedAt (timestamp)
   - UNIQUE constraint on (accountId, providerEmailId)
   ```

2. **Implement cache population**
   - On `list_emails`, cache returned email metadata
   - On `read_email`, cache full email details
   - TTL strategy: cache for 1 hour, then refresh
   - Optional: Background sync job to keep cache fresh

3. **Deduplication strategy**
   - Same email in multiple accounts (e.g., forwarded emails)
   - Use `Message-ID` header to detect duplicates
   - Option to show duplicates or hide

**Files to create**:
- `packages/gateway/src/services/email-cache.ts`
- Add `emailCache` table to schema

#### 5.5.5: Update MCP Plugin Registry

1. **Expose both universal AND provider-specific tools**
   - Universal tools: `list_emails`, `send_email`, etc.
   - Provider-specific: `com.corelink.gmail__list_emails` (existing)
   - Let AI agents choose which to use

2. **Tool registration logic**
   ```typescript
   // Universal tools (new)
   registerTool('list_emails', ..., universalRouter.listEmails)
   registerTool('send_email', ..., universalRouter.sendEmail)

   // Provider-specific tools (existing)
   registerTool('com.corelink.gmail__list_emails', ..., gmailPlugin.execute)
   ```

3. **Update tool descriptions**
   - Universal: "List emails from ALL configured accounts (Gmail, Outlook, etc.)"
   - Provider-specific: "[Gmail] List emails from Gmail account only"

**Files to modify**:
- `packages/gateway/src/mcp/plugin-registry.ts`
- `packages/gateway/src/index.ts` (MCP server setup)

#### 5.5.6: Web UI for Account Management

1. **Add Account Management page** (`/accounts`)
   - List all accounts grouped by provider
   - Show email address, connection status, primary badge
   - Add new account button (launches OAuth flow)
   - Delete account (with confirmation)
   - Set as primary account

2. **Update provider cards**
   - Show account count (e.g., "2 accounts connected")
   - Click to expand and see all accounts
   - Add account button per provider

3. **Account selector for send_email**
   - Dropdown to select "from" account when sending
   - Default to primary account
   - Show account email addresses

**Files to create**:
- `packages/web/src/pages/Accounts.tsx`
- Update `packages/web/src/App.tsx`

#### 5.5.7: Active Provider Management (Use existing activeProviders table)

1. **Implement active provider service**
   - `setActiveProvider(category, pluginId)` → void
   - `getActiveProvider(category)` → Plugin
   - Fallback if active provider has no accounts connected

2. **Add UI to set active provider**
   - Radio buttons in provider cards
   - "Make active" button (only if accounts exist)
   - Show "Active" badge on current provider

3. **Use active provider for single-result queries**
   - `send_email` → uses primary account of active provider
   - Universal tools query ALL, not just active

**Files to create**:
- `packages/gateway/src/services/active-provider-manager.ts`

---

**Technical Considerations**:

1. **Migration Path**
   - Existing single-account credentials → auto-create account record
   - Preserve backward compatibility during migration
   - Database migration script to populate accounts table

2. **Performance**
   - Parallel queries to multiple accounts (Promise.all)
   - Cache email metadata to avoid repeated API calls
   - Consider rate limiting per account (Gmail: 250 quota/day)

3. **Error Handling**
   - If one account fails, show partial results from other accounts
   - Tag results with source account for debugging
   - Graceful degradation if cache unavailable

4. **Email Deduplication**
   - Same email forwarded to multiple accounts
   - Option: "Show duplicates" vs "Hide duplicates"
   - Use Message-ID header for detection

5. **Account Naming**
   - Primary: Use email address from OAuth provider
   - Allow user to add friendly nickname (optional)
   - Validation: email must be unique per plugin

**Estimated time**: 5-7 days

**Priority Justification**: This is HIGH PRIORITY because:
- Aligns with CoreLink's core vision of service abstraction
- Enables real-world use case (work + personal email)
- Foundation for future multi-user support
- Makes universal interface actually "universal"

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
- [ ] **Multi-account support (Phase 5.5)** - Multiple Gmail/Outlook accounts
- [ ] **Universal service interface** - Generic `list_emails` tool that queries all accounts
- [ ] Policy engine with at least 5 example policies
- [ ] MCP server tested with Claude Code
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
