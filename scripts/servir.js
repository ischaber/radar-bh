// Servidor local só para ver o site: node scripts/servir.js  ->  http://localhost:8080
const http = require("http");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..", "site");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const PORTA = Number(process.env.PORT || 8080);

http
  .createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const arq = path.join(RAIZ, rel);
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) {
      res.writeHead(404).end("não encontrado");
      return;
    }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  })
  .listen(PORTA, () => console.log(`Radar BH em http://localhost:${PORTA}`));
