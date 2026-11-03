import { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { createTask, deleteTask, updateTask } from "../api";
import type { Member, Task, TaskStatus } from "../types";
import TaskDetailModal from "../TaskDetailModal";
import TaskCreateModal from "../TaskCreateModal";
import Icon, { GripIcon } from "../components/Icon";
import { computeJobPlanning, normalizeJobNo, useJobBudgets, type JobPlanning } from "../lib/jobBudgets";
import {
  HOURS_PER_DAY,
  addDays,
  clientColor,
  computeMemberStats,
  diffDays,
  fmtEuro,
  fmtNum,
  formatDate,
  initials,
  isLeaveTask,
  isScheduled,
  isWorkingDay,
  loadLabels,
  loadLevel,
  monthBounds,
  parseDate,
  getWorkingDays
} from "../lib/planning";

type Group = "bi" | "crm" | "all";
type View = "timeline" | "month";
type DragMode = "move" | "start" | "end";
type DragState = { taskId: string; mode: DragMode; origin: "timeline" | "month" | "sidebar"; grabKey?: string };

interface Props {
  tasks: Task[];
  members: Member[];
  onTasksUpdate: (tasks: Task[]) => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = { todo: "Da fare", "in-progress": "In corso", done: "Completato" };
const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const LEVEL_COLOR = { over: "#C02B0A", high: "#A85A00", ok: "#003DA6", low: "#53606C" } as const;

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function shortRange(startKey: string, endKey: string): string {
  const s = parseDate(startKey);
  const e = parseDate(endKey);
  const m = (d: Date) => d.toLocaleDateString("it-IT", { month: "short" });
  if (startKey === endKey) return `${s.getDate()} ${m(s)}`;
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${m(e)}`;
  return `${s.getDate()} ${m(s)} – ${e.getDate()} ${m(e)}`;
}

function countWorkingDays(startKey: string, endKey: string): number {
  let n = 0;
  let cur = parseDate(startKey);
  const end = parseDate(endKey);
  for (let guard = 0; cur <= end && guard < 800; guard++) {
    if (isWorkingDay(cur)) n++;
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return n;
}

export default function CalendarPage({ tasks, members, onTasksUpdate }: Props) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [group, setGroup] = useState<Group>("bi");
  const [view, setView] = useState<View>("timeline");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const todayKey = formatDate(new Date());
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const monthStartKey = formatDate(monthStart);
  const monthEndKey = formatDate(monthEnd);
  const monthLabel = month.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const workingDays = useMemo(() => getWorkingDays(month), [month]);
  const dayKeys = useMemo(() => workingDays.map(formatDate), [workingDays]);

  const visibleMembers = useMemo(
    () => (group === "all" ? members : members.filter((m) => m.group === group)),
    [members, group]
  );
  const visibleIds = useMemo(() => new Set(visibleMembers.map((m) => m.id)), [visibleMembers]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const stats = useMemo(() => computeMemberStats(tasks, visibleMembers, month), [tasks, visibleMembers, month]);
  const statById = useMemo(() => new Map(stats.map((s) => [s.member.id, s])), [stats]);

  const totals = useMemo(() => {
    const work = stats.reduce((s, x) => s + x.workHours, 0);
    const leave = stats.reduce((s, x) => s + x.leaveHours, 0);
    const avail = stats.reduce((s, x) => s + x.effectiveAvailableHours, 0);
    const value = stats.reduce((s, x) => s + x.economicValue, 0);
    const target = stats.reduce((s, x) => s + x.monthlyTarget, 0);
    return { work, leave, avail, value, target, pct: avail > 0 ? (work / avail) * 100 : 0 };
  }, [stats]);

  const monthTasks = useMemo(
    () => tasks.filter((t) => isScheduled(t) && t.startDate <= monthEndKey && t.endDate >= monthStartKey),
    [tasks, monthStartKey, monthEndKey]
  );

  const unscheduled = useMemo(
    () =>
      tasks.filter(
        (t) => !isScheduled(t) && !isLeaveTask(t) && (!t.assigneeId || visibleIds.has(t.assigneeId) || group === "all")
      ),
    [tasks, visibleIds, group]
  );
  const unscheduledHours = unscheduled.reduce((s, t) => s + (Number(t.hours) || 0), 0);

  const leaves = useMemo(
    () =>
      monthTasks
        .filter((t) => isLeaveTask(t) && t.assigneeId && visibleIds.has(t.assigneeId))
        .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1)),
    [monthTasks, visibleIds]
  );
  const leaveDays = totals.leave / HOURS_PER_DAY;

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null;

  // Collegamento con le commesse: venduto, loggato e ore nei task aperti
  const { budgets, error: budgetsError } = useJobBudgets();
  const jobPlanning = useMemo(() => computeJobPlanning(budgets, tasks), [budgets, tasks]);
  const jobOf = (t: Task) => jobPlanning.get(normalizeJobNo(t.commessa));

  // ---------- Timeline: posizionamento barre e corsie ----------
  const weeks = useMemo(() => {
    const out: { label: string; start: number; len: number }[] = [];
    workingDays.forEach((d, i) => {
      const wk = isoWeek(d);
      const last = out[out.length - 1];
      if (last && (last as any).wk === wk) {
        last.len++;
      } else {
        out.push(Object.assign({ label: "", start: i, len: 1 }, { wk }));
      }
    });
    return out.map((w: any) => {
      const s = workingDays[w.start];
      const e = workingDays[w.start + w.len - 1];
      const range = s.getDate() === e.getDate() ? `${s.getDate()}` : `${s.getDate()}–${e.getDate()}`;
      return { ...w, short: w.len < 3, label: w.len >= 3 ? `Sett. ${w.wk} · ${range}` : `S${w.wk}` };
    });
  }, [workingDays]);
  const weekStartIdx = useMemo(() => new Set(weeks.map((w) => w.start)), [weeks]);

  const rows = useMemo(() => {
    return visibleMembers.map((member) => {
      const own = monthTasks.filter((t) => t.assigneeId === member.id);
      const placed = own
        .map((t) => {
          let first = dayKeys.findIndex((k) => k >= t.startDate!);
          let last = -1;
          for (let i = dayKeys.length - 1; i >= 0; i--) {
            if (dayKeys[i] <= t.endDate!) { last = i; break; }
          }
          if (first === -1) first = dayKeys.length - 1;
          if (last === -1) last = 0;
          if (last < first) last = first;
          return {
            task: t,
            first,
            last,
            clipL: t.startDate! < monthStartKey,
            clipR: t.endDate! > monthEndKey,
            lane: 0
          };
        })
        .sort((a, b) => a.first - b.first || b.last - a.last);
      const laneEnds: number[] = [];
      placed.forEach((p) => {
        let lane = laneEnds.findIndex((end) => end < p.first);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(p.last); } else laneEnds[lane] = p.last;
        p.lane = lane;
      });
      return { member, bars: placed, lanes: Math.max(1, laneEnds.length) };
    });
  }, [visibleMembers, monthTasks, dayKeys, monthStartKey, monthEndKey]);

  const legendClients = useMemo(() => {
    const set = new Set<string>();
    monthTasks.forEach((t) => {
      if (!isLeaveTask(t) && t.assigneeId && visibleIds.has(t.assigneeId) && t.client) set.add(t.client);
    });
    return Array.from(set).slice(0, 10);
  }, [monthTasks, visibleIds]);

  // ---------- Vista mese ----------
  const monthCells = useMemo(() => {
    const offset = (monthStart.getDay() + 6) % 7;
    const total = Math.ceil((offset + monthEnd.getDate()) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const date = new Date(month.getFullYear(), month.getMonth(), i - offset + 1);
      const key = formatDate(date);
      const inMonth = date.getMonth() === month.getMonth();
      const dayTasks = tasks.filter(
        (t) =>
          isScheduled(t) &&
          t.startDate <= key &&
          t.endDate >= key &&
          (!t.assigneeId || visibleIds.has(t.assigneeId))
      );
      return { date, key, inMonth, off: !isWorkingDay(date), tasks: dayTasks };
    });
  }, [tasks, month, monthStart, monthEnd, visibleIds]);

  // ---------- Aggiornamenti ----------
  const applyUpdate = async (id: string, patch: Partial<Task>, okMessage?: string) => {
    const before = tasks;
    const optimistic = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
    onTasksUpdate(optimistic);
    setError(null);
    try {
      const saved = await updateTask(id, patch);
      onTasksUpdate(optimistic.map((t) => (t.id === id ? { ...t, ...saved } : t)));
      if (okMessage) flash(okMessage);
    } catch (err) {
      onTasksUpdate(before);
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    }
  };

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 2500);
  };

  const handleDrop = (dateKey: string, memberId?: string) => {
    const d = drag;
    setDrag(null);
    setDropKey(null);
    if (!d) return;
    const task = tasks.find((t) => t.id === d.taskId);
    if (!task) return;
    const patch: Partial<Task> = {};
    if (d.origin === "sidebar" || !isScheduled(task)) {
      patch.startDate = dateKey;
      patch.endDate = dateKey;
      if (memberId) patch.assigneeId = memberId;
    } else if (d.mode === "start") {
      if (dateKey > task.endDate) { patch.startDate = task.endDate; patch.endDate = dateKey; } else patch.startDate = dateKey;
    } else if (d.mode === "end") {
      if (dateKey < task.startDate) { patch.endDate = task.startDate; patch.startDate = dateKey; } else patch.endDate = dateKey;
    } else {
      const anchor = d.grabKey ?? task.startDate;
      const shift = diffDays(anchor, dateKey);
      if (shift !== 0) {
        patch.startDate = addDays(task.startDate, shift);
        patch.endDate = addDays(task.endDate, shift);
      }
      if (memberId && memberId !== task.assigneeId && !isLeaveTask(task)) patch.assigneeId = memberId;
    }
    if (Object.keys(patch).length === 0) return;
    const who = patch.assigneeId ? memberById.get(patch.assigneeId)?.name : undefined;
    void applyUpdate(task.id, patch, who ? `Task assegnato a ${who}` : "Task aggiornato");
    setSelectedId(task.id);
  };

  const startDrag = (e: React.DragEvent, state: DragState) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", state.taskId);
    setDrag(state);
  };

  const grabKeyFromEvent = (e: React.DragEvent, first: number, last: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const span = last - first + 1;
    const col = Math.min(span - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * span)));
    return dayKeys[first + col];
  };

  const handleDelete = async (task: Task) => {
    const msg = isLeaveTask(task) ? "Vuoi eliminare questa assenza?" : `Vuoi eliminare il task "${task.description}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteTask(task.id);
      onTasksUpdate(tasks.filter((t) => t.id !== task.id));
      setSelectedId(null);
      setEditingTask(null);
      flash(isLeaveTask(task) ? "Assenza eliminata" : "Task eliminato");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione");
    }
  };

  const handleModalSave = async (updated: Task) => {
    try {
      const saved = await updateTask(updated.id, updated);
      onTasksUpdate(tasks.map((t) => (t.id === updated.id ? saved : t)));
      setEditingTask(null);
      flash("Task salvato");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio");
    }
  };

  const copyResourceLink = async (memberId: string) => {
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.set("view", "resource");
    url.searchParams.set("memberId", memberId);
    url.searchParams.set("start", monthStartKey);
    url.searchParams.set("end", monthEndKey);
    url.searchParams.set("public", "1");
    try {
      await navigator.clipboard.writeText(url.toString());
      flash("Link della vista risorsa copiato");
    } catch {
      setError("Copia negli appunti non disponibile");
    }
  };

  const exportPdf = async () => {
    if (!calendarRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(calendarRef.current, { scale: 2, backgroundColor: "#ffffff", logging: false });
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const w = pdf.internal.pageSize.getWidth() - 20;
      const pageH = pdf.internal.pageSize.getHeight() - 30;
      const h = (canvas.height * w) / canvas.width;
      const img = canvas.toDataURL("image/png");
      pdf.setFontSize(15);
      pdf.text(`Calendario risorse – ${monthLabel} – ${group === "all" ? "Tutti" : group.toUpperCase()}`, 10, 12);
      pdf.setFontSize(9);
      pdf.text(
        `Occupazione ${Math.round(totals.pct)}% · Valore ${fmtEuro(totals.value)} · Esportato il ${new Date().toLocaleString("it-IT")}`,
        10,
        18
      );
      const pages = Math.max(1, Math.ceil(h / pageH));
      for (let p = 0; p < pages; p++) {
        if (p > 0) pdf.addPage();
        pdf.addImage(img, "PNG", 10, 22 - p * pageH, w, h);
      }
      pdf.save(`calendario-${monthStartKey.slice(0, 7)}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore esportazione PDF");
    } finally {
      setExporting(false);
    }
  };

  const gridCols = `200px repeat(${dayKeys.length}, minmax(28px, 1fr))`;
  const levelColor = (pct: number) => LEVEL_COLOR[loadLevel(pct)];

  return (
    <div className="ui-page">
      <header className="ui-header">
        <div>
          <div className="ui-eyebrow">Pianificazione · Team {group === "all" ? "BI + CRM" : group.toUpperCase()}</div>
          <h1 className="ui-title">Calendario risorse</h1>
        </div>
        <div className="ui-row">
          <button className="ui-btn" onClick={exportPdf} disabled={exporting}>
            <Icon name="download" /> {exporting ? "Esportazione…" : "Esporta PDF"}
          </button>
          <button className="ui-btn" onClick={() => setShowLeave(true)}>
            <Icon name="leave" /> Registra assenza
          </button>
          <button className="ui-btn primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" strokeWidth={2} /> Nuovo task
          </button>
        </div>
      </header>

      {error && (
        <div className="ui-alert error" role="alert">
          {error}
          <button className="ui-btn sm ghost" onClick={() => setError(null)}>Chiudi</button>
        </div>
      )}
      {notice && <div className="ui-alert success" role="status">{notice}</div>}

      <section className="ui-kpis" aria-label="Indicatori del mese">
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Occupazione netta</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value">{Math.round(totals.pct)}%</span>
            <span className="ui-kpi-sub">{fmtNum(totals.work, 0)} di {fmtNum(totals.avail, 0)} h disponibili</span>
          </div>
          <div className="ui-track"><div className="ui-fill" style={{ width: `${Math.min(totals.pct, 100)}%`, background: levelColor(totals.pct) }} /></div>
        </div>
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Valore pianificato</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value">{fmtEuro(totals.value)}</span>
            <span className="ui-kpi-sub">{totals.target > 0 ? `target ${fmtEuro(totals.target)}` : "nessun target impostato"}</span>
          </div>
          <div className="ui-track">
            <div className="ui-fill" style={{ width: `${totals.target > 0 ? Math.min((totals.value / totals.target) * 100, 100) : 0}%`, background: "#0F8A5F" }} />
          </div>
        </div>
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Ferie e assenze</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value">{fmtNum(leaveDays)} gg</span>
            <span className="ui-kpi-sub">{fmtNum(totals.leave)} h</span>
          </div>
          <span className="ui-kpi-sub">Già scalate dalla disponibilità</span>
        </div>
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Da schedulare</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value">{unscheduled.length}</span>
            <span className="ui-kpi-sub">{fmtNum(unscheduledHours)} h totali</span>
          </div>
          <span className="ui-kpi-sub">Trascinali sul calendario</span>
        </div>
      </section>

      <div className="ui-row" style={{ justifyContent: "space-between" }}>
        <div className="ui-row" style={{ gap: 6 }}>
          <button className="ui-btn icon" aria-label="Mese precedente" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <Icon name="left" strokeWidth={2} />
          </button>
          <span style={{ fontSize: 17, fontWeight: 600, minWidth: 160, textAlign: "center", textTransform: "capitalize" }}>{monthLabel}</span>
          <button className="ui-btn icon" aria-label="Mese successivo" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <Icon name="right" strokeWidth={2} />
          </button>
          <button className="ui-btn" onClick={() => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Oggi</button>
        </div>
        <div className="ui-row">
          <div className="ui-seg" role="group" aria-label="Gruppo">
            {(["bi", "crm", "all"] as Group[]).map((g) => (
              <button key={g} aria-pressed={group === g} onClick={() => { setGroup(g); setSelectedId(null); }}>
                {g === "all" ? "Tutti" : g.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="ui-seg" role="group" aria-label="Vista">
            <button aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>Timeline</button>
            <button aria-pressed={view === "month"} onClick={() => setView("month")}>Mese</button>
          </div>
        </div>
      </div>

      <div className="cal-body">
        <div className="cal-main">
          <section className="ui-card" ref={calendarRef} style={{ overflow: "hidden" }} aria-label={view === "timeline" ? "Timeline per risorsa" : "Calendario mensile"}>
            {view === "timeline" ? (
              <>
                <div className="cal-scroll">
                  <div style={{ minWidth: 200 + dayKeys.length * 28 }}>
                    <div className="tl-grid" style={{ gridTemplateColumns: gridCols, background: "#F8FAFD", borderBottom: "1px solid var(--line-soft)" }}>
                      <div className="tl-namecol" style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "var(--muted)", background: "#F8FAFD" }}>
                        Risorsa · carico mese
                      </div>
                      {weeks.map((w) => (
                        <div key={w.start} className={`tl-week${w.short ? " short" : ""}`} title={`Settimana ${w.wk}`} style={{ gridColumn: `${w.start + 2} / span ${w.len}` }}>{w.label}</div>
                      ))}
                    </div>
                    <div className="tl-grid" style={{ gridTemplateColumns: gridCols, borderBottom: "1px solid var(--line)" }}>
                      <div className="tl-namecol" />
                      {workingDays.map((d, i) => (
                        <div key={dayKeys[i]} className={`tl-day${weekStartIdx.has(i) ? " week-start" : ""}${dayKeys[i] === todayKey ? " today" : ""}`} style={{ gridColumn: i + 2 }}>
                          <span className="tl-day-wd">{WEEKDAYS_SHORT[d.getDay()]}</span>
                          <span className="tl-day-num ui-num">{d.getDate()}</span>
                        </div>
                      ))}
                    </div>

                    {rows.length === 0 && (
                      <div style={{ padding: 32, textAlign: "center" }} className="ui-muted">Nessuna risorsa in questo gruppo.</div>
                    )}

                    {rows.map(({ member, bars, lanes }) => {
                      const st = statById.get(member.id);
                      const pct = st?.percentage ?? 0;
                      const lvl = loadLevel(pct);
                      const rowDrop = dropKey?.startsWith(member.id + "|");
                      return (
                        <div
                          key={member.id}
                          className={`tl-grid tl-row${rowDrop ? " drop-row" : ""}`}
                          style={{ gridTemplateColumns: gridCols, gridTemplateRows: `repeat(${lanes}, minmax(58px, auto))` }}
                        >
                          <div className="tl-namecol tl-name" style={{ gridRow: `1 / span ${lanes}` }}>
                            <div className="ui-avatar">{initials(member.name)}</div>
                            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                                <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={member.name}>{member.name}</span>
                                <span className="ui-num" style={{ fontSize: 12.5, fontWeight: 600, color: LEVEL_COLOR[lvl] }}>{Math.round(pct)}%</span>
                              </div>
                              <div className="ui-track thin"><div className="ui-fill" style={{ width: `${Math.min(pct, 100)}%`, background: LEVEL_COLOR[lvl] }} /></div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}
                                  title={`${fmtNum(st?.workHours ?? 0)} h pianificate su ${fmtNum(st?.effectiveAvailableHours ?? 0)} disponibili (${loadLabels[lvl]})${st?.leaveHours ? ` · ${fmtNum(st.leaveHours)} h di ferie` : ""}`}>
                                  {fmtNum(st?.workHours ?? 0, 0)} / {fmtNum(st?.effectiveAvailableHours ?? 0, 0)} h
                                </span>
                                <button className="ui-btn ghost" style={{ height: 22, width: 22, padding: 0, borderRadius: 6, color: "var(--muted)" }}
                                  onClick={() => copyResourceLink(member.id)} aria-label={`Copia link vista di ${member.name}`} title="Copia link vista risorsa">
                                  <Icon name="link" size={13} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {dayKeys.map((key, i) => {
                            const cellId = `${member.id}|${key}`;
                            return (
                              <div
                                key={key}
                                className={`tl-cell${weekStartIdx.has(i) ? " week-start" : ""}${key === todayKey ? " today" : ""}${dropKey === cellId ? " drop" : ""}`}
                                style={{ gridColumn: i + 2, gridRow: `1 / span ${lanes}` }}
                                onDragOver={(e) => { if (drag) { e.preventDefault(); if (dropKey !== cellId) setDropKey(cellId); } }}
                                onDragLeave={() => setDropKey((cur) => (cur === cellId ? null : cur))}
                                onDrop={(e) => { e.preventDefault(); handleDrop(key, member.id); }}
                              />
                            );
                          })}

                          {bars.map(({ task, first, last, lane, clipL, clipR }) => {
                            const leave = isLeaveTask(task);
                            const c = clientColor(task.client);
                            const isSel = selectedId === task.id;
                            const radius = `${clipL ? 0 : 7}px ${clipR ? 0 : 7}px ${clipR ? 0 : 7}px ${clipL ? 0 : 7}px`;
                            return (
                              <button
                                key={task.id}
                                className={`tl-bar${isSel ? " selected" : ""}${task.status === "done" && !leave ? " done" : ""}${leave ? " leave ui-hatch" : ""}`}
                                style={{
                                  gridColumn: `${first + 2} / span ${last - first + 1}`,
                                  gridRow: lane + 1,
                                  background: leave ? undefined : c.bg,
                                  color: leave ? undefined : c.fg,
                                  borderRadius: radius,
                                  pointerEvents: drag && drag.taskId !== task.id ? "none" : undefined
                                }}
                                draggable
                                onDragStart={(e) => startDrag(e, { taskId: task.id, mode: "move", origin: "timeline", grabKey: grabKeyFromEvent(e, first, last) })}
                                onDragEnd={() => { setDrag(null); setDropKey(null); }}
                                onClick={() => setSelectedId(task.id)}
                                aria-label={`${leave ? "Assenza" : task.client}: ${task.description}, ${shortRange(task.startDate!, task.endDate!)}, ${task.hours} ore`}
                                title={`${task.client} · ${task.description}\n${shortRange(task.startDate!, task.endDate!)} · ${task.hours}h`}
                              >
                                {!leave && !clipL && (
                                  <span className="tl-edge l" draggable onDragStart={(e) => startDrag(e, { taskId: task.id, mode: "start", origin: "timeline" })} />
                                )}
                                {leave ? (
                                  <span className="tl-bar-t">{last - first < 2 ? "Ferie" : `${task.description || "Ferie"} · ${fmtNum(task.hours / HOURS_PER_DAY)} gg`}</span>
                                ) : last === first ? (
                                  <span className="tl-bar-h">{fmtNum(task.hours)}h</span>
                                ) : (
                                  <>
                                    <span className="tl-bar-t">{task.client}</span>
                                    <span className="tl-bar-s">{task.description}</span>
                                    <span className="tl-bar-h">{fmtNum(task.hours)}h</span>
                                  </>
                                )}
                                {!leave && jobOf(task)?.over && (
                                  <span className="tl-over" title="Commessa pianificata oltre il venduto" aria-label="Commessa oltre il venduto" />
                                )}
                                {!leave && !clipR && (
                                  <span className="tl-edge r" draggable onDragStart={(e) => startDrag(e, { taskId: task.id, mode: "end", origin: "timeline" })} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="cal-legend">
                  {legendClients.map((cl) => {
                    const c = clientColor(cl);
                    return (
                      <span key={cl} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span className="cal-swatch" style={{ background: c.bg, boxShadow: `inset 0 0 0 1px ${c.fg}33` }} />{cl}
                      </span>
                    );
                  })}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span className="cal-swatch ui-hatch" />Ferie / permessi
                  </span>
                  <span className="ui-muted" style={{ marginLeft: "auto" }}>Trascina un task per spostarlo o riassegnarlo, i bordi per allungarlo</span>
                </div>
              </>
            ) : (
              <div className="cal-scroll">
                <div style={{ minWidth: 780 }}>
                  <div className="mv-head">
                    {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => <div key={d}>{d}</div>)}
                  </div>
                  <div className="mv-grid">
                    {monthCells.map((cell) => {
                      const shown = cell.tasks.slice(0, 4);
                      const more = cell.tasks.length - shown.length;
                      return (
                        <div
                          key={cell.key}
                          className={`mv-day${cell.off || !cell.inMonth ? " off" : ""}${!cell.inMonth ? " out" : ""}${cell.key === todayKey ? " today" : ""}${dropKey === cell.key ? " drop" : ""}`}
                          onDragOver={(e) => { if (drag) { e.preventDefault(); if (dropKey !== cell.key) setDropKey(cell.key); } }}
                          onDragLeave={() => setDropKey((cur) => (cur === cell.key ? null : cur))}
                          onDrop={(e) => { e.preventDefault(); handleDrop(cell.key); }}
                        >
                          <span className="mv-num ui-num">{cell.date.getDate()}</span>
                          {shown.map((t) => {
                            const leave = isLeaveTask(t);
                            const c = clientColor(t.client);
                            const who = t.assigneeId ? initials(memberById.get(t.assigneeId)?.name ?? "?") : "—";
                            return (
                              <button
                                key={t.id}
                                className={`mv-chip${selectedId === t.id ? " selected" : ""}${leave ? " ui-hatch" : ""}`}
                                style={{ background: leave ? undefined : c.bg, color: leave ? "var(--ink-2)" : c.fg, opacity: t.status === "done" && !leave ? 0.6 : 1 }}
                                draggable={!leave}
                                onDragStart={(e) => startDrag(e, { taskId: t.id, mode: "move", origin: "month", grabKey: cell.key })}
                                onDragEnd={() => { setDrag(null); setDropKey(null); }}
                                onClick={() => setSelectedId(t.id)}
                                title={`${t.client} · ${t.description}`}
                              >
                                <span className="ui-mono" style={{ fontWeight: 600, fontSize: 10.5, flex: "none" }}>{who}</span>
                                <span>{leave ? "Ferie" : t.client}</span>
                              </button>
                            );
                          })}
                          {more > 0 && <span style={{ fontSize: 11.5, color: "var(--muted)", padding: "0 4px" }}>+{more} altri</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="cal-aside">
          {selected && (
            <SelectedPanel
              task={selected}
              member={selected.assigneeId ? memberById.get(selected.assigneeId) : undefined}
              onClose={() => setSelectedId(null)}
              onStatus={(s) => applyUpdate(selected.id, { status: s })}
              onEdit={() => setEditingTask(selected)}
              onDelete={() => handleDelete(selected)}
              job={jobOf(selected) ?? null}
              jobState={budgets ? "ready" : budgetsError ? "error" : "loading"}
            />
          )}

          <section className="ui-card ui-card-pad" aria-label="Task da schedulare" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 className="ui-h2">Da schedulare</h2>
              <span className="ui-muted ui-num" style={{ fontSize: 12.5 }}>{unscheduled.length} · {fmtNum(unscheduledHours)} h</span>
            </div>
            {unscheduled.length === 0 && <span className="ui-muted" style={{ fontSize: 13 }}>Tutti i task sono pianificati.</span>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
              {unscheduled.map((t) => {
                const c = clientColor(t.client);
                return (
                  <div
                    key={t.id}
                    className={`ui-unsched${drag?.taskId === t.id ? " dragging" : ""}`}
                    draggable
                    onDragStart={(e) => startDrag(e, { taskId: t.id, mode: "move", origin: "sidebar" })}
                    onDragEnd={() => { setDrag(null); setDropKey(null); }}
                  >
                    <GripIcon />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.client || "—"}</span>
                        <span className="ui-mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>{fmtNum(Number(t.hours) || 0)}h</span>
                      </div>
                      <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{t.description}</span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <span className="ui-tag" style={{ background: c.bg, color: c.fg }}>{t.commessa}</span>
                        {t.assigneeId && <span style={{ fontSize: 12, color: "var(--muted)" }}>{memberById.get(t.assigneeId)?.name}</span>}
                        {jobOf(t) && (
                          <span className="ui-num" style={{ fontSize: 12, fontWeight: 600, color: jobOf(t)!.over ? "var(--danger)" : "var(--muted)" }}>
                            {jobOf(t)!.over ? `oltre il venduto di ${fmtNum(-jobOf(t)!.available)} h` : `${fmtNum(jobOf(t)!.available)} h disponibili`}
                          </span>
                        )}
                      </div>
                    </div>
                    <button className="ui-btn ghost" style={{ width: 28, height: 28, padding: 0, color: "var(--muted)" }} aria-label={`Modifica ${t.description}`} onClick={() => setEditingTask(t)}>
                      <Icon name="edit" size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="ui-card ui-card-pad" aria-label="Assenze del mese" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 className="ui-h2">Assenze del mese</h2>
              <button className="ui-btn sm" onClick={() => setShowLeave(true)}><Icon name="plus" size={13} strokeWidth={2} /> Aggiungi</button>
            </div>
            {leaves.length === 0 && <span className="ui-muted" style={{ fontSize: 13 }}>Nessuna assenza registrata per questo gruppo.</span>}
            {leaves.map((l) => {
              const m = l.assigneeId ? memberById.get(l.assigneeId) : undefined;
              return (
                <button key={l.id} onClick={() => setSelectedId(l.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "transparent", border: 0, padding: "4px 0", textAlign: "left", cursor: "pointer", borderRadius: 8 }}>
                  <div className="ui-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(m?.name ?? "?")}</div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{m?.name ?? "—"}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{l.description || "Ferie"} · {shortRange(l.startDate!, l.endDate!)}</span>
                  </div>
                  <span className="ui-num" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{fmtNum(l.hours / HOURS_PER_DAY)} gg</span>
                </button>
              );
            })}
          </section>
        </aside>
      </div>

      {editingTask && (
        <TaskDetailModal
          task={editingTask}
          members={members}
          onSave={handleModalSave}
          onDelete={(t) => handleDelete(t)}
          onClose={() => setEditingTask(null)}
        />
      )}
      {showCreate && (
        <TaskCreateModal
          onTaskCreated={(task) => { onTasksUpdate([task, ...tasks]); setShowCreate(false); flash("Task creato: trascinalo sul calendario"); }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {showLeave && (
        <LeaveModal
          members={visibleMembers.length ? visibleMembers : members}
          onClose={() => setShowLeave(false)}
          onCreate={async (draft) => {
            const m = members.find((x) => x.id === draft.memberId);
            const created = await createTask({
              commessa: "FERIE",
              description: draft.note.trim() ? `Ferie - ${draft.note.trim()}` : "Ferie",
              client: m?.name || "Team",
              hours: Number(draft.hours.toFixed(2)),
              status: "done",
              assigneeId: draft.memberId,
              startDate: draft.startDate,
              endDate: draft.endDate,
              teamId: "leave"
            } as any);
            onTasksUpdate([created, ...tasks]);
            setShowLeave(false);
            flash("Assenza registrata e scalata dalla disponibilità");
          }}
        />
      )}
    </div>
  );
}

function SelectedPanel({
  task, member, onClose, onStatus, onEdit, onDelete, job, jobState
}: {
  task: Task;
  member?: Member;
  job: JobPlanning | null;
  jobState: "loading" | "ready" | "error";
  onClose: () => void;
  onStatus: (s: TaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const leave = isLeaveTask(task);
  const c = clientColor(task.client);
  const scheduled = isScheduled(task);
  const wd = scheduled ? Math.max(1, countWorkingDays(task.startDate!, task.endDate!)) : 0;
  const daily = wd ? task.hours / wd : 0;
  return (
    <section className="ui-card ui-card-pad" aria-label="Dettaglio task" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span className={`ui-tag${leave ? " ui-hatch" : ""}`} style={{ alignSelf: "flex-start", background: leave ? undefined : c.bg, color: leave ? "var(--ink-2)" : c.fg }}>
            {task.commessa}
          </span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{task.description}</span>
          {!leave && <span className="ui-muted" style={{ fontSize: 13 }}>{task.client}</span>}
        </div>
        <button className="ui-btn ghost icon" style={{ width: 36, height: 36 }} aria-label="Chiudi dettaglio" onClick={onClose}>
          <Icon name="x" strokeWidth={2} />
        </button>
      </div>
      <div className="ui-grid2">
        <Field label={leave ? "Risorsa" : "Assegnato a"} value={member?.name ?? "Non assegnato"} />
        <Field label="Periodo" value={scheduled ? `${shortRange(task.startDate!, task.endDate!)} · ${wd} gg lav.` : "Non pianificato"} />
        <Field label={leave ? "Assenza" : "Ore stimate"} value={leave ? `${fmtNum(task.hours / HOURS_PER_DAY)} gg (${fmtNum(task.hours)} h)` : `${fmtNum(task.hours)} h`} />
        {!leave && (
          <Field
            label="Carico giornaliero"
            value={scheduled ? `${fmtNum(daily)} h/gg${daily > HOURS_PER_DAY ? " · oltre 8h" : ""}` : "—"}
            color={daily > HOURS_PER_DAY ? "#C02B0A" : undefined}
          />
        )}
      </div>
      {!leave && task.commessa && <JobBox commessa={task.commessa} job={job} state={jobState} />}
      {!leave && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="ui-muted" style={{ fontSize: 12 }}>Stato</span>
          <div className="ui-seg" role="group" aria-label="Stato del task" style={{ display: "flex" }}>
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
              <button key={s} aria-pressed={task.status === s} onClick={() => onStatus(s)} style={{ padding: "0 8px" }}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="ui-btn" style={{ flex: 1 }} onClick={onEdit}><Icon name="edit" size={15} /> Modifica</button>
        <button className="ui-btn danger" style={{ flex: 1 }} onClick={onDelete}><Icon name="trash" size={15} /> Elimina</button>
      </div>
    </section>
  );
}

function JobBox({ commessa, job, state }: { commessa: string; job: JobPlanning | null; state: "loading" | "ready" | "error" }) {
  if (!job) {
    return (
      <div className="job-box">
        <span className="ui-muted" style={{ fontSize: 12.5 }}>
          {state === "loading" ? "Carico i dati della commessa…" : state === "error" ? "Dati di avanzamento non disponibili." : `La commessa ${commessa} non è nei dati di avanzamento.`}
        </span>
      </div>
    );
  }
  const scale = Math.max(job.sold, job.logged + job.plannedOpen, 1);
  const w = (h: number) => `${Math.max(0, Math.min(100, (h / scale) * 100))}%`;
  return (
    <div className={`job-box${job.over ? " over" : ""}`} aria-label="Budget della commessa">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Budget commessa</span>
        <span className="ui-pill" style={job.over ? { background: "var(--danger-soft)", color: "var(--danger-ink)" } : { background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
          {job.over ? `Oltre di ${fmtNum(-job.available)} h` : `${fmtNum(job.available)} h disponibili`}
        </span>
      </div>
      <div className="job-bar" title="Loggato · nei task aperti · venduto">
        <div className="seg logged" style={{ width: w(job.logged) }} />
        <div className="seg planned" style={{ width: w(job.plannedOpen) }} />
        {job.sold < scale && <div className="sold-mark" style={{ left: w(job.sold) }} />}
      </div>
      <div className="ui-grid2" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <Field label="Venduto" value={`${fmtNum(job.sold)} h`} />
        <Field label="Loggato" value={`${fmtNum(job.logged)} h`} />
        <Field label="Pianificato da oggi" value={`${fmtNum(job.plannedOpen)} h`} />
      </div>
      {job.over && (
        <span style={{ fontSize: 12.5, color: "var(--danger-ink)" }}>
          Le ore loggate più quelle pianificate da oggi superano il venduto: rivedi le stime o concorda un'estensione.
        </span>
      )}
    </div>
  );
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span className="ui-muted" style={{ fontSize: 12 }}>{label}</span>
      <span className="ui-num" style={{ fontSize: 14, fontWeight: 500, color }}>{value}</span>
    </div>
  );
}

type LeaveDraft = { memberId: string; startDate: string; endDate: string; hours: number; note: string };

function LeaveModal({ members, onClose, onCreate }: { members: Member[]; onClose: () => void; onCreate: (d: LeaveDraft) => Promise<void> }) {
  const today = formatDate(new Date());
  const [memberId, setMemberId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [unit, setUnit] = useState<"days" | "hours">("days");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Proposta automatica: giorni lavorativi nel periodo
  const suggestedDays = startDate && endDate ? countWorkingDays(startDate <= endDate ? startDate : endDate, startDate <= endDate ? endDate : startDate) : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId) return setErr("Seleziona una risorsa.");
    if (quantity <= 0) return setErr("Inserisci una quantità maggiore di zero.");
    const s = startDate <= endDate ? startDate : endDate;
    const en = startDate <= endDate ? endDate : startDate;
    setSaving(true);
    setErr(null);
    try {
      await onCreate({ memberId, startDate: s, endDate: en, hours: unit === "days" ? quantity * HOURS_PER_DAY : quantity, note });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Errore registrazione assenza");
      setSaving(false);
    }
  };

  return (
    <div className="ui-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="ui-modal" onSubmit={submit} aria-label="Registra assenza">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="ui-h2" style={{ fontSize: 17 }}>Registra ferie / assenza</h2>
          <button type="button" className="ui-btn ghost icon" aria-label="Chiudi" onClick={onClose}><Icon name="x" strokeWidth={2} /></button>
        </div>
        {err && <div className="ui-alert error">{err}</div>}
        <label className="ui-field">
          Risorsa
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
            <option value="">Seleziona risorsa</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <div className="ui-grid2">
          <label className="ui-field">Dal<input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); }} required /></label>
          <label className="ui-field">Al<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></label>
        </div>
        <div className="ui-grid2">
          <div className="ui-field">
            Unità
            <div className="ui-seg" role="group" aria-label="Unità" style={{ display: "flex" }}>
              <button type="button" aria-pressed={unit === "days"} onClick={() => setUnit("days")}>Giornate</button>
              <button type="button" aria-pressed={unit === "hours"} onClick={() => setUnit("hours")}>Ore</button>
            </div>
          </div>
          <label className="ui-field">
            Quantità
            <input type="number" min="0.5" step="0.5" value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 0)} required />
          </label>
        </div>
        {unit === "days" && suggestedDays > 0 && suggestedDays !== quantity && (
          <button type="button" className="ui-btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setQuantity(suggestedDays)}>
            Usa {suggestedDays} giorni lavorativi del periodo
          </button>
        )}
        <label className="ui-field">
          Nota (opzionale)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. ferie estive" />
        </label>
        <span className="ui-muted" style={{ fontSize: 13 }}>
          Impegno calcolato: <strong>{fmtNum(unit === "days" ? quantity * HOURS_PER_DAY : quantity)} h</strong>
        </span>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="ui-btn" onClick={onClose}>Annulla</button>
          <button type="submit" className="ui-btn primary" disabled={saving}>{saving ? "Salvataggio…" : "Registra"}</button>
        </div>
      </form>
    </div>
  );
}
