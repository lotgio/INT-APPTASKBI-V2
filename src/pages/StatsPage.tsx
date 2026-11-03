import { useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import type { Member, Task } from "../types";
import Icon from "../components/Icon";
import {
  HOURS_PER_DAY,
  HOURLY_RATE,
  computeMemberStatsRange,
  countWorkingDaysBetween,
  fmtEuro,
  fmtNum,
  formatDate,
  getTaskHoursInRange,
  initials,
  isLeaveTask,
  isScheduled,
  isWorkingDay,
  loadLabels,
  loadLevel,
  parseDate,
  type MemberStat
} from "../lib/planning";
import { computeJobPlanning, normalizeJobNo, useJobBudgets } from "../lib/jobBudgets";

type Group = "bi" | "crm" | "all";
type Period = "month" | "quarter" | "year";
type SortKey = "load" | "value" | "free" | "name";
type Bucket = { key: string; label: string; sub: string; start: Date; end: Date; current: boolean };
type Tip = { x: number; top: number; bottom: number; lines: string[] } | null;

interface Props {
  tasks: Task[];
  members: Member[];
}

const LEVEL_COLOR = { over: "#C02B0A", high: "#A85A00", ok: "#003DA6", low: "#53606C" } as const;
const MONTHS_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const SPLIT_META = {
  past: { label: "Già svolte", color: "#003DA6" },
  future: { label: "Da svolgere", color: "#9DB8E6" }
} as const;
type SplitKey = keyof typeof SPLIT_META;
/** Scala sequenziale del blu Serinf: testo scuro sui primi tre gradini, bianco sugli ultimi due (contrasto ≥ 4,9). */
const HEAT = [
  { max: 25, bg: "#E3ECF9", fg: "#0E2B3D", label: "fino al 25%" },
  { max: 50, bg: "#BCD1F1", fg: "#0E2B3D", label: "25–50%" },
  { max: 70, bg: "#86AAE3", fg: "#0E2B3D", label: "50–70%" },
  { max: 85, bg: "#3D6FC6", fg: "#FFFFFF", label: "70–85%" },
  { max: 100, bg: "#003DA6", fg: "#FFFFFF", label: "85–100%" }
];
const OVER = { bg: "#C02B0A", fg: "#FFFFFF" };

// ---------- periodi ----------
function periodRange(p: Period, a: Date) {
  const y = a.getFullYear();
  const m = a.getMonth();
  if (p === "year") return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
  if (p === "quarter") {
    const q = Math.floor(m / 3) * 3;
    return { start: new Date(y, q, 1), end: new Date(y, q + 3, 0) };
  }
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
}
const shiftAnchor = (p: Period, a: Date, d: number) => new Date(a.getFullYear(), a.getMonth() + (p === "year" ? 12 : p === "quarter" ? 3 : 1) * d, 1);
function periodLabel(p: Period, a: Date) {
  const y = a.getFullYear();
  const m = a.getMonth();
  if (p === "year") return `Anno ${y}`;
  if (p === "quarter") {
    const q = Math.floor(m / 3);
    return `${q + 1}º trimestre ${y}`;
  }
  return `${MONTHS_LONG[m][0].toUpperCase()}${MONTHS_LONG[m].slice(1)} ${y}`;
}
function prevLabel(p: Period, a: Date) {
  const prev = shiftAnchor(p, a, -1);
  if (p === "year") return String(prev.getFullYear());
  if (p === "quarter") return `${Math.floor(prev.getMonth() / 3) + 1}º trim.`;
  return MONTHS_LONG[prev.getMonth()];
}
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
function makeBuckets(p: Period, start: Date, end: Date, today: Date): Bucket[] {
  const t = today.getTime();
  if (p === "year") {
    return Array.from({ length: 12 }, (_, m) => {
      const s = new Date(start.getFullYear(), m, 1);
      const e = new Date(start.getFullYear(), m + 1, 0);
      return { key: `m${m}`, label: MONTHS_SHORT[m], sub: "", start: s, end: e, current: t >= s.getTime() && t <= e.getTime() + 86399999 };
    });
  }
  const out: Bucket[] = [];
  const monday = new Date(start);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (let guard = 0; monday <= end && guard < 60; guard++) {
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const s = new Date(Math.max(monday.getTime(), start.getTime()));
    const e = new Date(Math.min(sunday.getTime(), end.getTime()));
    const days: Date[] = [];
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) if (isWorkingDay(d)) days.push(new Date(d));
    if (days.length) {
      const f = days[0];
      const l = days[days.length - 1];
      const sub = f.getMonth() === l.getMonth() ? (f.getDate() === l.getDate() ? `${f.getDate()}` : `${f.getDate()}–${l.getDate()}`) : `${f.getDate()}/${f.getMonth() + 1}–${l.getDate()}/${l.getMonth() + 1}`;
      out.push({ key: formatDate(monday), label: `S${isoWeek(monday)}`, sub, start: s, end: e, current: t >= s.getTime() && t <= e.getTime() + 86399999 });
    }
    monday.setDate(monday.getDate() + 7);
  }
  return out;
}
function heatStyle(pct: number, effAvail: number, work: number) {
  if (effAvail <= 0) return { cls: "ui-hatch", bg: undefined as string | undefined, fg: "var(--ink-2)", text: "ferie" };
  if (pct > 100.5) return { cls: "", bg: OVER.bg, fg: OVER.fg, text: `▲${Math.round(pct)}%` };
  if (work < 0.05) return { cls: "", bg: "#F3F7FC", fg: "#5E6B78", text: "—" };
  const step = HEAT.find((h) => pct <= h.max) ?? HEAT[HEAT.length - 1];
  return { cls: "", bg: step.bg, fg: step.fg, text: `${Math.round(pct)}%` };
}
const sum = (rows: MemberStat[]) => {
  const work = rows.reduce((s, x) => s + x.workHours, 0);
  const avail = rows.reduce((s, x) => s + x.effectiveAvailableHours, 0);
  return {
    work,
    avail,
    leave: rows.reduce((s, x) => s + x.leaveHours, 0),
    value: rows.reduce((s, x) => s + x.economicValue, 0),
    target: rows.reduce((s, x) => s + x.monthlyTarget, 0),
    pct: avail > 0 ? (work / avail) * 100 : 0,
    free: rows.reduce((s, x) => s + Math.max(0, x.remainingHours), 0)
  };
};
const fmtDay = (key: string) => parseDate(key).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

export default function StatsPage({ tasks, members }: Props) {
  const today = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);
  const todayKey = formatDate(today);
  const [period, setPeriod] = useState<Period>("month");
  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [group, setGroup] = useState<Group>("bi");
  const [sort, setSort] = useState<SortKey>("load");
  const [trendMetric, setTrendMetric] = useState<"occupancy" | "value">("occupancy");
  const [breakdown, setBreakdown] = useState<"client" | "job">("client");
  const [tip, setTip] = useState<Tip>(null);
  const { budgets } = useJobBudgets();

  const tipProps = (lines: string[]) => ({
    tabIndex: 0,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, lines),
    onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(e.currentTarget, lines),
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null)
  });
  const showTip = (el: HTMLElement, lines: string[]) => {
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom, lines });
  };

  const visibleMembers = useMemo(() => (group === "all" ? members : members.filter((m) => m.group === group)), [members, group]);
  const visibleIds = useMemo(() => new Set(visibleMembers.map((m) => m.id)), [visibleMembers]);
  const inScope = (t: Task) => !t.assigneeId || visibleIds.has(t.assigneeId);

  const { start, end } = periodRange(period, anchor);
  const prev = periodRange(period, shiftAnchor(period, anchor, -1));
  const workingDays = countWorkingDaysBetween(start, end);
  const startKey = formatDate(start);

  // ---------- statistiche del periodo e del precedente ----------
  const stats = useMemo(() => computeMemberStatsRange(tasks, visibleMembers, start, end), [tasks, visibleMembers, startKey, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevStats = useMemo(() => computeMemberStatsRange(tasks, visibleMembers, prev.start, prev.end), [tasks, visibleMembers, startKey, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = sum(stats);
  const prevTotals = sum(prevStats);
  const lvl = loadLevel(totals.pct);
  const overloaded = stats.filter((s) => s.percentage > 100.5).sort((a, b) => b.percentage - a.percentage);

  const sortedStats = useMemo(() => {
    const s = [...stats];
    if (sort === "name") return s.sort((a, b) => a.member.name.localeCompare(b.member.name));
    if (sort === "value") return s.sort((a, b) => b.economicValue - a.economicValue);
    if (sort === "free") return s.sort((a, b) => b.remainingHours - a.remainingHours);
    return s.sort((a, b) => b.percentage - a.percentage);
  }, [stats, sort]);

  // Ore del periodo già svolte (fino a ieri) e da svolgere (da oggi), in base al calendario
  const split = useMemo(() => {
    const out: Record<SplitKey, number> = { past: 0, future: 0 };
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    for (const t of tasks) {
      if (!isScheduled(t) || isLeaveTask(t) || !t.assigneeId || !visibleIds.has(t.assigneeId)) continue;
      if (yesterday >= start) out.past += getTaskHoursInRange(t, start, yesterday < end ? yesterday : end);
      if (today <= end) out.future += getTaskHoursInRange(t, today > start ? today : start, end);
    }
    return out;
  }, [tasks, visibleIds, startKey, period, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const splitTotal = split.past + split.future;

  // ---------- mappa di carico ----------
  const buckets = useMemo(() => makeBuckets(period, start, end, today), [period, startKey, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const heat = useMemo(() => buckets.map((b) => {
    const rows = computeMemberStatsRange(tasks, visibleMembers, b.start, b.end);
    return { bucket: b, byMember: new Map(rows.map((r) => [r.member.id, r])), team: sum(rows) };
  }), [buckets, tasks, visibleMembers]);
  const heatMembers = useMemo(() => [...visibleMembers].sort((a, b) => a.name.localeCompare(b.name)), [visibleMembers]);
  // Picchi: settimane (o mesi, in vista anno) in cui una persona supera il 100%
  const peaks = useMemo(() => {
    const out: { member: Member; items: { label: string; pct: number }[] }[] = [];
    for (const m of heatMembers) {
      const items = heat
        .map(({ bucket, byMember }) => ({ label: bucket.label, pct: byMember.get(m.id)?.percentage ?? 0, avail: byMember.get(m.id)?.effectiveAvailableHours ?? 0 }))
        .filter((x) => x.avail > 0 && x.pct > 100.5)
        .map(({ label, pct }) => ({ label, pct }));
      if (items.length) out.push({ member: m, items });
    }
    return out.sort((a, b) => b.items.length - a.items.length || Math.max(...b.items.map((i) => i.pct)) - Math.max(...a.items.map((i) => i.pct)));
  }, [heat, heatMembers]);
  const peakCount = peaks.reduce((n, p) => n + p.items.length, 0);
  const bucketWord = period === "year" ? (peakCount === 1 ? "mese" : "mesi") : peakCount === 1 ? "settimana" : "settimane";
  const bucketTitle = (b: Bucket) => (period === "year" ? `${MONTHS_LONG[b.start.getMonth()]} ${b.start.getFullYear()}` : `settimana ${b.label.slice(1)} (${b.sub} ${MONTHS_SHORT[b.end.getMonth()].toLowerCase()})`);

  // ---------- segnali ----------
  // Task terminati negli ultimi 30 giorni ma ancora aperti (da chiudere o da ripianificare)
  const overdue = useMemo(() => {
    const from = formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));
    return tasks
      .filter((t) => isScheduled(t) && !isLeaveTask(t) && t.status !== "done" && t.endDate.slice(0, 10) < todayKey && t.endDate.slice(0, 10) >= from && inScope(t))
      .sort((a, b) => (a.endDate! > b.endDate! ? -1 : 1));
  }, [tasks, todayKey, today, visibleIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const unscheduled = useMemo(() => tasks.filter((t) => !isScheduled(t) && !isLeaveTask(t) && t.status !== "done" && inScope(t)), [tasks, visibleIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const jobsOver = useMemo(() => {
    const plan = computeJobPlanning(budgets, tasks);
    const jobsOfGroup = new Set(tasks.filter((t) => t.assigneeId && visibleIds.has(t.assigneeId)).map((t) => normalizeJobNo(t.commessa)));
    return Array.from(plan.values()).filter((j) => j.over && jobsOfGroup.has(normalizeJobNo(j.jobNo))).sort((a, b) => a.available - b.available);
  }, [budgets, tasks, visibleIds]);
  const next4 = useMemo(() => {
    const s = new Date(today);
    const e = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 27);
    const rows = computeMemberStatsRange(tasks, visibleMembers, s, e);
    return { team: sum(rows), top: [...rows].sort((a, b) => b.remainingHours - a.remainingHours).filter((r) => r.remainingHours > 0).slice(0, 3) };
  }, [tasks, visibleMembers, today]);
  const memberName = (id?: string) => members.find((m) => m.id === id)?.name ?? "Non assegnato";

  // ---------- andamento annuale ----------
  const year = anchor.getFullYear();
  const yearTrend = useMemo(() => Array.from({ length: 12 }, (_, m) => {
    const s = new Date(year, m, 1);
    const e = new Date(year, m + 1, 0);
    const t = sum(computeMemberStatsRange(tasks, visibleMembers, s, e));
    return { m, ...t };
  }), [tasks, visibleMembers, year]);
  const trendMax = trendMetric === "occupancy"
    ? Math.max(100, ...yearTrend.map((t) => t.pct)) * 1.08
    : Math.max(1, ...yearTrend.map((t) => Math.max(t.value, t.target))) * 1.08;
  const inPeriod = (m: number) => {
    const d = new Date(year, m, 15);
    return period !== "year" && d >= start && d <= end;
  };
  const ytdEnd = year < today.getFullYear() ? 11 : year > today.getFullYear() ? -1 : today.getMonth();
  const ytd = yearTrend.filter((t) => t.m <= ytdEnd).reduce((a, t) => ({ value: a.value + t.value, target: a.target + t.target }), { value: 0, target: 0 });
  const busyMonths = yearTrend.filter((t) => t.work > 0);
  const avgPct = busyMonths.length ? busyMonths.reduce((s, t) => s + t.pct, 0) / busyMonths.length : 0;
  const peak = yearTrend.reduce((a, t) => (t.pct > a.pct ? t : a), yearTrend[0]);

  // ---------- obiettivo annuo ----------
  const goals = useMemo(() => {
    const ys = new Date(year, 0, 1);
    const ye = new Date(year, 11, 31);
    const split = year < today.getFullYear() ? ye : year > today.getFullYear() ? null : today;
    const done = split ? computeMemberStatsRange(tasks, visibleMembers, ys, split) : [];
    const after = split === ye ? [] : computeMemberStatsRange(tasks, visibleMembers, split ? new Date(split.getFullYear(), split.getMonth(), split.getDate() + 1) : ys, ye);
    const doneBy = new Map(done.map((d) => [d.member.id, d.economicValue]));
    const afterBy = new Map(after.map((d) => [d.member.id, d.economicValue]));
    const rows = visibleMembers.map((m) => ({ member: m, done: doneBy.get(m.id) ?? 0, planned: afterBy.get(m.id) ?? 0, target: m.annualTarget ?? 0 }));
    const withTarget = rows.filter((r) => r.target > 0).sort((a, b) => (b.done + b.planned) / b.target - (a.done + a.planned) / a.target);
    const scale = Math.max(1, ...withTarget.map((r) => Math.max(r.target, r.done + r.planned)));
    return { rows: withTarget, without: rows.filter((r) => !r.target), scale };
  }, [tasks, visibleMembers, year, today]);

  // ---------- dove va il tempo ----------
  const jobPlan = useMemo(() => computeJobPlanning(budgets, tasks), [budgets, tasks]);
  const parts = useMemo(() => {
    const map = new Map<string, { key: string; label: string; sub: string; hours: number }>();
    for (const t of tasks) {
      if (!isScheduled(t) || isLeaveTask(t) || !t.assigneeId || !visibleIds.has(t.assigneeId)) continue;
      const h = getTaskHoursInRange(t, start, end);
      if (h <= 0) continue;
      const key = breakdown === "client" ? (t.client || "Senza cliente").trim().toLowerCase() : normalizeJobNo(t.commessa) || "—";
      const cur = map.get(key) ?? {
        key,
        label: breakdown === "client" ? (t.client || "Senza cliente").trim() : (t.commessa || "Senza commessa").trim(),
        sub: breakdown === "client" ? "" : (t.client || "").trim(),
        hours: 0
      };
      cur.hours += h;
      map.set(key, cur);
    }
    const rows = Array.from(map.values()).sort((a, b) => b.hours - a.hours);
    const total = rows.reduce((s, r) => s + r.hours, 0);
    return { rows: rows.slice(0, 12), rest: rows.slice(12), total };
  }, [tasks, visibleIds, startKey, period, breakdown]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- export ----------
  const exportExcel = () => {
    const head = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: "043153" } } };
    const style = (ws: XLSX.WorkSheet, cols: number) => {
      for (let c = 0; c < cols; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
        if (cell) cell.s = head;
      }
    };
    const wb = XLSX.utils.book_new();
    const r1 = [
      ["Risorsa", "Gruppo", "Ore pianificate", "Ore disponibili (nette)", "Occupazione %", "Ore libere", "Ferie (h)", "Valore €", "Target €", "% target"],
      ...sortedStats.map((s) => [s.member.name, (s.member.group || "").toUpperCase(), +s.workHours.toFixed(1), +s.effectiveAvailableHours.toFixed(1), +s.percentage.toFixed(1),
        +s.remainingHours.toFixed(1), +s.leaveHours.toFixed(1), Math.round(s.economicValue), Math.round(s.monthlyTarget), s.monthlyTarget > 0 ? +((s.economicValue / s.monthlyTarget) * 100).toFixed(1) : ""]),
      ["Totale", "", +totals.work.toFixed(1), +totals.avail.toFixed(1), +totals.pct.toFixed(1), +totals.free.toFixed(1), +totals.leave.toFixed(1), Math.round(totals.value), Math.round(totals.target), totals.target > 0 ? +((totals.value / totals.target) * 100).toFixed(1) : ""]
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(r1);
    ws1["!cols"] = [24, 8, 14, 18, 13, 11, 10, 12, 12, 10].map((wch) => ({ wch }));
    style(ws1, 10);
    XLSX.utils.book_append_sheet(wb, ws1, "Riepilogo");
    const r2 = [
      ["Risorsa", ...heat.map((h) => (period === "year" ? h.bucket.label : `${h.bucket.label} (${h.bucket.sub})`))],
      ...heatMembers.map((m) => [m.name, ...heat.map((h) => {
        const s = h.byMember.get(m.id);
        return s && s.effectiveAvailableHours > 0 ? +s.percentage.toFixed(1) : "ferie";
      })]),
      ["Team", ...heat.map((h) => +h.team.pct.toFixed(1))]
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(r2);
    ws2["!cols"] = [{ wch: 24 }, ...heat.map(() => ({ wch: 12 }))];
    style(ws2, heat.length + 1);
    XLSX.utils.book_append_sheet(wb, ws2, period === "year" ? "Occupazione mesi" : "Occupazione settimane");
    const r3 = [[breakdown === "client" ? "Cliente" : "Commessa", "Ore", "% del totale"], ...[...parts.rows, ...parts.rest].map((r) => [r.label, +r.hours.toFixed(1), parts.total ? +((r.hours / parts.total) * 100).toFixed(1) : 0])];
    const ws3 = XLSX.utils.aoa_to_sheet(r3);
    ws3["!cols"] = [{ wch: 36 }, { wch: 10 }, { wch: 12 }];
    style(ws3, 3);
    XLSX.utils.book_append_sheet(wb, ws3, breakdown === "client" ? "Ore per cliente" : "Ore per commessa");
    XLSX.writeFile(wb, `statistiche_${periodLabel(period, anchor).replace(/\s+/g, "_").toLowerCase()}.xlsx`, { compression: true });
  };

  const Delta = ({ now, before, unit, invert }: { now: number; before: number; unit: "pt" | "%"; invert?: boolean }) => {
    if (!before && !now) return null;
    const d = unit === "pt" ? now - before : before > 0 ? ((now - before) / before) * 100 : 0;
    if (unit === "%" && !before) return <span className="ui-kpi-sub">nessun dato in {prevLabel(period, anchor)}</span>;
    const up = d > 0.5;
    const down = d < -0.5;
    const good = invert ? down : up;
    return (
      <span className="st-delta" style={{ color: up || down ? (good ? "#0B6146" : "#9E2408") : "var(--muted)" }}>
        {up ? "▲" : down ? "▼" : "="} {up || down ? `${up ? "+" : "−"}${fmtNum(Math.abs(d), 0)}${unit === "pt" ? " pt" : "%"}` : "stabile"}
        <span className="ui-muted"> rispetto a {prevLabel(period, anchor)}</span>
      </span>
    );
  };

  return (
    <div className="ui-page">
      <header className="ui-header">
        <div>
          <div className="ui-eyebrow">Analisi · {workingDays} giorni lavorativi · {workingDays * HOURS_PER_DAY} h per persona</div>
          <h1 className="ui-title">Statistiche di carico</h1>
        </div>
        <button className="ui-btn" onClick={exportExcel}><Icon name="download" /> Esporta Excel</button>
      </header>

      <div className="st-toolbar" role="toolbar" aria-label="Periodo e gruppo">
        <div className="ui-seg" role="group" aria-label="Periodo">
          {([["month", "Mese"], ["quarter", "Trimestre"], ["year", "Anno"]] as [Period, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
        <div className="ui-row" style={{ gap: 6 }}>
          <button className="ui-btn icon" aria-label="Periodo precedente" onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}><Icon name="left" strokeWidth={2} /></button>
          <span className="st-period">{periodLabel(period, anchor)}</span>
          <button className="ui-btn icon" aria-label="Periodo successivo" onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}><Icon name="right" strokeWidth={2} /></button>
          <button className="ui-btn" onClick={() => setAnchor(new Date(today.getFullYear(), today.getMonth(), 1))}>Oggi</button>
        </div>
        <div className="ui-seg" role="group" aria-label="Gruppo" style={{ marginLeft: "auto" }}>
          {(["bi", "crm", "all"] as Group[]).map((g) => (
            <button key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>{g === "all" ? "Tutti" : g.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <section className="ui-kpis" aria-label="Indicatori del periodo">
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Occupazione netta</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value st-hero" style={{ color: LEVEL_COLOR[lvl] }}>{Math.round(totals.pct)}%</span>
            <span className="ui-kpi-sub">{loadLabels[lvl]}</span>
          </div>
          <div className="ui-track"><div className="ui-fill" style={{ width: `${Math.min(totals.pct, 100)}%`, background: LEVEL_COLOR[lvl] }} /></div>
          <Delta now={totals.pct} before={prevTotals.pct} unit="pt" />
        </div>
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Ore pianificate</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value st-hero">{fmtNum(totals.work, 0)} h</span>
            <span className="ui-kpi-sub">su {fmtNum(totals.avail, 0)} h</span>
          </div>
          <div className="st-seg" role="img" aria-label={(Object.keys(SPLIT_META) as SplitKey[]).map((k) => `${SPLIT_META[k].label} ${fmtNum(split[k], 0)} h`).join(", ")}>
            {splitTotal > 0 ? (Object.keys(SPLIT_META) as SplitKey[]).filter((k) => split[k] > 0).map((k) => (
              <span key={k} style={{ flexGrow: split[k], background: SPLIT_META[k].color }} />
            )) : <span style={{ flexGrow: 1, background: "var(--line-soft)" }} />}
          </div>
          <div className="st-seg-legend">
            {(Object.keys(SPLIT_META) as SplitKey[]).map((k) => (
              <span key={k}><i style={{ background: SPLIT_META[k].color }} />{SPLIT_META[k].label} <b className="ui-num">{fmtNum(split[k], 0)} h</b></span>
            ))}
          </div>
        </div>
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Capacità libera</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value st-hero">{fmtNum(totals.free, 0)} h</span>
            <span className="ui-kpi-sub">{fmtNum(totals.free / HOURS_PER_DAY)} giornate</span>
          </div>
          <span className="ui-kpi-sub">
            {overloaded.length
              ? `${overloaded.length} ${overloaded.length === 1 ? "persona" : "persone"} oltre il 100% nel periodo`
              : peakCount
                ? `${peakCount} ${bucketWord} in sovraccarico`
                : "Nessun sovraccarico"}
            {totals.leave > 0 ? ` · ${fmtNum(totals.leave / HOURS_PER_DAY)} gg di ferie già scalati` : ""}
          </span>
        </div>
        <div className="ui-card ui-card-pad ui-kpi">
          <span className="ui-kpi-label">Valore pianificato</span>
          <div className="ui-row" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="ui-kpi-value st-hero">{fmtEuro(totals.value)}</span>
            <span className="ui-kpi-sub">{totals.target > 0 ? `${Math.round((totals.value / totals.target) * 100)}% di ${fmtEuro(totals.target)}` : "nessun target"}</span>
          </div>
          <div className="ui-track">
            <div className="ui-fill" style={{ width: `${totals.target > 0 ? Math.min((totals.value / totals.target) * 100, 100) : 0}%`, background: "var(--teal)" }} />
          </div>
          <Delta now={totals.value} before={prevTotals.value} unit="%" />
        </div>
      </section>

      <section className="ui-card" aria-label="Mappa di carico" style={{ overflow: "hidden" }}>
        <div className="ui-card-head">
          <div>
            <h2 className="ui-h2">{period === "year" ? "Carico mese per mese" : "Carico settimana per settimana"}</h2>
            <span className="ui-muted" style={{ fontSize: 12.5 }}>Occupazione netta di ferie: ore pianificate su ore disponibili</span>
          </div>
          <div className="st-legend" aria-label="Legenda">
            {HEAT.map((h) => <span key={h.max}><i style={{ background: h.bg }} />{h.label}</span>)}
            <span><i style={{ background: OVER.bg }} />▲ oltre 100%</span>
            <span><i className="ui-hatch" />ferie</span>
          </div>
        </div>
        <div className="cal-scroll">
          <table className="st-heat" style={{ minWidth: 220 + heat.length * 62 }}>
            <colgroup>
              <col style={{ width: 220 }} />
              {heat.map(({ bucket }) => <col key={bucket.key} />)}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="st-heat-name">Risorsa</th>
                {heat.map(({ bucket: b }) => (
                  <th key={b.key} scope="col" className={b.current ? "current" : undefined} title={bucketTitle(b)}>
                    <span>{b.label}</span>
                    {b.sub && <small>{b.sub}</small>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatMembers.map((m) => (
                <tr key={m.id}>
                  <th scope="row" className="st-heat-name">
                    <div className="st-heat-who">
                      <span className="ui-avatar" style={{ width: 26, height: 26, fontSize: 10.5 }}>{initials(m.name)}</span>
                      <span className="db-ellipsis">{m.name}</span>
                    </div>
                  </th>
                  {heat.map(({ bucket: b, byMember }) => {
                    const s = byMember.get(m.id)!;
                    const h = heatStyle(s.percentage, s.effectiveAvailableHours, s.workHours);
                    const lines = [
                      `${m.name} · ${bucketTitle(b)}`,
                      s.effectiveAvailableHours > 0
                        ? `${fmtNum(s.workHours)} h su ${fmtNum(s.effectiveAvailableHours)} h · ${Math.round(s.percentage)}%`
                        : "Tutto il periodo in ferie",
                      ...(s.leaveHours > 0 ? [`Ferie: ${fmtNum(s.leaveHours / HOURS_PER_DAY)} gg`] : []),
                      s.remainingHours >= 0 ? `Liberi: ${fmtNum(s.remainingHours)} h` : `In eccesso: ${fmtNum(-s.remainingHours)} h`
                    ];
                    return (
                      <td key={b.key} className={h.cls || undefined} style={{ background: h.bg, color: h.fg }} aria-label={lines.join(". ")} {...tipProps(lines)}>
                        {h.text}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {heatMembers.length > 0 && (
                <tr className="st-heat-total">
                  <th scope="row" className="st-heat-name">Team</th>
                  {heat.map(({ bucket: b, team }) => {
                    const h = heatStyle(team.pct, team.avail, team.work);
                    const lines = [`Team · ${bucketTitle(b)}`, `${fmtNum(team.work)} h su ${fmtNum(team.avail)} h · ${Math.round(team.pct)}%`, `Liberi: ${fmtNum(team.free)} h`];
                    return (
                      <td key={b.key} className={h.cls || undefined} style={{ background: h.bg, color: h.fg }} aria-label={lines.join(". ")} {...tipProps(lines)}>
                        {h.text}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
          {heatMembers.length === 0 && <div className="ui-muted" style={{ padding: 16, fontSize: 13.5 }}>Nessuna risorsa in questo gruppo.</div>}
        </div>
      </section>

      <div className="st-cols">
        <section className="ui-card" aria-label="Riepilogo per risorsa" style={{ overflow: "hidden" }}>
          <div className="ui-card-head">
            <h2 className="ui-h2">Riepilogo per risorsa</h2>
            <label style={{ fontSize: 13, color: "var(--muted)" }}>
              Ordina
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="ui-select sm">
                <option value="load">Più carichi</option>
                <option value="free">Più liberi</option>
                <option value="value">Valore</option>
                <option value="name">Nome</option>
              </select>
            </label>
          </div>
          <div className="st-member st-member-head" aria-hidden="true">
            <span /><span>Risorsa</span><span>Occupazione</span><span style={{ textAlign: "right" }}>Liberi</span><span style={{ textAlign: "right" }}>Valore</span><span style={{ textAlign: "right" }}>Ferie</span>
          </div>
          {sortedStats.length === 0 && <div className="ui-muted" style={{ padding: 16, fontSize: 13.5 }}>Nessuna risorsa in questo gruppo.</div>}
          {sortedStats.map((s) => {
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
                    {s.remainingHours < 0 ? `+${fmtNum(-s.remainingHours, 0)} h` : `${fmtNum(s.remainingHours, 0)} h`}
                  </span>
                  <span className="ui-muted" style={{ fontSize: 12 }}>{s.remainingHours < 0 ? "in eccesso" : `${fmtNum(s.remainingHours / HOURS_PER_DAY)} gg`}</span>
                </div>
                <div className="ui-num st-cell">
                  <span style={{ fontWeight: 600 }}>{fmtEuro(s.economicValue)}</span>
                  <span className="ui-muted" style={{ fontSize: 12 }}>
                    {s.monthlyTarget > 0 ? `${Math.round((s.economicValue / s.monthlyTarget) * 100)}% del target` : "nessun target"}
                  </span>
                </div>
                <div className="ui-num st-cell">
                  <span style={{ fontWeight: 600 }}>{s.leaveHours > 0 ? `${fmtNum(s.leaveHours / HOURS_PER_DAY)} gg` : "—"}</span>
                </div>
              </div>
            );
          })}
        </section>

        <section className="ui-card" aria-label="Da tenere d'occhio" style={{ overflow: "hidden" }}>
          <div className="ui-card-head"><h2 className="ui-h2">Da tenere d'occhio</h2></div>
          <Signal
            tone={overloaded.length ? "danger" : peaks.length ? "warn" : "ok"}
            icon={overloaded.length || peaks.length ? "alert" : "check"}
            title={overloaded.length
              ? `${overloaded.length} ${overloaded.length === 1 ? "persona" : "persone"} in sovraccarico nel periodo`
              : peaks.length
                ? `${peaks.length} ${peaks.length === 1 ? "persona" : "persone"} con ${bucketWord === "mese" || bucketWord === "mesi" ? "mesi" : "settimane"} oltre il 100%`
                : "Nessun sovraccarico nel periodo"}
            detail={overloaded.length
              ? overloaded.slice(0, 3).map((s) => `${s.member.name} ${Math.round(s.percentage)}%`).join(" · ")
              : peaks.slice(0, 3).map((p) => `${p.member.name}: ${p.items.slice(0, 3).map((i) => `${i.label} ${Math.round(i.pct)}%`).join(", ")}`).join(" · ")}
          />
          <Signal
            tone={overdue.length ? "warn" : "ok"}
            icon={overdue.length ? "history" : "check"}
            title={overdue.length
              ? `${overdue.length} ${overdue.length === 1 ? "task finito di recente è ancora aperto" : "task finiti di recente sono ancora aperti"}`
              : "Nessun task scaduto negli ultimi 30 giorni"}
            detail={overdue.length
              ? `${overdue.slice(0, 3).map((t) => `${t.description} (${memberName(t.assigneeId)}, ${fmtDay(t.endDate!)})`).join(" · ")}. Segnali come completati o ripianificali.`
              : undefined}
          />
          <Signal
            tone={unscheduled.length ? "warn" : "ok"}
            icon={unscheduled.length ? "calendar" : "check"}
            title={unscheduled.length ? `${unscheduled.length} task da schedulare · ${fmtNum(unscheduled.reduce((s, t) => s + (Number(t.hours) || 0), 0), 0)} h` : "Tutti i task sono in calendario"}
            detail={unscheduled.slice(0, 3).map((t) => t.client || t.description).join(" · ")}
          />
          <Signal
            tone={!budgets ? "info" : jobsOver.length ? "danger" : "ok"}
            icon={jobsOver.length ? "alert" : "check"}
            title={!budgets ? "Carico i budget delle commesse…" : jobsOver.length ? `${jobsOver.length} ${jobsOver.length === 1 ? "commessa pianificata" : "commesse pianificate"} oltre il venduto` : "Nessuna commessa oltre il venduto"}
            detail={jobsOver.slice(0, 3).map((j) => `${j.customer || j.jobNo} +${fmtNum(-j.available, 0)} h`).join(" · ")}
          />
          <Signal
            tone="info"
            icon="users"
            title={`Prossime 4 settimane: ${fmtNum(next4.team.free, 0)} h libere (${Math.round(next4.team.pct)}% di occupazione)`}
            detail={next4.top.length ? `Più disponibili: ${next4.top.map((r) => `${r.member.name} ${fmtNum(r.remainingHours, 0)} h`).join(" · ")}` : "Nessuna disponibilità residua"}
          />
        </section>
      </div>

      <div className="st-cols">
        <section className="ui-card ui-card-pad" aria-label="Andamento annuale">
          <div className="st-card-head">
            <h2 className="ui-h2">Andamento {year}</h2>
            <div className="ui-seg" role="group" aria-label="Misura">
              <button aria-pressed={trendMetric === "occupancy"} onClick={() => setTrendMetric("occupancy")}>Occupazione</button>
              <button aria-pressed={trendMetric === "value"} onClick={() => setTrendMetric("value")}>Valore e target</button>
            </div>
          </div>
          <div className="st-trend">
            {yearTrend.map((t) => {
              const v = trendMetric === "occupancy" ? t.pct : t.value;
              const over = trendMetric === "occupancy" ? t.pct > 100.5 : t.target > 0 && t.value > t.target;
              const sel = inPeriod(t.m);
              const lines = trendMetric === "occupancy"
                ? [`${MONTHS_LONG[t.m]} ${year}`, `Occupazione ${Math.round(t.pct)}%`, `${fmtNum(t.work, 0)} h su ${fmtNum(t.avail, 0)} h`]
                : [`${MONTHS_LONG[t.m]} ${year}`, `Valore ${fmtEuro(t.value)}`, t.target > 0 ? `Target ${fmtEuro(t.target)} · ${Math.round((t.value / t.target) * 100)}%` : "Nessun target"];
              return (
                <button key={t.m} className={`st-bar${sel ? " current" : ""}`} aria-label={lines.join(". ")}
                  onClick={() => { setPeriod("month"); setAnchor(new Date(year, t.m, 1)); }} {...tipProps(lines)}>
                  <span className="st-bar-area">
                    {trendMetric === "occupancy" && <span className="st-ref" style={{ bottom: `${(100 / trendMax) * 100}%` }} />}
                    <span className="st-bar-fill" style={{ height: `${(v / trendMax) * 100}%`, background: v <= 0 ? "transparent" : trendMetric === "occupancy" ? (over ? OVER.bg : "var(--accent)") : "var(--teal)" }}>
                      {sel && v > 0 && <span className="st-bar-val ui-num">{trendMetric === "occupancy" ? `${Math.round(v)}%` : `${fmtNum(v / 1000, 1)}k`}</span>}
                    </span>
                    {trendMetric === "value" && t.target > 0 && <span className="st-target" style={{ bottom: `${(t.target / trendMax) * 100}%` }} />}
                  </span>
                  <span className="st-bar-lbl">{MONTHS_SHORT[t.m]}</span>
                </button>
              );
            })}
          </div>
          <div className="st-trend-foot">
            {trendMetric === "occupancy" ? (
              <>
                <span><i className="st-key-line dashed" />100% della capacità</span>
                <span className="ui-num">Media dei mesi pianificati {Math.round(avgPct)}%{peak && peak.pct > 0 ? ` · picco ${MONTHS_LONG[peak.m]} ${Math.round(peak.pct)}%` : ""}</span>
              </>
            ) : (
              <>
                <span><i className="st-key" style={{ background: "var(--teal)" }} />Valore pianificato</span>
                <span><i className="st-key-line" />Target del mese</span>
                <span className="ui-num">
                  {ytdEnd >= 0 ? `Da inizio anno ${fmtEuro(ytd.value)}${ytd.target > 0 ? ` su ${fmtEuro(ytd.target)} (${Math.round((ytd.value / ytd.target) * 100)}%)` : ""}` : "Anno non ancora iniziato"}
                </span>
              </>
            )}
          </div>
        </section>

        <section className="ui-card ui-card-pad" aria-label="Obiettivo annuo">
          <div className="st-card-head">
            <h2 className="ui-h2">Obiettivo annuo {year}</h2>
            <span className="ui-muted" style={{ fontSize: 12 }}>valore = ore pianificate × {HOURLY_RATE} €</span>
          </div>
          {goals.rows.length === 0 && <span className="ui-muted" style={{ fontSize: 13 }}>Nessun obiettivo annuo impostato per questo gruppo (si imposta dalla pagina Team).</span>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {goals.rows.map((r) => {
              const tot = r.done + r.planned;
              const pct = (tot / r.target) * 100;
              const lines = [r.member.name, `Fino a oggi ${fmtEuro(r.done)}`, `Resto dell'anno ${fmtEuro(r.planned)}`, `Obiettivo ${fmtEuro(r.target)} · coperto al ${Math.round(pct)}%`];
              return (
                <div key={r.member.id} className="st-goal" aria-label={lines.join(". ")} {...tipProps(lines)}>
                  <span className="db-ellipsis" style={{ fontSize: 13.5, fontWeight: 500 }}>{r.member.name}</span>
                  <div className="st-goal-bar">
                    <span className="done" style={{ width: `${(r.done / goals.scale) * 100}%` }} />
                    <span className="planned" style={{ width: `${(r.planned / goals.scale) * 100}%` }} />
                    <span className="mark" style={{ left: `${(r.target / goals.scale) * 100}%` }} />
                  </div>
                  <span className="ui-num" style={{ fontSize: 12.5, textAlign: "right" }}>
                    <b style={{ color: pct >= 100 ? "#0B6146" : undefined }}>{Math.round(pct)}%</b>
                    <span className="ui-muted"> di {fmtNum(r.target / 1000, 0)}k</span>
                  </span>
                </div>
              );
            })}
          </div>
          {goals.rows.length > 0 && (
            <div className="st-trend-foot">
              <span><i className="st-key" style={{ background: "var(--accent)" }} />Fino a oggi</span>
              <span><i className="st-key" style={{ background: "#9DB8E6" }} />Resto dell'anno</span>
              <span><i className="st-key-line" />Obiettivo</span>
            </div>
          )}
          {goals.without.length > 0 && (
            <div className="ui-muted" style={{ fontSize: 12.5, marginTop: 10 }}>Senza obiettivo: {goals.without.map((r) => r.member.name).join(", ")}</div>
          )}
        </section>
      </div>

      <section className="ui-card" aria-label="Dove va il tempo" style={{ overflow: "hidden" }}>
        <div className="ui-card-head">
          <div>
            <h2 className="ui-h2">Dove va il tempo</h2>
            <span className="ui-muted ui-num" style={{ fontSize: 12.5 }}>{fmtNum(parts.total, 0)} h pianificate nel periodo</span>
          </div>
          <div className="ui-seg" role="group" aria-label="Raggruppa per">
            <button aria-pressed={breakdown === "client"} onClick={() => setBreakdown("client")}>Per cliente</button>
            <button aria-pressed={breakdown === "job"} onClick={() => setBreakdown("job")}>Per commessa</button>
          </div>
        </div>
        {parts.rows.length === 0 && <div className="ui-muted" style={{ padding: 16, fontSize: 13.5 }}>Nessun task pianificato nel periodo.</div>}
        {parts.rows.map((r) => {
          const share = parts.total ? (r.hours / parts.total) * 100 : 0;
          const job = breakdown === "job" ? jobPlan.get(r.key) : undefined;
          return (
            <div key={r.key} className={`st-bk${breakdown === "job" ? " job" : ""}`}>
              <div style={{ minWidth: 0 }}>
                <div className={`db-ellipsis${breakdown === "job" ? " ui-mono" : ""}`} style={{ fontSize: breakdown === "job" ? 12.5 : 13.5, fontWeight: 600 }} title={r.label}>{r.label}</div>
                {r.sub && <div className="ui-muted db-ellipsis" style={{ fontSize: 12 }}>{r.sub}</div>}
              </div>
              <div className="ui-track" style={{ height: 8 }}>
                <div className="ui-fill" style={{ width: `${(r.hours / (parts.rows[0]?.hours || 1)) * 100}%`, background: "var(--accent)" }} />
              </div>
              <span className="ui-num" style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>{fmtNum(r.hours, 0)} h</span>
              <span className="ui-num ui-muted" style={{ fontSize: 12.5, textAlign: "right" }}>{fmtNum(share, 0)}%</span>
              {breakdown === "job" && (
                <span className="ui-num" style={{ fontSize: 12.5, textAlign: "right", color: job?.over ? "#9E2408" : "var(--ink-2)", fontWeight: job?.over ? 600 : 400 }}>
                  {!job ? <span className="ui-muted">budget n.d.</span> : job.over ? `▲ oltre di ${fmtNum(-job.available, 0)} h` : `${fmtNum(job.available, 0)} h residue`}
                </span>
              )}
            </div>
          );
        })}
        {parts.rest.length > 0 && (
          <div className="ui-muted" style={{ padding: "10px 16px", fontSize: 12.5 }}>
            Altri {parts.rest.length} {breakdown === "client" ? "clienti" : "commesse"}: {fmtNum(parts.rest.reduce((s, r) => s + r.hours, 0), 0)} h
          </div>
        )}
      </section>

      {tip && (
        <div className="st-tip" role="tooltip"
          style={tip.top > 90 ? { left: tip.x, top: tip.top - 8, transform: "translate(-50%, -100%)" } : { left: tip.x, top: tip.bottom + 8, transform: "translate(-50%, 0)" }}>
          {tip.lines.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 600, marginBottom: 2 } : undefined}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

function Signal({ tone, icon, title, detail }: { tone: "ok" | "warn" | "danger" | "info"; icon: string; title: string; detail?: string }) {
  return (
    <div className={`st-sig st-sig--${tone}`}>
      <span className="st-sig-icon"><Icon name={icon} size={16} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</div>
        {detail && <div className="ui-muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.45 }}>{detail}</div>}
      </div>
    </div>
  );
}
