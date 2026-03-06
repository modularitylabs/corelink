# Multi-Account Support & Use-Case Service Architecture (HIGH PRIORITY)

**Goal**: Build email service abstraction with 3 providers, multi-account support, and universal interface

**Architecture Strategy**: Use-Case-Centric Evolution
- **Focus**: Perfect the email use case first with 3 diverse providers
- **Learn**: Extract common patterns, validate abstractions
- **Apply**: Use proven patterns for calendar (Phase 6) and tasks (Phase 7)

**Architecture Decisions**:
1. **Hybrid folder structure**: Keep `plugins/` for providers, add `services/email/` for business logic
2. **Universal + provider-specific tools**: Expose both `list_emails` AND `com.corelink.gmail__list_emails`
3. **Account identification**: Via email address (e.g., `work@gmail.com`, `personal@gmail.com`)
4. **3 email providers**: Gmail, Outlook, ProtonMail/IMAP (validates abstraction isn't Google/MS-specific)

**Why use-case-by-use-case?**
- Email is the most complex (attachments, threading, labels, filters)
- 3 providers with different auth methods (OAuth vs IMAP/SMTP)
- Lessons learned inform calendar/task architecture
- Validates abstractions with real diversity before expanding

**Tasks**:

#### 5.5.0: Email Service Architecture Foundation (NEW - Do This First!)

**Goal**: Create use-case service layer that orchestrates multiple email providers

1. **Design `IEmailProvider` interface**
   ```typescript
   interface IEmailProvider {
     listEmails(account: Account, args: ListEmailsArgs): Promise<Email[]>;
     readEmail(account: Account, emailId: string): Promise<Email>;
     sendEmail(account: Account, args: SendEmailArgs): Promise<EmailResult>;
     searchEmails(account: Account, args: SearchEmailsArgs): Promise<Email[]>;
   }
   ```
   - Defines standard contract all email providers must implement
   - Account-aware (each method receives Account object)
   - Returns normalized Email/EmailResult types

2. **Create `EmailService` orchestrator**
   ```typescript
   class EmailService {
     constructor(private providers: Map<string, IEmailProvider>) {}

     async listEmails(args: ListEmailsArgs): Promise<Email[]> {
       // Query ALL email accounts across ALL providers
       const accounts = await getEmailAccounts();
       const results = await Promise.all(
         accounts.map(acc => this.providers.get(acc.pluginId).listEmails(acc, args))
       );
       return this.normalize(results).sort(byTimestamp).slice(0, args.max_results);
     }
   }
   ```
   - Aggregates results from multiple providers
   - Handles parallel execution
   - Normalizes and sorts cross-provider results

3. **Create shared utilities**
   - `services/shared/retry.ts` - Exponential backoff retry logic
   - `services/shared/rate-limiter.ts` - Per-account rate limiting
   - `services/shared/cache.ts` - Generic caching interface
   - `services/shared/normalizer.ts` - Response standardization

4. **Update plugin interface**
   ```typescript
   // packages/core/src/types/plugin.ts
   - readonly category: PluginCategory;
   + readonly categories: PluginCategory[];  // Allow multi-use-case providers
   ```

**Files to create**:
- `packages/gateway/src/services/email/EmailService.ts`
- `packages/gateway/src/services/email/IEmailProvider.ts`
- `packages/gateway/src/services/email/types.ts` (Email, EmailResult, etc.)
- `packages/gateway/src/services/shared/retry.ts`
- `packages/gateway/src/services/shared/rate-limiter.ts`
- `packages/gateway/src/services/shared/cache.ts`

**Files to modify**:
- `packages/core/src/types/plugin.ts` (category → categories)

**Estimated time**: 1-2 days

---

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

#### 5.5.3: Email Service Implementation & Integration

1. **Refactor Gmail plugin to implement IEmailProvider**
   - Extract business logic from `plugins/gmail/src/index.ts`
   - Move to `services/email/providers/GmailProvider.ts`
   - Keep OAuth and credential management in plugin
   - Plugin delegates tool execution to GmailProvider

2. **Refactor Outlook plugin to implement IEmailProvider**
   - Extract business logic from `plugins/outlook/src/index.ts`
   - Move to `services/email/providers/OutlookProvider.ts`
   - Keep Microsoft Graph OAuth in plugin
   - Plugin delegates tool execution to OutlookProvider

3. **Implement EmailService methods**
   - `listEmails()` - Query all accounts, merge, sort by timestamp
   - `readEmail()` - Auto-detect provider from emailId or cache
   - `sendEmail()` - Use specified account or primary account
   - `searchEmails()` - Query all accounts with search term

   Example flow:
   ```
   AI calls: list_emails(max_results: 10)

   EmailService queries:
   - GmailProvider.listEmails(work@gmail.com, args)
   - GmailProvider.listEmails(personal@gmail.com, args)
   - OutlookProvider.listEmails(corporate@outlook.com, args)

   Returns: Merged 30 emails, sorted by date, limited to 10 most recent
   ```

4. **Add error handling**
   - If one provider fails, return partial results from others
   - Tag results with source account for debugging
   - Log provider failures without breaking aggregation

**Files to create**:
- `packages/gateway/src/services/email/providers/GmailProvider.ts`
- `packages/gateway/src/services/email/providers/OutlookProvider.ts`

**Files to modify**:
- `plugins/gmail/src/index.ts` (delegate to GmailProvider)
- `plugins/outlook/src/index.ts` (delegate to OutlookProvider)

#### 5.5.5: Email Cache & Cross-Provider Tracking

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

#### 5.5.6: Update MCP Plugin Registry

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

#### 5.5.7: Web UI for Account Management

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

#### 5.5.8: Active Provider Management (Use existing activeProviders table)

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

---

**Phase 5.5 Summary & Architecture Impact**

**Total Estimated Time: 7-10 days** (breakdown):
- 5.5.0: Service architecture (1-2 days)
- 5.5.1: Database foundation (1 day)
- 5.5.2: Credential management (1 day)
- 5.5.3: Provider refactoring (1-2 days)
- 5.5.4: ProtonMail/IMAP plugin (2-3 days)
- 5.5.5: Email cache (1 day)
- 5.5.6: MCP registry updates (0.5 days)
- 5.5.7: Web UI (1 day)
- 5.5.8: Active providers (0.5 days)

**What This Achieves:**

1. **Validated Email Abstraction**
   - 3 diverse providers (OAuth + IMAP, Google + Microsoft + independent)
   - Proven `IEmailProvider` interface works across auth methods
   - Real-world multi-account support (work + personal + side project)

2. **Use-Case Service Pattern**
   - Established pattern for `services/email/` architecture
   - Shared utilities (`retry`, `cache`, `rate-limiter`) ready for reuse
   - Clear separation: plugins own auth, services own business logic

3. **Foundation for Other Use Cases**
   - Calendar (Phase 6): Apply EmailService pattern → CalendarService
   - Tasks (Phase 7): Reuse shared utilities, proven adapter pattern
   - Notes, Storage (Future): Drop-in new use-case services

4. **Architecture Learnings**
   - What abstracts well (list, read, send, search)
   - What doesn't (provider-specific features like labels, categories)
   - How to handle partial failures (one provider down)
   - Rate limiting strategies per provider

**Priority Justification**: This is **CRITICAL for V1** because:
- Aligns with CoreLink's core vision of service abstraction
- Validates architecture before expanding to 5+ use cases
- Enables real-world multi-account use case (most requested feature)
- Makes universal interface actually "universal" (3 providers prove it)
- Prevents costly refactors by getting abstractions right upfront
- Foundation for multi-user support in V2

**Success Criteria:**
- ✅ AI agent calls `list_emails` and gets results from Gmail + Outlook + ProtonMail
- ✅ User can connect 2 Gmail, 1 Outlook, 1 ProtonMail account
- ✅ Switching active email provider works seamlessly
- ✅ Provider-specific tools still accessible (`gmail__create_label`)
- ✅ Shared retry/cache/rate-limit utilities work across all providers
- ✅ Code patterns are documented for calendar/task implementation