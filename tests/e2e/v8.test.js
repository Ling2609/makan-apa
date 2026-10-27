// v8 in the browser: the Round B regressions that need a page. The service-worker test runs with
// service workers ENABLED (the other suites block them) against its own server, which can publish
// a "new version" of sw.js mid-test to drive the update banner.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const { ROOT, WIDTHS, setup, settle, checkScreen, finishSetup, layoutProblems } = require("./helpers");
const CC = require("../../js/classcode.js");
const SL = require("../../js/stalls.js");

const env = setup(test);
const profile = over => JSON.stringify({ budget: 120, kitchen: "shared", goal: "money", diet: { halal: true, vegetarian: false }, campusLunch: true, breakfast: true, cooks: 6, rahmah: false, preset: "normal", ...over });
const dayKey = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ddmmyyyy = n => { const [y, m, d] = dayKey(n).split("-"); return `${d}/${m}/${y}`; };

async function startPlanToday(page) {
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#plan-start");
  await settle(page);
  await page.click("#plan-start");
  await page.waitForSelector("#start-form");
  await page.click("#start-form button[type=submit]");
  await page.waitForSelector(".check-card");
}
async function pasteReceipt(page, text) {
  await page.goto(env.url("app.html#receipt"));
  await page.waitForSelector("#rc-text");
  await page.fill("#rc-text", text);
  await settle(page);
  await page.click("#rc-text-form button[type=submit]");
  await page.waitForSelector("#rc-form");
}
const realTotal = async page => {
  await page.goto(env.url("app.html#realweek"));
  await page.waitForSelector(".rw-head");
  const t = await page.locator(".rw-totals .t-value").first().textContent().catch(() => "RM 0.00");
  return t.trim();
};

// ---------- B8: service workers enabled ----------
test("B8: with service workers on, the first visit never reloads; a new version shows the banner and reloads once", { timeout: 90000 }, async () => {
  let version = "makan-v10";
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png" }[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    if (rel === "sw.js") { res.end(fs.readFileSync(file, "utf8").replace(/const CACHE = "makan-v\d+"/, `const CACHE = "${version}"`)); return; }
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    let loads = 0;
    page.on("load", () => { loads++; });
    await page.addInitScript(p => { if (!sessionStorage.getItem("__p")) { localStorage.setItem("eft2-profile", p); localStorage.setItem("ma-tour-v1", JSON.stringify({completed:true, setupAcknowledged:true, step:0})); sessionStorage.setItem("__p", "1"); } }, profile({}));
    await page.goto(base + "/app.html#plan");
    await page.waitForSelector("#plan-start");
    await page.evaluate(() => { window.__sameDocument = true; document.getElementById("plan-start").dataset.typed = "kept"; });
    // the worker installs, skips waiting and claims this page (controllerchange fires)
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    assert.equal(loads, 1, "no reload on the first visit");
    assert.equal(await page.evaluate(() => window.__sameDocument === true), true, "the page the student was using is still there");
    assert.equal(await page.locator("#update-banner").count(), 0, "nothing to update on a first visit");
    // works offline once installed
    await ctx.setOffline(true);
    await page.goto(base + "/app.html#tools");
    await page.waitForSelector(".tool-list");
    await ctx.setOffline(false);
    loads = 0;
    await page.evaluate(() => { window.__sameDocument = true; });
    // a new version is published: it installs in the background and waits; the banner offers it
    version = "makan-v10-next";
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await page.waitForSelector("#update-banner", { timeout: 30000 });
    assert.equal(loads, 0, "nobody is moved mid-task");
    await checkScreenSafe(page);
    await page.click("#update-banner .btn:not(.btn-quiet)");
    await page.waitForFunction(() => !window.__sameDocument, null, { timeout: 30000 });
    await page.waitForSelector(".tool-list");
    assert.equal(loads, 1, "one reload onto the new version, no loop");
    assert.equal(await page.locator("#update-banner").count(), 0);
    const cache = await page.evaluate(() => caches.keys());
    assert.ok(cache.includes("makan-v10-next"), "the new version's cache is in use");
    assert.ok(!cache.includes("makan-v10"), "the old version's cache is cleared");
    // "Later" leaves the page alone
    version = "makan-v10-third";
    await page.evaluate(() => { window.__sameDocument = true; return navigator.serviceWorker.getRegistration().then(r => r.update()); });
    await page.waitForSelector("#update-banner", { timeout: 30000 });
    await page.click("#update-banner .btn-quiet");
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.__sameDocument === true), true);
    assert.equal(await page.locator("#update-banner").count(), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  async function checkScreenSafe(page) { assert.deepEqual((await layoutProblems(page)).filter(p => /update-banner|Reload now|Later/.test(p)), []); }
});

// ---------- B4: deep links survive setup; stall and class links need no setup ----------
test("B4: a link opened before setup carries on after it; stall imports and lecturer views open straight away", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390 });
  await page.goto(env.url("app.html#realweek"));
  await page.waitForSelector("#setup-form");
  for (const step of ["allergies", "kitchen", "budget"]) { await settle(page); await page.click("#setup-form button[type=submit]"); await page.waitForSelector(`#setup-form[data-step=${step}]`); }
  assert.match(await page.textContent("#setup-form button[type=submit]"), /See my real week/, "the button says where it goes");
  await settle(page);
  await page.click("#setup-form button[type=submit]");
  await page.waitForSelector(".rw-head");
  assert.equal(await page.evaluate(() => location.hash), "#realweek");
  await ctx.close();

  // a friend's stall list, opened on a phone that has never used the app
  const code = SL.encodeStalls([{ id: "kafe12ab", name: "Kafe Kolej 12", area: "UM", items: [{ name: "Nasi lemak", rm: 6, date: dayKey(-1) }] }]);
  const [body, chk] = code.split(".");
  const s2 = await env.newPage({ width: 390 });
  await s2.page.goto(env.url(`app.html#stalls?import=${body}&c=${chk}`));
  await s2.page.waitForSelector("#import-yes");
  assert.equal(await s2.page.locator("#setup-form").count(), 0, "no setup in the way");
  await settle(s2.page);
  await s2.page.click("#import-yes");
  await s2.page.waitForSelector(".stall-card");
  assert.match(await s2.page.textContent(".stall-card"), /Kafe Kolej 12/);
  // a student's code opened by a lecturer with no setup
  const sc = CC.encodeStudent(CC.studentValues({ report: { spent: 100, budget: 120, co2: 10, fvDaysMet: 3, archetypeId: "hawk" }, budget: 120 }, () => 0.2), "");
  await s2.page.goto(env.url(`app.html#class?code=${sc}`));
  await s2.page.waitForSelector("#add-one");
  await settle(s2.page);
  await s2.page.click("#add-one");
  await s2.page.waitForSelector(".class-picture");
  await checkScreen(s2.page, "v8 lecturer without setup 390");
  // the setup-only routes still ask first, and keep the query
  await s2.page.goto(env.url("app.html#today"));
  await s2.page.waitForSelector("#setup-form");
  assert.deepEqual([...errors, ...s2.errors], []);
  await s2.ctx.close();
});

// ---------- B1, B3, B9, B14, B16: receipts and the check-in ----------
test("B3 + B9 + B14 + B16: a two-line meal links once, a far-off total asks first, re-ticking never double counts, delete clears it", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({}) } });
  await startPlanToday(page);
  await pasteReceipt(page, `KEDAI KOPI SRI MAJU\nDate: ${ddmmyyyy(0)}\nNASI LEMAK AYAM 8.50\nTEH TARIK 2.80\nTOTAL 20.00`);
  assert.match(await page.textContent("label[for=rl-slot-0]"), /today's check-in/);
  const slot = await page.locator("#rl-slot-0 option").nth(1).getAttribute("value");
  await page.selectOption("#rl-slot-0", slot);
  await page.selectOption("#rl-slot-1", slot);
  await page.click("#rc-form button[type=submit]");
  // 20.00 against 11.30 of lines: asked, in the page, before anything is saved
  await page.waitForSelector("#rc-total-check");
  assert.equal(await page.evaluate(() => localStorage.getItem("eft2-spend")), null, "nothing saved yet");
  await page.evaluate(() => window.scrollTo(0, 0)); // the sticky header over a scrolled-past select is not a real overlap
  await checkScreen(page, "v8 total check 390");
  await page.click("#rc-total-check [data-lines]");
  await page.waitForSelector(".rw-totals");
  const spend = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-spend")));
  assert.equal(spend[0].total, 11.3);
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-checkin")));
  assert.deepEqual(log.days["0"][slot], { status: "other", rm: 11.3, label: "Nasi Lemak Ayam + Teh Tarik", src: "receipt", rids: [{ id: spend[0].id, rm: 11.3, label: "Nasi Lemak Ayam + Teh Tarik" }] }, "both lines, one entry");
  assert.equal(await realTotal(page), "RM 11.30");
  // the Tools hub shows the same week and total as My real week
  await page.goto(env.url("app.html#tools"));
  await page.waitForSelector(".tool-list");
  assert.match(await page.textContent("a[href='#realweek']"), /RM 11\.30 so far in your plan's week/);
  // re-tick the linked meal as "Ate this": asked first, and still counted once
  await page.goto(env.url("app.html#today"));
  await page.waitForSelector(".check-card");
  assert.match(await page.textContent(".check-card .cc-other"), /from a receipt/);
  await settle(page);
  await page.click(`.seg[data-slot=${slot}][data-status=planned]`);
  await page.waitForSelector(".check-card .confirm");
  await page.evaluate(() => window.scrollTo(0, 0));
  await checkScreen(page, "v8 linked meal confirm 390");
  await page.click(".check-card .confirm [data-yes]");
  await page.waitForFunction(s => JSON.parse(localStorage.getItem("eft2-checkin")).days["0"][s].status === "planned", slot);
  // (v9) "Change it anyway" takes the receipt off the meal: the receipt still counts once, as its own spend,
  // and the meal counts as ticked, at the price it had when ticked (a home meal adds nothing: it's groceries)
  const ticked = await page.evaluate(s => { const e = JSON.parse(localStorage.getItem("eft2-checkin")).days["0"][s]; const m = mealById(JSON.parse(localStorage.getItem("eft2-plan")).plan[0][s]); return m.source === "buy" ? e.rm : 0; }, slot);
  assert.ok(!(await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-spend"))[0].items.some(i => i.slot))), "the receipt lines no longer stand for the meal");
  const expected = `RM ${(11.3 + ticked).toFixed(2)}`;
  assert.equal(await realTotal(page), expected, "the receipt once, plus the meal as ticked");
  // deleting the receipt clears what it logged
  await pasteReceipt(page, `KOPI\nDate: ${ddmmyyyy(0)}\nKOPI O 2.00\nTOTAL 2.00`);
  const slot2 = await page.locator("#rl-slot-0 option").nth(2).getAttribute("value");
  await page.selectOption("#rl-slot-0", slot2);
  await page.click("#rc-form button[type=submit]");
  await page.waitForSelector(".rw-totals");
  const id2 = (await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-spend"))))[0].id;
  await settle(page);
  await page.click(`[data-del-spend="${id2}"]`);
  assert.match(await page.textContent(".confirm"), /check-in meals and groceries it logged are cleared too/);
  await page.click(".confirm [data-yes]");
  await page.waitForFunction(id => !JSON.parse(localStorage.getItem("eft2-spend")).some(s => s.id === id), id2);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-checkin")));
  assert.equal(after.days["0"][slot2], undefined, "its check-in entry is gone with it");
  assert.equal(await realTotal(page), expected);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("B1: the same coffee twice is two spends; deleting one keeps the other", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({}) } });
  for (let i = 0; i < 2; i++) {
    await page.goto(env.url("app.html#receipt"));
    await page.waitForSelector("#rc-quick");
    await page.fill("#q-label", "Kopi O");
    await page.fill("#q-rm", "2");
    await page.selectOption("#q-cat", "drink");
    await settle(page);
    await page.click("#rc-quick button[type=submit]");
    await page.waitForSelector(".rw-totals");
  }
  assert.equal(await page.locator("[data-del-spend]").count(), 2);
  assert.match(await page.textContent(".rw-totals .t-value"), /RM 4\.00/);
  await settle(page);
  await page.locator("[data-del-spend]").first().click();
  await page.click(".confirm [data-yes]");
  await page.waitForFunction(() => document.querySelectorAll("[data-del-spend]").length === 1);
  assert.match(await page.textContent(".rw-totals .t-value"), /RM 2\.00/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("B13: a shop-day grocery receipt and a top-up both count as the week's groceries, at what was paid", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({}) } });
  await startPlanToday(page);
  await pasteReceipt(page, `MYDIN MART\nDate: ${ddmmyyyy(-1)}\nBERAS TEMPATAN 5KG 13.00\nTELUR GRED B 10BIJI 4.20\nTOTAL 17.20`);
  assert.equal(await page.locator("#rc-groc").count(), 1, "the day before the plan is shopping day: groceries can link");
  assert.ok(await page.isChecked("#rc-groc"));
  await page.click("#rc-form button[type=submit]");
  await page.waitForSelector(".rw-totals");
  await pasteReceipt(page, `99 SPEEDMART\nDate: ${ddmmyyyy(0)}\nSAYUR BAYAM 1IKAT 3.50\nTOTAL 3.50`);
  assert.ok(await page.isChecked("#rc-groc"));
  await page.click("#rc-form button[type=submit]");
  await page.waitForSelector(".rw-totals");
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-checkin")));
  assert.equal(log.groceryRm, 20.7, "additive, from both receipts");
  assert.equal(log.groceryRids.length, 2);
  assert.match(await page.textContent(".rw-totals .t-value"), /RM 20\.70/, "counted once each, nothing estimated");
  await page.goto(env.url("app.html#today"));
  await page.waitForSelector("#groc");
  assert.match(await page.textContent("label.groceries"), /RM 20\.70 paid, from 2 receipts/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- B11, B10: class summary with no finished weeks; meters ----------
test("B11 + B10: no summary from codes without a finished week; the challenge meter is a visible bar", async () => {
  const unplayed = [0.1, 0.2, 0.3].map(seed => CC.encodeStudent(CC.studentValues({ report: null, budget: 120 }, () => seed), ""));
  const played = [0.4, 0.5, 0.6, 0.7, 0.8].map((seed, i) => CC.encodeStudent(CC.studentValues({ report: { spent: 100 + i * 5, budget: 120, co2: 9, fvDaysMet: i, archetypeId: "hawk" }, budget: 120 }, () => seed), ""));
  const s = await env.newPage({ width: 360, storage: { "eft2-class": JSON.stringify({ codes: unplayed, tag: "", challenge: { type: 1, target: 30 } }) } });
  await s.page.goto(env.url("app.html#class"));
  await s.page.waitForSelector("#tab-lecturer");
  await s.page.click("#tab-lecturer");
  await s.page.waitForSelector("#sum-wait");
  assert.equal(await s.page.locator("#sum-make").count(), 0);
  await s.page.evaluate(c => localStorage.setItem("eft2-class", JSON.stringify({ codes: c, tag: "", challenge: { type: 1, target: 30 } })), unplayed.concat(played));
  await s.page.reload();
  await s.page.waitForSelector("#tab-lecturer");
  await s.page.click("#tab-lecturer");
  await s.page.waitForSelector("#sum-make");
  const m = await s.page.evaluate(() => { const el = document.querySelector(".challenge .meter"); const r = el.getBoundingClientRect(); return { display: getComputedStyle(el).display, w: r.width, h: r.height }; });
  assert.equal(m.display, "block");
  assert.ok(m.w > 100 && m.h >= 8, `meter is drawn (${m.w}×${m.h})`);
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

// ---------- B2: typed amounts fit at every width ----------
test("B2: RM 1,234.56 fits every money box on every width (no text scrolled out of sight)", async () => {
  for (const width of WIDTHS) {
    const { page, ctx, errors } = await env.newPage({ width, storage: { "eft2-profile": profile({}) } });
    await startPlanToday(page);
    await pasteReceipt(page, `KEDAI\nNASI LEMAK 8.50\nTOTAL 8.50`);
    await page.fill("#rl-rm-0", "1234.56");
    await page.fill("#rc-total", "1999.99");
    const issues = (await layoutProblems(page)).filter(p => /input text overflows/.test(p));
    assert.deepEqual(issues, [], `${width}px receipt confirm`);
    await page.click("#rc-cancel");
    await page.waitForSelector("#q-rm");
    await page.fill("#q-rm", "1234.56");
    assert.deepEqual((await layoutProblems(page)).filter(p => /input text overflows/.test(p)), [], `${width}px quick spend`);
    // the "something else" sheet on Today
    await page.goto(env.url("app.html#today"));
    await page.waitForSelector(".seg[data-status=other]");
    await settle(page);
    await page.locator(".seg[data-status=other]").first().click();
    await page.waitForSelector("#other-rm");
    await page.fill("#other-rm", "499.99");
    assert.deepEqual((await layoutProblems(page)).filter(p => /input text overflows/.test(p)), [], `${width}px other sheet`);
    const w = await page.evaluate(() => { const el = document.getElementById("other-rm"); return { s: el.scrollWidth, c: el.clientWidth }; });
    assert.ok(w.s <= w.c + 1, `${width}px: ${w.s} > ${w.c}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
