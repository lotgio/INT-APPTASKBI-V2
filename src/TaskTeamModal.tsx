import { useState } from "react";
import { createMember, updateMember, deleteMember } from "./api";
import type { Member } from "./types";

interface Props {
  members: Member[];
  onMembersUpdate: (members: Member[]) => void;
  onClose: () => void;
}

export default function TaskTeamModal({ members, onMembersUpdate, onClose }: Props) {
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberAnnualTarget, setMemberAnnualTarget] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreateMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      const created = await createMember({
        name: memberName,
        role: memberRole || undefined,
        annualTarget: memberAnnualTarget ? parseFloat(memberAnnualTarget) : undefined
      });
      onMembersUpdate([...members, created]);
      setMemberName("");
      setMemberRole("");
      setMemberAnnualTarget("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore creazione membro");
    }
  };

  const handleStartEditTarget = (member: Member) => {
    setEditingMemberId(member.id);
    setEditingTarget(member.annualTarget?.toString() || "");
  };

  const handleSaveTarget = async (memberId: string) => {
    try {
      const updated = await updateMember(memberId, {
        annualTarget: editingTarget ? parseFloat(editingTarget) : undefined
      });
      onMembersUpdate(members.map((m) => (m.id === memberId ? updated : m)));
      setEditingMemberId(null);
      setEditingTarget("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore aggiornamento target");
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!window.confirm("Vuoi eliminare questo membro?")) {
      return;
    }

    try {
      await deleteMember(memberId);
      onMembersUpdate(members.filter((m) => m.id !== memberId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione membro");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Gestione team</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="alert">{error}</div>}

        <div className="modal-body">
          <h3>Nuovo membro</h3>
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
              Obiettivo annuo (opzionale)
              <input
                type="number"
                value={memberAnnualTarget}
                onChange={(event) => setMemberAnnualTarget(event.target.value)}
                placeholder="Es. 50000"
                step="1000"
                min="0"
              />
            </label>
            <button type="submit" className="primary">
              Aggiungi membro
            </button>
          </form>

          <h3 style={{ marginTop: "24px" }}>Membri esistenti</h3>
          {members.length === 0 ? (
            <p className="empty">Nessun membro nel team</p>
          ) : (
            <div className="team-list">
              {members.map((member) => (
                <div key={member.id} className="team-member-item">
                  <div className="team-member-info">
                    <strong>{member.name}</strong>
                    <div className="team-member-details">
                      {member.role && <span className="role">{member.role}</span>}
                      {editingMemberId === member.id ? (
                        <div className="target-edit">
                          <input
                            type="number"
                            value={editingTarget}
                            onChange={(e) => setEditingTarget(e.target.value)}
                            placeholder="Es. 50000"
                            step="1000"
                            min="0"
                            autoFocus
                          />
                          <button
                            className="primary-small"
                            onClick={() => handleSaveTarget(member.id)}
                          >
                            Salva
                          </button>
                          <button
                            className="secondary-small"
                            onClick={() => setEditingMemberId(null)}
                          >
                            Annulla
                          </button>
                        </div>
                      ) : (
                        <span
                          className="target target-clickable"
                          onClick={() => handleStartEditTarget(member)}
                          title="Clicca per modificare"
                        >
                          Target: {member.annualTarget ? `€${member.annualTarget.toLocaleString('it-IT', { maximumFractionDigits: 0 })}/anno` : "Non impostato"}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="danger-small"
                    onClick={() => handleDeleteMember(member.id)}
                  >
                    Elimina
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
