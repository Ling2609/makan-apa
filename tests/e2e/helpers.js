// Shared helpers for the end-to-end tests (Playwright + axe-core).
// Each test file starts its own static server and browser, so files run in parallel.
// Set CHROMIUM_PATH to use an existing Chromium binary; set SHOTS_DIR to save screenshots.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".json": "application/json", ".gz": "application/gzip", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".txt": "text/plain"
};
const WIDTHS = [360, 390, 768, 1024, 1440];
const SHOTS = process.env.SHOTS_DIR || null;
const STORE_KEYS = ["eft2-profile", "eft2-sim", "eft2-report", "eft2-plan", "eft2-checkin", "eft2-prices", "eft2-have", "eft2-ifthen",
  "eft2-history", "eft2-spend", "eft2-stalls", "eft2-class", "eft2-classref", "eft2-receipt-draft", "theme"];

function startServer() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0].split("#")[0]).replace(/^\/+/, "") || "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function setup(test) {
  const env = { base: "", browser: null, server: null };
  test.before(async () => {
    env.server = await startServer();
    env.base = `http://127.0.0.1:${env.server.address().port}`;
    env.browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  });
  test.after(async () => { if (env.browser) await env.browser.close(); if (env.server) env.server.close(); });
  env.url = p => env.base + "/" + p;
  // storage: values written to localStorage once, before the first page script runs
  env.newPage = async ({ width = 390, height = 844, colorScheme = "light", storage = {} } = {}) => {
    const ctx = await env.browser.newContext({ viewport: { width, height }, acceptDownloads: true, colorScheme, serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message + (process.env.STACKS ? "\n" + e.stack : "")));
    page.on("console", m => { if (m.type() === "error" && !/ERR_|net::/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(values => {
      try {
        if (!sessionStorage.getItem("__init")) {
          Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v));
          sessionStorage.setItem("__init", "1");
        }
      } catch (e) { /* storage blocked */ }
    }, { "ma-tour-v1": JSON.stringify({ completed: true, setupAcknowledged: true, step: 0 }), ...storage });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); // no third-party requests
    return { page, ctx, errors };
  };
  return env;
}

async function snapshotStorage(page) {
  return page.evaluate(keys => Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]).filter(([, v]) => v !== null)), STORE_KEYS);
}

// The app ignores input for 350 ms after each screen change (double-tap guard)
const settle = page => page.waitForTimeout(400);

async function axeCheck(page, label) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter(v => ["serious", "critical"].includes(v.impact));
  assert.deepEqual(serious.map(v => `${label}: ${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(", ")}`), []);
}

async function layoutProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const vw = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth - vw;
    if (scroll > 1) out.push(`page scrolls sideways by ${scroll}px`);
    const visible = el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && !el.closest("[hidden], .sr-only, dialog:not([open])");
    };
    const name = el => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30)}"`;
    const scrollers = el => el.closest(".sofar-scroll, .plan-grid-wrap, .wrapped");
    document.querySelectorAll("button, a, input, select, h1, h2, h3, p, label").forEach(el => {
      if (!visible(el) || scrollers(el)) return;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) out.push(`clipped: ${name(el)} (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
    });
    document.querySelectorAll("button, a, select, summary, input:not([type=radio]):not([type=checkbox]):not([type=range])").forEach(el => {
      if (!visible(el)) return;
      if (el.tagName === "A" && getComputedStyle(el).display === "inline") return; // links inside sentences (WCAG 2.5.8 exception)
      const target = el.tagName === "INPUT" && el.closest("label") ? el.closest("label") : el; // the whole label is the tap target
      const r = target.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) out.push(`small target: ${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    // checkboxes/radios must sit inside a label that is at least 44px tall
    document.querySelectorAll("input[type=checkbox], input[type=radio]").forEach(el => {
      const lab = el.closest("label") || (el.id && document.querySelector(`label[for="${el.id}"]`));
      if (!lab || !visible(lab)) return;
      const r = lab.getBoundingClientRect();
      if (r.height < 43.5) out.push(`small target: label for ${el.name || el.id} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    // Cells and prices must fit their box (no text spilling out of a table cell or price column)
    document.querySelectorAll("td, th, .cmp-v, .cmp-name, .opt-price, .t-value, .pg-price, .tick-cost, .pick-price, .mw-rm, .d, .w-big, .preview-list dd, .kv dd, .hud-item").forEach(el => {
      if (!visible(el) || scrollers(el) && !el.closest(".wrapped")) return;
      if (getComputedStyle(el).display === "inline") return;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`overflowing: ${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    });
    // Typed amounts and dates must fit their input (no "RM 1,23" with the rest scrolled out of sight)
    document.querySelectorAll("input[type=number], input[type=date], .money-input input").forEach(el => {
      if (!visible(el) || !el.value) return;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`input text overflows: ${name(el)} "${el.value}" ${el.scrollWidth}>${el.clientWidth}`);
    });
    return [...new Set(out)];
  });
}

async function checkScreen(page, label) {
  await page.waitForTimeout(250);
  assert.deepEqual(await layoutProblems(page), [], label);
  await axeCheck(page, label);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, label.replace(/[^a-z0-9]+/gi, "_") + ".png") });
}

// Walk the four-step setup wizard (food rules → allergies → kitchen → budget)
const SETUP_STEPS = ["rules", "allergies", "kitchen", "budget"];
async function finishSetup(page, { kitchen = null, budget = null, allergies = [] } = {}) {
  await page.waitForSelector("#setup-form");
  for (let step = 0; step < SETUP_STEPS.length; step++) {
    const id = await page.getAttribute("#setup-form", "data-step");
    if (id === "budget" && budget) await page.fill("#su-budget", String(budget));
    if (id === "kitchen" && kitchen) await page.locator(`#setup-form input[name=su-kitchen][value=${kitchen}]`).check({ force: true });
    if (id === "allergies") for (const a of allergies) await page.locator(`#setup-form input.allergy[value=${a}]`).check({ force: true });
    await settle(page);
    await page.click("#setup-form button[type=submit]");
    if (step < SETUP_STEPS.length - 1) await page.waitForFunction(prev => { const f = document.getElementById("setup-form"); return f && f.dataset.step !== prev; }, id);
  }
}

// Onboarding with the defaults (or a few changes), then the calibration
async function onboard(page, { kitchen = null, budget = null, skipGuesses = false } = {}) {
  await finishSetup(page, { kitchen, budget });
  await page.waitForSelector("#calib-form");
  await settle(page);
  if (skipGuesses) await page.click("#calib-skip");
  else {
    await page.locator("#calib-form input[name=q1]").first().check({ force: true });
    await page.click("#calib-form button[type=submit]");
  }
  await page.waitForSelector("button.option");
}

// Opens the plan's "More" menu if it's closed
async function openMore(page) {
  if (!(await page.locator(".more[open]").count())) await page.click(".more > summary");
}

// Play one decision: choose(index among enabled options) → result → next
async function decide(page, choose = 0) {
  await settle(page);
  const enabled = page.locator("button.option:not([disabled]):not([aria-disabled=true])");
  const n = await enabled.count();
  await enabled.nth(Math.min(choose, n - 1)).click();
  await page.waitForSelector("#next-btn");
  await settle(page);
  await page.click("#next-btn");
}

async function playWeek(page, strategy = i => i % 3) {
  let i = 0;
  while (await page.locator("button.option").count()) {
    await decide(page, strategy(i));
    await page.waitForTimeout(50);
    if (++i > 30) throw new Error("week did not end");
  }
  await page.waitForSelector("#share-btn");
  return i;
}

module.exports = { SETUP_STEPS, ROOT, WIDTHS, STORE_KEYS, setup, snapshotStorage, settle, axeCheck, layoutProblems, checkScreen, finishSetup, onboard, openMore, decide, playWeek };
