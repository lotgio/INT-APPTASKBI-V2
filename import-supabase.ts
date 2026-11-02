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
  console.error("VITE_SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
  console.error("VITE_SUPABASE_ANON_KEY:", supabaseAnonKey ? "✓" : "✗");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false
  }
});

async function importData() {
  try {
    // Leggi il file exported-data.json
    const dataPath = path.join(process.cwd(), "exported-data.json");
    if (!fs.existsSync(dataPath)) {
      throw new Error(`File ${dataPath} non trovato!`);
    }

    const rawData = fs.readFileSync(dataPath, "utf-8");
    let { members, tasks } = JSON.parse(rawData);

    console.log("📦 Dati caricati:", {
      members: members.length,
      tasks: tasks.length
    });

    // Import Members - mappa solo i campi validi
    if (members && members.length > 0) {
      console.log(`📤 Importando ${members.length} members...`);
      
      // Mappa i campi ai nomi corretti (esclude annualTarget per ora)
      const mappedMembers = members.map((m: any) => ({
        id: m.id,
        name: m.name,
        email: m.email || null,
        role: m.role || null,
        avatar: m.avatar || null
      }));

      const { error: membersError } = await supabase
        .from("members")
        .insert(mappedMembers);

      if (membersError) {
        throw new Error(`Errore import members: ${membersError.message}`);
      }
      console.log("✅ Members importati!");
    }

    // Import Tasks - mappa solo i campi validi
    if (tasks && tasks.length > 0) {
      console.log(`📤 Importando ${tasks.length} tasks...`);
      
      // Mappa i campi ai nomi corretti (esclude assigneeId per ora)
      const mappedTasks = tasks.map((t: any) => ({
        id: t.id,
        commessa: t.commessa,
        description: t.description || null,
        client: t.client || null,
        hours: t.hours || null,
        status: t.status || "pending",
        startDate: t.startDate || null,
        endDate: t.endDate || null,
        teamId: t.teamId || "default",
        createdAt: t.createdAt || new Date().toISOString()
      }));

      const { error: tasksError } = await supabase
        .from("tasks")
        .insert(mappedTasks);

      if (tasksError) {
        throw new Error(`Errore import tasks: ${tasksError.message}`);
      }
      console.log("✅ Tasks importati!");
    }

    console.log("\n✨ Import completato!");
    console.log(`✓ ${members.length} members`);
    console.log(`✓ ${tasks.length} tasks`);
    console.log("\n🎉 Accedi a https://app.supabase.com per verificare i dati!");

  } catch (err) {
    console.error("❌ Errore durante import:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

importData();
