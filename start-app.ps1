# Script per avviare automaticamente l'app AppTask
# Salva come start-app.ps1 e esegui: powershell -ExecutionPolicy Bypass -File start-app.ps1

param(
    [switch]$SkipBuild = $false,
    [string]$Url = "http://localhost:8000"
)

$ErrorActionPreference = "Stop"

function Write-Header {
    param([string]$Message)
    Write-Host "`n$Message" -ForegroundColor Cyan -BackgroundColor Black
    Write-Host ("=" * $Message.Length) -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

# Get script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Header "🚀 Avvio Applicazione AppTask"

# Check if Node.js is installed
Write-Host "Verifico Node.js..."
try {
    $nodeVersion = & node --version
    Write-Success "Node.js $nodeVersion trovato"
} catch {
    Write-Error-Custom "Node.js non trovato. Installa Node.js 18+ da https://nodejs.org/"
    pause
    exit 1
}

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Header "📦 Installazione dipendenze NPM"
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Installazione dipendenze fallita"
        pause
        exit 1
    }
    Write-Success "Dipendenze installate"
}

# Build frontend (unless skipped)
if (-not $SkipBuild) {
    Write-Header "� Sincronizzazione commesse da Azure"
    & ".$($pythonExe ?? '.\.venv\Scripts\python.exe')" sync-jobs.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Attenzione: Sincronizzazione parziale, continuo con dati locali..." -ForegroundColor Yellow
    }
    
    Write-Header "�🔨 Build del frontend"
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Build fallita"
        pause
        exit 1
    }
    Write-Success "Build completata"
    
    # Copy jobs.json
    if (Test-Path "public\jobs.json") {
        Copy-Item -Path "public\jobs.json" -Destination "dist\jobs.json" -Force
        Write-Success "jobs.json copiato"
    }
}

# Start the server
Write-Header "🎯 Avvio server"

# Check if Python venv exists
if (Test-Path ".\.venv\Scripts\python.exe") {
    Write-Host "Avvio con server-api.py (Python)..." -ForegroundColor Yellow
    $pythonExe = ".\.venv\Scripts\python.exe"
    
    # Start server in background
    $process = Start-Process -FilePath $pythonExe -ArgumentList "server-api.py" -PassThru -NoNewWindow
    Write-Success "Server avviato (PID: $($process.Id))"
} else {
    Write-Host "Avvio con server.ts (Node.js)..." -ForegroundColor Yellow
    
    # Start server in background
    $process = Start-Process -FilePath "node" -ArgumentList "dist/server/server.js" -PassThru -NoNewWindow
    Write-Success "Server avviato (PID: $($process.Id))"
}

# Wait for server to be ready (max 10 seconds)
Write-Host "`nAttesa che il server sia pronto..." -ForegroundColor Yellow
$maxRetries = 20
$retryCount = 0
$serverReady = $false

while ($retryCount -lt $maxRetries) {
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 1 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $serverReady = $true
            break
        }
    } catch {
        # Server not ready yet
    }
    $retryCount++
    Start-Sleep -Milliseconds 500
}

if ($serverReady) {
    Write-Success "Server pronto!"
} else {
    Write-Host "Il server potrebbe non essere completamente pronto, ma continuo..." -ForegroundColor Yellow
}

# Open browser
Write-Header "🌐 Apertura browser"
Write-Host "Apro: $Url"
Start-Process $Url
Write-Success "Browser aperto!"

# Display footer
Write-Header "✅ App AppTask in esecuzione"
Write-Host "
URL: $Url
PID Server: $($process.Id)

Per fermare l'app:
  1. Chiudi questa finestra
  2. Il server verrà terminato automaticamente

Premi Ctrl+C per terminare il monitoraggio.
" -ForegroundColor Gray

# Wait for process to exit
try {
    $process.WaitForExit()
} catch {
    # Ignore errors when waiting
}

Write-Host "`nApp terminata." -ForegroundColor Yellow
