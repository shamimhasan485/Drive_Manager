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

# 3. Run (settings such as cloud keys are made in the app: Settings, gear icon)
Write-Host ""
Write-Host "Drive Manager is starting at http://localhost:8000  (press Ctrl+C to stop)" -ForegroundColor Green
Start-Process "http://localhost:8000"
& $py -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
