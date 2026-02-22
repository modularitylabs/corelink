# CoreLink Policy Engine Configuration Guide

**Last Updated**: 2025-02-22
**Version**: 0.1.0

---

## 🎛️ Configuration Methods

### 1. **Default Configuration (Automatic)**

The policy engine is **automatically configured** when you start the CoreLink gateway:

```bash
npm run dev -w @corelink/gateway
```

On first startup, it will:
- ✅ Load 7 default policy rules
- ✅ Load 7 default redaction patterns (disabled)
- ✅ Set default action to `BLOCK` (fail-safe)

**Default Policies Created**:
1. ✅ **ALLOW** - List up to 10 emails
2. ✅ **ALLOW** - List up to 50 emails
3. ✅ **ALLOW** - List up to 100 emails
4. ✅ **ALLOW** - Search emails
5. ✅ **REDACT** - Redact email body content
6. ✅ **REQUIRE_APPROVAL** - Require approval for >100 emails
7. ✅ **BLOCK** - Block all send_email operations

---

### 2. **Via REST API** (Recommended)

Use the HTTP API to manage policies programmatically:

#### List Current Policies
```bash
curl http://localhost:3000/api/policies
```

#### Create a New Policy
```bash
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "action": "ALLOW",
    "condition": {
      "and": [
        {"==": [{"var": "tool"}, "list_emails"]},
        {"<=": [{"var": "args.max_results"}, 25]}
      ]
    },
    "description": "Allow listing up to 25 emails",
    "priority": 110,
    "enabled": true
  }'
```

#### Enable/Disable a Policy
```bash
# Disable the send_email block temporarily
curl -X PUT http://localhost:3000/api/policies/pol-block-send-email \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

#### Change Default Action
```bash
# In code (packages/gateway/src/index.ts):
import { policyEngine } from './services/policy-engine.js';
policyEngine.setDefaultAction('ALLOW'); // ALLOW or BLOCK
```

---

### 3. **Via Database** (Direct SQL)

For advanced users, you can modify the SQLite database directly:

```bash
# Open the database
sqlite3 .corelink/corelink.db

# View all policies
SELECT id, action, description, priority, enabled FROM policy_rules;

# Disable a policy
UPDATE policy_rules SET enabled = 0 WHERE id = 'pol-block-send-email';

# Delete a policy
DELETE FROM policy_rules WHERE id = 'pol-example';
```

**Database Location**: `.corelink/corelink.db`

---

### 4. **Environment Variables**

Configure database location (policies are stored here):

```bash
# In .env file
DATABASE_URL=./.corelink/corelink.db  # Default location
LOG_LEVEL=debug  # Enable debug logging for policy evaluation
```

---

### 5. **Programmatic Configuration**

Create a custom initialization script:

```typescript
// scripts/configure-policies.ts
import { db } from '../packages/gateway/src/db/index.js';
import { policyRules } from '../packages/gateway/src/db/schema.js';

const customPolicies = [
  {
    id: 'pol-custom-1',
    pluginId: null,
    action: 'ALLOW',
    condition: JSON.stringify({
      "==": [{"var": "agent"}, "Claude Code"]
    }),
    description: 'Trust Claude Code completely',
    priority: 300,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

for (const policy of customPolicies) {
  await db.insert(policyRules).values(policy).onConflictDoNothing();
}
```

---

## 🎨 Common Configuration Scenarios

### Scenario 1: **Allow Everything (Development Mode)**

```bash
# Disable all blocking policies
curl -X PUT http://localhost:3000/api/policies/pol-block-send-email \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Change default action to ALLOW
# (Requires code change in packages/gateway/src/services/policy-engine.ts:19)
```

Or create a high-priority catch-all:
```bash
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "action": "ALLOW",
    "condition": true,
    "description": "Development mode - allow all",
    "priority": 999,
    "enabled": true
  }'
```

---

### Scenario 2: **Block Everything Except Specific Tools**

```bash
# Create default deny
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "action": "BLOCK",
    "condition": true,
    "description": "Default deny all",
    "priority": 0,
    "enabled": true
  }'

# Allow only list_emails
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "action": "ALLOW",
    "condition": {"==": [{"var": "tool"}, "list_emails"]},
    "description": "Allow only email listing",
    "priority": 100,
    "enabled": true
  }'
```

---

### Scenario 3: **Enable Redaction for Privacy**

```bash
# Enable email redaction pattern
curl -X PUT http://localhost:3000/api/redaction-patterns/red-email \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Enable phone number redaction
curl -X PUT http://localhost:3000/api/redaction-patterns/red-phone-us \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Ensure REDACT policy is enabled
curl -X PUT http://localhost:3000/api/policies/pol-redact-email-body \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

---

### Scenario 4: **Plugin-Specific Policies**

```bash
# Allow Gmail to send emails, but not Outlook
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "pluginId": "com.corelink.gmail",
    "action": "ALLOW",
    "condition": {"==": [{"var": "tool"}, "send_email"]},
    "description": "Gmail can send emails",
    "priority": 250,
    "enabled": true
  }'
```

---

### Scenario 5: **Agent-Specific Rules**

```bash
# Trust Claude Code more than other agents
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "action": "ALLOW",
    "condition": {
      "and": [
        {"==": [{"var": "agent"}, "Claude Code"]},
        {"<=": [{"var": "args.max_results"}, 100]}
      ]
    },
    "description": "Claude Code can access up to 100 emails",
    "priority": 150,
    "enabled": true
  }'
```

---

## 🔍 Testing Your Configuration

### 1. Check Active Policies
```bash
curl http://localhost:3000/api/policies | jq '.[] | {id, action, description, enabled, priority}'
```

### 2. View Audit Logs
```bash
curl http://localhost:3000/api/audit-logs/recent?limit=10 | jq
```

### 3. Check Policy Statistics
```bash
curl http://localhost:3000/api/audit-stats | jq
```

Example output:
```json
{
  "totalRequests": 45,
  "allowedRequests": 40,
  "blockedRequests": 3,
  "redactedRequests": 2,
  "approvalRequests": 0,
  "erroredRequests": 0
}
```

---

## 📖 Full API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/policies` | GET | List all policies |
| `/api/policies` | POST | Create new policy |
| `/api/policies/:id` | GET | Get policy by ID |
| `/api/policies/:id` | PUT | Update policy |
| `/api/policies/:id` | DELETE | Delete policy |
| `/api/redaction-patterns` | GET | List redaction patterns |
| `/api/redaction-patterns` | POST | Create pattern |
| `/api/redaction-patterns/:id` | PUT | Update pattern |
| `/api/redaction-patterns/:id` | DELETE | Delete pattern |
| `/api/approval-requests` | GET | List pending approvals |
| `/api/approval-requests/:id/approve` | POST | Approve request |
| `/api/approval-requests/:id/deny` | POST | Deny request |
| `/api/audit-logs` | GET | Query audit logs |
| `/api/audit-logs/:id` | GET | Get audit log entry |
| `/api/audit-stats` | GET | Get statistics |

---

## 🎯 Quick Start Checklist

1. ✅ **Start the gateway**: `npm run dev -w @corelink/gateway`
2. ✅ **Default policies load automatically**
3. ✅ **List policies**: `curl http://localhost:3000/api/policies`
4. ✅ **Test with an AI agent** (policies enforce automatically)
5. ✅ **Check audit logs**: `curl http://localhost:3000/api/audit-logs/recent`
6. ✅ **Adjust policies** via API as needed

---

## 🛠️ Advanced Configuration

### Custom Policy Loader

Create a script to load custom policies on startup:

```typescript
// packages/gateway/src/config/custom-policies.ts
import { db } from '../db/index.js';
import { policyRules } from '../db/schema.js';

export async function loadCustomPolicies() {
  const policies = [
    {
      id: 'pol-org-restrict-hours',
      pluginId: null,
      action: 'BLOCK',
      condition: JSON.stringify({
        "or": [
          {"<": [{"var": "metadata.hour"}, 9]},
          {">": [{"var": "metadata.hour"}, 17]}
        ]
      }),
      description: 'Block access outside business hours',
      priority: 200,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // Add more custom policies...
  ];

  for (const policy of policies) {
    await db.insert(policyRules).values(policy).onConflictDoNothing();
  }
}
```

Then import in `packages/gateway/src/index.ts`:
```typescript
import { loadCustomPolicies } from './config/custom-policies.js';

// After seedPolicies()
await loadCustomPolicies();
```

---

### Policy Priority Guide

Use this priority scheme for consistent policy management:

| Priority Range | Purpose | Examples |
|---------------|---------|----------|
| 300+ | Security-critical blocks | Block delete operations, block external sharing |
| 200-299 | High-priority restrictions | Block send_email, rate limiting |
| 100-199 | Conditional rules | Approval workflows, redaction |
| 50-99 | General allows | Allow read operations within limits |
| 1-49 | Permissive allows | Allow search, allow low-volume reads |
| 0 | Default fallback | Default deny or allow |

---

### Batch Policy Operations

Create multiple policies at once:

```bash
# policies.json
[
  {
    "action": "ALLOW",
    "condition": {"==": [{"var": "tool"}, "list_emails"]},
    "description": "Allow email listing",
    "priority": 100
  },
  {
    "action": "ALLOW",
    "condition": {"==": [{"var": "tool"}, "search_emails"]},
    "description": "Allow email search",
    "priority": 100
  }
]
```

```bash
# Load policies
cat policies.json | jq -c '.[]' | while read policy; do
  curl -X POST http://localhost:3000/api/policies \
    -H "Content-Type: application/json" \
    -d "$policy"
done
```

---

### Export/Import Policies

**Export current policies**:
```bash
curl http://localhost:3000/api/policies > policies-backup.json
```

**Import policies**:
```bash
cat policies-backup.json | jq -c '.[]' | while read policy; do
  curl -X POST http://localhost:3000/api/policies \
    -H "Content-Type: application/json" \
    -d "$policy"
done
```

---

## 🔐 Security Best Practices

### 1. Start with Default Deny
Always have a catch-all BLOCK policy at priority 0:
```json
{
  "action": "BLOCK",
  "condition": true,
  "priority": 0,
  "description": "Default deny for security"
}
```

### 2. Audit Regularly
Check audit logs weekly for suspicious patterns:
```bash
# Check all blocked requests
curl "http://localhost:3000/api/audit-logs?status=denied&limit=100" | jq
```

### 3. Use Plugin-Specific Policies
Don't grant blanket permissions:
```json
{
  "pluginId": "com.corelink.gmail",  // Specific to Gmail
  "action": "ALLOW",
  "condition": {"==": [{"var": "tool"}, "list_emails"]}
}
```

### 4. Enable Redaction for Sensitive Data
For email/messaging plugins, enable PII redaction:
```bash
curl -X PUT http://localhost:3000/api/redaction-patterns/red-email -d '{"enabled": true}'
curl -X PUT http://localhost:3000/api/redaction-patterns/red-phone-us -d '{"enabled": true}'
curl -X PUT http://localhost:3000/api/redaction-patterns/red-ssn -d '{"enabled": true}'
```

### 5. Use Approval Workflows for Learning
Start with REQUIRE_APPROVAL, graduate to ALLOW:
```json
{
  "action": "REQUIRE_APPROVAL",
  "condition": {"==": [{"var": "tool"}, "new_untested_tool"]},
  "description": "Require approval while learning usage patterns"
}
```

---

## 📊 Monitoring & Observability

### View Real-Time Activity
```bash
# Recent activity (last 20 entries)
watch -n 2 'curl -s http://localhost:3000/api/audit-logs/recent | jq ".[] | {tool, action: .policyDecision.action, status}"'
```

### Policy Effectiveness Report
```bash
curl http://localhost:3000/api/audit-stats | jq '{
  total: .totalRequests,
  allowed_pct: (.allowedRequests / .totalRequests * 100 | floor),
  blocked_pct: (.blockedRequests / .totalRequests * 100 | floor),
  by_plugin: .byPlugin
}'
```

### Find Unused Policies
Policies that never match show up with `ruleId: null` in audit logs:
```bash
curl http://localhost:3000/api/audit-logs?limit=1000 | jq '
  [.logs[].policyDecision.ruleId] | group_by(.) |
  map({rule: .[0], count: length})
'
```

---

## 🐛 Troubleshooting

### All Requests Are Blocked
**Check**: Default action is BLOCK and no ALLOW rules match.

**Fix**:
```bash
# List policies to find the issue
curl http://localhost:3000/api/policies | jq '.[] | select(.enabled == true)'

# Create a temporary allow-all for debugging
curl -X POST http://localhost:3000/api/policies \
  -d '{"action": "ALLOW", "condition": true, "priority": 999, "description": "Debug allow-all"}'
```

### Policies Not Loading
**Check**: Database permissions and seed script errors.

**Debug**:
```bash
# Check database exists
ls -la .corelink/corelink.db

# Check logs
npm run dev -w @corelink/gateway 2>&1 | grep -i policy

# Manually trigger seed
cd packages/gateway && node -e "
  import('./src/db/seed-policies.js').then(m => m.seedPolicies())
"
```

### Redaction Not Working
**Check**: Redaction patterns are enabled AND policy action is REDACT.

**Fix**:
```bash
# Check pattern status
curl http://localhost:3000/api/redaction-patterns | jq '.[] | {id, name, enabled}'

# Enable a pattern
curl -X PUT http://localhost:3000/api/redaction-patterns/red-email \
  -d '{"enabled": true}'

# Verify REDACT policy exists
curl http://localhost:3000/api/policies | jq '.[] | select(.action == "REDACT")'
```

---

## 📚 Learn More

- **Full Policy Guide**: `docs/POLICY_GUIDE.md` - Complete reference with JSON Logic examples
- **Architecture**: `docs/ARCHITECTURE.md` - System design and data flows
- **API Spec**: `docs/POLICY_GUIDE.md` (API Reference section)

---

## 🎓 Example: Complete Workflow

```bash
# 1. Start the server
npm run dev -w @corelink/gateway

# 2. Check default policies
curl http://localhost:3000/api/policies | jq

# 3. Create a custom policy
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "action": "ALLOW",
    "condition": {
      "and": [
        {"==": [{"var": "tool"}, "list_emails"]},
        {"==": [{"var": "agent"}, "Claude Code"]},
        {"<=": [{"var": "args.max_results"}, 20]}
      ]
    },
    "description": "Allow Claude Code to list up to 20 emails",
    "priority": 150,
    "enabled": true
  }'

# 4. Test with AI agent (triggers policy evaluation)
# ... AI agent makes request ...

# 5. Check audit logs
curl http://localhost:3000/api/audit-logs/recent?limit=5 | jq

# 6. View statistics
curl http://localhost:3000/api/audit-stats | jq

# 7. Adjust policy based on usage
curl -X PUT http://localhost:3000/api/policies/pol-xxx \
  -d '{"priority": 200}'
```

---

**Need help?** The policy engine is already running with sensible defaults! Just start the gateway and it will protect your data automatically. You can fine-tune policies later using the API. 🚀
