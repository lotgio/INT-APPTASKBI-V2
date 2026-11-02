import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Parse JSON bodies
app.use(express.json());

// Serve static files from dist
app.use(express.static(join(__dirname, "dist")));

// Proxy API requests to backend
app.use("/api", async (req, res) => {
  try {
    let body: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      body = JSON.stringify(req.body);
    }
    
    const response = await fetch(`http://localhost:5174${req.originalUrl}`, {
      method: req.method,
      headers: {
        "content-type": "application/json"
      },
      body
    });
    
    const data = await response.text();
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.set(key, value);
    });
    res.send(data);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Errore proxy" });
  }
});

// SPA fallback
app.get("*", (_, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

const PORT = 5173;
app.listen(PORT, () => {
  console.log(`Frontend server su http://localhost:${PORT}`);
});
