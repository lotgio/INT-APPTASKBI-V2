// Pubblica la v2 su https://lotgio.github.io/INT-APPTASKBI-V2/
// L'app attuale (https://lotgio.github.io/INT-APPTASKBI/) non viene toccata.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import ghpages from "gh-pages";

export const V2_CONFIG = {
  VITE_BASE: "/INT-APPTASKBI-V2/",
  // Commesse e risorse arrivano dal sito attuale, aggiornato 3 volte al giorno dal suo workflow
  VITE_JOBS_URL: "https://lotgio.github.io/INT-APPTASKBI/jobs.json",
  VITE_RESOURCES_URL: "https://lotgio.github.io/INT-APPTASKBI/resources.json",
  VITE_ALLOW_STATIC_JOBS_FALLBACK: "true",
  // Stesso database Supabase dell'app attuale: task, ferie, team e note sono condivisi
  VITE_SUPABASE_URL: "https://teadzgcurjjdbuoohakr.supabase.co",
  VITE_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlYWR6Z2N1cmpqZGJ1b29oYWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NTk4MDgsImV4cCI6MjA4ODAzNTgwOH0.PqyePbd6FISVUmAi4If41BCM_QpTpCr-7HkhENnE7IE"
};
const REPO = "https://github.com/lotgio/INT-APPTASKBI-V2.git";

console.log("▶ Build della v2…");
execSync("npm run build", { stdio: "inherit", env: { ...process.env, ...V2_CONFIG } });

// Vite copia la cartella public: lo snapshot locale non va pubblicato (si usa quello del sito attuale)
for (const f of ["dist/jobs.json", "dist/resources.json"]) rmSync(f, { force: true });

console.log(`▶ Pubblicazione su ${REPO} (branch gh-pages)…`);
await ghpages.publish("dist", { repo: REPO, branch: "gh-pages", dotfiles: true, message: "Deploy v2" });
console.log("✔ Pubblicata: https://lotgio.github.io/INT-APPTASKBI-V2/");
