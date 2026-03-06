# Audit Logging UI (MEDIUM PRIORITY)

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