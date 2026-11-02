import { useMemo, useState } from "react";
import { createTodo, deleteTodo, updateTodo } from "../api";
import type { Member, TodoItem } from "../types";
import Icon from "../components/Icon";
import { clientColor, formatDate, initials, parseDate } from "../lib/planning";
import { useJobBudgets, type JobBudget } from "../lib/jobBudgets";

type StatusFilter = "open" | "done" | "all";
type View = "list" | "board";
type GroupBy = "due" | "client" | "commessa" | "resource" | "bu" | "none";
type DueBucket = "overdue" | "today" | "week" | "later" | "none" | "done";

interface Props {
  todos: TodoItem[];
  members: Member[];
  onTodosUpdate: (todos: TodoItem[]) => void;
}

const SUPABASE_URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://teadzgcurjjdbuoohakr.supabase.co").replace(/\/$/, "");
const GROUP_LABELS: Record<GroupBy, string> = { due: "Scadenza", client: "Cliente", commessa: "Commessa", resource: "Risorsa", bu: "Business unit", none: "Nessuno" };
const DUE_META: Record<DueBucket, { label: string; order: number; bg: string; fg: string }> = {
  overdue: { label: "Scaduti", order: 0, bg: "var(--danger-soft)", fg: "var(--danger-ink)" },
  today: { label: "Oggi", order: 1, bg: "#FDEFD2", fg: "#6E3D00" },
  week: { label: "Prossimi 7 giorni", order: 2, bg: "var(--accent-soft)", fg: "var(--accent-ink)" },
  later: { label: "Più avanti", order: 3, bg: "#EBF0F6", fg: "var(--ink-2)" },
  none: { label: "Senza scadenza", order: 4, bg: "#EBF0F6", fg: "var(--muted)" },
  done: { label: "Completati", order: 5, bg: "#E2F4EC", fg: "#0B6146" }
};

function dueBucket(t: TodoItem, todayKey: string, weekKey: string): DueBucket {
  if (t.completed) return "done";
  if (!t.dueDate) return "none";
  const k = t.dueDate.slice(0, 10);
  if (k < todayKey) return "overdue";
  if (k === todayKey) return "today";
  if (k <= weekKey) return "week";
  return "later";
}
const fmtDue = (key?: string) => (key ? parseDate(key).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "");
const norm = (s?: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function TodosPage({ todos, members, onTodosUpdate }: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [view, setView] = useState<View>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("due");
  const [memberFilter, setMemberFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ todo: Partial<TodoItem>; id: string | null } | null>(null);
  const [quick, setQuick] = useState({ title: "", resourceId: "", dueDate: "" });
  const [showCalendar, setShowCalendar] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { budgets } = useJobBudgets();

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const today = new Date();
  const todayKey = formatDate(today);
  const weekKey = formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6));

  const counts = useMemo(() => {
    const c = { open: 0, overdue: 0, week: 0, done: 0 };
    for (const t of todos) {
      if (memberFilter && (memberFilter === "none" ? !!t.resourceId : t.resourceId !== memberFilter)) continue;
      const b = dueBucket(t, todayKey, weekKey);
      if (b === "done") c.done++;
      else {
        c.open++;
        if (b === "overdue") c.overdue++;
        if (b === "today" || b === "week") c.week++;
      }
    }
    return c;
  }, [todos, todayKey, weekKey, memberFilter]);

  const filtered = useMemo(() => {
    const term = norm(q.trim());
    return todos
      .filter((t) => (status === "all" ? true : status === "done" ? t.completed : !t.completed))
      .filter((t) => (!memberFilter ? true : memberFilter === "none" ? !t.resourceId : t.resourceId === memberFilter))
      .filter((t) => !term || [t.title, t.description, t.client, t.commessa, t.businessUnit, memberById.get(t.resourceId || "")?.name].some((v) => norm(v).includes(term)))
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const da = a.dueDate || "9999", db = b.dueDate || "9999";
        return da.localeCompare(db) || (b.createdAt || "").localeCompare(a.createdAt || "");
      });
  }, [todos, q, status, memberFilter, memberById]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; order: number | string; items: TodoItem[] }>();
    for (const t of filtered) {
      let key = "all", label = "Tutti", order: number | string = 0;
      if (groupBy === "due") {
        const b = dueBucket(t, todayKey, weekKey);
        key = b; label = DUE_META[b].label; order = DUE_META[b].order;
      } else if (groupBy === "client") {
        label = t.client || "Senza cliente"; key = "c:" + label; order = t.client ? label.toLowerCase() : "~";
      } else if (groupBy === "commessa") {
        label = t.commessa || "Senza commessa"; key = "j:" + label; order = t.commessa ? label : "~";
      } else if (groupBy === "resource") {
        label = memberById.get(t.resourceId || "")?.name || "Senza risorsa"; key = "r:" + (t.resourceId || "-"); order = t.resourceId ? label.toLowerCase() : "~";
      } else if (groupBy === "bu") {
        label = t.businessUnit || "Senza business unit"; key = "b:" + label; order = t.businessUnit ? label.toLowerCase() : "~";
      }
      if (!map.has(key)) map.set(key, { key, label, order, items: [] });
      map.get(key)!.items.push(t);
    }
    return Array.from(map.values()).sort((a, b) => (typeof a.order === "number" && typeof b.order === "number" ? a.order - b.order : String(a.order).localeCompare(String(b.order))));
  }, [filtered, groupBy, todayKey, weekKey, memberById]);

  const run = async <T,>(fn: () => Promise<T>, msg: string) => {
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : msg);
      return undefined;
    }
  };

  const toggle = async (t: TodoItem) => {
    const before = todos;
    onTodosUpdate(todos.map((x) => (x.id === t.id ? { ...x, completed: !t.completed } : x)));
    const ok = await run(() => updateTodo(t.id, { completed: !t.completed }), "Errore aggiornamento");
    if (!ok) onTodosUpdate(before);
  };
  const remove = async (t: TodoItem) => {
    if (!window.confirm(`Eliminare "${t.title}"?`)) return;
    const ok = await run(() => deleteTodo(t.id), "Errore eliminazione");
    if (ok) {
      onTodosUpdate(todos.filter((x) => x.id !== t.id));
      setEditing(null);
    }
  };
  const addQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quick.title.trim()) return;
    const created = await run(() => createTodo({
      title: quick.title.trim(),
      resourceId: quick.resourceId || undefined,
      dueDate: quick.dueDate || undefined,
      completed: false
    } as Omit<TodoItem, "id" | "createdAt">), "Errore creazione");
    if (created) {
      onTodosUpdate([created, ...todos]);
      setQuick((qq) => ({ ...qq, title: "" }));
    }
  };
  const saveForm = async (draft: Partial<TodoItem>) => {
    if (!draft.title?.trim()) return setError("Inserisci un titolo.");
    const payload = {
      title: draft.title.trim(),
      description: draft.description?.trim() || undefined,
      commessa: draft.commessa?.trim() || undefined,
      client: draft.client?.trim() || undefined,
      businessUnit: draft.businessUnit?.trim() || undefined,
      resourceId: draft.resourceId || undefined,
      dueDate: draft.dueDate || undefined,
      completed: !!draft.completed
    };
    if (editing?.id) {
      const id = editing.id;
      const saved = await run(() => updateTodo(id, payload), "Errore salvataggio");
      if (saved) { onTodosUpdate(todos.map((x) => (x.id === id ? { ...x, ...saved } : x))); setEditing(null); }
    } else {
      const created = await run(() => createTodo(payload as Omit<TodoItem, "id" | "createdAt">), "Errore creazione");
      if (created) { onTodosUpdate([created, ...todos]); setEditing(null); }
    }
  };

  const toggleGroup = (key: string) => setCollapsed((prev) => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  const DueBadge = ({ t }: { t: TodoItem }) => {
    const b = dueBucket(t, todayKey, weekKey);
    if (!t.dueDate || b === "done") return t.dueDate ? <span className="ui-muted ui-num" style={{ fontSize: 12.5 }}>{fmtDue(t.dueDate)}</span> : <span className="ui-muted">—</span>;
    const m = DUE_META[b];
    return <span className="ui-pill" style={{ background: m.bg, color: m.fg }}>{b === "today" ? "Oggi" : b === "overdue" ? `Scaduto ${fmtDue(t.dueDate)}` : fmtDue(t.dueDate)}</span>;
  };
  const Check = ({ t }: { t: TodoItem }) => (
    <button className={`td-check${t.completed ? " on" : ""}`} role="checkbox" aria-checked={t.completed} aria-label={`${t.completed ? "Riapri" : "Completa"} ${t.title}`} onClick={(e) => { e.stopPropagation(); void toggle(t); }}>
      {t.completed && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
    </button>
  );
  const Person = ({ id }: { id?: string }) => {
    const m = id ? memberById.get(id) : undefined;
    if (!m) return <span className="ui-muted" style={{ fontSize: 12.5 }}>—</span>;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, minWidth: 0 }}>
        <span className="ui-avatar" style={{ width: 22, height: 22, fontSize: 10 }}>{initials(m.name)}</span>
        <span className="db-ellipsis">{m.name}</span>
      </span>
    );
  };

  return (
    <div className="ui-page">
      <header className="ui-header">
        <div>
          <div className="ui-eyebrow">Pianificazione · attività operative</div>
          <h1 className="ui-title">To-do</h1>
        </div>
        <div className="ui-row">
          <button className="ui-btn" onClick={() => setShowCalendar(true)}><Icon name="calendar" /> Calendario Outlook</button>
          <button className="ui-btn primary" onClick={() => { setError(null); setEditing({ id: null, todo: { title: "", resourceId: memberFilter && memberFilter !== "none" ? memberFilter : undefined } }); }}>
            <Icon name="plus" strokeWidth={2} /> Nuovo to-do
          </button>
        </div>
      </header>

      {error && <div className="ui-alert error" role="alert">{error}<button className="ui-btn sm ghost" onClick={() => setError(null)}>Chiudi</button></div>}

      <section className="ui-kpis" aria-label="Riepilogo">
        <button className="ui-card ui-card-pad ui-kpi td-kpi" onClick={() => { setStatus("open"); setGroupBy("due"); }}>
          <span className="ui-kpi-label">Aperti</span><span className="ui-kpi-value">{counts.open}</span>
        </button>
        <button className="ui-card ui-card-pad ui-kpi td-kpi" onClick={() => { setStatus("open"); setGroupBy("due"); }}>
          <span className="ui-kpi-label">Scaduti</span><span className="ui-kpi-value" style={{ color: counts.overdue ? "var(--danger)" : undefined }}>{counts.overdue}</span>
        </button>
        <button className="ui-card ui-card-pad ui-kpi td-kpi" onClick={() => { setStatus("open"); setGroupBy("due"); }}>
          <span className="ui-kpi-label">In scadenza entro 7 giorni</span><span className="ui-kpi-value">{counts.week}</span>
        </button>
        <button className="ui-card ui-card-pad ui-kpi td-kpi" onClick={() => setStatus("done")}>
          <span className="ui-kpi-label">Completati</span><span className="ui-kpi-value">{counts.done}</span>
        </button>
      </section>

      <form className="ui-card td-quick" onSubmit={addQuick} aria-label="Inserimento rapido">
        <Icon name="plus" strokeWidth={2} />
        <input value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} placeholder="Scrivi un to-do e premi Invio…" aria-label="Titolo nuovo to-do" />
        <select className="ui-select sm" value={quick.resourceId} onChange={(e) => setQuick({ ...quick, resourceId: e.target.value })} aria-label="Risorsa">
          <option value="">Nessuna risorsa</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input type="date" className="ui-select sm" value={quick.dueDate} onChange={(e) => setQuick({ ...quick, dueDate: e.target.value })} aria-label="Scadenza" />
        <button type="submit" className="ui-btn sm primary" disabled={!quick.title.trim()}>Aggiungi</button>
      </form>

      <section className="ui-card ui-card-pad" aria-label="Filtri" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "14px 16px" }}>
        <label className="ui-search">
          <Icon name="search" />
          <span className="ui-sr">Cerca</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca titolo, cliente, commessa…" />
        </label>
        <div className="ui-seg" role="group" aria-label="Stato">
          {([["open", "Aperti"], ["done", "Completati"], ["all", "Tutti"]] as [StatusFilter, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
        <select className="ui-select" value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} aria-label="Risorsa">
          <option value="">Tutte le risorse</option>
          <option value="none">Senza risorsa</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label style={{ fontSize: 13, color: "var(--muted)" }}>
          Raggruppa
          <select className="ui-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            {(Object.keys(GROUP_LABELS) as GroupBy[]).map((g) => <option key={g} value={g}>{GROUP_LABELS[g]}</option>)}
          </select>
        </label>
        <div className="ui-seg" role="group" aria-label="Vista" style={{ marginLeft: "auto" }}>
          <button aria-pressed={view === "list"} onClick={() => setView("list")}>Lista</button>
          <button aria-pressed={view === "board"} onClick={() => setView("board")}>Bacheca</button>
        </div>
      </section>

      {filtered.length === 0 && (
        <div className="ui-card ui-card-pad ui-muted" style={{ textAlign: "center", fontSize: 14, padding: 32 }}>
          {todos.length === 0 ? "Nessun to-do ancora: scrivine uno nella barra qui sopra." : "Nessun to-do corrisponde ai filtri."}
        </div>
      )}

      {view === "list" && groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        return (
          <section key={g.key} className="ui-card" style={{ overflow: "hidden" }} aria-label={g.label}>
            {groupBy !== "none" && (
              <button className="td-group-head" aria-expanded={!isCollapsed} onClick={() => toggleGroup(g.key)}>
                <span style={{ display: "inline-flex", transition: "transform .15s", transform: `rotate(${isCollapsed ? 0 : 90}deg)` }}><Icon name="right" strokeWidth={2} /></span>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>{g.label}</span>
                <span className="ui-pill" style={{ background: "#EBF0F6", color: "var(--ink-2)" }}>{g.items.length}</span>
              </button>
            )}
            {!isCollapsed && g.items.map((t) => {
              const c = clientColor(t.client || "");
              return (
                <div key={t.id} className={`td-row${t.completed ? " done" : ""}`} onClick={() => setEditing({ id: t.id, todo: { ...t } })} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") setEditing({ id: t.id, todo: { ...t } }); }}>
                  <Check t={t} />
                  <div style={{ minWidth: 0 }}>
                    <div className="td-title">{t.title}</div>
                    {t.description && <div className="ui-muted db-ellipsis" style={{ fontSize: 12.5 }}>{t.description}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
                    {t.commessa && <span className="ui-tag" style={{ background: c.bg, color: c.fg }}>{t.commessa}</span>}
                    {t.client && <span className="db-ellipsis" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{t.client}</span>}
                  </div>
                  <Person id={t.resourceId} />
                  <DueBadge t={t} />
                  <button className="ui-btn ghost danger" style={{ width: 32, height: 32, padding: 0 }} aria-label={`Elimina ${t.title}`} onClick={(e) => { e.stopPropagation(); void remove(t); }}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              );
            })}
          </section>
        );
      })}

      {view === "board" && filtered.length > 0 && (
        <div className="td-board">
          {groups.map((g) => (
            <section key={g.key} className="td-col" aria-label={g.label}>
              <div className="td-col-head">
                <span style={{ fontWeight: 600, fontSize: 14 }}>{g.label}</span>
                <span className="ui-pill" style={{ background: "#fff", color: "var(--ink-2)" }}>{g.items.length}</span>
              </div>
              {g.items.map((t) => {
                const c = clientColor(t.client || "");
                return (
                  <article key={t.id} className={`ui-card td-card${t.completed ? " done" : ""}`} onClick={() => setEditing({ id: t.id, todo: { ...t } })}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <Check t={t} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="td-title">{t.title}</div>
                        {t.description && <div className="ui-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{t.description}</div>}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      {t.commessa && <span className="ui-tag" style={{ background: c.bg, color: c.fg }}>{t.commessa}</span>}
                      {t.client && <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{t.client}</span>}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <Person id={t.resourceId} />
                      <DueBadge t={t} />
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {editing && (
        <TodoForm
          initial={editing.todo}
          isNew={!editing.id}
          members={members}
          jobs={budgets}
          onCancel={() => setEditing(null)}
          onSave={saveForm}
          onDelete={editing.id ? () => remove(editing.todo as TodoItem) : undefined}
        />
      )}

      {showCalendar && (
        <div className="ui-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCalendar(false); }}>
          <div className="ui-modal" role="dialog" aria-label="Calendario Outlook" style={{ width: "min(520px, 100%)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="ui-h2" style={{ fontSize: 17 }}>Iscriviti al calendario in Outlook</h2>
              <button className="ui-btn ghost icon" aria-label="Chiudi" onClick={() => setShowCalendar(false)}><Icon name="x" strokeWidth={2} /></button>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-2)" }}>
              <li>Copia il link della risorsa che ti interessa.</li>
              <li>In Outlook: Aggiungi calendario → Da Internet.</li>
              <li>Incolla il link: task (giornate intere) e to-do (alle 10:00) si aggiornano ogni 15–30 minuti.</li>
            </ol>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {members.map((m) => {
                const url = `${SUPABASE_URL}/functions/v1/calendar/${m.id}`;
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 10 }}>
                    <span className="ui-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(m.name)}</span>
                    <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>{m.name}</span>
                    <button className="ui-btn sm" onClick={async () => {
                      try { await navigator.clipboard.writeText(url); setCopied(m.id); window.setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 2000); }
                      catch { setError("Copia negli appunti non disponibile"); }
                    }}>
                      <Icon name={copied === m.id ? "check" : "link"} size={14} /> {copied === m.id ? "Copiato" : "Copia link"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TodoForm({ initial, isNew, members, jobs, onCancel, onSave, onDelete }: {
  initial: Partial<TodoItem>;
  isNew: boolean;
  members: Member[];
  jobs: Map<string, JobBudget> | null;
  onCancel: () => void;
  onSave: (d: Partial<TodoItem>) => Promise<void> | void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<Partial<TodoItem>>(initial);
  const [jobQuery, setJobQuery] = useState(initial.commessa || "");
  const [showJobs, setShowJobs] = useState(false);
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(() => {
    const term = norm(jobQuery.trim());
    if (!jobs || term.length < 2) return [];
    const out: JobBudget[] = [];
    for (const j of jobs.values()) {
      if ([j.jobNo, j.customer, j.description].some((v) => norm(v).includes(term))) out.push(j);
      if (out.length >= 8) break;
    }
    return out;
  }, [jobs, jobQuery]);

  const pick = (j: JobBudget) => {
    setD({ ...d, commessa: j.jobNo, client: j.customer || d.client, businessUnit: j.division || d.businessUnit });
    setJobQuery(j.jobNo);
    setShowJobs(false);
  };

  return (
    <div className="ui-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="ui-modal" style={{ width: "min(560px, 100%)" }} aria-label={isNew ? "Nuovo to-do" : "Modifica to-do"}
        onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onSave({ ...d, commessa: jobQuery.trim() || undefined }); setSaving(false); }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="ui-h2" style={{ fontSize: 17 }}>{isNew ? "Nuovo to-do" : "Modifica to-do"}</h2>
          <button type="button" className="ui-btn ghost icon" aria-label="Chiudi" onClick={onCancel}><Icon name="x" strokeWidth={2} /></button>
        </div>
        <label className="ui-field">Titolo
          <input required autoFocus value={d.title || ""} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Inviare report mensile al cliente" />
        </label>
        <label className="ui-field">Descrizione
          <textarea rows={3} value={d.description || ""} onChange={(e) => setD({ ...d, description: e.target.value })} className="ui-textarea" placeholder="Dettagli, link, note…" />
        </label>
        <div className="ui-field" style={{ position: "relative" }}>
          <label htmlFor="td-job" style={{ display: "block" }}>Commessa</label>
          <input id="td-job" value={jobQuery} autoComplete="off" onFocus={() => setShowJobs(true)} onBlur={() => window.setTimeout(() => setShowJobs(false), 150)}
            onChange={(e) => { setJobQuery(e.target.value); setShowJobs(true); }} placeholder={jobs ? "Cerca per numero, cliente o descrizione" : "Carico le commesse…"} />
          {showJobs && suggestions.length > 0 && (
            <div className="td-suggest" role="listbox">
              {suggestions.map((j) => (
                <button type="button" key={j.jobNo} role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(j)}>
                  <span className="ui-mono" style={{ fontWeight: 600, fontSize: 12.5 }}>{j.jobNo}</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{j.customer}</span>
                  <span className="ui-muted db-ellipsis" style={{ fontSize: 12 }}>{j.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ui-grid2">
          <label className="ui-field">Cliente
            <input value={d.client || ""} onChange={(e) => setD({ ...d, client: e.target.value })} placeholder="Compilato dalla commessa" />
          </label>
          <label className="ui-field">Business unit
            <input value={d.businessUnit || ""} onChange={(e) => setD({ ...d, businessUnit: e.target.value })} placeholder="Compilata dalla commessa" />
          </label>
        </div>
        <div className="ui-grid2">
          <label className="ui-field">Risorsa
            <select value={d.resourceId || ""} onChange={(e) => setD({ ...d, resourceId: e.target.value || undefined })}>
              <option value="">Nessuna</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="ui-field">Scadenza
            <input type="date" value={d.dueDate?.slice(0, 10) || ""} onChange={(e) => setD({ ...d, dueDate: e.target.value || undefined })} />
          </label>
        </div>
        {!isNew && (
          <button type="button" className="ui-btn" style={{ alignSelf: "flex-start" }} aria-pressed={!!d.completed} onClick={() => setD({ ...d, completed: !d.completed })}>
            <span className={`ui-checkbox${d.completed ? " on" : ""}`}>
              {d.completed && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
            </span>
            Completato
          </button>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {onDelete && <button type="button" className="ui-btn danger" onClick={onDelete}><Icon name="trash" size={15} /> Elimina</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={onCancel}>Annulla</button>
          <button type="submit" className="ui-btn primary" disabled={saving}>{saving ? "Salvataggio…" : isNew ? "Crea" : "Salva"}</button>
        </div>
      </form>
    </div>
  );
}
