// Makan Apa? in the browser: first run, Pick for me end to end, allergies on screen, friends, Learn pages, quiz.
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, settle, checkScreen, finishSetup } = require("./helpers");

const env = setup(test);
const profile = over => JSON.stringify({ budget: 120, kitchen: "shared", goal: "money", diet: { halal: true, vegetarian: false, noBeef: false, allergies: [] }, campusLunch: false, breakfast: true, cooks: 6, rahmah: false, preset: "normal", ...over });

test("first run: 4 short steps, allergies saved, then Home with one big pick button and a guide", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390 });
  await page.goto(env.url("app.html"));
  await page.waitForSelector("#setup-form[data-step=rules]");
  assert.match(await page.textContent(".promise"), /one meal for you/);
  await finishSetup(page, { allergies: ["peanut", "crustacean"], kitchen: "hostel", budget: 90 });
  await page.waitForSelector("#pick-now");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-profile")));
  assert.deepEqual(saved.diet.allergies.sort(), ["crustacean", "peanut"]);
  assert.equal(saved.kitchen, "hostel");
  assert.equal(saved.budget, 90);
  assert.equal(await page.locator(".guide").count(), 0, "the dedicated walkthrough replaces the old inline guide");
  await checkScreen(page, "makan home first run 390");
  const primary = await page.locator("#pick-now").boundingBox();
  assert.ok(primary && primary.y + primary.height < 774, "Primary meal action is above the phone navigation");
  // Full first-visit walkthrough coverage lives in tour.test.js.
  assert.equal(await page.locator(".guide").count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("pick → I'll eat this → Home shows it, money goes down, and the next pick is a different meal", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile(), "ma-picks": JSON.stringify({ guideDone: true }) } });
  await page.goto(env.url("app.html#pick?slot=D"));
  await page.waitForSelector("#eat-this");
  const first = (await page.textContent("#pc-name")).trim();
  const price = await page.textContent(".pc-price");
  assert.match(price, /RM \d+\.\d\d/);
  await settle(page);
  await page.click("#eat-this");
  await page.waitForSelector(".logged");
  assert.match(await page.textContent(".logged"), new RegExp(first.replace(/[()+.*?[\]\\]/g, "\\$&")));
  await page.goto(env.url("app.html#home"));
  await page.waitForSelector(".slot-pill.eaten");
  assert.match(await page.textContent(".slot-pill.eaten"), new RegExp(first.slice(0, 12).replace(/[()+.*?[\]\\]/g, "\\$&")));
  assert.doesNotMatch(await page.textContent(".gauge"), /RM 120\.00/, "the week's money went down");
  // The same dinner isn't picked again today
  await page.goto(env.url("app.html#pick?slot=D"));
  await page.waitForSelector("#pc-name, .logged, .banner");
  if (await page.locator("#pc-name").count()) assert.notEqual((await page.textContent("#pc-name")).trim(), first);
  // Remove it from Home
  await page.goto(env.url("app.html#home"));
  await settle(page);
  await page.click(".slot-pill.eaten");
  await page.waitForSelector("#lg-remove");
  await page.click("#lg-remove");
  await page.waitForFunction(() => !document.querySelector(".slot-pill.eaten"));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("allergies: no pick, backup or log option ever shows a meal with the allergen", async () => {
  const al = ["gluten", "egg", "crustacean"];
  const { page, ctx, errors } = await env.newPage({ width: 1024, height: 900, storage: { "eft2-profile": profile({ diet: { halal: true, allergies: al } }), "ma-picks": JSON.stringify({ guideDone: true }) } });
  for (const slot of ["B", "L", "D", "S"]) for (let n = 0; n < 4; n++) {
    await page.goto(env.url(`app.html#pick?slot=${slot}`));
    await page.waitForSelector("#pick-out");
    for (let k = 0; k < n; k++) { await settle(page); if (await page.locator("#surprise").count()) await page.click("#surprise"); }
    const names = await page.$$eval("#pc-name, .bk-name", els => els.map(e => e.textContent.trim()));
    const bad = await page.evaluate(([list, al]) => list.filter(n => { const m = MEALS.find(x => x.name === n); return m && allergenHits(m, al).length; }), [names, al]);
    assert.deepEqual(bad, [], `slot ${slot}`);
  }
  await page.goto(env.url("app.html#home"));
  await page.waitForSelector(".slot-pill");
  await settle(page);
  await page.click(".slot-pill >> nth=1");
  await page.waitForSelector("#log-list");
  const logged = await page.$$eval("#log-list button.pick", els => els.map(e => e.dataset.meal));
  const badLog = await page.evaluate(([ids, al]) => ids.filter(id => allergenHits(mealById(id), al).length), [logged, al]);
  assert.deepEqual(badLog, []);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Not this → Too pricey finds something cheaper, or says it's already the cheapest", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile(), "ma-picks": JSON.stringify({ guideDone: true }) } });
  await page.goto(env.url("app.html#pick?slot=L"));
  await page.waitForSelector("#eat-this");
  for (let i = 0; i < 12; i++) {
    const before = Number((await page.textContent(".pc-price")).match(/RM ([\d.]+)/)[1]);
    await settle(page);
    await page.click("#not-this");
    await page.click("[data-not=price]");
    await page.waitForSelector("#pick-out");
    if (await page.locator("#pick-note").count()) { assert.match(await page.textContent("#pick-note"), /already the cheapest/); assert.equal(await page.locator("#eat-this").count(), 1, "the pick stays"); break; }
    const after = Number((await page.textContent(".pc-price")).match(/RM ([\d.]+)/)[1]);
    assert.ok(after < before, `${after} < ${before}`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("friends: edit a friend in the panel, the result page respects everyone", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, storage: { "eft2-profile": profile({ diet: { halal: true, allergies: ["peanut"] } }) } });
  await page.goto(env.url("app.html#friends?slot=D"));
  await page.waitForSelector("#fr-form");
  await settle(page);
  await page.click("[data-edit='1']");
  await page.waitForSelector("#person-form");
  await page.fill("#pf-name", "Aina");
  await page.locator(".pf-allergy[value=milk]").check({ force: true });
  await page.locator("#pf-veg").check({ force: true });
  await page.click("#person-form button[type=submit]");
  await page.waitForSelector(".person-row >> text=Aina");
  assert.match(await page.textContent(".people"), /vegetarian/);
  await settle(page);
  await page.click("#fr-form button[type=submit]");
  await page.waitForSelector(".pick-card.group, .banner.warn");
  const text = await page.textContent("main");
  if (await page.locator(".pick-card.group").count()) {
    assert.match(text, /no peanuts, milk|no milk, peanuts/i);
    const name = (await page.textContent(".pick-card.group h2")).trim();
    const ok = await page.evaluate(n => { const m = MEALS.find(x => x.name === n); return m && allergenHits(m, ["peanut", "milk"]).length === 0 && mealStats(m).meats.length === 0; }, name);
    assert.ok(ok, name);
  }
  await page.goBack();
  await page.waitForSelector("#fr-form");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Learn: one card per screen with Previous/Next, a goal's 'too pricey' jumps to a cheaper food, quiz scores", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390 });
  await page.goto(env.url("app.html#swaps"));
  await page.waitForSelector(".pager-card");
  assert.match(await page.textContent(".pager-count"), /^1 of \d+/);
  await settle(page);
  await page.click(".pager-nav a[rel=next]");
  await page.waitForFunction(() => /^2 of/.test(document.querySelector(".pager-count").textContent));
  await page.goto(env.url("app.html#pairs?f=myth"));
  await page.waitForSelector(".verdict.myth");
  assert.equal(await page.locator(".verdict:not(.myth)").count(), 0);
  // A pricier food on the eyes page offers a cheaper one (sweet potato is wet market; kangkung is everywhere)
  await page.goto(env.url("app.html#goal?id=eyes&i=3"));
  await page.waitForSelector("[data-hard]");
  await settle(page);
  await page.click("[data-hard]");
  await page.waitForSelector("[role=status] >> text=Instead of");
  // Quiz: answer 5, see a score
  await page.goto(env.url("app.html#quiz"));
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector("[data-ans]");
    await settle(page);
    await page.locator("[data-ans]").first().click();
    await page.waitForSelector("#next-q");
    assert.match(await page.textContent(".quiz-explain"), /per 100 g/);
    await page.click("#next-q");
  }
  await page.waitForSelector("#again");
  assert.match(await page.textContent("main h1"), /^\d\/5$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("phone layouts have no horizontal overflow; compact tools fit and editorial screens scroll", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390, height: 844, storage: { "eft2-profile": profile({ diet: { halal: true, allergies: ["peanut"] } }), "ma-picks": JSON.stringify({ guideDone: true }) } });
  const over = {};
  for (const r of ["home", "pick?slot=L", "friends", "learn", "goals", "goal?id=bones", "swaps", "pairs", "cook", "heroes", "quiz", "plate"]) {
    await page.goto(env.url("app.html#" + r));
    await page.waitForSelector("main h1", { state: "attached" });
    await page.waitForTimeout(150);
    const d = await page.evaluate(() => document.getElementById("view").scrollHeight - document.getElementById("view").clientHeight);
    const editorial = ["home", "pick?slot=L", "learn"].includes(r);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${r}: no sideways scrolling`);
    if (!editorial && d > 40) over[r] = d;
    if (r === "pick?slot=L") { await page.locator("#eat-this").scrollIntoViewIfNeeded(); assert.ok(await page.locator("#eat-this").isVisible()); }
  }
  assert.deepEqual(over, {}, "pages that need scrolling");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Home mood shortcuts carry quick, light and cook preferences into a valid meal pick', async () => {
  const {page,ctx,errors} = await env.newPage({width:390,storage:{'eft2-profile':profile({diet:{halal:true,allergies:['peanut']}})}});
  for(const mode of ['quick','light','cook']) {
    await page.goto(env.url('app.html#home'));
    await page.locator(`[data-quick-mood="${mode}"]`).click();
    await page.waitForSelector('#pc-name');
    const state=await page.evaluate(()=>{
      const p=loadProfile(),m=MEALS.find(x=>x.name===document.querySelector('#pc-name').textContent);
      return {opts:JSON.parse(localStorage.getItem('ma-picks')).opts,valid:fitsDiet(m,p.diet)&&fitsKitchen(m,p.kitchen),minutes:m.min,source:m.source};
    });
    assert.ok(state.valid);
    if(mode==='quick')assert.ok(state.minutes<=15);
    if(mode==='light')assert.equal(state.opts.mood,'light');
    if(mode==='cook')assert.notEqual(state.source,'buy');
  }
  assert.deepEqual(errors,[]);await ctx.close();
});
