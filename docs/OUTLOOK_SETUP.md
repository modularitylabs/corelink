# Microsoft Outlook Setup Guide

## Overview

CoreLink now supports **Microsoft Outlook** in addition to Gmail! Both email providers implement the same standard email tools (`list_emails`, `send_email`, etc.), demonstrating CoreLink's service abstraction pattern.

## Quick Setup

### 1. Create Microsoft OAuth App

1. Go to [Azure Portal](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click "New registration"
3. Fill in:
   - **Name**: CoreLink
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**:
     - Platform: **Mobile and desktop applications**
     - URI: `http://127.0.0.1:3000/oauth/callback/outlook`
4. Click "Register"
5. **Copy the Application (client) ID**

### 2. Configure API Permissions

1. In your app, go to "API permissions"
2. Click "Add a permission" → "Microsoft Graph" → "Delegated permissions"
3. Add these permissions:
   - `Mail.Read`
   - `Mail.Send`
   - `Mail.ReadWrite`
   - `offline_access`
   - `openid`
   - `profile`
4. Click "Add permissions"
5. (Optional) Click "Grant admin consent" if you have admin rights

### 3. Update CoreLink Configuration

Add your Client ID to `.env`:

```env
MICROSOFT_CLIENT_ID=your-application-id-from-azure
```

### 4. Test the Integration

1. Restart the gateway server:
   ```bash
   npm run dev -w @corelink/gateway
   ```

2. Open the web dashboard: http://localhost:5173

3. Click **"Connect Outlook"**

4. Authorize CoreLink in the Microsoft login popup

5. Done! Outlook is now connected

## How It Works (PKCE OAuth)

Like Gmail, Outlook uses **PKCE (Proof Key for Code Exchange)**:

- ✅ **No client secret** - uses public Client ID only
- ✅ **No user setup** (once you configure it) - Client ID is provided
- ✅ **Secure** - PKCE code challenge prevents token theft
- ✅ **Individual quotas** - each user authenticates with their own Microsoft account

## Service Abstraction in Action

Both Gmail and Outlook plugins implement the same standard tools:

| Standard Tool | Gmail API | Outlook (Graph API) |
|---------------|-----------|---------------------|
| `list_emails` | `users.messages.list` | `/me/messages` |
| `read_email` | `users.messages.get` | `/me/messages/{id}` |
| `send_email` | `users.messages.send` | `/me/sendMail` |
| `search_emails` | `users.messages.list` with `q` param | `/me/messages` with `$search` |

AI agents can switch between Gmail and Outlook **without any code changes** - they just call `list_emails` and CoreLink routes to the active provider!

## Troubleshooting

### "invalid_client" Error

- Make sure you selected **"Mobile and desktop applications"** (not "Web")
- Verify the redirect URI is exactly: `http://127.0.0.1:3000/oauth/callback/outlook`
- Check that the Client ID in `.env` matches Azure Portal

### "AADSTS700016: Application not found" Error

- The Client ID is incorrect or the app was deleted
- Double-check you copied the Application (client) ID correctly

### "Insufficient privileges" Error

- The required API permissions weren't added
- Try granting admin consent for the permissions

### Can't access emails after connecting

- Make sure you added `Mail.Read`, `Mail.Send`, and `Mail.ReadWrite` permissions
- The access token might have expired - try disconnecting and reconnecting

## Comparing Gmail vs Outlook Setup

| Feature | Gmail | Outlook |
|---------|-------|---------|
| OAuth Platform | Google Cloud Console | Azure Portal |
| App Type | Desktop app | Mobile and desktop applications |
| Redirect URI | `http://127.0.0.1:3000/oauth/callback` | `http://127.0.0.1:3000/oauth/callback/outlook` |
| API | Gmail API | Microsoft Graph API |
| PKCE Support | ✅ Yes | ✅ Yes |
| Client Secret | ❌ Not needed | ❌ Not needed |

## Next Steps

- Configure access policies (coming soon)
- Switch active email provider in settings
- Connect AI agents via MCP protocol
- View audit logs of all email access

---

**Note**: Both Gmail and Outlook can be connected simultaneously. You can choose which one to use as the "active" email provider for AI agents.
