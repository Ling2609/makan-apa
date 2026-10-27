// Tiny local web server: npm run serve → http://localhost:8080
// (Needed for offline mode / install as an app; opening the HTML files directly also works, minus offline.)
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".json": "application/json", ".gz": "application/gzip", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".txt": "text/plain" };
http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(req.url.split("?")[0].split("#")[0]).replace(/^\/+/, "") || "index.html"; }
  catch { res.writeHead(400); res.end("Bad request"); return; }
  const file = path.resolve(ROOT, rel);
  const inside = path.relative(ROOT, file);
  if (inside.startsWith("..") || path.isAbsolute(inside) || inside.split(path.sep).some(part => part.startsWith(".")) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Makan Apa?: http://localhost:${PORT}`)); // eslint-disable-line no-console
