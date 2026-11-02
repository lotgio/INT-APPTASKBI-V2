import { useEffect, useState } from "react";
import { getJobs } from "./api";
import type { Task, TaskStatus, Member } from "./types";

type JobOption = {
  jobNo: string;
  customerName: string;
  planDescription: string;
};

interface Props {
  task: Task;
  members: Member[];
  onSave: (updated: Task) => void;
  onDelete?: (task: Task) => void;
  onClose: () => void;
}

const statusLabels: Record<TaskStatus, string> = {
  todo: "Da fare",
  "in-progress": "In corso",
  done: "Completato"
};

function isLeaveTask(task: Task): boolean {
  return String(task.commessa || "").trim().toUpperCase() === "FERIE";
}

export default function TaskDetailModal({ task, members, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState(task);
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

    setDraft((prev) => ({
      ...prev,
      commessa: selected.jobNo,
      client: selected.customerName || prev.client,
      description: selected.planDescription || prev.description
    }));
  };

  const handleSave = async () => {
    setError(null);

    // Validazione base
    if (!draft.commessa || !draft.description || !draft.client || draft.hours < 0.5) {
      setError("Compila tutti i campi obbligatori");
      return;
    }

    try {
      onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Modifica Task</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="alert">{error}</div>}

        <div className="modal-body">
          <label>
            Cerca commessa aperta
            <input
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              placeholder="Digita almeno 2 caratteri (numero, cliente, descrizione)"
            />
            {loadingJobs && <small style={{ color: "#64748b" }}>Ricerca commesse...</small>}
          </label>

          {jobOptions.length > 0 && (
            <label>
              Seleziona da elenco
              <select defaultValue="" onChange={(e) => handleSelectOpenJob(e.target.value)}>
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
              value={draft.commessa}
              onChange={(e) => setDraft((prev) => ({ ...prev, commessa: e.target.value }))}
              placeholder="Es. 2026-012"
            />
          </label>

          <label>
            Descrizione
            <textarea
              required
              rows={4}
              value={draft.description}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Descrivi l'attività"
            />
          </label>

          <label>
            Cliente
            <input
              required
              value={draft.client}
              onChange={(e) => setDraft((prev) => ({ ...prev, client: e.target.value }))}
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
              value={draft.hours}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  hours: parseFloat(e.target.value) || 0
                }))
              }
            />
          </label>

          <label>
            Assegnatario
            <select
              value={draft.assigneeId ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  assigneeId: e.target.value || undefined
                }))
              }
            >
              <option value="">Non assegnato</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Stato
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  status: e.target.value as TaskStatus
                }))
              }
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {draft.startDate && draft.endDate && (
            <div className="info-box">
              <strong>Periodo schedulato:</strong>
              <p>
                {draft.startDate} → {draft.endDate}
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {isLeaveTask(task) && onDelete && (
            <button className="danger" onClick={() => onDelete(task)}>
              Elimina ferie
            </button>
          )}
          <button className="secondary" onClick={onClose}>
            Annulla
          </button>
          <button className="primary" onClick={handleSave}>
            Salva modifiche
          </button>
        </div>
      </div>
    </div>
  );
}
