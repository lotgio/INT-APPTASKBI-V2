import "dotenv/config";
import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseName = process.env.COSMOS_DB;
const containerName = process.env.COSMOS_CONTAINER;
const teamId = process.env.TEAM_ID ?? "default";

if (!endpoint || !key || !databaseName || !containerName) {
  console.error("Configura le variabili COSMOS_* per eseguire il seed.");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key });
const { database } = await client.databases.createIfNotExists({ id: databaseName });
const { container } = await database.containers.createIfNotExists({
  id: containerName,
  partitionKey: { paths: ["/teamId"] }
});

const members = [
  { id: "mario", name: "Mario Rossi", role: "Caposquadra" },
  { id: "luca", name: "Luca Bianchi", role: "Tecnico" },
  { id: "giulia", name: "Giulia Verdi", role: "Tecnico" }
];

const tasks = [
  {
    id: "task-001",
    commessa: "2026-001",
    description: "Verifica materiali in magazzino",
    client: "Acme Corp",
    hours: 4,
    status: "todo",
    assigneeId: "mario"
  },
  {
    id: "task-002",
    commessa: "2026-002",
    description: "Pianifica intervento cliente",
    client: "Beta Industries",
    hours: 6,
    status: "in-progress",
    assigneeId: "luca"
  }
];

for (const member of members) {
  await container.items.upsert({
    ...member,
    teamId,
    kind: "member"
  });
}

for (const task of tasks) {
  await container.items.upsert({
    ...task,
    teamId,
    kind: "task"
  });
}

console.log("Seed completato.");
