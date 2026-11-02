# 🔄 Sincronizzazione Automatica Dati da Azure

## 🎯 Problema Risolto

Prima i dati delle commesse non si aggiornevano automaticamente all'avvio dell'app. Ora:

✅ **All'avvio**: L'app sincronizza automaticamente i dati dal parquet su Azure e aggiorna `public/jobs.json`
✅ **Durante l'app**: Puoi cliccare il bottone "Ricarica" per ricaricare manualmente i dati da Azure
✅ **Fallback intelligente**: Se Azure non è raggiungibile, usa i dati locali già presenti

---

## 📋 Come Funziona

### 1. Avvio Automatico
Quando fai partire l'app con `start-app.bat` o `start-app.ps1`:

```
1. Verifica dipendenze (pandas, azure-storage-blob)
2. Esegue sync-jobs.py
3. Sincronizza il parquet da Azure → public/jobs.json
4. Build frontend (Vite)
5. Avvia il server
6. Apre il browser
```

**Risultato**: L'app parte sempre con i dati più recenti su Azure ✨

### 2. Ricarica Manuale dall'App
Dentro l'app, nella sezione "Commesse Aperte":

1. Clicca il bottone **"🔄 Ricarica"** (accanto ai filtri)
2. L'app sincronizza i dati direttamente da Azure
3. Vedi automaticamente le commesse aggiornate

**Tempo**: ~5-10 secondi a seconda della connessione Azure

### 3. Fallback Intelligente
Se Azure non è disponibile:
- ⚠️ Sei avvertito con un messaggio
- 📦 L'app continua usando i dati locali in `public/jobs.json`
- 🔄 Puoi ritentare il sync quando Azure è di nuovo disponibile

---

## 🛠️ File Modificati/Creati

### File Nuovi
- **`sync-jobs.py`** - Script che scarica il parquet da Azure e salva in `public/jobs.json`
- **`AUTOSTART-GUIDE.md`** - Guida completa per l'avvio automatico (già in repo)

### File Modificati
- **`start-app.bat`** - Aggiunto esecuzione di `sync-jobs.py` prima del build
- **`start-app.ps1`** - Aggiunto esecuzione di `sync-jobs.py` prima del build
- **`server-api.py`** - Aggiunto endpoint `/api/sync-jobs` per ricaricare manualmente
- **`src/api.ts`** - Aggiunta funzione `syncJobsFromAzure()`
- **`src/JobsPage.tsx`** - Modificato `loadJobs` per sincronizzare quando ricarichi manualmente

---

## 📌 Cosa Puoi Fare Ora

### ✅ Aggiornamento Automatico all'Avvio
```bash
double-click start-app.bat
# Automaticamente ricarica i dati da Azure
```

### ✅ Aggiornamento Manuale dall'App
1. Sei nell'app
2. Vedi nuove commesse su Azure? Clicca **"🔄 Ricarica"**
3. Dati sincronizzati in pochi secondi

### ✅ Sviluppo Senza Interruzioni
Se durante lo sviluppo sei offline, l'app non si ferma. Continua con i dati locali.

---

## 🔧 Dettagli Tecnici

### Script di Sincronizzazione (`sync-jobs.py`)

```python
# Scarica jobs_complete.parquet da Azure
blob_client.download_blob()

# Converte in JSON con pandas
df = pd.read_parquet(stream)
records = df.to_dict(orient='records')

# Salva in public/jobs.json
json.dump(records, f)
```

**Caratteristiche:**
- Auto-installa le dipendenze se mancanti
- Timeout: 60 secondi max
- Gestisce errori Azure gracefully
- Output chiaro con progresso

### Endpoint Server (`/api/sync-jobs`)

```typescript
POST /api/sync-jobs

Response Success (200):
{
  "ok": true,
  "message": "Commesse sincronizzate con Azure",
  "output": "..."
}

Response Error (500):
{
  "error": "Sincronizzazione fallita",
  "details": "..."
}
```

---

## 📊 Flow Completo

```
┌─────────────────────────────────┐
│  Avvio App (start-app.bat)      │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  sync-jobs.py                   │
│  ├─ Connetti ad Azure           │
│  ├─ Scarica jobs_complete.parquet│
│  └─ Salva → public/jobs.json    │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  npm run build                  │
│  (Frontend Vite)                │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  server-api.py start            │
│  Serve frontend + API           │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Browser aperto su              │
│  http://localhost:8000          │
│  Visualizza commesse da Azure ✨│
└─────────────────────────────────┘
                ▲
                │
         (Durante l'uso)
                │
     User clicca "🔄 Ricarica"
                │
                ▼
┌─────────────────────────────────┐
│  Chiama POST /api/sync-jobs     │
│  (Server esegue sync-jobs.py)   │
│  Ricarica jobs.json in memoria  │
│  Aggiorna UI automaticamente    │
└─────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### "Sincronizzazione fallita"
- ✅ Connessione Internet attiva?
- ✅ Credenziali Azure corrette in `sync-jobs.py`?
- ✅ Il blob `jobs_complete.parquet` esiste in Azure?

**Soluzione**: L'app continua con dati locali in `public/jobs.json`

### "jobs.json vuoto"
- Prima sincronizzazione? Aspetta 5-10 secondi
- Il blob su Azure potrebbe essere vuoto
- Controlla nel storage account Azure

### "Build fallita dopo sync"
- Elimina `dist/` e `node_modules/`
- Riprova: `npm run build`

---

## 🎯 Prossimi Miglioramenti Possibili

Se volessi aggiungere in futuro:

1. **Notifiche di aggiornamento**
   ```typescript
   // Mostrare "Dati aggiornati!" quando sync completa
   toast.success('Dati sincronizzati con Azure');
   ```

2. **Aggiornamento periodico automatico**
   ```javascript
   // Ogni 5 minuti
   setInterval(() => syncJobsFromAzure(), 5 * 60 * 1000);
   ```

3. **Indicatore di ultimo aggiornamento**
   ```typescript
   // "Ultimo aggiornamento: 2 minuti fa"
   ```

4. **Sync in background senza bloccare UI**
   ```javascript
   // Web Worker per non fermare l'interfaccia
   ```

---

## 📝 Resumé

| Aspetto | Prima | Dopo |
|---------|-------|------|
| **Avvio app** | Dati statici `jobs.json` | Sincronizzazione Azure automatica ✅ |
| **Ricarica commesse** | Non disponibile | Bottone "🔄 Ricarica" funzionante ✅ |
| **Offline** | App non parte | App parte con dati locali ✅ |
| **Tempo sync** | N/A | ~5-10 secondi |
| **Dipendenze** | npm | npm + Python (pandas, azure) |

---

**Fatto!** La tua app ora sincronizza i dati automaticamente da Azure. 🚀
