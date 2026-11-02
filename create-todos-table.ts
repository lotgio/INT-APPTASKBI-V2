import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://teadzgcurjjdbuoohakr.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlYWR6Z2N1cmpqZGJ1b29oYWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NTk4MDgsImV4cCI6MjA4ODAzNTgwOH0.PqyePbd6FISVUmAi4If41BCM_QpTpCr-7HkhENnE7IE";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createTodosTable() {
  console.log("🔧 Creazione tabella todos e fix RLS...\n");
  
  // Crea la tabella todos
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS todos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      client TEXT,
      commessa TEXT,
      businessunit TEXT,
      resourceid UUID,
      completed BOOLEAN DEFAULT FALSE,
      createdat TIMESTAMP DEFAULT NOW(),
      duedate TEXT
    );
  `;
  
  const enableRLSSQL = `ALTER TABLE todos ENABLE ROW LEVEL SECURITY;`;
  
  const createPoliciesSQL = `
    DROP POLICY IF EXISTS "Enable read access for all users" ON todos;
    DROP POLICY IF EXISTS "Enable insert for all users" ON todos;
    DROP POLICY IF EXISTS "Enable update for all users" ON todos;
    DROP POLICY IF EXISTS "Enable delete for all users" ON todos;
    
    CREATE POLICY "Enable read access for all users" ON todos FOR SELECT USING (true);
    CREATE POLICY "Enable insert for all users" ON todos FOR INSERT WITH CHECK (true);
    CREATE POLICY "Enable update for all users" ON todos FOR UPDATE USING (true);
    CREATE POLICY "Enable delete for all users" ON todos FOR DELETE USING (true);
  `;
  
  try {
    console.log("📝 Esegui questi comandi nel SQL Editor di Supabase:\n");
    console.log("https://app.supabase.com/project/teadzgcurjjdbuoohakr/sql/new\n");
    console.log("===== COPIA E INCOLLA QUESTO SQL =====\n");
    console.log(createTableSQL);
    console.log(enableRLSSQL);
    console.log(createPoliciesSQL);
    console.log("\n=====================================\n");
    
    // Prova a leggere i dati
    console.log("🔍 Test lettura dati...\n");
    
    const { data: members, error: membersError } = await supabase
      .from("members")
      .select("*");
    
    if (membersError) {
      console.error("❌ Errore members:", membersError.message);
      console.error("   Dettagli:", membersError);
    } else {
      console.log(`✅ Members: ${members?.length || 0}`);
    }
    
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("*")
      .limit(5);
    
    if (tasksError) {
      console.error("❌ Errore tasks:", tasksError.message);
      console.error("   Dettagli:", tasksError);
    } else {
      console.log(`✅ Tasks: ${tasks?.length || 0}`);
    }
    
  } catch (err) {
    console.error("❌ Errore:", err);
  }
}

createTodosTable();
