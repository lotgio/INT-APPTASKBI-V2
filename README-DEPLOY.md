# 📚 Riassunto Deploy e Persistenza Dati

## ✅ Cosa è già pronto

1. **✓ Persistenza locale funziona**: I dati vengono già salvati in `data/tasks.json` e `data/members.json`
2. **✓ API REST complete**: Tutte le operazioni CRUD funzionano
3. **✓ Frontend compilato**: L'app React è pronta in `dist/`
4. **✓ Server Flask configurato**: Backend pronto per produzione

## 🎯 Persistenza Dati - Come Funziona

### Locale (Sviluppo)
I dati sono salvati automaticamente nei file:
- `data/tasks.json` - Task creati
- `data/members.json` - Team members

**Ogni volta che:**
- Crei un task → Salvato in tasks.json
- Aggiungi un membro → Salvato in members.json
- Modifichi qualcosa → Aggiornato automaticamente

### Produzione (Azure)
Per garantire che i dati persistano anche dopo restart del server:

**Opzione 1: Azure File Share (Raccomandato)**
- Crea uno Storage Account
- Monta un File Share sulla Web App
- I file in `data/` vengono salvati permanentemente

**Opzione 2: Database**
- Migra a Azure SQL o Cosmos DB
- Richiede modifiche al codice backend

## 🚀 Passi per Mettere in Live

### 1. **QUICK START (15 minuti)**
Segui il file `QUICKSTART.md` per:
- Creare una Web App su Azure
- Deploy automatico da GitHub
- Configurare File Share per persistenza

### 2. **GUIDA COMPLETA**
Leggi `DEPLOY.md` per:
- Tutte le opzioni di deploy
- Configurazione avanzata
- Troubleshooting

### 3. **Deploy Locale (per test)**
Esegui lo script:
```powershell
.\deploy-azure.ps1
```

## 📂 File Creati per il Deploy

✅ `requirements.txt` - Dipendenze Python
✅ `Procfile` - Configurazione Heroku (opzionale)
✅ `startup.txt` - Comando avvio Azure
✅ `deploy.sh` - Script deploy automatico
✅ `.deployment` - Configurazione Azure
✅ `deploy-azure.ps1` - Script preparazione deploy
✅ `DEPLOY.md` - Guida completa
✅ `QUICKSTART.md` - Guida rapida (5 min)

## 🎉 Riepilogo

**Per sviluppo locale:**
```powershell
npm run build
Copy-Item public\jobs.json dist\jobs.json -Force
python server-api.py
```
→ I dati persistono in `data/` sul tuo PC

**Per produzione:**
1. Segui `QUICKSTART.md`
2. Configura Azure File Share
3. I dati persistono sul cloud Azure

## 💡 Note Importanti

- **Git**: Ho modificato `.gitignore` per includere `dist/` e `data/` nel repository (necessario per Azure)
- **Porta**: Il server usa automaticamente la porta Azure (variabile `PORT`) o 8000 in locale
- **CORS**: Abilitato per tutti i domini (in produzione, limitalo al tuo dominio)

## 🔗 Link Utili

- Azure Portal: https://portal.azure.com
- Documentazione Azure Web Apps: https://docs.microsoft.com/azure/app-service/
- Questa app locale: http://localhost:8000

---

**Prossimo passo consigliato:** Leggi e segui `QUICKSTART.md` per il deploy in 5 minuti! 🚀
