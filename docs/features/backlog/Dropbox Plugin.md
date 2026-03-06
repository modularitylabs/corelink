# Dropbox Plugin (LOW PRIORITY)

## Goal

Add Dropbox cloud storage support, enabling AI agents to list, read, upload, search, and delete files in the user's Dropbox account. This rounds out the storage abstraction by covering the leading non-Google, non-Microsoft cloud storage provider.

## Motivation

- Dropbox has a significant user base, especially among creative professionals and teams not in the Google/Microsoft ecosystem
- Completes the storage abstraction: OneDrive + Google Drive + Dropbox = most users covered
- Dropbox API v2 is clean and well-documented
- Enables CoreLink to serve users who don't use Microsoft or Google cloud storage
- PKCE OAuth 2.0 is supported by Dropbox, consistent with the rest of the project

## Standard Tools

| Tool | Args | Description |
|------|------|-------------|
| `list_files` | `folder_id?`, `query?`, `max_results?` | List files in a folder (defaults to root) |
| `read_file` | `file_id` | Get file metadata + temporary download link |
| `upload_file` | `name`, `content`, `folder_id?` | Upload a file (base64 content, < 150MB) |
| `delete_file` | `file_id` | Delete a file or folder |
| `search_files` | `query`, `max_results?` | Search files by name |

Note: `folder_id` in Dropbox is actually a path (e.g., `/Documents`). The plugin should handle the path-based API and expose an `id`-based interface consistent with the other storage plugins.

## Implementation Plan

#### Phase 11.1: Add Storage Tool Constants to Core

(Skip if already done by OneDrive or Google Drive implementation.)

```typescript
// packages/core/src/index.ts — add to STANDARD_TOOLS
export const STANDARD_TOOLS = {
  // ... existing tools ...

  // Storage
  FILE_LIST: 'list_files',
  FILE_READ: 'read_file',
  FILE_UPLOAD: 'upload_file',
  FILE_DELETE: 'delete_file',
  FILE_SEARCH: 'search_files',
} as const;
```

#### Phase 11.2: OAuth App Registration

Unlike other plugins, Dropbox requires a **new app registration**:

1. Go to [https://www.dropbox.com/developers/apps](https://www.dropbox.com/developers/apps)
2. Create a new app: "Scoped access" → "Full Dropbox" (or "App folder" for restricted access)
3. Enable PKCE: Under "OAuth 2" settings, enable "Allow PKCE without secret"
4. Set redirect URI: `http://localhost:3000/api/dropbox/oauth/callback`
5. Note the App Key (Client ID) — no App Secret needed with PKCE

Required permissions (scopes):
- `files.metadata.read`
- `files.content.read`
- `files.content.write`

#### Phase 11.3: OAuth Routes (gateway)

Create `packages/gateway/src/routes/dropbox-oauth.ts` following the Gmail PKCE pattern:

```typescript
import Fastify from 'fastify';
import { generatePKCE } from '../crypto/pkce.js';
import { CredentialManager } from '../services/credential-manager.js';

const DROPBOX_CLIENT_ID = 'your-dropbox-app-key';
const DROPBOX_AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const REDIRECT_URI = 'http://localhost:3000/api/dropbox/oauth/callback';

export function registerDropboxOAuthRoutes(app: FastifyInstance, cm: CredentialManager) {
  // GET /api/dropbox/oauth/start
  app.get('/api/dropbox/oauth/start', async (req, reply) => {
    const { codeVerifier, codeChallenge } = generatePKCE();
    // Store verifier (in-memory, expires 10 min)
    const state = crypto.randomUUID();
    pkceStore.set(state, codeVerifier);

    const authUrl = new URL(DROPBOX_AUTH_URL);
    authUrl.searchParams.set('client_id', DROPBOX_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('token_access_type', 'offline');  // Get refresh token

    return reply.redirect(authUrl.toString());
  });

  // GET /api/dropbox/oauth/callback
  app.get('/api/dropbox/oauth/callback', async (req, reply) => {
    const { code, state } = req.query as { code: string; state: string };
    const codeVerifier = pkceStore.get(state);

    const tokenRes = await fetch(DROPBOX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: DROPBOX_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    const tokens = await tokenRes.json();
    await cm.storeCredential(`dropbox:${tokens.account_id}`, tokens);
    return reply.redirect('http://localhost:5173?connected=dropbox');
  });
}
```

#### Phase 11.4: Plugin Scaffold

1. Create `plugins/dropbox/` with `package.json` and `tsconfig.json`
2. Install `dropbox` npm package
3. Implement `DropboxPlugin`

```typescript
import { Dropbox } from 'dropbox';
import type { ICoreLinkPlugin, PluginTool } from '@corelink/core';
import { STANDARD_TOOLS } from '@corelink/core';

export class DropboxPlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.dropbox';
  readonly name = 'Dropbox';
  readonly version = '1.0.0';
  readonly category = 'storage';

  private dbx: Dropbox;

  constructor(private accessToken: string) {
    this.dbx = new Dropbox({ accessToken });
  }

  getTools(): PluginTool[] {
    return [
      { name: STANDARD_TOOLS.FILE_LIST, /* ... */ },
      { name: STANDARD_TOOLS.FILE_READ, /* ... */ },
      { name: STANDARD_TOOLS.FILE_UPLOAD, /* ... */ },
      { name: STANDARD_TOOLS.FILE_DELETE, /* ... */ },
      { name: STANDARD_TOOLS.FILE_SEARCH, /* ... */ },
    ];
  }
}
```

#### Phase 11.5: Tool Implementations

```typescript
private async listFiles(args: Record<string, unknown>) {
  const path = (args.folder_id as string) ?? '';
  const result = await this.dbx.filesListFolder({
    path,
    limit: (args.max_results as number) ?? 20,
  });

  return result.result.entries.map(entry => ({
    id: entry.path_lower,  // Dropbox uses paths as IDs
    name: entry.name,
    type: entry['.tag'],  // 'file' or 'folder'
    size: entry['.tag'] === 'file' ? entry.size : undefined,
    modifiedAt: entry['.tag'] === 'file' ? entry.server_modified : undefined,
  }));
}

private async readFile(args: Record<string, unknown>) {
  const meta = await this.dbx.filesGetMetadata({ path: args.file_id as string });
  const link = await this.dbx.filesGetTemporaryLink({ path: args.file_id as string });
  return {
    id: meta.result.path_lower,
    name: meta.result.name,
    size: (meta.result as any).size,
    downloadUrl: link.result.link,  // Expires in 4 hours
    modifiedAt: (meta.result as any).server_modified,
  };
}

private async uploadFile(args: Record<string, unknown>) {
  const path = args.folder_id
    ? `${args.folder_id}/${args.name}`
    : `/${args.name}`;
  const content = Buffer.from(args.content as string, 'base64');

  const result = await this.dbx.filesUpload({
    path,
    contents: content,
    mode: { '.tag': 'overwrite' },
  });
  return { id: result.result.path_lower, name: result.result.name };
}

private async searchFiles(args: Record<string, unknown>) {
  const result = await this.dbx.filesSearchV2({
    query: args.query as string,
    options: { max_results: (args.max_results as number) ?? 20 },
  });
  return result.result.matches.map(m => ({
    id: (m.metadata as any).metadata?.path_lower,
    name: (m.metadata as any).metadata?.name,
  }));
}
```

#### Phase 11.6: Web UI Integration

- Add "Dropbox" connection card to `packages/web/src/App.tsx`
- Show connected account email (from `/users/get_current_account`)
- Display storage quota (used/allocated)
- Standard "Connect with Dropbox" OAuth button

## Files to Create

- `plugins/dropbox/package.json`
- `plugins/dropbox/tsconfig.json`
- `plugins/dropbox/src/index.ts`
- `packages/gateway/src/routes/dropbox-oauth.ts`

## Files to Modify

- `packages/core/src/index.ts` — Add `FILE_*` constants (if not already done)
- `packages/gateway/src/index.ts` — Register Dropbox OAuth routes + plugin
- `packages/web/src/App.tsx` — Add Dropbox connection card

## Dependencies

New dependency needed:
- `dropbox` (npm package, official Dropbox SDK)

```bash
cd plugins/dropbox
npm install dropbox
```

## Estimated Time

8–12 hours (includes new OAuth app setup + new library)

## Priority Justification

**Ranked #7 (lowest)** because:
1. **New OAuth app**: Unlike all other plugins, Dropbox requires a new developer app registration — adds setup overhead not needed for Google/Microsoft plugins
2. **New library**: `dropbox` npm package has not been used anywhere in the project yet — need to evaluate API design, TypeScript support, and edge cases
3. **Smaller overlap**: Users connecting Dropbox likely don't already have Google or Microsoft accounts connected, so Dropbox doesn't "extend" existing auth flows
4. **Path-based IDs**: Dropbox uses paths instead of opaque IDs — requires an abstraction shim to present a consistent `file_id` interface
5. **Lower urgency**: Google Drive + OneDrive cover the vast majority of users who would use CoreLink; Dropbox is valuable but not blocking any other feature

Still worth implementing to make CoreLink truly provider-agnostic for storage.

## Success Criteria

- [ ] `FILE_*` constants in `packages/core/src/index.ts`
- [ ] Dropbox OAuth PKCE flow works end-to-end
- [ ] `list_files` returns files from Dropbox root
- [ ] `read_file` returns metadata and a temporary download link
- [ ] `upload_file` uploads a file to Dropbox
- [ ] `delete_file` removes a file
- [ ] `search_files` returns files matching the query
- [ ] Web UI shows Dropbox connection status with storage quota
- [ ] Plugin registered in gateway and loads on startup
