import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE || "/INT-APPTASKBI-V2/";

  return {
    base,
    plugins: [react()],
    server: {
      port: 5173
      // Proxy disabled to avoid Node.js crashes
    },
    preview: {
      port: 5173
    }
  };
});
