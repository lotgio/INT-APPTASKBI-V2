# Script per deployare Azure Functions
# Prerequisiti: Azure CLI installato e configurato (az login)

param(
    [Parameter(Mandatory=$true)]
    [string]$FunctionAppName,
    
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroup = "apptaskbi-rg"
)

Write-Host "🚀 Deploy Azure Functions a: $FunctionAppName" -ForegroundColor Cyan

# 1. Naviga alla directory api
Set-Location api

# 2. Installa dipendenze
Write-Host "`n📦 Installazione dipendenze..." -ForegroundColor Yellow
npm install

# 3. Comprimi il contenuto
Write-Host "`n📦 Creazione pacchetto deploy..." -ForegroundColor Yellow
$zipPath = "../functions-deploy.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Comprimi tutti i file necessari
Compress-Archive -Path `
    "calendar/*", `
    "members/*", `
    "tasks/*", `
    "shared/*", `
    "host.json", `
    "package.json", `
    "package-lock.json", `
    "node_modules/*" `
    -DestinationPath $zipPath -Force

# 4. Deploy su Azure
Write-Host "`n🚀 Deploying su Azure..." -ForegroundColor Green
az functionapp deployment source config-zip `
    --resource-group $ResourceGroup `
    --name $FunctionAppName `
    --src $zipPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Deploy completato!" -ForegroundColor Green
    Write-Host "`n📍 URL calendario: https://$FunctionAppName.azurewebsites.net/api/calendar/{resourceId}" -ForegroundColor Cyan
    Write-Host "`nNON DIMENTICARE di configurare le variabili d'ambiente:" -ForegroundColor Yellow
    Write-Host "  - SUPABASE_URL" -ForegroundColor Yellow
    Write-Host "  - SUPABASE_ANON_KEY" -ForegroundColor Yellow
} else {
    Write-Host "`n❌ Errore during deploy!" -ForegroundColor Red
}

# Torna alla directory principale
Set-Location ..
