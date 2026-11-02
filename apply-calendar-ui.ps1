# Script per aggiungere il modal del calendario in TodoPage.tsx

$filePath = "C:\Users\lotgio\OneDrive - SERENISSIMA INFORMATICA SPA\_lotgio-github\INT-apptaskBI-clean\src\TodoPage.tsx"
$content = Get-Content $filePath -Raw

# 1. Aggiungi state dopo isCreateOpen
$stateToAdd = @"
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
"@

$content = $content -replace '(\s+const \[isCreateOpen, setIsCreateOpen\] = useState\(false\);)', "`$1`n$stateToAdd"

# 2. Aggiungi pulsante calendario dopo "Nuovo task"
$buttonToAdd = @"
          <button 
            className="secondary" 
            onClick={() => setShowCalendarModal(true)}
            title="Sottoscrivi calendario Outlook"
          >
            📅 Calendario
          </button>
"@

$content = $content -replace '(\s+<button className="primary" onClick=\{\(\) => setIsCreateOpen\(true\)\}>\s+➕ Nuovo task\s+</button>)', "`$1`n$buttonToAdd"

# 3. Aggiungi modal prima di {isCreateOpen &&
$modalToAdd = @'
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

'@

$content = $content -replace '(\s+\{isCreateOpen &&)', "$modalToAdd`n`$1"

# Salva il file modificato
$content | Set-Content $filePath -NoNewline

Write-Host "✅ Modifiche applicate con successo a TodoPage.tsx" -ForegroundColor Green
