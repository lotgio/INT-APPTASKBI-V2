import { useMemo, useState, useEffect } from "react";
import { getJobs, getJobsStats, syncJobsFromAzure } from "./api";
import type { Task } from "./types";

const CRM_RESOURCE_NOS = ["CGSSWHOC", "CGSSWPMIC", "CGSSWRISC", "CGSWCRM", "PROGSWCRM"];
type JobGroupScope = "bi" | "crm" | "all";

interface Job {
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

interface PlannedHoursByJob {
  total: number;
  open: number;
}

interface Props {
  tasks?: Task[];
  onSwitchPage: (page: "manage" | "stats" | "database") => void;
  onCreateTaskFromJob?: (job: Job) => void;
}

export default function JobsPage({ tasks = [], onSwitchPage, onCreateTaskFromJob }: Props) {
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterDivision, setFilterDivision] = useState("");
  const [filterJobNo, setFilterJobNo] = useState("");
  const [sortBy, setSortBy] = useState<"jobno" | "customer">("jobno");
  const [groupBy, setGroupBy] = useState<"none" | "parent" | "customer">("none");
  const [groupScope, setGroupScope] = useState<JobGroupScope>("bi");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 100;

  const loadJobs = async (pageNum: number = 0, isManualRefresh: boolean = false) => {
    try {
      console.log(`📥 Caricamento jobs pagina ${pageNum}...`);
      setLoading(pageNum === 0);
      setIsRefreshing(isManualRefresh);
      
      // Se è un refresh manuale, sincronizza da Azure prima di ricaricare
      if (isManualRefresh) {
        try {
          console.log("🔄 Sincronizzazione con Azure...");
          await syncJobsFromAzure();
          console.log("✅ Sincronizzazione completata");
        } catch (syncErr) {
          console.warn("⚠️  Sincronizzazione fallita, uso dati existenti:", syncErr);
        }
      }
      
      // Carica con paginazione e filtro per gruppo
      const resourceFilter =
        groupScope === "bi" ? { resourceNo: "CGSSWPOW" } :
        groupScope === "crm" ? { resourceNos: CRM_RESOURCE_NOS } :
        {};
      const rawJobs = await getJobs({
        limit: ITEMS_PER_PAGE,
        offset: pageNum * ITEMS_PER_PAGE,
        ...resourceFilter
      });
      
      console.log(`📦 Ricevuti rawJobs: ${rawJobs.length} items`);
      if (rawJobs.length === 0 && pageNum === 0) {
        setError("Nessuna commessa trovata");
        setJobs([]);
        setPage(0);
        return;
      }
      
      // Mappa campi
      const mappedJobs: Job[] = rawJobs.map((job: any) => {
        const jobNo = job.JobNo || "";
        const quantity = Number(job.Quantity) || 0;
        const oreLoggate = Number(job["Ore Loggate"]) || 0;
        const plannedHours = plannedHoursByJob[jobNo] || { total: 0, open: 0 };
        const orePianificate = plannedHours.total;
        const orePianificateAperte = plannedHours.open;
        // Residuo ufficiale basato solo sul consuntivo CRM.
        const oreResidueUfficiali = Math.max(0, quantity - oreLoggate);
        // Pianificabili effettive: togliamo dal venduto sia il consuntivo sia il pianificato ancora aperto.
        const orePianificabili = Math.max(0, quantity - oreLoggate - orePianificateAperte);
        return {
          jobNo,
          jobPlanNo: job.JobPlanNo || "",
          planDescription: job["Plan Description"] || "",
          division: job.Division || "",
          customerName: job["Customer Name"] || "",
          parentChainName: job["Parent Chain Name"] || undefined,
          quantity,
          ogreLoggate: oreLoggate,
          orePianificate,
          orePianificateAperte,
          oreResidueUfficiali,
          orePianificabili
        };
      });
      
      console.log(`✅ Mapped jobs: ${mappedJobs.length} items`);
      
      if (pageNum === 0) {
        setJobs(mappedJobs);
      } else {
        setJobs(prev => [...prev, ...mappedJobs]);
      }
      
      setHasMore(mappedJobs.length === ITEMS_PER_PAGE);
      setPage(pageNum);
      setError(null);
      console.log(`✓ Caricati ${mappedJobs.length} job da Azure`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore caricamento jobs";
      setError(msg);
      console.error("❌ Errore JobsPage:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Calcola ore pianificate per ogni commessa
  const plannedHoursByJob = useMemo(() => {
    const map: Record<string, PlannedHoursByJob> = {};
    tasks.forEach(task => {
      const jobNo = task.commessa;
      const current = map[jobNo] || { total: 0, open: 0 };
      current.total += task.hours;
      if (task.status !== "done") {
        current.open += task.hours;
      }
      map[jobNo] = current;
    });
    return map;
  }, [tasks]);

  console.log("🏗️ JobsPage renderizzato!");

  // Carica i dati reali da Azure
  useEffect(() => {
    console.log("🔄 useEffect JobsPage in esecuzione");
    loadJobs(0, false);
  }, [groupScope]);

  // Estrai le divisions uniche per il dropdown
  const uniqueDivisions = useMemo(() => {
    const divisions = [...new Set(jobs.map(j => j.division).filter(Boolean))];
    return divisions.sort();
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    let filtered = jobs;

    if (filterCustomer) {
      filtered = filtered.filter((j) => j.customerName.toLowerCase().includes(filterCustomer.toLowerCase()));
    }

    if (filterDivision) {
      filtered = filtered.filter((j) => j.division === filterDivision);
    }

    if (filterJobNo) {
      filtered = filtered.filter((j) => j.jobNo.toLowerCase().includes(filterJobNo.toLowerCase()));
    }

    if (sortBy === "customer") {
      filtered.sort((a, b) => a.customerName.localeCompare(b.customerName));
    } else if (sortBy === "jobno") {
      filtered.sort((a, b) => b.jobNo.localeCompare(a.jobNo)); // Decrescente
    }

    return filtered;
  }, [jobs, filterCustomer, filterDivision, filterJobNo, sortBy]);

  // Raggruppa i job se richiesto
  const groupedJobs = useMemo(() => {
    if (groupBy === "none") return null;

    const groups: { [key: string]: Job[] } = {};
    
    filteredJobs.forEach(job => {
      const key = groupBy === "parent" 
        ? (job.parentChainName || "Senza Parent Chain")
        : job.customerName;
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(job);
    });

    return groups;
  }, [filteredJobs, groupBy]);

  const totals = useMemo(() => {
    return {
      totalJobs: filteredJobs.length,
      totalVendute: filteredJobs.reduce((sum, j) => sum + j.quantity, 0),
      totalLogged: filteredJobs.reduce((sum, j) => sum + j.ogreLoggate, 0),
      totalPianificate: filteredJobs.reduce((sum, j) => sum + j.orePianificate, 0),
      totalPianificateAperte: filteredJobs.reduce((sum, j) => sum + j.orePianificateAperte, 0),
      totalResidueUfficiali: filteredJobs.reduce((sum, j) => sum + j.oreResidueUfficiali, 0),
      totalPianificabili: filteredJobs.reduce((sum, j) => sum + j.orePianificabili, 0)
    };
  }, [filteredJobs]);

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Gestione Commesse</p>
          <h1>Commesse Aperte</h1>
          <p className="subtitle">Visualizza e gestisci le commesse aperte, pianifica i task assegnati.</p>
        </div>
        <div className="stats">
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Commesse Aperte</span>
              <span className="kpi-value">{totals.totalJobs}</span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Ore Vendute</span>
              <span className="kpi-value">{totals.totalVendute.toFixed(1)}</span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Ore Loggate</span>
              <span className="kpi-value">{totals.totalLogged.toFixed(1)}</span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Pianificate Aperte</span>
              <span className="kpi-value" style={{ color: "#3b82f6" }}>{totals.totalPianificateAperte.toFixed(1)}</span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Ore Pianificabili</span>
              <span className="kpi-value" style={{ color: "#f59e0b" }}>{totals.totalPianificabili.toFixed(1)}</span>
            </div>
          </div>
        </div>
        <div className="hero-buttons">
          <button 
            className="secondary" 
            onClick={() => loadJobs(0, true)}
            disabled={isRefreshing}
            style={{ opacity: isRefreshing ? 0.7 : 1, cursor: isRefreshing ? 'not-allowed' : 'pointer' }}
          >
            {isRefreshing ? '⟳ Aggiornamento...' : '⟳ Ricarica commesse'}
          </button>
          <button className="secondary" onClick={() => onSwitchPage("manage")}>
            ← Torna al calendario
          </button>
        </div>
      </header>

      {loading && <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>Caricamento commesse...</div>}
      {error && <div className="alert" style={{ margin: "0 48px 24px" }}>⚠️ {error}</div>}

      {!loading && !error && (
        <main className="panel">
          <div className="database-controls">
            <div className="sort-controls">
              <label>
                Gruppo risorse
                <select value={groupScope} onChange={(e) => setGroupScope(e.target.value as JobGroupScope)}>
                  <option value="bi">BI (CGSSWPOW)</option>
                  <option value="crm">CRM</option>
                  <option value="all">Tutti (PM)</option>
                </select>
              </label>
              <label>
                Filtra cliente
                <input
                  type="text"
                  placeholder="Nome cliente..."
                  value={filterCustomer}
                  onChange={(e) => setFilterCustomer(e.target.value)}
                />
              </label>
              <label>
                Filtra division
                <select value={filterDivision} onChange={(e) => setFilterDivision(e.target.value)}>
                  <option value="">Tutte le divisions</option>
                  {uniqueDivisions.map(div => (
                    <option key={div} value={div}>{div}</option>
                  ))}
                </select>
              </label>
              <label>
                Filtra Job No
                <input
                  type="text"
                  placeholder="Es: CO24..."
                  value={filterJobNo}
                  onChange={(e) => setFilterJobNo(e.target.value)}
                />
              </label>
              <label>
                Ordina per
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                  <option value="jobno">Numero Commessa</option>
                  <option value="customer">Cliente</option>
                </select>
              </label>
              <label>
                Raggruppa per
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}>
                  <option value="none">Nessun raggruppamento</option>
                  <option value="parent">Parent Chain</option>
                  <option value="customer">Cliente</option>
                </select>
              </label>
            </div>

            <div className="stats-row">
            <div className="stat">
              <strong>{totals.totalJobs}</strong>
              <span>Commesse aperte</span>
            </div>
            <div className="stat">
              <strong>{totals.totalVendute.toFixed(1)}h</strong>
              <span>Ore vendute totali</span>
            </div>
            <div className="stat">
              <strong>{totals.totalLogged.toFixed(1)}h</strong>
              <span>Ore loggate totali</span>
            </div>
            <div className="stat">
              <strong style={{ color: "#3b82f6" }}>{totals.totalPianificateAperte.toFixed(1)}h</strong>
              <span>Ore pianificate aperte</span>
            </div>
              <div className="stat">
                <strong style={{ color: "#f59e0b" }}>{totals.totalPianificabili.toFixed(1)}h</strong>
                <span>Ore pianificabili totali</span>
              </div>
            </div>
          </div>

          <div className="database-table">
            <table>
              <thead>
                <tr>
                  <th>Division</th>
                  <th>Parent Chain</th>
                  <th>Cliente</th>
                  <th className="badge-col">Job No</th>
                  <th className="badge-col">Plan No</th>
                  <th>Descrizione</th>
                  <th className="number-col">Vendute (h)</th>
                  <th className="number-col">Loggate (h)</th>
                  <th className="number-col">Pianif. aperte (h)</th>
                  <th className="number-col">Pianificabili (h)</th>
                  <th className="actions-col">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {groupBy === "none" ? (
                  // Rendering normale senza raggruppamento
                  filteredJobs.map((job, idx) => (
                    <tr key={`${job.jobNo}-${job.jobPlanNo}-${idx}`}>
                      <td><span style={{ fontSize: "11px", color: "#64748b" }}>{job.division}</span></td>
                      <td>{job.parentChainName || "-"}</td>
                      <td><strong>{job.customerName}</strong></td>
                      <td className="badge-col"><strong>{job.jobNo}</strong></td>
                      <td className="badge-col"><span style={{ fontSize: "11px" }}>{job.jobPlanNo}</span></td>
                      <td style={{ maxWidth: "250px" }}>{job.planDescription}</td>
                      <td className="number-col">{job.quantity.toFixed(1)}</td>
                      <td className="number-col">{job.ogreLoggate.toFixed(1)}</td>
                      <td className="number-col">
                        <span style={{ color: job.orePianificateAperte > 0 ? "#3b82f6" : "#94a3b8", fontWeight: job.orePianificateAperte > 0 ? "600" : "normal" }}>
                          {job.orePianificateAperte.toFixed(1)}
                        </span>
                      </td>
                      <td className="number-col">
                        <span style={{ color: job.orePianificabili > 0 ? "#f59e0b" : "#10b981", fontWeight: "600" }}>
                          {job.orePianificabili.toFixed(1)}
                        </span>
                      </td>
                      <td className="actions-col">
                        <button
                          className="primary-small"
                          onClick={() => onCreateTaskFromJob?.(job)}
                          title="Crea task da questa commessa"
                        >
                          +
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  // Rendering con raggruppamento
                  Object.keys(groupedJobs || {}).sort().map(groupKey => {
                    const groupJobs = groupedJobs![groupKey];
                    const groupTotals = {
                      vendute: groupJobs.reduce((sum, j) => sum + j.quantity, 0),
                      loggate: groupJobs.reduce((sum, j) => sum + j.ogreLoggate, 0),
                      pianificateAperte: groupJobs.reduce((sum, j) => sum + j.orePianificateAperte, 0),
                      pianificabili: groupJobs.reduce((sum, j) => sum + j.orePianificabili, 0)
                    };
                    
                    return [
                      // Riga di intestazione del gruppo
                      <tr key={`group-${groupKey}`} style={{ backgroundColor: "#f1f5f9", fontWeight: "600" }}>
                        <td colSpan={6} style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: "14px" }}>📁 {groupKey}</span>
                          <span style={{ marginLeft: "16px", fontSize: "12px", color: "#64748b", fontWeight: "normal" }}>
                            ({groupJobs.length} commesse)
                          </span>
                        </td>
                        <td className="number-col" style={{ fontWeight: "600" }}>{groupTotals.vendute.toFixed(1)}</td>
                        <td className="number-col" style={{ fontWeight: "600" }}>{groupTotals.loggate.toFixed(1)}</td>
                        <td className="number-col" style={{ fontWeight: "600", color: "#3b82f6" }}>{groupTotals.pianificateAperte.toFixed(1)}</td>
                        <td className="number-col" style={{ fontWeight: "600", color: "#f59e0b" }}>{groupTotals.pianificabili.toFixed(1)}</td>
                        <td></td>
                      </tr>,
                      // Righe del gruppo
                      ...groupJobs.map((job, idx) => (
                        <tr key={`${groupKey}-${job.jobNo}-${job.jobPlanNo}-${idx}`}>
                          <td><span style={{ fontSize: "11px", color: "#64748b" }}>{job.division}</span></td>
                          <td>{job.parentChainName || "-"}</td>
                          <td><strong>{job.customerName}</strong></td>
                          <td className="badge-col"><strong>{job.jobNo}</strong></td>
                          <td className="badge-col"><span style={{ fontSize: "11px" }}>{job.jobPlanNo}</span></td>
                          <td style={{ maxWidth: "250px" }}>{job.planDescription}</td>
                          <td className="number-col">{job.quantity.toFixed(1)}</td>
                          <td className="number-col">{job.ogreLoggate.toFixed(1)}</td>
                          <td className="number-col">
                            <span style={{ color: job.orePianificateAperte > 0 ? "#3b82f6" : "#94a3b8", fontWeight: job.orePianificateAperte > 0 ? "600" : "normal" }}>
                              {job.orePianificateAperte.toFixed(1)}
                            </span>
                          </td>
                          <td className="number-col">
                            <span style={{ color: job.orePianificabili > 0 ? "#f59e0b" : "#10b981", fontWeight: "600" }}>
                              {job.orePianificabili.toFixed(1)}
                            </span>
                          </td>
                          <td className="actions-col">
                            <button
                              className="primary-small"
                              onClick={() => onCreateTaskFromJob?.(job)}
                              title="Crea task da questa commessa"
                            >
                              +
                            </button>
                          </td>
                        </tr>
                      ))
                    ];
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginazione */}
          <div style={{ 
            padding: "24px", 
            textAlign: "center", 
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            alignItems: "center"
          }}>
            <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "8px" }}>
              Visualizzati: <strong>{jobs.length}</strong> / <strong>82,289</strong> commesse
            </div>
            
            {hasMore && (
              <button
                className="primary"
                onClick={() => loadJobs(page + 1)}
                disabled={loading}
                style={{
                  padding: "10px 24px",
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? "not-allowed" : "pointer"
                }}
              >
                {loading ? "Caricamento..." : "📥 Carica altri 100"}
              </button>
            )}

            {!hasMore && jobs.length > 0 && (
              <div style={{ color: "#10b981", fontWeight: "600", fontSize: "14px" }}>
                ✅ Tutte le commesse caricate!
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
