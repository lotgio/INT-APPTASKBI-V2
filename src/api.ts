import type { Member, Task, TodoItem } from "./types";
import { mockJobs } from "./mockJobs";
import { supabase } from "./supabaseClient";

const RAW_API_BASE = (((import.meta as any)?.env?.VITE_API_BASE || "/api") as string).trim();
const API_BASE = RAW_API_BASE.endsWith("/") ? RAW_API_BASE.slice(0, -1) : RAW_API_BASE;
// Usa localStorage solo se esplicitamente richiesto da configurazione.
const USE_LOCAL_STORAGE = (import.meta as any)?.env?.VITE_USE_LOCAL_STORAGE === "true";
// Usa Supabase se configurato.
const USE_SUPABASE = !!supabase;
const IS_GITHUB_PAGES = typeof window !== "undefined" && window.location.hostname.endsWith("github.io");
// Su GitHub Pages i job CRM vengono letti dallo snapshot pubblicato generato da Azure durante il deploy.
const USE_MOCK_JOBS = USE_LOCAL_STORAGE || IS_GITHUB_PAGES;
const ALLOW_STATIC_JOBS_FALLBACK =
  USE_LOCAL_STORAGE ||
  (import.meta as any)?.env?.VITE_ALLOW_STATIC_JOBS_FALLBACK === "true";
// Nota: Vite sostituisce solo la forma letterale import.meta.env.VITE_*
const JOBS_REMOTE_URL = ((import.meta.env.VITE_JOBS_URL as string | undefined) || "").trim();
const BASE_URL = ((import.meta as any)?.env?.BASE_URL || "/") as string;
let jobsCache: any[] | null = null;

function getJobsSourceUrl(): string {
  return JOBS_REMOTE_URL || "./jobs.json";
}

const STORAGE_KEYS = {
  members: "apptaskbi_members",
  tasks: "apptaskbi_tasks",
  jobProgressLineNotes: "apptaskbi_job_progress_line_notes"
} as const;

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveLocal<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureId(id?: string) {
  return id || (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
}

function filterAndPaginateJobs(jobs: any[], options?: { limit?: number; offset?: number; search?: string; division?: string; resourceNo?: string; resourceNos?: string[]; excludeTrasferta?: boolean; excludeMatching?: boolean }) {
  let filtered = jobs;

  if (options?.resourceNos && options.resourceNos.length > 0) {
    const set = new Set(options.resourceNos);
    filtered = filtered.filter((j) => set.has(j["Resource No"]));
  } else if (options?.resourceNo) {
    filtered = filtered.filter((j) => j["Resource No"] === options.resourceNo);
  }

  if (options?.excludeTrasferta !== false) {
    filtered = filtered.filter((j) => !String(j["Detail Description"] || "").toUpperCase().includes("TRASFERTA"));
  }

  if (options?.excludeMatching !== false) {
    filtered = filtered.filter((j) => Number(j.Quantity || 0) !== Number(j["Ore Loggate"] || 0));
  }

  if (options?.search) {
    const search = options.search.toLowerCase();
    filtered = filtered.filter((j) =>
      String(j.JobNo || "").toLowerCase().includes(search) ||
      String(j["Customer Name"] || "").toLowerCase().includes(search) ||
      String(j["Plan Description"] || "").toLowerCase().includes(search)
    );
  }

  if (options?.division) {
    filtered = filtered.filter((j) => j.Division === options.division);
  }

  const offset = options?.offset || 0;
  const limit = options?.limit ?? 0;
  if (limit <= 0) {
    return filtered.slice(offset);
  }
  return filtered.slice(offset, offset + limit);
}

async function loadPublishedJobs(): Promise<any[]> {
  if (jobsCache) return jobsCache;

  const url = getJobsSourceUrl();
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Errore jobs source: ${response.status}`);
  }

  const data = await response.json();
  jobsCache = Array.isArray(data) ? data : (data?.data || []);
  return jobsCache;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Errore richiesta API");
  }

  return response.json() as Promise<T>;
}

export async function getMembers(): Promise<Member[]> {
  if (USE_SUPABASE && supabase) {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    // Mappa lowercase a camelCase
    return (data || []).map((m: any) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      avatar: m.avatar,
      group: m.membergroup || undefined,
      annualTarget: m.annualtarget
    })) as Member[];
  }
  if (USE_LOCAL_STORAGE) {
    return loadLocal<Member[]>(STORAGE_KEYS.members, []);
  }
  return request<Member[]>("/members");
}

export async function createMember(payload: Omit<Member, "id"> & { id?: string }): Promise<Member> {
  if (USE_SUPABASE && supabase) {
    const dbMember = {
      id: ensureId(payload.id),
      name: payload.name,
      email: payload.email || null,
      role: payload.role || null,
      avatar: payload.avatar || null,
      membergroup: payload.group || null,
      annualtarget: (payload as any).annualTarget || null
    };
    const { error } = await supabase.from("members").insert([dbMember]);
    if (error) throw error;
    return { ...payload, id: dbMember.id } as Member;
  }
  if (USE_LOCAL_STORAGE) {
    const members = loadLocal<Member[]>(STORAGE_KEYS.members, []);
    const created: Member = { ...payload, id: ensureId(payload.id) } as Member;
    const updated = [created, ...members];
    saveLocal(STORAGE_KEYS.members, updated);
    return created;
  }
  return request<Member>("/members", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateMember(id: string, payload: Partial<Member>): Promise<Member> {
  if (USE_SUPABASE && supabase) {
    const dbPayload: any = {};
    if (payload.name !== undefined) dbPayload.name = payload.name;
    if (payload.email !== undefined) dbPayload.email = payload.email;
    if (payload.role !== undefined) dbPayload.role = payload.role;
    if (payload.avatar !== undefined) dbPayload.avatar = payload.avatar;
    if (payload.group !== undefined) dbPayload.membergroup = payload.group || null;
    if ((payload as any).annualTarget !== undefined) dbPayload.annualtarget = (payload as any).annualTarget;

    const { data, error } = await supabase
      .from("members")
      .update(dbPayload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      avatar: data.avatar,
      group: data.membergroup || undefined,
      annualTarget: data.annualtarget
    } as Member;
  }
  if (USE_LOCAL_STORAGE) {
    const members = loadLocal<Member[]>(STORAGE_KEYS.members, []);
    let updatedMember: Member | null = null;
    const updated = members.map((m) => {
      if (m.id !== id) return m;
      updatedMember = { ...m, ...payload } as Member;
      return updatedMember;
    });
    saveLocal(STORAGE_KEYS.members, updated);
    if (!updatedMember) throw new Error("Member non trovato");
    return updatedMember;
  }
  return request<Member>(`/members/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteMember(id: string): Promise<{ ok: true } | { ok: false }>{
  if (USE_SUPABASE && supabase) {
    const { error } = await supabase.from("members").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  }
  if (USE_LOCAL_STORAGE) {
    const members = loadLocal<Member[]>(STORAGE_KEYS.members, []);
    const updated = members.filter((m) => m.id !== id);
    saveLocal(STORAGE_KEYS.members, updated);
    return { ok: true };
  }
  return request<{ ok: true } | { ok: false }>(`/members/${id}`, {
    method: "DELETE"
  });
}

export async function getTasks(): Promise<Task[]> {
  if (USE_SUPABASE && supabase) {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("createdat", { ascending: false });
    if (error) throw error;
    // Mappa i campi da lowercase a camelCase
    return (data || []).map((t: any) => ({
      id: t.id,
      commessa: t.commessa,
      description: t.description,
      client: t.client,
      hours: t.hours,
      status: t.status,
      startDate: t.startdate,
      endDate: t.enddate,
      teamId: t.teamid,
      assigneeId: t.assigneeid,
      createdAt: t.createdat
    })) as Task[];
  }
  if (USE_LOCAL_STORAGE) {
    return loadLocal<Task[]>(STORAGE_KEYS.tasks, []);
  }
  return request<Task[]>("/tasks");
}

export async function createTask(payload: Partial<Task> & Pick<Task, "commessa" | "description" | "client" | "hours" | "startDate" | "endDate">): Promise<Task> {
  if (USE_SUPABASE && supabase) {
    // Mappa camelCase a lowercase per Supabase
    const dbPayload = {
      id: ensureId(payload.id),
      commessa: payload.commessa,
      description: payload.description,
      client: payload.client,
      hours: payload.hours,
      startdate: payload.startDate,
      enddate: payload.endDate,
      status: payload.status || "todo",
      teamid: payload.teamId || "default",
      assigneeid: payload.assigneeId || null,
      createdat: payload.createdAt || new Date().toISOString()
    };
    const { error } = await supabase.from("tasks").insert([dbPayload]);
    if (error) throw error;
    // Torna camelCase al frontend
    return {
      ...payload,
      id: dbPayload.id,
      createdAt: dbPayload.createdat
    } as Task;
  }
  if (USE_LOCAL_STORAGE) {
    const tasks = loadLocal<Task[]>(STORAGE_KEYS.tasks, []);
    const created: Task = {
      ...payload,
      id: ensureId(payload.id),
      createdAt: payload.createdAt || new Date().toISOString()
    } as Task;
    const updated = [created, ...tasks];
    saveLocal(STORAGE_KEYS.tasks, updated);
    return created;
  }
  return request<Task>("/tasks", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateTask(id: string, payload: Partial<Task>): Promise<Task> {
  if (USE_SUPABASE && supabase) {
    // Mappa camelCase a lowercase
    const dbPayload: any = {};
    if (payload.commessa !== undefined) dbPayload.commessa = payload.commessa;
    if (payload.description !== undefined) dbPayload.description = payload.description;
    if (payload.client !== undefined) dbPayload.client = payload.client;
    if (payload.hours !== undefined) dbPayload.hours = payload.hours;
    if (payload.status !== undefined) dbPayload.status = payload.status;
    if (payload.startDate !== undefined) dbPayload.startdate = payload.startDate;
    if (payload.endDate !== undefined) dbPayload.enddate = payload.endDate;
    if (payload.teamId !== undefined) dbPayload.teamid = payload.teamId;
    if (payload.assigneeId !== undefined) dbPayload.assigneeid = payload.assigneeId;

    const { data, error } = await supabase
      .from("tasks")
      .update(dbPayload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    // Mappa lowercase a camelCase per il return
    return {
      id: data.id,
      commessa: data.commessa,
      description: data.description,
      client: data.client,
      hours: data.hours,
      status: data.status,
      startDate: data.startdate,
      endDate: data.enddate,
      teamId: data.teamid,
      assigneeId: data.assigneeid,
      createdAt: data.createdat
    } as Task;
  }
  if (USE_LOCAL_STORAGE) {
    const tasks = loadLocal<Task[]>(STORAGE_KEYS.tasks, []);
    let updatedTask: Task | null = null;
    const updated = tasks.map((t) => {
      if (t.id !== id) return t;
      updatedTask = { ...t, ...payload, id } as Task;
      return updatedTask;
    });
    saveLocal(STORAGE_KEYS.tasks, updated);
    if (!updatedTask) throw new Error("Task non trovato");
    return updatedTask;
  }
  return request<Task>(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteTask(id: string): Promise<{ ok: true } | { ok: false }>{
  if (USE_SUPABASE && supabase) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  }
  if (USE_LOCAL_STORAGE) {
    const tasks = loadLocal<Task[]>(STORAGE_KEYS.tasks, []);
    const updated = tasks.filter((t) => t.id !== id);
    saveLocal(STORAGE_KEYS.tasks, updated);
    return { ok: true };
  }
  return request<{ ok: true } | { ok: false }>(`/tasks/${id}`, {
    method: "DELETE"
  });
}

export async function getJobs(options?: { limit?: number; offset?: number; search?: string; division?: string; resourceNo?: string; resourceNos?: string[]; excludeTrasferta?: boolean; excludeMatching?: boolean }): Promise<any[]> {
  console.log("🔍 getJobs() chiamato con opzioni:", options);
  
  // In localStorage mode usa jobs.json pubblicato (sincronizzato da Azure Blob)
  if (USE_MOCK_JOBS) {
    const jobs = await loadPublishedJobs();
    return filterAndPaginateJobs(jobs, options);
  }
  
  try {
    const limitParam = options?.limit && options.limit > 0 ? options.limit : 1000;
    const params = new URLSearchParams({
      limit: String(limitParam),
      offset: String(options?.offset || 0),
      ...(options?.search && { search: options.search }),
      ...(options?.division && { division: options.division }),
      ...(options?.resourceNo && { resourceNo: options.resourceNo }),
      ...(options?.resourceNos && options.resourceNos.length > 0 && { resourceNos: options.resourceNos.join(",") }),
      excludeTrasferta: String(options?.excludeTrasferta !== false),
      excludeMatching: String(options?.excludeMatching !== false)
    });
    
    const url = `/api/jobs?${params.toString()}`;
    console.log("📡 Fetching", url);
    
    const response = await fetch(url, { cache: "no-store" });
    console.log("📡 Response status:", response.status);
    
    if (!response.ok) {
      throw new Error(`Errore API: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`✓ Caricati ${result.data?.length || 0} job (totale: ${result.total || 0})`);
    
    return result.data || [];
  } catch (err) {
    console.error("❌ Errore caricamento jobs:", err);
    if (ALLOW_STATIC_JOBS_FALLBACK) {
      console.warn("⚠️ Fallback a jobs.json statico abilitato");
      const jobs = await loadPublishedJobs();
      return filterAndPaginateJobs(jobs, options);
    }
    throw err;
  }
}

export async function getJobsStats(): Promise<{ total: number; divisions: string[] }> {
  if (USE_MOCK_JOBS) {
    const jobs = await loadPublishedJobs();
    const divisions = Array.from(new Set(jobs.map((j: any) => j.Division).filter(Boolean)));
    return { total: jobs.length, divisions };
  }
  
  try {
    const response = await fetch(`${API_BASE}/jobs/stats`);
    if (!response.ok) throw new Error("Errore stats");
    return response.json();
  } catch (err) {
    console.error("❌ Errore stats:", err);
    if (ALLOW_STATIC_JOBS_FALLBACK) {
      const jobs = await loadPublishedJobs();
      const divisions = Array.from(new Set(jobs.map((j: any) => j.Division).filter(Boolean)));
      return { total: jobs.length, divisions };
    }
    throw err;
  }
}

export async function syncJobsFromAzure(): Promise<{ ok: boolean; message: string }> {
  console.log("🔄 Sincronizzazione commesse da Azure richiesta...");
  
  if (USE_MOCK_JOBS) {
    console.log("📦 Modalità localStorage: sincronizzazione non disponibile");
    return { ok: true, message: "Sincronizzazione non disponibile in modalità statica. Usando dati mock." };
  }
  
  try {
    const response = await fetch(`${API_BASE}/sync-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || `Errore HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log("✅ Sincronizzazione completata:", result.message);
    
    // Ricarica i dati dopo la sincronizzazione
    return { ok: true, message: result.message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    console.error("❌ Errore sincronizzazione:", msg);
    throw err;
  }
}

export async function syncJobsFromPrimarySource(): Promise<{ ok: boolean; message: string; source?: string }> {
  console.log("🔄 Sincronizzazione commesse da Azure richiesta...");

  if (USE_MOCK_JOBS) {
    console.log("📦 Modalità localStorage: sincronizzazione non disponibile");
    return { ok: true, message: "Sincronizzazione non disponibile in modalità statica. Usando dati mock.", source: "static" };
  }

  try {
    const response = await fetch(`${API_BASE}/sync-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ source: "azure" })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || `Errore HTTP ${response.status}`);
    }

    const result = await response.json();
    const message = result.message || "Aggiornamento dati completato";
    console.log("✅ Sincronizzazione completata:", message);
    return { ok: true, message, source: result.source };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    console.error("❌ Errore sincronizzazione Azure:", msg);
    throw err;
  }
}

export async function dispatchSyncJobsWorkflowWithToken(token: string): Promise<{ ok: boolean; message: string }> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    throw new Error("Token GitHub mancante");
  }

  const response = await fetch("https://api.github.com/repos/lotgio/INT-APPTASKBI/actions/workflows/sync-jobs.yml/dispatches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${trimmedToken}`
    },
    body: JSON.stringify({
      ref: "main"
    })
  });

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch {
      details = "";
    }
    throw new Error(details || `Errore trigger workflow GitHub (${response.status})`);
  }

  return {
    ok: true,
    message: "Sync avviata via GitHub Actions. Attendi 3-5 minuti: il pulsante in GitHub Pages aggiorna i dati solo dopo il completamento della workflow e del deploy."
  };
}

export async function getJobsDataLastUpdate(): Promise<string | null> {
  try {
    const response = await fetch(getJobsSourceUrl(), {
      method: "HEAD",
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    return response.headers.get("last-modified");
  } catch {
    return null;
  }
}

export async function getResources(): Promise<Record<string, string>> {
  try {
    // Risolve resources.json relativo alla pagina corrente (funziona su qualsiasi subpath)
    const configured = ((import.meta.env.VITE_RESOURCES_URL as string | undefined) || "").trim();
    const url = configured || new URL("resources.json", window.location.href).href;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      console.warn(`[getResources] ${url} → HTTP ${response.status}`);
      return {};
    }
    const data: Array<{ No: string; Name: string }> = await response.json();
    console.info(`[getResources] caricate ${data.length} risorse da ${url}`);
    return Object.fromEntries(data.map((r) => [r.No, r.Name]));
  } catch (err) {
    console.warn("[getResources] errore:", err);
    return {};
  }
}

export async function getJobProgressLineNotes(): Promise<Record<string, string>> {
  if (USE_SUPABASE && supabase) {
    const { data, error } = await supabase
      .from("job_progress_line_notes")
      .select("linekey,note");
    if (error) {
      // La tabella note potrebbe non essere ancora stata creata nel progetto Supabase.
      if ((error as any).code === "PGRST205") {
        return {};
      }
      throw error;
    }

    const map: Record<string, string> = {};
    (data || []).forEach((row: any) => {
      const key = String(row.linekey || "").trim();
      if (!key) return;
      map[key] = String(row.note || "");
    });

    return map;
  }

  if (USE_LOCAL_STORAGE) {
    return loadLocal<Record<string, string>>(STORAGE_KEYS.jobProgressLineNotes, {});
  }

  return {};
}

export async function saveJobProgressLineNote(lineKey: string, note: string): Promise<void> {
  const key = lineKey.trim();
  if (!key) return;

  const normalizedNote = note.slice(0, 500);
  if (USE_SUPABASE && supabase) {
    if (!normalizedNote.trim()) {
      const { error } = await supabase.from("job_progress_line_notes").delete().eq("linekey", key);
      if (error) {
        if ((error as any).code === "PGRST205") {
          throw new Error("Tabella note non configurata su Supabase. Esegui lo script supabase/job-progress-line-notes.sql.");
        }
        throw error;
      }
      return;
    }

    const payload = {
      linekey: key,
      note: normalizedNote,
      updatedat: new Date().toISOString()
    };
    const { error } = await supabase.from("job_progress_line_notes").upsert(payload, { onConflict: "linekey" });
    if (error) {
      if ((error as any).code === "PGRST205") {
        throw new Error("Tabella note non configurata su Supabase. Esegui lo script supabase/job-progress-line-notes.sql.");
      }
      throw error;
    }
    return;
  }

  if (USE_LOCAL_STORAGE) {
    const local = loadLocal<Record<string, string>>(STORAGE_KEYS.jobProgressLineNotes, {});
    if (normalizedNote.trim()) {
      local[key] = normalizedNote;
    } else {
      delete local[key];
    }
    saveLocal(STORAGE_KEYS.jobProgressLineNotes, local);
  }
}

const STORAGE_KEYS_TODO = {
  todos: "apptaskbi_todos"
} as const;

export async function getTodos(): Promise<TodoItem[]> {
  if (USE_SUPABASE && supabase) {
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .order("createdat", { ascending: false });
    if (error) throw error;
    return (data || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      client: t.client,
      commessa: t.commessa,
      businessUnit: t.businessunit,
      resourceId: t.resourceid,
      completed: t.completed,
      createdAt: t.createdat,
      dueDate: t.duedate
    })) as TodoItem[];
  }
  if (USE_LOCAL_STORAGE) {
    return loadLocal<TodoItem[]>(STORAGE_KEYS_TODO.todos, []);
  }
  return request<TodoItem[]>("/todos");
}

export async function createTodo(payload: Omit<TodoItem, "id" | "createdAt"> & { id?: string }): Promise<TodoItem> {
  if (USE_SUPABASE && supabase) {
    const dbTodo = {
      id: ensureId(payload.id),
      title: payload.title,
      description: payload.description || null,
      client: payload.client || null,
      commessa: payload.commessa || null,
      businessunit: payload.businessUnit || null,
      resourceid: payload.resourceId || null,
      completed: payload.completed || false,
      createdat: payload.createdAt || new Date().toISOString(),
      duedate: payload.dueDate || null
    };
    const { error } = await supabase.from("todos").insert([dbTodo]);
    if (error) throw error;
    return { ...payload, id: dbTodo.id, createdAt: dbTodo.createdat } as TodoItem;
  }
  if (USE_LOCAL_STORAGE) {
    const todos = loadLocal<TodoItem[]>(STORAGE_KEYS_TODO.todos, []);
    const created: TodoItem = {
      ...payload,
      id: ensureId(payload.id),
      createdAt: payload.createdAt || new Date().toISOString()
    } as TodoItem;
    const updated = [created, ...todos];
    saveLocal(STORAGE_KEYS_TODO.todos, updated);
    return created;
  }
  return request<TodoItem>("/todos", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateTodo(id: string, payload: Partial<TodoItem>): Promise<TodoItem> {
  if (USE_SUPABASE && supabase) {
    const dbPayload: any = {};
    if (payload.title !== undefined) dbPayload.title = payload.title;
    if (payload.description !== undefined) dbPayload.description = payload.description;
    if (payload.client !== undefined) dbPayload.client = payload.client;
    if (payload.commessa !== undefined) dbPayload.commessa = payload.commessa;
    if (payload.businessUnit !== undefined) dbPayload.businessunit = payload.businessUnit;
    if (payload.resourceId !== undefined) dbPayload.resourceid = payload.resourceId;
    if (payload.completed !== undefined) dbPayload.completed = payload.completed;
    if (payload.dueDate !== undefined) dbPayload.duedate = payload.dueDate;

    const { data, error } = await supabase
      .from("todos")
      .update(dbPayload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      client: data.client,
      commessa: data.commessa,
      businessUnit: data.businessunit,
      resourceId: data.resourceid,
      completed: data.completed,
      createdAt: data.createdat,
      dueDate: data.duedate
    } as TodoItem;
  }
  if (USE_LOCAL_STORAGE) {
    const todos = loadLocal<TodoItem[]>(STORAGE_KEYS_TODO.todos, []);
    let updated: TodoItem | null = null;
    const result = todos.map((t) => {
      if (t.id !== id) return t;
      updated = { ...t, ...payload, id } as TodoItem;
      return updated;
    });
    saveLocal(STORAGE_KEYS_TODO.todos, result);
    if (!updated) throw new Error("Todo non trovato");
    return updated;
  }
  return request<TodoItem>(`/todos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteTodo(id: string): Promise<{ ok: true } | { ok: false }> {
  if (USE_SUPABASE && supabase) {
    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  }
  if (USE_LOCAL_STORAGE) {
    const todos = loadLocal<TodoItem[]>(STORAGE_KEYS_TODO.todos, []);
    const updated = todos.filter((t) => t.id !== id);
    saveLocal(STORAGE_KEYS_TODO.todos, updated);
    return { ok: true };
  }
  return request<{ ok: true } | { ok: false }>(`/todos/${id}`, {
    method: "DELETE"
  });
}
