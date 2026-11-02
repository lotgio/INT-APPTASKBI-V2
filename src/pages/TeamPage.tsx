import { useMemo, useState } from "react";
import { createMember, deleteMember, updateMember, updateTask } from "../api";
import type { Member, Task } from "../types";
import Icon from "../components/Icon";
import { computeMemberStats, fmtEuro, fmtNum, initials, isLeaveTask, loadLevel } from "../lib/planning";

type Group = "bi" | "crm" | "all";
type Draft = { name: string; role: string; group: "bi" | "crm" | ""; annualTarget: string };

interface Props {
  tasks: Task[];
  members: Member[];
  onMembersUpdate: (members: Member[]) => void;
  onTasksUpdate: (tasks: Task[]) => void;
}

const LEVEL_COLOR = { over: "#C02B0A", high: "#A85A00", ok: "#003DA6", low: "#53606C" } as const;
const emptyDraft: Draft = { name: "", role: "", group: "bi", annualTarget: "" };
const toDraft = (m: Member): Draft => ({ name: m.name, role: m.role || "", group: m.group || "", annualTarget: m.annualTarget ? String(m.annualTarget) : "" });
const fromDraft = (d: Draft): Partial<Member> => ({
  name: d.name.trim(),
  role: d.role.trim() || undefined,
  group: (d.group || undefined) as Member["group"],
  annualTarget: d.annualTarget ? Number(d.annualTarget.replace(/\./g, "").replace(",", ".")) || undefined : undefined
});

export default function TeamPage({ tasks, members, onMembersUpdate, onTasksUpdate }: Props) {
  const [group, setGroup] = useState<Group>("all");
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const month = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  }, []);
  const stats = useMemo(() => new Map(computeMemberStats(tasks, members, month).map((s) => [s.member.id, s])), [tasks, members, month]);
  const openByMember = useMemo(() => {
    const map = new Map<string, { count: number; hours: number }>();
    for (const t of tasks) {
      if (!t.assigneeId || isLeaveTask(t) || t.status === "done") continue;
      const cur = map.get(t.assigneeId) ?? { count: 0, hours: 0 };
      cur.count += 1;
      cur.hours += Number(t.hours) || 0;
      map.set(t.assigneeId, cur);
    }
    return map;
  }, [tasks]);
  const unassigned = useMemo(() => tasks.filter((t) => !t.assigneeId && !isLeaveTask(t) && t.status !== "done"), [tasks]);
  const visible = useMemo(
    () => members.filter((m) => group === "all" || m.group === group).sort((a, b) => a.name.localeCompare(b.name)),
    [members, group]
  );
  const counts = useMemo(() => ({
    all: members.length,
    bi: members.filter((m) => m.group === "bi").length,
    crm: members.filter((m) => m.group === "crm").length
  }), [members]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((c) => (c === msg ? null : c)), 2500);
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.draft.name.trim()) return setError("Inserisci il nome.");
    setSaving(true);
    setError(null);
    try {
      const payload = fromDraft(editing.draft);
      if (editing.id) {
        const saved = await updateMember(editing.id, payload);
        onMembersUpdate(members.map((m) => (m.id === editing.id ? { ...m, ...saved } : m)));
        flash("Membro aggiornato");
      } else {
        const created = await createMember(payload as Omit<Member, "id">);
        onMembersUpdate([...members, created]);
        flash(`${created.name} aggiunto al team`);
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: Member) => {
    const open = openByMember.get(m.id);
    const msg = open?.count
      ? `${m.name} ha ${open.count} task aperti (${fmtNum(open.hours)} h). Eliminandolo resteranno senza assegnatario. Procedere?`
      : `Eliminare ${m.name} dal team?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteMember(m.id);
      onMembersUpdate(members.filter((x) => x.id !== m.id));
      flash(`${m.name} eliminato`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione");
    }
  };

  const assign = async (task: Task, memberId: string) => {
    if (!memberId) return;
    try {
      const saved = await updateTask(task.id, { assigneeId: memberId });
      onTasksUpdate(tasks.map((t) => (t.id === task.id ? { ...t, ...saved } : t)));
      flash(`Task assegnato a ${members.find((m) => m.id === memberId)?.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore assegnazione");
    }
  };

  return (
    <div className="ui-page">
      <header className="ui-header">
        <div>
          <div className="ui-eyebrow">Analisi · {members.length} persone</div>
          <h1 className="ui-title">Team</h1>
        </div>
        <div className="ui-row">
          <div className="ui-seg" role="group" aria-label="Gruppo">
            {(["all", "bi", "crm"] as Group[]).map((g) => (
              <button key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>
                {g === "all" ? "Tutti" : g.toUpperCase()} <span className="ui-muted ui-num">{counts[g]}</span>
              </button>
            ))}
          </div>
          <button className="ui-btn primary" onClick={() => { setError(null); setEditing({ id: null, draft: { ...emptyDraft } }); }}>
            <Icon name="plus" strokeWidth={2} /> Nuovo membro
          </button>
        </div>
      </header>

      {error && <div className="ui-alert error" role="alert">{error}<button className="ui-btn sm ghost" onClick={() => setError(null)}>Chiudi</button></div>}
      {notice && <div className="ui-alert success" role="status">{notice}</div>}

      <div className="tm-grid">
        {visible.map((m) => {
          const s = stats.get(m.id);
          const pct = s?.percentage ?? 0;
          const l = loadLevel(pct);
          const open = openByMember.get(m.id);
          return (
            <article key={m.id} className="ui-card ui-card-pad tm-card">
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div className="ui-avatar" style={{ width: 42, height: 42, fontSize: 14 }}>{initials(m.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{m.name}</div>
                  <div className="ui-muted" style={{ fontSize: 12.5 }}>{m.role || "Ruolo non indicato"}</div>
                </div>
                {m.group && <span className="ui-pill" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{m.group.toUpperCase()}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }} className="ui-num">
                  <span className="ui-muted">Carico {month.toLocaleDateString("it-IT", { month: "long" })}</span>
                  <span style={{ fontWeight: 600, color: LEVEL_COLOR[l] }}>{Math.round(pct)}%</span>
                </div>
                <div className="ui-track"><div className="ui-fill" style={{ width: `${Math.min(pct, 100)}%`, background: LEVEL_COLOR[l] }} /></div>
              </div>
              <div className="tm-facts">
                <div><span className="ui-muted">Task aperti</span><strong className="ui-num">{open?.count ?? 0} · {fmtNum(open?.hours ?? 0)} h</strong></div>
                <div><span className="ui-muted">Obiettivo annuo</span><strong className="ui-num">{m.annualTarget ? fmtEuro(m.annualTarget) : "—"}</strong></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="ui-btn sm" style={{ flex: 1 }} onClick={() => { setError(null); setEditing({ id: m.id, draft: toDraft(m) }); }}><Icon name="edit" size={14} /> Modifica</button>
                <button className="ui-btn sm danger" aria-label={`Elimina ${m.name}`} onClick={() => remove(m)}><Icon name="trash" size={14} /></button>
              </div>
            </article>
          );
        })}
        {visible.length === 0 && <div className="ui-card ui-card-pad ui-muted" style={{ fontSize: 13.5 }}>Nessun membro in questo gruppo.</div>}
      </div>

      <section className="ui-card" aria-label="Task senza assegnatario" style={{ overflow: "hidden" }}>
        <div className="ui-card-head">
          <h2 className="ui-h2">Task senza assegnatario</h2>
          <span className="ui-muted ui-num" style={{ fontSize: 12.5 }}>{unassigned.length} · {fmtNum(unassigned.reduce((s, t) => s + (Number(t.hours) || 0), 0))} h</span>
        </div>
        {unassigned.length === 0 && <div className="ui-muted" style={{ padding: "14px 16px", fontSize: 13.5 }}>Tutti i task aperti hanno un assegnatario.</div>}
        {unassigned.map((t) => (
          <div key={t.id} className="tm-task">
            <span className="ui-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{t.commessa || "—"}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.description}</div>
              <div className="ui-muted" style={{ fontSize: 12.5 }}>{t.client || "—"}</div>
            </div>
            <span className="ui-num" style={{ fontWeight: 600, fontSize: 13.5 }}>{fmtNum(Number(t.hours) || 0)} h</span>
            <select className="ui-select sm" defaultValue="" aria-label={`Assegna ${t.description}`} onChange={(e) => assign(t, e.target.value)}>
              <option value="" disabled>Assegna a…</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        ))}
      </section>

      {editing && (
        <div className="ui-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <form className="ui-modal" onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label={editing.id ? "Modifica membro" : "Nuovo membro"}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="ui-h2" style={{ fontSize: 17 }}>{editing.id ? "Modifica membro" : "Nuovo membro"}</h2>
              <button type="button" className="ui-btn ghost icon" aria-label="Chiudi" onClick={() => setEditing(null)}><Icon name="x" strokeWidth={2} /></button>
            </div>
            <label className="ui-field">Nome e cognome
              <input required value={editing.draft.name} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })} placeholder="Mario Rossi" />
            </label>
            <label className="ui-field">Ruolo
              <input value={editing.draft.role} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, role: e.target.value } })} placeholder="Consulente BI" />
            </label>
            <div className="ui-grid2">
              <div className="ui-field">Gruppo
                <div className="ui-seg" role="group" aria-label="Gruppo del membro" style={{ display: "flex" }}>
                  {(["bi", "crm", ""] as const).map((g) => (
                    <button type="button" key={g || "none"} aria-pressed={editing.draft.group === g} onClick={() => setEditing({ ...editing, draft: { ...editing.draft, group: g } })}>
                      {g ? g.toUpperCase() : "Nessuno"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="ui-field">Obiettivo annuo (€)
                <input inputMode="numeric" value={editing.draft.annualTarget} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, annualTarget: e.target.value } })} placeholder="120000" />
              </label>
            </div>
            <span className="ui-muted" style={{ fontSize: 12.5 }}>L'obiettivo annuo viene ripartito sui mesi in base ai giorni lavorativi.</span>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="ui-btn" onClick={() => setEditing(null)}>Annulla</button>
              <button type="submit" className="ui-btn primary" disabled={saving}>{saving ? "Salvataggio…" : "Salva"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
