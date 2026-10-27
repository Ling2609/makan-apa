// v10 unit tests: "Start today" never turns a plan within budget into one over it, day 1 never
// repeats a meal, the variety rule holds after the start-today reorder, and a receipt line only
// prices the app's meal when it really is that meal.
// The sweep is the reviewer's grid: 3 kitchens × 2 diets × 6 budgets × 4 cooking levels ×
// breakfast on/off × 7 weekdays (2,016 starts), plus the RM 70 tight-week preset (336 starts).
// npm run test:unit
const test = require("node:test");
const assert = require("node:assert/strict");

const F = require("../js/foods.js");
const St = require("../js/storage.js");
const P = require("../js/planner.js");
const RC = require("../js/receipt.js");

const KITCHENS = ["hostel", "shared", "home"];
const DIETS = [{ halal: true, vegetarian: false }, { halal: false, vegetarian: true }];
const COOKS = [2, 6, 10, 14];

// Every rule a started plan must keep
function checkStart(label, vp, plan, st, have = {}) {
  const before = P.evaluate(plan, have).outlay;
  if (before <= vp.budget + 1e-9) {
    if (st.overBy > 0) {
      // the impossible case: nothing started today fits, and it is reported to the cent
      assert.ok(Math.abs(st.overBy - (st.outlay - vp.budget)) < 0.006, `${label}: overBy is the exact extra cost`);
      const cheapest = P.planWeek({ ...vp, budget: 2000, _wd0: 0, _noCook0: ["B", "L"] });
      assert.ok(cheapest.minOutlay > vp.budget, `${label}: reported impossible but a start-today week fits`);
    } else {
      assert.ok(st.outlay <= vp.budget + 1e-9, `${label}: ${before} became ${st.outlay} over ${vp.budget}`);
    }
  }
  assert.ok(P.varietyOk(st.plan, vp), `${label}: variety rule broken`);
  const d0 = ["B", "L", "D"].map(s => st.plan[0][s]).filter(Boolean);
  assert.equal(new Set(d0).size, d0.length, `${label}: day 1 repeats a meal ${d0.join(",")}`);
  const counts = {};
  st.plan.forEach(d => ["B", "L", "D"].forEach(s => { if (d[s]) counts[d[s]] = (counts[d[s]] || 0) + 1; }));
  Object.keys(counts).forEach(id => assert.ok(counts[id] <= 3, `${label}: ${id} ${counts[id]} times`));
  ["B", "L"].forEach(s => {
    const m = st.plan[0][s] && F.mealById(st.plan[0][s]);
    if (m) assert.ok(P.readyBeforeShop(m, have), `${label}: day-1 ${s} ${m.id} needs today's shop`);
  });
  ["B", "L", "D"].forEach(s => { if (P.slotRequired(vp, s)) st.plan.forEach((d, i) => assert.ok(d[s], `${label}: day ${i} ${s} empty`)); });
}

test("sweep: start today over the reviewer's 2,016 setups keeps budget, variety and day 1 rules", () => {
  let n = 0, impossible = 0;
  for (const kitchen of KITCHENS) for (const diet of DIETS) for (const budget of [50, 60, 70, 80, 100, 120]) for (const cooks of COOKS) for (const breakfast of [true, false]) {
    const vp = St.validateProfile({ ...St.defaultProfile(), kitchen, budget, cooks, breakfast, diet });
    const r = P.planWeek(vp);
    for (let wd = 0; wd < 7; wd++) {
      const st = P.startToday(r.plan, vp, wd);
      checkStart(`${kitchen} ${diet.vegetarian ? "veg" : "halal"} RM${budget} cooks${cooks} B${breakfast} wd${wd}`, vp, r.plan, st);
      if (st.overBy > 0 && r.totals.outlay <= budget) impossible++;
      n++;
    }
  }
  assert.equal(n, 2016);
  // the only setups with no start-today week inside the budget are reported, never silent
  assert.ok(impossible <= 14, `${impossible} impossible starts`);
});

test("sweep: the RM 70 tight-week preset never goes over when started today", () => {
  let n = 0;
  for (const kitchen of KITCHENS) for (const diet of DIETS) for (const cooks of COOKS) for (const breakfast of [true, false]) {
    const tw = P.tightWeek(St.validateProfile({ ...St.defaultProfile(), kitchen, cooks, breakfast, diet }), St.TIGHT_WEEK);
    for (let wd = 0; wd < 7; wd++) {
      const st = P.startToday(tw.result.plan, tw.profile, wd);
      checkStart(`tight ${kitchen} ${diet.vegetarian ? "veg" : "halal"} cooks${cooks} B${breakfast} wd${wd}`, tw.profile, tw.result.plan, st);
      assert.equal(st.overBy, 0, "tight preset: no impossible start");
      n++;
    }
  }
  assert.equal(n, 336);
});

test("the reviewer's case: shared kitchen, RM 50, 14 cooks, no breakfast, started on a Monday stays within budget", () => {
  const vp = St.validateProfile({ ...St.defaultProfile(), kitchen: "shared", budget: 50, cooks: 14, breakfast: false });
  const r = P.planWeek(vp);
  const st = P.startToday(r.plan, vp, 0);
  assert.ok(st.outlay <= 50, `${st.outlay}`);
  assert.equal(st.overBy, 0);
});

test("impossible start today: the exact extra cost is reported and the week is still legal", () => {
  const vp = St.validateProfile({ ...St.defaultProfile(), kitchen: "shared", budget: 60, cooks: 14, breakfast: true, diet: { halal: false, vegetarian: true } });
  const r = P.planWeek(vp);
  assert.ok(r.totals.outlay <= 60);
  const st = P.startToday(r.plan, vp, 2);
  assert.ok(st.overBy > 0);
  assert.equal(st.overBy, F.round2(st.outlay - 60));
  assert.ok(P.varietyOk(st.plan, vp));
});

test("kettle breakfast on day 1 only when its groceries are already at home", () => {
  const oats = F.mealById("oatsbanana");
  assert.equal(P.readyBeforeShop(oats, {}), false);
  assert.equal(P.readyBeforeShop(oats, { oats: 1000, banana: 1000 }), true);
  assert.equal(P.readyBeforeShop(F.mealById("nasilemak"), {}), true);
  assert.equal(P.readyBeforeShop(F.mealById("eggfriedrice"), { rice: 5000, eggs: 1000 }), false);
});

test("breakfast, lunch and dinner on one day are three different meals", () => {
  const vp = St.validateProfile(St.defaultProfile());
  const plan = P.planWeek(vp).plan.map(d => ({ ...d }));
  plan[3].B = "nasilemak"; plan[3].L = "nasilemak";
  assert.equal(P.varietyOk(plan, vp), false);
});

test("receipt prices: only a line that is really the plan's meal is a close match", () => {
  const m = t => RC.priceMatch(t, RC.categorize(t).mealId);
  assert.equal(m("Nasi Lemak Ayam Goreng Berempah"), "loose");
  assert.equal(m("Nasi lemak telur"), "loose");
  assert.equal(m("Roti telur"), "loose");
  assert.equal(m("Nasi Lemak Bungkus"), "close");
  assert.equal(m("2 x Roti Canai"), "close");
  assert.equal(m("TEH TARIK (R)"), "close");
  assert.equal(m("Mee Goreng Mamak"), "close");
  assert.equal(RC.priceMatch("Kaya toast set", "kayatoast"), null); // a set never prices a meal
  // a draft line's own tick survives a reload; nothing is ticked by default
  const d = RC.validateDraft({ lines: [{ label: "Nasi Lemak Bungkus", rm: 3, category: "meal", mealId: "nasilemak", price: true }, { label: "x", rm: 1 }], at: Date.now() });
  assert.equal(d.lines[0].price, true);
  assert.equal(d.lines[1].price, false);
});
