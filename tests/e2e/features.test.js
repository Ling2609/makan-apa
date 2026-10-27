// v6 features in the browser: money that bites, meanwhile accounting, share image fit,
// phone chrome, sheets, My prices, "I have it", tight-week preset, if-then plan.
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, settle, checkScreen, finishSetup, onboard, openMore, decide } = require("./helpers");

const env = setup(test);
const profile = over => JSON.stringify({ budget: 120, kitchen: "shared", goal: "money", diet: { halal: true, vegetarian: false }, campusLunch: true, breakfast: true, cooks: 6, rahmah: false, preset: "normal", ...over });

test("meanwhile accounting: the HUD change equals the choice plus every habit line listed", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390 });
  await page.goto(env.url("app.html#week"));
  await onboard(page, { skipGuesses: true });
  let checked = 0, withHabits = 0;
  for (let i = 0; i < 9; i++) {
    if (!(await page.locator("button.option").count())) break;
    const before = Number(await page.getAttribute(".hud-item[data-left]", "data-left"));
    const co2Before = Number(await page.getAttribute(".hud-item[data-co2]", "data-co2"));
    await settle(page);
    await page.locator("button.option").nth(i % 2).click();
    await page.waitForSelector("#next-btn");
    const after = Number(await page.getAttribute(".hud-item[data-left]", "data-left"));
    const co2After = Number(await page.getAttribute(".hud-item[data-co2]", "data-co2"));
    const dCash = Number(await page.getAttribute(".delta", "data-delta-cash"));
    const dCo2 = Number(await page.getAttribute(".delta", "data-delta-co2"));
    const listed = await page.$$eval(".mw-rm", els => els.map(e => e.textContent));
    if (listed.length) withHabits++;
    assert.ok(Math.abs((before - after) - dCash) < 0.011, `money: ${before} → ${after}, listed ${dCash}`);
    assert.ok(Math.abs((co2After - co2Before) - dCo2) < 0.02, `co2: ${co2Before} → ${co2After}, listed ${dCo2}`);
    checked++;
    if (i === 3) await checkScreen(page, "meanwhile result 390");
    await settle(page);
    await page.click("#next-btn");
  }
  assert.ok(checked >= 8);
  assert.ok(withHabits >= 1, "habits filled at least one meal in the first decisions");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("budget lock: unaffordable options are locked with the reason; borrowing unlocks them at a cost", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({ budget: 40 }) } });
  await page.goto(env.url("app.html#week"));
  await page.waitForSelector("#calib-form");
  await page.click("#calib-skip");
  // Spend fast: always pick the most expensive available option
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    await page.waitForSelector("button.option, #share-btn");
    if (await page.locator(".option.locked .opt-lock").count() && await page.locator("#borrow-btn").count()) { found = true; break; }
    if (!(await page.locator("button.option").count())) break;
    const prices = await page.$$eval("button.option .opt-price", els => els.map(e => Number((e.textContent.match(/[\d.]+/) || ["0"])[0])));
    const idx = prices.indexOf(Math.max(...prices));
    await settle(page);
    await page.locator("button.option").nth(Math.max(0, idx)).click();
    await page.waitForSelector("#next-btn");
    await settle(page);
    await page.click("#next-btn");
  }
  assert.ok(found, "a RM 40 week of expensive picks reaches a locked option");
  await checkScreen(page, "budget lock 390");
  assert.match(await page.textContent(".option.locked"), /left|No money/);
  const before = Number(await page.getAttribute(".hud-item[data-left]", "data-left"));
  await settle(page);
  await page.click("#borrow-btn");
  await page.waitForFunction(b => Number(document.querySelector(".hud-item[data-left]").dataset.left) > b, before);
  const after = Number(await page.getAttribute(".hud-item[data-left]", "data-left"));
  assert.ok(Math.abs(after - before - 20) < 0.01, `borrow adds RM 20 (${before} → ${after})`);
  assert.ok(await page.locator("button.option").count(), "still on the same decision");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("phone chrome: top bar ≤ 68px, labelled bottom tab bar, fixed Next bar, sheets lock the page", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390 });
  await page.goto(env.url("app.html#week"));
  await page.waitForSelector("#setup-form");
  assert.equal(await page.locator(".tabbar").isVisible(), false, "no tab bar during onboarding");
  await onboard(page, { skipGuesses: true });
  const top = await page.locator(".topbar").boundingBox();
  assert.ok(top.height <= 68.5, `top bar is ${top.height}px`);
  const tabs = await page.$$eval(".tabbar a, .tabbar button", els => els.map(e => e.innerText.trim()));
  assert.deepEqual(tabs, ["Home", "Plan", "Learn", "More", "Setup"]);
  await settle(page);
  await page.locator("button.option").first().click();
  await page.waitForSelector("#next-btn");
  const next = await page.locator("#next-btn").boundingBox();
  const bar = await page.locator(".tabbar").boundingBox();
  assert.ok(next.y + next.height <= bar.y + 1 && next.y > 600, "Next sits just above the tab bar without scrolling");
  await settle(page);
  await page.click("#hud-receipt");
  await page.waitForSelector("#sheet[open]");
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("view")).overflowY), "hidden", "page behind the sheet is locked");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("view")).overflowY !== "hidden");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("share image: every line of text is measured and fits its box", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 1440, height: 900, storage: { "eft2-profile": profile({ budget: 40 }) } });
  await page.goto(env.url("app.html#week"));
  await page.waitForSelector("#calib-form");
  await page.click("#calib-skip");
  for (let i = 0; i < 40; i++) {
    await page.waitForSelector("button.option, #share-btn");
    if (await page.locator("#share-btn").count()) break;
    if (await page.locator("#borrow-btn").count()) { await settle(page); await page.click("#borrow-btn"); await page.waitForTimeout(60); continue; }
    await decide(page, 9); // most often the priciest, last option
  }
  await page.waitForSelector("#share-btn");
  await checkScreen(page, "report broke 1440");
  await settle(page);
  const [png] = await Promise.all([page.waitForEvent("download"), page.click("#share-btn")]);
  assert.equal(png.suggestedFilename(), "my-food-week.png");
  const lines = await page.evaluate(() => window.__shareDebug);
  assert.ok(lines.length >= 9, `${lines.length} lines drawn`);
  lines.forEach(l => assert.ok(l.width <= l.max, `"${l.text}" is ${l.width}px in a ${l.max}px box`));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("setup: tight-week preset and Menu Rahmah; plan: My prices, I have it, if-then plan", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390 });
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#setup-form");
  for (const step of ["allergies", "kitchen", "budget"]) { await settle(page); await page.click("#setup-form button[type=submit]"); await page.waitForSelector(`#setup-form[data-step=${step}]`); }
  await settle(page);
  await page.click("#su-tight");
  // RM 70 when a week that cheap exists for this kitchen and diet; otherwise the cheapest week that does
  const tightBudget = Number(await page.inputValue("#su-budget"));
  assert.ok(tightBudget >= 70 && tightBudget <= 80, `tight budget ${tightBudget}`);
  assert.ok(await page.isChecked("#su-rahmah"));
  await settle(page);
  await page.click("#setup-form button[type=submit]");
  await page.waitForSelector("#plan-start");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-profile")));
  assert.equal(saved.budget, tightBudget);
  assert.equal(await page.locator("#over-banner").count(), 0, "the tight plan fits its budget");
  assert.equal(saved.rahmah, true);
  assert.equal(saved.preset, "tight");
  await checkScreen(page, "tight plan 390");

  // My prices: rice at RM 3.50 changes the shopping list
  await openMore(page);
  await page.click("#plan-prices");
  await page.waitForSelector("#prices-form");
  await page.fill("#pr-packs-rice", "999");
  await page.click("#prices-form button[type=submit]");
  await page.waitForSelector("#prices-error:not(:empty)");
  await page.fill("#pr-packs-rice", "3.5");
  await page.waitForSelector("#prices-error:empty", { state: "attached" });
  await page.click("#prices-form button[type=submit]");
  await page.waitForFunction(() => !document.getElementById("sheet").open);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-prices")).packs), { rice: 3.5 });
  const riceRow = page.locator(".tick-row", { hasText: "Local white rice" });
  if (await riceRow.count()) assert.match(await riceRow.textContent(), /3\.50|7\.00|10\.50/);

  // I have it: the item leaves the list and the grocery total drops (the shopping list is its own part of the plan)
  await page.click(".plan-views a[href='#plan?view=shop']");
  await page.waitForSelector("[data-have]");
  const total = async () => Number((await page.textContent("#shop-title .num")).replace(/[^\d.]/g, ""));
  const t0 = await total();
  await settle(page);
  await page.locator("[data-have]").first().click();
  await page.waitForSelector("[data-need]");
  assert.ok((await total()) < t0, "grocery total drops");
  assert.ok(Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-have")))).length === 1);

  // If-then plan: in-page error, then saved
  await page.click(".plan-views a[href='#plan?view=weak']");
  await page.waitForSelector("#if-form");
  await settle(page);
  await page.click("#if-form button[type=submit]");
  await page.waitForSelector("#if-error:not(:empty)");
  await page.fill("#if-when", "it's 11 pm and I want to order food");
  await page.fill("#if-then", "eat the banana in my room");
  await page.click("#if-form button[type=submit]");
  await page.waitForSelector(".if-line");
  await checkScreen(page, "plan extras 390");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("plan swap: apply to every repeat of a meal at once", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 1440, height: 900, storage: { "eft2-profile": profile({}) } });
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#plan-start");
  const plan = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-plan")).plan);
  const counts = {};
  plan.forEach((d, i) => ["L", "D"].forEach(s => { if (d[s]) (counts[s + d[s]] = counts[s + d[s]] || []).push(i); }));
  const key = Object.keys(counts).find(k => counts[k].length > 1);
  assert.ok(key, "some lunch or dinner repeats");
  const slot = key[0], id = key.slice(1);
  await settle(page);
  await page.click(`.plan-grid .pg-cell[data-day="${counts[key][0]}"][data-slot="${slot}"]`);
  await page.waitForSelector("#sheet[open]");
  await checkScreen(page, "swap sheet apply-all 1440");
  const all = page.locator("#sheet button[data-all]").first();
  if (await all.count()) {
    const to = await all.getAttribute("data-all");
    await all.click();
    await page.waitForFunction(() => !document.getElementById("sheet").open);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-plan")).plan);
    counts[key].forEach(d => assert.equal(after[d][slot], to));
    assert.ok(!after.some(d => d[slot] === id && counts[key].includes(after.indexOf(d))));
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});
