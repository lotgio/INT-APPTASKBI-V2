# 🚀 Guida Avvio Automatico AppTask

Ho creato **3 diverse soluzioni** per avviare l'app automaticamente:

## Opzione 1: Batch Script (⭐ CONSIGLIATO - Più semplice)

Fai doppio clic su **`start-app.bat`**

Questo script:
- ✅ Verifica Node.js
- ✅ Installa dipendenze (se necessarie)
- ✅ Build il frontend
- ✅ Avvia il server
- ✅ Apre automaticamente il browser su http://localhost:8000

**Pro:** Funziona immediatamente, niente di complesso
**Contro:** Finestra console visibile

---

## Opzione 2: PowerShell Script

Fai clic destro su **`start-app.ps1`** → "Esegui con PowerShell"

Oppure da PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File start-app.ps1
```

**Pro:** Interfaccia più moderna con colori e logging migliore
**Contro:** Richiede di gestire PowerShell

---

## Opzione 3: Executable (.EXE)

Fai doppio clic su **`create-exe.bat`**

Questo genererà **`start-app.exe`** che puoi:
- ✅ Eseguire con doppio clic
- ✅ Creare un collegamento sul Desktop
- ✅ Mettere nel menu Start
- ✅ Condividere con altri senza richiedere PowerShell

```
start-app.exe
```

**Pro:** File singolo, niente PowerShell visibile, più "professionale"
**Contro:** Prima volta richiede scaricamento di ps2exe (~3MB)

---

## Se non vuoi l'EXE ma il batch non funziona

Prova il PowerShell script:
```powershell
cd "C:\Users\lotgio\OneDrive - SERENISSIMA INFORMATICA SPA\_lotgio-github\INT-apptaskBI"
powershell -ExecutionPolicy Bypass -File start-app.ps1
```

---

## Opzioni avanzate

### Saltare il build (se già buildato)
```powershell
powershell -ExecutionPolicy Bypass -File start-app.ps1 -SkipBuild
```

### Cambiare l'URL predefinito
```powershell
powershell -ExecutionPolicy Bypass -File start-app.ps1 -Url "http://localhost:3000"
```

---

## Cosa fa normalmente?

1. **Verifica Node.js** - È installato? Altrimenti te lo chiede
2. **npm install** - Installa dipendenze (succede solo la prima volta)
3. **npm run build** - Compila il frontend con Vite
4. **Avvia server** - Accende il server su http://localhost:8000
5. **Apre browser** - Apre automaticamente l'app nel browser predefinito

---

## Troubleshooting

### "Node.js non trovato"
- Installa Node.js 18+ da https://nodejs.org/
- Riavvia il computer dopo l'installazione

### "Il browser non si apre"
- Prova manualmente ad andare su http://localhost:8000
- Il server dovrebbe rispondere

### "Qualcosa di strano nel build"
- Elimina la cartella `dist/` e `node_modules/`
- Riprova lo script

### "Porta 8000 già in uso"
- Modifica server-api.py o server.ts per usare una porta diversa
- Oppure chiudi il processo che usa la porta 8000

---

## Crea un collegamento sul Desktop

### Windows:
1. Fai clic destro su **start-app.bat** (o .exe)
2. "Invia a" → "Desktop (crea collegamento)"

Oppure manualmente:
1. Clic destro Desktop
2. "Nuovo" → "Collegamento"
3. Inserisci il percorso completo: `C:\Users\lotgio\OneDrive - SERENISSIMA INFORMATICA SPA\_lotgio-github\INT-apptaskBI\start-app.bat`

Ora puoi avviare l'app con un doppio clic dal Desktop! 🎯

---

## Note

- L'app gira su **http://localhost:8000**
- Quando chiudi la finestra batch/PowerShell, il server si ferma
- I dati senza Azure Cosmos DB non persistono dopo il restart

Per persistenza dati, configura Azure Cosmos DB (vedi README.md)
