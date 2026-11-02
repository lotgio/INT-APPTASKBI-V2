# AppTask BI – versione 2

Nuova interfaccia con menu laterale. Stessi dati (Supabase) e stessa logica di calcolo dell'app originale.

## Avvio

```
npm install
npm run dev:client
```

Poi apri http://localhost:5173/INT-APPTASKBI-V2/ (con `npm run dev` parte anche il server locale, come prima).

## Cosa cambia

**Calendario** (`#/calendario`) – `src/pages/CalendarPage.tsx`
- Vista **Timeline**: una riga per risorsa con carico del mese; i task sono barre colorate per cliente, le ferie tratteggiate, i task sovrapposti vanno su corsie separate.
- Trascina una barra per spostarla (mantiene la durata) o per riassegnarla trascinandola sulla riga di un'altra persona; trascina i bordi per allungarla o accorciarla.
- Trascina i task "Da schedulare" direttamente su persona + giorno.
- Vista **Mese** classica, sempre con trascinamento.
- Pannello di dettaglio: stato modificabile al volo, avviso oltre 8h/giorno, Modifica ed Elimina.
- Ferie/assenze da finestra dedicata (suggerisce i giorni lavorativi del periodo).
- Festività italiane calcolate per ogni anno (anche Pasqua e Pasquetta).

**Avanzamento** (`#/avanzamento`) – `src/pages/ProgressPage.tsx`
- Colonne raggruppate in barre: ore loggate/vendute, enable e fatturate (rispetto al venduto, come prima).
- Stato per commessa e riga: In linea, In chiusura (≥90%), Sforata, Da avviare.
- Fascia "righe oltre il venduto": un click apre la commessa.
- Ordinamento per commessa, avanzamento o residuo.
- Note salvate in automatico, export Excel (ora con colonna Stato e Risorsa), sync con token nelle impostazioni (icona ingranaggio).

**Altre pagine**: Todo, Commesse aperte, Statistiche, Team, Database sono quelle di prima dentro il nuovo layout.
La pagina "Calendario classico" resta disponibile nel menu per il periodo di transizione.

## File

- `src/App.tsx` – nuovo layout e indirizzi delle pagine (`#/calendario`, `#/avanzamento`, …)
- `src/ui.css` – stile del nuovo design (non interferisce con `App.css` delle pagine vecchie)
- `src/lib/planning.ts` – calcoli condivisi (giorni lavorativi, ore, occupazione, target)
- `src/components/` – menu laterale e icone
- `src/App.legacy.tsx.txt` – la vecchia App.tsx, solo come riferimento

## Pubblicazione su un indirizzo nuovo

La v2 vive su **https://lotgio.github.io/INT-APPTASKBI-V2/**, separata dall'app attuale
(https://lotgio.github.io/INT-APPTASKBI/), che resta com'è.

- **Stessi dati**: stesso Supabase (task, ferie, team, note) e stesse commesse. La v2 legge `jobs.json`
  e `resources.json` dal sito attuale, che il suo workflow aggiorna 3 volte al giorno.
  "Aggiorna dati" nella v2 avvia proprio quel workflow.
- **Nessuna sincronizzazione doppia**: il vecchio `sync-jobs.yml` è stato spostato in `_to_delete/`
  (puoi eliminare quella cartella). Al suo posto c'è `.github/workflows/deploy-v2.yml`.

### Prima pubblicazione (una volta sola)

1. Su GitHub crea un repository vuoto **pubblico** chiamato `INT-APPTASKBI-V2` (account `lotgio`),
   senza README.
2. Da questa cartella:
   ```
   git init -b main
   git add .
   git commit -m "AppTask BI v2"
   git remote add origin https://github.com/lotgio/INT-APPTASKBI-V2.git
   git push -u origin main
   ```
   Il push avvia il workflow `Deploy v2`, che pubblica il sito sul branch `gh-pages`.
3. Su GitHub: **Settings → Pages → Source: Deploy from a branch → `gh-pages` / root → Save**.
   Dopo un paio di minuti il sito è online.

### Aggiornamenti successivi

Basta un `git push` su `main`. In alternativa, da PC: `npm run deploy` (usa `scripts/deploy-v2.mjs`).
Entrambi pubblicano **solo** sull'indirizzo della v2.
