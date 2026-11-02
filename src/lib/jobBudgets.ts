import { useEffect, useState } from "react";
import { getJobs } from "../api";
import type { Task } from "../types";
import { isLeaveTask } from "./planning";

/** Totali di una commessa dai dati di avanzamento (tutte le righe, escluse le trasferte). */
export type JobBudget = {
  jobNo: string;
  customer: string;
  description: string;
  division: string;
  sold: number;
  logged: number;
  invoiced: number;
};

export type JobPlanning = JobBudget & {
  plannedOpen: number; // ore dei task non completati su questa commessa
  plannedTotal: number;
  available: number; // venduto − loggato − pianificato aperto
  over: boolean;
};

const PAGE = 5000;
let cache: Promise<Map<string, JobBudget>> | null = null;

export const normalizeJobNo = (value: string | undefined | null) => String(value || "").trim().toUpperCase();

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function loadJobBudgets(): Promise<Map<string, JobBudget>> {
  if (!cache) {
    cache = (async () => {
      const map = new Map<string, JobBudget>();
      for (let offset = 0; offset < 1_000_000; offset += PAGE) {
        const chunk = await getJobs({ limit: PAGE, offset, excludeTrasferta: true, excludeMatching: false });
        for (const row of chunk) {
          const key = normalizeJobNo(row.JobNo);
          if (!key) continue;
          const b = map.get(key) ?? {
            jobNo: String(row.JobNo || "").trim(),
            customer: String(row["Customer Name"] || ""),
            description: String(row.job_description || "").trim(),
            division: String(row.Division || "").trim(),
            sold: 0,
            logged: 0,
            invoiced: 0
          };
          b.sold += num(row.Quantity);
          b.logged += num(row["Ore Loggate"]);
          b.invoiced += num(row["Ore Vendute Fatturate"]);
          map.set(key, b);
        }
        if (chunk.length < PAGE) break;
      }
      return map;
    })().catch((err) => {
      cache = null;
      throw err;
    });
  }
  return cache;
}

/** Budget delle commesse, caricato una volta sola e condiviso tra le pagine. */
export function useJobBudgets() {
  const [budgets, setBudgets] = useState<Map<string, JobBudget> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadJobBudgets()
      .then((m) => alive && setBudgets(m))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Dati commesse non disponibili"));
    return () => {
      alive = false;
    };
  }, []);
  return { budgets, error };
}

/** Incrocia il budget di ogni commessa con le ore dei task pianificati sul calendario. */
export function computeJobPlanning(budgets: Map<string, JobBudget> | null, tasks: Task[]): Map<string, JobPlanning> {
  const out = new Map<string, JobPlanning>();
  if (!budgets) return out;
  const planned = new Map<string, { open: number; total: number }>();
  for (const t of tasks) {
    if (isLeaveTask(t)) continue;
    const key = normalizeJobNo(t.commessa);
    if (!key || !budgets.has(key)) continue;
    const p = planned.get(key) ?? { open: 0, total: 0 };
    const h = num(t.hours);
    p.total += h;
    if (t.status !== "done") p.open += h;
    planned.set(key, p);
  }
  for (const [key, p] of planned) {
    const b = budgets.get(key)!;
    const available = b.sold - b.logged - p.open;
    out.set(key, { ...b, plannedOpen: p.open, plannedTotal: p.total, available, over: b.sold > 0 && available < -0.01 });
  }
  return out;
}
