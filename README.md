# Drive Manager

Self-hosted web file manager that puts several cloud storage accounts (multiple Google Drives,
Dropbox, Box, ...) behind one interface. See [PLAN.md](PLAN.md) for architecture and milestones, and [docs/SETUP.md](docs/SETUP.md) to put it on a server.

**Status: M0 scaffold.** Working today: owner setup and sign-in, a "server folder" drive, and the full
browse/upload/download/new folder/rename/move/delete/search UI in light and dark themes.
The Google Drive adapter is written but untested until OAuth keys exist (milestone M1).

## Try it on Windows

1. Install Python and Node.js once (in PowerShell): `winget install Python.Python.3.13 OpenJS.NodeJS.LTS`
2. Download this repo (green **Code** button → **Download ZIP**, then extract it) or `git clone` it.
3. Double-click **`start-windows.bat`**. The first run takes a few minutes; then your browser opens
   http://localhost:8000. Create your account, then **Connect account → Server folder** to play with a
   test drive stored in the app's `data\storage` folder.
4. To connect Google Drive, open **Settings** (gear icon, bottom left) → **Cloud providers**. The page walks
   you through creating the keys and shows the exact redirect URI to paste into Google.

## Configuration

There are no config files to edit. On first run Drive Manager creates its database and its encryption key
in `data/` (back this folder up). Everything else lives in the app under **Settings**:

| Section | What you set |
|---|---|
| My account | Your name and password |
| Cloud providers | Google Drive / Dropbox / Box keys (stored encrypted), with step-by-step help |
| Family & users | Add people, make them admins, reset passwords, remove them |
| General | The web address people use, and whether a folder on the server can be used as a drive |

`DM_` environment variables (see `.env.example`) still work, but only as defaults for those settings,
which is handy for Docker deploys.

## Run locally (developers)

Linux / macOS:

```bash
# backend
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
pytest

# frontend (separate terminal; proxies /api to :8000)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Windows (PowerShell):

```powershell
# backend: keep this window open
cd backend
pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --port 8000

# frontend, in a second PowerShell window
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The first time you open the app it asks you to create the owner account; there is no default login.
If sign-in shows "Not Found", the backend isn't running on port 8000.

## Deploy on a Linux VM

1. Point a domain at the VM, install Docker.
2. Set your domain in `deploy/Caddyfile`.
3. `cd deploy && docker compose up -d --build`
4. Open `https://your-domain`, create the owner account, connect your drives.

## Keyboard shortcuts

`/` search · `Ctrl+A` select all · `Enter` open · `Backspace` up a folder · `F2` rename · `Del` delete · `Esc` clear selection
