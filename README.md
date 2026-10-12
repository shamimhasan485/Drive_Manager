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
   test drive stored in `%USERPROFILE%\DriveManagerTest`.
4. To connect real Google Drives on your PC, follow [docs/SETUP.md §4](docs/SETUP.md#4-create-the-google-oauth-app)
   with the redirect URI `http://localhost:8000/api/accounts/oauth/gdrive/callback`, put the two keys in the
   `.env` file the script created, and start it again.

## Run locally (developers)

```bash
# backend
cd backend
pip install -e ".[dev]"
export DM_SECRET_KEY=$(python -m app.security genkey) DM_LOCAL_ROOT=/tmp/dm-drive
uvicorn app.main:app --reload --port 8000
pytest

# frontend (separate terminal; proxies /api to :8000)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

## Deploy on a Linux VM

1. Point a domain at the VM, install Docker.
2. `cp .env.example .env` and fill it in; set the domain in `deploy/Caddyfile`.
3. `cd deploy && docker compose up -d --build`
4. Open `https://your-domain`, create the owner account, connect your drives.

## Keyboard shortcuts

`/` search · `Ctrl+A` select all · `Enter` open · `Backspace` up a folder · `F2` rename · `Del` delete · `Esc` clear selection
