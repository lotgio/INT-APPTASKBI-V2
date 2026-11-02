import { useMemo, useState } from "react";
import type { Member, Task, TaskStatus } from "./types";

interface Props {
  tasks: Task[];
  members: Member[];
  memberId: string;
  initialStart?: string | null;
  initialEnd?: string | null;
  onBack?: () => void;
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

const pastelleFluorescentColors = [
  "#FFFF99",
  "#FFD699",
  "#FF99CC",
  "#FF99FF",
  "#CC99FF",
  "#9999FF",
  "#99CCFF",
  "#99FFFF",
  "#99FFCC",
  "#99FF99",
  "#CCFF99"
];

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value?: string | null, fallback?: Date) {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return fallback ?? new Date();
}

function getMonthRange(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0)
  };
}

function getCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
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
}

function getMonthsInRange(start: Date, end: Date) {
  const months: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endCursor) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function getAssigneeColor(assigneeId?: string) {
  if (!assigneeId) {
    return "#e2e8f0";
  }
  let hash = 0;
  for (let i = 0; i < assigneeId.length; i++) {
    const char = assigneeId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const absHash = Math.abs(hash);
  const colorIndex = absHash % pastelleFluorescentColors.length;
  return pastelleFluorescentColors[colorIndex];
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

export default function TaskResourceViewPage({
  tasks,
  members,
  memberId,
  initialStart,
  initialEnd,
  onBack
}: Props) {
  const member = members.find((m) => m.id === memberId) ?? null;
  const now = new Date();
  const defaultRange = getMonthRange(now);

  const [rangeStart, setRangeStart] = useState(() =>
    formatDate(parseDate(initialStart, defaultRange.start))
  );
  const [rangeEnd, setRangeEnd] = useState(() =>
    formatDate(parseDate(initialEnd, defaultRange.end))
  );
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const normalizedRange = useMemo(() => {
    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);
    if (start > end) {
      return { start: end, end: start };
    }
    return { start, end };
  }, [rangeStart, rangeEnd]);

  const months = useMemo(
    () => getMonthsInRange(normalizedRange.start, normalizedRange.end),
    [normalizedRange]
  );

  const tasksForMember = useMemo(
    () => tasks.filter((task) => task.assigneeId === memberId),
    [tasks, memberId]
  );

  const unscheduledTasks = useMemo(
    () => tasksForMember.filter((task) => !task.startDate || !task.endDate),
    [tasksForMember]
  );

  const tasksByDate = useMemo(() => {
    const tasksOnDates: Record<string, Task[]> = {};

    for (const task of tasksForMember) {
      if (!task.startDate || !task.endDate) continue;

      const startDate = new Date(task.startDate);
      const endDate = new Date(task.endDate);
      const currentDate = new Date(
        Math.max(startDate.getTime(), normalizedRange.start.getTime())
      );
      const lastDate = new Date(
        Math.min(endDate.getTime(), normalizedRange.end.getTime())
      );

      while (currentDate <= lastDate) {
        const dateKey = formatDate(currentDate);
        if (!tasksOnDates[dateKey]) {
          tasksOnDates[dateKey] = [];
        }
        tasksOnDates[dateKey].push(task);
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    return tasksOnDates;
  }, [tasksForMember, normalizedRange]);

  const copyShareLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "resource");
    url.searchParams.set("memberId", memberId);
    url.searchParams.set("start", rangeStart);
    url.searchParams.set("end", rangeEnd);
    url.searchParams.set("public", "1");

    try {
      await navigator.clipboard.writeText(url.toString());
      setCopyStatus("Link copiato");
      setTimeout(() => setCopyStatus(null), 2500);
    } catch (err) {
      setCopyStatus("Copia non disponibile");
    }
  };

  if (!member) {
    return (
      <div className="page">
        <header className="hero">
          <div>
            <p className="eyebrow">Vista risorsa</p>
            <h1>Risorsa non trovata</h1>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="page resource-view">
      <header className="hero">
        <div>
          <p className="eyebrow">Pianificazione risorsa</p>
          <h1>{member.name}</h1>
          <p className="subtitle">Calendario condivisibile con tutte le attivita assegnate.</p>
        </div>
        <div className="hero-buttons">
          <button className="secondary" onClick={copyShareLink}>
            Copia link
          </button>
        </div>
      </header>

      <section className="panel resource-filters">
        <div className="resource-date-range">
          <label>
            Da
            <input
              type="date"
              value={rangeStart}
              onChange={(event) => setRangeStart(event.target.value)}
            />
          </label>
          <label>
            A
            <input
              type="date"
              value={rangeEnd}
              onChange={(event) => setRangeEnd(event.target.value)}
            />
          </label>
          <button className="primary" type="button" onClick={() => window.location.reload()}>
            Aggiorna
          </button>
          {copyStatus && <span className="resource-copy-status">{copyStatus}</span>}
        </div>
      </section>

      <main className="resource-calendar-list">
        {months.map((month) => {
          const monthLabel = new Intl.DateTimeFormat("it-IT", {
            month: "long",
            year: "numeric"
          }).format(month);
          const days = getCalendarDays(month);

          return (
            <section key={month.toISOString()} className="panel calendar-panel">
              <div className="calendar-header">
                <span className="calendar-title">{monthLabel}</span>
              </div>
              <div className="calendar">
                <div className="calendar-grid header">
                  {weekDays.map((day) => (
                    <div key={day} className="calendar-cell header">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="calendar-grid body">
                  {days.map((day) => {
                    const dateKey = formatDate(day.date);
                    const dayTasks = tasksByDate[dateKey] ?? [];
                    const leaveDayTasks = dayTasks.filter((task) => isLeaveTask(task));
                    const scheduledDayTasks = dayTasks.filter((task) => !isLeaveTask(task));
                    const inRange = day.date >= normalizedRange.start && day.date <= normalizedRange.end;
                    const isMuted = !day.inMonth || !inRange;

                    return (
                      <div
                        key={day.key}
                        className={`calendar-cell day${isMuted ? " muted" : ""}`}
                      >
                        <span className="calendar-date">{day.date.getDate()}</span>
                        <div className="calendar-tasks">
                          {leaveDayTasks.map((task) => (
                            <div
                              key={`leave-${task.id}`}
                              className="calendar-leave-item"
                              title={`${task.client || "Risorsa"} in ferie (${task.hours}h)`}
                            >
                              <span className="calendar-leave-icon" aria-label="Ferie">F</span>
                              <span className="calendar-leave-name">{task.client || "Risorsa"}</span>
                            </div>
                          ))}
                          {scheduledDayTasks.map((task) => (
                            <div
                              key={task.id}
                              className="calendar-task"
                              style={{
                                backgroundColor: getAssigneeColor(task.assigneeId)
                              }}
                              title={`${task.commessa} • ${task.client} • ${task.description} (${task.hours}h)`}
                            >
                              <div className="calendar-task-content">
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
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}

        <section className="panel">
          <h2>Task non schedulati</h2>
          {unscheduledTasks.length === 0 ? (
            <div className="empty">Nessun task non schedulato</div>
          ) : (
            <div className="task-list">
              {unscheduledTasks.map((task) => (
                <article key={task.id} className="task-card">
                  <div>
                    <div className="task-meta">
                      <span className="badge">{task.commessa}</span>
                      <span className="badge secondary">{task.client}</span>
                      <span className="hours">{task.hours}h</span>
                    </div>
                    <h4>{task.description}</h4>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
