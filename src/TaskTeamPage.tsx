import { useState } from "react";
import { createMember, deleteTask } from "./api";
import type { Member, Task } from "./types";

type TeamGroupScope = "all" | "bi" | "crm";

interface Props {
  tasks: Task[];
  members: Member[];
  onMembersUpdate: (members: Member[]) => void;
  onSwitchPage: () => void;
}

export default function TaskTeamPage({
  tasks,
  members,
  onMembersUpdate,
  onSwitchPage
}: Props) {
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberGroup, setMemberGroup] = useState<"bi" | "crm" | "">("bi");
  const [groupFilter, setGroupFilter] = useState<TeamGroupScope>("all");
  const [error, setError] = useState<string | null>(null);

  const handleCreateMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      const created = await createMember({
        name: memberName,
        role: memberRole || undefined,
        group: (memberGroup as "bi" | "crm") || undefined
      });
      onMembersUpdate([...members, created]);
      setMemberName("");
      setMemberRole("");
      setMemberGroup("bi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore creazione membro");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Vuoi eliminare questo task?")) {
      return;
    }

    try {
      await deleteTask(taskId);
      // Non possiamo aggiornare la lista di task direttamente
      // La pagina si aggiornerà al ritorno a manage
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione task");
    }
  };

  const getAssignedTaskCount = (memberId: string) => {
    return tasks.filter((task) => task.assigneeId === memberId).length;
  };

  const getTotalAssignedHours = (memberId: string) => {
    return tasks
      .filter((task) => task.assigneeId === memberId)
      .reduce((sum, task) => sum + task.hours, 0);
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Team Management</p>
          <h1>Gestione Team</h1>
          <p className="subtitle">
            Aggiungi o rimuovi membri del team e visualizza i loro task assegnati.
          </p>
        </div>
        <button className="primary" onClick={onSwitchPage}>
          Torna ai task
        </button>
      </header>

      {error && <div className="alert">{error}</div>}

      <main className="layout">
        <section className="panel">
          <h2>Nuovo membro</h2>
          <form className="form" onSubmit={handleCreateMember}>
            <label>
              Nome
              <input
                required
                value={memberName}
                onChange={(event) => setMemberName(event.target.value)}
                placeholder="Nome e cognome"
              />
            </label>
            <label>
              Ruolo (opzionale)
              <input
                value={memberRole}
                onChange={(event) => setMemberRole(event.target.value)}
                placeholder="Es. Tecnico, Designer, Manager"
              />
            </label>
            <label>
              Gruppo
              <select value={memberGroup} onChange={(e) => setMemberGroup(e.target.value as "bi" | "crm" | "")}>
                <option value="bi">BI</option>
                <option value="crm">CRM</option>
                <option value="">Non assegnato</option>
              </select>
            </label>
            <button type="submit" className="primary">
              Aggiungi membro
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Membri del team</h2>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
              Filtra per gruppo:
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value as TeamGroupScope)} style={{ padding: "4px 8px", fontSize: "13px" }}>
                <option value="all">Tutti</option>
                <option value="bi">BI</option>
                <option value="crm">CRM</option>
              </select>
            </label>
          </div>
          {members.length === 0 ? (
            <div className="empty">Nessun membro nel team. Aggiungine uno a sinistra!</div>
          ) : (
            <div className="members-list">
              {members.filter(m => groupFilter === "all" || m.group === groupFilter).map((member) => (
                <div key={member.id} className="member-card">
                  <div className="member-info">
                    <strong>{member.name}</strong>
                    {member.role && <em>{member.role}</em>}
                    {member.group && <span style={{ fontSize: "11px", background: member.group === "bi" ? "#dbeafe" : "#dcfce7", color: member.group === "bi" ? "#1d4ed8" : "#15803d", borderRadius: "4px", padding: "1px 6px", marginLeft: "4px" }}>{member.group.toUpperCase()}</span>}
                  </div>
                  <div className="member-stats">
                    <span>{getAssignedTaskCount(member.id)} task</span>
                    <span>{getTotalAssignedHours(member.id)}h totali</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ marginTop: "32px" }}>Task non assegnati</h2>
          {tasks.filter((t) => !t.assigneeId).length === 0 ? (
            <div className="empty">Tutti i task sono assegnati!</div>
          ) : (
            <div className="task-list">
              {tasks
                .filter((t) => !t.assigneeId)
                .map((task) => (
                  <article key={task.id} className="task-card">
                    <div>
                      <div className="task-meta">
                        <span className="badge">{task.commessa}</span>
                        <span className="badge secondary">{task.client}</span>
                        <span className="hours">{task.hours}h</span>
                      </div>
                      <h4>{task.description}</h4>
                    </div>
                    <button
                      className="danger-small"
                      onClick={() => handleDeleteTask(task.id)}
                    >
                      Elimina
                    </button>
                  </article>
                ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
