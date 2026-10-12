# Drive Manager: architecture and build plan

A self-hosted web file manager on a Linux cloud server that puts several cloud storage
accounts (multiple Google Drives, Dropbox, Box, later OneDrive and S3) behind one fast,
polished interface. Built from scratch, Python backend, for one owner plus a few family members.

## 1. Goals and non-goals

**Goals**
- Connect any number of accounts per user, including several of the same provider.
- Browse, search, preview, upload, download, rename, move, delete, share across all of them.
- Copy and move files **between** providers (Drive to Dropbox, etc.) as background jobs with progress.
- A consumer-grade UI: instant navigation, keyboard shortcuts, drag and drop, dark mode, mobile friendly.
- Safe: tokens encrypted at rest, HTTPS only, per-user isolation, no data stored on the server except caches.

**Non-goals (for now)**
- Public SaaS, billing, teams/orgs.
- Syncing cloud files to the server's disk (we stream through, we don't mirror).
- Real-time collaborative editing (we link out to Google Docs etc.).

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| API | **FastAPI** (Python 3.12+), async throughout | Typed, fast, OpenAPI for free, great for streaming |
| HTTP to providers | **httpx** (async) with our own thin provider clients | One consistent async client; official SDKs are sync and heavy |
| DB | **SQLite** (WAL mode) via **SQLAlchemy 2 async**; Postgres optional | Zero-ops for a family server; switch by URL |
| Migrations | **Alembic** | Standard |
| Background jobs | In-process **asyncio job runner** with jobs persisted in DB | No Redis needed at this scale; resumes after restart |
| Auth | Local accounts, **argon2** password hashes, HTTP-only session cookie, optional TOTP 2FA | Simple, secure, no external IdP needed |
| Secrets | Provider refresh tokens encrypted with **AES-GCM** (key from env / file) | A leaked DB alone is useless |
| Frontend | **React + TypeScript + Vite**, **Tailwind CSS**, Radix primitives (shadcn/ui style), **TanStack Query** + **TanStack Virtual**, lucide icons | The fastest route to a polished, accessible, commercial-feeling UI |
| Serving | FastAPI serves the built SPA; **Caddy** in front for automatic HTTPS | One container plus Caddy |
| Deploy | **Docker Compose** on any Linux VM | Reproducible, easy upgrades and backups |

## 3. Architecture

```
Browser (React SPA)
   │  HTTPS (Caddy, Let's Encrypt)
   ▼
FastAPI app ──────────────┐
 ├─ /api/auth      sessions, users, 2FA
 ├─ /api/accounts  connect / disconnect providers (OAuth)
 ├─ /api/files     unified list / stat / search / mkdir / rename / delete
 ├─ /api/transfer  streamed upload & download, range requests
 ├─ /api/jobs      cross-cloud copy/move, progress via SSE
 └─ static SPA
   │
   ├─ Provider registry ── GoogleDriveProvider / DropboxProvider / BoxProvider / ...
   │                        (all implement one StorageProvider interface)
   ├─ Metadata cache (DB) ── refreshed by delta sync (Drive changes, Dropbox cursor, Box events)
   ├─ Job runner ── chunked streaming copy between providers, resumable
   └─ SQLite/Postgres ── users, sessions, accounts (encrypted tokens), cache, jobs
```

### 3.1 Provider interface (the heart of it)

Every provider implements the same async interface, so the API and UI never special-case a cloud:

```python
class StorageProvider(Protocol):
    kind: str                          # "gdrive", "dropbox", "box"
    capabilities: Capabilities         # thumbnails, server_side_copy, versions, share_links...
    async def about(self) -> Quota
    async def list(self, folder_id: str, page_token: str | None) -> Page[Entry]
    async def stat(self, item_id: str) -> Entry
    async def mkdir(self, parent_id: str, name: str) -> Entry
    async def rename(self, item_id: str, new_name: str) -> Entry
    async def move(self, item_id: str, new_parent_id: str) -> Entry
    async def copy(self, item_id: str, new_parent_id: str) -> Entry  # same-account server-side
    async def delete(self, item_id: str, permanent: bool = False) -> None
    async def download(self, item_id: str, range: ByteRange | None) -> AsyncIterator[bytes]
    async def upload(self, parent_id: str, name: str, size: int, stream: AsyncIterator[bytes]) -> Entry
    async def search(self, query: str) -> Page[Entry]
    async def changes(self, cursor: str | None) -> ChangeBatch          # delta sync
```

Provider quirks are handled inside the adapter:
- **Google Drive** is ID-based, a file can have several parents, Google Docs/Sheets have no bytes (export to PDF/DOCX/XLSX on download), Shared Drives are extra roots.
- **Dropbox** is path-based; we use the path (or `id:` form) as the item ID. Uploads over 150 MB use upload sessions.
- **Box** is ID-based with chunked upload sessions for files over 50 MB.

### 3.2 Unified file model

A file anywhere is addressed as `account_id:item_id`. One `Entry` shape is returned for every provider:
`id, account_id, name, is_folder, size, mime_type, modified_at, parent_ids, thumbnail_url, web_url, provider_extra`.

The UI shows a sidebar of **accounts** (each with its own colour, avatar, quota bar) and a virtual
**"All drives"** root for unified search and recents.

### 3.3 Cross-cloud transfer

- Same account: use the provider's server-side copy/move (instant).
- Different accounts/providers: a **job** streams bytes from source download to destination
  chunked upload, never touching disk beyond a small buffer. Jobs record progress per file,
  retry with backoff on 429/5xx, and resume after restart. Folders are walked recursively.
- Progress is pushed to the UI with **Server-Sent Events**.

### 3.4 OAuth and credentials

- You register your own OAuth app with each provider (Google Cloud console, Dropbox App Console,
  Box Developer Console) and put client ID/secret in the server's `.env`. Nothing goes through a third party.
- Redirect URI: `https://<your-domain>/api/accounts/oauth/<provider>/callback`.
- Refresh tokens are encrypted with a server key (`DM_SECRET_KEY`) before they hit the DB.
- Access tokens are refreshed automatically just before expiry.
- Google note: a personal-use app can stay in "testing" mode with up to 100 listed test users, which
  covers a family. Refresh tokens in testing mode expire after 7 days, so the plan is to publish the
  app as "in production" for internal use (unverified-app warning is acceptable for family use) or
  re-consent weekly. We'll decide at M1.

### 3.5 Users and security

- Roles: `admin` (you) and `member` (family). Each user only sees accounts they connected,
  plus accounts an admin explicitly shares with them (read-only or read-write).
- Argon2id hashes, session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`), CSRF header check on mutations,
  rate-limited login, optional TOTP 2FA.
- Server never stores file contents; thumbnail cache is bounded and per-user.
- Backups: the SQLite file plus `.env` is everything.

## 4. UI design direction

Benchmark: Google Drive's clarity plus Finder's speed plus Linear's polish.

- **Layout**: left sidebar (accounts, favourites, recents, trash, transfers), top bar (breadcrumbs,
  global search with `/` or `Ctrl+K`), main pane (grid or list view), right detail panel (preview, info).
- **Interactions**: multi-select with Shift/Ctrl, rubber-band select, drag and drop to move or to copy
  across accounts, drag files from desktop to upload, right-click context menu, inline rename (F2),
  undo toast for deletes, keyboard navigation everywhere.
- **Speed**: virtualized lists (100k entries smooth), optimistic updates, prefetch on hover, cached folders.
- **Previews**: images, video/audio (range streaming), PDF, text/code, Office via provider export.
- **Transfers drawer**: live progress, pause/retry/cancel.
- **Visual**: Inter font, a neutral palette with one accent, light and dark themes, subtle motion,
  per-account colour chips, responsive down to phone width, installable as a PWA.

## 5. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | **Scaffold** (this step) | Backend + frontend skeleton run; provider interface, encrypted token storage, user model, local mock provider for UI work |
| M1 | **Auth + Google Drive read** | Login, connect one or more Google accounts via OAuth, browse folders, download |
| M2 | **Full Drive operations** | Upload (resumable), mkdir, rename, move, delete/trash, search, thumbnails, quota |
| M3 | **Dropbox + Box** | Both adapters at parity with Drive |
| M4 | **Cross-cloud jobs** | Copy/move between any two accounts with progress, retries, resume |
| M5 | **Polish** | Previews, unified search and recents, share links, keyboard shortcuts, PWA, mobile layout |
| M6 | **Production** | Docker Compose + Caddy deploy, backups, 2FA, family users and sharing, rate limiting |
| Later | OneDrive, S3/Backblaze, WebDAV, dedupe finder, storage analytics | |

## 6. Repository layout

```
drive-manager/
├─ backend/
│  ├─ app/
│  │  ├─ main.py            FastAPI app, routers, SPA serving
│  │  ├─ config.py          settings from env
│  │  ├─ db.py              async engine/session
│  │  ├─ models.py          User, Session, Account, Job
│  │  ├─ security.py        password hashing, token encryption
│  │  ├─ api/               auth, accounts, files routers
│  │  └─ providers/         base.py, registry.py, local.py (dev/mock), gdrive.py, dropbox.py, box.py
│  ├─ tests/
│  └─ pyproject.toml
├─ frontend/                Vite + React + TS + Tailwind
├─ deploy/                  docker-compose.yml, Caddyfile
└─ .env.example
```

## 7. Decisions needed from you

1. **Domain**: do you have a domain for the server (needed for HTTPS and OAuth redirects)?
2. **GitHub**: should I create a repository (e.g. `shamimhasan485/drive-manager`) and push the scaffold?
3. **Server**: which provider/VM size (any 1 vCPU / 1 GB Linux VM is enough to start)?
