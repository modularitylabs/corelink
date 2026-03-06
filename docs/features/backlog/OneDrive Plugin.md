# OneDrive Plugin (MEDIUM PRIORITY)

## Goal

Add cloud file storage access for Microsoft 365 users by implementing the OneDrive plugin using the Microsoft Graph API. AI agents can list, read, upload, and search files in the user's OneDrive without leaving the CoreLink gateway.

## Motivation

- OneDrive is bundled with every Microsoft 365 subscription — large existing user base
- `@microsoft/microsoft-graph-client` is already a dependency, and the Microsoft Graph Drive API (`/me/drive`) is consistent with the Mail and Calendar APIs
- Enables AI agents to retrieve documents, upload results, and search files — a common automation need
- Completes the Microsoft suite alongside email, calendar, and tasks
- Pairs with Google Drive to form the first "storage" abstraction layer in CoreLink

## Standard Tools

| Tool | Args | Description |
|------|------|-------------|
| `list_files` | `folder_id?`, `query?`, `max_results?` | List files in a folder (defaults to root) |
| `read_file` | `file_id` | Get file metadata + download URL |
| `upload_file` | `name`, `content`, `folder_id?` | Upload a file (base64 content for small files) |
| `delete_file` | `file_id` | Delete a file or folder |
| `search_files` | `query`, `max_results?` | Search files by name or content |

Note: Storage tools (`FILE_*`) are not yet in `packages/core/src/index.ts` — they need to be added as part of this feature.

## Implementation Plan

#### Phase 9.1: Add Storage Tool Constants to Core

First, update `packages/core/src/index.ts` to include storage standard tools:

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

#### Phase 9.2: Plugin Scaffold

1. Create `plugins/onedrive/` with `package.json` and `tsconfig.json`
2. Implement `OneDrivePlugin` using `@microsoft/microsoft-graph-client`

```typescript
import { Client } from '@microsoft/microsoft-graph-client';
import type { ICoreLinkPlugin, PluginTool } from '@corelink/core';
import { STANDARD_TOOLS } from '@corelink/core';

export class OneDrivePlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.onedrive';
  readonly name = 'OneDrive';
  readonly version = '1.0.0';
  readonly category = 'storage';

  constructor(private accessToken: string) {}

  private getClient(): Client {
    return Client.init({
      authProvider: (done) => done(null, this.accessToken),
    });
  }
}
```

#### Phase 9.3: OAuth Scope Extension

Add `Files.ReadWrite` to the Microsoft OAuth flow:

```typescript
// In outlook-oauth.ts — extend scopes
const scopes = [
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/Tasks.ReadWrite',
  'https://graph.microsoft.com/Files.ReadWrite',  // Add this
  'offline_access',
];
```

#### Phase 9.4: Tool Implementations

```typescript
private async listFiles(args: Record<string, unknown>) {
  const client = this.getClient();
  const folderId = args.folder_id as string;
  const url = folderId
    ? `/me/drive/items/${folderId}/children`
    : '/me/drive/root/children';

  const result = await client.api(url)
    .top((args.max_results as number) ?? 20)
    .get();

  return result.value.map((item: any) => ({
    id: item.id,
    name: item.name,
    size: item.size,
    type: item.folder ? 'folder' : 'file',
    mimeType: item.file?.mimeType,
    modifiedAt: item.lastModifiedDateTime,
    downloadUrl: item['@microsoft.graph.downloadUrl'],
  }));
}

private async readFile(args: Record<string, unknown>) {
  const client = this.getClient();
  const item = await client.api(`/me/drive/items/${args.file_id}`).get();
  return {
    id: item.id,
    name: item.name,
    size: item.size,
    mimeType: item.file?.mimeType,
    downloadUrl: item['@microsoft.graph.downloadUrl'],
    webUrl: item.webUrl,
    modifiedAt: item.lastModifiedDateTime,
  };
}

private async uploadFile(args: Record<string, unknown>) {
  const client = this.getClient();
  const folderId = args.folder_id as string;
  const url = folderId
    ? `/me/drive/items/${folderId}:/${args.name}:/content`
    : `/me/drive/root:/${args.name}:/content`;

  // For small files (< 4MB) — use simple upload
  const content = Buffer.from(args.content as string, 'base64');
  const item = await client.api(url).put(content);
  return { id: item.id, name: item.name };
}

private async searchFiles(args: Record<string, unknown>) {
  const client = this.getClient();
  const result = await client
    .api(`/me/drive/root/search(q='${encodeURIComponent(args.query as string)}')`)
    .top((args.max_results as number) ?? 20)
    .get();

  return result.value.map((item: any) => ({
    id: item.id,
    name: item.name,
    size: item.size,
    type: item.folder ? 'folder' : 'file',
    downloadUrl: item['@microsoft.graph.downloadUrl'],
  }));
}
```

#### Phase 9.5: Web UI Integration

- Add "OneDrive" to the Microsoft connection card in `packages/web/src/App.tsx`
- Show storage quota (used/total) fetched from `/me/drive` endpoint
- List top-level folder count as connection confirmation

## Files to Create

- `plugins/onedrive/package.json`
- `plugins/onedrive/tsconfig.json`
- `plugins/onedrive/src/index.ts`

## Files to Modify

- `packages/core/src/index.ts` — Add `FILE_*` constants to `STANDARD_TOOLS`
- `packages/gateway/src/routes/outlook-oauth.ts` — Add `Files.ReadWrite` scope
- `packages/gateway/src/index.ts` — Register `OneDrivePlugin`
- `packages/web/src/App.tsx` — Add OneDrive connection status

## Dependencies

Already available (shared from outlook plugin):
- `@microsoft/microsoft-graph-client`

No new dependencies needed.

## Estimated Time

6–8 hours (includes adding `FILE_*` constants to core)

## Priority Justification

**Ranked #5** because:
1. Reuses existing Microsoft infrastructure — low marginal setup cost
2. Ranked below Microsoft Todo because tasks complete an existing abstraction layer; storage introduces a new one
3. OneDrive ranked above Google Drive because the Microsoft Graph API is already battle-tested in this codebase
4. High value: AI agents reading/writing files is a key automation use case
5. Requires defining the `FILE_*` standard tools in core first — small but necessary architecture step

## Success Criteria

- [ ] `FILE_*` constants added to `packages/core/src/index.ts`
- [ ] `list_files` returns files from OneDrive root
- [ ] `read_file` returns file metadata and download URL
- [ ] `upload_file` uploads a small file (< 4MB) to OneDrive
- [ ] `delete_file` removes a file
- [ ] `search_files` returns matching files by name
- [ ] Uses existing Microsoft OAuth credentials (one re-auth to add scope)
- [ ] Web UI shows OneDrive connection status with storage quota
