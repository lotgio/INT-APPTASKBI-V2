# Calendario Outlook - Implementazione

## ✅ Completato

1. **Backend API Endpoint** (`/api/calendar/{resourceId}`)
   - Azure Function creata in `api/calendar/`
   - Genera feed iCalendar (.ics) personalizzato per ogni risorsa
   - Integrato con Supabase per recuperare todos
   - Header configurati per refresh ogni 15 minuti
   - Dipendenze installate: `ical-generator`, `@supabase/supabase-js`

## 🔨 Da completare (Frontend)

### 1. Aggiungere state per modal calendario

In `src/TodoPage.tsx`, dopo la riga `const [isCreateOpen, setIsCreateOpen] = useState(false);`:

```typescript
const [showCalendarModal, setShowCalendarModal] = useState(false);
const [copiedLink, setCopiedLink] = useState<string | null>(null);
```

### 2. Aggiungere pulsante per aprire modal

Nel `<div className="todo-actions">` (circa riga 910), aggiungere:

```tsx
<button 
  className="secondary" 
  onClick={() => setShowCalendarModal(true)}
  title="Sottoscrivi calendario Outlook"
>
  📅 Calendario
</button>
```

### 3. Aggiungere component modalPrima di `{isCreateOpen && (` (circa riga 1102), aggiungere:

```tsx
{showCalendarModal && (
  <div className="modal-overlay" onClick={() => setShowCalendarModal(false)}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3>📅 Sottoscrivi Calendario Outlook</h3>
        <button className="ghost" onClick={() => setShowCalendarModal(false)}>✕</button>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <p><strong>Come funziona:</strong></p>
        <ol style={{ lineHeight: '1.8', paddingLeft: '20px' }}>
          <li>Copia il link del calendario della tua risorsa</li>
          <li>Apri Outlook → Calendario → "Aggiungi calendario"</li>
          <li>Seleziona "Da Internet" e incolla il link</li>
          <li>Il calendario si sincronizzerà automaticamente ogni 15-30 minuti</li>
        </ol>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
          Seleziona risorsa:
        </label>
        {members.map((member) => {
          const calendarUrl = `${window.location.origin}/api/calendar/${member.id}`;
          const isCopied = copiedLink === member.id;
          
          return (
            <div 
              key={member.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: '#f8fafc',
                borderRadius: '8px',
                marginBottom: '8px'
              }}
            >
              <span 
                style={{
                  flex: 1,
                  fontWeight: '500',
                  color: '#0f172a'
                }}
              >
                {member.name}
              </span>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(calendarUrl);
                    setCopiedLink(member.id);
                    setTimeout(() => setCopiedLink(null), 2000);
                  } catch (err) {
                    alert('Errore nella copia del link');
                  }
                }}
                style={{ whiteSpace: 'nowrap' }}
              >
                {isCopied ? '✓ Copiato!' : '📋 Copia link'}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{
        padding: '12px',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        fontSize: '13px',
        color: '#1e40af'
      }}>
        <strong>💡 Tip:</strong> Per aggiornamenti più frequenti (ogni 15 min), 
        usa Outlook Web o l'app mobile e abilita "Sincronizzazione automatica calendari Internet"
      </div>
    </div>
  </div>
)}
```

## ⚙️ Configurazione Azure

Aggiungere queste variabili d'ambiente nelle Azure Function App Settings:

```
SUPABASE_URL=<tuo-supabase-url>
SUPABASE_ANON_KEY=<tuo-supabase-anon-key>
```

## 🧪 Test locale

Per testare l'endpoint localmente:

1. Installa Azure Functions Core Tools
2. Configura `local.settings.json` in `api/`:
   ```json
   {
     "IsEncrypted": false,
     "Values": {
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "SUPABASE_URL": "your-url",
       "SUPABASE_ANON_KEY": "your-key"
     }
   }
   ```
3. Esegui `cd api && func start`
4. Accedi a `http://localhost:7071/api/calendar/{resourceId}`

## 📝 Note

- Il calendario si aggiorna automaticamente ogni 15-30 minuti in Outlook- Gli eventi usano dueDate come data/ora (default 09:00)
- Eventi di 1 ora di default
- Status: TENTATIVE per task aperti, CONFIRMED per completati
- Le categorie includono BU e stato completamento
