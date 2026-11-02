import { useMemo, useState, useRef } from "react";
import { createTask, updateTask, deleteTask } from "./api";
import type { Member, Task, TaskStatus } from "./types";
import TaskDetailModal from "./TaskDetailModal";
import TaskCreateModal from "./TaskCreateModal";
import TaskTeamModal from "./TaskTeamModal";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface Props {
  tasks: Task[];
  members: Member[];
  onTasksUpdate: (tasks: Task[]) => void;
  onMembersUpdate: (members: Member[]) => void;
  onSwitchPage: (page: "database" | "stats" | "jobs") => void;
}

const statusLabels: Record<TaskStatus, string> = {
  todo: "Da fare",
  "in-progress": "In corso",
  done: "Completato"
};

const statusIcons: Record<TaskStatus, string> = {
  todo: "🔴",
  "in-progress": "🟡",
  done: "🟢"
};

const weekDays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];


function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(dateKey);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function diffDays(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function getMonthRange(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0)
  };
}

const pastelleFluorescentColors = [
  "#FFFF99", // Giallo
  "#FFD699", // Arancione
  "#FF99CC", // Rosa
  "#FF99FF", // Magenta
  "#CC99FF", // Viola
  "#9999FF", // Blu
  "#99CCFF", // Azzurro
  "#99FFFF", // Ciano
  "#99FFCC", // Verde acqua
  "#99FF99", // Verde
  "#CCFF99"  // Giallo-verde
];

function getAssigneeColor(assigneeId?: string) {
  if (!assigneeId) {
    return "#e2e8f0";
  }
  // Usa una funzione di hash più robusta
  let hash = 0;
  for (let i = 0; i < assigneeId.length; i++) {
    const char = assigneeId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Converti a 32-bit integer
  }
  // Assicura un valore positivo
  const absHash = Math.abs(hash);
  const colorIndex = absHash % pastelleFluorescentColors.length;
  console.log(`🎨 getAssigneeColor(${assigneeId}) = index ${colorIndex} color ${pastelleFluorescentColors[colorIndex]}`);
  return pastelleFluorescentColors[colorIndex];
}

function getWorkingDaysInMonth(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  const holidays = getItalianHolidays(year);
  
  let workingDays = 0;
  const lastDay = new Date(year, month + 1, 0).getDate();
  
  for (let day = 1; day <= lastDay; day++) {
    const currentDate = new Date(year, month, day);
    const dayOfWeek = currentDate.getDay();
    const dateKey = formatDate(currentDate);
    
    // Escludi sabato (6) e domenica (0), e festività
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.has(dateKey)) {
      workingDays++;
    }
  }
  
  return workingDays;
}

// Festività italiane fisse e variabili più comuni
function getItalianHolidays(year: number): Set<string> {
  const holidays = new Set<string>();
  
  // Festività fisse
  holidays.add(`${year}-01-01`); // Capodanno
  holidays.add(`${year}-01-06`); // Epifania
  holidays.add(`${year}-04-25`); // Liberazione
  holidays.add(`${year}-05-01`); // Festa del Lavoro
  holidays.add(`${year}-06-02`); // Festa della Repubblica
  holidays.add(`${year}-08-15`); // Ferragosto
  holidays.add(`${year}-11-01`); // Ognissanti
  holidays.add(`${year}-12-08`); // Immacolata
  holidays.add(`${year}-12-25`); // Natale
  holidays.add(`${year}-12-26`); // Santo Stefano
  
  // Pasqua e Lunedì dell'Angelo (calcolo approssimativo)
  // Per semplicità, qui usiamo date fisse per 2026
  if (year === 2026) {
    holidays.add("2026-04-05"); // Pasqua
    holidays.add("2026-04-06"); // Lunedì dell'Angelo
  }
  
  return holidays;
}

function getHoursPerDay(task: Task): number {
  if (!task.startDate || !task.endDate) {
    return task.hours;
  }
  const startDate = new Date(task.startDate);
  const endDate = new Date(task.endDate);
  const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (daysDiff > 0) {
    return Math.round((task.hours / daysDiff) * 100) / 100;
  }
  return task.hours;
}

function isLeaveTask(task: Task): boolean {
  return String(task.commessa || "").trim().toUpperCase() === "FERIE";
}

function getTaskHoursInRange(task: Task, rangeStart: Date, rangeEnd: Date): number {
  if (!task.startDate || !task.endDate) {
    return 0;
  }

  const taskStart = new Date(task.startDate);
  const taskEnd = new Date(task.endDate);
  if (taskEnd < rangeStart || taskStart > rangeEnd) {
    return 0;
  }

  const overlapStart = new Date(Math.max(taskStart.getTime(), rangeStart.getTime()));
  const overlapEnd = new Date(Math.min(taskEnd.getTime(), rangeEnd.getTime()));

  const totalDays = Math.floor((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const overlapDays = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (totalDays <= 0 || overlapDays <= 0) {
    return 0;
  }

  return (task.hours * overlapDays) / totalDays;
}

export default function TaskManagePage({ tasks, members, onTasksUpdate, onMembersUpdate, onSwitchPage }: Props) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarMemberFilter, setCalendarMemberFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<"bi" | "crm" | "all">("bi");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedTaskEdge, setDraggedTaskEdge] = useState<"start" | "end" | null>(null);
  const [draggedTaskOrigin, setDraggedTaskOrigin] = useState<"sidebar" | "calendar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showExportStats, setShowExportStats] = useState(false);
  const [leaveDraft, setLeaveDraft] = useState(() => {
    const today = formatDate(new Date());
    return {
      memberId: "",
      startDate: today,
      endDate: today,
      quantity: 1,
      unit: "days" as "days" | "hours",
      note: ""
    };
  });

  const workingDays = useMemo(() => getWorkingDaysInMonth(currentMonth), [currentMonth]);
  const availableHours = workingDays * 8;
  const hourlyRate = 75; // €/ora

  const unscheduledTasks = useMemo(
    () => tasks.filter((t) => !t.startDate || !t.endDate),
    [tasks]
  );

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  const visibleMembers = useMemo(
    () => groupFilter === "all" ? members : members.filter((m) => m.group === groupFilter),
    [members, groupFilter]
  );

  const visibleMemberIds = useMemo(
    () => new Set(visibleMembers.map((m) => m.id)),
    [visibleMembers]
  );

  const memberStats = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    return visibleMembers.map((member) => {
      const memberTasks = tasks.filter((t) => {
        if (t.assigneeId !== member.id) return false;
        if (!t.startDate || !t.endDate) return false;
        
        const taskStart = new Date(t.startDate);
        const taskEnd = new Date(t.endDate);
        
        return taskStart <= monthEnd && taskEnd >= monthStart;
      });

      const assignedHours = memberTasks.reduce((sum, t) => sum + getTaskHoursInRange(t, monthStart, monthEnd), 0);
      const leaveHours = memberTasks
        .filter((t) => isLeaveTask(t))
        .reduce((sum, t) => sum + getTaskHoursInRange(t, monthStart, monthEnd), 0);
      const workHours = Math.max(0, assignedHours - leaveHours);
      const effectiveAvailableHours = Math.max(0, availableHours - leaveHours);
      const percentage = effectiveAvailableHours > 0 ? (workHours / effectiveAvailableHours) * 100 : 0;
      const economicValue = workHours * hourlyRate;
      const remainingHours = effectiveAvailableHours - workHours;

      return {
        member,
        availableHours,
        assignedHours,
        leaveHours,
        workHours,
        effectiveAvailableHours,
        percentage,
        remainingHours,
        economicValue
      };
    });
  }, [tasks, visibleMembers, availableHours, currentMonth]);

  const memberStatsMap = useMemo(
    () => new Map(memberStats.map((stat) => [stat.member.id, stat])),
    [memberStats]
  );

  const totals = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    const totalAvailableHours = availableHours * visibleMembers.length;
    const totalAssignedHours = memberStats.reduce((sum, stat) => sum + stat.assignedHours, 0);
    const totalLeaveHours = memberStats.reduce((sum, stat) => sum + stat.leaveHours, 0);
    const totalWorkHours = memberStats.reduce((sum, stat) => sum + stat.workHours, 0);
    const totalEffectiveAvailableHours = Math.max(0, totalAvailableHours - totalLeaveHours);
    const totalEconomicValue = memberStats.reduce((sum, stat) => sum + stat.economicValue, 0);
    const totalPercentage = totalEffectiveAvailableHours > 0 ? (totalWorkHours / totalEffectiveAvailableHours) * 100 : 0;
    
    let totalMonthlyTarget = 0;
    memberStats.forEach((stat) => {
      if (stat.member.annualTarget) {
        const getTotalWorkingHoursInYear = () => {
          let totalHours = 0;
          for (let m = 0; m < 12; m++) {
            const wd = getWorkingDaysInMonth(new Date(year, m, 1));
            totalHours += wd * 8;
          }
          return totalHours;
        };
        
        const totalYearlyHours = getTotalWorkingHoursInYear();
        const monthlyHours = availableHours;
        const monthlyTarget = (stat.member.annualTarget / totalYearlyHours) * monthlyHours;
        totalMonthlyTarget += monthlyTarget;
      }
    });

    return {
      totalAvailableHours,
      totalAssignedHours,
      totalLeaveHours,
      totalWorkHours,
      totalEffectiveAvailableHours,
      totalEconomicValue,
      totalPercentage,
      totalMonthlyTarget
    };
  }, [memberStats, availableHours, visibleMembers.length, currentMonth]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const offset = (firstDay.getDay() + 6) % 7;
    const totalCells = Math.ceil((offset + lastDay.getDate()) / 7) * 7;

    return Array.from({ length: totalCells }, (_, index) => {
      const dayNumber = index - offset + 1;
      const date = new Date(year, month, dayNumber);
      const inMonth = date.getMonth() === month;
      return {
        date,
        key: formatDate(date),
        inMonth
      };
    });
  }, [currentMonth]);

  const tasksByDate = useMemo(() => {
    const tasksOnDates: Record<string, Task[]> = {};
    
    for (const task of tasks) {
      // Solo task con date definite vengono mostrati nel calendario
      if (!task.startDate || !task.endDate) continue;
      
      const startDate = new Date(task.startDate);
      const endDate = new Date(task.endDate);
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dateKey = formatDate(currentDate);
        if (!tasksOnDates[dateKey]) {
          tasksOnDates[dateKey] = [];
        }
        tasksOnDates[dateKey].push(task);
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    
    return tasksOnDates;
  }, [tasks]);

  const monthLabel = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric"
  }).format(currentMonth);

  const calendarFilterMember = calendarMemberFilter === "all"
    ? null
    : visibleMembers.find((member) => member.id === calendarMemberFilter) ?? null;

  const calendarFilterLabel = calendarFilterMember?.name ?? "Tutte";

  const handleCycleCalendarFilter = () => {
    const options = ["all", ...visibleMembers.map((member) => member.id)];
    const currentIndex = options.indexOf(calendarMemberFilter);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % options.length : 0;
    setCalendarMemberFilter(options[nextIndex]);
  };

  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
    setDraggedTaskEdge(null);
    setDraggedTaskOrigin("sidebar");
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDropOnMember = async (event: React.DragEvent, memberId: string) => {
    event.preventDefault();
    if (!draggedTaskId) return;

    setError(null);
    try {
      const updated = await updateTask(draggedTaskId, { assigneeId: memberId });
      onTasksUpdate(tasks.map((t) => (t.id === draggedTaskId ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore assegnazione");
    } finally {
      setDraggedTaskId(null);
    }
  };

  const handleDropOnDate = async (event: React.DragEvent, dateKey: string) => {
    event.preventDefault();
    if (!draggedTaskId) return;

    setError(null);
    try {
      const task = tasks.find((t) => t.id === draggedTaskId);
      if (!task) return;

      let updateData: Partial<Task> = {};

      // Se è stato trascinato un edge (extend), aggiorna start/end date
      if (draggedTaskEdge === "start") {
        updateData.startDate = dateKey;
      } else if (draggedTaskEdge === "end") {
        updateData.endDate = dateKey;
      } else if (draggedTaskOrigin === "calendar" && task.startDate && task.endDate) {
        // Drag di un task già schedulato: sposta mantenendo la durata
        const duration = diffDays(task.startDate, task.endDate);
        updateData.startDate = dateKey;
        updateData.endDate = addDays(dateKey, duration);
      } else {
        // Drag dal sidebar (o task senza date): imposta data singola
        updateData.startDate = dateKey;
        updateData.endDate = dateKey;
      }

      // NON dividiamo le ore nel database - manteniamo il totale originale
      // Le ore divise per giorno vengono calcolate solo nel rendering

      // Mantiene l'assigneeId originale
      if (!updateData.assigneeId && task.assigneeId) {
        updateData.assigneeId = task.assigneeId;
      }

      const updated = await updateTask(draggedTaskId, updateData);
      onTasksUpdate(tasks.map((t) => (t.id === draggedTaskId ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore assegnazione data");
    } finally {
      setDraggedTaskId(null);
      setDraggedTaskEdge(null);
      setDraggedTaskOrigin(null);
    }
  };

  const handleTaskDragStart = (taskId: string, edge?: "start" | "end") => {
    setDraggedTaskId(taskId);
    setDraggedTaskEdge(edge ?? null);
    setDraggedTaskOrigin("calendar");
  };

  const handleDeleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find((t) => t.id === taskId);
    const confirmMessage = taskToDelete && isLeaveTask(taskToDelete)
      ? "Vuoi eliminare questa voce ferie?"
      : "Vuoi eliminare questo task?";

    if (!window.confirm(confirmMessage)) return;

    setError(null);
    try {
      await deleteTask(taskId);
      onTasksUpdate(tasks.filter((t) => t.id !== taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione");
    }
  };

  const handleTaskSave = async (updated: Task) => {
    setError(null);
    try {
      const result = await updateTask(updated.id, updated);
      onTasksUpdate(tasks.map((t) => (t.id === updated.id ? result : t)));
      setEditingTask(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio");
    }
  };

  const handleDeleteFromModal = async (task: Task) => {
    if (!window.confirm("Vuoi eliminare questa voce ferie?")) {
      return;
    }

    setError(null);
    try {
      await deleteTask(task.id);
      onTasksUpdate(tasks.filter((t) => t.id !== task.id));
      setEditingTask(null);
      setNotice("Ferie eliminate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione");
    }
  };

  const handleCreateLeave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!leaveDraft.memberId) {
      setError("Seleziona una risorsa per registrare le ferie.");
      return;
    }

    if (!leaveDraft.startDate || !leaveDraft.endDate) {
      setError("Imposta il periodo ferie (dal/al).");
      return;
    }

    if (leaveDraft.quantity <= 0) {
      setError("Inserisci una quantita maggiore di zero.");
      return;
    }

    const start = new Date(leaveDraft.startDate);
    const end = new Date(leaveDraft.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Date ferie non valide.");
      return;
    }

    const normalizedStart = start <= end ? leaveDraft.startDate : leaveDraft.endDate;
    const normalizedEnd = start <= end ? leaveDraft.endDate : leaveDraft.startDate;
    const totalHours = leaveDraft.unit === "days"
      ? leaveDraft.quantity * 8
      : leaveDraft.quantity;

    const selectedMember = members.find((m) => m.id === leaveDraft.memberId);
    const leaveDescription = leaveDraft.note.trim()
      ? `Ferie - ${leaveDraft.note.trim()}`
      : "Ferie";

    try {
      const created = await createTask({
        commessa: "FERIE",
        description: leaveDescription,
        client: selectedMember?.name || "Team",
        hours: Number(totalHours.toFixed(2)),
        status: "done",
        assigneeId: leaveDraft.memberId,
        startDate: normalizedStart,
        endDate: normalizedEnd,
        teamId: "leave"
      });

      onTasksUpdate([created, ...tasks]);
      setNotice("Ferie registrate e incluse nel carico risorsa.");
      setLeaveDraft((prev) => ({
        ...prev,
        quantity: 1,
        unit: "days",
        note: ""
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore registrazione ferie");
    }
  };

  const calendarRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  const exportToPDF = async () => {
    if (!calendarRef.current) {
      setError("Riferimento al calendario non trovato");
      return;
    }
    
    try {
      const element = calendarRef.current;
      
      // Cattura il canvas del calendario
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false
      });

      // Crea PDF in formato paesaggio (landscape)
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Calcola le dimensioni mantenendo l'aspect ratio
      const imgWidth = pdfWidth - 20; // 10mm di margine per lato
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // Se l'altezza supera la pagina, ridimensiona
      let finalHeight = imgHeight;
      let currentHeight = imgHeight;
      let pageCount = 1;
      
      if (finalHeight > pdfHeight - 20) {
        pageCount = Math.ceil(finalHeight / (pdfHeight - 20));
      }

      // Aggiungi l'intestazione
      const now = new Date();
      const dateStr = now.toLocaleDateString('it-IT', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      pdf.setFontSize(16);
      pdf.text("Gestione Task - Calendario Mensile", 10, 10);
      pdf.setFontSize(10);
      pdf.text(`Esportato il: ${dateStr}`, 10, 16);

      // Aggiungi l'immagine del calendario
      const imgData = canvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", 10, 20, imgWidth, imgHeight);

      // Se hai più pagine, aggiungile
      if (pageCount > 1) {
        for (let i = 1; i < pageCount; i++) {
          pdf.addPage();
          const yOffset = -(i * (pdfHeight - 20));
          pdf.addImage(imgData, "PNG", 10, 20 + yOffset, imgWidth, imgHeight);
        }
      }

      // Aggiungi pagina con le statistiche - Cattura il div con le statistiche formattate
      if (statsRef.current) {
        try {
          pdf.addPage();
          
          // Rendi temporaneamente visibile il div per la cattura
          const statsElement = statsRef.current;
          const originalDisplay = statsElement.style.display;
          statsElement.style.display = "block";
          
          const statsCanvas = await html2canvas(statsElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            logging: false
          });

          // Nascondi nuovamente il div
          statsElement.style.display = originalDisplay;

          const statsImgWidth = pdfWidth - 20;
          const statsImgHeight = (statsCanvas.height * statsImgWidth) / statsCanvas.width;
          const statsImgData = statsCanvas.toDataURL("image/png");
          
          // Aggiungi intestazione statistiche
          pdf.setFontSize(16);
          pdf.text("Statistiche Dettagliate", 10, 10);
          pdf.setFontSize(10);
          const monthLabel = new Intl.DateTimeFormat("it-IT", {
            month: "long",
            year: "numeric"
          }).format(currentMonth);
          pdf.text(`Mese: ${monthLabel}`, 10, 16);
          
          // Aggiungi le statistiche catturate
          pdf.addImage(statsImgData, "PNG", 10, 20, statsImgWidth, statsImgHeight);

          // Se le statistiche occupano più pagine
          let statsPageCount = 1;
          if (statsImgHeight > pdfHeight - 20) {
            statsPageCount = Math.ceil(statsImgHeight / (pdfHeight - 20));
            for (let i = 1; i < statsPageCount; i++) {
              pdf.addPage();
              const yOffset = -(i * (pdfHeight - 20));
              pdf.addImage(statsImgData, "PNG", 10, 20 + yOffset, statsImgWidth, statsImgHeight);
            }
          }
        } catch (statsErr) {
          console.error("Errore cattura statistiche:", statsErr);
          // Continua comunque con il PDF del calendario
        }
      }

      // Scarica il PDF
      pdf.save(`task-report-${now.toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error("Errore esportazione PDF:", err);
      const errorMessage = err instanceof Error ? err.message : "Errore sconosciuto";
      setError(`Errore durante l'esportazione del PDF: ${errorMessage}`);
    }
  };

  const buildResourceLink = (memberId: string) => {
    const range = getMonthRange(currentMonth);
    const url = new URL(window.location.href);
    url.searchParams.set("view", "resource");
    url.searchParams.set("memberId", memberId);
    url.searchParams.set("start", formatDate(range.start));
    url.searchParams.set("end", formatDate(range.end));
    url.searchParams.set("public", "1");
    return url.toString();
  };

  const handleCopyResourceLink = async (memberId: string) => {
    try {
      await navigator.clipboard.writeText(buildResourceLink(memberId));
      setNotice("Link vista risorsa copiato negli appunti");
      setTimeout(() => setNotice(null), 2500);
    } catch (err) {
      setError("Copia link non disponibile");
    }
  };

  const handleOpenResourceView = (memberId: string) => {
    const link = buildResourceLink(memberId);
    window.open(link, "_blank", "noopener");
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Reparto operativo</p>
          <h1>Gestione task con calendario</h1>
          <p className="subtitle">Assegna task dai team member e visualizza nel calendario.</p>
          <p className="subtitle" style={{ marginTop: "4px" }}>
            Ferie pianificate nel mese: <strong>{totals.totalLeaveHours.toFixed(1)}h</strong>
          </p>
          <p className="subtitle" style={{ marginTop: "4px" }}>
            Occupazione su disponibilita netta: ore operative / (ore disponibili - ferie)
          </p>
        </div>
        <div className="stats">
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Occupazione</span>
              <span className="kpi-value">{Math.round(totals.totalPercentage)}%</span>
            </div>
            <div className="stat-progress-bar-large">
              <div
                className={`stat-progress-fill ${totals.totalPercentage > 100 ? "overload" : totals.totalPercentage > 80 ? "high" : "normal"}`}
                style={{ width: `${Math.min(totals.totalPercentage, 100)}%` }}
              />
            </div>
            <div className="kpi-footer">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Valore / Target</span>
              <span className="kpi-value">€{totals.totalEconomicValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="stat-progress-bar-large">
              <div
                className={`stat-progress-fill ${totals.totalMonthlyTarget > 0 ? (totals.totalEconomicValue / totals.totalMonthlyTarget > 1 ? "overload" : totals.totalEconomicValue / totals.totalMonthlyTarget > 0.8 ? "high" : "normal") : "normal"}`}
                style={{ width: `${totals.totalMonthlyTarget > 0 ? Math.min((totals.totalEconomicValue / totals.totalMonthlyTarget) * 100, 100) : 0}%` }}
              />
            </div>
            <div className="kpi-footer">
              <span>€0</span>
              <span>€{totals.totalMonthlyTarget.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>
        <div className="hero-buttons">
          <button className="primary" onClick={() => setShowCreateModal(true)}>
            Crea nuovo task
          </button>
          <button className="secondary" onClick={() => setShowTeamModal(true)}>
            Gestione team
          </button>
          <button className="secondary" onClick={exportToPDF}>
            📄 Esporta in PDF
          </button>
          <button className="secondary" onClick={() => onSwitchPage("stats")}>
            Statistiche
          </button>
          <button className="secondary" onClick={() => onSwitchPage("jobs")}>
            Commesse aperte
          </button>
          <button className="secondary" onClick={() => onSwitchPage("database")}>
            Visualizza database
          </button>
        </div>
      </header>

      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <main className="layout-manage">
        <section className="panel sidebar">
          <h2>Task da schedulare</h2>
          <p className="subtitle-small">Trascina sul calendario o su un membro</p>

          {unscheduledTasks.length === 0 ? (
            <div className="empty">Nessun task da schedulare</div>
          ) : (
            <div className="task-list">
              {unscheduledTasks.map((task) => (
                <div
                  key={task.id}
                  className="task-item"
                  draggable
                  onDragStart={() => handleDragStart(task.id)}
                >
                  <div className="task-item-header">
                    <strong>{task.client}</strong>
                    <span className="hours">{task.hours}h</span>
                  </div>
                  <div className="task-item-meta">
                    <span className="badge">{task.commessa}</span>
                    {task.assigneeId && (
                      <span className="badge secondary">
                        {memberMap.get(task.assigneeId)?.name ?? "Assegnato"}
                      </span>
                    )}
                  </div>
                  <p className="task-item-desc">{task.description}</p>
                  <button
                    className="danger-small"
                    onClick={() => handleDeleteTask(task.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <h2>Ferie / assenze</h2>
          <form className="leave-form" onSubmit={handleCreateLeave}>
            <label>
              Risorsa
              <select
                required
                value={leaveDraft.memberId}
                onChange={(event) =>
                  setLeaveDraft((prev) => ({ ...prev, memberId: event.target.value }))
                }
              >
                <option value="">Seleziona risorsa</option>
                {visibleMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="leave-form-grid">
              <label>
                Dal
                <input
                  type="date"
                  required
                  value={leaveDraft.startDate}
                  onChange={(event) =>
                    setLeaveDraft((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                />
              </label>
              <label>
                Al
                <input
                  type="date"
                  required
                  value={leaveDraft.endDate}
                  onChange={(event) =>
                    setLeaveDraft((prev) => ({ ...prev, endDate: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="leave-form-grid">
              <label>
                Unita
                <select
                  value={leaveDraft.unit}
                  onChange={(event) =>
                    setLeaveDraft((prev) => ({
                      ...prev,
                      unit: event.target.value as "days" | "hours"
                    }))
                  }
                >
                  <option value="days">Giornate</option>
                  <option value="hours">Ore</option>
                </select>
              </label>
              <label>
                Quantita
                <input
                  type="number"
                  required
                  min="0.5"
                  step="0.5"
                  value={leaveDraft.quantity}
                  onChange={(event) =>
                    setLeaveDraft((prev) => ({
                      ...prev,
                      quantity: Number(event.target.value) || 0
                    }))
                  }
                />
              </label>
            </div>

            <label>
              Nota (opzionale)
              <input
                value={leaveDraft.note}
                onChange={(event) =>
                  setLeaveDraft((prev) => ({ ...prev, note: event.target.value }))
                }
                placeholder="Es. ferie estive"
              />
            </label>

            <div className="leave-form-hint">
              Impegno calcolato: {leaveDraft.unit === "days"
                ? `${(leaveDraft.quantity * 8).toFixed(1)}h`
                : `${leaveDraft.quantity.toFixed(1)}h`}
            </div>

            <button type="submit" className="secondary-small">Registra ferie</button>
          </form>

          <h2>Membri team</h2>
          <div className="members-list">
            {visibleMembers.map((member) => {
              const year = currentMonth.getFullYear();
              const memberStat = memberStatsMap.get(member.id);
              const totalHours = memberStat?.assignedHours ?? 0;
              const leaveHours = memberStat?.leaveHours ?? 0;
              const workHours = memberStat?.workHours ?? 0;
              const effectiveAvailableHours = memberStat?.effectiveAvailableHours ?? availableHours;
              const percentage = memberStat?.percentage ?? 0;
              const remainingHours = memberStat?.remainingHours ?? availableHours;
              const economicValue = memberStat?.economicValue ?? 0;
              
              // Calcola il target mensile pesato
              let monthlyTarget = 0;
              if (member.annualTarget) {
                const getTotalWorkingHoursInYear = () => {
                  let totalHours = 0;
                  for (let m = 0; m < 12; m++) {
                    const wd = getWorkingDaysInMonth(new Date(year, m, 1));
                    totalHours += wd * 8;
                  }
                  return totalHours;
                };
                
                const totalYearlyHours = getTotalWorkingHoursInYear();
                monthlyTarget = (member.annualTarget / totalYearlyHours) * availableHours;
              }
              
              return (
                <div
                  key={member.id}
                  className="member-card"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnMember(e, member.id)}
                >
                  <div className="member-card-header">
                    <div className="member-info">
                      <strong>{member.name}</strong>
                      <span className="role">{member.role}</span>
                    </div>
                    <span className={`member-badge ${percentage > 100 ? "overload" : percentage > 80 ? "high" : "normal"}`}>
                      {Math.round(percentage)}%
                    </span>
                  </div>
                  
                  <div className="member-progress-bar">
                    <div
                      className={`member-progress-fill ${percentage > 100 ? "overload" : percentage > 80 ? "high" : "normal"}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  
                  <div className="member-stats">
                    <div className="member-stat-row">
                      <span className="member-stat-label">Ore operative / disp. netta</span>
                      <span className="member-stat-value">{workHours.toFixed(1)}h / {effectiveAvailableHours.toFixed(1)}h</span>
                    </div>
                    <div className="member-stat-row">
                      <span className="member-stat-label">Ferie pianificate</span>
                      <span className="member-stat-value">{leaveHours.toFixed(1)}h</span>
                    </div>
                    <div className="member-stat-row">
                      <span className="member-stat-label">Ore assegnate totali</span>
                      <span className="member-stat-value">{totalHours.toFixed(1)}h</span>
                    </div>
                    <div className="member-stat-row">
                      <span className="member-stat-label">Valore economico:</span>
                      <span className="member-stat-value">€{economicValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
                    </div>
                    {monthlyTarget > 0 && (
                      <>
                        <div className="member-stat-row">
                          <span className="member-stat-label">Valore/Target:</span>
                        </div>
                        <div className="member-progress-bar-small">
                          <div
                            className={`member-progress-fill-small ${economicValue / monthlyTarget > 1 ? "overload" : economicValue / monthlyTarget > 0.8 ? "high" : "normal"}`}
                            style={{ width: `${Math.min((economicValue / monthlyTarget) * 100, 100)}%` }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                          <span>€{economicValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
                          <span>€{monthlyTarget.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
                        </div>
                      </>
                    )}
                    <div className="member-stat-row">
                      <span className="member-stat-label">
                        {remainingHours >= 0 ? "Rimanenti" : "Eccedenti"}
                      </span>
                      <span className={`member-stat-value ${remainingHours < 0 ? "negative" : ""}`}>
                        {Math.abs(remainingHours).toFixed(1)}h
                      </span>
                    </div>
                  </div>
                  <div className="member-actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => handleOpenResourceView(member.id)}
                    >
                      Vista risorsa
                    </button>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => handleCopyResourceLink(member.id)}
                    >
                      Copia link
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel calendar-panel">
          <div className="calendar-header">
            <div className="calendar-controls">
              <button
                className="ghost"
                type="button"
                onClick={() =>
                  setCurrentMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                  )
                }
              >
                ◀
              </button>
              <span className="calendar-title">{monthLabel}</span>
              <button
                className="ghost"
                type="button"
                onClick={() =>
                  setCurrentMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                  )
                }
              >
                ▶
              </button>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={handleCycleCalendarFilter}
              title="Clicca per cambiare filtro risorsa"
            >
              Filtro risorsa: {calendarFilterLabel}
            </button>
            <select
              value={groupFilter}
              onChange={(e) => { setGroupFilter(e.target.value as "bi" | "crm" | "all"); setCalendarMemberFilter("all"); }}
              style={{ padding: "6px 10px", fontSize: "13px", borderRadius: "4px", border: "1px solid #e2e8f0" }}
            >
              <option value="bi">Gruppo BI</option>
              <option value="crm">Gruppo CRM</option>
              <option value="all">Tutti</option>
            </select>
          </div>

          <div className="calendar" ref={calendarRef}>
            <div className="calendar-grid header">
              {weekDays.map((day) => (
                <div key={day} className="calendar-cell header">
                  {day}
                </div>
              ))}
            </div>
            <div className="calendar-grid body">
              {calendarDays.map((day) => {
                const dateKey = formatDate(day.date);
                const dayTasks = (tasksByDate[dateKey] ?? []).filter((task) =>
                  calendarMemberFilter === "all"
                    ? visibleMemberIds.has(task.assigneeId ?? "")
                    : task.assigneeId === calendarMemberFilter
                );
                const leaveDayTasks = dayTasks.filter((task) => isLeaveTask(task));
                const scheduledDayTasks = dayTasks.filter((task) => !isLeaveTask(task));
                return (
                  <div
                    key={day.key}
                    className={`calendar-cell day${day.inMonth ? "" : " muted"}`}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnDate(e, dateKey)}
                  >
                    <span className="calendar-date">{day.date.getDate()}</span>
                    <div className="calendar-tasks">
                      {leaveDayTasks.map((task) => {
                        const assignee = task.assigneeId ? memberMap.get(task.assigneeId) : null;
                        const leaveName = assignee?.name || task.client || "In ferie";
                        return (
                          <button
                            type="button"
                            key={`leave-${task.id}`}
                            className="calendar-leave-item"
                            title={`Ferie di ${leaveName} (${task.hours}h) - clicca per eliminare`}
                            onClick={() => void handleDeleteTask(task.id)}
                          >
                            <span className="calendar-leave-icon" aria-label="Ferie">F</span>
                            <span className="calendar-leave-name">{leaveName}</span>
                          </button>
                        );
                      })}
                      {scheduledDayTasks.map((task) => {
                        const assignee = task.assigneeId ? memberMap.get(task.assigneeId) : null;
                        const assigneeInitial = assignee ? assignee.name.charAt(0).toUpperCase() : "";
                        return (
                          <div
                            key={task.id}
                            className="calendar-task"
                            style={{
                              backgroundColor: getAssigneeColor(task.assigneeId)
                            }}
                            title={`${task.commessa} • ${task.client} • ${task.description} (${task.hours}h)`}
                            onClick={() => setEditingTask(task)}
                            draggable
                            onDragStart={() => handleTaskDragStart(task.id)}
                          >
                            <div className="calendar-task-left-edge" onDragStart={(e) => {
                              e.stopPropagation();
                              handleTaskDragStart(task.id, "start");
                            }} draggable />
                            
                            <div className="calendar-task-content">
                              {assigneeInitial && (
                                <span className="assignee-badge">{assigneeInitial}</span>
                              )}
                              <div>
                                <strong>{task.client}</strong>
                                <span className="hours">{getHoursPerDay(task)}h</span>
                              </div>
                              <span className="calendar-task-desc">{task.description}</span>
                              <div className="calendar-task-meta">
                                <span className="badge">{task.commessa}</span>
                                <span
                                  className={`status ${task.status}`}
                                  title={statusLabels[task.status]}
                                  aria-label={statusLabels[task.status]}
                                >
                                  {statusIcons[task.status]}
                                </span>
                              </div>
                            </div>
                            
                            <div className="calendar-task-right-edge" onDragStart={(e) => {
                              e.stopPropagation();
                              handleTaskDragStart(task.id, "end");
                            }} draggable />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      
      {editingTask && (
        <TaskDetailModal
          task={editingTask}
          members={members}
          onSave={handleTaskSave}
          onDelete={handleDeleteFromModal}
          onClose={() => setEditingTask(null)}
        />
      )}
      
      {showCreateModal && (
        <TaskCreateModal
          onTaskCreated={(task) => {
            onTasksUpdate([task, ...tasks]);
            setShowCreateModal(false);
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      
      {showTeamModal && (
        <TaskTeamModal
          members={members}
          onMembersUpdate={onMembersUpdate}
          onClose={() => setShowTeamModal(false)}
        />
      )}

      {/* Div invisibile per le statistiche in PDF */}
      <div 
        ref={statsRef} 
        style={{
          display: "none",
          position: "absolute",
          width: "1200px",
          padding: "40px",
          backgroundColor: "#ffffff",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }}
      >
        {/* KPI Cards aggregate */}
        <div style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "24px", marginBottom: "20px", color: "#1e293b" }}>
            Statistiche Aggregate Team
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {/* Occupazione */}
            <div style={{
              padding: "20px",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              backgroundColor: "#f8fafc"
            }}>
              <div style={{ marginBottom: "15px" }}>
                <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 5px 0" }}>Occupazione</p>
                <p style={{ fontSize: "28px", fontWeight: "bold", color: "#1e293b", margin: "0" }}>
                  {Math.round(totals.totalPercentage)}%
                </p>
              </div>
              <div style={{
                height: "8px",
                backgroundColor: "#e2e8f0",
                borderRadius: "4px",
                overflow: "hidden"
              }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(totals.totalPercentage, 100)}%`,
                    backgroundColor: totals.totalPercentage > 100 ? "#ef4444" : totals.totalPercentage > 80 ? "#f59e0b" : "#10b981",
                    transition: "width 0.3s ease"
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b", marginTop: "8px" }}>
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Valore / Target */}
            <div style={{
              padding: "20px",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              backgroundColor: "#f8fafc"
            }}>
              <div style={{ marginBottom: "15px" }}>
                <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 5px 0" }}>Valore Economico / Target</p>
                <p style={{ fontSize: "28px", fontWeight: "bold", color: "#1e293b", margin: "0" }}>
                  €{totals.totalEconomicValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div style={{
                height: "8px",
                backgroundColor: "#e2e8f0",
                borderRadius: "4px",
                overflow: "hidden"
              }}>
                <div
                  style={{
                    height: "100%",
                    width: `${totals.totalMonthlyTarget > 0 ? Math.min((totals.totalEconomicValue / totals.totalMonthlyTarget) * 100, 100) : 0}%`,
                    backgroundColor: totals.totalMonthlyTarget > 0 ? (totals.totalEconomicValue / totals.totalMonthlyTarget > 1 ? "#ef4444" : totals.totalEconomicValue / totals.totalMonthlyTarget > 0.8 ? "#f59e0b" : "#10b981") : "#10b981",
                    transition: "width 0.3s ease"
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b", marginTop: "8px" }}>
                <span>€0</span>
                <span>€{totals.totalMonthlyTarget.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card stats per membro */}
        <div>
          <h2 style={{ fontSize: "24px", marginBottom: "20px", color: "#1e293b" }}>
            Statistiche per Team Member
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "20px" }}>
            {memberStats.map(({ member, availableHours: memAvailHours, assignedHours, leaveHours, workHours, effectiveAvailableHours, percentage, remainingHours, economicValue }) => (
              <div
                key={member.id}
                style={{
                  padding: "20px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  backgroundColor: "#f8fafc"
                }}
              >
                <div style={{ marginBottom: "15px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: "0 0 2px 0", fontSize: "16px", color: "#1e293b" }}>{member.name}</h3>
                    <p style={{ margin: "0", fontSize: "12px", color: "#64748b" }}>{member.role}</p>
                  </div>
                  <span style={{
                    padding: "4px 12px",
                    borderRadius: "20px",
                    fontSize: "14px",
                    fontWeight: "bold",
                    backgroundColor: percentage > 100 ? "#fee2e2" : percentage > 80 ? "#fef3c7" : "#dcfce7",
                    color: percentage > 100 ? "#dc2626" : percentage > 80 ? "#d97706" : "#16a34a"
                  }}>
                    {Math.round(percentage)}%
                  </span>
                </div>

                <div style={{
                  height: "8px",
                  backgroundColor: "#e2e8f0",
                  borderRadius: "4px",
                  overflow: "hidden",
                  marginBottom: "15px"
                }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(percentage, 100)}%`,
                      backgroundColor: percentage > 100 ? "#ef4444" : percentage > 80 ? "#f59e0b" : "#10b981"
                    }}
                  />
                </div>

                <div style={{ fontSize: "13px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", color: "#475569" }}>
                    <span>Ore operative:</span>
                    <span style={{ fontWeight: "bold", color: "#1e293b" }}>{workHours.toFixed(1)}h</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", color: "#475569" }}>
                    <span>Disponibilita netta:</span>
                    <span style={{ fontWeight: "bold", color: "#1e293b" }}>{effectiveAvailableHours.toFixed(1)}h</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", color: "#475569" }}>
                    <span>Ferie pianificate:</span>
                    <span style={{ fontWeight: "bold", color: "#1e293b" }}>{leaveHours.toFixed(1)}h</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", color: "#475569" }}>
                    <span>Ore assegnate totali:</span>
                    <span style={{ fontWeight: "bold", color: "#1e293b" }}>{assignedHours.toFixed(1)}h</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", color: "#475569" }}>
                    <span>Valore economico:</span>
                    <span style={{ fontWeight: "bold", color: "#1e293b" }}>€{economicValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: remainingHours < 0 ? "#dc2626" : "#475569" }}>
                    <span>{remainingHours >= 0 ? "Ore rimanenti:" : "Ore eccedenti:"}</span>
                    <span style={{ fontWeight: "bold", color: remainingHours < 0 ? "#dc2626" : "#1e293b" }}>
                      {Math.abs(remainingHours).toFixed(1)}h
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
