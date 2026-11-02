import "dotenv/config";
import corsModule from "cors";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import expressModule from "express";
import * as path from "path";
import * as fs from "fs";
import { CosmosClient, type Container } from "@azure/cosmos";
import { z } from "zod";

const cors = corsModule;
const express = expressModule;

const execAsync = promisify(exec);
const PORT = Number(process.env.PORT ?? 5174);
const TEAM_ID = process.env.TEAM_ID ?? "default";

const app = express();
app.use(cors());
app.use(express.json());

const taskCreateSchema = z.object({
  id: z.string().min(1).optional(),
  commessa: z.string().min(1),
  description: z.string().min(1),
  client: z.string().min(1),
  hours: z.number().min(0.5),
  assigneeId: z.string().optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["todo", "in-progress", "done"]).optional()
});

const taskUpdateSchema = taskCreateSchema.partial().extend({
  commessa: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  client: z.string().min(1).optional(),
  hours: z.number().min(0.5).optional()
});

const memberCreateSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  role: z.string().optional(),
  annualTarget: z.number().optional()
});

const memberUpdateSchema = memberCreateSchema.partial().extend({
  name: z.string().min(1).optional()
});

type TaskStatus = "todo" | "in-progress" | "done";

type Task = {
  id: string;
  commessa: string;
  description: string;
  client: string;
  hours: number;
  assigneeId?: string;
  startDate?: string;
  endDate?: string;
  status: TaskStatus;
  teamId: string;
  kind: "task";
};

type Member = {
  id: string;
  name: string;
  role?: string;
  annualTarget?: number;
  teamId: string;
  kind: "member";
};

type Repository = {
  listTasks(): Promise<Task[]>;
  listMembers(): Promise<Member[]>;
  createTask(task: Task): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;
  createMember(member: Member): Promise<Member>;
  updateMember(id: string, updates: Partial<Member>): Promise<Member | null>;
  deleteMember(id: string): Promise<boolean>;
};

function generateId() {
  return randomUUID();
}

async function createCosmosRepository(): Promise<Repository> {
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const databaseName = process.env.COSMOS_DB;
  const containerName = process.env.COSMOS_CONTAINER;

  if (!endpoint || !key || !databaseName || !containerName) {
    throw new Error("Missing Cosmos DB environment variables");
  }

  const client = new CosmosClient({ endpoint, key });
  const { database } = await client.databases.createIfNotExists({ id: databaseName });
  const { container } = await database.containers.createIfNotExists({
    id: containerName,
    partitionKey: { paths: ["/teamId"] }
  });

  const toTask = (item: any) => item as Task;
  const toMember = (item: any) => item as Member;

  const queryByKind = async <T>(kind: "task" | "member", orderBy?: string) => {
    const orderClause = orderBy ? ` ORDER BY c.${orderBy}` : "";
    const query = {
      query: `SELECT * FROM c WHERE c.teamId = @teamId AND c.kind = @kind${orderClause}`,
      parameters: [
        { name: "@teamId", value: TEAM_ID },
        { name: "@kind", value: kind }
      ]
    };

    const { resources } = await container.items.query<T>(query).fetchAll();
    return resources;
  };

  return {
    async listTasks() {
      const items = await queryByKind<Task>("task", "startDate");
      return items.map(toTask);
    },
    async listMembers() {
      const items = await queryByKind<Member>("member");
      return items.map(toMember);
    },
    async createTask(task) {
      const { resource } = await container.items.create(task);
      return resource as Task;
    },
    async updateTask(id, updates) {
      const item = container.item(id, TEAM_ID);
      try {
        const { resource } = await item.read<Task>();
        if (!resource) {
          return null;
        }
        const updated = { ...resource, ...updates };
        const { resource: saved } = await item.replace(updated);
        return saved as Task;
      } catch (error) {
        return null;
      }
    },
    async deleteTask(id) {
      try {
        await container.item(id, TEAM_ID).delete();
        return true;
      } catch (error) {
        return false;
      }
    },
    async createMember(member) {
      const { resource } = await container.items.create(member);
      return resource as Member;
    },
    async updateMember(id, updates) {
      const item = container.item(id, TEAM_ID);
      try {
        const { resource } = await item.read<Member>();
        if (!resource) {
          console.warn(`Member not found: id=${id}, teamId=${TEAM_ID}`);
          return null;
        }
        const updated = { ...resource, ...updates };
        const { resource: saved } = await item.replace(updated);
        return saved as Member;
      } catch (error) {
        console.error(`Error updating member ${id}:`, error);
        return null;
      }
    },
    async deleteMember(id) {
      try {
        await container.item(id, TEAM_ID).delete();
        return true;
      } catch (error) {
        return false;
      }
    }
  };
}

function createMemoryRepository(): Repository {
  const tasks: Task[] = [];
  const members: Member[] = [];

  return {
    async listTasks() {
      return [...tasks].sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    },
    async listMembers() {
      return [...members];
    },
    async createTask(task) {
      tasks.push(task);
      return task;
    },
    async updateTask(id, updates) {
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) {
        return null;
      }
      tasks[index] = { ...tasks[index], ...updates };
      return tasks[index];
    },
    async deleteTask(id) {
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) {
        return false;
      }
      tasks.splice(index, 1);
      return true;
    },
    async createMember(member) {
      members.push(member);
      return member;
    },
    async updateMember(id, updates) {
      const index = members.findIndex((member) => member.id === id);
      if (index === -1) {
        return null;
      }
      members[index] = { ...members[index], ...updates };
      return members[index];
    },
    async deleteMember(id) {
      const index = members.findIndex((member) => member.id === id);
      if (index === -1) {
        return false;
      }
      members.splice(index, 1);
      return true;
    }
  };
}

const repository: Repository = await (async () => {
  try {
    return await createCosmosRepository();
  } catch (error) {
    console.warn("Cosmos DB non configurato, uso memoria locale.");
    return createMemoryRepository();
  }
})();

// Load jobs data at startup
let jobsData: any[] = [];

async function loadJobsData() {
  try {
    console.log("📥 Caricamento dati jobs da Azure...");
    const tempFile = "jobs_temp.json";
    const pythonPath = process.platform === 'win32' 
      ? ".venv\\Scripts\\python.exe"
      : ".venv/bin/python";
    
    const command = `"${pythonPath}" "read_parquet.py" > "${tempFile}" 2>&1`;
    
    await new Promise<void>((resolve, reject) => {
      exec(command, (error) => {
        if (error) {
          console.warn("⚠️ Errore caricamento jobs:", error.message);
          reject(error);
          return;
        }
        resolve();
      });
    });
    
    const jsonData = fs.readFileSync(tempFile, 'utf8');
    jobsData = JSON.parse(jsonData);
    fs.unlinkSync(tempFile);
    console.log(`✓ Caricati ${jobsData.length} job da Azure`);
  } catch (error) {
    console.warn("⚠️ Impossibile caricare jobs da Azure, userò dati di fallback");
    jobsData = [];
  }
}

// Load jobs data on startup  
await loadJobsData();

app.use(express.json());

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

// Simple test for jobs endpoint
app.get("/api/jobs-test", (_, res) => {
  console.log("📍 Test endpoint called");
  res.status(200).json({success: true, data: []});
});

// Endpoint per leggere jobs (dati caricati al startup)
app.get("/api/jobs", (_, res) => {
  console.log(`📊 Returning ${jobsData.length} jobs`);
  res.json(jobsData || []);
});

app.get("/api/members", async (_, res) => {
  const items = await repository.listMembers();
  res.json(items);
});

app.post("/api/members", async (req, res) => {
  const parse = memberCreateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const payload = parse.data;
  const member: Member = {
    id: payload.id ?? generateId(),
    name: payload.name,
    role: payload.role,
    annualTarget: payload.annualTarget,
    teamId: TEAM_ID,
    kind: "member"
  };

  const created = await repository.createMember(member);
  res.json(created);
});

app.get("/api/tasks", async (_, res) => {
  const items = await repository.listTasks();
  res.json(items);
});

app.post("/api/tasks", async (req, res) => {
  const parse = taskCreateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const payload = parse.data;
  const task: Task = {
    id: payload.id ?? generateId(),
    commessa: payload.commessa,
    description: payload.description,
    client: payload.client,
    hours: payload.hours,
    assigneeId: payload.assigneeId ?? undefined,
    startDate: payload.startDate,
    endDate: payload.endDate,
    status: payload.status ?? "todo",
    teamId: TEAM_ID,
    kind: "task"
  };

  const created = await repository.createTask(task);
  res.json(created);
});

app.patch("/api/tasks/:id", async (req, res) => {
  const parse = taskUpdateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const updated = await repository.updateTask(req.params.id, {
    ...parse.data,
    assigneeId: parse.data.assigneeId ?? undefined
  });

  if (!updated) {
    return res.status(404).json({ error: "Task non trovato" });
  }

  res.json(updated);
});

app.delete("/api/tasks/:id", async (req, res) => {
  const ok = await repository.deleteTask(req.params.id);
  res.json({ ok });
});

app.patch("/api/members/:id", async (req, res) => {
  const parse = memberUpdateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  console.log(`PATCH /api/members/:id - id=${req.params.id}, body=${JSON.stringify(parse.data)}`);

  const updated = await repository.updateMember(req.params.id, parse.data);

  if (!updated) {
    console.error(`Member not found during update: ${req.params.id}`);
    return res.status(404).json({ error: "Membro non trovato" });
  }

  res.json(updated);
});

app.delete("/api/members/:id", async (req, res) => {
  const ok = await repository.deleteMember(req.params.id);
  res.json({ ok });
});

// Endpoint per leggere jobs da Azure Blob Storage
app.get("/api/jobs", async (req, res) => {
  console.log("🔄 Richiesta /api/jobs ricevuta");
  res.json([{test: "data"}]);
});

// Add error handlers
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Express error:", err);
  res.status(500).json({ error: "Internal server error" });
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
  process.exit(1);
});

const server = app.listen(PORT, () => {
  console.log(`Server API avviato su http://localhost:${PORT}`);
});

server.on("error", (err) => {
  console.error("Server error:", err);
  process.exit(1);
});
