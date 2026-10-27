// v9 in the browser: the Round C regressions that need a page (several receipts for one meal, the shop
// before a Next Monday plan, words that never split at 360 px, the print tags, stall dates, the
// over-budget cause, receipt drafts that survive a reload), and Today / My real week / Tools agreeing.
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, settle, checkScreen } = require("./helpers");

const env = setup(test);
const profile = over => JSON.stringify({ budget: 120, kitchen: "shared", goal: "money", diet: { halal: true, vegetarian: false }, campusLunch: true, breakfast: true, cooks: 6, rahmah: false, preset: "normal", ...over });
const dayKey = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ddmmyyyy = n => { const [y, m, d] = dayKey(n).split("-"); return `${d}/${m}/${y}`; };
const num = t => Number(String(t).replace(/[^0-9.-]/g, ""));

async function startPlan(page, when = "today") {
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#plan-start");
  await settle(page);
  await page.click("#plan-start");
  await page.waitForSelector("#start-form");
  await page.check(`input[name=start][value=${when}]`);
  await page.click("#start-form button[type=submit]");
  await page.waitForSelector(when === "today" ? ".check-card" : ".page.empty h1");
}
async function pasteReceipt(page, text) {
  await page.goto(env.url("app.html#receipt"));
  await page.waitForSelector("#rc-text");
  await page.fill("#rc-text", text);
  await settle(page);
  await page.click("#rc-text-form button[type=submit]");
  await page.waitForSelector("#rc-form");
}
async function saveReceipt(page) {
  await page.click("#rc-form button[type=submit]");
  const check = await page.waitForSelector("#rc-total-check, .rw-head", { timeout: 5000 });
  if (await check.evaluate(el => el.id === "rc-total-check")) await page.click("#rc-total-check [data-total]");
  await page.waitForSelector(".rw-head");
}
const store = (page, k) => page.evaluate(key => JSON.parse(localStorage.getItem(key)), k);
async function screens(page) {
  await page.goto(env.url("app.html#realweek")); await page.waitForSelector(".rw-head");
  const real = await page.locator(".rw-totals .t-value").first().textContent().catch(() => "RM 0.00");
  await page.goto(env.url("app.html#tools")); await page.waitForSelector(".tool-list");
  const hub = (await page.textContent("a[href='#realweek'] small")).match(/RM [0-9.,]+/);
  await page.goto(env.url("app.html#today")); await page.waitForSelector(".today-side");
  const cash = await page.locator(".today-side dt", { hasText: "Cash out" }).locator("xpath=..").locator("dd").textContent();
  return { real: num(real), hub: hub ? num(hub[0]) : 0, cash: num(cash) };
}

// ---------- C1 + the screens agreeing ----------
test("C1: two receipts for one meal both count; deleting one keeps the other; Today, My real week and Tools agree throughout", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({}) } });
  await startPlan(page);
  await pasteReceipt(page, `KEDAI A\nDate: ${ddmmyyyy(0)}\nNASI LEMAK AYAM 6.00\nTOTAL 6.00`);
  const slot = await page.locator("#rl-slot-0 option").nth(1).getAttribute("value");
  await page.selectOption("#rl-slot-0", slot);
  await saveReceipt(page);
  const idA = (await store(page, "eft2-spend"))[0].id;
  await pasteReceipt(page, `KEDAI B\nDate: ${ddmmyyyy(0)}\nTEH TARIK 2.50\nTOTAL 2.50`);
  await page.selectOption("#rl-slot-0", slot);
  await saveReceipt(page);
  let e = (await store(page, "eft2-checkin")).days["0"][slot];
  assert.equal(e.rm, 8.5, "the second receipt adds to the meal, it doesn't replace the first");
  assert.equal(e.rids.length, 2);
  let s = await screens(page);
  assert.deepEqual(s, { real: 8.5, hub: 8.5, cash: 8.5 }, "every screen says the same");
  assert.match(await page.textContent(".check-card .cc-other"), /RM 8\.50/);
  // delete the first receipt: only its share goes
  await page.goto(env.url("app.html#realweek")); await page.waitForSelector(".rw-head");
  await settle(page);
  await page.click(`[data-del-spend="${idA}"]`);
  await page.click(".confirm [data-yes]");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("eft2-spend")).length === 1);
  e = (await store(page, "eft2-checkin")).days["0"][slot];
  assert.equal(e.rm, 2.5);
  s = await screens(page);
  assert.deepEqual(s, { real: 2.5, hub: 2.5, cash: 2.5 });
  // "Change it anyway": the receipt stops standing for the meal; it stays in My real week, the meal counts as ticked
  await settle(page);
  await page.click(`.seg[data-slot=${slot}][data-status=skipped]`);
  await page.waitForSelector(".check-card .confirm");
  assert.match(await page.textContent(".check-card .confirm"), /takes the receipt off this meal/);
  await page.click(".check-card .confirm [data-yes]");
  await page.waitForFunction(sl => JSON.parse(localStorage.getItem("eft2-checkin")).days["0"][sl].status === "skipped", slot);
  assert.equal((await store(page, "eft2-spend"))[0].items[0].slot, undefined, "the receipt line is no longer this meal");
  s = await screens(page);
  assert.deepEqual(s, { real: 2.5, hub: 2.5, cash: 0 }, "the drink is still money spent; Today's check-in money is what the check-in says");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- C2: the shop before a Next Monday plan ----------
test("C2: a grocery receipt scanned before a Next Monday plan starts is linked as the plan's groceries", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({}) } });
  await startPlan(page, "monday");
  await pasteReceipt(page, `MYDIN MART\nDate: ${ddmmyyyy(0)}\nBERAS 5KG 13.00\nTELUR 10 BIJI 6.50\nTOTAL 19.50`);
  assert.equal(await page.locator("#rc-groc").count(), 1, "the 'these are this week's groceries' switch is offered");
  assert.equal(await page.isChecked("#rc-groc"), true);
  await saveReceipt(page);
  const log = await store(page, "eft2-checkin");
  assert.equal(log.groceries, true);
  assert.equal(log.groceryRm, 19.5);
  assert.equal(log.groceryRids.length, 1);
  await page.goto(env.url("app.html#today")); await page.waitForSelector(".page.empty h1");
  assert.match(await page.textContent(".page.empty .lead"), /Shop done: RM 19\.50 of groceries from your receipt/);
  await checkScreen(page, "v9 shop before the start 390");
  // before the start, My real week is the last 7 days, so the shop shows once, as spent today
  await page.goto(env.url("app.html#realweek")); await page.waitForSelector(".rw-totals");
  assert.equal(num(await page.locator(".rw-totals .t-value").first().textContent()), 19.5);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- C3: meal names never break inside a word ----------
test("C3: at 360, 390 and 768 px no meal name in the plan is split inside a word", async () => {
  for (const width of [360, 390, 768]) {
    for (const kitchen of ["hostel", "shared", "home"]) {
      const { page, ctx, errors } = await env.newPage({ width, storage: { "eft2-profile": profile({ kitchen }) } });
      await page.goto(env.url("app.html#plan"));
      await page.waitForSelector(".pd-row .pg-name");
      await settle(page);
      const split = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll(".plan-days .pg-name").forEach(el => {
          const node = el.firstChild;
          if (!node || node.nodeType !== 3) return;
          const re = /\S+/g; let m;
          while ((m = re.exec(node.data))) {
            const r = document.createRange(); r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length);
            const tops = new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)));
            if (tops.size > 1) out.push(`${m[0]} in “${node.data}”`);
          }
          const cell = el.closest(".pg-cell");
          if (cell.scrollWidth > cell.clientWidth + 1) out.push(`overflow: ${node.data}`);
        });
        return out;
      });
      assert.deepEqual(split, [], `${kitchen} at ${width}px`);
      if (width === 360 && kitchen === "shared") await checkScreen(page, "v9 plan day cards 360");
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  }
});

// ---------- C6: the over-budget banner names the cause ----------
test("C6: a plan pushed over budget by new prices (no swaps) says prices did it", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({ budget: 80 }) } });
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#plan-start");
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-plan")).plan.flatMap(d => Object.values(d)).filter(Boolean));
  await page.evaluate(list => localStorage.setItem("eft2-prices", JSON.stringify({ meals: Object.fromEntries(list.map(id => [id, 40])), packs: {} })), ids);
  await page.reload();
  await page.waitForSelector("#over-banner");
  const t = await page.textContent("#over-banner");
  assert.match(t, /Prices changed after this plan was made/);
  assert.doesNotMatch(t, /swaps/i);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- C7: print ----------
test("C7: printed, every tag stays inside its meal cell", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 794, height: 1123, storage: { "eft2-profile": profile({ kitchen: "home" }) } });
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector(".plan-grid .pg-cell", { state: "attached" }); // the grid shows on paper and wide screens
  await page.emulateMedia({ media: "print" });
  await settle(page);
  const bad = await page.evaluate(() => [...document.querySelectorAll(".plan-grid .pg-cell .tag")].filter(t => {
    const c = t.closest(".pg-cell").getBoundingClientRect(), r = t.getBoundingClientRect();
    return r.right > c.right + 0.5 || r.left < c.left - 0.5 || getComputedStyle(t, "::before").content.includes("·");
  }).map(t => t.textContent));
  assert.ok(await page.locator(".plan-grid .tag.plate").count() > 0, "the plan has Healthy Plate tags to check");
  assert.deepEqual(bad, []);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- C8: stall dates ----------
test("C8: a stall price with a future date is an error in the sheet, not a silently dropped price", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({}) } });
  await page.goto(env.url("app.html#stalls"));
  await page.waitForSelector("#stall-add");
  await settle(page);
  await page.click("#stall-add");
  await page.waitForSelector("#stall-form");
  await page.fill("#sf-name", "Kafe Kolej 12");
  await page.fill("#sf-i-0", "Nasi lemak");
  await page.fill("#sf-p-0", "6.50");
  await page.evaluate(d => { document.getElementById("sf-d-0").value = d; }, dayKey(30));
  await page.click("#stall-form button[type=submit]");
  await page.waitForSelector("#sf-error .error, #sf-error :is(p,div)");
  assert.match(await page.textContent("#sf-error"), /can't be in the future/);
  assert.equal(await page.evaluate(() => document.activeElement.id), "sf-d-0", "focus goes to the date to fix");
  assert.equal(await page.evaluate(() => localStorage.getItem("eft2-stalls")), null, "nothing saved");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------- C18: the receipt draft survives a reload; typed amounts ----------
test("C5 + C18: typed 'RM5' and '2.8' are read; the lines being checked survive a reload and go once saved", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({}) } });
  await pasteReceipt(page, "Nasi lemak RM5\nTeh tarik 2.8");
  assert.equal(await page.inputValue("#rl-rm-0"), "5.00");
  assert.equal(await page.inputValue("#rl-rm-1"), "2.80");
  await page.fill("#rc-store", "Kafe Kolej 12");
  await page.fill("#rl-label-1", "Teh tarik kurang manis");
  await page.reload();
  await page.waitForSelector("#rc-form");
  assert.equal(await page.inputValue("#rc-store"), "Kafe Kolej 12");
  assert.equal(await page.inputValue("#rl-label-1"), "Teh tarik kurang manis");
  await saveReceipt(page);
  assert.equal(await page.evaluate(() => localStorage.getItem("eft2-receipt-draft")), null, "saved: the draft is gone");
  await page.goto(env.url("app.html#receipt"));
  await page.waitForSelector("#rc-text");
  assert.deepEqual(errors, []);
  await ctx.close();
});
