# Google Drive Plugin (MEDIUM PRIORITY)

## Goal

Add cloud file storage access for Google users by implementing the Google Drive plugin using the Google Drive API v3. AI agents can list, read, upload, search, and delete files in the user's Drive without leaving the CoreLink gateway.

## Motivation

- Google Drive is one of the most widely used cloud storage services globally
- `googleapis` is already a dependency in `plugins/gmail/` — the Google Drive API is part of the same library
- Enables AI agents to retrieve documents, read spreadsheets, and upload results — critical for automation
- Pairs with OneDrive to complete the "storage" abstraction layer, making `list_files`, `read_file`, etc. work across both providers
- Users who connected Gmail will frequently also want Drive access

## Standard Tools

| Tool | Args | Description |
|------|------|-------------|
| `list_files` | `folder_id?`, `query?`, `max_results?` | List files in a folder (defaults to root) |
| `read_file` | `file_id` | Get file metadata + download URL or exported content |
| `upload_file` | `name`, `content`, `folder_id?` | Upload a file (base64 content) |
| `delete_file` | `file_id` | Move a file to trash |
| `search_files` | `query`, `max_results?` | Search files using Drive query syntax |

Note: Storage tools (`FILE_*`) need to be added to `packages/core/src/index.ts` — coordinate with the OneDrive feature (whichever is implemented first adds the constants).

## Implementation Plan

#### Phase 10.1: Add Storage Tool Constants to Core

(Skip if already done by OneDrive implementation.)

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

#### Phase 10.2: Plugin Scaffold

1. Create `plugins/google-drive/` with `package.json` and `tsconfig.json`
2. Implement `GoogleDrivePlugin` using `googleapis`

```typescript
import { google } from 'googleapis';
import type { ICoreLinkPlugin, PluginTool } from '@corelink/core';
import { STANDARD_TOOLS } from '@corelink/core';

export class GoogleDrivePlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.google-drive';
  readonly name = 'Google Drive';
  readonly version = '1.0.0';
  readonly category = 'storage';

  constructor(private accessToken: string) {}

  private getDrive() {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: this.accessToken });
    return google.drive({ version: 'v3', auth });
  }
}
```

#### Phase 10.3: OAuth Scope Extension

Add Drive scope to the Google OAuth PKCE flow:

```typescript
// In oauth.ts — extend scopes
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',  // Add this (or drive.readonly for read-only)
];
```

Consider using `drive.file` scope (only files created by the app) for privacy-first default, with `drive` as opt-in.

#### Phase 10.4: Tool Implementations

```typescript
private async listFiles(args: Record<string, unknown>) {
  const drive = this.getDrive();
  const folderId = args.folder_id as string;

  const query = [
    folderId ? `'${folderId}' in parents` : `'root' in parents`,
    'trashed = false',
    args.query ? `name contains '${args.query}'` : null,
  ].filter(Boolean).join(' and ');

  const res = await drive.files.list({
    q: query,
    pageSize: (args.max_results as number) ?? 20,
    fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
  });

  return (res.data.files ?? []).map(f => ({
    id: f.id,
    name: f.name,
    size: f.size,
    mimeType: f.mimeType,
    modifiedAt: f.modifiedTime,
    webViewLink: f.webViewLink,
    type: f.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
  }));
}

private async readFile(args: Record<string, unknown>) {
  const drive = this.getDrive();
  const meta = await drive.files.get({
    fileId: args.file_id as string,
    fields: 'id, name, mimeType, size, modifiedTime, webViewLink, webContentLink',
  });

  // For Google Docs/Sheets/Slides — export as text/csv/pdf
  let downloadUrl = meta.data.webContentLink;
  if (meta.data.mimeType?.startsWith('application/vnd.google-apps')) {
    const exportMime = meta.data.mimeType.includes('document')
      ? 'text/plain'
      : meta.data.mimeType.includes('spreadsheet')
        ? 'text/csv'
        : 'application/pdf';
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${args.file_id}/export?mimeType=${exportMime}`;
  }

  return {
    id: meta.data.id,
    name: meta.data.name,
    mimeType: meta.data.mimeType,
    size: meta.data.size,
    downloadUrl,
    webViewLink: meta.data.webViewLink,
  };
}

private async uploadFile(args: Record<string, unknown>) {
  const drive = this.getDrive();
  const content = Buffer.from(args.content as string, 'base64');

  const res = await drive.files.create({
    requestBody: {
      name: args.name as string,
      parents: args.folder_id ? [args.folder_id as string] : ['root'],
    },
    media: { body: content },
    fields: 'id, name',
  });
  return { id: res.data.id, name: res.data.name };
}

private async searchFiles(args: Record<string, unknown>) {
  const drive = this.getDrive();
  const res = await drive.files.list({
    q: `fullText contains '${(args.query as string).replace(/'/g, "\\'")}' and trashed = false`,
    pageSize: (args.max_results as number) ?? 20,
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink)',
  });
  return res.data.files ?? [];
}
```

#### Phase 10.5: Web UI Integration

- Add "Google Drive" to the Google connection card in `packages/web/src/App.tsx`
- Show storage quota (used / total) from `drive.about.get`
- Display as part of the Google account card alongside Gmail and Calendar

## Files to Create

- `plugins/google-drive/package.json`
- `plugins/google-drive/tsconfig.json`
- `plugins/google-drive/src/index.ts`

## Files to Modify

- `packages/core/src/index.ts` — Add `FILE_*` constants (if not already done)
- `packages/gateway/src/routes/oauth.ts` — Add `drive` scope to Google OAuth
- `packages/gateway/src/index.ts` — Register `GoogleDrivePlugin`
- `packages/web/src/App.tsx` — Add Google Drive connection status

## Dependencies

Already available (shared from gmail plugin):
- `googleapis`

No new dependencies needed.

## Estimated Time

6–8 hours

## Priority Justification

**Ranked #6** (below OneDrive) because:
1. Reuses `googleapis` — no new library, but Google Drive API has more edge cases than Microsoft Graph Drive
2. Google Workspace file types (Docs, Sheets, Slides) require export handling — adds complexity vs OneDrive's simpler binary files
3. The `drive` scope is broad; need careful scope selection (`drive.file` vs `drive.readonly` vs `drive`) which requires user education
4. Ranked after OneDrive because Microsoft Graph is already proven in this codebase
5. Still high value — Google Drive is widely used and completes the storage abstraction

## Success Criteria

- [ ] `list_files` returns files from Google Drive root
- [ ] `read_file` returns metadata and a download/export URL for Google Workspace files
- [ ] `upload_file` uploads a file to Google Drive
- [ ] `delete_file` moves a file to trash (not permanent delete)
- [ ] `search_files` returns matching files using Drive query syntax
- [ ] Drive scope added to Google OAuth without breaking Gmail/Calendar flow
- [ ] Web UI shows Google Drive connection status with storage quota
- [ ] Works for multi-account (multiple Google accounts each get their own Drive)
