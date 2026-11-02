# Setup Supabase - Guida Completa

## Step 1: Crea Progetto Supabase

1. Vai a https://app.supabase.com
2. Clicca "New project" o log in con il tuo GitHub account
3. Compila il form:
   - **Project Name**: `apptask` (o come preferisci)
   - **Database Password**: crea una password sicura (NON è il tuo GitHub password)
   - **Region**: Scegli la più vicina (es. Europe/Frankfurt)
   - Clicca "Create new project"

⏳ Attendi 3-5 minuti per il provisioning

## Step 2: Crea le Tabelle

Una volta che il progetto è pronto:

### Tabella `members`

1. Vai a **SQL Editor** e clicca **New query**
2. Copia e incolla questo codice:

```sql
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT,
  avatar TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Abilita RLS (Row Level Security)
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- Consenti lettura a tutti, modifica solo al proprietario
CREATE POLICY "Enable read access for all users" ON members FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON members FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON members FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON members FOR DELETE USING (true);
```

3. Clicca "Run" (Ctrl+Enter)

### Tabella `tasks`

1. Nuovo query in SQL Editor
2. Copia e incolla:

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commessa TEXT NOT NULL,
  description TEXT,
  client TEXT,
  hours NUMERIC,
  assigneeId UUID,
  status TEXT DEFAULT 'pending',
  startDate TEXT,
  endDate TEXT,
  teamId TEXT DEFAULT 'default',
  createdAt TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (assigneeId) REFERENCES members(id) ON DELETE SET NULL
);

-- Abilita RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Consenti accesso pubblico (senza autenticazione)
CREATE POLICY "Enable read access for all users" ON tasks FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON tasks FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON tasks FOR DELETE USING (true);
```

3. Clicca "Run"

### Tabella `job_progress_line_notes`

Per salvare i commenti della schermata avanzamento commesse tra browser/dispositivi:

1. Nuovo query in SQL Editor
2. Copia e incolla il contenuto del file `supabase/job-progress-line-notes.sql`
3. Clicca "Run"

## Step 3: Ottieni le Credenziali

1. Vai a **Settings** (ingranaggio in basso a sinistra)
2. Clicca **API**
3. Copia e salva da qualche parte:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **Anon public key** → `VITE_SUPABASE_ANON_KEY`

Esempio:
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 4: Configura il .env Locale

1. Nel tuo progetto, apri o crea il file `.env`
2. Incolla le credenziali:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. Salva il file

## Step 5: Importa i Dati Iniziali

1. Nel terminale, esegui:
```bash
npm run import-supabase
```

Questo script leggerà `exported-data.json` e caricherà i tuoi 4 members + 60 tasks in Supabase.

## Step 6: Testa Localmente

1. Avvia il dev server:
```bash
npm run dev
```

2. Apri http://localhost:5173
3. Dovresti vedere i dati caricati ✅

## Step 7: Deploy su GitHub Pages

Quando tutto funziona localmente:

```bash
npm run deploy
```

Questo farà:
- Build del progetto
- Deploy su GitHub Pages
- L'app userà Supabase da GitHub Pages

---

## Troubleshooting

**Errore: "Missing Supabase credentials"**
- Controlla che .env abbia le credenziali corrette
- Controlla che `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` non siano vuoti

**Errore di connessione a Supabase**
- Verifica che il Project URL sia accesibile
- Controlla che la chiave sia copiata correttamente (spazi?)

**I dati non si caricano**
- Controlla in Supabase → Database → Tables che le tabelle esistano
- Verifica che i dati siano stati importati (controlla le righe)

---

## File Creati/Modificati

- `src/supabaseClient.ts` - Client Supabase (NON modificare)
- `src/api.ts` - Aggiornato per usare Supabase (ritrova automaticamente se configurato)
- `.env.example` - Aggiornato con variabili Supabase
- `import-supabase.ts` - Script di import (da creare con: `npm run import-supabase`)

---

Pronto? 🚀
