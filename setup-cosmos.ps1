# Script per creare Cosmos DB e importare i dati iniziali

Write-Host "=== Setup Cosmos DB per INT-APPTASKBI ===" -ForegroundColor Cyan

# Variabili
$resourceGroup = "rg-apptaskbi"
$location = "westeurope"
$accountName = "cosmos-apptaskbi-$(Get-Random -Maximum 9999)"
$databaseName = "apptask"
$containerName = "items"

Write-Host "`n1. Creazione Resource Group..." -ForegroundColor Yellow
az group create --name $resourceGroup --location $location

Write-Host "`n2. Creazione Cosmos DB Account (ci vogliono 3-5 minuti)..." -ForegroundColor Yellow
az cosmosdb create `
  --name $accountName `
  --resource-group $resourceGroup `
  --default-consistency-level Session `
  --locations regionName=$location failoverPriority=0 isZoneRedundant=False `
  --enable-free-tier true

Write-Host "`n3. Creazione Database..." -ForegroundColor Yellow
az cosmosdb sql database create `
  --account-name $accountName `
  --resource-group $resourceGroup `
  --name $databaseName

Write-Host "`n4. Creazione Container..." -ForegroundColor Yellow
az cosmosdb sql container create `
  --account-name $accountName `
  --resource-group $resourceGroup `
  --database-name $databaseName `
  --name $containerName `
  --partition-key-path "/id" `
  --throughput 400

Write-Host "`n5. Recupero connection string..." -ForegroundColor Yellow
$endpoint = az cosmosdb show --name $accountName --resource-group $resourceGroup --query documentEndpoint -o tsv
$key = az cosmosdb keys list --name $accountName --resource-group $resourceGroup --query primaryMasterKey -o tsv

Write-Host "`n=== Setup completato! ===" -ForegroundColor Green
Write-Host "`nCopia questi valori nel file .env:" -ForegroundColor Cyan
Write-Host "COSMOS_ENDPOINT=$endpoint"
Write-Host "COSMOS_KEY=$key"
Write-Host "COSMOS_DB=$databaseName"
Write-Host "COSMOS_CONTAINER=$containerName"

# Salva in .env
$envContent = @"
# Server
PORT=5174
TEAM_ID=default

# Azure Cosmos DB
COSMOS_ENDPOINT=$endpoint
COSMOS_KEY=$key
COSMOS_DB=$databaseName
COSMOS_CONTAINER=$containerName

# Azure Storage (Blob)
AZURE_STORAGE_ACCOUNT=
AZURE_STORAGE_KEY=
AZURE_STORAGE_CONTAINER=crmreport
AZURE_STORAGE_BLOB=jobs_complete.parquet
"@

Set-Content -Path ".env" -Value $envContent

Write-Host "`n✅ File .env creato!" -ForegroundColor Green
Write-Host "`nProssimo passo: importa i dati esportati dal browser" -ForegroundColor Yellow
