import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";
import {
  dispatchSyncJobsWorkflowWithToken,
  getJobProgressLineNotes,
  getJobs,
  getJobsDataLastUpdate,
  getResources,
  saveJobProgressLineNote,
  syncJobsFromPrimarySource
} from "../api";
import type { Task } from "../types";
import Icon from "../components/Icon";
import { HOURS_PER_DAY, fmtEuro, fmtNum } from "../lib/planning";

export interface PlanningJob {
  jobNo: string;
  jobPlanNo: string;
  planDescription: string;
  division: string;
  customerName: string;
  parentChainName?: string;
  quantity: number;
  ogreLoggate: number;
  orePianificate: number;
  orePianificateAperte: number;
  oreResidueUfficiali: number;
  orePianificabili: number;
}

interface Props {
  tasks: Task[];
  onCreateTaskFromJob?: (job: PlanningJob) => void;
}

interface JobLine {
  jobNo: string;
  jobPlanNo: string;
  customerName: string;
  division: string;
  mainDescription: string;
  planDescription: string;
  soldHours: number;
  loggedHours: number;
  loggedActivities: number;
  enableInvoiceActivities: number;
  invoicedActivities: number;
  plannedHours: number;
  resourceNo: string;
  documentDate: string;
  soldValue: number;
}

interface JobAggregate {
  jobNo: string;
  customerName: string;
  division: string;
  mainDescription: string;
  soldHours: number;
  loggedHours: number;
  loggedActivities: number;
  enableInvoiceActivities: number;
  invoicedActivities: number;
  lineCount: number;
  documentDate: string;
}

type Scope = "bi" | "crm" | "all";
type SortKey = "job" | "date" | "progress" | "remaining";
type NewPeriod = "visit" | "7" | "30" | "month";
const VISIT_KEY = "apptaskbi_v2_last_visit_progress";
const NEW_PREVIEW = 6;

/** job_DocumentDate arriva come "YYYY-MM-DD HH:mm:ss" in UTC (es. 23:00 = mezzanotte italiana). */
function parseDocDate(value: string): Date | null {
  if (!value) return null;
  const iso = value.trim().replace(" ", "T");
  const d = new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}
const fmtDocDate = (value: string, withYear = true) => {
  const d = parseDocDate(value);
  return d ? d.toLocaleDateString("it-IT", withYear ? { day: "2-digit", month: "2-digit", year: "2-digit" } : { day: "numeric", month: "short" }) : "—";
};

const PAGE_SIZE = 1000;
const RENDER_STEP = 120;
const CRM_RESOURCE_NOS = ["CGSSWHOC", "CGSSWPMIC", "CGSSWRISC", "CGSWCRM", "PROGSWCRM"];
const TOKEN_KEY = "apptaskbi_sync_github_token";

const toNumber = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const pickMetric = (primary: unknown, fallback: number) =>
  primary === null || primary === undefined || primary === "" ? fallback : toNumber(primary);
const pct = (v: number, base: number) => (base > 0 ? (v / base) * 100 : 0);
const lineKeyOf = (l: JobLine) => [l.jobNo, l.jobPlanNo, l.planDescription].map((p) => (p || "").trim()).join("::");
const jobKeyOf = (jobNo: string) => `JOB::${(jobNo || "").trim()}`;
const fileTimestamp = () => {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}`;
};
const formatLastUpdate = (v: string | null) => {
  if (!v) return "non disponibile";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "non disponibile" : new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(d);
};

function statusOf(sold: number, logged: number) {
  if (logged <= 0) return { label: "Da avviare", fg: "#3D4B57", bg: "#EBF0F6" };
  if (sold <= 0) return { label: "Senza venduto", fg: "#9E2408", bg: "#FCE1D6" };
  const r = logged / sold;
  if (r > 1) return { label: "Sforata", fg: "#9E2408", bg: "#FCE1D6" };
  if (r >= 0.9) return { label: "In chiusura", fg: "#6E3D00", bg: "#FDEFD2" };
  return { label: "In linea", fg: "#002F80", bg: "#DCE7F8" };
}
const progressColor = (p: number) => (p > 100 ? "#C02B0A" : p >= 90 ? "#A85A00" : "#003DA6");

function Metrics({ sold, logged, enable, invoiced, small }: { sold: number; logged: number; enable: number; invoiced: number; small?: boolean }) {
  const p = pct(logged, sold);
  const fs = small ? 12 : 12.5;
  return (
    <>
      <div className="pg-cell" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: fs }} className="ui-num">
          <span style={{ color: "var(--ink-2)" }}>{fmtNum(logged)} / {fmtNum(sold)} h</span>
          <span style={{ fontWeight: 600, color: progressColor(p) }}>{fmtNum(p, 0)}%</span>
        </div>
        <div className={`ui-track${small ? " thin" : ""}`}>
          <div className="ui-fill" style={{ width: `${Math.min(p, 100)}%`, background: progressColor(p) }} />
        </div>
      </div>
      <div className="pg-cell" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span className="ui-num" style={{ fontSize: fs, color: "var(--ink-2)" }}>
          {fmtNum(invoiced, 0)} fatt. · {fmtNum(enable, 0)} enable
        </span>
        <div className={`ui-track${small ? " thin" : ""}`} title={`Enable ${fmtNum(pct(enable, sold))}% · Fatturate ${fmtNum(pct(invoiced, sold))}% del venduto`}>
          <div className="ui-fill" style={{ width: `${Math.min(pct(enable, sold), 100)}%`, background: "#9DB8E6" }} />
          <div className="ui-fill" style={{ width: `${Math.min(pct(invoiced, sold), 100)}%`, background: "#002F80" }} />
        </div>
      </div>
    </>
  );
}

function Remaining({ sold, logged, sub, small }: { sold: number; logged: number; sub?: string; small?: boolean }) {
  const rem = sold - logged;
  return (
    <div className="pg-cell right ui-num">
      <span style={{ fontSize: small ? 13 : 14, fontWeight: 600, color: rem < 0 ? "#C02B0A" : "var(--ink)" }}>
        {rem < 0 ? "−" : ""}{fmtNum(Math.abs(rem))} h
      </span>
      <span style={{ fontSize: small ? 11.5 : 12, color: "var(--muted)" }}>{sub ?? (rem >= 0 ? `${fmtNum(rem / HOURS_PER_DAY)} gg` : "sforato")}</span>
    </div>
  );
}

export default function ProgressPage({ tasks, onCreateTaskFromJob }: Props) {
  const [lines, setLines] = useState<JobLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>("bi");
  const [hideInvoiced, setHideInvoiced] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("job");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [resourceNames, setResourceNames] = useState<Record<string, string>>({});
  const [selectedRes, setSelectedRes] = useState<string[]>([]);
  const [resSearch, setResSearch] = useState("");
  const [showSync, setShowSync] = useState(false);
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  });
  const [renderLimit, setRenderLimit] = useState(RENDER_STEP);
  const [flashJob, setFlashJob] = useState<string | null>(null);
  const [prevVisit] = useState<number | null>(() => {
    try { const v = Number(localStorage.getItem(VISIT_KEY)); return v > 0 ? v : null; } catch { return null; }
  });
  const [newPeriod, setNewPeriod] = useState<NewPeriod>(() => (prevVisit ? "visit" : "30"));
  const [showAllNew, setShowAllNew] = useState(false);
  const noteTimers = useRef<Record<string, number>>({});

  const plannedByJob = useMemo(() => {
    const map: Record<string, { total: number; open: number }> = {};
    tasks.forEach((t) => {
      if (!t.commessa) return;
      const cur = map[t.commessa] || { total: 0, open: 0 };
      cur.total += toNumber(t.hours);
      if (t.status !== "done") cur.open += toNumber(t.hours);
      map[t.commessa] = cur;
    });
    return map;
  }, [tasks]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const rows: any[] = [];
      let offset = 0;
      const resourceFilter = scope === "bi" ? { resourceNo: "CGSSWPOW" } : scope === "crm" ? { resourceNos: CRM_RESOURCE_NOS } : {};
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const chunk = await getJobs({ limit: PAGE_SIZE, offset, ...resourceFilter });
        rows.push(...chunk);
        if (chunk.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      setLines(
        rows.map((row): JobLine => {
          const jobNo = String(row.JobNo || "");
          const logged = toNumber(row["Ore Loggate"]);
          const invoiced = toNumber(row["Ore Vendute Fatturate"]);
          const enable = toNumber(row["Ore TA PL"]) + invoiced;
          return {
            jobNo,
            jobPlanNo: String(row.JobPlanNo || ""),
            customerName: String(row["Customer Name"] || ""),
            division: String(row.Division || ""),
            mainDescription: String(row.job_description || ""),
            planDescription: String(row["Plan Description"] || ""),
            soldHours: toNumber(row.Quantity),
            loggedHours: logged,
            loggedActivities: pickMetric(row["Nr Attivita Loggate"], logged),
            enableInvoiceActivities: pickMetric(row["Nr Enable Invoice"], enable),
            invoicedActivities: pickMetric(row["Nr Fatturate"], invoiced),
            plannedHours: 0,
            resourceNo: String(row["Resource No"] || ""),
            documentDate: String(row.job_DocumentDate || ""),
            soldValue: toNumber(row.Quantity) * toNumber(row["Unit Price"])
          };
        })
      );
      setLastUpdate(await getJobsDataLastUpdate());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento avanzamento commesse");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    (async () => {
      try {
        const [n, r] = await Promise.all([getJobProgressLineNotes(), getResources()]);
        setNotes(n);
        setResourceNames(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore caricamento note");
      }
    })();
    const timers = noteTimers.current;
    return () => Object.values(timers).forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => { setSelectedRes([]); setRenderLimit(RENDER_STEP); }, [scope]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 3500);
  };

  const changeNote = (key: string, value: string) => {
    const v = value.slice(0, 500);
    setNotes((prev) => ({ ...prev, [key]: v }));
    if (noteTimers.current[key]) window.clearTimeout(noteTimers.current[key]);
    noteTimers.current[key] = window.setTimeout(async () => {
      delete noteTimers.current[key];
      try {
        await saveJobProgressLineNote(key, v);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore salvataggio nota");
      }
    }, 700);
  };

  const availableResources = useMemo(() => {
    if (scope !== "all") return [];
    const set = new Set<string>();
    lines.forEach((l) => l.resourceNo && set.add(l.resourceNo));
    return Array.from(set).sort();
  }, [lines, scope]);

  const filteredLines = useMemo(() => {
    const term = search.trim().toLowerCase();
    let base = lines.filter((l) => !l.jobNo.toUpperCase().startsWith("COIG"));
    if (scope === "all" && selectedRes.length) {
      const sel = new Set(selectedRes);
      base = base.filter((l) => sel.has(l.resourceNo));
    }
    if (!term) return base;
    return base.filter((l) =>
      [l.jobNo, l.jobPlanNo, l.customerName, l.division, l.mainDescription, l.planDescription].some((f) => f.toLowerCase().includes(term))
    );
  }, [lines, search, scope, selectedRes]);

  const linesByJob = useMemo(() => {
    const map = new Map<string, JobLine[]>();
    filteredLines.forEach((l) => {
      if (!map.has(l.jobNo)) map.set(l.jobNo, []);
      map.get(l.jobNo)!.push(l);
    });
    map.forEach((arr) => arr.sort((a, b) => a.jobPlanNo.localeCompare(b.jobPlanNo, undefined, { numeric: true })));
    return map;
  }, [filteredLines]);

  const aggregates = useMemo(() => {
    const map = new Map<string, JobAggregate>();
    filteredLines.forEach((l) => {
      const ex = map.get(l.jobNo);
      if (!ex) {
        map.set(l.jobNo, {
          jobNo: l.jobNo, customerName: l.customerName, division: l.division, mainDescription: l.mainDescription,
          soldHours: l.soldHours, loggedHours: l.loggedHours, loggedActivities: l.loggedActivities,
          enableInvoiceActivities: l.enableInvoiceActivities, invoicedActivities: l.invoicedActivities, lineCount: 1,
          documentDate: l.documentDate
        });
        return;
      }
      if (!ex.mainDescription && l.mainDescription) ex.mainDescription = l.mainDescription;
      ex.soldHours += l.soldHours;
      ex.loggedHours += l.loggedHours;
      ex.loggedActivities += l.loggedActivities;
      ex.enableInvoiceActivities += l.enableInvoiceActivities;
      ex.invoicedActivities += l.invoicedActivities;
      ex.lineCount += 1;
      if (l.documentDate && (!ex.documentDate || l.documentDate < ex.documentDate)) ex.documentDate = l.documentDate;
    });
    let all = Array.from(map.values());
    if (hideInvoiced) all = all.filter((j) => j.soldHours <= 0 || j.invoicedActivities < j.soldHours);
    if (sortKey === "progress") all.sort((a, b) => pct(b.loggedHours, b.soldHours) - pct(a.loggedHours, a.soldHours));
    else if (sortKey === "date") all.sort((a, b) => (b.documentDate || "").localeCompare(a.documentDate || "") || b.jobNo.localeCompare(a.jobNo));
    else if (sortKey === "remaining") all.sort((a, b) => (a.soldHours - a.loggedHours) - (b.soldHours - b.loggedHours));
    else all.sort((a, b) => b.jobNo.localeCompare(a.jobNo));
    return all;
  }, [filteredLines, hideInvoiced, sortKey]);

  const visibleJobNos = useMemo(() => new Set(aggregates.map((a) => a.jobNo)), [aggregates]);
  const visibleLinesCount = useMemo(() => filteredLines.filter((l) => visibleJobNos.has(l.jobNo)).length, [filteredLines, visibleJobNos]);

  const totals = useMemo(() => {
    const t = aggregates.reduce(
      (acc, j) => ({
        sold: acc.sold + j.soldHours,
        logged: acc.logged + j.loggedHours,
        enable: acc.enable + j.enableInvoiceActivities,
        invoiced: acc.invoiced + j.invoicedActivities
      }),
      { sold: 0, logged: 0, enable: 0, invoiced: 0 }
    );
    return { ...t, remaining: t.sold - t.logged };
  }, [aggregates]);

  const alerts = useMemo(() => {
    const out: { jobNo: string; customer: string; line: string; p: number }[] = [];
    filteredLines.forEach((l) => {
      if (visibleJobNos.has(l.jobNo) && l.soldHours > 0 && l.loggedHours > l.soldHours) {
        out.push({ jobNo: l.jobNo, customer: l.customerName, line: l.planDescription || `riga ${l.jobPlanNo}`, p: pct(l.loggedHours, l.soldHours) });
      }
    });
    return out.sort((a, b) => b.p - a.p);
  }, [filteredLines, visibleJobNos]);

  useEffect(() => {
    if (!loading && lines.length > 0) {
      try { localStorage.setItem(VISIT_KEY, String(Date.now())); } catch { /* ignore */ }
    }
  }, [loading, lines.length]);

  const newCutoff = useMemo(() => {
    const now = new Date();
    if (newPeriod === "visit" && prevVisit) return new Date(prevVisit);
    if (newPeriod === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
    const days = newPeriod === "7" ? 7 : 30;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  }, [newPeriod, prevVisit]);

  const newJobs = useMemo(() => {
    const sel = new Set(selectedRes);
    const map = new Map<string, { jobNo: string; date: string; customer: string; description: string; division: string; sold: number; logged: number; value: number; lines: number; resources: Set<string> }>();
    lines.forEach((l) => {
      if (l.jobNo.toUpperCase().startsWith("COIG")) return;
      if (scope === "all" && sel.size && !sel.has(l.resourceNo)) return;
      const ex = map.get(l.jobNo);
      if (!ex) {
        map.set(l.jobNo, { jobNo: l.jobNo, date: l.documentDate, customer: l.customerName, description: l.mainDescription, division: l.division,
          sold: l.soldHours, logged: l.loggedHours, value: l.soldValue, lines: 1, resources: new Set(l.resourceNo ? [l.resourceNo] : []) });
        return;
      }
      if (l.documentDate && (!ex.date || l.documentDate < ex.date)) ex.date = l.documentDate;
      ex.sold += l.soldHours;
      ex.logged += l.loggedHours;
      ex.value += l.soldValue;
      ex.lines += 1;
      if (l.resourceNo) ex.resources.add(l.resourceNo);
    });
    return Array.from(map.values())
      .filter((j) => { const d = parseDocDate(j.date); return !!d && d >= newCutoff; })
      .sort((a, b) => b.date.localeCompare(a.date) || b.jobNo.localeCompare(a.jobNo));
  }, [lines, scope, selectedRes, newCutoff]);
  const newJobNos = useMemo(() => new Set(newJobs.map((j) => j.jobNo)), [newJobs]);
  const periodAutoChecked = useRef(false);
  useEffect(() => {
    // Se dall'ultima visita non è entrato nulla, mostra gli ultimi 30 giorni invece di una lista vuota
    if (loading || lines.length === 0 || periodAutoChecked.current) return;
    periodAutoChecked.current = true;
    if (newPeriod === "visit" && newJobs.length === 0) setNewPeriod("30");
  }, [loading, lines.length, newPeriod, newJobs.length]);
  const newTotals = useMemo(() => newJobs.reduce((a, j) => ({ hours: a.hours + j.sold, value: a.value + j.value }), { hours: 0, value: 0 }), [newJobs]);
  const newPeriodText =
    newPeriod === "visit" && prevVisit
      ? `dall'ultima visita (${new Date(prevVisit).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})`
      : newPeriod === "7" ? "negli ultimi 7 giorni" : newPeriod === "month" ? "da inizio mese" : "negli ultimi 30 giorni";

  const openNewJob = (jobNo: string) => {
    setSearch("");
    setHideInvoiced(false);
    window.setTimeout(() => goToJob(jobNo), 80);
  };

  const goToJob = (jobNo: string) => {
    setExpanded((prev) => ({ ...prev, [jobNo]: true }));
    const idx = aggregates.findIndex((a) => a.jobNo === jobNo);
    if (idx >= renderLimit) setRenderLimit(idx + RENDER_STEP);
    setFlashJob(jobNo);
    window.setTimeout(() => {
      document.getElementById(`job-${jobNo}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    window.setTimeout(() => setFlashJob((cur) => (cur === jobNo ? null : cur)), 1700);
  };

  const dispatchStaticSync = async () => {
    const t = token.trim();
    if (!t) {
      setShowSync(true);
      flash("Modalità statica: inserisci il token GitHub nelle impostazioni di sincronizzazione.");
      return;
    }
    const res = await dispatchSyncJobsWorkflowWithToken(t);
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
    flash(res.message);
  };

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      try {
        const res = await syncJobsFromPrimarySource();
        const msg = res.message || "Aggiornamento dati completato";
        if (/modalit[aà] statica/i.test(msg)) { await dispatchStaticSync(); return; }
        flash(msg);
        await loadData();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (!/modalit[aà] statica/i.test(msg)) throw err;
        await dispatchStaticSync();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore aggiornamento dati da CRM");
    } finally {
      setRefreshing(false);
    }
  };

  const saveToken = () => {
    const t = token.trim();
    if (!t) return flash("Inserisci un token valido prima di salvarlo.");
    try { localStorage.setItem(TOKEN_KEY, t); flash("Token salvato in questo browser."); } catch { setError("Impossibile salvare il token."); }
  };
  const clearToken = () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    setToken("");
    flash("Token rimosso.");
  };

  const exportExcel = () => {
    try {
      setExporting(true);
      const header = ["Commessa", "Cliente", "Descrizione principale", "Division", "Venduto", "Loggato", "Base confronto", "Enable invoice", "Fatturate", "Avanzamento %", "Ore rimanenti", "Giorni rimanenti", "Stato", "Note commessa"];
      const summary: (string | number)[][] = [
        ["Avanzamento Commesse"],
        [`Generato il: ${new Date().toLocaleString("it-IT")}`],
        [`Filtro testo: ${search || "(nessuno)"}`],
        [`Gruppo: ${scope === "bi" ? "BI (CGSSWPOW)" : scope === "crm" ? "CRM" : "Tutti"}${selectedRes.length ? ` · Risorse: ${selectedRes.join(", ")}` : ""}`],
        [`Ultimo aggiornamento sorgente: ${formatLastUpdate(lastUpdate)}`],
        [`Commesse: ${aggregates.length}`, `Righe: ${visibleLinesCount}`, `Venduto: ${totals.sold.toFixed(1)}`, `Loggato: ${totals.logged.toFixed(1)}`, `Enable: ${totals.enable.toFixed(0)}`, `Fatturate: ${totals.invoiced.toFixed(0)}`, `Rimanenti: ${totals.remaining.toFixed(1)}`],
        header,
        ...aggregates.map((j) => {
          const rem = j.soldHours - j.loggedHours;
          return [j.jobNo || "-", j.customerName || "-", j.mainDescription || "-", j.division || "-", j.soldHours, j.loggedHours, j.loggedActivities,
            j.enableInvoiceActivities, j.invoicedActivities, pct(j.loggedHours, j.soldHours), rem, rem / HOURS_PER_DAY,
            statusOf(j.soldHours, j.loggedHours).label, notes[jobKeyOf(j.jobNo)] || ""];
        })
      ];
      const detailLines = filteredLines.filter((l) => visibleJobNos.has(l.jobNo));
      const detail: (string | number)[][] = [
        ["Dettaglio righe commessa"],
        ["Commessa", "Riga", "Cliente", "Division", "Risorsa", "Descrizione principale", "Descrizione riga", "Venduto", "Loggato", "Base confronto", "Enable invoice", "Fatturate", "Avanzamento %", "Ore rimanenti", "Giorni rimanenti", "Stato", "Note"],
        ...detailLines.map((l) => {
          const rem = l.soldHours - l.loggedHours;
          return [l.jobNo || "-", l.jobPlanNo || "-", l.customerName || "-", l.division || "-", l.resourceNo || "-", l.mainDescription || "-", l.planDescription || "-",
            l.soldHours, l.loggedHours, l.loggedActivities, l.enableInvoiceActivities, l.invoicedActivities, pct(l.loggedHours, l.soldHours),
            rem, rem / HOURS_PER_DAY, statusOf(l.soldHours, l.loggedHours).label, notes[lineKeyOf(l)] || ""];
        })
      ];
      const wb = XLSX.utils.book_new();
      const wsS = XLSX.utils.aoa_to_sheet(summary);
      const wsD = XLSX.utils.aoa_to_sheet(detail);
      wsS["!cols"] = [14, 28, 38, 12, 11, 11, 12, 12, 11, 13, 14, 15, 14, 42].map((wch) => ({ wch }));
      wsD["!cols"] = [14, 8, 28, 12, 12, 32, 36, 11, 11, 12, 12, 11, 13, 14, 15, 14, 42].map((wch) => ({ wch }));
      const border = { style: "thin", color: { rgb: "E3E6EB" } };
      const base = { font: { name: "Segoe UI", sz: 10, color: { rgb: "15181D" } }, alignment: { vertical: "center", wrapText: true }, border: { top: border, bottom: border, left: border, right: border } };
      const title = { ...base, font: { name: "Segoe UI", sz: 14, bold: true, color: { rgb: "15181D" } } };
      const head = { ...base, font: { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: "15181D" } }, alignment: { vertical: "center", horizontal: "center", wrapText: true } };
      const num = { ...base, numFmt: "0.0", alignment: { vertical: "center", horizontal: "right" } };
      const neg = { ...num, font: { name: "Segoe UI", sz: 10, color: { rgb: "C2410C" } } };
      const style = (ws: XLSX.WorkSheet, r: number, c: number, s: any) => {
        const a = XLSX.utils.encode_cell({ r, c });
        if (ws[a]) ws[a].s = s;
      };
      const styleSheet = (ws: XLSX.WorkSheet, data: (string | number)[][], headRow: number, cols: number, numCols: number[], pctCol: number, remCols: number[]) => {
        style(ws, 0, 0, title);
        for (let c = 0; c < cols; c++) style(ws, headRow, c, head);
        for (let r = headRow + 1; r < data.length; r++) {
          for (let c = 0; c < cols; c++) style(ws, r, c, numCols.includes(c) ? num : base);
          if (Number(data[r][pctCol]) > 100) style(ws, r, pctCol, neg);
          remCols.forEach((c) => { if (Number(data[r][c]) < 0) style(ws, r, c, neg); });
        }
      };
      styleSheet(wsS, summary, 6, 14, [4, 5, 6, 7, 8, 9, 10, 11], 9, [10, 11]);
      styleSheet(wsD, detail, 1, 17, [7, 8, 9, 10, 11, 12, 13, 14], 12, [13, 14]);
      XLSX.utils.book_append_sheet(wb, wsS, "Riepilogo");
      XLSX.utils.book_append_sheet(wb, wsD, "Dettaglio Righe");
      XLSX.writeFile(wb, `avanzamento_commesse_${fileTimestamp()}.xlsx`, { compression: true });
      flash("Export Excel completato.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante export Excel");
    } finally {
      setExporting(false);
    }
  };

  const resChips = availableResources.filter((r) => {
    const q = resSearch.trim().toLowerCase();
    return !q || r.toLowerCase().includes(q) || (resourceNames[r] || "").toLowerCase().includes(q);
  });

  const kpis = [
    { label: "Ore vendute", value: totals.sold, p: 100, color: "#C9D5E3", sub: `${aggregates.length} commesse · ${visibleLinesCount} righe` },
    { label: "Ore loggate", value: totals.logged, p: pct(totals.logged, totals.sold), color: "#003DA6", sub: `${fmtNum(pct(totals.logged, totals.sold), 0)}% del venduto` },
    { label: "Enable invoice", value: totals.enable, p: pct(totals.enable, totals.sold), color: "#9DB8E6", sub: `${fmtNum(pct(totals.enable, totals.sold), 0)}% del venduto` },
    { label: "Fatturate", value: totals.invoiced, p: pct(totals.invoiced, totals.sold), color: "#002F80", sub: `${fmtNum(pct(totals.invoiced, totals.sold), 0)}% del venduto` },
    { label: "Residuo", value: totals.remaining, p: pct(Math.max(totals.remaining, 0), totals.sold), color: "#0F8A5F", sub: `${fmtNum(totals.remaining / HOURS_PER_DAY)} giornate` }
  ];

  const shown = aggregates.slice(0, renderLimit);

  return (
    <div className="ui-page">
      <header className="ui-header">
        <div>
          <div className="ui-eyebrow">Commesse · dati aggiornati al {formatLastUpdate(lastUpdate)}</div>
          <h1 className="ui-title">Avanzamento commesse</h1>
        </div>
        <div className="ui-row">
          <button className="ui-btn icon" aria-label="Impostazioni sincronizzazione" aria-expanded={showSync} onClick={() => setShowSync((v) => !v)} title="Impostazioni sincronizzazione">
            <Icon name="gear" />
          </button>
          <button className="ui-btn" onClick={refresh} disabled={refreshing}>
            <Icon name="refresh" /> {refreshing ? "Aggiornamento…" : "Aggiorna dati"}
          </button>
          <button className="ui-btn primary" onClick={exportExcel} disabled={exporting || loading}>
            <Icon name="download" /> {exporting ? "Esportazione…" : "Esporta Excel"}
          </button>
        </div>
      </header>

      {showSync && (
        <section className="ui-card ui-card-pad" aria-label="Impostazioni sincronizzazione" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label className="ui-field" style={{ flex: "1 1 320px" }}>
            Token GitHub per la sincronizzazione (versione pubblicata)
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" autoComplete="off" />
          </label>
          <button className="ui-btn" onClick={saveToken}>Salva token</button>
          <button className="ui-btn ghost" onClick={clearToken}>Rimuovi</button>
          <span className="ui-muted" style={{ fontSize: 12.5, flexBasis: "100%" }}>Il token resta solo in questo browser e serve ad avviare il workflow di sync quando l'app gira come sito statico.</span>
        </section>
      )}

      {error && (
        <div className="ui-alert error" role="alert">
          {error}
          <button className="ui-btn sm ghost" onClick={() => setError(null)}>Chiudi</button>
        </div>
      )}
      {notice && <div className="ui-alert success" role="status">{notice}</div>}

      <section className="ui-kpis five" aria-label="Totali">
        {kpis.map((k) => (
          <div key={k.label} className="ui-card ui-card-pad ui-kpi">
            <span className="ui-kpi-label">{k.label}</span>
            {loading ? (
              <div className="ui-skeleton" style={{ height: 30, width: "60%" }} />
            ) : (
              <div className="ui-row" style={{ alignItems: "baseline", gap: 6 }}>
                <span className="ui-kpi-value" style={{ color: k.value < 0 ? "#C02B0A" : undefined }}>{fmtNum(k.value, 0)}</span>
                <span className="ui-kpi-sub">h</span>
              </div>
            )}
            <div className="ui-track thin"><div className="ui-fill" style={{ width: `${Math.min(Math.max(k.p, 0), 100)}%`, background: k.color }} /></div>
            <span className="ui-kpi-sub">{k.sub}</span>
          </div>
        ))}
      </section>

      <section className="ui-card ui-card-pad" aria-label="Filtri" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px" }}>
        <div className="ui-row" style={{ gap: 12 }}>
          <label className="ui-search">
            <Icon name="search" />
            <span className="ui-sr">Cerca</span>
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setRenderLimit(RENDER_STEP); }} placeholder="Cerca commessa, cliente o riga…" />
          </label>
          <div className="ui-seg" role="group" aria-label="Gruppo">
            {(["bi", "crm", "all"] as Scope[]).map((s) => (
              <button key={s} aria-pressed={scope === s} onClick={() => setScope(s)}>{s === "all" ? "Tutti" : s.toUpperCase()}</button>
            ))}
          </div>
          <button className="ui-btn" aria-pressed={hideInvoiced} onClick={() => setHideInvoiced((v) => !v)}>
            <span className={`ui-checkbox${hideInvoiced ? " on" : ""}`}>
              {hideInvoiced && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
              )}
            </span>
            Nascondi commesse fatturate
          </button>
        </div>
        {scope === "all" && availableResources.length > 0 && (
          <div className="ui-row" style={{ gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 500, marginRight: 4 }}>Risorsa generica</span>
            {availableResources.length > 10 && (
              <input value={resSearch} onChange={(e) => setResSearch(e.target.value)} placeholder="Filtra risorse…" aria-label="Filtra risorse"
                style={{ height: 32, border: "1px solid #C9D5E3", borderRadius: 999, padding: "0 12px", fontSize: 13, width: 160 }} />
            )}
            {resChips.map((r) => {
              const on = selectedRes.includes(r);
              return (
                <button key={r} className="ui-chip" aria-pressed={on}
                  onClick={() => setSelectedRes((prev) => (on ? prev.filter((x) => x !== r) : [...prev, r]))}
                  title={resourceNames[r] || r}>
                  <span className="ui-mono" style={{ fontWeight: 600, fontSize: 11.5 }}>{r}</span>
                  {resourceNames[r] && <span>{resourceNames[r]}</span>}
                </button>
              );
            })}
            {selectedRes.length > 0 && (
              <button className="ui-btn ghost sm" style={{ color: "var(--accent)" }} onClick={() => setSelectedRes([])}>Azzera</button>
            )}
          </div>
        )}
      </section>

      <section className="ui-card" aria-label="Commesse nuove" style={{ overflow: "hidden" }}>
        <div className="ui-card-head" style={{ flexWrap: "wrap" }}>
          <div className="ui-row" style={{ gap: 10 }}>
            <h2 className="ui-h2">Commesse nuove</h2>
            {!loading && (
              <span className="ui-pill" style={{ background: newJobs.length ? "var(--accent-soft)" : "#EBF0F6", color: newJobs.length ? "var(--accent-ink)" : "var(--ink-2)" }}>
                {newJobs.length}
              </span>
            )}
            {!loading && newJobs.length > 0 && (
              <span className="ui-muted ui-num" style={{ fontSize: 12.5 }}>{fmtNum(newTotals.hours, 0)} h vendute · {fmtEuro(newTotals.value)}</span>
            )}
          </div>
          <div className="ui-seg" role="group" aria-label="Periodo commesse nuove">
            {prevVisit && <button aria-pressed={newPeriod === "visit"} onClick={() => setNewPeriod("visit")}>Dall'ultima visita</button>}
            <button aria-pressed={newPeriod === "7"} onClick={() => setNewPeriod("7")}>7 giorni</button>
            <button aria-pressed={newPeriod === "30"} onClick={() => setNewPeriod("30")}>30 giorni</button>
            <button aria-pressed={newPeriod === "month"} onClick={() => setNewPeriod("month")}>Questo mese</button>
          </div>
        </div>
        {loading ? (
          <div style={{ padding: "14px 16px" }}><div className="ui-skeleton" style={{ width: "50%" }} /></div>
        ) : newJobs.length === 0 ? (
          <div className="ui-muted" style={{ padding: "14px 16px", fontSize: 13.5 }}>Nessuna commessa nuova {newPeriodText}.</div>
        ) : (
          <div className="cal-scroll">
            <div style={{ minWidth: 900 }}>
              {(showAllNew ? newJobs : newJobs.slice(0, NEW_PREVIEW)).map((j) => {
                const planned = plannedByJob[j.jobNo] || { total: 0, open: 0 };
                const remaining = j.sold - j.logged;
                return (
                  <div key={j.jobNo} className="nj-row">
                    <span className="ui-num" style={{ fontSize: 13, fontWeight: 600 }}>{fmtDocDate(j.date, false)}</span>
                    <span className="ui-mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{j.jobNo}</span>
                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.customer || "—"}</span>
                      <span style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={j.description}>
                        {j.description || "—"} · {j.lines === 1 ? "1 riga" : `${j.lines} righe`}
                      </span>
                    </div>
                    <span className="ui-num" style={{ textAlign: "right", fontSize: 13.5, fontWeight: 600 }}>{fmtNum(j.sold)} h</span>
                    <span className="ui-num" style={{ textAlign: "right", fontSize: 13.5 }}>{j.value > 0 ? fmtEuro(j.value) : "—"}</span>
                    <span style={{ fontSize: 12.5, color: planned.total > 0 ? "var(--ink-2)" : "var(--muted)" }}>
                      {planned.total > 0 ? `${fmtNum(planned.total)} h pianificate` : "da pianificare"}
                    </span>
                    <div className="ui-row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <button className="ui-btn sm" onClick={() => openNewJob(j.jobNo)}>Apri</button>
                      <button className="ui-btn sm" onClick={() => onCreateTaskFromJob?.({
                        jobNo: j.jobNo, jobPlanNo: "", planDescription: j.description || `Task per ${j.jobNo}`, division: j.division,
                        customerName: j.customer, quantity: j.sold, ogreLoggate: j.logged, orePianificate: planned.total,
                        orePianificateAperte: planned.open, oreResidueUfficiali: Math.max(0, remaining),
                        orePianificabili: Math.max(0, remaining - planned.open)
                      })}>
                        <Icon name="plus" size={13} strokeWidth={2} /> Task
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!loading && newJobs.length > NEW_PREVIEW && (
          <div style={{ padding: "8px 16px", borderTop: "1px solid var(--line-soft)" }}>
            <button className="ui-btn sm ghost" style={{ color: "var(--accent)" }} onClick={() => setShowAllNew((v) => !v)}>
              {showAllNew ? "Mostra meno" : `Mostra tutte (${newJobs.length})`}
            </button>
          </div>
        )}
      </section>

      {!loading && alerts.length > 0 && (
        <section className="pg-alerts" aria-label="Righe da attenzionare">
          <span style={{ color: "#C02B0A", display: "inline-flex" }}><Icon name="alert" size={18} /></span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "#7A1C06", marginRight: 6 }}>
            {alerts.length === 1 ? "1 riga oltre il venduto" : `${alerts.length} righe oltre il venduto`}
          </span>
          {alerts.slice(0, 8).map((a, i) => (
            <button key={`${a.jobNo}-${i}`} className="pg-alert-chip" onClick={() => goToJob(a.jobNo)}>
              <span style={{ fontWeight: 600 }}>{a.customer || a.jobNo}</span>
              <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.line}</span>
              <span className="ui-mono" style={{ fontWeight: 600, fontSize: 12 }}>{fmtNum(a.p, 0)}%</span>
            </button>
          ))}
          {alerts.length > 8 && <span style={{ fontSize: 13, color: "#7A1C06" }}>e altre {alerts.length - 8}</span>}
        </section>
      )}

      <section className="ui-card" aria-label="Tabella avanzamento" style={{ overflow: "hidden" }}>
        <div className="ui-card-head">
          <h2 className="ui-h2">{loading ? "Caricamento commesse…" : `${aggregates.length} commesse · ${visibleLinesCount} righe`}</h2>
          <div className="ui-row" style={{ gap: 6 }}>
            <label style={{ fontSize: 13, color: "var(--muted)" }}>
              Ordina
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
                style={{ height: 32, border: "1px solid #C9D5E3", borderRadius: 8, padding: "0 8px", background: "#fff", fontSize: 13, color: "var(--ink)" }}>
                <option value="job">Numero commessa</option>
                <option value="date">Data ordine (recenti)</option>
                <option value="progress">Avanzamento più alto</option>
                <option value="remaining">Residuo più basso</option>
              </select>
            </label>
            <button className="ui-btn sm" onClick={() => setExpanded(Object.fromEntries(aggregates.map((a) => [a.jobNo, true])))}>Espandi tutte</button>
            <button className="ui-btn sm" onClick={() => setExpanded({})}>Chiudi tutte</button>
          </div>
        </div>
        <div className="cal-scroll">
          <div style={{ minWidth: 1060 }}>
            <div className="pg-grid pg-head">
              <span />
              <span>Commessa</span>
              <span>Cliente e descrizione</span>
              <span>Avanzamento ore</span>
              <span>Fatturazione</span>
              <span style={{ textAlign: "right" }}>Residuo</span>
              <span>Stato</span>
              <span>Note</span>
              <span />
            </div>

            {loading &&
              Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="pg-grid pg-job" style={{ padding: "0 8px" }}>
                  <span />
                  <div className="ui-skeleton" style={{ width: 80 }} />
                  <div className="ui-skeleton" style={{ width: "70%" }} />
                  <div className="ui-skeleton" style={{ width: "80%" }} />
                  <div className="ui-skeleton" style={{ width: "80%" }} />
                </div>
              ))}

            {!loading && aggregates.length === 0 && (
              <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 14 }} className="ui-muted">Nessuna commessa corrisponde ai filtri.</div>
            )}

            {!loading &&
              shown.map((job) => {
                const open = !!expanded[job.jobNo];
                const st = statusOf(job.soldHours, job.loggedHours);
                const jobKey = jobKeyOf(job.jobNo);
                const planned = plannedByJob[job.jobNo] || { total: 0, open: 0 };
                const remaining = job.soldHours - job.loggedHours;
                const pianificabili = Math.max(0, remaining - planned.open);
                const detail = linesByJob.get(job.jobNo) || [];
                return (
                  <div key={job.jobNo} id={`job-${job.jobNo}`}>
                    <div className={`pg-grid pg-job${flashJob === job.jobNo ? " pg-flash" : ""}`}>
                      <button className="ui-btn ghost" style={{ width: 32, height: 32, padding: 0, marginLeft: 6 }}
                        aria-expanded={open} aria-label={`${open ? "Chiudi" : "Espandi"} righe di ${job.jobNo}`}
                        onClick={() => setExpanded((prev) => ({ ...prev, [job.jobNo]: !open }))}>
                        <span style={{ display: "inline-flex", transition: "transform .15s", transform: `rotate(${open ? 90 : 0}deg)` }}><Icon name="right" strokeWidth={2} /></span>
                      </button>
                      <div className="pg-cell" style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                        <span className="ui-mono" style={{ fontSize: 13, fontWeight: 600 }}>{job.jobNo}</span>
                        {newJobNos.has(job.jobNo) ? (
                          <span className="ui-pill" style={{ height: 18, fontSize: 11, padding: "0 7px", background: "var(--accent-soft)", color: "var(--accent-ink)" }}>Nuova · {fmtDocDate(job.documentDate, false)}</span>
                        ) : (
                          <span className="ui-muted ui-num" style={{ fontSize: 11.5 }} title="Data ordine">{fmtDocDate(job.documentDate)}</span>
                        )}
                      </div>
                      <div className="pg-cell" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{job.customerName || "—"}</span>
                        <span style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={job.mainDescription}>
                          {job.mainDescription || "—"} · {job.lineCount === 1 ? "1 riga" : `${job.lineCount} righe`}{job.division ? ` · ${job.division}` : ""}
                        </span>
                      </div>
                      <Metrics sold={job.soldHours} logged={job.loggedHours} enable={job.enableInvoiceActivities} invoiced={job.invoicedActivities} />
                      <Remaining sold={job.soldHours} logged={job.loggedHours} />
                      <span className="pg-cell"><span className="ui-pill" style={{ background: st.bg, color: st.fg }}>{st.label}</span></span>
                      <div className="pg-cell">
                        <textarea className="pg-note" rows={1} value={notes[jobKey] || ""} placeholder="Nota commessa…"
                          aria-label={`Nota commessa ${job.jobNo}`} onChange={(e) => changeNote(jobKey, e.target.value)} />
                      </div>
                      <div className="pg-cell">
                        <button className="ui-btn sm" title={pianificabili > 0 ? `${fmtNum(pianificabili)} h ancora pianificabili` : "Commessa già coperta: puoi comunque aggiungere"}
                          onClick={() => onCreateTaskFromJob?.({
                            jobNo: job.jobNo, jobPlanNo: "", planDescription: job.mainDescription || `Task per ${job.jobNo}`, division: job.division,
                            customerName: job.customerName, quantity: job.soldHours, ogreLoggate: job.loggedHours, orePianificate: planned.total,
                            orePianificateAperte: planned.open, oreResidueUfficiali: Math.max(0, remaining), orePianificabili: pianificabili
                          })}>
                          <Icon name="plus" size={13} strokeWidth={2} /> Task
                        </button>
                      </div>
                    </div>
                    {open &&
                      detail.map((line) => {
                        const lk = lineKeyOf(line);
                        const lst = statusOf(line.soldHours, line.loggedHours);
                        const lrem = line.soldHours - line.loggedHours;
                        return (
                          <div key={lk} className="pg-grid pg-line">
                            <span />
                            <span className="pg-cell ui-mono" style={{ fontSize: 12.5, color: "var(--ink-2)", paddingLeft: 22 }}>riga {line.jobPlanNo || "—"}</span>
                            <div className="pg-cell" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={line.planDescription}>{line.planDescription || "—"}</span>
                              {line.resourceNo && (
                                <span className="ui-tag" style={{ background: "#EBF0F6", color: "#3D4B57", flex: "none" }} title={resourceNames[line.resourceNo] || line.resourceNo}>
                                  {line.resourceNo}
                                </span>
                              )}
                            </div>
                            <Metrics small sold={line.soldHours} logged={line.loggedHours} enable={line.enableInvoiceActivities} invoiced={line.invoicedActivities} />
                            <Remaining small sold={line.soldHours} logged={line.loggedHours} />
                            <span className="pg-cell"><span className="ui-pill" style={{ background: lst.bg, color: lst.fg }}>{lst.label}</span></span>
                            <div className="pg-cell">
                              <textarea className="pg-note" rows={1} value={notes[lk] || ""} placeholder="Aggiungi nota…"
                                aria-label={`Nota riga ${line.jobPlanNo} di ${line.jobNo}`} onChange={(e) => changeNote(lk, e.target.value)} />
                            </div>
                            <div className="pg-cell">
                              <button className="ui-btn sm"
                                onClick={() => onCreateTaskFromJob?.({
                                  jobNo: line.jobNo, jobPlanNo: line.jobPlanNo, planDescription: line.planDescription || `Riga ${line.jobPlanNo} — ${line.jobNo}`,
                                  division: line.division, customerName: line.customerName, quantity: line.soldHours, ogreLoggate: line.loggedHours,
                                  orePianificate: line.plannedHours, orePianificateAperte: 0, oreResidueUfficiali: Math.max(0, lrem), orePianificabili: Math.max(0, lrem)
                                })}>
                                <Icon name="plus" size={13} strokeWidth={2} /> Task
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}

            {!loading && aggregates.length > shown.length && (
              <div style={{ padding: 16, display: "flex", justifyContent: "center" }}>
                <button className="ui-btn" onClick={() => setRenderLimit((n) => n + RENDER_STEP)}>
                  Mostra altre {Math.min(RENDER_STEP, aggregates.length - shown.length)} commesse ({aggregates.length - shown.length} rimanenti)
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="cal-legend">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="cal-swatch" style={{ background: "#002F80", height: 6 }} />Fatturate</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="cal-swatch" style={{ background: "#9DB8E6", height: 6 }} />Enable invoice</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="ui-pill" style={{ background: "#FCE1D6", color: "#9E2408", height: 20 }}>Sforata</span>loggato oltre il venduto</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="ui-pill" style={{ background: "#FDEFD2", color: "#6E3D00", height: 20 }}>In chiusura</span>oltre il 90%</span>
          <span className="ui-muted" style={{ marginLeft: "auto" }}>Avanzamento = ore loggate su vendute · fatturazione rispetto al venduto</span>
        </div>
      </section>
    </div>
  );
}
