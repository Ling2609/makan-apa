// v10 in the browser: "Start today" stays within budget or says exactly what it costs and recommends
// Next Monday (and the banner then names the start as the cause); receipt prices are picked per line,
// and a line naming a different dish is flagged and never saved unless ticked.
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, settle } = require("./helpers");

const env = setup(test);
const profile = over => JSON.stringify({ budget: 120, kitchen: "shared", goal: "money", diet: { halal: true, vegetarian: false }, campusLunch: true, breakfast: true, cooks: 6, rahmah: false, preset: "normal", ...over });
const num = t => Number(String(t).replace(/[^0-9.-]/g, ""));

async function openStart(page) {
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#plan-start");
  await settle(page);
  await page.click("#plan-start");
  await page.waitForSelector("#start-form");
}

test("start today on the reviewer's RM 50 week keeps it within budget, with no over-budget banner", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({ budget: 50, cooks: 14, breakfast: false }) } });
  await openStart(page);
  assert.equal(await page.locator("#start-warn").count(), 0);
  assert.equal(await page.isChecked("input[name=start][value=today]"), true);
  await page.click("#start-form button[type=submit]");
  await page.waitForSelector(".check-card");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-plan")));
  const d0 = ["B", "L", "D"].map(s => saved.plan[0][s]).filter(Boolean);
  assert.equal(new Set(d0).size, d0.length, "no repeat on day 1");
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#plan-start");
  assert.equal(await page.locator("#over-banner").count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("when no week started today fits, the sheet says the exact extra cost, recommends Next Monday, and the banner names the start", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({ budget: 60, cooks: 14, diet: { halal: false, vegetarian: true } }) } });
  await openStart(page);
  const warn = await page.textContent("#start-warn");
  assert.match(warn, /Starting today costs RM \d+\.\d\d more than your RM 60 budget/);
  assert.equal(await page.isChecked("input[name=start][value=monday]"), true, "Next Monday is preselected");
  assert.match(await page.textContent("#start-form"), /Recommended/);
  const extra = num(warn.match(/RM \d+\.\d\d/)[0]);
  await page.check("input[name=start][value=today]");
  await page.click("#start-form button[type=submit]");
  await page.waitForSelector(".check-card");
  await page.goto(env.url("app.html#plan"));
  await page.waitForSelector("#over-banner");
  const banner = await page.textContent("#over-banner");
  assert.match(banner, /Starting today put the plan RM \d+\.\d\d over/);
  assert.doesNotMatch(banner, /costs more now than when it was made/);
  assert.equal(num(banner.match(/RM \d+\.\d\d over your/)[0]), extra, "banner and sheet agree on the amount");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("receipt: a line naming a different dish is flagged, unticked, and its price is not saved", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({}) } });
  await page.goto(env.url("app.html#receipt"));
  await page.waitForSelector("#rc-text");
  await page.fill("#rc-text", "Nasi Lemak Ayam Goreng Berempah 9.50\nTeh tarik 2.20");
  await settle(page);
  await page.click("#rc-text-form button[type=submit]");
  await page.waitForSelector("#rc-prices");
  const nl = page.locator("#rc-prices .check-line", { hasText: "Nasi lemak" });
  assert.match(await nl.textContent(), /Not the same meal\?/);
  assert.equal(await nl.locator("input").isChecked(), false);
  const teh = page.locator("#rc-prices .check-line", { hasText: "Teh tarik" });
  assert.doesNotMatch(await teh.textContent(), /Not the same meal/);
  await teh.locator("input").check();
  await page.click("#rc-form button[type=submit]");
  const check = await page.waitForSelector("#rc-total-check, .rw-head", { timeout: 5000 });
  if (await check.evaluate(el => el.id === "rc-total-check")) await page.click("#rc-total-check [data-total]");
  await page.waitForSelector(".rw-head");
  const pr = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-prices")));
  assert.equal(pr.meals.tehtarik, 2.2);
  assert.equal(pr.meals.nasilemak, undefined, "the berempah set never becomes the nasi lemak price");
  assert.deepEqual(errors, []);
  await ctx.close();
});
