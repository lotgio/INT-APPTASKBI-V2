# Deploy in Produzione - Guida Completa

## 📋 Prerequisiti
- Account Azure attivo
- Azure CLI installato (opzionale)
- Git installato (per deploy automatico)

## 🚀 Opzione 1: Deploy su Azure Web App (Raccomandato)

### Passo 1: Prepara l'applicazione
```powershell
# Esegui lo script di preparazione
.\deploy-azure.ps1
```

### Passo 2: Crea Azure Web App

**Via Portale Azure:**
1. Vai su [portal.azure.com](https://portal.azure.com)
2. Clicca su "Create a resource" → "Web App"
3. Configura:
   - **Nome**: `apptaskbi` (o nome a tua scelta)
   - **Runtime stack**: Python 3.11
   - **Region**: West Europe (o la più vicina)
   - **Pricing tier**: B1 Basic (o superiore)
4. Clicca "Review + Create"

### Passo 3: Deploy il codice

**Opzione A - Deploy da GitHub (Automatico):**
1. Nel portale Azure, vai alla tua Web App
2. Deployment Center → GitHub
3. Autorizza e seleziona:
   - Organization: Il tuo account
   - Repository: INT-apptaskBI
   - Branch: main
4. Clicca "Save"
5. Azure farà il deploy automatico ad ogni push

**Opzione B - Deploy ZIP (Manuale):**
```powershell
# Crea archivio ZIP
Compress-Archive -Path dist,data,server-api.py,requirements.txt,public -DestinationPath deploy.zip -Force

# Deploy con Azure CLI
az webapp deployment source config-zip --resource-group <RESOURCE_GROUP> --name <APP_NAME> --src deploy.zip
```

### Passo 4: Configura Startup Command
1. Nel portale Azure, vai alla tua Web App
2. Configuration → General settings
3. Startup Command: `python server-api.py`
4. Clicca "Save"

### Passo 5: Verifica
Apri: `https://<APP_NAME>.azurewebsites.net`

---

## 🔄 Persistenza Dati

### Dove vengono salvati i dati?

I dati sono salvati in file JSON nella cartella `data/`:
- `data/tasks.json` - Task e commesse
- `data/members.json` - Team members

**Su Azure:**
- I file vengono salvati nel filesystem della Web App
- ⚠️ IMPORTANTE: I file persistono SOLO se usi Azure Files o Database

### Opzione 1: Usare Azure Storage (Raccomandato per produzione)

Per garantire la persistenza dei dati anche in caso di restart:

1. Crea un Azure Storage Account
2. Crea un File Share
3. Monta il File Share nella Web App:
   - Settings → Configuration → Path mappings
   - Mount path: `/home/data`
   - Storage account: Seleziona il tuo storage
   - Share name: `apptaskdata`

### Opzione 2: Usare un Database (Alternativa)

Modifica il backend per usare:
- Azure SQL Database
- Azure Cosmos DB
- PostgreSQL

---

## 🛠️ Gestione Ambiente Locale

### Avvio locale per sviluppo
```powershell
# Build frontend
npm run build

# Copia jobs.json
Copy-Item public\jobs.json dist\jobs.json -Force

# Avvia server
python server-api.py
```

Apri: http://localhost:8000

### Struttura dati iniziale

**data/tasks.json** (inizialmente vuoto):
```json
[]
```

**data/members.json** (esempio):
```json
[
  {
    "id": "member-1",
    "name": "Mario Rossi",
    "role": "Senior Developer",
    "annualTarget": 150000
  },
  {
    "id": "member-2",
    "name": "Laura Bianchi",
    "role": "Project Manager",
    "annualTarget": 120000
  }
]
```

---

## 🔐 Sicurezza

### Variabili d'ambiente (opzionali)
Nel portale Azure, Configuration → Application settings:

```
AZURE_STORAGE_CONNECTION_STRING=<connection-string>
AZURE_BLOB_CONTAINER=<container-name>
```

### CORS
Il backend ha CORS abilitato per sviluppo. In produzione, limita a domini specifici in `server-api.py`:

```python
CORS(app, origins=['https://tuodominio.com'])
```

---

## 📊 Monitoraggio

Nel portale Azure:
- **Logs**: Monitoring → Log stream
- **Metrics**: Monitoring → Metrics
- **Alerts**: Monitoring → Alerts

---

## ❓ Troubleshooting

### Errore: "Application Error"
1. Vai a Log stream nel portale Azure
2. Verifica che `requirements.txt` sia corretto
3. Controlla che Startup Command sia: `python server-api.py`

### Dati non persistono dopo restart
- Configura Azure File Share (vedi sopra)
- Oppure usa un database

### File jobs.json non trovato
- Verifica che `dist/jobs.json` esista nel deploy
- Controlla i logs per errori di percorso

---

## 🔄 Aggiornamenti

Dopo modifiche al codice:

**Con GitHub deploy:**
```bash
git add .
git commit -m "Update"
git push
# Deploy automatico!
```

**Con ZIP deploy:**
```powershell
.\deploy-azure.ps1
# Poi carica manualmente lo ZIP
```

---

## 📞 Supporto

Per problemi o domande:
- Azure Documentation: [docs.microsoft.com/azure](https://docs.microsoft.com/azure)
- Azure Support: [portal.azure.com](https://portal.azure.com)
