import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Variabili d'ambiente mancanti!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

async function reimportFullData() {
  try {
    const dataPath = path.join(process.cwd(), "exported-data.json");
    const rawData = fs.readFileSync(dataPath, "utf-8");
    const { members, tasks } = JSON.parse(rawData);

    console.log("📦 Dati caricati:", { members: members.length, tasks: tasks.length });

    // 1. Cancella dati esistenti
    console.log("🗑️ Pulizia dati esistenti...");
    await supabase.from("tasks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("members").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 2. Re-importa members con annualTarget
    console.log(`📤 Importando ${members.length} members...`);
    const mappedMembers = members.map((m: any) => ({
      id: m.id,
      name: m.name,
      email: m.email || null,
      role: m.role || null,
      avatar: m.avatar || null,
      annualtarget: m.annualTarget || null
    }));
    const { error: membersError } = await supabase.from("members").insert(mappedMembers);
    if (membersError) throw new Error(`Errore members: ${membersError.message}`);
    console.log("✅ Members importati con annualTarget!");

    // 3. Re-importa tasks con TUTTI i campi
    console.log(`📤 Importando ${tasks.length} tasks...`);
    const mappedTasks = tasks.map((t: any) => ({
      id: t.id,
      commessa: t.commessa,
      description: t.description || null,
      client: t.client || null,
      hours: t.hours || null,
      assigneeid: t.assigneeId || null,
      status: t.status || "pending",
      startdate: t.startDate || null,
      enddate: t.endDate || null,
      teamid: t.teamId || "default",
      createdat: t.createdAt || new Date().toISOString()
    }));
    const { error: tasksError } = await supabase.from("tasks").insert(mappedTasks);
    if (tasksError) throw new Error(`Errore tasks: ${tasksError.message}`);
    console.log("✅ Tasks importati con assigneeId!");

    console.log("\n✨ Re-import completato!");
    console.log(`✓ ${members.length} members (con annualTarget)`);
    console.log(`✓ ${tasks.length} tasks (con assigneeId e hours)`);

  } catch (err) {
    console.error("❌ Errore:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

reimportFullData();
