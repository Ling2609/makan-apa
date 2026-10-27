// Unit tests — run with: npm run test:unit   (Node 18+, no browser needed)
const test = require("node:test");
const assert = require("node:assert/strict");

const F = require("../js/foods.js");
const St = require("../js/storage.js");
const W = require("../js/week.js");
const S = require("../js/sim.js");
const R = require("../js/report.js");
const P = require("../js/planner.js");
const C = require("../js/checkin.js");

const profile = over => St.validateProfile({ ...St.defaultProfile(), ...over });
const PROFILES = [];
for (const kitchen of ["hostel", "shared", "home"]) for (const vegetarian of [false, true]) for (const halal of [true, false])
  for (const goal of ["money", "health", "planet"]) PROFILES.push(profile({ kitchen, goal, diet: { halal, vegetarian } }));

// Deterministic pseudo-random for fuzzing
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function playWeek(p, pickIndex) {
  const s = S.newSim(p);
  S.advance(s);
  s.guesses = {};
  let n = 0;
  while (!s.done) {
    const opts = S.visibleOptions(s, S.currentScene(s)).filter(o => o.available);
    S.choose(s, opts[pickIndex(opts.length, n)].id);
    n++;
  }
  return { s, n };
}

// ================= foods.js =================
test("every meal recipe uses known ingredients and every non-buy ingredient has a grocery pack", () => {
  F.MEALS.forEach(m => {
    assert.doesNotThrow(() => F.mealStats(m), m.id);
    if (m.source !== "buy") m.recipe.forEach(p => assert.ok(F.PACKS[p.id] || ["oil", "sugar", "water"].includes(p.id), `${m.id}: no pack for ${p.id}`));
    if (m.source === "buy") assert.ok(typeof m.price === "number" && m.price >= 0, `${m.id} needs a price`);
  });
});

test("meal ids are unique and slots are valid", () => {
  assert.equal(new Set(F.MEALS.map(m => m.id)).size, F.MEALS.length);
  F.MEALS.forEach(m => m.slots.forEach(s => assert.ok(["B", "L", "D", "S", "X"].includes(s), m.id)));
});

test("mealStats: footprint and cost are computed from the data", () => {
  const nl = F.mealStats(F.mealById("nasilemak"));
  const expected = (75 * 4.45 + 25 * 4.67 + 15 * 3.23 + 10 * 13.63 + 20 * 0.53 + 5 * 7.32) / 1000;
  assert.ok(Math.abs(nl.co2 - expected) < 0.001);
  assert.equal(nl.rm, 3.68);
  assert.equal(nl.fv, 20);
  const efr = F.mealStats(F.mealById("eggfriedrice"));
  const cost = 75 * 2.6 / 1000 + 100 * 5.5 / 500 + 120 * 4 / 500 + 10 * 2.5 / 1000;
  assert.ok(Math.abs(efr.rm - Math.round(cost * 100) / 100) < 0.011);
});

test("diet rules: halal excludes pork only, vegetarian excludes all meat and fish", () => {
  const pork = { source: "buy", price: 5, recipe: [{ id: "pork", g: 100 }] };
  assert.equal(F.fitsDiet(pork, { halal: true }), false);
  assert.equal(F.fitsDiet(pork, { halal: false }), true);
  assert.equal(F.fitsDiet(F.mealById("chickenrice"), { halal: true, vegetarian: true }), false);
  assert.equal(F.fitsDiet(F.mealById("nasilemak"), { halal: true, vegetarian: true }), false, "ikan bilis is fish");
  assert.equal(F.fitsDiet(F.mealById("ecoriceegg"), { halal: true, vegetarian: true }), true, "eggs are fine");
});

test("kitchen rules: hostel can't cook, shared can", () => {
  assert.equal(F.fitsKitchen(F.mealById("eggfriedrice"), "hostel"), false);
  assert.equal(F.fitsKitchen(F.mealById("oatsbanana"), "hostel"), true);
  assert.equal(F.fitsKitchen(F.mealById("eggfriedrice"), "shared"), true);
});

test("sourced prices match their sources", () => {
  assert.equal(F.PACKS.rice.rm, 2.6);
  assert.equal(F.PACKS.rice.g, 1000);
  assert.equal(F.mealById("nasilemak").price, 3.68);
  assert.equal(F.PACKS.beef.rm, 18.92); // RM37.84/kg × 0.5 kg (DOSM 2024)
});

// ================= storage.js =================
test("validateProfile accepts good input and rejects bad input", () => {
  assert.deepEqual(St.validateProfile(St.defaultProfile()), St.defaultProfile());
  for (const bad of [null, 5, "x", [], {}, { ...St.defaultProfile(), budget: 10 }, { ...St.defaultProfile(), budget: 9999 },
    { ...St.defaultProfile(), budget: "abc" }, { ...St.defaultProfile(), kitchen: "castle" }, { ...St.defaultProfile(), goal: "fame" }]) {
    assert.equal(St.validateProfile(bad), null, JSON.stringify(bad));
  }
});

test("validateProfile cleans fields: hostel cooks nothing, cooks clamped, halal defaults on", () => {
  const p = St.validateProfile({ budget: 100, kitchen: "hostel", goal: "money", cooks: 9 });
  assert.equal(p.cooks, 0);
  assert.equal(p.diet.halal, true);
  assert.equal(St.validateProfile({ budget: 100, kitchen: "shared", goal: "money", cooks: 99 }).cooks, 6);
});

// ================= sim.js =================
test("every profile can play a full week: 21 meals, at least 2 options per scene, rules respected (fuzz)", () => {
  PROFILES.forEach((p, pi) => {
    for (let run = 0; run < 25; run++) {
      const r = rng(pi * 1000 + run);
      const s = S.newSim(p);
      S.advance(s);
      let n = 0;
      while (!s.done) {
        const sc = S.currentScene(s);
        const opts = S.visibleOptions(s, sc).filter(o => o.available);
        const locked = S.visibleOptions(s, sc).some(o => o.broke);
        assert.ok(opts.length >= (locked ? 1 : 2), `${sc.id} has ${opts.length} options for ${JSON.stringify(p)}`);
        const pick = opts[Math.floor(r() * opts.length)];
        S.choose(s, pick.id);
        if (pick.kind !== "borrow") n++;
      }
      assert.ok(n >= 13 && n <= 17, `decisions ${n}`);
      assert.ok(S.totals(s).spent <= p.budget + s.borrowed + 1e-9, "never spends money it does not have");
      const meals = s.lines.filter(l => ["B", "L", "D"].includes(l.slot) && l.day >= 0 && l.kind !== "borrow");
      assert.equal(meals.length, 21);
      s.lines.forEach(l => {
        if (!l.mealId) return;
        const m = F.mealById(l.mealId);
        assert.ok(F.fitsDiet(m, p.diet), `${m.id} breaks diet`);
        assert.ok(F.fitsKitchen(m, p.kitchen), `${m.id} breaks kitchen`);
      });
      Object.values(s.inventory).forEach(g => assert.ok(g >= 0));
      assert.equal(S.totals(s).spent, Math.round(s.lines.reduce((a, l) => a + l.cash, 0) * 100) / 100);
    }
  });
});

test("habits: the Monday breakfast repeats on days without a breakfast decision", () => {
  const s = S.newSim(profile({ kitchen: "hostel" }));
  S.advance(s);
  S.choose(s, "none");                       // no shop
  assert.equal(S.currentScene(s).id, "mon-b");
  S.choose(s, "kopitiam");                  // kaya toast
  while (!s.done) S.choose(s, S.visibleOptions(s, S.currentScene(s)).filter(o => o.available)[0].id);
  const tueB = s.lines.find(l => l.day === 1 && l.slot === "B");
  assert.equal(tueB.mealId, "kayatoast");
  assert.equal(tueB.kind, "habit");
});

test("groceries carry forward: home meals use stock and cost nothing when eaten", () => {
  const s = S.newSim(profile({ kitchen: "shared" }));
  S.advance(s);
  S.choose(s, "full");
  assert.equal(S.totals(s).grocery, S.basketCost(W.BASKETS.kitchenFull));
  S.choose(s, "prep");
  assert.equal(s.flags.lunchbox, 3);
  S.choose(s, "home");                       // oats + banana from stock
  const line = s.lines[s.lines.length - 1];
  assert.equal(line.cash, 0);
  assert.equal(line.home, true);
  S.choose(s, "box");
  assert.equal(s.flags.lunchbox, 2);
});

test("without groceries, cooking options are shown locked with a reason", () => {
  const s = S.newSim(profile({ kitchen: "shared" }));
  S.advance(s);
  S.choose(s, "none");
  S.choose(s, "stall");
  S.choose(s, "eco-veg");
  const cook = S.sceneOptions(s, S.currentScene(s)).find(o => o.id === "cook");
  assert.equal(cook.available, false);
  assert.match(cook.reason, /didn't shop|Not in your kitchen/);
  assert.throws(() => S.choose(s, "cook"));
});

test("choosing an unknown option throws and changes nothing", () => {
  const s = S.newSim(profile({}));
  S.advance(s);
  const before = JSON.stringify(S.serializeSim(s));
  assert.throws(() => S.choose(s, "nope"));
  assert.equal(JSON.stringify(S.serializeSim(s)), before);
});

test("a careful week stays under budget; a careless one goes over", () => {
  const p = profile({ budget: 120, kitchen: "shared" });
  const careful = playWeek(p, (len, n) => 0); // first available options include groceries + cooking
  const cheapest = (() => {
    const s = S.newSim(p); S.advance(s);
    while (!s.done) {
      const o = S.visibleOptions(s, S.currentScene(s)).filter(x => x.available).sort((a, b) => a.cash - b.cash)[0];
      S.choose(s, o.id);
    }
    return S.totals(s);
  })();
  assert.ok(cheapest.spent < p.budget, `cheapest week ${cheapest.spent}`);
  const spender = (() => {
    const s = S.newSim(p); S.advance(s);
    while (!s.done) {
      const o = S.visibleOptions(s, S.currentScene(s)).filter(x => x.available).sort((a, b) => b.cash - a.cash)[0];
      S.choose(s, o.id);
    }
    return S.totals(s);
  })();
  assert.ok(spender.spent > p.budget, `spender week ${spender.spent}`);
  assert.ok(careful.s.done);
});

test("save and restore mid-week gives the same state (no re-rolls)", () => {
  const p = profile({ kitchen: "shared" });
  const s = S.newSim(p); S.advance(s);
  S.choose(s, "full"); S.choose(s, "prep"); S.choose(s, "home"); S.choose(s, "eco-veg");
  const saved = JSON.parse(JSON.stringify(S.serializeSim(s)));
  const r = S.restoreSim(saved, St.validateProfile);
  assert.equal(r.current, s.current);
  assert.deepEqual(r.inventory, s.inventory);
  assert.equal(r.spent, s.spent);
  assert.equal(r.flags.lunchbox, s.flags.lunchbox);
});

test("restoreSim rejects corrupted saves instead of crashing", () => {
  const p = profile({});
  const s = S.newSim(p); S.advance(s); S.choose(s, "full");
  const good = JSON.parse(JSON.stringify(S.serializeSim(s)));
  const bads = [null, 5, "x", { ...good, v: 1 }, { ...good, cursor: -1 }, { ...good, cursor: 999 }, { ...good, lines: "x" },
    { ...good, lines: [{ cash: "a" }] }, { ...good, profile: { budget: 1 } }, { ...good, decisions: null }];
  bads.forEach(b => assert.equal(S.restoreSim(b, St.validateProfile), null, JSON.stringify(b).slice(0, 60)));
  const weird = { ...good, inventory: { rice: -5, plutonium: 3, eggs: 100 }, flags: { lunchbox: 99, lunchboxMeal: "nope" }, habits: { B: "nope" } };
  const r = S.restoreSim(weird, St.validateProfile);
  assert.deepEqual(r.inventory, { eggs: 100 });
  assert.equal(r.flags.lunchbox, 0);
  assert.equal(r.habits.B, undefined);
});

test("calibration answers are computed from the data, not hard-coded", () => {
  const qs = S.calibrationQuestions();
  assert.equal(qs.length, 3);
  qs.forEach(q => assert.ok(q.options.some(o => o.id === q.answer), q.id));
  const co2 = id => F.mealStats(F.mealById(id)).co2;
  const q1 = qs[0];
  assert.ok(q1.options.every(o => co2(q1.answer) <= co2(o.id)));
});

// ================= report.js =================
test("report totals match the receipt lines and pick an archetype", () => {
  const { s } = playWeek(profile({}), () => 0);
  const r = R.buildReport(s);
  const sum = s.lines.reduce((a, l) => a + l.cash, 0);
  assert.ok(Math.abs(r.totals.spent - sum) < 0.01);
  assert.equal(r.meals, 21);
  assert.ok(r.archetype && r.archetype.name && r.archetype.why);
  assert.ok(r.referenceWeek.co2 > 0);
});

test("over-budget weeks are called out first", () => {
  const p = profile({ budget: 60 });
  const s = S.newSim(p); S.advance(s);
  while (!s.done) {
    const o = S.visibleOptions(s, S.currentScene(s)).filter(x => x.available).sort((a, b) => b.cash - a.cash)[0];
    S.choose(s, o.id);
  }
  const t = S.totals(s);
  assert.ok(t.spent <= 60 + t.borrowed + 1e-9, "spending stops at budget + borrowed");
  assert.ok(["borrowed", "lastringgit"].includes(R.buildReport(s).archetype.id));
});

test("best and worst calls compare against real alternatives", () => {
  const decisions = [
    { kind: "meal", cash: 18, co2: 10, fv: 0, sugary: true, salty: true, label: "Burger", alternatives: [{ label: "Tofu rice", cash: 6, co2: 0.7, fv: 160 }] },
    { kind: "meal", cash: 6, co2: 0.7, fv: 160, label: "Tofu rice", alternatives: [{ label: "Burger", cash: 18, co2: 10, fv: 0, sugary: true, salty: true }] }
  ];
  const r = R.bestAndWorst(decisions, "money");
  assert.equal(r.best.d.label, "Tofu rice");
  assert.equal(r.worst.d.label, "Burger");
  assert.equal(r.worst.bestAlt.label, "Tofu rice");
});

// ================= planner.js =================
test("planner: budget never exceeded when feasible; diet, kitchen and cooking limit always respected", () => {
  for (const p of PROFILES) for (const budget of [50, 80, 120, 200]) {
    const pr = { ...p, budget };
    const r = P.planWeek(pr);
    if (r.feasible) assert.ok(r.totals.outlay <= budget + 1e-9, `${r.totals.outlay} > ${budget}`);
    else assert.ok(r.minOutlay > budget);
    assert.ok(P.varietyOk(r.plan, pr), "variety");
    assert.ok(P.cookedCount(r.plan) <= P.cookLimit(pr));
    r.plan.forEach((day, d) => P.PLAN_SLOTS.forEach(s => {
      if (!P.slotActive(pr, s)) { assert.equal(day[s], null); return; }
      if (s === "S" && !day[s]) return;
      const m = F.mealById(day[s]);
      assert.ok(m, `missing meal d${d}${s}`);
      assert.ok(m.slots.includes(s));
      assert.ok(F.fitsDiet(m, pr.diet), `${m.id} breaks diet`);
      assert.ok(F.fitsKitchen(m, pr.kitchen), `${m.id} breaks kitchen`);
      assert.ok(!m.occasion, `${m.id} is a treat`);
      if (pr.campusLunch && s === "L" && d < 5) assert.notEqual(m.source, "kettle");
    }));
  }
});

test("planner totals are correct: whole packs for groceries plus stall prices", () => {
  const r = P.planWeek(profile({ kitchen: "shared", budget: 120 }));
  let buy = 0;
  const need = {};
  r.plan.forEach(day => P.PLAN_SLOTS.forEach(s => {
    const m = day[s] && F.mealById(day[s]);
    if (!m) return;
    if (m.source === "buy") buy += m.price;
    else m.recipe.forEach(p => { if (!["oil", "sugar", "water"].includes(p.id)) need[p.id] = (need[p.id] || 0) + p.g; });
  }));
  const grocery = Object.keys(need).reduce((a, id) => a + Math.ceil(need[id] / F.PACKS[id].g - 1e-9) * F.PACKS[id].rm, 0);
  assert.ok(Math.abs(r.totals.outlay - (buy + grocery)) < 0.01);
  r.totals.shopping.forEach(i => assert.ok(i.packs * F.PACKS[i.id].g >= i.needG));
});

test("planner is deterministic and goal-sensitive", () => {
  const base = profile({ kitchen: "shared", budget: 150 });
  assert.deepEqual(P.planWeek(base).plan, P.planWeek(base).plan);
  const money = P.planWeek({ ...base, goal: "money" }).totals;
  const health = P.planWeek({ ...base, goal: "health" }).totals;
  const planet = P.planWeek({ ...base, goal: "planet" }).totals;
  assert.ok(money.outlay <= health.outlay && money.outlay <= planet.outlay, "money plan is cheapest");
  assert.ok(health.fvDaysMet >= money.fvDaysMet, "health plan meets WHO's 400 g on at least as many days");
  assert.ok(planet.co2 <= money.co2 + 0.01, "planet plan has the lowest footprint");
});

test("a budget below the cheapest possible week is reported as infeasible", () => {
  const r = P.planWeek(profile({ kitchen: "hostel", budget: 40 }));
  assert.equal(r.feasible, false);
  assert.ok(r.minOutlay > 40);
});

test("instant noodles appear at most twice a week in any plan", () => {
  for (const p of PROFILES) {
    const r = P.planWeek({ ...p, budget: 60 });
    let n = 0;
    r.plan.forEach(day => P.PLAN_SLOTS.forEach(s => { if (day[s] === "instantnoodles") n++; }));
    assert.ok(n <= 2);
  }
});

test("swap options report the true change in weekly totals", () => {
  const p = profile({ kitchen: "shared" });
  const r = P.planWeek(p);
  const opts = P.swapOptions(p, r.plan, 0, "D");
  assert.ok(opts.length > 0);
  const o = opts[0];
  const after = P.evaluate(P.applySwap(r.plan, 0, "D", o.meal.id));
  assert.ok(Math.abs(after.outlay - r.totals.outlay - o.dOutlay) < 0.011);
  assert.equal(after.fv - r.totals.fv, o.dFv);
});

test("validatePlan rejects tampered plans", () => {
  const p = profile({ vegetarian: false });
  const r = P.planWeek(p);
  assert.ok(P.validatePlan({ plan: r.plan, start: "2026-10-26" }, p));
  const bad = JSON.parse(JSON.stringify(r.plan)); bad[0].D = "rendang-fake";
  assert.equal(P.validatePlan({ plan: bad, start: "2026-10-26" }, p), null);
  assert.equal(P.validatePlan({ plan: r.plan, start: "tomorrow" }, p), null);
  const veg = profile({ diet: { halal: true, vegetarian: true } });
  const meat = JSON.parse(JSON.stringify(P.planWeek(veg).plan)); meat[1].L = "chickenrice";
  assert.equal(P.validatePlan({ plan: meat, start: "2026-10-26" }, veg), null);
});

// ================= checkin.js =================
test("planDay counts days across month ends", () => {
  assert.equal(C.planDay("2026-10-30", new Date(2026, 10, 2, 9)), 3);
  assert.equal(C.planDay("2026-10-30", new Date(2026, 9, 29, 23)), -1);
  assert.equal(C.addDays("2026-12-30", 3), "2027-01-02");
});

test("check-in summary: like-for-like maths over logged meals only", () => {
  const p = profile({ kitchen: "shared" });
  const r = P.planWeek(p);
  let log = C.validateLog(null);
  log.groceries = true;
  log = C.record(log, 0, "B", { status: "planned" });
  log = C.record(log, 0, "L", { status: "other", rm: 12, label: "Chicken rice" });
  log = C.record(log, 0, "D", { status: "skipped" });
  const sm = C.summary(r.plan, log, 0);
  assert.equal(sm.logged, 3);
  assert.equal(sm.kept, 1);
  assert.equal(sm.skipped, 1);
  assert.equal(sm.adherence, 33);
  const cost = s => F.mealStats(F.mealById(r.plan[0][s])).rm;
  // planned: the three logged meals at their real cost (stall price or ingredients per portion)
  assert.ok(Math.abs(sm.plannedToDate - (cost("B") + cost("L") + cost("D"))) < 0.01);
  // spent: kept breakfast at its cost + RM 12 instead of lunch + nothing for the skipped dinner
  assert.ok(Math.abs(sm.spentToDate - (cost("B") + 12)) < 0.01);
  assert.ok(Math.abs(sm.difference - (sm.spentToDate - sm.plannedToDate)) < 0.01);
  // cash out of pocket: groceries + bought breakfast (if bought) + RM 12
  const bBought = F.mealById(r.plan[0].B).source === "buy" ? cost("B") : 0;
  assert.ok(Math.abs(sm.cashOut - (r.totals.grocery + bBought + 12)) < 0.01);
  // a meal not yet logged changes nothing
  const before = C.summary(r.plan, log, 1);
  assert.equal(before.plannedToDate, sm.plannedToDate);
});

test("check-in: three skipped meals bring up the food-aid pointer", () => {
  const r = P.planWeek(profile({ kitchen: "shared" }));
  let log = C.validateLog(null);
  assert.equal(C.summary(r.plan, log, 2).foodAid, false);
  [[0, "L"], [1, "D"], [2, "L"]].forEach(([d, s]) => { log = C.record(log, d, s, { status: "skipped" }); });
  assert.equal(C.summary(r.plan, log, 2).foodAid, true);
});

test("validateLog cleans malformed check-ins", () => {
  const log = C.validateLog({ groceries: "yes", days: { "0": { B: { status: "eaten" }, L: { status: "other", rm: "abc", label: 5 } }, "9": { B: { status: "planned" } } } });
  assert.equal(log.groceries, false);
  assert.equal(log.days["0"].B, undefined);
  assert.deepEqual(log.days["0"].L, { status: "other", rm: 0, label: "Something else" });
  assert.equal(log.days["9"], undefined);
});

test("calendar file is valid RFC 5545: CRLF, folded lines ≤ 75 octets, UID and DTSTAMP on every event", () => {
  const r = P.planWeek(profile({ kitchen: "shared" }));
  const ics = C.buildIcs(r.plan, "2026-10-26", "https://example.org/app.html#today", new Date("2026-10-24T02:00:00Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "bare LF");
  ics.split("\r\n").forEach(l => assert.ok(Buffer.byteLength(l, "utf8") <= 75, l));
  const unfolded = ics.replace(/\r\n /g, "");
  const events = unfolded.split("BEGIN:VEVENT").slice(1);
  assert.equal(events.length, 8); // shopping + 7 check-ins
  events.forEach(e => { assert.match(e, /\r\nUID:[^\r]+@eatfortomorrow/); assert.match(e, /\r\nDTSTAMP:20261024T020000Z/); });
  assert.match(unfolded, /DTSTART:20261101T200000/);
  assert.match(unfolded, /URL:https:\/\/example\.org\/app\.html#today/);
  assert.equal(C.icsEscape("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const withIf = C.buildIcs(r.plan, "2026-10-26", "", new Date("2026-10-24T02:00:00Z"), { ifThen: "If I want bubble tea, then I buy a banana first" }).replace(/\r\n /g, "");
  assert.match(withIf, /weak moment: If I want bubble tea/);
  const freshDay = r.plan.findIndex((_, d) => C.useFirst(r.plan, d).length);
  if (freshDay >= 0) assert.match(withIf, /Use first: /);
});

// ================= v6: budget that bites, meanwhile, caps, plan quality =================
function playUntilBroke(p) {
  const s = S.newSim(p); S.advance(s);
  while (!s.done) {
    const vis = S.visibleOptions(s, S.currentScene(s));
    if (vis.some(o => o.broke)) return { s, vis };
    const o = vis.filter(x => x.available && x.kind !== "borrow").sort((a, b) => (b.cash || 0) - (a.cash || 0))[0];
    S.choose(s, o.id);
  }
  return { s, vis: null };
}

test("budget lock: options you can't afford are locked with the reason, and borrowing unlocks them at a cost", () => {
  const { s, vis } = playUntilBroke(profile({ budget: 60 }));
  assert.ok(vis, "a big spender hits the budget before Sunday");
  const left = S.moneyLeft(s);
  vis.filter(o => o.broke).forEach(o => {
    assert.equal(o.available, false);
    assert.ok(o.cash > left);
    assert.match(o.reason, /left|No money/);
  });
  vis.filter(o => o.available && o.kind !== "borrow").forEach(o => assert.ok((o.cash || 0) <= left + 1e-9));
  assert.throws(() => S.choose(s, vis.find(o => o.broke).id));
  const borrow = vis.find(o => o.kind === "borrow");
  assert.ok(borrow, "borrow is offered");
  const cursor = s.cursor;
  const res = S.choose(s, "borrow");
  assert.equal(res.stay, true);
  assert.equal(s.cursor, cursor, "borrowing does not use up the decision");
  assert.equal(S.moneyLeft(s), Math.round((left + S.BORROW_STEP) * 100) / 100);
  assert.equal(S.totals(s).borrowed, S.BORROW_STEP);
});

test("borrowing is capped and the week can always be finished", () => {
  for (const p of PROFILES.slice(0, 6)) {
    const s = S.newSim({ ...p, budget: 50 }); S.advance(s);
    let guard = 0;
    while (!s.done && guard++ < 200) {
      const vis = S.visibleOptions(s, S.currentScene(s)).filter(o => o.available);
      assert.ok(vis.length >= 1);
      const o = vis.find(x => x.kind === "borrow") || vis.sort((a, b) => (b.cash || 0) - (a.cash || 0))[0];
      S.choose(s, o.id);
    }
    assert.ok(s.done);
    assert.ok(s.borrowed <= S.BORROW_MAX);
    assert.ok(S.totals(s).spent <= 50 + s.borrowed + 1e-9);
  }
});

test("meanwhile accounting: the HUD change equals the choice plus every listed habit line", () => {
  PROFILES.slice(0, 9).forEach((p, pi) => {
    const r = rng(77 + pi);
    const s = S.newSim(p); S.advance(s);
    while (!s.done) {
      const before = { cash: s.spent, co2: S.totals(s).co2, fv: S.totals(s).fv };
      const opts = S.visibleOptions(s, S.currentScene(s)).filter(o => o.available);
      const res = S.choose(s, opts[Math.floor(r() * opts.length)].id);
      const listed = [res.line].concat(res.meanwhile);
      const sum = k => listed.reduce((a, l) => a + (l[k] || 0), 0);
      assert.ok(Math.abs((s.spent - before.cash) - sum("cash")) < 0.011, "cash");
      assert.ok(Math.abs((S.totals(s).co2 - before.co2) - sum("co2")) < 0.02, "co2");
      assert.ok(Math.abs((S.totals(s).fv - before.fv) - sum("fv")) < 1, "fv");
      res.meanwhile.forEach(l => assert.equal(l.kind, "habit"));
    }
  });
});

test("max-plate cap: the use-it-up dinner is one realistic plate", () => {
  const p = profile({ kitchen: "shared" });
  const s = S.newSim(p);
  Object.keys(F.PACKS).forEach(id => { s.inventory[id] = F.PACKS[id].g * 3; }); // a very full fridge
  const recipe = S.useUpRecipe(s);
  const by = {};
  recipe.forEach(part => {
    const g = F.ingredientById(part.id);
    const grp = g.fv ? "fv" : ["rice", "noodles", "bread", "oats", "potato"].includes(part.id) ? "grain" : "protein";
    if (!["oil", "sugar", "water"].includes(part.id)) by[grp] = (by[grp] || 0) + part.g;
  });
  Object.keys(by).forEach(k => assert.ok(by[k] <= S.USEUP_CAPS[k] + 1e-9, `${k} ${by[k]}`));
  const total = recipe.reduce((a, x) => a + x.g, 0);
  assert.ok(total <= 520, `plate is ${total} g`);
  assert.ok(F.mealStats({ source: "cook", recipe }).co2 < 2.5);
});

test("plan repetition cap: no meal more than three times a week, never lunch = dinner", () => {
  for (const p of PROFILES) for (const budget of [70, 120]) {
    const r = P.planWeek({ ...p, budget });
    const c = {};
    r.plan.forEach(d => { ["B", "L", "D"].forEach(s => { if (d[s]) c[d[s]] = (c[d[s]] || 0) + 1; }); if (d.L) assert.notEqual(d.L, d.D); });
    Object.keys(c).forEach(id => assert.ok(c[id] <= 3, `${id} × ${c[id]}`));
  }
});

test("plan budget use: spare money buys fruit on days short of 400 g, never past the budget", () => {
  const p = profile({ kitchen: "shared", goal: "money", budget: 120 });
  const r = P.planWeek(p);
  assert.ok(r.feasible);
  assert.ok(r.totals.outlay <= 120);
  assert.ok(r.plan.some(d => d.S), "at least one fruit snack added");
  r.plan.forEach(d => { if (d.S) assert.ok(F.mealById(d.S).snack); });
  // with a tight budget there is no spare money, so the plan stays within it
  const tight = P.planWeek({ ...p, budget: 70 });
  assert.ok(!tight.feasible || tight.totals.outlay <= 70);
});

test("health and planet plans use most of a normal budget for better food", () => {
  const p = profile({ kitchen: "shared", budget: 120 });
  const health = P.planWeek({ ...p, goal: "health" }).totals;
  assert.ok(health.fvDaysMet >= 5, `fv days ${health.fvDaysMet}`);
  assert.ok(health.outlay >= 0.75 * 120, "spare budget is used, not left idle");
});

test("already have: food at home lowers the grocery bill, and leftovers carry over", () => {
  const p = profile({ kitchen: "shared", goal: "money" });
  const r = P.planWeek(p);
  const rice = r.totals.shopping.find(i => i.id === "rice");
  if (rice) {
    const withRice = P.evaluate(r.plan, { rice: 2000 });
    assert.ok(withRice.grocery <= r.totals.grocery - F.PACKS.rice.rm + 0.01);
    assert.equal(withRice.shopping.find(i => i.id === "rice").packs, 0);
  }
  const carry = P.carryOver(r.totals);
  Object.keys(carry).forEach(id => { assert.ok(P.KEEPS.includes(id)); assert.ok(carry[id] > 0); });
  assert.deepEqual(P.cleanHave({ rice: "500", fake: 3, oats: -1 }), { rice: 500 });
});

test("my prices: overrides change meal and pack prices everywhere, and are validated", () => {
  const clean = F.cleanPriceOverrides({ meals: { ecorice: "9", skip: 4, fake: 2, nasilemak: 9999 }, packs: { rice: 3.2, chicken: -4 } });
  assert.deepEqual(clean, { meals: { ecorice: 9 }, packs: { rice: 3.2 } });
  F.setPriceOverrides(clean);
  try {
    assert.equal(F.mealStats(F.mealById("ecorice")).rm, 9);
    assert.equal(F.packPrice("rice"), 3.2);
    const plan = Array.from({ length: 7 }, () => ({ B: null, L: "ecorice", D: null, S: null }));
    plan[0].L = "ecorice";
    assert.equal(P.evaluate([{ B: null, L: "ecorice", D: null, S: null }, ...Array(6).fill({ B: null, L: null, D: null, S: null })]).outlay, 9);
  } finally { F.setPriceOverrides({}); }
  assert.equal(F.mealStats(F.mealById("ecorice")).rm, F.mealById("ecorice").price);
});

test("Menu Rahmah appears only when switched on", () => {
  const off = profile({ kitchen: "hostel", budget: 70 });
  const on = profile({ kitchen: "hostel", budget: 70, rahmah: true });
  assert.equal(on.rahmah, true);
  assert.ok(!P.candidates(off, 0, "L").some(m => m.rahmah));
  assert.ok(P.candidates(on, 0, "L").some(m => m.rahmah));
  assert.ok(P.planWeek(on).totals.outlay <= P.planWeek(off).totals.outlay);
  assert.equal(F.mealById("rahmah").price, 5);
});

test("Healthy Plate tag: quarter rice, quarter protein, half fruit and veg", () => {
  assert.equal(F.healthyPlate(F.mealById("instantnoodles")), false);
  assert.equal(F.healthyPlate(F.mealById("ecoricetofu")), true);
});

test("prep sessions: portions add up to the cooked lunches and dinners, and batches respect how long food keeps", () => {
  const r = P.planWeek(profile({ kitchen: "shared", goal: "health" }));
  const sessions = P.prepSessions(r.plan);
  let cooked = 0;
  r.plan.forEach(d => ["L", "D"].forEach(s => { const m = d[s] && F.mealById(d[s]); if (m && m.source === "cook" && m.prep && m.prep.keeps > 0) cooked++; }));
  assert.equal(sessions.reduce((a, x) => a + x.portions, 0), cooked);
  sessions.forEach(x => { assert.ok(x.days[x.days.length - 1] - x.cookOn <= x.keeps); assert.ok(x.minutes > 0); assert.ok(x.steps.length <= 3); });
});

test("rotatePlan keeps weekdays when a plan starts mid-week", () => {
  const r = P.planWeek(profile({ kitchen: "shared" }));
  const rot = P.rotatePlan(r.plan, 3); // Thursday
  assert.deepEqual(rot[0], r.plan[3]);
  assert.deepEqual(rot[4], r.plan[0]);
  assert.equal(P.weekdayIndex(new Date(2026, 9, 26)), 0); // a Monday
});

test("share card stats: three numbers, each with a short label", () => {
  const s = playWeek(profile({}), () => 0).s;
  const stats = R.shareStats(R.buildReport(s));
  assert.equal(stats.length, 3);
  stats.forEach(x => { assert.ok(x.big.length <= 9, x.big); assert.ok(x.label.length <= 48, x.label); });
});

test("every recipe has at most three steps and every meal a short name", () => {
  F.MEALS.forEach(m => {
    assert.ok(m.short && m.short.length <= 24, `${m.id} short`);
    if (m.steps) assert.ok(m.steps.length >= 1 && m.steps.length <= 3, `${m.id} steps`);
    if (m.source === "cook") assert.ok(m.prep && m.prep.min > 0, `${m.id} prep`);
  });
});

// ================= PWA =================
test("every file the app loads is in the offline cache list", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { FILES } = require("../sw.js");
  const root = path.join(__dirname, "..");
  ["index.html", "app.html"].forEach(page => {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const refs = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|svg|png|webmanifest))"/g)].map(m => m[1]);
    refs.forEach(r => assert.ok(FILES.includes(r), `${page} loads ${r} but sw.js doesn't cache it`));
  });
  FILES.filter(f => f !== "./").forEach(f => assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`));
});
