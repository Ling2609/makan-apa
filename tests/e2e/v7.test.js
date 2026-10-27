// v7 in the browser: the Round A regressions that need a page (Back button, reload safety,
// ticks never lost, over-budget fixes), and the new tools end to end, including real on-device
// OCR of a receipt photo with the vendored Tesseract engine.
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { setup, settle, checkScreen, onboard, openMore, decide, playWeek } = require("./helpers");
const RCF = require("../fixtures/receipts.js");
const CC = require("../../js/classcode.js");

const env = setup(test);
const profile = over => JSON.stringify({ budget: 120, kitchen: "shared", goal: "money", diet: { halal: true, vegetarian: false }, campusLunch: true, breakfast: true, cooks: 6, rahmah: false, preset: "normal", ...over });

async function startPlanToday(page) {
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#plan-start");
  await settle(page);
  await page.click("#plan-start");
  await page.waitForSelector("#start-form");
  await page.click("#start-form button[type=submit]");
  await page.waitForSelector(".check-card");
}

test("H1 + M5: Back leaves a finished week, and a reload on the last result keeps the report", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390 });
  await page.goto(env.url("index.html"));
  await page.goto(env.url("app.html#week"));
  await onboard(page, { skipGuesses: true });
  // play to the last decision, then reload before tapping "See my week report"
  let i = 0;
  while (true) {
    await settle(page);
    await page.locator("button.option:not([disabled])").first().click();
    await page.waitForSelector("#next-btn");
    if (await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("eft2-sim")); return s && s.done; })) break;
    await settle(page);
    await page.click("#next-btn");
    if (++i > 30) throw new Error("week did not end");
  }
  assert.ok(await page.evaluate(() => !!localStorage.getItem("eft2-report")), "report saved as soon as the week ends");
  await page.reload();
  await page.waitForSelector("#share-btn");
  assert.equal(await page.evaluate(() => location.hash), "#report");
  await page.goto(env.url("app.html#week"));
  await page.waitForSelector("#share-btn");
  assert.equal(await page.evaluate(() => location.hash), "#report", "a finished week redirects to the report…");
  await page.goBack();
  await page.waitForTimeout(400);
  assert.notEqual(await page.evaluate(() => location.hash), "#week", "…without trapping Back in a loop");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("H3 + M15: remaking a plan with ticks asks first, then files them under Past weeks; the chosen day resets", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({}) } });
  await startPlanToday(page);
  await settle(page);
  await page.locator(".seg[data-status=skipped]").first().click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("eft2-checkin")).days["0"]);
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#plan-start");
  await openMore(page);
  await settle(page);
  await page.click("#plan-redo");
  await page.waitForSelector("#confirm-drop");
  assert.match(await page.textContent("#confirm-drop"), /1 check-in tick/);
  await page.click("#confirm-no");
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-checkin")).days["0"]), "Keep my plan keeps the ticks");
  await openMore(page);
  await settle(page);
  await page.click("#plan-redo");
  await page.waitForSelector("#confirm-yes");
  await page.click("#confirm-yes");
  await page.waitForFunction(() => !localStorage.getItem("eft2-checkin"));
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-history")));
  assert.equal(hist.length, 1);
  assert.equal(hist[0].log.days["0"].B.status, "skipped");
  // settings change also archives (and says so before saving)
  await startPlanToday(page);
  await settle(page);
  await page.locator(".seg[data-status=planned]").first().click();
  await page.waitForTimeout(200);
  // M15: a tapped day dot doesn't stick after leaving the tab
  const dots = page.locator(".wd:not([disabled])");
  if (await dots.count() > 1) {
    await settle(page);
    await dots.first().click();
  }
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#plan-start");
  await page.goto(env.url("app.html#today"));
  await page.waitForSelector(".today-head h1");
  assert.match(await page.textContent(".today-head h1"), /^Today/);
  await page.click("#open-settings-bar");
  await page.waitForSelector("#settings-note");
  assert.match(await page.textContent("#settings-note"), /check-in ticks move to Past weeks/);
  await page.locator("#settings-form input[name=st-goal][value=health]").check({ force: true });
  await page.click("#settings-form button[type=submit]");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("eft2-history") || "[]").length === 2);
  await page.goto(env.url("app.html#today"));
  await page.waitForSelector(".past-weeks");
  await page.click(".past-weeks > summary");
  assert.equal(await page.locator(".past-list li").count(), 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("M6 + M7: a swap that breaks the budget shows the fix, focuses it, and survives a reload", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({ budget: 80 }) } });
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#plan-start");
  assert.equal(await page.locator("#over-banner").count(), 0);
  // swap meals for the priciest option until the plan goes over
  for (let k = 0; k < 8 && !(await page.locator("#over-banner").count()); k++) {
    await settle(page);
    await page.locator("button.pg-cell[data-day]:visible").nth(k).click();
    await page.waitForSelector("#sheet[open] button[data-meal]");
    const items = page.locator("#sheet .swap-item");
    let pick = 0, worst = -1e9;
    for (let j = 0; j < await items.count(); j++) {
      const t = await items.nth(j).locator(".d").first().textContent();
      const v = Number(t.replace(/[^\d.−+-]/g, "").replace("−", "-"));
      if (v > worst) { worst = v; pick = j; }
    }
    await items.nth(pick).locator("button[data-meal]").click();
    await page.waitForFunction(() => !document.getElementById("sheet").open);
  }
  await page.waitForSelector("#over-banner");
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "over-banner", "focus moves to the warning");
  assert.equal(await page.locator("#fix-remake").count(), 1, "Remake within budget is offered");
  assert.match(await page.textContent("#over-banner"), /swap.* took the plan over\. A plan within budget is possible/, "the swaps did it, and it says so");
  await page.reload();
  await page.waitForSelector("#over-banner");
  assert.equal(await page.locator("#fix-remake").count(), 1, "still offered after a reload");
  await checkScreen(page, "over budget after swap 390");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("M7: an impossible budget names the cheapest week, also after a reload", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({ kitchen: "hostel", budget: 60 }) } });
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#over-banner");
  await page.reload();
  await page.waitForSelector("#over-banner");
  const text = await page.textContent("#over-banner");
  assert.match(text, /The cheapest plan for 21 meals with this setup costs RM/);
  assert.ok(!/swap/i.test(text));
  assert.equal(await page.locator("#fix-remake").count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("receipt (pasted text): check the lines, link a meal to today's check-in, see it in My real week", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({}) } });
  await startPlanToday(page);
  await page.goto(env.url("app.html#receipt"));
  await page.waitForSelector("#rc-text");
  const today = await page.evaluate(() => { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; });
  await page.fill("#rc-text", RCF.kopitiam.replace("14/10/2026", today));
  await settle(page);
  await page.click("#rc-text-form button[type=submit]");
  await page.waitForSelector("#rc-form");
  assert.equal(await page.locator(".rc-line").count(), 3);
  assert.equal(await page.locator("#rc-warn").count(), 0, "lines balance with the total");
  // fix a line, remove one, link the nasi lemak to lunch
  await page.fill("#rl-label-2", "Roti bakar kaya (2 slices)");
  await page.click("[data-del=\"1\"]");
  assert.equal(await page.locator(".rc-line").count(), 2);
  assert.match(await page.textContent("#rc-sum"), /12\.30/);
  await page.selectOption("#rl-slot-0", "L");
  await checkScreen(page, "receipt confirm linked 390");
  await page.click("#rc-form button[type=submit]");
  // a line was removed, so the lines (12.30) no longer match the total (17.65): v8 asks which to keep
  await page.waitForSelector("#rc-total-check");
  await page.click("#rc-total-check [data-total]");
  await page.waitForSelector(".rw-totals");
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-checkin")));
  const spend = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-spend")));
  assert.deepEqual(log.days["0"].L, { status: "other", rm: 8.5, label: "Nasi Lemak Ayam", src: "receipt", rids: [{ id: spend[0].id, rm: 8.5, label: "Nasi Lemak Ayam" }] });
  assert.equal(spend.length, 1);
  assert.equal(spend[0].total, 17.65);
  // counted once: the linked check-in entry isn't added on top of the receipt
  assert.match(await page.textContent(".rw-totals .total"), /RM 17\.65/);
  // empty and bad lines get an in-page error, never a pop-up
  await page.goto(env.url("app.html#receipt"));
  await page.waitForSelector("#rc-quick");
  await settle(page);
  await page.click("#rc-quick button[type=submit]");
  await page.waitForSelector("#q-error .banner");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("receipt (photo): the vendored OCR engine reads a receipt image on the device, offline-capable", { timeout: 240000 }, async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({}) } });
  // Make a receipt photo: render the text as a receipt and screenshot it
  const img = path.join(os.tmpdir(), `eft-receipt-${process.pid}.png`);
  const shotPage = await ctx.newPage();
  await shotPage.setContent(`<pre id="r" style="font: 26px/1.35 'DejaVu Sans Mono', monospace; padding: 40px; background: #fff; color: #111; width: 640px; margin: 0">${RCF.kopitiam.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`);
  await shotPage.locator("#r").screenshot({ path: img });
  await shotPage.close();
  const requests = [];
  page.on("request", r => requests.push(r.url()));
  await page.goto(env.url("app.html#receipt"));
  await page.waitForSelector("#rc-file", { state: "attached" });
  await page.setInputFiles("#rc-file", img);
  await page.waitForSelector("#rc-form", { timeout: 200000 });
  const total = Number(await page.inputValue("#rc-total"));
  const labels = await page.$$eval(".rl-label", els => els.map(e => e.value.toLowerCase()));
  assert.equal(total, 17.65, "total read from the photo");
  assert.ok(labels.some(l => /nasi lemak/.test(l)), labels.join("|"));
  assert.ok(requests.every(u => u.startsWith(env.base)), "nothing leaves this origin");
  assert.ok(requests.some(u => /tesseract-core-lstm\.wasm\.js$/.test(u)));
  fs.unlinkSync(img);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("stall notes: add, share as a link, a friend merges it (newest price wins)", async () => {
  const mine = { width: 390, storage: { "eft2-profile": profile({}) } };
  const a = await env.newPage(mine);
  await a.page.goto(env.url("app.html#stalls"));
  await a.page.waitForSelector("#stall-add");
  await settle(a.page);
  await a.page.click("#stall-add");
  await a.page.waitForSelector("#stall-form");
  await a.page.click("#stall-form button[type=submit]");
  await a.page.waitForSelector("#sf-error .banner");
  await a.page.fill("#sf-name", "Kafe Kolej 12");
  await a.page.fill("#sf-map", "javascript:alert(1)");
  await a.page.fill("#sf-i-0", "Nasi lemak ayam");
  await a.page.fill("#sf-p-0", "6.5");
  await a.page.click("#stall-form button[type=submit]");
  await a.page.waitForSelector("#sf-error .banner");
  await a.page.fill("#sf-map", "");
  await a.page.click("#stall-form button[type=submit]");
  await a.page.waitForSelector(".stall-card");
  await settle(a.page);
  await a.page.click("#stall-share");
  await a.page.waitForSelector("#share-qr .qr");
  const link = await a.page.inputValue("#share-link");
  assert.match(link, /#stalls\?import=[\w-]+&c=[0-9a-z]{4}$/);
  // friend has the same stall with an older price, opens the link
  const b = await env.newPage({ width: 1440, height: 900, storage: { "eft2-profile": profile({}),
    "eft2-stalls": JSON.stringify([{ id: "frnd0001", name: "kafe kolej 12", area: "", items: [{ name: "Nasi lemak ayam", rm: 5, date: "2026-01-05" }, { name: "Teh tarik", rm: 2, date: "2026-01-05" }] }]) } });
  await b.page.goto(link);
  await b.page.waitForSelector("#import-banner");
  await checkScreen(b.page, "stall import 1440");
  await b.page.click("#import-yes");
  await b.page.waitForSelector(".stall-card");
  const merged = await b.page.evaluate(() => JSON.parse(localStorage.getItem("eft2-stalls")));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].items.find(i => i.name === "Nasi lemak ayam").rm, 6.5);
  assert.ok(merged[0].items.some(i => i.name === "Teh tarik"));
  assert.ok(!(await b.page.evaluate(() => location.hash)).includes("import="), "the link data is cleared from the address bar");
  // stall prices into My prices
  await settle(b.page);
  await b.page.click("#stall-prices");
  await b.page.click("#sp-yes");
  assert.equal(await b.page.evaluate(() => JSON.parse(localStorage.getItem("eft2-prices")).meals.nasilemak), 6.5);
  for (const x of [a, b]) { assert.deepEqual(x.errors, []); await x.ctx.close(); }
});

test("class mode: student code → lecturer view with challenge → class summary → student compares", async () => {
  const s = await env.newPage({ width: 390 });
  await s.page.goto(env.url("app.html#week"));
  await onboard(s.page);
  await playWeek(s.page);
  await s.page.goto(env.url("app.html#class"));
  await s.page.waitForSelector("#code-form");
  await s.page.fill("#code-tag", "bio101");
  await settle(s.page);
  await s.page.click("#code-form button[type=submit]");
  await s.page.waitForSelector("#code-qr .qr");
  const code = (await s.page.textContent("#my-code")).trim();
  assert.ok(CC.decode(code).ok);
  assert.equal(CC.decode(code).tag, "BIO101");
  assert.ok(CC.describeStudent(CC.decode(code).values).played, "the finished week is in the code");
  // a lecturer with 9 other codes pastes it among chat noise and a duplicate
  const others = Array.from({ length: 9 }, (_, i) => CC.encodeStudent(CC.studentValues({ report: { spent: 90 + i * 8, budget: 120, co2: 9 + i, fvDaysMet: i % 8, archetypeId: "hawk" }, budget: 120 }, () => (i + 1) / 11), "BIO101"));
  const l = await env.newPage({ width: 1440, height: 900 });
  // v8: a lecturer's device needs no setup to collect codes
  await l.page.goto(env.url("app.html#class"));
  await l.page.waitForSelector("#tab-lecturer");
  assert.equal(await l.page.locator("#setup-form").count(), 0);
  await settle(l.page);
  await l.page.click("#tab-lecturer");
  await l.page.waitForSelector("#imp-text");
  await l.page.fill("#cl-tag", "BIO101");
  await l.page.dispatchEvent("#cl-tag", "change");
  await l.page.fill("#imp-text", `[10:02] Aina: ${code}\n[10:03] Ben: ${others.join("\n")}\n${code}\nEFT1-S-BIO101-ZZZZZ-ZZZZZ-ZZZZZ-Z`);
  await l.page.click("#imp-form button[type=submit]");
  await l.page.waitForSelector(".class-picture");
  const result = await l.page.textContent("#imp-result");
  assert.match(result, /10 added, 1 already in/);
  assert.match(result, /1 rejected/);
  await l.page.selectOption("#ch-type", "3");
  await l.page.fill("#ch-target", "50");
  await l.page.click("#ch-form button[type=submit]");
  await l.page.waitForSelector(".challenge");
  await l.page.click("#sum-make");
  await l.page.waitForSelector("#sum-qr .qr");
  await checkScreen(l.page, "class lecturer 1440");
  const summary = (await l.page.textContent("#sum-out .code-big")).trim();
  assert.equal(CC.decode(summary).type, "C");
  assert.equal(CC.describeClass(CC.decode(summary).values).n, 10);
  // the student opens the summary link and compares, on their own phone
  await s.page.goto(env.url("app.html#class?code=" + summary));
  await s.page.waitForSelector("#ref-yes");
  await s.page.click("#ref-yes");
  await s.page.waitForSelector(".cmp-table");
  assert.match(await s.page.textContent(".cmp-table"), /Week cost vs budget/);
  assert.match(await s.page.textContent("#class-panel"), /Class challenge: No more than 50% of the class over budget/);
  await checkScreen(s.page, "class compare 390");
  for (const x of [s, l]) { assert.deepEqual(x.errors, []); await x.ctx.close(); }
});
