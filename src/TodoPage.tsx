import { useEffect, useMemo, useState } from "react";
import { createTodo, deleteTodo, getJobs, updateTodo } from "./api";
import type { Member, TodoItem } from "./types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface JobOption {
  jobNo: string;
  client: string;
  businessUnit: string;
  planDescription: string;
  detailDescription: string;
}

interface Props {
  todos: TodoItem[];
  members: Member[];
  onTodosUpdate: (todos: TodoItem[]) => void;
  onSwitchPage: (page: string) => void;
}

const MAX_JOBS = 0; // 0 = nessun limite (carica tutte le commesse disponibili)

// Color palette for resources - predefined colors
const COLOR_PALETTE = [
  { bg: "rgb(239, 68, 68)", text: "white", name: "Rosso" },      // Red
  { bg: "rgb(59, 130, 246)", text: "white", name: "Blu" },        // Blue
  { bg: "rgb(34, 197, 94)", text: "white", name: "Verde" },       // Green
  { bg: "rgb(168, 85, 247)", text: "white", name: "Viola" },      // Purple
  { bg: "rgb(249, 115, 22)", text: "white", name: "Arancio" },    // Orange
  { bg: "rgb(236, 72, 153)", text: "white", name: "Rosa" },       // Pink
  { bg: "rgb(14, 165, 233)", text: "white", name: "Azzurro" },    // Cyan
  { bg: "rgb(139, 92, 246)", text: "white", name: "Indaco" },     // Indigo
  { bg: "rgb(20, 184, 166)", text: "white", name: "Teal" },       // Teal
  { bg: "rgb(251, 146, 60)", text: "white", name: "Arancio-Scuro" }, // Dark Orange
];

// Hash function to get consistent color for a resource name
function getResourceColor(resourceName: string | undefined): { bg: string; text: string } {
  if (!resourceName) {
    return { bg: "rgb(107, 114, 128)", text: "white" }; // Gray for no resource
  }
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < resourceName.length; i++) {
    const char = resourceName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const colorIndex = Math.abs(hash) % COLOR_PALETTE.length;
  const color = COLOR_PALETTE[colorIndex];
  return { bg: color.bg, text: color.text };
}

// Sortable card component per drag & drop
function SortableTodoCard({ 
  todo, 
  members, 
  onToggle, 
  onDelete, 
  onEdit 
}: { 
  todo: TodoItem; 
  members: Member[]; 
  onToggle: (id: string, completed: boolean) => void; 
  onDelete: (id: string) => void;
  onEdit: (todo: TodoItem) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const member = members.find((m) => m.id === todo.resourceId);

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`todo-card ${todo.completed ? "is-done" : ""}`}
    >
      <div className="todo-card-drag" {...attributes} {...listeners}>
        <span>⋮⋮</span>
      </div>
      <div className="todo-card-content" onClick={() => onEdit(todo)}>
        <div className="todo-card-top">
          <div>
            <h5>{todo.title}</h5>
            {todo.description && <p>{todo.description}</p>}
          </div>
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={(e) => {
              e.stopPropagation();
              onToggle(todo.id, todo.completed);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <div className="todo-card-tags">
          {todo.commessa && <span className="todo-tag">{todo.commessa}</span>}
          {todo.client && <span className="todo-tag">{todo.client}</span>}
          {todo.businessUnit && <span className="todo-tag-bu">📊 {todo.businessUnit}</span>}
          {member && (
            <span 
              className="todo-tag-resource-dynamic"
              style={{
                backgroundColor: getResourceColor(member.name).bg,
                color: getResourceColor(member.name).text,
              }}
            >
              👤 {member.name}
            </span>
          )}
        </div>
        <div className="todo-card-footer">
          <span>
            {todo.dueDate ? new Date(todo.dueDate).toLocaleDateString("it-IT") : "Senza data"}
          </span>
          <button 
            className="ghost" 
            onClick={(e) => {
              e.stopPropagation();
              onDelete(todo.id);
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </article>
  );
}

// Modal per edit
function TodoEditModal({
  todo,
  jobs,
  members,
  onClose,
  onSave,
}: {
  todo: TodoItem;
  jobs: JobOption[];
  members: Member[];
  onClose: () => void;
  onSave: (updated: Partial<TodoItem>) => void;
}) {
  const [editForm, setEditForm] = useState<Partial<TodoItem>>({
    title: todo.title,
    description: todo.description,
    commessa: todo.commessa,
    client: todo.client,
    businessUnit: todo.businessUnit,
    resourceId: todo.resourceId,
    dueDate: todo.dueDate,
    completed: todo.completed,
  });
  const [jobQuery, setJobQuery] = useState(todo.commessa || "");

  const selectedJob = useMemo(
    () => jobs.find((j) => j.jobNo === editForm.commessa),
    [jobs, editForm.commessa]
  );

  const filteredEditJobs = useMemo(() => {
    const normalized = normalizeText(jobQuery);
    if (!normalized) return jobs;
    return jobs.filter((job: JobOption) => {
      return (
        normalizeText(job.jobNo).includes(normalized) ||
        normalizeText(job.planDescription).includes(normalized) ||
        normalizeText(job.detailDescription).includes(normalized) ||
        normalizeText(job.client).includes(normalized) ||
        normalizeText(job.businessUnit).includes(normalized)
      );
    });
  }, [jobs, jobQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editForm);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Modifica Task</h3>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="todo-field">
            <label>Attività *</label>
            <input
              type="text"
              value={editForm.title || ""}
              onChange={(e) => setEditForm((prev: Partial<TodoItem>) => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>

          <div className="todo-field">
            <label>Descrizione</label>
            <textarea
              rows={3}
              value={editForm.description || ""}
              onChange={(e) => setEditForm((prev: Partial<TodoItem>) => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div className="todo-form-row">
            <div className="todo-field">
              <label>Cerca commessa</label>
              <input
                type="text"
                placeholder="Filtra per codice o descrizione"
                value={jobQuery}
                onChange={(e) => setJobQuery(e.target.value)}
              />
            </div>
            <div className="todo-field">
              <label>Commessa</label>
              <select
                value={editForm.commessa || ""}
                onChange={(e) => {
                  const jobNo = e.target.value;
                  const job = jobs.find((j) => j.jobNo === jobNo);
                  setJobQuery(jobNo);
                  setEditForm((prev: Partial<TodoItem>) => ({
                    ...prev,
                    commessa: jobNo || undefined,
                    client: job?.client || prev.client,
                    businessUnit: job?.businessUnit || prev.businessUnit,
                  }));
                }}
              >
                <option value="">Nessuna commessa</option>
                {filteredEditJobs.map((job) => (
                  <option key={job.jobNo} value={job.jobNo}>
                    {job.jobNo} · {job.planDescription || job.detailDescription || "Senza descrizione"}
                  </option>
                ))}
              </select>
            </div>

            <div className="todo-field">
              <label>Risorsa</label>
              <select
                value={editForm.resourceId || ""}
                onChange={(e) => setEditForm((prev: Partial<TodoItem>) => ({ ...prev, resourceId: e.target.value || undefined }))}
              >
                <option value="">Nessuna risorsa</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="todo-form-row">
            <div className="todo-field">
              <label>Cliente</label>
              <input
                type="text"
                value={editForm.client || ""}
                onChange={(e) => setEditForm((prev: Partial<TodoItem>) => ({ ...prev, client: e.target.value || undefined }))}
                disabled={!!selectedJob}
              />
            </div>

            <div className="todo-field">
              <label>Business Unit</label>
              <input
                type="text"
                value={editForm.businessUnit || ""}
                onChange={(e) => setEditForm((prev: Partial<TodoItem>) => ({ ...prev, businessUnit: e.target.value || undefined }))}
                disabled={!!selectedJob}
              />
            </div>
          </div>

          <div className="todo-form-row">
            <div className="todo-field">
              <label>Scadenza</label>
              <input
                type="date"
                value={editForm.dueDate || ""}
                onChange={(e) => setEditForm((prev: Partial<TodoItem>) => ({ ...prev, dueDate: e.target.value || undefined }))}
              />
            </div>

            <div className="todo-field">
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={editForm.completed || false}
                  onChange={(e) => setEditForm((prev: Partial<TodoItem>) => ({ ...prev, completed: e.target.checked }))}
                />
                Completato
              </label>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Annulla
            </button>
            <button type="submit" className="primary">
              Salva modifiche
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export default function TodoPage({ todos, members, onTodosUpdate }: Props) {
  const [newTodo, setNewTodo] = useState<Partial<TodoItem>>({
    title: "",
    completed: false
  });
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState("");
  const [buFilter, setBuFilter] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [selectedJobNo, setSelectedJobNo] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "all">("open");
  const [viewMode, setViewMode] = useState<"board" | "list">("list");
  const [groupBy, setGroupBy] = useState<string[]>(["client"]); // Raggruppamenti multipli
  const [boardGroupBy, setBoardGroupBy] = useState<
    "dueDate" | "status" | "client" | "commessa" | "businessUnit" | "resource"
  >("dueDate");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Drag & drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    let active = true;
    const loadJobs = async () => {
      setJobsLoading(true);
      setJobsError(null);
      try {
        const rawJobs = await getJobs({
          limit: MAX_JOBS,
          offset: 0,
          excludeTrasferta: false,
          excludeMatching: false
        });
        if (!active) return;

        const deduped = new Map<string, JobOption>();
        rawJobs.forEach((job: any) => {
          const jobNo = String(job.JobNo || "").trim();
          if (!jobNo) return;
          
          const detailDesc = String(job["Detail Description"] || "").trim();
          const isTrasferta = detailDesc.toUpperCase().includes("TRASFERTA");
          
          // Se il job già esiste e la nuova riga è TRASFERTA, salta
          if (deduped.has(jobNo)) {
            const existing = deduped.get(jobNo)!;
            const existingIsTrasferta = existing.detailDescription.toUpperCase().includes("TRASFERTA");
            
            // Sostituisci solo se la nuova riga è migliore (non TRASFERTA quando l'esistente è TRASFERTA)
            if (existingIsTrasferta && !isTrasferta) {
              // La nuova riga è migliore, sostituisci
            } else {
              return; // Mantieni l'esistente
            }
          }
          
          deduped.set(jobNo, {
            jobNo,
            client: String(job["Customer Name"] || "").trim(),
            businessUnit: String(job.Division || "").trim(),
            planDescription: String(job["Plan Description"] || "").trim(),
            detailDescription: detailDesc
          });
        });

        const mapped = Array.from(deduped.values()).sort((a, b) => a.jobNo.localeCompare(b.jobNo));
        setJobs(mapped);
      } catch (err) {
        setJobsError(err instanceof Error ? err.message : "Errore caricamento commesse");
      } finally {
        setJobsLoading(false);
      }
    };

    loadJobs();
    return () => {
      active = false;
    };
  }, []);

  const clients = useMemo(() => {
    const values = jobs.map((job: JobOption) => job.client).filter(Boolean);
    return Array.from(new Set(values)).sort();
  }, [jobs]);

  const businessUnits = useMemo(() => {
    const values = jobs.map((job: JobOption) => job.businessUnit).filter(Boolean);
    return Array.from(new Set(values)).sort();
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const normalizedSearch = normalizeText(jobSearch);
    return jobs.filter((job: JobOption) => {
      const matchesClient = clientFilter ? job.client === clientFilter : true;
      const matchesBu = buFilter ? job.businessUnit === buFilter : true;
      const matchesSearch = normalizedSearch
        ? normalizeText(job.jobNo).includes(normalizedSearch) ||
          normalizeText(job.planDescription).includes(normalizedSearch) ||
          normalizeText(job.detailDescription).includes(normalizedSearch) ||
          normalizeText(job.client).includes(normalizedSearch) ||
          normalizeText(job.businessUnit).includes(normalizedSearch)
        : true;
      return matchesClient && matchesBu && matchesSearch;
    });
  }, [jobs, clientFilter, buFilter, jobSearch]);

  const selectedJob = useMemo(
    () => jobs.find((job: JobOption) => job.jobNo === selectedJobNo) || null,
    [jobs, selectedJobNo]
  );

  useEffect(() => {
    if (selectedJob) {
      setNewTodo((prev: Partial<TodoItem>) => ({
        ...prev,
        commessa: selectedJob.jobNo,
        client: selectedJob.client || prev.client,
        businessUnit: selectedJob.businessUnit || prev.businessUnit
      }));
      setClientFilter(selectedJob.client || "");
      setBuFilter(selectedJob.businessUnit || "");
      return;
    }

    setNewTodo((prev: Partial<TodoItem>) => ({
      ...prev,
      commessa: undefined
    }));
  }, [selectedJob]);

  useEffect(() => {
    if (selectedJob && (selectedJob.client !== clientFilter || selectedJob.businessUnit !== buFilter)) {
      setSelectedJobNo("");
    }
  }, [clientFilter, buFilter, selectedJob]);

  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newTodo.title?.trim()) {
      setError("Titolo obbligatorio");
      return;
    }

    try {
      const payload = {
        title: newTodo.title.trim(),
        description: newTodo.description?.trim() || undefined,
        client: selectedJob?.client || newTodo.client || clientFilter || undefined,
        commessa: selectedJob?.jobNo || newTodo.commessa || undefined,
        businessUnit: selectedJob?.businessUnit || newTodo.businessUnit || buFilter || undefined,
        resourceId: newTodo.resourceId,
        completed: false,
        dueDate: newTodo.dueDate || undefined
      };

      const created = await createTodo(payload);
      onTodosUpdate([created, ...todos]);
      setNewTodo({ title: "", completed: false });
      setSelectedJobNo("");
      setClientFilter("");
      setBuFilter("");
      setJobSearch("");
      setShowDetails(false);
      setIsCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore creazione");
    }
  };

  const handleToggleTodo = async (id: string, completed: boolean) => {
    try {
      const updated = await updateTodo(id, { completed: !completed });
      onTodosUpdate(todos.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore aggiornamento");
    }
  };

  const handleDeleteTodo = async (id: string) => {
    if (!window.confirm("Elimina questo to-do?")) return;
    try {
      await deleteTodo(id);
      onTodosUpdate(todos.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione");
    }
  };

  const handleEditTodo = (todo: TodoItem) => {
    setEditingTodo(todo);
  };

  const handleSaveEdit = async (updated: Partial<TodoItem>) => {
    if (!editingTodo) return;
    try {
      const saved = await updateTodo(editingTodo.id, updated);
      onTodosUpdate(todos.map((t) => (t.id === editingTodo.id ? saved : t)));
      setEditingTodo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio");
    }
  };

  const handleDragEnd = async (event: DragEndEvent, columnKey: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const column = boardColumns.find((c: { key: string }) => c.key === columnKey);
    if (!column) return;

    const oldIndex = column.items.findIndex((item: TodoItem) => item.id === active.id);
    const newIndex = column.items.findIndex((item: TodoItem) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(column.items, oldIndex, newIndex) as TodoItem[];
    
    // Aggiorna l'ordine locale
    const updatedTodos = [...todos];
    reordered.forEach((item: TodoItem, index: number) => {
      const todoIndex = updatedTodos.findIndex((t) => t.id === item.id);
      if (todoIndex !== -1) {
        updatedTodos[todoIndex] = item;
      }
    });

    onTodosUpdate(updatedTodos);
  };

  const toggleGroup = (groupKey: string) => {
    const newSet = new Set(collapsedGroups);
    if (newSet.has(groupKey)) {
      newSet.delete(groupKey);
    } else {
      newSet.add(groupKey);
    }
    setCollapsedGroups(newSet);
  };

  const filteredTodos = useMemo(() => {
    const normalized = normalizeText(searchTerm);
    return todos.filter((todo: TodoItem) => {
      const matchesStatus = statusFilter === "all" ? true : statusFilter === "done" ? todo.completed : !todo.completed;
      if (!matchesStatus) return false;
      if (!normalized) return true;
      return [todo.title, todo.description, todo.client, todo.commessa, todo.businessUnit]
        .filter(Boolean)
        .some((value) => normalizeText(String(value)).includes(normalized));
    });
  }, [todos, searchTerm, statusFilter]);

  const groupedTodos = useMemo(() => {
    if (groupBy.length === 0) {
      return [{ key: "all", label: "Tutti", todos: filteredTodos }];
    }

    // Crea una chiave combinata per ogni task basata sui criteri di raggruppamento
    const groups: Record<string, { label: string; todos: TodoItem[] }> = {};

    filteredTodos.forEach((todo: TodoItem) => {
      const keyParts: string[] = [];
      const labelParts: string[] = [];

      groupBy.forEach((criterion: string) => {
        let value = "";
        let label = "";

        switch (criterion) {
          case "status":
            value = todo.completed ? "completed" : "active";
            label = todo.completed ? "✅ Completati" : "🔵 Attivi";
            break;
          case "client":
            value = todo.client || "no-client";
            label = todo.client || "Senza cliente";
            break;
          case "commessa":
            value = todo.commessa || "no-commessa";
            label = todo.commessa || "Senza commessa";
            break;
          case "businessUnit":
            value = todo.businessUnit || "no-bu";
            label = todo.businessUnit || "Senza BU";
            break;
          case "resource":
            const member = members.find((m) => m.id === todo.resourceId);
            value = todo.resourceId || "no-resource";
            label = member?.name || "Senza risorsa";
            break;
          case "dueDate":
            if (!todo.dueDate) {
              value = "no-date";
              label = "Senza scadenza";
            } else {
              const due = new Date(todo.dueDate);
              const today = startOfDay(new Date());
              if (due < today) {
                value = "overdue";
                label = "Scaduti";
              } else if (due <= endOfDay(today)) {
                value = "today";
                label = "Oggi";
              } else if (due <= endOfDay(addDays(today, 6))) {
                value = "week";
                label = "Questa settimana";
              } else {
                value = "later";
                label = "Più avanti";
              }
            }
            break;
        }

        keyParts.push(value);
        labelParts.push(label);
      });

      const groupKey = keyParts.join("|");
      const groupLabel = labelParts.join(" › ");

      if (!groups[groupKey]) {
        groups[groupKey] = { label: groupLabel, todos: [] };
      }
      groups[groupKey].todos.push(todo);
    });

    return Object.entries(groups)
      .map(([key, { label, todos }]) => ({ key, label, todos }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredTodos, groupBy, members]);

  const today = startOfDay(new Date());
  const weekEnd = endOfDay(addDays(today, 6));

  const overdueCount = useMemo(() => {
    return filteredTodos.filter((todo: TodoItem) => {
      if (todo.completed || !todo.dueDate) return false;
      return new Date(todo.dueDate) < today;
    }).length;
  }, [filteredTodos, today]);

  const boardColumns = useMemo(() => {
    if (boardGroupBy === "dueDate") {
      const columns = [
        {
          key: "overdue",
          title: "Scaduti",
          description: "Da chiudere subito",
          items: filteredTodos.filter((todo: TodoItem) => {
            if (todo.completed || !todo.dueDate) return false;
            return new Date(todo.dueDate) < today;
          })
        },
        {
          key: "today",
          title: "Oggi",
          description: "Da fare oggi",
          items: filteredTodos.filter((todo: TodoItem) => {
            if (todo.completed || !todo.dueDate) return false;
            const due = new Date(todo.dueDate);
            return due >= today && due <= endOfDay(today);
          })
        },
        {
          key: "week",
          title: "Questa settimana",
          description: "Priorita breve",
          items: filteredTodos.filter((todo: TodoItem) => {
            if (todo.completed || !todo.dueDate) return false;
            const due = new Date(todo.dueDate);
            return due > endOfDay(today) && due <= weekEnd;
          })
        },
        {
          key: "later",
          title: "Piu avanti",
          description: "Programmate",
          items: filteredTodos.filter((todo: TodoItem) => {
            if (todo.completed || !todo.dueDate) return false;
            const due = new Date(todo.dueDate);
            return due > weekEnd;
          })
        },
        {
          key: "nodate",
          title: "Senza data",
          description: "Da pianificare",
          items: filteredTodos.filter((todo: TodoItem) => !todo.completed && !todo.dueDate)
        },
        {
          key: "done",
          title: "Completati",
          description: "Chiusi",
          items: filteredTodos.filter((todo: TodoItem) => todo.completed)
        }
      ];

      return columns.map((column) => ({
        ...column,
        items: column.items.sort((a: TodoItem, b: TodoItem) => {
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          return aDate - bDate;
        })
      }));
    }

    if (boardGroupBy === "status") {
      return [
        {
          key: "active",
          title: "Attivi",
          description: "",
          items: filteredTodos.filter((todo: TodoItem) => !todo.completed)
        },
        {
          key: "done",
          title: "Completati",
          description: "",
          items: filteredTodos.filter((todo: TodoItem) => todo.completed)
        }
      ];
    }

    const columnMap = new Map<string, { key: string; title: string; description: string; items: TodoItem[] }>();
    const pushItem = (key: string, title: string, todo: TodoItem) => {
      if (!columnMap.has(key)) {
        columnMap.set(key, { key, title, description: "", items: [] });
      }
      columnMap.get(key)?.items.push(todo);
    };

    filteredTodos.forEach((todo: TodoItem) => {
      if (boardGroupBy === "client") {
        const title = todo.client || "Senza cliente";
        pushItem(`client:${title}`, title, todo);
        return;
      }
      if (boardGroupBy === "commessa") {
        const title = todo.commessa || "Senza commessa";
        pushItem(`commessa:${title}`, title, todo);
        return;
      }
      if (boardGroupBy === "businessUnit") {
        const title = todo.businessUnit || "Senza BU";
        pushItem(`bu:${title}`, title, todo);
        return;
      }
      if (boardGroupBy === "resource") {
        const member = members.find((m) => m.id === todo.resourceId);
        const title = member?.name || "Senza risorsa";
        pushItem(`resource:${title}`, title, todo);
      }
    });

    return Array.from(columnMap.values()).
      map((column) => ({
        ...column,
        items: column.items.sort((a: TodoItem, b: TodoItem) => {
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          return aDate - bDate;
        })
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [filteredTodos, today, weekEnd, boardGroupBy, members]);

  return (
    <div className="page todo-shell">
      <header className="todo-hero">
        <div className="todo-hero-content">
          <p className="eyebrow">Operativita giornaliera</p>
          <h1 className="todo-title">To-do operativi</h1>
          <p className="subtitle">
            Inserimento rapido con commesse reali da Azure, vista a colonne per priorita e gruppi per cliente o BU.
          </p>
        </div>
        <div className="todo-hero-actions">
          <div className="todo-stat">
            <span>Da fare</span>
            <strong>{todos.filter((t) => !t.completed).length}</strong>
          </div>
          <div className="todo-stat">
            <span>Scaduti</span>
            <strong>{overdueCount}</strong>
          </div>
          <div className="todo-stat">
            <span>Completati</span>
            <strong>{todos.filter((t) => t.completed).length}</strong>
          </div>
        </div>
      </header>

      {error && <div className="alert" style={{ margin: "0 48px 24px" }}>⚠️ {error}</div>}
      {jobsError && <div className="alert" style={{ margin: "0 48px 24px" }}>⚠️ {jobsError}</div>}

      <section className="todo-controls">
        <div className="todo-search">
          <input
            type="text"
            placeholder="Cerca titolo, commessa o cliente"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="todo-toggle">
          <button className={statusFilter === "open" ? "primary" : "secondary"} onClick={() => setStatusFilter("open")}>
            Aperti
          </button>
          <button className={statusFilter === "all" ? "primary" : "secondary"} onClick={() => setStatusFilter("all")}>
            Tutti
          </button>
          <button className={statusFilter === "done" ? "primary" : "secondary"} onClick={() => setStatusFilter("done")}>
            Chiusi
          </button>
        </div>
        <div className="todo-toggle">
          <button className={viewMode === "board" ? "primary" : "secondary"} onClick={() => setViewMode("board")}>
            📋 Board
          </button>
          <button className={viewMode === "list" ? "primary" : "secondary"} onClick={() => setViewMode("list")}>
            📊 Lista
          </button>
        </div>
        <div className="todo-actions">
          <button className="primary" onClick={() => setIsCreateOpen(true)}>
            ➕ Nuovo task
          </button>
          <button 
            className="secondary" 
            onClick={() => setShowCalendarModal(true)}
            title="Sottoscrivi calendario Outlook"
          >
            📅 Calendario
          </button>
        </div>
        {viewMode === "board" && (
          <div className="todo-group-select">
            <label>Board per</label>
            <select value={boardGroupBy} onChange={(e) => setBoardGroupBy(e.target.value as any)}>
              <option value="dueDate">Scadenza</option>
              <option value="status">Stato</option>
              <option value="client">Cliente</option>
              <option value="commessa">Commessa</option>
              <option value="businessUnit">BU</option>
              <option value="resource">Risorsa</option>
            </select>
          </div>
        )}
      </section>

      {viewMode === "board" ? (
        <section className="todo-board">
          {boardColumns.map((column: { key: string; title: string; description: string; items: TodoItem[] }) => (
            <div key={column.key} className="todo-column">
              <div className="todo-column-header">
                <div>
                  <h4>{column.title}</h4>
                  <span>{column.description}</span>
                </div>
                <div className="todo-count">{column.items.length}</div>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event: DragEndEvent) => handleDragEnd(event, column.key)}
              >
                <SortableContext
                  items={column.items.map((item: TodoItem) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="todo-column-body">
                    {column.items.length === 0 ? (
                      <div className="todo-empty">Nessun elemento</div>
                    ) : (
                      column.items.map((todo: TodoItem) => (
                        <SortableTodoCard
                          key={todo.id}
                          todo={todo}
                          members={members}
                          onToggle={handleToggleTodo}
                          onDelete={handleDeleteTodo}
                          onEdit={handleEditTodo}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ))}
        </section>
      ) : (
        <section className="todo-list-view">
          <div className="todo-list-controls">
            <label>Raggruppa per:</label>
            <div className="todo-group-multi">
              {["status", "client", "commessa", "businessUnit", "resource", "dueDate"].map((criterion) => (
                <label key={criterion} className="todo-checkbox-label">
                  <input
                    type="checkbox"
                    checked={groupBy.includes(criterion)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setGroupBy([...groupBy, criterion]);
                      } else {
                        setGroupBy(groupBy.filter((g: string) => g !== criterion));
                      }
                    }}
                  />
                  {criterion === "status" && "Stato"}
                  {criterion === "client" && "Cliente"}
                  {criterion === "commessa" && "Commessa"}
                  {criterion === "businessUnit" && "BU"}
                  {criterion === "resource" && "Risorsa"}
                  {criterion === "dueDate" && "Scadenza"}
                </label>
              ))}
            </div>
          </div>

          {groupedTodos.map((group: { key: string; label: string; todos: TodoItem[] }) => {
            const isCollapsed = collapsedGroups.has(group.key);
            return (
              <div key={group.key} className="todo-list-group">
                <div className="todo-list-group-header" onClick={() => toggleGroup(group.key)}>
                  <div className="todo-list-group-title">
                    <span className="collapse-icon">{isCollapsed ? "▶" : "▼"}</span>
                    <h4>{group.label}</h4>
                    <span className="todo-count-badge">{group.todos.length}</span>
                  </div>
                </div>
                {!isCollapsed && (
                  <div className="todo-list-group-content">
                    <div className="todo-list-table-header">
                      <div className="todo-list-col">Attività</div>
                      <div className="todo-list-col">Commessa</div>
                      <div className="todo-list-col">Cliente</div>
                      <div className="todo-list-col">BU</div>
                      <div className="todo-list-col">Risorsa</div>
                      <div className="todo-list-col">Scadenza</div>
                      <div className="todo-list-col">Stato</div>
                      <div className="todo-list-col">Azioni</div>
                    </div>
                    {group.todos.map((todo: TodoItem) => {
                      const member = members.find((m) => m.id === todo.resourceId);
                      return (
                        <div
                          key={todo.id}
                          className={`todo-list-row ${todo.completed ? "is-done" : ""}`}
                          onClick={() => handleEditTodo(todo)}
                        >
                          <div className="todo-list-col">
                            <div className="todo-list-title">
                              <strong>{todo.title}</strong>
                              {todo.description && <small>{todo.description}</small>}
                            </div>
                          </div>
                          <div className="todo-list-col">{todo.commessa || "-"}</div>
                          <div className="todo-list-col">{todo.client || "-"}</div>
                          <div className="todo-list-col">
                            {todo.businessUnit ? <span className="todo-tag-bu">📊 {todo.businessUnit}</span> : "-"}
                          </div>
                          <div className="todo-list-col">
                            {member ? (
                              <span 
                                className="todo-tag-resource-dynamic"
                                style={{
                                  backgroundColor: getResourceColor(member.name).bg,
                                  color: getResourceColor(member.name).text,
                                }}
                              >
                                👤 {member.name}
                              </span>
                            ) : (
                              "-"
                            )}
                          </div>
                          <div className="todo-list-col">
                            {todo.dueDate ? new Date(todo.dueDate).toLocaleDateString("it-IT") : "-"}
                          </div>
                          <div className="todo-list-col">
                            <input
                              type="checkbox"
                              checked={todo.completed}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleToggleTodo(todo.id, todo.completed);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="todo-list-col">
                            <button
                              className="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTodo(todo.id);
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {editingTodo && (
        <TodoEditModal
          todo={editingTodo}
          jobs={jobs}
          members={members}
          onClose={() => setEditingTodo(null)}
          onSave={handleSaveEdit}
        />
      )}      {showCalendarModal && (
        <div className="modal-overlay" onClick={() => setShowCalendarModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📅 Sottoscrivi Calendario Outlook</h3>
              <button className="ghost" onClick={() => setShowCalendarModal(false)}>✕</button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <p><strong>Come funziona:</strong></p>
              <ol style={{ lineHeight: '1.8', paddingLeft: '20px' }}>
                <li><strong>TASK:</strong> Progetti multi-giorno (all-day)</li>
                <li><strong>TO-DO:</strong> Attività singole alle ore 10:00 con icona ✅</li>
                <li>Copia il link del calendario della tua risorsa</li>
                <li>Apri Outlook → "Aggiungi calendario" → "Da Internet"</li>
                <li>Incolla il link - sincronizzazione automatica ogni 15-30 minuti</li>
              </ol>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                Seleziona risorsa:
              </label>
              {members.map((member) => {
                const calendarUrl = `https://teadzgcurjjdbuoohakr.supabase.co/functions/v1/calendar/${member.id}`;
                const isCopied = copiedLink === member.id;
                
                return (
                  <div 
                    key={member.id}
                    style={{
                      padding: '12px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      marginBottom: '8px',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ fontWeight: '600', color: '#0f172a' }}>
                      {member.name}
                    </div>
                    
                    <button
                      className="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(calendarUrl);
                          setCopiedLink(member.id);
                          setTimeout(() => setCopiedLink(null), 2000);
                        } catch (err) {
                          alert('Errore nella copia del link');
                        }
                      }}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {isCopied ? '✓ Copiato!' : '📋 Copia link'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{
              padding: '12px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#1e40af'
            }}>
              <strong>💡 Tip:</strong> Per aggiornamenti più frequenti (ogni 15 min), 
              usa Outlook Web o l'app mobile e abilita "Sincronizzazione automatica calendari Internet"
            </div>
          </div>
        </div>
      )}



      {isCreateOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nuovo task</h3>
              <button className="ghost" onClick={() => setIsCreateOpen(false)}>✕</button>
            </div>
            <div className="panel-header" style={{ marginBottom: "16px" }}>
              <div>
                <h3>Inserimento rapido</h3>
                <p className="subtitle">Seleziona una commessa reale, i campi cliente e BU si compilano da soli.</p>
              </div>
              <div className="todo-panel-meta">
                {jobsLoading ? "Carico commesse..." : `${jobs.length} commesse disponibili`}
              </div>
            </div>

            <form onSubmit={handleCreateTodo} className="todo-form">
              <div className="todo-form-row">
                <div className="todo-field">
                  <label>Attivita</label>
                  <input
                    type="text"
                    placeholder="Es. Follow-up cliente, report, verifica dati"
                    value={newTodo.title || ""}
                    onChange={(e) => setNewTodo((prev: Partial<TodoItem>) => ({ ...prev, title: e.target.value }))}
                    required
                  />
                </div>
                <div className="todo-field">
                  <label>Commessa</label>
                  <select
                    value={selectedJobNo}
                    onChange={(e) => setSelectedJobNo(e.target.value)}
                    disabled={jobsLoading}
                  >
                    <option value="">Seleziona una commessa</option>
                    {filteredJobs.map((job: JobOption) => (
                      <option key={job.jobNo} value={job.jobNo}>
                        {job.jobNo} · {job.planDescription || job.detailDescription || "Senza descrizione"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="todo-form-row">
                <div className="todo-field">
                  <label>Cliente</label>
                  <select
                    value={clientFilter}
                    onChange={(e) => {
                      setClientFilter(e.target.value);
                      setNewTodo((prev: Partial<TodoItem>) => ({ ...prev, client: e.target.value || undefined }));
                    }}
                    disabled={jobsLoading}
                  >
                    <option value="">Tutti i clienti</option>
                    {clients.map((client: string) => (
                      <option key={client} value={client}>
                        {client}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="todo-field">
                  <label>Business Unit</label>
                  <select
                    value={buFilter}
                    onChange={(e) => {
                      setBuFilter(e.target.value);
                      setNewTodo((prev: Partial<TodoItem>) => ({ ...prev, businessUnit: e.target.value || undefined }));
                    }}
                    disabled={jobsLoading}
                  >
                    <option value="">Tutte le BU</option>
                    {businessUnits.map((bu: string) => (
                      <option key={bu} value={bu}>
                        {bu}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="todo-field">
                  <label>Cerca commessa</label>
                  <input
                    type="text"
                    placeholder="Filtra per codice o descrizione"
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="todo-form-row">
                <div className="todo-field">
                  <label>Risorsa</label>
                  <select
                    value={newTodo.resourceId || ""}
                    onChange={(e) => setNewTodo((prev: Partial<TodoItem>) => ({ ...prev, resourceId: e.target.value || undefined }))}
                  >
                    <option value="">Seleziona risorsa</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="todo-field">
                  <label>Scadenza</label>
                  <input
                    type="date"
                    value={newTodo.dueDate || ""}
                    onChange={(e) => setNewTodo((prev: Partial<TodoItem>) => ({ ...prev, dueDate: e.target.value || undefined }))}
                  />
                </div>
                <div className="todo-field todo-field-actions">
                  <button type="button" className="ghost" onClick={() => setShowDetails((prev: boolean) => !prev)}>
                    {showDetails ? "- Nascondi dettagli" : "+ Dettagli"}
                  </button>
                  <button type="submit" className="primary">
                    ➕ Aggiungi to-do
                  </button>
                </div>
              </div>

              {showDetails && (
                <div className="todo-form-row">
                  <div className="todo-field">
                    <label>Descrizione</label>
                    <textarea
                      rows={3}
                      placeholder="Nota rapida, dettagli o prossimi step"
                      value={newTodo.description || ""}
                      onChange={(e) => setNewTodo((prev: Partial<TodoItem>) => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {selectedJob && (
                <div className="todo-context">
                  <span className="todo-pill">{selectedJob.client || "Cliente non specificato"}</span>
                  <span className="todo-pill">BU: {selectedJob.businessUnit || "N/A"}</span>
                  <span className="todo-pill">{selectedJob.planDescription || selectedJob.detailDescription || "Senza descrizione"}</span>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
