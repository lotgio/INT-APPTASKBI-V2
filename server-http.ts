import * as http from "http";

const server = http.createServer((req, res) => {
  console.log(`Request: ${req.method} ${req.url}`);
  
  if (req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(5174, "127.0.0.1", () => {
  console.log("HTTP server started on http://127.0.0.1:5174");
});

server.on("error", (err) => {
  console.error("Server error:", err);
});
