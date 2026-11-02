import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { dispatchSyncJobsWorkflowWithToken, getJobProgressLineNotes, getJobs, getJobsDataLastUpdate, getResources, saveJobProgressLineNote, syncJobsFromPrimarySource } from "./api";
import type { Task } from "./types";

interface Props {
  tasks: Task[];
  onSwitchPage: (page: "manage" | "jobs" | "stats" | "database") => void;
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
}

interface PlannedHoursByJob {
  total: number;
  open: number;
}

interface PlanningJob {
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

const HOURS_PER_DAY = 8;
const PAGE_SIZE = 1000;
const CRM_RESOURCE_NOS = ["CGSSWHOC", "CGSSWPMIC", "CGSSWRISC", "CGSWCRM", "PROGSWCRM"];
type GroupScope = "bi" | "crm" | "all";

const STORAGE_KEYS = {
  syncToken: "apptaskbi_sync_github_token"
} as const;

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function pickMetric(primary: unknown, fallback: number): number {
  if (primary === null || primary === undefined || primary === "") {
    return fallback;
  }
  return toNumber(primary);
}

function getProgressPercent(loggedHours: number, soldHours: number): number {
  if (soldHours <= 0) {
    return 0;
  }
  return (loggedHours / soldHours) * 100;
}

function formatHours(value: number): string {
  return `${value.toFixed(1)}h`;
}

function formatDays(value: number): string {
  return `${value.toFixed(1)} gg`;
}

function formatLastUpdate(lastUpdate: string | null): string {
  if (!lastUpdate) {
    return "non disponibile";
  }

  const parsed = new Date(lastUpdate);
  if (Number.isNaN(parsed.getTime())) {
    return "non disponibile";
  }

  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

function ProgressBarCell({ loggedHours, soldHours }: { loggedHours: number; soldHours: number }) {
  const percent = getProgressPercent(loggedHours, soldHours);
  const width = Math.min(percent, 100);
  const overrun = percent > 100;

  return (
    <div className="job-progress-cell">
      <div className="job-progress-track">
        <div
          className={`job-progress-fill ${overrun ? "overrun" : "normal"}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`job-progress-text ${overrun ? "overrun" : ""}`}>{percent.toFixed(1)}%</span>
    </div>
  );
}

function ActivityProgressCell({
  value,
  baseline,
  tone
}: {
  value: number;
  baseline: number;
  tone: "enable" | "invoice";
}) {
  const percent = getProgressPercent(value, baseline);
  const width = Math.min(percent, 100);
  const overrun = percent > 100;

  return (
    <div className="job-progress-cell">
      <div className="job-progress-track">
        <div
          className={`job-progress-fill ${overrun ? "overrun" : tone}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`job-progress-text ${overrun ? "overrun" : ""}`}>{percent.toFixed(1)}%</span>
    </div>
  );
}

function fileTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function getLineStorageKey(line: JobLine): string {
  return [line.jobNo, line.jobPlanNo, line.planDescription].map((part) => (part || "").trim()).join("::");
}

function getJobStorageKey(jobNo: string): string {
  return `JOB::${(jobNo || "").trim()}`;
}

function readStoredToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.syncToken) || "";
  } catch {
    return "";
  }
}

export default function JobProgressPage({ tasks, onSwitchPage, onCreateTaskFromJob }: Props) {
  const [jobLines, setJobLines] = useState<JobLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [divisionScope, setDivisionScope] = useState<GroupScope>("bi");
  const [hideFullyInvoiced, setHideFullyInvoiced] = useState(true);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const noteSaveTimersRef = useRef<Record<string, number>>({});
  const [isNotesLoading, setIsNotesLoading] = useState(true);
  const [selectedResourceNos, setSelectedResourceNos] = useState<string[]>([]);
  const [resourceFilterSearch, setResourceFilterSearch] = useState("");
  const [resourceDropdownOpen, setResourceDropdownOpen] = useState(false);
  const resourceDropdownRef = useRef<HTMLDivElement>(null);
  const [resourceDescriptions, setResourceDescriptions] = useState<Record<string, string>>({});

  useEffect(() => {
    setGithubToken(readStoredToken());
  }, []);

  const loadNotes = useCallback(async () => {
    try {
      setIsNotesLoading(true);
      const [notes, descriptions] = await Promise.all([getJobProgressLineNotes(), getResources()]);
      setLineNotes(notes);
      setResourceDescriptions(descriptions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore caricamento note";
      setError(msg);
    } finally {
      setIsNotesLoading(false);
    }
  }, []);

  const plannedHoursByJob = useMemo(() => {
    const map: Record<string, PlannedHoursByJob> = {};
    tasks.forEach((task) => {
      if (!task.commessa) return;
      const current = map[task.commessa] || { total: 0, open: 0 };
      current.total += toNumber(task.hours);
      if (task.status !== "done") {
        current.open += toNumber(task.hours);
      }
      map[task.commessa] = current;
    });
    return map;
  }, [tasks]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const rows: any[] = [];
      let offset = 0;

      while (true) {
        const resourceFilter =
          divisionScope === "bi" ? { resourceNo: "CGSSWPOW" } :
          divisionScope === "crm" ? { resourceNos: CRM_RESOURCE_NOS } :
          {};
        const chunk = await getJobs({
          limit: PAGE_SIZE,
          offset,
          ...resourceFilter
        });

        rows.push(...chunk);

        if (chunk.length < PAGE_SIZE) {
          break;
        }

        offset += PAGE_SIZE;
      }

      const mapped = rows.map((row): JobLine => {
        const jobNo = String(row.JobNo || "");
        const planned = plannedHoursByJob[jobNo] || { total: 0, open: 0 };
        const loggedFallback = toNumber(row["Ore Loggate"]);
        const invoicedFallback = toNumber(row["Ore Vendute Fatturate"]);
        const enableFallback = toNumber(row["Ore TA PL"]) + invoicedFallback;

        return {
          jobNo,
          jobPlanNo: String(row.JobPlanNo || ""),
          customerName: String(row["Customer Name"] || ""),
          division: String(row.Division || ""),
          mainDescription: String(row.job_description || ""),
          planDescription: String(row["Plan Description"] || ""),
          soldHours: toNumber(row.Quantity),
          loggedHours: loggedFallback,
          loggedActivities: pickMetric(row["Nr Attivita Loggate"], loggedFallback),
          enableInvoiceActivities: pickMetric(row["Nr Enable Invoice"], enableFallback),
          invoicedActivities: pickMetric(row["Nr Fatturate"], invoicedFallback),
          plannedHours: planned.total,
          resourceNo: String(row["Resource No"] || "")
        };
      });

      setJobLines(mapped);
      const lastUpdateValue = await getJobsDataLastUpdate();
      setLastUpdate(lastUpdateValue);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore caricamento avanzamento commesse";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [plannedHoursByJob, divisionScope]); // divisionScope è GroupScope

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (!resourceDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (resourceDropdownRef.current && !resourceDropdownRef.current.contains(e.target as Node)) {
        setResourceDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [resourceDropdownOpen]);

  useEffect(() => {
    return () => {
      Object.values(noteSaveTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
    };
  }, []);

  const persistLineNote = useCallback(async (lineKey: string, note: string) => {
    try {
      await saveJobProgressLineNote(lineKey, note);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore salvataggio nota";
      setError(msg);
    }
  }, []);

  const handleLineNoteChange = (lineKey: string, value: string) => {
    const nextValue = value.slice(0, 500);
    setLineNotes((prev) => ({ ...prev, [lineKey]: nextValue }));

    const currentTimer = noteSaveTimersRef.current[lineKey];
    if (currentTimer) {
      window.clearTimeout(currentTimer);
    }

    noteSaveTimersRef.current[lineKey] = window.setTimeout(() => {
      void persistLineNote(lineKey, nextValue);
      delete noteSaveTimersRef.current[lineKey];
    }, 700);
  };

  const handleSaveToken = () => {
    const token = githubToken.trim();
    if (!token) {
      setNotice("Inserisci un token valido prima di salvarlo.");
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEYS.syncToken, token);
      setNotice("Token salvato in locale su questo browser.");
    } catch {
      setError("Impossibile salvare il token in locale.");
    }
  };

  const handleClearToken = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.syncToken);
    } catch {
      // Ignora errori storage.
    }
    setGithubToken("");
    setNotice("Token locale rimosso.");
  };

  const handleDispatchStaticSync = async (): Promise<boolean> => {
    const token = githubToken.trim();
    if (!token) {
      setNotice("Modalita statica: inserisci il token GitHub nel campo 'Token sync'.");
      return false;
    }

    const dispatchResult = await dispatchSyncJobsWorkflowWithToken(token);
    try {
      localStorage.setItem(STORAGE_KEYS.syncToken, token);
    } catch {
      // Ignora errori storage.
    }
    setNotice(dispatchResult.message);
    return true;
  };

  const handleManualRefresh = async () => {
    try {
      setIsRefreshing(true);
      setNotice(null);
      setError(null);

      try {
        const result = await syncJobsFromPrimarySource();
        const message = result.message || "Aggiornamento dati completato";
        const staticModeMessage = message.toLowerCase().includes("modalità statica") || message.toLowerCase().includes("modalita statica");

        if (staticModeMessage) {
          await handleDispatchStaticSync();
          return;
        }

        setNotice(message);
        await loadData();
      } catch (syncErr) {
        const syncMessage = syncErr instanceof Error ? syncErr.message : "";
        const isStaticMode = syncMessage.toLowerCase().includes("modalità statica") || syncMessage.toLowerCase().includes("modalita statica");

        if (!isStaticMode) {
          throw syncErr;
        }

        await handleDispatchStaticSync();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore aggiornamento dati da CRM";
      setError(msg);
    } finally {
      setIsRefreshing(false);
    }
  };

  const availableResourceNos = useMemo(() => {
    if (divisionScope !== "all") return [];
    const set = new Set<string>();
    jobLines.forEach((line) => { if (line.resourceNo) set.add(line.resourceNo); });
    return Array.from(set).sort();
  }, [jobLines, divisionScope]);

  const filteredLines = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    let base = jobLines.filter((line) => !line.jobNo.toUpperCase().startsWith("COIG"));

    if (divisionScope === "all" && selectedResourceNos.length > 0) {
      const selected = new Set(selectedResourceNos);
      base = base.filter((line) => selected.has(line.resourceNo));
    }

    if (!term) return base;

    return base.filter((line) =>
      line.jobNo.toLowerCase().includes(term) ||
      line.jobPlanNo.toLowerCase().includes(term) ||
      line.customerName.toLowerCase().includes(term) ||
      line.division.toLowerCase().includes(term) ||
      line.mainDescription.toLowerCase().includes(term) ||
      line.planDescription.toLowerCase().includes(term)
    );
  }, [jobLines, filterText, divisionScope, selectedResourceNos]);

  const aggregates = useMemo(() => {
    const map = new Map<string, JobAggregate>();

    filteredLines.forEach((line) => {
      const key = line.jobNo;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          jobNo: line.jobNo,
          customerName: line.customerName,
          division: line.division,
          mainDescription: line.mainDescription,
          soldHours: line.soldHours,
          loggedHours: line.loggedHours,
          loggedActivities: line.loggedActivities,
          enableInvoiceActivities: line.enableInvoiceActivities,
          invoicedActivities: line.invoicedActivities,
          lineCount: 1
        });
        return;
      }

      if (!existing.mainDescription && line.mainDescription) {
        existing.mainDescription = line.mainDescription;
      }
      existing.soldHours += line.soldHours;
      existing.loggedHours += line.loggedHours;
      existing.loggedActivities += line.loggedActivities;
      existing.enableInvoiceActivities += line.enableInvoiceActivities;
      existing.invoicedActivities += line.invoicedActivities;
      existing.lineCount += 1;
    });

    const all = Array.from(map.values()).sort((a, b) => b.jobNo.localeCompare(a.jobNo));
    if (!hideFullyInvoiced) return all;
    return all.filter((job) => job.soldHours <= 0 || job.invoicedActivities < job.soldHours);
  }, [filteredLines, hideFullyInvoiced]);

  const linesByJob = useMemo(() => {
    const map = new Map<string, JobLine[]>();

    filteredLines.forEach((line) => {
      if (!map.has(line.jobNo)) {
        map.set(line.jobNo, []);
      }
      map.get(line.jobNo)?.push(line);
    });

    map.forEach((lines) => {
      lines.sort((a, b) => a.jobPlanNo.localeCompare(b.jobPlanNo));
    });

    return map;
  }, [filteredLines]);

  const totals = useMemo(() => {
    const soldHours = aggregates.reduce((sum, job) => sum + job.soldHours, 0);
    const loggedHours = aggregates.reduce((sum, job) => sum + job.loggedHours, 0);
    const loggedActivities = aggregates.reduce((sum, job) => sum + job.loggedActivities, 0);
    const enableInvoiceActivities = aggregates.reduce((sum, job) => sum + job.enableInvoiceActivities, 0);
    const invoicedActivities = aggregates.reduce((sum, job) => sum + job.invoicedActivities, 0);
    const remainingHours = soldHours - loggedHours;

    return {
      soldHours,
      loggedHours,
      loggedActivities,
      enableInvoiceActivities,
      invoicedActivities,
      remainingHours,
      remainingDays: remainingHours / HOURS_PER_DAY
    };
  }, [aggregates]);

  useEffect(() => {
    setExpandedJobs((prev) => {
      const next: Record<string, boolean> = {};
      aggregates.forEach((aggregate) => {
        if (prev[aggregate.jobNo]) {
          next[aggregate.jobNo] = true;
        }
      });
      return next;
    });
  }, [aggregates]);

  const handleToggleJob = (jobNo: string) => {
    setExpandedJobs((prev) => ({
      ...prev,
      [jobNo]: !prev[jobNo]
    }));
  };

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    aggregates.forEach((aggregate) => {
      next[aggregate.jobNo] = true;
    });
    setExpandedJobs(next);
  };

  const handleCollapseAll = () => {
    setExpandedJobs({});
  };

  const handleExportExcel = () => {
    try {
      setIsExporting(true);
      setError(null);
      setNotice(null);

      const nowIso = new Date().toISOString();
      const summaryData: Array<Array<string | number>> = [
        ["Avanzamento Commesse"],
        [`Generato il: ${nowIso}`],
        [`Filtro testo: ${filterText || "(nessuno)"}`],
        [`Gruppo: ${divisionScope === "bi" ? "BI (CGSSWPOW)" : divisionScope === "crm" ? "CRM" : "Tutti (PM)"}`],
        [`Ultimo aggiornamento sorgente: ${formatLastUpdate(lastUpdate)}`],
        [
          `Totale commesse: ${aggregates.length}`,
          `Totale righe: ${filteredLines.length}`,
          `Ore vendute: ${totals.soldHours.toFixed(1)}`,
          `Ore loggate: ${totals.loggedHours.toFixed(1)}`,
          `Enable invoice: ${totals.enableInvoiceActivities.toFixed(0)}`,
          `Fatturate: ${totals.invoicedActivities.toFixed(0)}`,
          `Ore rimanenti: ${totals.remainingHours.toFixed(1)}`,
          `Giorni rimanenti: ${totals.remainingDays.toFixed(1)}`
        ],
        ["Commessa", "Cliente", "Descrizione principale", "Division", "Venduto", "Loggato", "Base confronto", "Enable invoice", "Fatturate", "Avanzamento %", "Ore rimanenti", "Giorni rimanenti", "Note commessa"],
        ...aggregates.map((job) => {
          const remainingHours = job.soldHours - job.loggedHours;
          const remainingDays = remainingHours / HOURS_PER_DAY;
          const progress = getProgressPercent(job.loggedHours, job.soldHours);
          const jobKey = getJobStorageKey(job.jobNo);
          return [
            job.jobNo || "-",
            job.customerName || "-",
            job.mainDescription || "-",
            job.division || "-",
            job.soldHours,
            job.loggedHours,
            job.loggedActivities,
            job.enableInvoiceActivities,
            job.invoicedActivities,
            progress,
            remainingHours,
            remainingDays,
            lineNotes[jobKey] || ""
          ];
        })
      ];

      const visibleJobNos = new Set(aggregates.map((job) => job.jobNo));
      const detailData: Array<Array<string | number>> = [
        ["Dettaglio righe commessa"],
        ["Commessa", "Riga", "Cliente", "Division", "Descrizione principale", "Descrizione riga", "Venduto", "Loggato", "Base confronto", "Enable invoice", "Fatturate", "Avanzamento %", "Ore rimanenti", "Giorni rimanenti", "Note"],
        ...filteredLines.filter((line) => visibleJobNos.has(line.jobNo)).map((line) => {
          const remainingHours = line.soldHours - line.loggedHours;
          const remainingDays = remainingHours / HOURS_PER_DAY;
          const progress = getProgressPercent(line.loggedHours, line.soldHours);
          const lineKey = getLineStorageKey(line);
          return [
            line.jobNo || "-",
            line.jobPlanNo || "-",
            line.customerName || "-",
            line.division || "-",
            line.mainDescription || "-",
            line.planDescription || "-",
            line.soldHours,
            line.loggedHours,
            line.loggedActivities,
            line.enableInvoiceActivities,
            line.invoicedActivities,
            progress,
            remainingHours,
            remainingDays,
            lineNotes[lineKey] || ""
          ];
        })
      ];

      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      const wsDetail = XLSX.utils.aoa_to_sheet(detailData);

      wsSummary["!cols"] = [
        { wch: 14 },
        { wch: 28 },
        { wch: 38 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 16 },
        { wch: 18 },
        { wch: 42 }
      ];

      wsDetail["!cols"] = [
        { wch: 14 },
        { wch: 10 },
        { wch: 28 },
        { wch: 12 },
        { wch: 32 },
        { wch: 36 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 16 },
        { wch: 18 },
        { wch: 42 }
      ];

      const baseStyle = {
        font: { name: "Segoe UI", sz: 10, color: { rgb: "0F172A" } },
        alignment: { vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "E2E8F0" } },
          bottom: { style: "thin", color: { rgb: "E2E8F0" } },
          left: { style: "thin", color: { rgb: "E2E8F0" } },
          right: { style: "thin", color: { rgb: "E2E8F0" } }
        }
      };

      const titleStyle = {
        ...baseStyle,
        font: { name: "Segoe UI", sz: 14, bold: true, color: { rgb: "0F172A" } },
        fill: { patternType: "solid", fgColor: { rgb: "E2E8F0" } }
      };

      const headerStyle = {
        ...baseStyle,
        font: { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1E293B" } },
        alignment: { vertical: "center", horizontal: "center", wrapText: true }
      };

      const numberStyle = {
        ...baseStyle,
        numFmt: "0.0",
        alignment: { vertical: "center", horizontal: "right" }
      };

      const negativeNumberStyle = {
        ...numberStyle,
        font: { name: "Segoe UI", sz: 10, color: { rgb: "B91C1C" } }
      };

      const applyStyle = (ws: XLSX.WorkSheet, row: number, col: number, style: any) => {
        const addr = XLSX.utils.encode_cell({ r: row, c: col });
        if (!ws[addr]) return;
        ws[addr].s = style;
      };

      for (let c = 0; c < 13; c += 1) {
        applyStyle(wsSummary, 0, c, titleStyle);
        applyStyle(wsSummary, 6, c, headerStyle);
      }

      for (let r = 1; r < summaryData.length; r += 1) {
        for (let c = 0; c < 13; c += 1) {
          applyStyle(wsSummary, r, c, baseStyle);
        }
      }

      for (let i = 0; i < aggregates.length; i += 1) {
        const row = 7 + i;
        const job = aggregates[i];
        const remainingHours = job.soldHours - job.loggedHours;
        const remainingDays = remainingHours / HOURS_PER_DAY;
        const progress = getProgressPercent(job.loggedHours, job.soldHours);

        [4, 5, 6, 7, 8, 9, 10, 11].forEach((col) => applyStyle(wsSummary, row, col, numberStyle));
        if (progress > 100) applyStyle(wsSummary, row, 9, negativeNumberStyle);
        if (remainingHours < 0) applyStyle(wsSummary, row, 10, negativeNumberStyle);
        if (remainingDays < 0) applyStyle(wsSummary, row, 11, negativeNumberStyle);
      }

      for (let c = 0; c < 15; c += 1) {
        applyStyle(wsDetail, 0, c, titleStyle);
        applyStyle(wsDetail, 1, c, headerStyle);
      }

      for (let r = 2; r < detailData.length; r += 1) {
        for (let c = 0; c < 15; c += 1) {
          applyStyle(wsDetail, r, c, baseStyle);
        }
      }

      for (let i = 0; i < filteredLines.length; i += 1) {
        const row = 2 + i;
        const line = filteredLines[i];
        const remainingHours = line.soldHours - line.loggedHours;
        const remainingDays = remainingHours / HOURS_PER_DAY;
        const progress = getProgressPercent(line.loggedHours, line.soldHours);

        [6, 7, 8, 9, 10, 11, 12, 13].forEach((col) => applyStyle(wsDetail, row, col, numberStyle));
        if (progress > 100) applyStyle(wsDetail, row, 11, negativeNumberStyle);
        if (remainingHours < 0) applyStyle(wsDetail, row, 12, negativeNumberStyle);
        if (remainingDays < 0) applyStyle(wsDetail, row, 13, negativeNumberStyle);
      }

      XLSX.utils.book_append_sheet(wb, wsSummary, "Riepilogo");
      XLSX.utils.book_append_sheet(wb, wsDetail, "Dettaglio Righe");
      XLSX.writeFile(wb, `avanzamento_commesse_${fileTimestamp()}.xlsx`, { compression: true });

      setNotice("Export Excel completato: file .xlsx scaricato.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore durante export Excel";
      setError(msg);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Commesse</p>
          <h1>Avanzamento commessa e righe</h1>
          <p className="subtitle">
            Ultimo aggiornamento dati: <strong>{formatLastUpdate(lastUpdate)}</strong>
          </p>
          <p className="subtitle" style={{ marginTop: "4px" }}>
            Gruppo: <strong>{divisionScope === "bi" ? "BI" : divisionScope === "crm" ? "CRM" : "Tutti (PM)"}</strong>
          </p>
        </div>
        <div className="stats">
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Ore vendute</span>
              <span className="kpi-value">{totals.soldHours.toFixed(1)}</span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Ore loggate</span>
              <span className="kpi-value">{totals.loggedHours.toFixed(1)}</span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Enable invoice</span>
              <span className="kpi-value">{totals.enableInvoiceActivities.toFixed(0)}</span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Fatturate</span>
              <span className="kpi-value">{totals.invoicedActivities.toFixed(0)}</span>
            </div>
          </div>
        </div>
        <div className="hero-buttons">
          <button className="secondary" onClick={() => onSwitchPage("jobs")}>
            Vai a Commesse
          </button>
          <button className="secondary" onClick={() => onSwitchPage("manage")}>
            Torna al calendario
          </button>
        </div>
      </header>

      <main className="panel job-progress-layout">
        {error && <div className="alert">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}

        <div className="job-progress-summary-row">
          <div className="stat">
            <strong>{filteredLines.length}</strong>
            <span>Righe commessa</span>
          </div>
          <div className="stat">
            <strong>{aggregates.length}</strong>
            <span>Commesse</span>
          </div>
          <div className="stat">
            <strong>{formatHours(Math.max(totals.remainingHours, 0))}</strong>
            <span>Ore rimanenti totali</span>
          </div>
          <div className="stat">
            <strong>{isNotesLoading ? "..." : Object.keys(lineNotes).length}</strong>
            <span>Note salvate</span>
          </div>
          <div className="stat">
            <strong>{formatDays(Math.max(totals.remainingDays, 0))}</strong>
            <span>Giorni rimanenti totali (8h)</span>
          </div>
        </div>

        <div className="database-controls">
          <div className="sort-controls">
            <label>
              Gruppo risorse
              <select
                value={divisionScope}
                onChange={(e) => { setDivisionScope(e.target.value as GroupScope); setSelectedResourceNos([]); setResourceFilterSearch(""); }}
              >
                <option value="bi">BI (CGSSWPOW)</option>
                <option value="crm">CRM</option>
                <option value="all">Tutti (modalità PM)</option>
              </select>
            </label>
            <label>
              Cerca commessa / cliente / descrizione / divisione
              <input
                type="text"
                placeholder="Es: COAS260820, Minerva, Commessa Assistenza..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={hideFullyInvoiced}
                onChange={(e) => setHideFullyInvoiced(e.target.checked)}
              />
              Nascondi commesse fatturate al 100%
            </label>
            {divisionScope === "all" && (
              <div ref={resourceDropdownRef} style={{ display: "flex", flexDirection: "column", gap: "4px", position: "relative" }}>
                <label style={{ marginBottom: 0 }}>Filtra per risorsa generica</label>
                {/* Trigger button */}
                <button
                  type="button"
                  onClick={() => setResourceDropdownOpen((o) => !o)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "7px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: selectedResourceNos.length === 0 ? "#94a3b8" : "#0f172a",
                    minWidth: "260px",
                    textAlign: "left"
                  }}
                >
                  <span>
                    {selectedResourceNos.length === 0
                      ? `Tutte le risorse (${availableResourceNos.length})`
                      : selectedResourceNos.length === 1
                        ? `${selectedResourceNos[0]}${resourceDescriptions[selectedResourceNos[0]] ? " — " + resourceDescriptions[selectedResourceNos[0]] : ""}`
                        : `${selectedResourceNos.length} risorse selezionate`}
                  </span>
                  <span style={{ marginLeft: "8px", opacity: 0.5 }}>{resourceDropdownOpen ? "▲" : "▼"}</span>
                </button>
                {/* Dropdown panel */}
                {resourceDropdownOpen && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    zIndex: 200,
                    minWidth: "320px",
                    background: "#fff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    display: "flex",
                    flexDirection: "column"
                  }}>
                    {/* Search */}
                    <div style={{ padding: "8px" }}>
                      <input
                        type="text"
                        placeholder="Cerca codice o descrizione..."
                        value={resourceFilterSearch}
                        onChange={(e) => setResourceFilterSearch(e.target.value)}
                        autoFocus
                        style={{ width: "100%", boxSizing: "border-box", padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "13px" }}
                      />
                    </div>
                    {/* Select all / deselect all */}
                    <div style={{ padding: "4px 8px 6px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontSize: "12px", padding: 0 }}
                        onClick={() => {
                          const visible = availableResourceNos.filter((r) => {
                            const term = resourceFilterSearch.toLowerCase();
                            return r.toLowerCase().includes(term) || (resourceDescriptions[r] || "").toLowerCase().includes(term);
                          });
                          setSelectedResourceNos((prev) => Array.from(new Set([...prev, ...visible])));
                        }}
                      >
                        Seleziona tutto
                      </button>
                      <span style={{ color: "#cbd5e1" }}>|</span>
                      <button
                        type="button"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: "12px", padding: 0 }}
                        onClick={() => setSelectedResourceNos([])}
                      >
                        Deseleziona tutto
                      </button>
                    </div>
                    {/* Resource list */}
                    <div style={{ maxHeight: "240px", overflowY: "auto", padding: "4px 0" }}>
                      {availableResourceNos
                        .filter((r) => {
                          const term = resourceFilterSearch.toLowerCase();
                          return r.toLowerCase().includes(term) || (resourceDescriptions[r] || "").toLowerCase().includes(term);
                        })
                        .map((r) => {
                          const desc = resourceDescriptions[r] || "";
                          const isSelected = selectedResourceNos.includes(r);
                          return (
                            <label
                              key={r}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "6px 14px",
                                cursor: "pointer",
                                background: isSelected ? "#eff6ff" : "transparent",
                                fontSize: "13px"
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => setSelectedResourceNos((prev) =>
                                  isSelected ? prev.filter((x) => x !== r) : [...prev, r]
                                )}
                                style={{ accentColor: "#2563eb", flexShrink: 0 }}
                              />
                              <span style={{ fontWeight: 600, color: "#0f172a" }}>{r}</span>
                              {desc && <span style={{ color: "#64748b", fontSize: "12px" }}>{desc}</span>}
                            </label>
                          );
                        })}
                      {availableResourceNos.filter((r) => {
                        const term = resourceFilterSearch.toLowerCase();
                        return r.toLowerCase().includes(term) || (resourceDescriptions[r] || "").toLowerCase().includes(term);
                      }).length === 0 && (
                        <div style={{ padding: "12px 14px", color: "#94a3b8", fontSize: "13px" }}>Nessuna risorsa trovata</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <label>
              Token sync (GitHub PAT)
              <input
                type="password"
                placeholder="github_pat_..."
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                autoComplete="off"
              />
            </label>
          </div>
          <div className="job-progress-actions">
            <button className="secondary" onClick={handleSaveToken}>
              Salva token
            </button>
            <button className="secondary" onClick={handleClearToken}>
              Rimuovi token
            </button>
            <button className="secondary" onClick={handleManualRefresh} disabled={isRefreshing}>
              {isRefreshing ? "Aggiornamento..." : "Aggiorna da CRM"}
            </button>
            <button className="secondary" onClick={handleExportExcel} disabled={isExporting || loading}>
              {isExporting ? "Export..." : "Esporta Excel"}
            </button>
            <button className="secondary" onClick={handleExpandAll}>Espandi tutte</button>
            <button className="secondary" onClick={handleCollapseAll}>Chiudi tutte</button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
            Caricamento avanzamento...
          </div>
        ) : (
          <>
            <section className="job-progress-section">
              <h3>Avanzamento commesse ({aggregates.length} commesse, {filteredLines.length} righe)</h3>
              <div className="database-table">
                <table>
                  <thead>
                    <tr>
                      <th>Commessa / Riga</th>
                      <th>Cliente</th>
                      <th>Descrizione</th>
                      <th>Division</th>
                      <th className="number-col">Venduto</th>
                      <th className="number-col">Loggato</th>
                      <th>Avanzamento</th>
                      <th className="number-col">Enable Invoice</th>
                      <th>Avz Enable</th>
                      <th className="number-col">Fatturate</th>
                      <th>Avz Fatturate</th>
                      <th className="number-col">Ore rimanenti</th>
                      <th className="number-col">Giorni rimanenti</th>
                      <th>Note</th>
                      <th className="actions-col">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregates.length === 0 && (
                      <tr>
                        <td colSpan={15} style={{ textAlign: "center", color: "#64748b" }}>
                          Nessuna commessa trovata con i filtri correnti.
                        </td>
                      </tr>
                    )}
                    {aggregates.map((job) => {
                      const jobRemainingHours = job.soldHours - job.loggedHours;
                      const jobRemainingDays = jobRemainingHours / HOURS_PER_DAY;
                      const jobKey = getJobStorageKey(job.jobNo);
                      const planned = plannedHoursByJob[job.jobNo] || { total: 0, open: 0 };
                      const oreResidueUfficiali = Math.max(0, jobRemainingHours);
                      const orePianificabili = Math.max(0, jobRemainingHours - planned.open);
                      const macroJob: PlanningJob = {
                        jobNo: job.jobNo,
                        jobPlanNo: "",
                        planDescription: job.mainDescription || `Task per ${job.jobNo}`,
                        division: job.division,
                        customerName: job.customerName,
                        quantity: job.soldHours,
                        ogreLoggate: job.loggedHours,
                        orePianificate: planned.total,
                        orePianificateAperte: planned.open,
                        oreResidueUfficiali,
                        orePianificabili
                      };
                      const detailLines = linesByJob.get(job.jobNo) || [];
                      const isExpanded = !!expandedJobs[job.jobNo];

                      return (
                        <Fragment key={job.jobNo}>
                          {/* Riga macro commessa */}
                          <tr style={{ backgroundColor: "#f1f5f9", borderTop: "2px solid #cbd5e1" }}>
                            <td>
                              <button className="job-expand-button" onClick={() => handleToggleJob(job.jobNo)}>
                                <span>{isExpanded ? "▼" : "▶"}</span>
                                <strong style={{ fontSize: "13px" }}>{job.jobNo}</strong>
                              </button>
                              <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "8px" }}>{job.lineCount} {job.lineCount === 1 ? "riga" : "righe"}</span>
                            </td>
                            <td><strong>{job.customerName || "-"}</strong></td>
                            <td style={{ maxWidth: "240px" }}>{job.mainDescription || "-"}</td>
                            <td style={{ fontSize: "11px", color: "#64748b" }}>{job.division || "-"}</td>
                            <td className="number-col"><strong>{formatHours(job.soldHours)}</strong></td>
                            <td className="number-col"><strong>{formatHours(job.loggedHours)}</strong></td>
                            <td>
                              <ProgressBarCell loggedHours={job.loggedHours} soldHours={job.soldHours} />
                            </td>
                            <td className="number-col"><strong>{job.enableInvoiceActivities.toFixed(0)}</strong></td>
                            <td>
                              <ActivityProgressCell
                                value={job.enableInvoiceActivities}
                                baseline={job.soldHours}
                                tone="enable"
                              />
                            </td>
                            <td className="number-col"><strong>{job.invoicedActivities.toFixed(0)}</strong></td>
                            <td>
                              <ActivityProgressCell
                                value={job.invoicedActivities}
                                baseline={job.soldHours}
                                tone="invoice"
                              />
                            </td>
                            <td className="number-col">
                              <strong className={jobRemainingHours < 0 ? "job-progress-negative" : ""}>
                                {formatHours(jobRemainingHours)}
                              </strong>
                            </td>
                            <td className="number-col">
                              <strong className={jobRemainingDays < 0 ? "job-progress-negative" : ""}>
                                {formatDays(jobRemainingDays)}
                              </strong>
                            </td>
                            <td>
                              <textarea
                                className="job-progress-note-input"
                                value={lineNotes[jobKey] || ""}
                                onChange={(e) => handleLineNoteChange(jobKey, e.target.value)}
                                placeholder="Nota commessa..."
                                rows={2}
                              />
                            </td>
                            <td className="actions-col">
                              <button
                                className="primary-small"
                                onClick={() => onCreateTaskFromJob?.(macroJob)}
                                title={orePianificabili > 0 ? `Pianifica su commessa (${orePianificabili.toFixed(1)}h pianificabili)` : "Commessa già coperta — puoi comunque aggiungere"}
                              >
                                +
                              </button>
                            </td>
                          </tr>
                          {/* Righe di dettaglio — visibili solo se espanse */}
                          {isExpanded && detailLines.map((line, index) => {
                            const remainingHours = line.soldHours - line.loggedHours;
                            const remainingDays = remainingHours / HOURS_PER_DAY;
                            const lineKey = getLineStorageKey(line);
                            const lineOrePianificabili = Math.max(0, remainingHours);
                            const linePlanningJob: PlanningJob = {
                              jobNo: line.jobNo,
                              jobPlanNo: line.jobPlanNo,
                              planDescription: line.planDescription || `Riga ${line.jobPlanNo} — ${line.jobNo}`,
                              division: line.division,
                              customerName: line.customerName,
                              quantity: line.soldHours,
                              ogreLoggate: line.loggedHours,
                              orePianificate: line.plannedHours,
                              orePianificateAperte: 0,
                              oreResidueUfficiali: Math.max(0, remainingHours),
                              orePianificabili: lineOrePianificabili
                            };

                            return (
                              <tr key={`${job.jobNo}-${line.jobPlanNo}-${index}`} style={{ backgroundColor: "#fff" }}>
                                <td style={{ paddingLeft: "28px" }}>
                                  <span style={{ fontSize: "11px", color: "#475569" }}>↳ {line.jobPlanNo || "-"}</span>
                                </td>
                                <td style={{ fontSize: "13px", color: "#475569" }}>{line.customerName || "-"}</td>
                                <td style={{ maxWidth: "240px", fontSize: "13px" }}>{line.planDescription || "-"}</td>
                                <td style={{ fontSize: "11px", color: "#64748b" }}>{line.division || "-"}</td>
                                <td className="number-col">{formatHours(line.soldHours)}</td>
                                <td className="number-col">{formatHours(line.loggedHours)}</td>
                                <td>
                                  <ProgressBarCell loggedHours={line.loggedHours} soldHours={line.soldHours} />
                                </td>
                                <td className="number-col">{line.enableInvoiceActivities.toFixed(0)}</td>
                                <td>
                                  <ActivityProgressCell
                                    value={line.enableInvoiceActivities}
                                    baseline={line.soldHours}
                                    tone="enable"
                                  />
                                </td>
                                <td className="number-col">{line.invoicedActivities.toFixed(0)}</td>
                                <td>
                                  <ActivityProgressCell
                                    value={line.invoicedActivities}
                                    baseline={line.soldHours}
                                    tone="invoice"
                                  />
                                </td>
                                <td className="number-col">
                                  <span className={remainingHours < 0 ? "job-progress-negative" : ""}>
                                    {formatHours(remainingHours)}
                                  </span>
                                </td>
                                <td className="number-col">
                                  <span className={remainingDays < 0 ? "job-progress-negative" : ""}>
                                    {formatDays(remainingDays)}
                                  </span>
                                </td>
                                <td>
                                  <textarea
                                    className="job-progress-note-input"
                                    value={lineNotes[lineKey] || ""}
                                    onChange={(e) => handleLineNoteChange(lineKey, e.target.value)}
                                    placeholder="Nota riga..."
                                    rows={2}
                                  />
                                </td>
                                <td className="actions-col">
                                  <button
                                    className="primary-small"
                                    onClick={() => onCreateTaskFromJob?.(linePlanningJob)}
                                    title={lineOrePianificabili > 0 ? `Pianifica riga (${lineOrePianificabili.toFixed(1)}h residue)` : "Riga già coperta — puoi comunque aggiungere"}
                                  >
                                    +
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
