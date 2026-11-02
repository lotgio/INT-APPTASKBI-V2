import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { CosmosClient } from "@azure/cosmos";

dotenv.config();

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DB || "apptask";
const containerId = process.env.COSMOS_CONTAINER || "items";
const teamId = process.env.TEAM_ID || "default";

if (!endpoint || !key) {
  console.error("❌ COSMOS_ENDPOINT e COSMOS_KEY devono essere definite nel file .env");
  process.exit(1);
}

interface ImportData {
  members: any[];
  tasks: any[];
}

async function importData() {
  console.log("\n=== Importazione dati in Cosmos DB ===\n");

  const dataFilePath = path.join(__dirname, "exported-data.json");
  
  if (!fs.existsSync(dataFilePath)) {
    console.error(`❌ File ${dataFilePath} non trovato!`);
    console.log("\n📋 Istruzioni:");
    console.log("1. Apri export-local-data.html nel browser");
    console.log("2. Clicca 'Esporta dati'");
    console.log("3. Copia il JSON");
    console.log("4. Salvalo come exported-data.json nella root del progetto");
    process.exit(1);
  }

  const rawData = fs.readFileSync(dataFilePath, "utf-8");
  const data: ImportData = JSON.parse(rawData);

  console.log(`📊 Dati da importare:`);
  console.log(`   - ${data.members.length} membri`);
  console.log(`   - ${data.tasks.length} task\n`);

  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseId);
  const container = database.container(containerId);

  console.log("📤 Importazione membri...");
  for (const member of data.members) {
    const item = {
      ...member,
      teamId,
      partitionKey: member.id,
      type: "member"
    };
    await container.items.upsert(item);
    console.log(`   ✓ ${member.name}`);
  }

  console.log("\n📤 Importazione task...");
  for (const task of data.tasks) {
    const item = {
      ...task,
      teamId,
      partitionKey: task.id,
      type: "task"
    };
    await container.items.upsert(item);
    console.log(`   ✓ ${task.description.substring(0, 50)}...`);
  }

  console.log("\n✅ Importazione completata!");
  console.log(`\n📊 Riepilogo:`);
  console.log(`   Database: ${databaseId}`);
  console.log(`   Container: ${containerId}`);
  console.log(`   Team ID: ${teamId}`);
}

importData().catch((err) => {
  console.error("\n❌ Errore durante l'importazione:", err);
  process.exit(1);
});
