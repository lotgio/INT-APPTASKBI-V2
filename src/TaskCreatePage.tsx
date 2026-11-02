import { useState } from "react";
import { createMember, createTask } from "./api";
import type { Member, Task } from "./types";

interface Props {
  members: Member[];
  onTaskCreated: (task: Task) => void;
  onSwitchPage: () => void;
}

const emptyTask = {
  commessa: "",
  description: "",
  client: "",
  hours: 1,
  status: "todo" as const
};

export default function TaskCreatePage({ members, onTaskCreated, onSwitchPage }: Props) {
  const [taskDraft, setTaskDraft] = useState(emptyTask);
  const [manualId, setManualId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      const created = await createTask({
        ...taskDraft,
        hours: Number(taskDraft.hours),
        id: manualId || undefined
      });
      onTaskCreated(created);
      setTaskDraft(emptyTask);
      setManualId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore creazione task");
    }
  };

  const handleCreateMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      await createMember({ name: memberName, role: memberRole || undefined });
      setMemberName("");
      setMemberRole("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore creazione membro");
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Reparto operativo</p>
          <h1>Creazione task</h1>
          <p className="subtitle">Popola il database con i task per il team.</p>
        </div>
        <button className="primary" onClick={onSwitchPage}>
          Vai alla gestione
        </button>
      </header>

      {error && <div className="alert">{error}</div>}

      <main className="layout">
        <section className="panel">
          <h2>Nuovo task</h2>
          <form className="form" onSubmit={handleCreateTask}>
            <label>
              ID task (opzionale)
              <input
                value={manualId}
                onChange={(event) => setManualId(event.target.value)}
                placeholder="Lascia vuoto per auto-generare"
              />
            </label>
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
            <button type="submit" className="primary">
              Crea task
            </button>
          </form>

          <h2>Gestione team</h2>
          <p className="subtitle-small">Clicca per gestire i membri del team</p>
          <button className="secondary" onClick={onSwitchPage}>
            Vai al team
          </button>
        </section>
      </main>
    </div>
  );
}
