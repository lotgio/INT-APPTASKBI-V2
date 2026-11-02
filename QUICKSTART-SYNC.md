# 🚀 AVVIO RAPIDO

## ⚡ Usa l'App in 3 Secondi

### Windows
```bash
double-click start-app.bat
```

### Mac/Linux
```bash
bash start-local.bat  # oppure npm run dev
```

✅ Automaticamente:
- Sincronizza commesse da Azure
- Build frontend
- Avvia server
- Apre browser

---

## 🔄 Ricaricare Commesse

**Dentro l'app:**
1. Vai a "Commesse Aperte"
2. Clicca **"🔄 Ricarica"**
3. Dati sincronizzati da Azure ✅

---

## 📖 Documentazione

- **[SYNC-COMPLETE.md](SYNC-COMPLETE.md)** ← Vedi qui per il SUMMARY della soluzione
- **[SYNC-GUIDE.md](SYNC-GUIDE.md)** ← Dettagli tecnici completi
- **[AUTOSTART-GUIDE.md](AUTOSTART-GUIDE.md)** ← Come creare exe/collegamento

---

## 🆘 Problemi?

```bash
# Sincronizzazione manuale
python sync-jobs.py

# Reset completo
rm -r node_modules dist
npm install
npm run build
npm start
```

---

**Fatto!** L'app sincronizza automaticamente i dati da Azure. 🎉
