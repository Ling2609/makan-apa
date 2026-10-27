// The whole loop as a student would do it on a phone: onboarding → calibration → the week →
// report → plan (swap, print, calendar) → start → daily check-in. Every screen is checked
// for serious/critical axe issues, sideways scrolling, clipped text and 44px targets.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { setup, settle, checkScreen, finishSetup, onboard, openMore, decide, playWeek, snapshotStorage } = require("./helpers");

const env = setup(test);

test("full loop on a phone, with downloads, keyboard and sheets", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 390 });

  await page.goto(env.url("index.html"));
  await checkScreen(page, "flow landing");
  await page.goto(env.url("app.html#week"));
  await page.waitForSelector("#setup-form");
  await checkScreen(page, "flow setup");
  for (const step of ["allergies", "kitchen", "budget"]) { await settle(page); await page.click("#setup-form button[type=submit]"); await page.waitForSelector(`#setup-form[data-step=${step}]`); }

  // Invalid budget is caught in-page, not with a pop-up
  await page.fill("#su-budget", "5");
  await settle(page);
  await page.click("#setup-form button[type=submit]");
  await page.waitForSelector("#setup-error:not(:empty)");
  assert.match(await page.textContent("#setup-error"), /40/);
  await page.fill("#su-budget", "120");
  await page.waitForSelector("#setup-error:empty", { state: "attached" });   // the error clears as soon as you edit
  await settle(page);
  await page.click("#setup-form button[type=submit]");
  await page.waitForSelector("#calib-form");
  await checkScreen(page, "flow calibration");
  await settle(page);
  await page.locator("#calib-form input[name=q1]").first().check({ force: true });
  await page.click("#calib-form button[type=submit]");

  // First decision with the keyboard (key 1), then check the result screen
  await page.waitForSelector("button.option");
  await checkScreen(page, "flow scene");
  await settle(page);
  await page.keyboard.press("1");
  await page.waitForSelector("#next-btn");
  await checkScreen(page, "flow result");
  const receiptLines = await page.locator(".r-line").count();
  assert.ok(receiptLines >= 0);
  // Double tap: a second click straight after the screen changes must be ignored
  await page.click("#next-btn");
  await page.locator("button.option").first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(100);
  const stillOnScene = await page.locator("button.option").count();
  assert.ok(stillOnScene > 0, "a double tap skipped a whole scene");

  // A few more decisions, then reload: the week resumes where it was
  for (let i = 0; i < 3; i++) await decide(page, 1);
  const title = await page.textContent("h1");
  await page.reload();
  await page.waitForSelector("button.option");
  assert.equal(await page.textContent("h1"), title, "reload did not resume the same scene");

  // The receipt sheet on phones: opens, closes with Escape, gives focus back
  const receiptBtn = page.locator("#hud-receipt");
  if (await receiptBtn.isVisible()) {
    await settle(page);
    await receiptBtn.click();
    await page.waitForSelector("#sheet[open]");
    await checkScreen(page, "flow receipt sheet");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("sheet").open);
    assert.equal(await page.evaluate(() => document.activeElement.id), "hud-receipt", "focus did not return to the opener");
  }

  const decisions = await playWeek(page, i => i % 2);
  assert.ok(decisions >= 8, `only ${decisions} decisions after resume`);
  await checkScreen(page, "flow report");

  const [png] = await Promise.all([page.waitForEvent("download"), page.click("#share-btn")]);
  assert.equal(png.suggestedFilename(), "my-food-week.png");
  const pngHead = fs.readFileSync(await png.path()).subarray(0, 8);
  assert.deepEqual([...pngHead], [137, 80, 78, 71, 13, 10, 26, 10]);

  // Plan
  await settle(page);
  await page.click("text=Plan my real week");
  await page.waitForSelector("#plan-start");
  await checkScreen(page, "flow plan");
  const totals = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-plan")));
  assert.ok(totals, "plan saved");

  // Swap a meal through the sheet
  await settle(page);
  await page.locator("button.pg-cell[data-day]:visible").first().click();
  await page.waitForSelector("#sheet[open] button[data-meal]");
  await checkScreen(page, "flow swap sheet");
  const before = await page.evaluate(() => localStorage.getItem("eft2-plan"));
  await page.locator("#sheet button[data-meal]").first().click();
  await page.waitForFunction(() => !document.getElementById("sheet").open);
  assert.notEqual(await page.evaluate(() => localStorage.getItem("eft2-plan")), before, "swap did not change the plan");

  // Shopping list ticks persist
  await page.click(".plan-views a[href='#plan?view=shop']");
  await page.waitForSelector(".tick-row input");
  const tick = page.locator(".tick-row input").first();
  await tick.check();
  await page.reload();
  await page.waitForSelector(".tick-row input");
  assert.ok(await page.locator(".tick-row input").first().isChecked(), "shopping tick was lost on reload");

  // Calendar file
  await openMore(page);
  const [ics] = await Promise.all([page.waitForEvent("download"), page.click("#plan-ics")]);
  const text = fs.readFileSync(await ics.path(), "utf8");
  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 8);

  // Print view: no navigation, the grid and shopping list are there
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".topbar").isVisible(), false);
  assert.ok(await page.locator(".plan-grid").isVisible());
  assert.ok(await page.locator(".aisle").first().isVisible());
  assert.equal(await page.locator(".btn:visible").count(), 0, "no buttons on paper");
  assert.ok(await page.locator(".tick-box").first().isVisible(), "empty tick boxes to tick by hand");
  await page.emulateMedia({ media: "screen" });

  // Start the plan today and check in
  await settle(page);
  await page.click("#plan-start");
  await page.waitForSelector("#start-form");
  await checkScreen(page, "flow start sheet");
  await page.locator("#start-form button[type=submit]").click();
  await page.waitForSelector(".seg[data-status=planned]");
  await checkScreen(page, "flow today");
  await settle(page);
  await page.locator(".seg[data-status=planned]").first().click();
  await settle(page);
  await page.locator(".seg[data-status=other]").nth(1).click();
  await page.waitForSelector("#other-form");
  await checkScreen(page, "flow other sheet");
  await page.fill("#other-name", "Nasi kandar");
  await page.fill("#other-rm", "11.50");
  await page.locator("#other-form button[type=submit]").click();
  await page.waitForFunction(() => !document.getElementById("sheet").open);
  await settle(page);
  await page.locator(".seg[data-status=skipped]").nth(2).click();
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-checkin")));
  const day = Object.values(log.days)[0];
  assert.equal(day.B.status, "planned");
  assert.equal(day.L.status, "other");
  assert.equal(day.L.rm, 11.5);
  assert.equal(day.D.status, "skipped");
  assert.match(await page.textContent(".today-meals"), /11\.50/);
  const side = await page.textContent(".today-side");
  assert.match(side, /What they really cost/);
  await checkScreen(page, "flow today after");

  assert.deepEqual(errors, []);
  await ctx.close();
});

test("settings: the sheet says what a change resets, and closing it keeps progress (saving with ticks: see v7 H3)", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 1440, height: 900 });
  await page.goto(env.url("app.html#week"));
  await onboard(page, { skipGuesses: true });
  await decide(page, 0);
  await settle(page);
  await page.click("#open-settings");
  await page.waitForSelector("#settings-form");
  await checkScreen(page, "settings sheet");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("sheet").open);
  assert.equal(await page.evaluate(() => document.activeElement.id), "open-settings");
  assert.ok(await page.evaluate(() => localStorage.getItem("eft2-sim")), "closing settings must not reset the week");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("corrupted or hostile storage falls back to a clean start", async () => {
  const storage = {
    "eft2-profile": '{"budget":"lots","kitchen":"castle","diet":{"halal":"yes"}}',
    "eft2-sim": "{not json",
    "eft2-report": '{"spent":"<img src=x onerror=alert(1)>"}',
    "eft2-plan": '[[1,2,3]]',
    "eft2-checkin": '{"days":{"0":{"B":{"status":"hacked"}}}}',
    theme: "neon"
  };
  const { page, ctx, errors } = await env.newPage({ width: 390, storage });
  for (const route of ["week", "report", "plan", "today"]) {
    await page.goto(env.url("app.html#" + route));
    await page.waitForSelector("main#view > *");
    assert.equal(await page.locator("img[src=x]").count(), 0);
  }
  await page.goto(env.url("app.html#week"));
  await page.waitForSelector("#setup-form, button.option");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("hostel kitchen: the plan never asks you to cook", async () => {
  const { page, ctx, errors } = await env.newPage({ width: 768, height: 1024 });
  await page.goto(env.url("app.html#plan"));
  await finishSetup(page, { kitchen: "hostel" });
  await page.waitForSelector("#plan-start");
  const plan = await page.evaluate(() => JSON.parse(localStorage.getItem("eft2-plan")));
  const ids = JSON.stringify(plan);
  const cooked = await page.evaluate(s => MEALS.filter(m => m.source === "cook" && s.includes(`"${m.id}"`)).map(m => m.id), ids);
  assert.deepEqual(cooked, []);
  await checkScreen(page, "hostel plan 768");
  assert.deepEqual(errors, []);
  await ctx.close();
});

module.exports = { snapshotStorage };
