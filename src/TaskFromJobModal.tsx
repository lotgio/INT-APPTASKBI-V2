import { useState } from "react";
import { createTask } from "./api";
import type { Task, Member } from "./types";

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

interface Props {
  job: Job;
  members: Member[];
  onTaskCreated: (task: Task) => void;
  onClose: () => void;
}

export default function TaskFromJobModal({ job, members, onTaskCreated, onClose }: Props) {
  const [hours, setHours] = useState(1);
  const [assigneeId, setAssigneeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (hours <= 0) {
      setError("Le ore devono essere maggiori di zero");
      return;
    }

    // soft warning only — allow overplanning intentionally

    try {
      const created = await createTask({
        commessa: job.jobNo,
        description: job.planDescription || `Task per ${job.jobNo}`,
        client: job.customerName,
        hours: Number(hours),
        assigneeId: assigneeId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status: "todo"
      });
      onTaskCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore creazione task");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Crea task da commessa</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="alert">{error}</div>}

        <form className="modal-body" onSubmit={handleCreateTask}>
          <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f1f5f9", borderRadius: "8px" }}>
            <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
              <div><strong>Job No:</strong> {job.jobNo}{job.jobPlanNo ? ` — riga ${job.jobPlanNo}` : ""}</div>
              <div><strong>Cliente:</strong> {job.customerName}</div>
              <div><strong>Division:</strong> {job.division}</div>
              <div><strong>Ore vendute:</strong> {job.quantity.toFixed(1)}h</div>
              <div><strong>Ore loggate (ufficiali):</strong> {job.ogreLoggate.toFixed(1)}h</div>
              <div><strong>Ore pianificate totali:</strong> {job.orePianificate.toFixed(1)}h</div>
              <div><strong>Ore pianificate aperte:</strong> {job.orePianificateAperte.toFixed(1)}h</div>
              <div><strong>Ore residue ufficiali:</strong> {job.oreResidueUfficiali.toFixed(1)}h</div>
              <div><strong>Ore pianificabili:</strong> <span style={{ color: job.orePianificabili > 0 ? "#f59e0b" : "#ef4444", fontWeight: "600" }}>{job.orePianificabili.toFixed(1)}h {job.orePianificabili <= 0 ? "— già coperta da task aperti" : ""}</span></div>
            </div>
          </div>

          <label>
            Ore da pianificare
            <input
              required
              type="number"
              step="0.5"
              min="0.5"
              value={hours}
              onChange={(event) => setHours(parseFloat(event.target.value) || 0)}
            />
            <small style={{ color: job.orePianificabili > 0 ? "#64748b" : "#ef4444" }}>
              {job.orePianificabili > 0
                ? `${job.orePianificabili.toFixed(1)}h teoricamente pianificabili (vendute - loggate - pianificate aperte)`
                : `Commessa già coperta da task aperti — la pianificazione extra è consentita`}
            </small>
          </label>

          <label>
            Assegna a (opzionale)
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Nessun assegnatario</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name} {m.role ? `(${m.role})` : ""}</option>
              ))}
            </select>
          </label>

          <label>
            Data inizio (opzionale)
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>

          <label>
            Data fine (opzionale)
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
            />
          </label>

          <div className="modal-footer">
            <button type="button" className="secondary" onClick={onClose}>
              Annulla
            </button>
            <button type="submit" className="primary">
              Crea e assegna task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
