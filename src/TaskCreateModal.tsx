import { useEffect, useState } from "react";
import { createTask, getJobs } from "./api";
import type { Task } from "./types";

type JobOption = {
  jobNo: string;
  customerName: string;
  planDescription: string;
};

interface Props {
  onTaskCreated: (task: Task) => void;
  onClose: () => void;
}

const emptyTask = {
  commessa: "",
  description: "",
  client: "",
  hours: 1,
  status: "todo" as const
};

export default function TaskCreateModal({ onTaskCreated, onClose }: Props) {
  const [taskDraft, setTaskDraft] = useState(emptyTask);
  const [error, setError] = useState<string | null>(null);
  const [jobSearch, setJobSearch] = useState("");
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  useEffect(() => {
    const query = jobSearch.trim();

    if (query.length < 2) {
      setJobOptions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLoadingJobs(true);
        // Disabilita i filtri di esclusione per includere tutte le commesse
        const jobs = await getJobs({
          limit: 100,
          search: query,
          excludeTrasferta: false,
          excludeMatching: false
        });
        const mapped: JobOption[] = jobs
          .map((job: any) => ({
            jobNo: String(job.JobNo || "").trim(),
            customerName: String(job["Customer Name"] || "").trim(),
            planDescription: String(job["Plan Description"] || "").trim()
          }))
          .filter((job: JobOption) => job.jobNo.length > 0);
        setJobOptions(mapped);
      } catch {
        setJobOptions([]);
      } finally {
        setLoadingJobs(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [jobSearch]);

  const handleSelectOpenJob = (selectedKey: string) => {
    if (!selectedKey) return;
    const selected = jobOptions.find(
      (job) => `${job.jobNo}||${job.planDescription}||${job.customerName}` === selectedKey
    );
    if (!selected) return;

    setTaskDraft((prev) => ({
      ...prev,
      commessa: selected.jobNo,
      client: selected.customerName || prev.client,
      description: selected.planDescription || prev.description
    }));
  };

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      const created = await createTask({
        ...taskDraft,
        hours: Number(taskDraft.hours)
      });
      onTaskCreated(created);
      setTaskDraft(emptyTask);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore creazione task");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Crea nuovo task</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="alert">{error}</div>}

        <form className="modal-body" onSubmit={handleCreateTask}>
          <label>
            Cerca commessa aperta
            <input
              value={jobSearch}
              onChange={(event) => setJobSearch(event.target.value)}
              placeholder="Digita almeno 2 caratteri (numero, cliente, descrizione)"
            />
            {loadingJobs && <small style={{ color: "#64748b" }}>Ricerca commesse...</small>}
          </label>

          {jobOptions.length > 0 && (
            <label>
              Seleziona da elenco
              <select defaultValue="" onChange={(event) => handleSelectOpenJob(event.target.value)}>
                <option value="">Scegli una commessa aperta</option>
                {jobOptions.map((job) => (
                  <option
                    key={`${job.jobNo}-${job.planDescription}-${job.customerName}`}
                    value={`${job.jobNo}||${job.planDescription}||${job.customerName}`}
                  >
                    {job.jobNo} — {job.planDescription || "Descrizione non disponibile"} ({job.customerName || "Cliente non disponibile"})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Numero commessa
            <input
              required
              value={taskDraft.commessa}
              onChange={(event) =>
                setTaskDraft((prev) => ({ ...prev, commessa: event.target.value }))
              }
              placeholder="Es. 2026-012"
            />
          </label>

          <label>
            Descrizione
            <textarea
              required
              rows={4}
              value={taskDraft.description}
              onChange={(event) =>
                setTaskDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Descrivi l'attività"
            />
          </label>

          <label>
            Cliente
            <input
              required
              value={taskDraft.client}
              onChange={(event) =>
                setTaskDraft((prev) => ({ ...prev, client: event.target.value }))
              }
              placeholder="Es. Acme Corp"
            />
          </label>

          <label>
            Ore dedicate
            <input
              required
              type="number"
              step="0.5"
              min="0.5"
              value={taskDraft.hours}
              onChange={(event) =>
                setTaskDraft((prev) => ({
                  ...prev,
                  hours: parseFloat(event.target.value) || 0
                }))
              }
            />
          </label>

          <div className="modal-footer">
            <button type="button" className="secondary" onClick={onClose}>
              Annulla
            </button>
            <button type="submit" className="primary">
              Crea task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
