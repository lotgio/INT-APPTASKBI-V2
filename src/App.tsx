import { useEffect, useState } from "react";
import { getMembers, getTasks, getTodos } from "./api";
import type { Member, Task, TodoItem } from "./types";
import Sidebar, { type Route } from "./components/Sidebar";
import CalendarPage from "./pages/CalendarPage";
import ProgressPage, { type PlanningJob } from "./pages/ProgressPage";
import TaskCreatePage from "./TaskCreatePage";
import TaskManagePage from "./TaskManagePage";
import TaskFromJobModal from "./TaskFromJobModal";
import TaskResourceViewPage from "./TaskResourceViewPage";
import TodosPage from "./pages/TodosPage";
import StatsPage from "./pages/StatsPage";
import TeamPage from "./pages/TeamPage";
import TasksDbPage from "./pages/TasksDbPage";
import "./App.css";
import "./ui.css";

type AppRoute = Route | "nuovo-task";
const ROUTES: AppRoute[] = ["calendario", "avanzamento", "todo", "statistiche", "team", "database", "calendario-classico", "nuovo-task"];

/** Traduce i nomi pagina usati dalle pagine esistenti nelle nuove rotte. */
const LEGACY_TO_ROUTE: Record<string, AppRoute> = {
  manage: "calendario",
  "job-progress": "avanzamento",
  todo: "todo",
  jobs: "avanzamento",
  stats: "statistiche",
  team: "team",
  database: "database",
  create: "nuovo-task"
};

function readRoute(): AppRoute {
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  if (raw === "commesse") return "avanzamento"; // pagina rimossa: le commesse sono nell'Avanzamento
  return ROUTES.includes(raw as AppRoute) ? (raw as AppRoute) : "calendario";
}

function navigate(route: AppRoute) {
  if (window.location.hash !== `#/${route}`) window.location.hash = `/${route}`;
}

const TITLES: Record<AppRoute, string> = {
  calendario: "Calendario",
  avanzamento: "Avanzamento",
  todo: "Todo",
  statistiche: "Statistiche",
  team: "Team",
  database: "Database task",
  "calendario-classico": "Calendario classico",
  "nuovo-task": "Nuovo task"
};

export default function App() {
  const [route, setRoute] = useState<AppRoute>(readRoute);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<PlanningJob | null>(null);
  const [resourceView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const memberId = params.get("memberId") || params.get("member");
    return {
      enabled: params.get("view") === "resource" && !!memberId,
      memberId: memberId ?? "",
      start: params.get("start"),
      end: params.get("end")
    };
  });

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.title = `${TITLES[route]} · AppTask BI`;
  }, [route]);

  useEffect(() => {
    (async () => {
      try {
        const [t, m, td] = await Promise.all([getTasks(), getMembers(), getTodos()]);
        setTasks(t);
        setMembers(m);
        setTodos(td);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Errore di caricamento dati");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const goLegacy = (page: string) => navigate(LEGACY_TO_ROUTE[page] ?? "calendario");

  if (loading) {
    return (
      <div className="ui-shell" style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "#5E6B78" }}>
          <div className="ui-brand-mark">BI</div>
          Caricamento dati…
        </div>
      </div>
    );
  }

  if (resourceView.enabled) {
    return (
      <TaskResourceViewPage
        tasks={tasks}
        members={members}
        memberId={resourceView.memberId}
        initialStart={resourceView.start}
        initialEnd={resourceView.end}
        onBack={() => {
          const url = new URL(window.location.href);
          url.search = "";
          url.hash = "/calendario";
          window.location.href = url.toString();
        }}
      />
    );
  }

  const isNew = route !== "calendario-classico" && route !== "nuovo-task";
  const sidebarRoute: Route = route === "nuovo-task" ? "calendario" : route;

  let content: JSX.Element;
  switch (route) {
    case "calendario":
      content = <CalendarPage tasks={tasks} members={members} onTasksUpdate={setTasks} />;
      break;
    case "avanzamento":
      content = <ProgressPage tasks={tasks} onCreateTaskFromJob={setSelectedJob} />;
      break;
    case "todo":
      content = <TodosPage todos={todos} members={members} onTodosUpdate={setTodos} />;
      break;
    case "statistiche":
      content = <StatsPage tasks={tasks} members={members} />;
      break;
    case "team":
      content = <TeamPage tasks={tasks} members={members} onMembersUpdate={setMembers} onTasksUpdate={setTasks} />;
      break;
    case "database":
      content = <TasksDbPage tasks={tasks} members={members} onTasksUpdate={setTasks} />;
      break;
    case "nuovo-task":
      content = (
        <TaskCreatePage
          members={members}
          onTaskCreated={(task) => { setTasks((prev) => [task, ...prev]); navigate("calendario"); }}
          onSwitchPage={() => navigate("team")}
        />
      );
      break;
    case "calendario-classico":
    default:
      content = <TaskManagePage tasks={tasks} members={members} onTasksUpdate={setTasks} onMembersUpdate={setMembers} onSwitchPage={goLegacy} />;
  }

  return (
    <div className="ui-shell">
      <Sidebar route={sidebarRoute} />
      <main className={`ui-content${isNew ? "" : " ui-legacy"}`}>
        {loadError && (
          <div style={{ padding: "16px 28px 0" }}>
            <div className="ui-alert error" role="alert">Impossibile caricare tutti i dati: {loadError}</div>
          </div>
        )}
        {content}
      </main>
      {selectedJob && (
        <TaskFromJobModal
          job={selectedJob}
          members={members}
          onTaskCreated={(task) => { setTasks((prev) => [task, ...prev]); setSelectedJob(null); }}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  );
}
