import { useState } from "react";
import { deleteTask } from "./api";
import type { Member, Task } from "./types";

interface Props {
  tasks: Task[];
  members: Member[];
  onTasksUpdate: (tasks: Task[]) => void;
  onSwitchPage: () => void;
}

const statusLabels: Record<string, string> = {
  todo: "Da fare",
  "in-progress": "In corso",
  done: "Completato"
};

export default function TaskDatabasePage({
  tasks,
  members,
  onTasksUpdate,
  onSwitchPage
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"commessa" | "client" | "date" | "assignee">("commessa");

  const memberMap = new Map(members.map((m) => [m.id, m]));

  const sortedTasks = [...tasks].sort((a, b) => {
    switch (sortBy) {
      case "commessa":
        return a.commessa.localeCompare(b.commessa);
      case "client":
        return a.client.localeCompare(b.client);
      case "date":
        return (a.startDate || "").localeCompare(b.startDate || "");
      case "assignee":
        const nameA = memberMap.get(a.assigneeId ?? "")?.name ?? "Non assegnato";
        const nameB = memberMap.get(b.assigneeId ?? "")?.name ?? "Non assegnato";
        return nameA.localeCompare(nameB);
      default:
        return 0;
    }
  });

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Vuoi eliminare questo task?")) {
      return;
    }

    setError(null);
    try {
      await deleteTask(taskId);
      onTasksUpdate(tasks.filter((t) => t.id !== taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione task");
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Database Task</p>
          <h1>Tutti i Task</h1>
          <p className="subtitle">
            Visualizza, ordina e gestisci tutti i task inseriti nel sistema.
          </p>
        </div>
        <button className="primary" onClick={onSwitchPage}>
          Torna al calendario
        </button>
      </header>

      {error && <div className="alert">{error}</div>}

      <main className="database-page-layout">
        <section className="panel">
          <div className="database-controls">
            <div className="stats-row">
              <div className="stat">
                <strong>{tasks.length}</strong>
                <span>Task totali</span>
              </div>
              <div className="stat">
                <strong>{tasks.filter((t) => !t.startDate).length}</strong>
                <span>Non schedulati</span>
              </div>
              <div className="stat">
                <strong>{tasks.filter((t) => t.assigneeId).length}</strong>
                <span>Assegnati</span>
              </div>
              <div className="stat">
                <strong>{tasks.reduce((sum, t) => sum + t.hours, 0)}h</strong>
                <span>Ore totali</span>
              </div>
            </div>

            <div className="sort-controls">
              <label>
                Ordina per:
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                  <option value="commessa">Numero commessa</option>
                  <option value="client">Cliente</option>
                  <option value="date">Data inizio</option>
                  <option value="assignee">Assegnatario</option>
                </select>
              </label>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="empty">Nessun task inserito. Inizia creando un nuovo task!</div>
          ) : (
            <div className="database-table">
              <table>
                <thead>
                  <tr>
                    <th>Commessa</th>
                    <th>Cliente</th>
                    <th>Descrizione</th>
                    <th>Ore</th>
                    <th>Inizio</th>
                    <th>Fine</th>
                    <th>Assegnatario</th>
                    <th>Stato</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTasks.map((task) => {
                    const assignee = task.assigneeId ? memberMap.get(task.assigneeId) : null;
                    return (
                      <tr key={task.id}>
                        <td className="badge-col">
                          <span className="badge">{task.commessa}</span>
                        </td>
                        <td>{task.client}</td>
                        <td className="description-col">{task.description}</td>
                        <td className="number-col">{task.hours}h</td>
                        <td className="date-col">{task.startDate || "—"}</td>
                        <td className="date-col">{task.endDate || "—"}</td>
                        <td>{assignee?.name || "Non assegnato"}</td>
                        <td>
                          <span className={`status ${task.status}`}>
                            {statusLabels[task.status]}
                          </span>
                        </td>
                        <td className="actions-col">
                          <button
                            className="danger-small"
                            onClick={() => handleDeleteTask(task.id)}
                            title="Elimina task"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
