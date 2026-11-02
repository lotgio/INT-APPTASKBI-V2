# Guida completa: Deploy con dati condivisi su Azure

Questa guida ti porta da localStorage locale a dati condivisi su Azure.

## Prerequisiti
- Azure CLI installata: `az --version`
- Account Azure attivo
- Dati locali già popolati

---

## STEP 1: Esporta i dati locali

1. Apri la tua app locale: http://localhost:5173
2. Apri in un'altra tab: `export-local-data.html`
3. Clicca **"Esporta dati"**
4. Clicca **"Copia JSON"**
5. Crea un file `exported-data.json` nella root del progetto e incolla il JSON

---

## STEP 2: Crea Cosmos DB

Esegui lo script automatico:

```powershell
.\setup-cosmos.ps1
```

Questo script:
- Crea un Resource Group `rg-apptaskbi`
- Crea un Cosmos DB account (free tier)
- Crea database e container
- Configura il file `.env` automaticamente

**Tempo stimato: 3-5 minuti**

---

## STEP 3: Importa i dati esportati

```powershell
npm run import
```

Questo comando legge `exported-data.json` e carica membri e task in Cosmos DB.

---

## STEP 4: Testa in locale con Cosmos DB

```powershell
npm run dev
```

Apri http://localhost:5173 - ora l'app usa Cosmos DB invece di localStorage!

---

## STEP 5: Deploy su Azure Static Web Apps

### Opzione A: Deploy manuale via portale

1. Vai su https://portal.azure.com
2. Crea una **Static Web App**:
   - Nome: `apptaskbi`
   - Region: `West Europe`
   - Source: `GitHub`
   - Repository: `lotgio/INT-APPTASKBI`
   - Branch: `main`
   - Build Presets: `Custom`
   - App location: `/`
   - Api location: `api`
   - Output location: `dist`

3. Nella sezione **Configuration** della Static Web App, aggiungi le variabili:
   ```
   COSMOS_ENDPOINT=<valore da .env>
   COSMOS_KEY=<valore da .env>
   COSMOS_DB=apptask
   COSMOS_CONTAINER=items
   TEAM_ID=default
   ```

4. Aspetta che GitHub Actions completi il deploy

### Opzione B: Deploy via CLI (più veloce)

```powershell
# 1. Login (se non già fatto)
az login

# 2. Crea la Static Web App
az staticwebapp create `
  --name apptaskbi `
  --resource-group rg-apptaskbi `
  --source https://github.com/lotgio/INT-APPTASKBI `
  --location westeurope `
  --branch main `
  --app-location "/" `
  --api-location "api" `
  --output-location "dist" `
  --login-with-github

# 3. Configura le variabili ambiente
$cosmosEndpoint = (Get-Content .env | Select-String "COSMOS_ENDPOINT=").ToString().Split("=")[1]
$cosmosKey = (Get-Content .env | Select-String "COSMOS_KEY=").ToString().Split("=")[1]

az staticwebapp appsettings set `
  --name apptaskbi `
  --resource-group rg-apptaskbi `
  --setting-names COSMOS_ENDPOINT=$cosmosEndpoint COSMOS_KEY=$cosmosKey COSMOS_DB=apptask COSMOS_CONTAINER=items TEAM_ID=default
```

---

## STEP 6: Verifica e condividi

1. L'URL della tua app sarà tipo: `https://apptaskbi.azurestaticapps.net`
2. Apri l'app e verifica che vedi i tuoi dati
3. Vai in "Gestione task" > scheda membro > **"Copia link"**
4. Condividi il link con la risorsa

---

## Riepilogo costi (Free Tier)

- **Cosmos DB**: Gratis (400 RU/s incluse)
- **Static Web Apps**: Gratis (fino a 100 GB bandwidth/mese)
- **Azure Functions**: Gratis (1 milione esecuzioni/mese)

**Totale: €0/mese** 🎉

---

## Troubleshooting

### Errore "az: command not found"
Installa Azure CLI: https://aka.ms/azurecli

### Errore importazione dati
Verifica che `exported-data.json` esista e sia un JSON valido.

### App non vede i dati su Azure
Controlla che le variabili ambiente siano configurate nella Static Web App (Configuration > Application settings).

---

## Pulizia risorse (se vuoi cancellare tutto)

```powershell
az group delete --name rg-apptaskbi --yes
```
