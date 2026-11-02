# ✅ Checklist Pre-Deploy

Prima di fare il deploy su Azure, verifica:

## 📋 File Necessari
- [x] `requirements.txt` - Dipendenze Python
- [x] `server-api.py` - Backend Flask
- [x] `dist/` - Frontend compilato
- [x] `data/tasks.json` - File dati task
- [x] `data/members.json` - File dati membri
- [x] `public/jobs.json` - Dati commesse

## 🔧 Configurazione
- [x] Server usa variabile PORT per Azure
- [x] CORS configurato nel backend
- [x] Frontend compilato con `npm run build`
- [x] jobs.json copiato in dist/

## 🧪 Test Locale
- [ ] Build senza errori: `npm run build`
- [ ] Server parte correttamente: `python server-api.py`
- [ ] API funzionano: http://localhost:8000/api/tasks
- [ ] Frontend accessibile: http://localhost:8000
- [ ] Task si salvano correttamente in data/tasks.json
- [ ] Membri si salvano correttamente in data/members.json

## 🚀 Azure Setup
- [ ] Account Azure attivo
- [ ] Web App creata (Python 3.11)
- [ ] GitHub collegato per deploy automatico
- [ ] Startup command: `python server-api.py`
- [ ] (Opzionale) File Share configurato per persistenza

## 📊 Verifica Post-Deploy
- [ ] App accessibile su https://[nome-app].azurewebsites.net
- [ ] Log stream attivo senza errori
- [ ] API risponde correttamente
- [ ] Possibile creare e salvare task
- [ ] Possibile aggiungere team members
- [ ] Dati persistono dopo refresh

## 🔐 Sicurezza (Opzionale)
- [ ] CORS limitato a domini specifici
- [ ] Variabili ambiente configurate
- [ ] HTTPS abilitato (automatico su Azure)

---

## ⚡ Deploy Rapido

Se tutti i checkbox sono ✓, esegui:

```powershell
# 1. Build
npm run build
Copy-Item public\jobs.json dist\jobs.json -Force

# 2. Commit e push (se usi GitHub deploy)
git add .
git commit -m "Ready for production deploy"
git push

# 3. Azure fa il deploy automaticamente!
```

Oppure segui `QUICKSTART.md` per istruzioni dettagliate.
