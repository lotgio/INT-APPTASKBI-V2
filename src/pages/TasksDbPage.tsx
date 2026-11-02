import { useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { deleteTask, updateTask } from "../api";
import type { Member, Task, TaskStatus } from "../types";
import TaskDetailModal from "../TaskDetailModal";
import Icon from "../components/Icon";
import { clientColor, fmtNum, isLeaveTask, isScheduled, parseDate } from "../lib/planning";

type SortKey = "commessa" | "client" | "description" | "hours" | "start" | "assignee" | "status";
type Planned = "all" | "scheduled" | "unscheduled";
type StatusFilter = "open" | TaskStatus | "all";

interface Props {
  tasks: Task[];
  members: Member[];
  onTasksUpdate: (tasks: Task[]) => void;
}

const STATUS: Record<TaskStatus, { label: string; bg: string; fg: string }> = {
  todo: { label: "Da fare", bg: "#E4EBF3", fg: "#3D4B57" },
  "in-progress": { label: "In corso", bg: "#E1EAF8", fg: "#002F80" },
  done: { label: "Completato", bg: "#E2F4EC", fg: "#0B6146" }
};
const STEP = 200;
const fmtDay = (key?: string) => (key ? parseDate(key).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

export default function TasksDbPage({ tasks, members, onTasksUpdate }: Props) {
  const [q, setQ] = useState("");
  const [memberId, setMemberId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [planned, setPlanned] = useState<Planned>("all");
  const [showLeave, setShowLeave] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "start", dir: -1 });
  const [limit, setLimit] = useState(STEP);
  const [editing, setEditing] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nameOf = (t: Task) => (t.assigneeId ? memberById.get(t.assigneeId)?.name ?? "—" : "Non assegnato");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = tasks.filter((t) => {
      if (!showLeave && isLeaveTask(t)) return false;
      if (memberId === "none" ? !!t.assigneeId : memberId && t.assigneeId !== memberId) return false;
      if (status === "open" ? t.status === "done" : status !== "all" && t.status !== status) return false;
      if (planned === "scheduled" && !isScheduled(t)) return false;
      if (planned === "unscheduled" && isScheduled(t)) return false;
      if (term && ![t.commessa, t.client, t.description, nameOf(t)].some((v) => String(v || "").toLowerCase().includes(term))) return false;
      return true;
    });
    const val = (t: Task): string | number => {
      switch (sort.key) {
        case "hours": return Number(t.hours) || 0;
        case "start": return t.startDate || "";
        case "assignee": return nameOf(t);
        case "status": return t.status;
        default: return String(t[sort.key] || "").toLowerCase();
      }
    };
    return rows.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (sort.key === "start") {
        if (!va && vb) return 1;
        if (va && !vb) return -1;
      }
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, q, memberId, status, planned, showLeave, sort, memberById]);

  const totals = useMemo(() => ({
    hours: filtered.reduce((s, t) => s + (Number(t.hours) || 0), 0),
    unscheduled: filtered.filter((t) => !isScheduled(t)).length,
    unassigned: filtered.filter((t) => !t.assigneeId).length
  }), [filtered]);

  const setSortKey = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "hours" || key === "start" ? -1 : 1 }));
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "");

  const changeStatus = async (t: Task, s: TaskStatus) => {
    const before = tasks;
    onTasksUpdate(tasks.map((x) => (x.id === t.id ? { ...x, status: s } : x)));
    try {
      await updateTask(t.id, { status: s });
    } catch (err) {
      onTasksUpdate(before);
      setError(err instanceof Error ? err.message : "Errore aggiornamento");
    }
  };
  const remove = async (t: Task) => {
    if (!window.confirm(`Eliminare il task "${t.description}"?`)) return;
    try {
      await deleteTask(t.id);
      onTasksUpdate(tasks.filter((x) => x.id !== t.id));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione");
    }
  };
  const saveEdit = async (updated: Task) => {
    try {
      const saved = await updateTask(updated.id, updated);
      onTasksUpdate(tasks.map((x) => (x.id === updated.id ? { ...x, ...saved } : x)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio");
    }
  };
  const exportExcel = () => {
    const data = [
      ["Commessa", "Cliente", "Descrizione", "Ore", "Inizio", "Fine", "Assegnatario", "Stato"],
      ...filtered.map((t) => [t.commessa, t.client, t.description, Number(t.hours) || 0, t.startDate || "", t.endDate || "", nameOf(t), STATUS[t.status]?.label ?? t.status])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [14, 28, 44, 8, 12, 12, 22, 14].map((wch) => ({ wch }));
    for (let c = 0; c < 8; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: "043153" } } };
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Task");
    XLSX.writeFile(wb, `task_${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
  };

  const shown = filtered.slice(0, limit);

  return (
    <div className="ui-page">
      <header className="ui-header">
        <div>
          <div className="ui-eyebrow">Analisi · {tasks.length} task in archivio</div>
          <h1 className="ui-title">Database task</h1>
        </div>
        <button className="ui-btn" onClick={exportExcel}><Icon name="download" /> Esporta Excel</button>
      </header>

      {error && <div className="ui-alert error" role="alert">{error}<button className="ui-btn sm ghost" onClick={() => setError(null)}>Chiudi</button></div>}

      <section className="ui-card ui-card-pad" aria-label="Filtri" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "14px 16px" }}>
        <label className="ui-search">
          <Icon name="search" />
          <span className="ui-sr">Cerca</span>
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(STEP); }} placeholder="Cerca commessa, cliente, descrizione o persona…" />
        </label>
        <select className="ui-select" value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Assegnatario">
          <option value="">Tutte le persone</option>
          <option value="none">Non assegnati</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="ui-seg" role="group" aria-label="Stato">
          {([["open", "Aperti"], ["todo", "Da fare"], ["in-progress", "In corso"], ["done", "Completati"], ["all", "Tutti"]] as [StatusFilter, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
        <div className="ui-seg" role="group" aria-label="Pianificazione">
          {([["all", "Tutti"], ["scheduled", "In calendario"], ["unscheduled", "Da schedulare"]] as [Planned, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={planned === k} onClick={() => setPlanned(k)}>{l}</button>
          ))}
        </div>
        <button className="ui-btn" aria-pressed={showLeave} onClick={() => setShowLeave((v) => !v)}>
          <span className={`ui-checkbox${showLeave ? " on" : ""}`}>
            {showLeave && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
          </span>
          Mostra ferie
        </button>
      </section>

      <section className="ui-card" aria-label="Elenco task" style={{ overflow: "hidden" }}>
        <div className="ui-card-head">
          <h2 className="ui-h2">{filtered.length} task · {fmtNum(totals.hours)} h</h2>
          <span className="ui-muted" style={{ fontSize: 12.5 }}>{totals.unscheduled} da schedulare · {totals.unassigned} senza assegnatario</span>
        </div>
        <div className="cal-scroll">
          <div style={{ minWidth: 1040 }}>
            <div className="db-grid db-head">
              <button onClick={() => setSortKey("commessa")}>Commessa{sortMark("commessa")}</button>
              <button onClick={() => setSortKey("client")}>Cliente{sortMark("client")}</button>
              <button onClick={() => setSortKey("description")}>Descrizione{sortMark("description")}</button>
              <button onClick={() => setSortKey("hours")} style={{ justifyContent: "flex-end" }}>Ore{sortMark("hours")}</button>
              <button onClick={() => setSortKey("start")}>Periodo{sortMark("start")}</button>
              <button onClick={() => setSortKey("assignee")}>Assegnatario{sortMark("assignee")}</button>
              <button onClick={() => setSortKey("status")}>Stato{sortMark("status")}</button>
              <span />
            </div>
            {shown.length === 0 && <div className="ui-muted" style={{ padding: "32px 16px", textAlign: "center", fontSize: 14 }}>Nessun task corrisponde ai filtri.</div>}
            {shown.map((t) => {
              const c = clientColor(t.client);
              const leave = isLeaveTask(t);
              return (
                <div key={t.id} className="db-grid db-row">
                  <span className={`ui-tag${leave ? " ui-hatch" : ""}`} style={{ background: leave ? undefined : c.bg, color: leave ? "var(--ink-2)" : c.fg, justifySelf: "start" }}>{t.commessa || "—"}</span>
                  <span className="db-ellipsis" title={t.client}>{t.client || "—"}</span>
                  <span className="db-ellipsis" title={t.description} style={{ fontWeight: 500 }}>{t.description}</span>
                  <span className="ui-num" style={{ textAlign: "right", fontWeight: 600 }}>{fmtNum(Number(t.hours) || 0)} h</span>
                  <span className="ui-num" style={{ fontSize: 12.5, color: isScheduled(t) ? "var(--ink-2)" : "var(--muted)" }}>
                    {isScheduled(t) ? (t.startDate === t.endDate ? fmtDay(t.startDate) : `${fmtDay(t.startDate)} → ${fmtDay(t.endDate)}`) : "da schedulare"}
                  </span>
                  <span className="db-ellipsis" style={{ color: t.assigneeId ? undefined : "var(--muted)" }}>{nameOf(t)}</span>
                  <select className="ui-select sm db-status" value={t.status} onChange={(e) => changeStatus(t, e.target.value as TaskStatus)}
                    aria-label={`Stato di ${t.description}`} style={{ background: STATUS[t.status]?.bg, color: STATUS[t.status]?.fg }}>
                    {(Object.keys(STATUS) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
                  </select>
                  <div className="ui-row" style={{ gap: 4, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <button className="ui-btn ghost" style={{ width: 32, height: 32, padding: 0 }} aria-label={`Modifica ${t.description}`} onClick={() => setEditing(t)}><Icon name="edit" size={15} /></button>
                    <button className="ui-btn ghost danger" style={{ width: 32, height: 32, padding: 0 }} aria-label={`Elimina ${t.description}`} onClick={() => remove(t)}><Icon name="trash" size={15} /></button>
                  </div>
                </div>
              );
            })}
            {filtered.length > shown.length && (
              <div style={{ padding: 16, display: "flex", justifyContent: "center" }}>
                <button className="ui-btn" onClick={() => setLimit((n) => n + STEP)}>Mostra altri ({filtered.length - shown.length} rimanenti)</button>
              </div>
            )}
          </div>
        </div>
      </section>

      {editing && (
        <TaskDetailModal task={editing} members={members} onSave={saveEdit} onDelete={(t) => remove(t)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
