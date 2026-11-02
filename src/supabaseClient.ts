import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://teadzgcurjjdbuoohakr.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlYWR6Z2N1cmpqZGJ1b29oYWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NTk4MDgsImV4cCI6MjA4ODAzNTgwOH0.PqyePbd6FISVUmAi4If41BCM_QpTpCr-7HkhENnE7IE";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();

// Se mancano le credenziali, crea un client vuoto (fallback a localStorage)
let supabase: ReturnType<typeof createClient> | null = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
  console.log("✅ Supabase configurato:", supabaseUrl);
} else {
  console.warn("⚠️ Supabase non configurato - usando fallback localStorage");
}

export { supabase };
