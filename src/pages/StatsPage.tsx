import { useMemo, useState } from "react";
import type { Member, Task } from "../types";
import Icon from "../components/Icon";
import {
  HOURS_PER_DAY,
  clientColor,
  computeMemberStats,
  fmtEuro,
  fmtNum,
  getTaskHoursInRange,
  getWorkingDaysInMonth,
  initials,
  isLeaveTask,
  isScheduled,
  loadLabels,
  loadLevel,
  monthBounds
} from "../lib/planning";

type Group = "bi" | "crm" | "all";

interface Props {
  tasks: Task[];
  members: Member[];
}

const LEVEL_COLOR = { over: "#C02B0A", high: "#A85A00", ok: "#003DA6", low: "#53606C" } as const;
const MONTHS_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export default function StatsPage({ tasks, members }: Props) {
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [group, setGroup] = useState<Group>("bi");
  const [sort, setSort] = useState<"load" | "name" | "value">("load");

  const visibleMembers = useMemo(
    () => (group === "all" ? members : members.filter((m) => m.group === group)),
    [members, group]
  );
  const visibleIds = useMemo(() => new Set(visibleMembers.map((m) => m.id)), [visibleMembers]);
  const monthLabel = month.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const workingDays = getWorkingDaysInMonth(month);

  const stats = useMemo(() => {
    const s = computeMemberStats(tasks, visibleMembers, month);
    if (sort === "name") return [...s].sort((a, b) => a.member.name.localeCompare(b.member.name));
    if (sort === "value") return [...s].sort((a, b) => b.economicValue - a.economicValue);
    return [...s].sort((a, b) => b.percentage - a.percentage);
  }, [tasks, visibleMembers, month, sort]);

  const totals = useMemo(() => {
    const work = stats.reduce((s, x) => s + x.workHours, 0);
    const avail = stats.reduce((s, x) => s + x.effectiveAvailableHours, 0);
    const leave = stats.reduce((s, x) => s + x.leaveHours, 0);
    const value = stats.reduce((s, x) => s + x.economicValue, 0);
    const target = stats.reduce((s, x) => s + x.monthlyTarget, 0);
    return { work, avail, leave, value, target, free: Math.max(0, avail - work), pct: avail > 0 ? (work / avail) * 100 : 0 };
  }, [stats]);

  // Andamento dei 12 mesi dell'anno selezionato (occupazione del gruppo)
  const yearTrend = useMemo(() => {
    const y = month.getFullYear();
    return Array.from({ length: 12 }, (_, m) => {
      const s = computeMemberStats(tasks, visibleMembers, new Date(y, m, 1));
      const work = s.reduce((a, x) => a + x.workHours, 0);
      const avail = s.reduce((a, x) => a + x.effectiveAvailableHours, 0);
      return { m, work, pct: avail > 0 ? (work / avail) * 100 : 0, value: s.reduce((a, x) => a + x.economicValue, 0) };
    });
  }, [tasks, visibleMembers, month]);
  const maxTrend = Math.max(100, ...yearTrend.map((t) => t.pct));

  // Ore del mese per cliente
  const byClient = useMemo(() => {
    const { start, end } = monthBounds(month);
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (!isScheduled(t) || isLeaveTask(t) || !t.assigneeId || !visibleIds.has(t.assigneeId)) continue;
      const h = getTaskHoursInRange(t, start, end);
      if (h <= 0) continue;
      const k = (t.client || "Senza cliente").trim();
      map.set(k, (map.get(k) || 0) + h);
    }
    const rows = Array.from(map, ([client, hours]) => ({ client, hours })).sort((a, b) => b.hours - a.hours);
    const total = rows.reduce((s, r) => s + r.hours, 0);
    return { rows: rows.slice(0, 10), rest: rows.slice(10).reduce((s, r) => s + r.hours, 0), total };
  }, [tasks, month, visibleIds]);

  const shiftMonth = (d: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + d, 1));
  const lvl = loadLevel(totals.pct);

  return (
    <div className="ui-page">
      <header className="ui-header">
        <div>
          <div className="ui-eyebrow">Analisi · {workingDays} giorni lavorativi · {workingDays * HOURS_PER_DAY} h per persona</div>
          <h1 className="ui-title">Statistiche di carico</h1>
        </div>
        <div className="ui-row">
          <div className="ui-row" style={{ gap: 6 }}>
            <button className="ui-btn icon" aria-label="Mese precedente" onClick={() => shiftMonth(-1)}><Icon name="left" strokeWidth={2} /></button>
            <span style={{ fontSize: 16, fontWeight: 600, minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>{monthLabel}</span>
            <button className="ui-btn icon" aria-label="Mese successivo" onClick={() => shiftMonth(1)}><Icon name="right" strokeWidth={2} /></button>
          </div>
          <div className="ui-seg" role="group" aria-label="Gruppo">
            {(["bi", "crm", "all"] as Group[]).map((g) => (
              <button key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>{g === "all" ? "Tutti" : g.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </header>

      <section className="ui-kpis" aria-label="Indicatori del mese">
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Occupazione netta</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value" style={{ color: LEVEL_COLOR[lvl] }}>{Math.round(totals.pct)}%</span>
            <span className="ui-kpi-sub">{loadLabels[lvl]}</span>
          </div>
          <div className="ui-track"><div className="ui-fill" style={{ width: `${Math.min(totals.pct, 100)}%`, background: LEVEL_COLOR[lvl] }} /></div>
        </div>
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Ore pianificate</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value">{fmtNum(totals.work, 0)} h</span>
            <span className="ui-kpi-sub">su {fmtNum(totals.avail, 0)} h</span>
          </div>
          <span className="ui-kpi-sub">{fmtNum(totals.leave / HOURS_PER_DAY)} gg di ferie già scalati</span>
        </div>
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Capacità libera</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value">{fmtNum(totals.free, 0)} h</span>
            <span className="ui-kpi-sub">{fmtNum(totals.free / HOURS_PER_DAY)} giornate</span>
          </div>
          <span className="ui-kpi-sub">Da riempire con nuove attività</span>
        </div>
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Valore pianificato</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value">{fmtEuro(totals.value)}</span>
            <span className="ui-kpi-sub">{totals.target > 0 ? `target ${fmtEuro(totals.target)}` : "nessun target"}</span>
          </div>
          <div className="ui-track">
            <div className="ui-fill" style={{ width: `${totals.target > 0 ? Math.min((totals.value / totals.target) * 100, 100) : 0}%`, background: "var(--teal)" }} />
          </div>
        </div>
      </section>

      <div className="st-cols">
        <section className="ui-card" aria-label="Carico per risorsa" style={{ overflow: "hidden" }}>
          <div className="ui-card-head">
            <h2 className="ui-h2">Carico per risorsa</h2>
            <label style={{ fontSize: 13, color: "var(--muted)" }}>
              Ordina
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="ui-select sm">
                <option value="load">Più carichi</option>
                <option value="value">Valore</option>
                <option value="name">Nome</option>
              </select>
            </label>
          </div>
          {stats.length === 0 && <div className="ui-muted" style={{ padding: 16, fontSize: 13.5 }}>Nessuna risorsa in questo gruppo.</div>}
          {stats.map((s) => {
            const l = loadLevel(s.percentage);
            return (
              <div key={s.member.id} className="st-member">
                <div className="ui-avatar">{initials(s.member.name)}</div>
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{s.member.name}</span>
                  <span className="ui-muted" style={{ fontSize: 12.5 }}>{s.member.role || (s.member.group ? s.member.group.toUpperCase() : "—")}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }} className="ui-num">
                    <span style={{ color: "var(--ink-2)" }}>{fmtNum(s.workHours)} / {fmtNum(s.effectiveAvailableHours)} h</span>
                    <span style={{ fontWeight: 600, color: LEVEL_COLOR[l] }}>{Math.round(s.percentage)}%</span>
                  </div>
                  <div className="ui-track"><div className="ui-fill" style={{ width: `${Math.min(s.percentage, 100)}%`, background: LEVEL_COLOR[l] }} /></div>
                </div>
                <div className="ui-num st-cell">
                  <span style={{ fontWeight: 600, color: s.remainingHours < 0 ? "var(--danger)" : undefined }}>
                    {s.remainingHours < 0 ? `+${fmtNum(-s.remainingHours)} h` : `${fmtNum(s.remainingHours)} h`}
                  </span>
                  <span className="ui-muted" style={{ fontSize: 12 }}>{s.remainingHours < 0 ? "in eccesso" : "liberi"}</span>
                </div>
                <div className="ui-num st-cell">
                  <span style={{ fontWeight: 600 }}>{fmtEuro(s.economicValue)}</span>
                  <span className="ui-muted" style={{ fontSize: 12 }}>
                    {s.monthlyTarget > 0 ? `${Math.round((s.economicValue / s.monthlyTarget) * 100)}% del target` : "nessun target"}
                  </span>
                </div>
                <div className="ui-num st-cell">
                  <span style={{ fontWeight: 600 }}>{s.leaveHours > 0 ? `${fmtNum(s.leaveHours / HOURS_PER_DAY)} gg` : "—"}</span>
                  <span className="ui-muted" style={{ fontSize: 12 }}>ferie</span>
                </div>
              </div>
            );
          })}
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <section className="ui-card ui-card-pad" aria-label="Andamento annuale">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <h2 className="ui-h2">Occupazione {month.getFullYear()}</h2>
              <span className="ui-muted" style={{ fontSize: 12 }}>linea = 100%</span>
            </div>
            <div className="st-trend" role="img" aria-label={`Occupazione mensile ${month.getFullYear()}: ${yearTrend.map((t) => `${MONTHS_SHORT[t.m]} ${Math.round(t.pct)}%`).join(", ")}`}>
              {yearTrend.map((t) => {
                const l = loadLevel(t.pct);
                const current = t.m === month.getMonth();
                return (
                  <button key={t.m} className={`st-bar${current ? " current" : ""}`} onClick={() => setMonth(new Date(month.getFullYear(), t.m, 1))}
                    title={`${MONTHS_SHORT[t.m]}: ${Math.round(t.pct)}% · ${fmtNum(t.work, 0)} h · ${fmtEuro(t.value)}`}>
                    <span className="st-bar-area">
                      <span className="st-ref" style={{ bottom: `${(100 / maxTrend) * 100}%` }} />
                      <span className="st-bar-fill" style={{ height: `${(t.pct / maxTrend) * 100}%`, background: t.pct < 1 ? "transparent" : LEVEL_COLOR[l] }}>
                        {t.pct >= 1 && <span className="st-bar-val ui-num">{Math.round(t.pct)}</span>}
                      </span>
                    </span>
                    <span className="st-bar-lbl">{MONTHS_SHORT[t.m]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="ui-card ui-card-pad" aria-label="Ore per cliente">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <h2 className="ui-h2">Ore per cliente</h2>
              <span className="ui-muted ui-num" style={{ fontSize: 12.5 }}>{fmtNum(byClient.total, 0)} h nel mese</span>
            </div>
            {byClient.rows.length === 0 && <span className="ui-muted" style={{ fontSize: 13 }}>Nessun task pianificato nel mese.</span>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {byClient.rows.map((r) => {
                const c = clientColor(r.client);
                return (
                  <div key={r.client} className="st-client">
                    <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.client}>{r.client}</span>
                    <div className="ui-track" style={{ height: 8 }}>
                      <div className="ui-fill" style={{ width: `${(r.hours / (byClient.rows[0]?.hours || 1)) * 100}%`, background: c.fg }} />
                    </div>
                    <span className="ui-num" style={{ fontSize: 12.5, textAlign: "right" }}>{fmtNum(r.hours, 0)} h</span>
                  </div>
                );
              })}
              {byClient.rest > 0 && <span className="ui-muted" style={{ fontSize: 12.5 }}>Altri clienti: {fmtNum(byClient.rest, 0)} h</span>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
