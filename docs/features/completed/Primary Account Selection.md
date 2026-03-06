# Primary Account Selection

[NOTE] We need to think this through, don't implement in the current state.
Instead of a primary account, we should let llm select an account for each request. This is more flexible and user friendly. So when creating an account, user can give it a name, and the llm can use that name to select the account.

**Goal**: Let users choose which acccount to use for each category

**Tasks**:
1. **Add active provider setting**
   - Store in `active_providers` table (already in schema), as we will let user select an account, this needs to be evaluated.
   - Default to first connected provider
   - UI to select active provider

2. **Route requests to active provider**
   - When AI agent calls `send_email`, check active email provider
   - Route to Gmail or Outlook plugin accordingly
   - Fall back if active provider disconnected

3. **Add provider switching UI**
   - Radio buttons: "select an account" as primary
   - Show which is currently active
   - Disable if provider not connected

**Files to create**:
- `packages/gateway/src/services/provider-router.ts`
- Update `packages/web/src/App.tsx`

**Estimated time**: 1 day