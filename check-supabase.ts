import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://teadzgcurjjdbuoohakr.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlYWR6Z2N1cmpqZGJ1b29oYWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NTk4MDgsImV4cCI6MjA4ODAzNTgwOH0.PqyePbd6FISVUmAi4If41BCM_QpTpCr-7HkhENnE7IE";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkData() {
  console.log("🔍 Controllo dati su Supabase...\n");
  
  // Check members
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("*");
  
  if (membersError) {
    console.error("❌ Errore members:", membersError.message);
  } else {
    console.log(`✅ Members trovati: ${members?.length || 0}`);
    if (members && members.length > 0) {
      console.log("   Primi 3:", members.slice(0, 3).map((m: any) => m.name).join(", "));
    }
  }
  
  // Check tasks
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*");
  
  if (tasksError) {
    console.error("❌ Errore tasks:", tasksError.message);
  } else {
    console.log(`✅ Tasks trovati: ${tasks?.length || 0}`);
    if (tasks && tasks.length > 0) {
      console.log("   Primi 3:", tasks.slice(0, 3).map((t: any) => t.description?.substring(0, 40)).join(", "));
    }
  }
  
  // Check todos
  const { data: todos, error: todosError } = await supabase
    .from("todos")
    .select("*");
  
  if (todosError) {
    console.error("❌ Errore todos:", todosError.message);
  } else {
    console.log(`✅ Todos trovati: ${todos?.length || 0}`);
  }
}

checkData().catch(console.error);
