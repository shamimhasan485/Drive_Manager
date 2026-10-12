# Runs Drive Manager on this Windows PC at http://localhost:8000
# Needs Python 3.12+ and Node.js 20+ (install with:  winget install Python.Python.3.13 OpenJS.NodeJS.LTS)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "$cmd was not found. Install it with:  $hint" -ForegroundColor Red
    Write-Host "Then close this window, open a new one and run the script again."
    exit 1
  }
}
Need python "winget install Python.Python.3.13"
Need npm "winget install OpenJS.NodeJS.LTS"

# 1. Python environment
if (-not (Test-Path ".venv")) {
  Write-Host "Creating Python environment..." -ForegroundColor Cyan
  python -m venv .venv
}
$py = ".\.venv\Scripts\python.exe"
Write-Host "Installing backend packages..." -ForegroundColor Cyan
& $py -c "import tomllib;print('\n'.join(tomllib.load(open('backend/pyproject.toml','rb'))['project']['dependencies']))" | Set-Content -Encoding ascii .venv\requirements.txt
& $py -m pip install --quiet --disable-pip-version-check -r .venv\requirements.txt

# 2. Frontend build
Write-Host "Building the web interface..." -ForegroundColor Cyan
Push-Location frontend
if (-not (Test-Path "node_modules")) { npm ci --no-audit --no-fund }
npm run build
Pop-Location

# 3. Settings (created once; edit .env to add Google keys)
if (-not (Test-Path ".env")) {
  $key = & $py -c "import os,base64;print(base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('='))"
  $drive = Join-Path $env:USERPROFILE "DriveManagerTest"
  $envText = @"
DM_SECRET_KEY=$key
DM_PUBLIC_URL=http://localhost:8000
DM_COOKIE_SECURE=false
DM_LOCAL_ROOT=$drive
DM_GOOGLE_CLIENT_ID=
DM_GOOGLE_CLIENT_SECRET=
"@
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot ".env"), $envText, (New-Object Text.UTF8Encoding($false)))
  Write-Host "Created .env (test drive folder: $drive)" -ForegroundColor Green
}

# 4. Run
Write-Host ""
Write-Host "Drive Manager is starting at http://localhost:8000  (press Ctrl+C to stop)" -ForegroundColor Green
Start-Process "http://localhost:8000"
& $py -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
