// Regenerates docs/screens (phone 390×844 and desktop 1280×800). Run: node tests/screens.js
// Starts its own server on a free port; uses a sample profile (halal, no peanuts or prawn & crab).
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0].split("#")[0]).replace(/^\/+/, "") || "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const OUT = path.join(ROOT, "docs/screens");
  fs.readdirSync(OUT).forEach(f => fs.unlinkSync(path.join(OUT, f)));
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const prof = JSON.stringify({ budget: 120, kitchen: "shared", goal: "money", diet: { halal: true, allergies: ["peanut", "crustacean"] }, campusLunch: false, breakfast: true, cooks: 6 });
  for (const [w, h, tag] of [[390, 844, "phone"], [1280, 800, "desktop"]]) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto(BASE + "app.html");
    await p.evaluate(pr => { localStorage.setItem("eft2-profile", pr); localStorage.setItem("ma-picks", JSON.stringify({ guideDone: true })); }, prof);
    for (const [r, n] of [["home", "home"], ["pick?slot=D", "pick"], ["learn", "learn"], ["swaps", "swaps"], ["pairs?f=myth", "myth"], ["goal?id=eyes", "goal"], ["plan", "plan"]]) {
      await p.goto(BASE + "app.html#" + r); await p.reload(); await p.waitForTimeout(400);
      await p.screenshot({ path: path.join(OUT, `${tag}_${n}.png`) });
    }
    await p.goto(BASE + "app.html#friends?slot=D"); await p.reload(); await p.waitForSelector("#fr-form");
    await p.click("#fr-form button[type=submit]"); await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, `${tag}_friends.png`) });
    await p.goto(BASE + "index.html"); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, `${tag}_landing.png`) });
    await p.close();
  }
  await browser.close();
  server.close();
  console.log("docs/screens updated");
})();
