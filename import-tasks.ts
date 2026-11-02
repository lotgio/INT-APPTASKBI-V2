import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Carica il file .env
dotenv.config();

// Carica le variabili d'ambiente
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Variabili d'ambiente mancanti! Controlla .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false
  }
});

async function importTasks() {
  try {
    const dataPath = path.join(process.cwd(), "exported-data.json");
    if (!fs.existsSync(dataPath)) {
      throw new Error(`File ${dataPath} non trovato!`);
    }

    const rawData = fs.readFileSync(dataPath, "utf-8");
    const { tasks } = JSON.parse(rawData);

    if (tasks && tasks.length > 0) {
      console.log(`📤 Importando ${tasks.length} tasks...`);
      
      const mappedTasks = tasks.map((t: any) => ({
        id: t.id,
        commessa: t.commessa,
        description: t.description || null,
        client: t.client || null,
        status: t.status || "pending"
      }));

      const { error: tasksError } = await supabase
        .from("tasks")
        .insert(mappedTasks);

      if (tasksError) {
        throw new Error(`Errore import tasks: ${tasksError.message}`);
      }
      console.log("✅ Tasks importati!");
      console.log(`✓ ${tasks.length} tasks caricati su Supabase`);
    }

  } catch (err) {
    console.error("❌ Errore:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

importTasks();
