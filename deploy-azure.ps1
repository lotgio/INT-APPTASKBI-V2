# Script per deploy su Azure Web App

Write-Host "🚀 Deploy applicazione su Azure" -ForegroundColor Green

# 1. Build del frontend
Write-Host "`n📦 Build frontend React..." -ForegroundColor Cyan
npm run build

# 2. Copia jobs.json in dist
Write-Host "`n📋 Copia file dati..." -ForegroundColor Cyan
Copy-Item public\jobs.json dist\jobs.json -Force

# 3. Verifica file necessari
Write-Host "`n✓ Verifica file per deploy..." -ForegroundColor Cyan
if (Test-Path "requirements.txt") { Write-Host "  ✓ requirements.txt" -ForegroundColor Green }
if (Test-Path "server-api.py") { Write-Host "  ✓ server-api.py" -ForegroundColor Green }
if (Test-Path "data/tasks.json") { Write-Host "  ✓ data/tasks.json" -ForegroundColor Green }
if (Test-Path "data/members.json") { Write-Host "  ✓ data/members.json" -ForegroundColor Green }

Write-Host "`n✨ Pronto per il deploy!" -ForegroundColor Green
Write-Host "`nProssimi passi:" -ForegroundColor Yellow
Write-Host "1. Crea una Web App su Azure (Python 3.11)" -ForegroundColor White
Write-Host "2. Configura deployment da GitHub o ZIP" -ForegroundColor White
Write-Host "3. I dati in data/ verranno persistiti automaticamente" -ForegroundColor White
