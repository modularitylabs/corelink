# CoreLink Web Dashboard

The web-based management interface for CoreLink gateway.

## Features

### 📊 Dashboard
- Connect and manage OAuth integrations (Gmail, Outlook)
- View connection status at a glance
- Quick access to getting started guide

### 🛡️ Policies
- Create, edit, and delete policy rules
- Enable/disable policies with toggle switches
- Configure JSON Logic conditions
- Set priority levels and plugin-specific rules
- Support for all policy actions: ALLOW, BLOCK, REDACT, REQUIRE_APPROVAL

### 🔒 Redaction
- Manage redaction patterns (regex-based)
- Enable/disable patterns individually
- Configure custom replacement text
- Built-in patterns for emails, phone numbers, SSN, etc.

### ⏳ Approvals
- Review pending approval requests in real-time
- Approve or deny AI agent requests
- Modify request arguments before approval
- Auto-refresh every 5 seconds for new requests

### 📝 Audit Logs
- View complete audit trail of all AI requests
- Filter by status, action, plugin, or agent
- Interactive statistics dashboard
- Detailed log inspection modal
- Real-time activity monitoring

## Technology Stack

- **React 18.2+** - UI framework
- **TypeScript** - Type safety
- **React Router** - Navigation
- **TailwindCSS** - Styling
- **React Hot Toast** - Notifications
- **Vite** - Build tool

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## API Integration

All API calls go through the centralized client in `src/api/client.ts`. The API client provides:

- Type-safe API calls with TypeScript interfaces
- Automatic error handling
- Consistent request/response formatting

## Project Structure

```
src/
├── api/
│   └── client.ts              # API client with all endpoints
├── components/
│   ├── PolicyBadge.tsx        # Color-coded action badges
│   ├── StatusToggle.tsx       # Enable/disable toggle
│   ├── JSONEditor.tsx         # JSON editing with validation
│   ├── ConfirmDialog.tsx      # Confirmation modal
│   └── LoadingSpinner.tsx     # Loading indicator
├── pages/
│   ├── DashboardPage.tsx      # OAuth connections
│   ├── PoliciesPage.tsx       # Policy management
│   ├── RedactionPage.tsx      # Redaction patterns
│   ├── ApprovalsPage.tsx      # Approval requests
│   └── AuditLogsPage.tsx      # Audit log viewer
├── App.tsx                     # Main app with routing
└── main.tsx                    # Entry point
```

## Usage

1. Start the CoreLink gateway:
   ```bash
   npm run dev -w @corelink/gateway
   ```

2. Start the web UI:
   ```bash
   npm run dev -w @corelink/web
   ```

3. Open http://localhost:5173 in your browser

4. Navigate through the tabs:
   - **Dashboard**: Connect your email accounts
   - **Policies**: Configure access control rules
   - **Redaction**: Set up data redaction patterns
   - **Approvals**: Review pending requests
   - **Audit Logs**: Monitor all AI activity

## Features in Detail

### Policy Management

Create policies using JSON Logic syntax:

```json
{
  "action": "ALLOW",
  "condition": {
    "and": [
      {"==": [{"var": "tool"}, "list_emails"]},
      {"<=": [{"var": "args.max_results"}, 10]}
    ]
  },
  "description": "Allow listing up to 10 emails",
  "priority": 100,
  "enabled": true
}
```

### Redaction Patterns

Configure regex patterns to redact sensitive data:

- **Email addresses**: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
- **Phone numbers**: `\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}`
- **SSN**: `\d{3}-\d{2}-\d{4}`
- **Credit cards**: `\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}`

### Approval Workflow

1. AI agent makes a request requiring approval
2. Request appears in the Approvals page
3. Review request details and arguments
4. Optionally modify arguments
5. Approve or deny the request

### Audit Trail

Every request is logged with:
- Timestamp
- Tool name and arguments
- Agent name and plugin ID
- Policy decision (action + rule ID)
- Status (success/denied/error)
- Full request/response details

## Environment

The web UI expects the gateway to be running at `http://localhost:3000` by default. This can be configured in `src/api/client.ts`.

## Future Enhancements

- [ ] Dark mode support
- [ ] Export/import policies as JSON
- [ ] Policy templates library
- [ ] Real-time WebSocket updates
- [ ] Multi-user support with authentication
- [ ] Advanced analytics dashboard
- [ ] Custom themes

## License

Same as the parent CoreLink project.
