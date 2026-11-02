import { useMemo, useState } from "react";
import type { Member, Task } from "./types";

interface Props {
  tasks: Task[];
  members: Member[];
  currentMonth: Date;
  onSwitchPage: (page: "create" | "manage" | "database" | "team") => void;
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

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export default function TaskStatsPage({ tasks, members, currentMonth, onSwitchPage }: Props) {
  const workingDays = useMemo(() => getWorkingDaysInMonth(currentMonth), [currentMonth]);
  const availableHours = workingDays * 8;
  const hourlyRate = 75; // €/ora
  const [groupFilter, setGroupFilter] = useState<"all" | "bi" | "crm">("all");

  const memberStats = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    
    return members.map((member) => {
      // Filtra solo i task del mese corrente
      const assignedTasks = tasks.filter((task) => {
        if (task.assigneeId !== member.id) return false;
        if (!task.startDate || !task.endDate) return false;
        
        const taskStart = new Date(task.startDate);
        const taskEnd = new Date(task.endDate);
        
        // Il task è nel mese se c'è sovrapposizione tra il periodo del task e il mese
        return taskStart <= monthEnd && taskEnd >= monthStart;
      });
      
      const assignedHours = assignedTasks.reduce((sum, task) => sum + task.hours, 0);
      const percentage = availableHours > 0 ? (assignedHours / availableHours) * 100 : 0;
      const economicValue = assignedHours * hourlyRate;
      
      return {
        member,
        availableHours,
        assignedHours,
        percentage,
        remainingHours: availableHours - assignedHours,
        economicValue
      };
    });
  }, [members, tasks, availableHours, currentMonth]);

  const visibleMemberStats = useMemo(() => {
    if (groupFilter === "all") return memberStats;
    return memberStats.filter(s => s.member.group === groupFilter);
  }, [memberStats, groupFilter]);

  const totals = useMemo(() => {
    const totalAvailableHours = availableHours * visibleMemberStats.length;
    const totalAssignedHours = visibleMemberStats.reduce((sum, stat) => sum + stat.assignedHours, 0);
    const totalEconomicValue = visibleMemberStats.reduce((sum, stat) => sum + stat.economicValue, 0);
    const totalPercentage = totalAvailableHours > 0 ? (totalAssignedHours / totalAvailableHours) * 100 : 0;
    const totalMonthlyTarget = visibleMemberStats.reduce((sum, stat) => {
      if (!stat.member.annualTarget) return sum;
      const getTotalWorkingHoursInYear = () => {
        let totalHours = 0;
        const year = currentMonth.getFullYear();
        for (let m = 0; m < 12; m++) {
          const wd = getWorkingDaysInMonth(new Date(year, m, 1));
          totalHours += wd * 8;
        }
        return totalHours;
      };
      const totalYearlyHours = getTotalWorkingHoursInYear();
      return sum + (stat.member.annualTarget / totalYearlyHours) * stat.availableHours;
    }, 0);
    
    return {
      totalAvailableHours,
      totalAssignedHours,
      totalEconomicValue,
      totalPercentage,
      totalMonthlyTarget
    };
  }, [visibleMemberStats, availableHours, currentMonth]);

  const monthLabel = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric"
  }).format(currentMonth);

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Statistiche</p>
          <h1>Carico di lavoro - {monthLabel}</h1>
          <p className="subtitle">
            {workingDays} giorni lavorativi • {availableHours}h disponibili per persona
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", color: "#64748b" }}>Gruppo:</span>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value as "all" | "bi" | "crm")} style={{ padding: "6px 10px", fontSize: "13px", borderRadius: "4px", border: "1px solid #e2e8f0" }}>
              <option value="all">Tutti</option>
              <option value="bi">BI</option>
              <option value="crm">CRM</option>
            </select>
          </div>
          <button className="secondary" onClick={() => onSwitchPage("manage")}>
            ← Torna al calendario
          </button>
        </div>
      </header>

      <main className="panel">
        <div className="stats-grid">
          {visibleMemberStats.map(({ member, availableHours, assignedHours, percentage, remainingHours, economicValue }) => (
            <div key={member.id} className="stat-card">
              <div className="stat-header">
                <h3>{member.name}</h3>
                <span className={`stat-badge ${percentage > 100 ? "overload" : percentage > 80 ? "high" : "normal"}`}>
                  {Math.round(percentage)}%
                </span>
              </div>
              
              <div className="stat-progress-container">
                <div className="stat-progress-bar">
                  <div
                    className={`stat-progress-fill ${percentage > 100 ? "overload" : percentage > 80 ? "high" : "normal"}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              </div>

              <div className="stat-details">
                <div className="stat-row">
                  <span className="stat-label">Ore assegnate:</span>
                  <span className="stat-value">{assignedHours.toFixed(1)}h</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Valore economico:</span>
                  <span className="stat-value">€{economicValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Ore disponibili:</span>
                  <span className="stat-value">{availableHours}h</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">
                    {remainingHours >= 0 ? "Ore rimanenti:" : "Ore eccedenti:"}
                  </span>
                  <span className={`stat-value ${remainingHours < 0 ? "negative" : ""}`}>
                    {Math.abs(remainingHours).toFixed(1)}h
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
