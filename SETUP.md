# CoreLink Setup Guide

## Quick Start - Gmail Login

CoreLink uses **PKCE OAuth** (same as GitHub CLI, gcloud, etc.) - **no Google Cloud setup required!**

### 1. Build and Start

No configuration needed! Just build and run:

1. Build all packages:
   ```bash
   npm run build
   ```

2. Start the gateway server (in one terminal):
   ```bash
   npm run dev -w @corelink/gateway
   ```

3. Start the web UI (in another terminal):
   ```bash
   npm run dev -w @corelink/web
   ```

### 2. Connect Gmail

1. Open your browser to http://localhost:5173
2. Click "Connect Gmail"
3. Authorize CoreLink in the Google OAuth popup
4. You should see "Gmail Connected!" confirmation

That's it! No API keys, no Google Cloud Console, no configuration.

### 3. Verify

Your Gmail credentials are now securely stored in:
- Database: `.corelink/corelink.db` (encrypted)
- Encryption key: `.corelink/encryption.key`

## How It Works (PKCE OAuth)

CoreLink uses **PKCE (Proof Key for Code Exchange)** - the industry standard for native/desktop apps:

- ✅ **No client secret** - uses public Client ID only (safe to ship in open source)
- ✅ **No user setup** - Client ID is provided by CoreLink maintainers
- ✅ **Secure** - PKCE code challenge prevents token theft
- ✅ **Individual quotas** - each user authenticates with their own Google account

This is the same pattern used by:
- GitHub CLI (`gh auth login`)
- Google Cloud SDK (`gcloud auth login`)
- Vercel CLI
- Netlify CLI

## Advanced: Using Your Own OAuth App

If you want to use your own Google Cloud OAuth credentials (optional):

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials as **"Desktop application"**
3. Set `GOOGLE_CLIENT_ID` in `.env`
4. Restart the gateway

## Troubleshooting

### Can't connect to server
- Make sure the gateway is running on port 3000: `npm run dev -w @corelink/gateway`
- Check that nothing else is using port 3000

### Database errors
- Delete `.corelink/corelink.db` and restart to recreate
- Make sure the `.corelink` directory exists and is writable

### OAuth popup blocked
- Allow popups for localhost:5173 in your browser
- Or copy the auth URL and paste in a new tab

## Next Steps

Once Gmail is connected:
- View audit logs (coming soon)
- Set up policies (coming soon)
- Connect AI agents via MCP (coming soon)

## Security Notes

- The `.corelink/` directory is git-ignored and contains sensitive data
- Encryption key is automatically generated on first run
- OAuth tokens are encrypted at rest using AES-256-GCM
- Client ID is public (safe to commit) - no secrets in the codebase
- Each user authorizes their own Google account (not shared credentials)
