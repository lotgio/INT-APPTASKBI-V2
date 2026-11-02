# App Task Reparto

Applicazione per gestire task di reparto con numero commessa, descrizione, assegnazione ai membri del team e organizzazione per data.

## Requisiti

- Node.js 18 o superiore
- npm
- (Opzionale) Azure Cosmos DB SQL API

## Configurazione

1. Copia .env.example in .env e inserisci le variabili.
2. Se usi Cosmos DB, crea un database e un container con partition key /teamId.

## Installazione dipendenze

- npm install

## Avvio in sviluppo

- npm run dev

L'app frontend è su http://localhost:5173 e le API su http://localhost:5174.

## Seed dati

- npm run seed

## Build produzione

- npm run build
- npm run start

## Pubblicazione su GitHub Pages (via facile)

1. Verifica che il nome repo sia `INT-apptaskBI`. Se diverso, aggiorna `base` in [vite.config.ts](vite.config.ts).
2. Installa dipendenze: `npm install`.
3. I dati CRM pubblicati in `public/jobs.json` vengono aggiornati dalla workflow GitHub [ .github/workflows/sync-jobs.yml ](.github/workflows/sync-jobs.yml#L1), che usa i secrets del repository per leggere Azure Blob.
4. Se vuoi solo ripubblicare il frontend con lo snapshot CRM gia' presente nel repo, usa `npm run deploy`.
5. Su GitHub: Settings -> Pages -> Source = `gh-pages` branch, folder `/`.
6. Attendi 1-2 minuti e usa l'URL pubblico per condividere i link delle risorse.

Architettura dati:
- I dati CRM letti dal sito GitHub Pages arrivano dallo snapshot `jobs.json` aggiornato dalla workflow GitHub a partire da Azure Blob.
- I dati applicativi del sito (task, membri, todo, note) devono essere letti e salvati su Supabase.

## Note

Se le variabili Cosmos DB non sono configurate, il server usa memoria locale (i dati non persistono).
