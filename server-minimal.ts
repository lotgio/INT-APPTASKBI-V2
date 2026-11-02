import "dotenv/config";
import express from "express";

const app = express();
const PORT = 5174;

app.get("/api/health", (req, res) => {
  console.log("✓ Health check request received");
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Minimal server started on http://localhost:${PORT}`);
});
