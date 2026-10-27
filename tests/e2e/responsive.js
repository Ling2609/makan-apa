// Every screen at 360 / 390 / 768 / 1024 / 1440 px in one colour scheme: axe (0 serious or
// critical), no sideways scrolling, no clipped text, 44px targets, no script errors.
// Saved states are recorded once by playing through the app, then loaded per width.
const assert = require("node:assert/strict");
const CC = require("../../js/classcode.js");
const RCF = require("../fixtures/receipts.js");
const { WIDTHS, setup, settle, checkScreen, finishSetup, onboard, openMore, decide, playWeek, snapshotStorage } = require("./helpers");

module.exports = function responsiveSuite(test, colorScheme) {
  const env = setup(test);
  const states = {};

  let recording = null;
  const record = async () => {
    const { page, ctx } = await env.newPage({ width: 1440, height: 900 });
    await page.goto(env.url("app.html#week"));
    await onboard(page);
    for (let i = 0; i < 6; i++) await decide(page, i % 2);
    states.mid = await snapshotStorage(page);
    await playWeek(page);
    states.report = await snapshotStorage(page);
    await page.goto(env.url("app.html#plan"));
    await page.waitForSelector("#plan-start");
    await settle(page);
    await page.click("#plan-start");
    await page.locator("#start-form button[type=submit]").click();
    await page.waitForSelector(".seg[data-status=planned]");
    await settle(page);
    await page.locator(".seg[data-status=planned]").first().click();
    states.today = await snapshotStorage(page);
    // Tools: two receipts this week, two stalls, a class of 12 codes, a past week
    const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    const codes = Array.from({ length: 12 }, (_, i) => CC.encodeStudent(CC.studentValues({ report: { spent: 80 + i * 6, budget: 120, co2: 8 + i * 0.7, fvDaysMet: i % 8, archetypeId: CC.ARCHETYPES[i % 7] },
      budget: 120, kitchen: "shared", goal: "money", quizAsked: true, quizRight: i % 4, swaps: i % 3, adherence: 60 + i }, () => (i + 1) / 13), "BIO101"));
    states.tools = { ...states.today,
      "eft2-spend": JSON.stringify([
        { id: "rcpt0001", date: day(0), store: "Restoran Pelita", items: [{ label: "Roti Canai", rm: 3.2, category: "meal", mealId: "roticanai" }, { label: "Teh Tarik", rm: 2.8, category: "drink" }, { label: "Delivery fee", rm: 4.99, category: "fees" }], total: 10.99, source: "receipt" },
        { id: "rcpt0002", date: day(0), store: "Mydin Mart", items: [{ label: "Beras Tempatan 5kg", rm: 13, category: "groceries", packId: "rice" }, { label: "Telur Gred B 10biji", rm: 4.2, category: "groceries", packId: "eggs" }], total: 17.2, source: "receipt" }]),
      "eft2-stalls": JSON.stringify([
        { id: "kafe12ab", name: "Kafe Kolej Kediaman 12", area: "Universiti Malaya, near the library", map: "https://maps.app.goo.gl/abc123", items: [{ name: "Nasi lemak ayam berempah", rm: 6.5, date: day(3) }, { name: "Teh tarik", rm: 2.2, date: day(10) }] },
        { id: "mamak777", name: "Mamak Bistro", area: "SS15", items: [{ name: "Roti canai", rm: 1.6, date: day(1) }] }]),
      "eft2-class": JSON.stringify({ codes, tag: "BIO101", challenge: { type: 1, target: 40 } }),
      "eft2-classref": JSON.stringify({ code: CC.encodeClass(CC.classValues(CC.aggregate(codes, { type: 1, target: 40 }), { type: 1, target: 40 }, () => 0.3), "BIO101") }),
      "eft2-history": JSON.stringify([{ start: day(14), plan: JSON.parse(states.today["eft2-plan"]).plan, log: { groceries: true, days: { 0: { L: { status: "skipped" } }, 1: { D: { status: "other", rm: 9, label: "Chicken rice" } } } }, reason: "remade", at: 1 }])
    };
    await ctx.close();
  };
  const ready = () => recording || (recording = record());

  for (const width of WIDTHS) {
    test(`${colorScheme} ${width}px: every screen`, async () => {
      await ready();
      const height = width < 700 ? 844 : 900;
      const L = name => `${colorScheme} ${width} ${name}`;
      const open = async (storage, route) => {
        const s = await env.newPage({ width, height, colorScheme, storage });
        await s.page.goto(env.url(route));
        return s;
      };
      const all = [];

      // Landing, setup, calibration
      let s = await open({}, "index.html");
      all.push(s);
      await checkScreen(s.page, L("landing"));
      await s.page.goto(env.url("app.html#week"));
      await s.page.waitForSelector("#setup-form");
      await checkScreen(s.page, L("setup"));
      for (const step of ["allergies", "kitchen", "budget"]) {
        await settle(s.page);
        await s.page.click("#setup-form button[type=submit]");
        await s.page.waitForSelector(`#setup-form[data-step=${step}]`);
        await checkScreen(s.page, L("setup " + step));
      }
      await settle(s.page);
      await s.page.click("#setup-form button[type=submit]");
      await s.page.waitForSelector("#calib-form");
      await checkScreen(s.page, L("calibration"));

      // A scene mid-week, its result, the receipt sheet (phones/tablets) and settings
      s = await open(states.mid, "app.html#week");
      all.push(s);
      await s.page.waitForSelector("button.option");
      await checkScreen(s.page, L("scene"));
      if (await s.page.locator("#hud-receipt").isVisible()) {
        await settle(s.page);
        await s.page.click("#hud-receipt");
        await s.page.waitForSelector("#sheet[open]");
        await checkScreen(s.page, L("receipt sheet"));
        await s.page.keyboard.press("Escape");
      }
      await settle(s.page);
      await s.page.locator("button.option").first().click();
      await s.page.waitForSelector("#next-btn");
      await checkScreen(s.page, L("result"));
      if (await s.page.locator(".others summary").count()) {
        await s.page.click(".others summary");
        await checkScreen(s.page, L("result compare"));
      }
      await s.page.locator("[data-open-settings]:visible").first().click();
      await s.page.waitForSelector("#settings-form");
      await checkScreen(s.page, L("settings"));

      // Report and plan
      s = await open(states.report, "app.html#report");
      all.push(s);
      await s.page.waitForSelector("#share-btn");
      await checkScreen(s.page, L("report"));
      await s.page.goto(env.url("app.html#plan"));
      await s.page.waitForSelector("#plan-start");
      await checkScreen(s.page, L("plan"));
      await openMore(s.page);
      await checkScreen(s.page, L("plan more menu"));
      await s.page.click("#plan-prices");
      await s.page.waitForSelector("#prices-form");
      await s.page.locator("#prices-form .money-input input").first().fill("123.45");
      await checkScreen(s.page, L("prices sheet"));
      await s.page.keyboard.press("Escape");
      await s.page.waitForFunction(() => !document.getElementById("sheet").open);
      await settle(s.page);
      await s.page.locator("button.pg-cell[data-day]:visible").first().click();
      await s.page.waitForSelector("#sheet[open] button[data-meal]");
      await checkScreen(s.page, L("swap sheet"));

      // Today and the "something else" sheet
      s = await open(states.today, "app.html#today");
      all.push(s);
      await s.page.waitForSelector(".seg[data-status=other]");
      await checkScreen(s.page, L("today"));
      await settle(s.page);
      await s.page.locator(".seg[data-status=other]").nth(1).click();
      await s.page.waitForSelector("#other-form");
      await checkScreen(s.page, L("other sheet"));

      // Past weeks, and the in-page confirm before a remake throws away ticks
      s = await open(states.tools, "app.html#today");
      all.push(s);
      await s.page.waitForSelector(".past-weeks");
      await s.page.click(".past-weeks > summary");
      await s.page.evaluate(() => window.scrollTo(0, 0)); // the sticky header over a scrolled-past control is not a real overlap
      await checkScreen(s.page, L("today past weeks"));
      await s.page.goto(env.url("app.html#plan"));
      await s.page.waitForSelector("#plan-start");
      await openMore(s.page);
      await settle(s.page);
      await s.page.click("#plan-redo");
      await s.page.waitForSelector("#confirm-drop");
      await checkScreen(s.page, L("plan remake confirm"));

      // Tools
      await s.page.goto(env.url("app.html#tools"));
      await s.page.waitForSelector(".tool-list");
      await checkScreen(s.page, L("tools"));
      await s.page.goto(env.url("app.html#receipt"));
      await s.page.waitForSelector("#rc-text");
      await checkScreen(s.page, L("receipt start"));
      await s.page.fill("#rc-text", RCF.noisyMamak);
      await settle(s.page);
      await s.page.click("#rc-text-form button[type=submit]");
      await s.page.waitForSelector("#rc-form");
      // the widest amounts a student types still fit their boxes at every width
      await s.page.fill("#rl-rm-0", "1234.56");
      await s.page.fill("#rc-total", "1999.99");
      await s.page.evaluate(() => window.scrollTo(0, 0)); // typing scrolled the sticky header over the first line
      await checkScreen(s.page, L("receipt confirm"));
      await s.page.click("#rc-cancel");
      await s.page.goto(env.url("app.html#realweek"));
      await s.page.waitForSelector(".rw-totals");
      await checkScreen(s.page, L("real week"));
      await s.page.goto(env.url("app.html#stalls"));
      await s.page.waitForSelector(".stall-card");
      await checkScreen(s.page, L("stalls"));
      await settle(s.page);
      await s.page.click("[data-edit]");
      await s.page.waitForSelector("#stall-form");
      await s.page.fill("#sf-p-0", "199.90");
      await checkScreen(s.page, L("stall sheet"));
      await s.page.keyboard.press("Escape");
      await s.page.waitForFunction(() => !document.getElementById("sheet").open);
      await settle(s.page);
      await s.page.click("#stall-share");
      await s.page.waitForSelector("#share-qr .qr");
      await checkScreen(s.page, L("stall share"));
      await s.page.keyboard.press("Escape");
      await s.page.goto(env.url("app.html#class"));
      await s.page.waitForSelector("#code-form");
      await settle(s.page);
      await s.page.click("#code-form button[type=submit]");
      await s.page.waitForSelector("#code-qr .qr");
      await checkScreen(s.page, L("class student"));
      await settle(s.page);
      await s.page.click("#tab-lecturer");
      await s.page.waitForSelector(".class-picture");
      await s.page.click("#sum-make");
      await s.page.waitForSelector("#sum-qr .qr");
      await checkScreen(s.page, L("class lecturer"));

      // Makan Apa?: Home, Pick (with the Adjust panel and a logged pick), friends, Learn
      s = await open({ ...states.tools, "ma-picks": JSON.stringify({ guideDone: false }), "eft2-profile": JSON.stringify({ ...JSON.parse(states.tools["eft2-profile"]), diet: { halal: true, vegetarian: false, allergies: ["peanut", "crustacean"] } }) }, "app.html#home");
      all.push(s);
      await s.page.waitForSelector("#pick-now");
      await checkScreen(s.page, L("home"));
      await s.page.goto(env.url("app.html#pick?slot=D"));
      await s.page.waitForSelector("#eat-this");
      await checkScreen(s.page, L("pick"));
      await settle(s.page);
      await s.page.click("#not-this");
      await checkScreen(s.page, L("pick not this"));
      await s.page.click("#adjust-btn");
      await s.page.waitForSelector("#adjust-form");
      await checkScreen(s.page, L("adjust sheet"));
      await s.page.click("#adjust-form button[type=submit]");
      await s.page.waitForSelector("#eat-this");
      await settle(s.page);
      await s.page.click("#eat-this");
      await s.page.waitForSelector(".logged");
      await checkScreen(s.page, L("pick logged"));
      await s.page.goto(env.url("app.html#friends"));
      await s.page.waitForSelector("#fr-form");
      await checkScreen(s.page, L("friends"));
      await s.page.click("[data-edit='1']");
      await s.page.waitForSelector("#person-form");
      await checkScreen(s.page, L("friend sheet"));
      await s.page.click("#person-form button[type=submit]");
      await settle(s.page);
      await s.page.click("#fr-form button[type=submit]");
      await s.page.waitForSelector(".pick-card.group, .banner.warn");
      await checkScreen(s.page, L("friends result"));
      for (const r of ["learn", "goals", "goal?id=eyes", "goal?id=iron&tab=know", "swaps?i=1", "pairs?f=myth", "cook", "heroes?i=3", "quiz", "plate"]) {
        await s.page.goto(env.url("app.html#" + r));
        await s.page.waitForSelector("main h1");
        await checkScreen(s.page, L(r));
      }

      for (const x of all) { assert.deepEqual(x.errors, [], L("script errors")); await x.ctx.close(); }
    });
  }
};
