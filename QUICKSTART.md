# 🚀 Deploy Rapido - 5 Minuti

## Prerequisiti
- Account Azure attivo

## Step 1: Prepara il codice
```powershell
# Build frontend
npm run build

# Copia jobs.json
Copy-Item public\jobs.json dist\jobs.json -Force
```

## ✅ Opzione gratuita (consigliata)

### Step 2A: Crea Azure Cosmos DB Free Tier
1. Vai su https://portal.azure.com
2. **Create a resource** → **Azure Cosmos DB**
3. API: **NoSQL**
4. Abilita **Free Tier**
5. Crea il database `apptaskbi`
6. Crea due container:
   - `tasks` (partition key: `/id`)
   - `members` (partition key: `/id`)
7. Copia **Endpoint** e **Primary Key** (serviranno dopo)

### Step 2B: Crea Azure Static Web Apps (Free)
1. **Create a resource** → **Static Web App**
2. Plan: **Free**
3. Source: **GitHub**
4. Build settings:
   - App location: `/`
   - Api location: `/api`
   - Output location: `dist`
5. Crea la risorsa

### Step 2C: Configura le variabili d'ambiente
Nella Static Web App → **Configuration** → **Application settings**:

- `COSMOS_ENDPOINT`
- `COSMOS_KEY`
- `COSMOS_DB_NAME` = `apptaskbi`

### Step 2D: Deploy
Fai commit e push. Azure farà deploy automatico.

---

## Step 2 (Alternativa): Crea Web App su Azure

1. Vai su https://portal.azure.com
2. **Create a resource** → **Web App**
3. Compila:
   - **Name**: `apptaskbi` (o nome a scelta)
   - **Runtime**: Python 3.11
   - **Region**: West Europe
   - **Plan**: Basic B1
4. **Create**

## Step 3: Deploy automatico da GitHub

1. Nella Web App creata, vai a **Deployment Center**
2. Source: **GitHub**
3. Autorizza e seleziona:
   - Repo: `INT-apptaskBI`
   - Branch: `main`
4. **Save**

## Step 4: Configura Startup

1. **Configuration** → **General settings**
2. **Startup Command**: `python server-api.py`
3. **Save** → **Restart**

## Step 5: Accedi all'app

Vai su: `https://apptaskbi.azurewebsites.net`

---

## ⚠️ IMPORTANTE: Persistenza Dati

I dati (task e membri) **non persistono dopo restart** senza configurazione aggiuntiva.

### Soluzione Rapida: Azure File Share

1. **Storage Accounts** → **Create**
2. Crea un **File Share** chiamato `apptaskdata`
3. Nella Web App:
   - **Configuration** → **Path mappings**
   - **New Azure Storage Mount**:
     - Name: `taskdata`
     - Mount path: `/home/data`
     - Storage account: (seleziona quello creato)
     - Share name: `apptaskdata`
4. **Save** → **Restart**

✅ Ora i dati persistono anche dopo restart!

---

## 🔄 Aggiornare l'app

Dopo modifiche al codice:
```bash
git add .
git commit -m "Update app"
git push
```

Azure fa il deploy automaticamente! 🎉

---

## 📞 Problemi?

Controlla i **logs**:
- Web App → **Monitoring** → **Log stream**

Comando comune di debug:
```
# Verifica che il server parta
cat /home/LogFiles/stdout*.log
```
