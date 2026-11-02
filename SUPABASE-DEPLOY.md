# 🚀 Deploy Supabase Edge Function - Guida Completa

## 📋 Prerequisiti

1. **Supabase CLI installato**
   ```powershell
   # Installa Supabase CLI
   npm install -g supabase
   ```

2. **Account Supabase** (hai già il progetto attivo)

3. **Deno installato** (per test locale - opzionale)
   ```powershell
   irm https://deno.land/install.ps1 | iex
   ```

---

## 🎯 Step 1: Login a Supabase

```powershell
# Login a Supabase
supabase login

# Ti aprirà il browser per autenticarti
# Copia il token che ti viene dato
```

---

## 🎯 Step 2: Collega il progetto

```powershell
# Collega questo repository al tuo progetto Supabase
supabase link --project-ref [TUO-PROJECT-REF]

# Trovi il project-ref su:
# https://app.supabase.com/project/[project-ref]/settings/general
```

---

## 🎯 Step 3: Deploy la Function

```powershell
# Deploy della function calendar
supabase functions deploy calendar

# Se tutto va bene vedrai:
# ✓ Deployed Function calendar
# Function URL: https://[project-ref].supabase.co/functions/v1/calendar
```

---

## 🎯 Step 4: Verifica che funzioni

```powershell
# Test con un resourceId di esempio
curl "https://[TUO-PROJECT-REF].supabase.co/functions/v1/calendar/[RESOURCE-ID]"

# Dovresti ricevere un file .ics con gli eventi calendario
```

---

## 🔧 Troubleshooting

### Errore: "Function failed to deploy"
- Verifica che Supabase CLI sia aggiornato: `npm update -g supabase`
- Verifica di essere nella directory corretta del progetto

### Errore: "Cannot find module ical-generator"
- Le dipendenze sono gestite da Deno automaticamente tramite ESM
- Non serve `npm install` per le Edge Functions

### Errore: "SUPABASE_URL is not defined"
- Le variabili d'ambiente sono rese disponibili automaticamente da Supabase
- Non serve configurare nulla manualmente

---

## 📝 URL Finale

Dopo il deploy, l'URL sarà:

```
https://[TUO-PROJECT-REF].supabase.co/functions/v1/calendar/{resourceId}
```

**Esempio:**
```
https://abcdefgh.supabase.co/functions/v1/calendar/d4f561e7-3844-4898-9ec8-123456789abc
```

Questo URL va usato in Outlook per sottoscrivere il calendario!

---

## 🔄 Aggiornamenti Futuri

Ogni volta che modifichi il codice della function:

```powershell
# Re-deploy (sovrascrive la versione precedente)
supabase functions deploy calendar
```

---

## 🎨 Integrazione nel Frontend

Dopo il deploy, aggiorna `src/TodoPage.tsx` per usare il nuovo URL:

```typescript
// Cambia da:
const calendarUrl = `${window.location.origin}/api/calendar/${member.id}`;

// A:
const calendarUrl = `https://[TUO-PROJECT-REF].supabase.co/functions/v1/calendar/${member.id}`;
```

---

## ✅ Checklist Finale

- [ ] Supabase CLI installato
- [ ] Login effettuato (`supabase login`)
- [ ] Progetto collegato (`supabase link`)
- [ ] Function deployata (`supabase functions deploy calendar`)
- [ ] URL testato con curl o browser
- [ ] Frontend aggiornato con nuovo URL
- [ ] Test in Outlook completato

---

## 💡 Vantaggi di Supabase Edge Functions

✅ **Zero configurazione**: Le env vars sono già disponibili  
✅ **Deploy istantaneo**: 5-10 secondi  
✅ **Integrato con DB**: Stesso ecosistema di Supabase  
✅ **Gratuito**: 500K richieste/mese nel piano free  
✅ **Global edge network**: Bassa latenza ovunque  

---

Tutto pronto! 🚀
