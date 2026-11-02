import type { Member, Task } from "../types";

export const HOURS_PER_DAY = 8;
export const HOURLY_RATE = 75; // €/ora, come nell'app originale

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Interpreta "YYYY-MM-DD" come data locale (evita slittamenti di fuso). */
export function parseDate(key: string): Date {
  const [y, m, d] = key.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(key: string, days: number): string {
  const date = parseDate(key);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

export function diffDays(startKey: string, endKey: string): number {
  return Math.round((parseDate(endKey).getTime() - parseDate(startKey).getTime()) / 86400000);
}

/** Domenica di Pasqua (algoritmo di Meeus/Jones/Butcher). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const holidayCache = new Map<number, Set<string>>();
export function getItalianHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const set = new Set<string>(
    ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"].map((d) => `${year}-${d}`)
  );
  const easter = easterSunday(year);
  set.add(formatDate(easter));
  const monday = new Date(easter);
  monday.setDate(monday.getDate() + 1);
  set.add(formatDate(monday));
  holidayCache.set(year, set);
  return set;
}

export function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

export function isHoliday(date: Date): boolean {
  return getItalianHolidays(date.getFullYear()).has(formatDate(date));
}

export function isWorkingDay(date: Date): boolean {
  return !isWeekend(date) && !isHoliday(date);
}

export function getWorkingDays(month: Date): Date[] {
  const y = month.getFullYear();
  const m = month.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const out: Date[] = [];
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m, d);
    if (isWorkingDay(date)) out.push(date);
  }
  return out;
}

export function getWorkingDaysInMonth(month: Date): number {
  return getWorkingDays(month).length;
}

export function isLeaveTask(task: Task): boolean {
  return String(task.commessa || "").trim().toUpperCase() === "FERIE";
}

export function isScheduled(task: Task): task is Task & { startDate: string; endDate: string } {
  return !!task.startDate && !!task.endDate;
}

/** Giorni lavorativi (lun-ven, escluse festività) tra due date incluse. */
export function countWorkingDaysBetween(start: Date, end: Date): number {
  let n = 0;
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  for (let guard = 0; d <= last && guard < 3660; guard++) {
    if (isWorkingDay(d)) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/**
 * Ore del task che ricadono nell'intervallo, ripartite sui giorni lavorativi del task
 * (un task da 40 h dal venerdì al giovedì vale 8 h al giorno, non 40/7).
 * Se il task cade solo su giorni non lavorativi si ripartisce sui giorni di calendario.
 */
export function getTaskHoursInRange(task: Task, rangeStart: Date, rangeEnd: Date): number {
  if (!isScheduled(task)) return 0;
  const ts = parseDate(task.startDate);
  const te = parseDate(task.endDate);
  if (te < rangeStart || ts > rangeEnd) return 0;
  const os = new Date(Math.max(ts.getTime(), rangeStart.getTime()));
  const oe = new Date(Math.min(te.getTime(), rangeEnd.getTime()));
  const totalWd = countWorkingDaysBetween(ts, te);
  if (totalWd > 0) return (task.hours * countWorkingDaysBetween(os, oe)) / totalWd;
  const total = Math.round((te.getTime() - ts.getTime()) / 86400000) + 1;
  const overlap = Math.round((oe.getTime() - os.getTime()) / 86400000) + 1;
  if (total <= 0 || overlap <= 0) return 0;
  return (task.hours * overlap) / total;
}

export function getHoursPerDay(task: Task): number {
  if (!isScheduled(task)) return task.hours;
  const wd = countWorkingDaysBetween(parseDate(task.startDate), parseDate(task.endDate));
  if (wd > 0) return task.hours / wd;
  const days = diffDays(task.startDate, task.endDate) + 1;
  return days > 0 ? task.hours / days : task.hours;
}

export function monthBounds(month: Date) {
  return {
    start: new Date(month.getFullYear(), month.getMonth(), 1),
    end: new Date(month.getFullYear(), month.getMonth() + 1, 0)
  };
}

export type MemberStat = {
  member: Member;
  assignedHours: number;
  leaveHours: number;
  workHours: number;
  availableHours: number;
  effectiveAvailableHours: number;
  percentage: number;
  remainingHours: number;
  economicValue: number;
  monthlyTarget: number;
};

function yearlyWorkingHours(year: number): number {
  let total = 0;
  for (let m = 0; m < 12; m++) total += getWorkingDaysInMonth(new Date(year, m, 1)) * HOURS_PER_DAY;
  return total;
}

export function computeMemberStats(tasks: Task[], members: Member[], month: Date): MemberStat[] {
  const { start, end } = monthBounds(month);
  const availableHours = getWorkingDaysInMonth(month) * HOURS_PER_DAY;
  const yearHours = yearlyWorkingHours(month.getFullYear());
  return members.map((member) => {
    const own = tasks.filter((t) => t.assigneeId === member.id && isScheduled(t));
    const assignedHours = own.reduce((s, t) => s + getTaskHoursInRange(t, start, end), 0);
    const leaveHours = own.filter(isLeaveTask).reduce((s, t) => s + getTaskHoursInRange(t, start, end), 0);
    const workHours = Math.max(0, assignedHours - leaveHours);
    const effectiveAvailableHours = Math.max(0, availableHours - leaveHours);
    const percentage = effectiveAvailableHours > 0 ? (workHours / effectiveAvailableHours) * 100 : 0;
    const monthlyTarget = member.annualTarget && yearHours ? (member.annualTarget / yearHours) * availableHours : 0;
    return {
      member,
      assignedHours,
      leaveHours,
      workHours,
      availableHours,
      effectiveAvailableHours,
      percentage,
      remainingHours: effectiveAvailableHours - workHours,
      economicValue: workHours * HOURLY_RATE,
      monthlyTarget
    };
  });
}

export type LoadLevel = "over" | "high" | "ok" | "low";
export function loadLevel(pct: number): LoadLevel {
  if (pct > 100) return "over";
  if (pct >= 85) return "high";
  if (pct < 50) return "low";
  return "ok";
}
export const loadLabels: Record<LoadLevel, string> = {
  over: "sovraccarico",
  high: "quasi pieno",
  ok: "in equilibrio",
  low: "disponibile"
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const CLIENT_PALETTE = [
  { bg: "#DCE7F8", fg: "#003DA6" },
  { bg: "#D7F0E5", fg: "#0B6146" },
  { bg: "#FDE3D6", fg: "#A8360B" },
  { bg: "#E8E1FA", fg: "#4B2DA0" },
  { bg: "#E2E8F0", fg: "#2E4256" },
  { bg: "#FADDE8", fg: "#9B1F4E" },
  { bg: "#FBEFC9", fg: "#7A5300" },
  { bg: "#D3EEF5", fg: "#0B5A70" }
];
export function clientColor(client: string) {
  let hash = 0;
  const key = (client || "").trim().toLowerCase();
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return CLIENT_PALETTE[Math.abs(hash) % CLIENT_PALETTE.length];
}

export const fmtNum = (n: number, digits = 1) => n.toLocaleString("it-IT", { maximumFractionDigits: digits });
export const fmtEuro = (n: number) => "€ " + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
