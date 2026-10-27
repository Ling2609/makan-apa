// v7 unit tests: regressions for the Round A review findings, and the three new tools
// (receipt parser, class codes, stall notes) plus My real week. Run with: npm run test:unit
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const F = require("../js/foods.js");
const St = require("../js/storage.js");
const W = require("../js/week.js");
const S = require("../js/sim.js");
const R = require("../js/report.js");
const P = require("../js/planner.js");
const C = require("../js/checkin.js");
const RC = require("../js/receipt.js");
const CC = require("../js/classcode.js");
const SL = require("../js/stalls.js");
const RW = require("../js/realweek.js");
const FIX = require("./fixtures/receipts.js");

const profile = over => St.validateProfile({ ...St.defaultProfile(), ...over });
const PROFILES = [];
for (const kitchen of ["hostel", "shared", "home"]) for (const vegetarian of [false, true])
  for (const goal of ["money", "health", "planet"]) PROFILES.push(profile({ kitchen, goal, diet: { halal: true, vegetarian } }));
function play(p, pick = () => 0) {
  const s = S.newSim(p); S.advance(s); s.guesses = {};
  let n = 0;
  while (!s.done) { const o = S.visibleOptions(s, S.currentScene(s)).filter(x => x.available); S.choose(s, o[Math.min(pick(n), o.length - 1)].id); n++; }
  return { s, n };
}

// ================= Round A regressions =================
test("H2: breakfast off means no breakfast scene, no breakfast cost, and 14 meals in the report", () => {
  for (const pick of [() => 0, n => n % 3, () => 2]) {
    const { s, n } = play(profile({ breakfast: false }), pick);
    assert.ok(!s.decisions.some(d => d.slot === "B"), "no breakfast decision");
    assert.ok(!s.lines.some(l => l.slot === "B" && l.day >= 0), "no breakfast line at all");
    const t = S.totals(s);
    assert.equal(t.meals, 14);
    assert.ok(t.homeMeals + t.boughtMeals + t.skipped <= 14);
    const r = R.buildReport(s);
    if (r.archetype.id === "prepper") assert.match(r.archetype.why, /of your 14 meals/);
  }
  const on = play(profile({ breakfast: true })).s;
  assert.equal(S.totals(on).meals, 21);
  assert.ok(on.decisions.some(d => d.slot === "B"));
});

test("H4: the tight-week preset never offers a plan it can't keep", () => {
  for (const p of PROFILES) {
    const tw = P.tightWeek(p, St.TIGHT_WEEK);
    assert.ok(tw.result.feasible, `${p.kitchen}/${p.diet.vegetarian}: tight plan is within its budget`);
    assert.ok(tw.result.totals.outlay <= tw.profile.budget + 1e-9);
    assert.ok(tw.profile.budget >= St.TIGHT_WEEK.budget);
    if (tw.raised) assert.equal(tw.profile.budget, Math.ceil(tw.minOutlay));
    else assert.equal(tw.profile.budget, 70);
  }
  const hostelVeg = P.tightWeek(profile({ kitchen: "hostel", diet: { halal: true, vegetarian: true } }), St.TIGHT_WEEK);
  assert.equal(hostelVeg.raised, true, "a hostel vegetarian week can't be done for RM 70");
});

test("M8: a saved week with impossible days, slots or decisions is rejected instead of crashing", () => {
  const { s } = play(profile({}));
  const good = JSON.parse(JSON.stringify(S.serializeSim(s)));
  assert.ok(S.restoreSim(good, St.validateProfile));
  const bad = [
    x => { x.lines[3].day = 9; }, x => { x.lines[3].day = -2; }, x => { x.lines[3].slot = "Q"; }, x => { x.lines[3].label = 5; },
    x => { x.lines.push({ day: 1, slot: "N", kind: "borrow", label: "b", cash: 0, co2: 0, fv: 0, borrow: "lots" }); },
    x => { x.decisions[0] = { sceneId: 3 }; }, x => { x.decisions[0].day = 12; }, x => { x.decisions[0].alternatives = [{ cash: "x" }]; }
  ];
  bad.forEach((mut, i) => {
    const x = JSON.parse(JSON.stringify(good)); mut(x);
    let restored;
    assert.doesNotThrow(() => { restored = S.restoreSim(x, St.validateProfile); }, `case ${i}`);
    assert.equal(restored, null, `case ${i} rejected`);
  });
});

test("M9: cook-ahead sessions never fall before the shop; the grocery reminder comes first", () => {
  const plan = P.planWeek(profile({ cooks: 10 })).plan;
  P.prepSessions(plan, 0).forEach(x => assert.ok(x.cookOn >= 0, "start-today plan: no session yesterday"));
  P.prepSessions(plan).forEach(x => { assert.ok(x.cookOn >= -1); x.days.forEach(d => assert.ok(d - x.cookOn <= x.keeps)); });
  // started today on a Thursday: nothing cooked for breakfast or lunch on day 1 (before the shop)
  for (let wd = 0; wd < 7; wd++) {
    const p = profile({ cooks: 10 });
    const rot = P.orderForFreshness(P.rotatePlan(P.planWeek(p).plan, wd), p, { weekday0: wd, noCookDay0: ["B", "L"] });
    ["B", "L"].forEach(s => { const m = rot[0][s] && F.mealById(rot[0][s]); assert.ok(!m || m.source !== "cook", `weekday ${wd} ${s}`); });
  }
  const ics = C.buildIcs(plan, "2026-10-26", "", new Date("2026-10-24T02:00:00Z"));
  assert.match(ics, /DTSTART:20261025T100000/, "Monday start: shop on Sunday morning");
  const today = C.buildIcs(plan, "2026-10-24", "", new Date("2026-10-24T02:00:00Z"), { shopDay: 0, shopHour: 17 });
  assert.match(today, /DTSTART:20261024T170000/);
});

test("M10: no one-day meals as campus lunchboxes; fresh food moves to the start of the week", () => {
  for (const p of PROFILES) for (const budget of [70, 120, 250]) {
    const r = P.planWeek({ ...p, budget });
    r.plan.forEach((day, d) => {
      const m = day.L && F.mealById(day.L);
      if (m && d < 5 && p.campusLunch && m.source === "cook") assert.ok(m.prep.keeps >= 2, `${m.id} as a weekday lunchbox`);
    });
    const reordered = P.orderForFreshness(r.plan, p);
    assert.ok(P.freshnessWait(reordered) <= P.freshnessWait(r.plan) + 1e-9);
    assert.equal(P.evaluate(reordered).outlay, P.evaluate(r.plan).outlay, "reordering never changes the cost");
  }
});

test("M11: the default plan is one worth keeping: fruit and veg most days, budget used sensibly", () => {
  const r = P.planWeek(profile({}));
  assert.ok(r.totals.fvDaysMet >= 5, `fruit & veg days: ${r.totals.fvDaysMet}`);
  assert.ok(r.totals.outlay >= 0.6 * 120 && r.totals.outlay <= 120);
  const ids = r.plan.flatMap(d => Object.values(d));
  assert.ok(ids.filter(id => id === "storenoodles").length === 0 || !ids.some(id => F.mealById(id) && F.mealById(id).source !== "buy" && /noodles/.test(id)), "no cup noodles bought next to noodles at home");
});

test("M12: vegetarian recipes contain no shrimp paste or chicken stock", () => {
  F.MEALS.filter(m => F.fitsDiet(m, { halal: true, vegetarian: true }) && m.steps).forEach(m => {
    const text = (m.name + " " + m.steps.join(" ")).toLowerCase();
    assert.ok(!/belacan(?! is)/.test(text.replace(/\(belacan is shrimp paste[^)]*\)/, "")), `${m.id} uses belacan`);
    assert.ok(!/chicken stock|stock cube(?!.*vegetable)/.test(text.replace("vegetable stock cube", "")), `${m.id} uses chicken stock`);
  });
});

test("M13 + L24: Menu Rahmah and nasi lemak notes say only what their sources say", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "week.js"), "utf8");
  const rahmah = src.match(/text: "(Menu Rahmah[^"]*)", src: "(\w+)"/);
  assert.equal(rahmah[2], "RAHMAHCAMPUS");
  assert.ok(!/campus cafés\.?"/.test(rahmah[1]) || /UTM/.test(rahmah[1]), "campus claim names its source's example");
  assert.ok(F.SOURCES.RAHMAHCAMPUS.url.startsWith("https://"));
  assert.ok(!/almost double/.test(src));
  assert.match(src, /up 81% on 2011/);
});

test("M14: skipped home meals carry their rice, oats and dhal into next week", () => {
  const p = profile({ cooks: 8 });
  const plan = P.planWeek(p).plan;
  const ev = P.evaluate(plan);
  const base = P.carryOver(ev);
  let log = C.validateLog(null);
  plan.forEach((day, d) => ["L", "D"].forEach(s => { const m = F.mealById(day[s]); if (m.source === "cook") log = C.record(log, d, s, { status: "skipped" }); }));
  const withLog = P.carryOver(ev, plan, log);
  assert.ok(Object.keys(withLog).some(k => (withLog[k] || 0) > (base[k] || 0)), "skipped meals leave food behind");
  Object.keys(withLog).forEach(k => assert.ok(P.KEEPS.includes(k)));
  const ate = P.carryOver(ev, plan, C.validateLog(null));
  assert.deepEqual(ate, base, "no log, no change");
});

test("L17: locked options name ingredients in plain words", () => {
  const s = S.newSim(profile({}));
  S.advance(s);
  s.inventory = { rice: 100 };
  const all = W.SCENES.flatMap(sc => S.sceneOptions(s, sc));
  all.filter(o => o.reason && /Not in your kitchen/.test(o.reason)).forEach(o => assert.ok(!/rootveg|beans\b|soymilk/.test(o.reason), o.reason));
  assert.equal(W.ingredientName("rootveg"), "carrots");
});

test("L18: Healthy Plate needs vegetables; bread and peanut butter is no-cook, not toast", () => {
  const b = F.mealById("breadpeanut");
  assert.equal(F.healthyPlate(b), false);
  assert.ok(!/toast/i.test(b.name));
  assert.equal(F.healthyPlate(F.mealById("ecoricetofu")), true);
});

test("L20: no empty grocery reminder when everything is already at home", () => {
  const plan = P.planWeek(profile({})).plan;
  const need = {};
  P.evaluate(plan).shopping.forEach(i => { need[i.id] = i.needG; });
  const ics = C.buildIcs(plan, "2026-10-26", "", new Date("2026-10-24T02:00:00Z"), { have: need });
  assert.ok(!/Grocery shop/.test(ics));
});

test("check-in: a real grocery receipt replaces the estimate; receipt-linked meals are marked", () => {
  const plan = P.planWeek(profile({})).plan;
  const log = C.validateLog({ groceries: true, groceryRm: 41.3, days: { 0: { L: { status: "other", rm: 7, label: "Nasi kandar", src: "receipt" } } } });
  assert.equal(log.groceryRm, 41.3);
  assert.equal(log.days["0"].L.src, "receipt");
  const sm = C.summary(plan, log, 0);
  assert.equal(sm.groceries, 41.3);
  assert.equal(C.validateLog({ groceries: false, groceryRm: 41.3 }).groceryRm, undefined);
  assert.equal(C.validateLog({ groceries: true, groceryRm: -5 }).groceryRm, undefined);
});

test("past weeks: only well-formed history is kept, newest first, capped", () => {
  const h = St.validateHistory([{ start: "2026-10-12", plan: Array(7).fill({}), log: { days: {} }, reason: "remade" }, { start: "bad" }, null, "x"]);
  assert.equal(h.length, 1);
  assert.equal(St.validateHistory(Array(30).fill({ start: "2026-10-12", plan: Array(7).fill({}), log: {} })).length, St.HISTORY_MAX);
  assert.deepEqual(St.validateHistory("nope"), []);
});

// ================= A: receipt parser =================
test("receipt: amounts survive common OCR slips", () => {
  const cases = { "8.50": 8.5, "RM8.5O": 8.5, "RM 12,90": 12.9, "S.50": 5.5, "l2.00": 12, "8. 50": 8.5, "-0.05": -0.05, "0.03-": -0.03, "13.00 Z": 13, "16.90 SR": 16.9, "1,234.50": 1234.5 };
  Object.entries(cases).forEach(([t, v]) => assert.equal(RC.parseAmount("ITEM " + t), v, t));
  ["NASI LEMAK", "Tel: 03-7877 1234", "TABLE 5", "", "5000.00"].forEach(t => assert.equal(RC.parseAmount(t), null, t));
});

test("receipt: kopitiam with SST and cash rounding adds up to the printed total", () => {
  const r = RC.parseReceipt(FIX.kopitiam);
  assert.equal(r.store, "Kedai Kopi Sri Maju");
  assert.equal(r.date, "2026-10-14");
  assert.deepEqual(r.items.map(i => [i.label, i.qty, i.rm]), [["Nasi Lemak Ayam", 1, 8.5], ["Kopi O Ais", 2, 4.4], ["Roti Bakar Kaya", 1, 3.8]]);
  assert.equal(r.tax, 1); assert.equal(r.rounding, -0.05); assert.equal(r.total, 17.65);
  assert.equal(r.check.ok, true);
  const lines = RC.confirmLines(r);
  assert.equal(lines[0].mealId, "nasilemak");
  assert.equal(lines[1].category, "drink");
});

test("receipt: a noisy mamak receipt (0 for O, O for 0, S for 5) still parses and balances", () => {
  const r = RC.parseReceipt(FIX.noisyMamak);
  assert.equal(r.total, 23.3);
  assert.equal(r.items.length, 4);
  assert.deepEqual(r.items.map(i => i.rm), [3.2, 2.8, 8.5, 7.5]);
  assert.equal(r.items[0].qty, 2);
  assert.equal(r.check.ok, true);
  assert.deepEqual(RC.confirmLines(r).map(l => l.mealId), ["roticanai", "tehtarik", "meegoreng", "maggigoreng"]);
  assert.ok(!r.items.some(i => /tunai|baki|total/i.test(i.label)), "payment and total lines are not items");
});

test("receipt: supermarket lines are groceries matched to packs; discounts count; card lines don't", () => {
  const r = RC.parseReceipt(FIX.supermarket);
  assert.equal(r.total, 50.2);
  assert.equal(r.tax, null, "'Total incl. SST' is the total, not a tax line");
  assert.equal(r.check.ok, true);
  const lines = RC.confirmLines(r);
  assert.ok(lines.every(l => l.category === "groceries"));
  assert.deepEqual(lines.slice(0, 7).map(l => l.packId), ["rice", "eggs", "veg", "greens", "tofu", "banana", "bread"]);
  assert.ok(lines.some(l => l.rm < 0), "discount line kept as negative");
  assert.ok(!lines.some(l => /visa|\*{4}/i.test(l.label)));
});

test("receipt: delivery fees, campus Menu Rahmah, 7-Eleven, wrapped item names", () => {
  const d = RC.confirmLines(RC.parseReceipt(FIX.delivery));
  assert.equal(d.filter(l => l.category === "fees").length, 3);
  assert.equal(d[0].mealId, "chickenrice");
  const c = RC.confirmLines(RC.parseReceipt(FIX.campus));
  assert.equal(c[0].mealId, "rahmah");
  const e = RC.parseReceipt(FIX.sevenEleven);
  assert.equal(e.items[0].qty, 2);
  assert.equal(RC.confirmLines(e)[0].mealId, "storenoodles", "7-Eleven food is not groceries");
  const w = RC.parseReceipt(FIX.priceNextLine);
  assert.match(w.items[0].label, /Nasi Campur.*Ikan Goreng/);
  assert.equal(RC.confirmLines(w)[0].mealId, "ecorice");
  assert.equal(w.check.ok, true);
});

test("receipt: garbage and mismatched totals produce warnings, never silent trust", () => {
  const g = RC.parseReceipt(FIX.garbage);
  assert.equal(g.items.length, 0);
  assert.ok(g.warnings.length >= 2);
  const m = RC.parseReceipt("NASI LEMAK 8.50\nTEH TARIK 2.80\nTOTAL 15.30");
  assert.equal(m.check.ok, false);
  assert.match(m.warnings[0], /add up to RM 11.30 but the receipt total says RM 15.30/);
  assert.equal(RC.parseReceipt("").items.length, 0);
  assert.doesNotThrow(() => RC.parseReceipt("x".repeat(100000)));
});

test("receipt: prices learned from a receipt compare like with like", () => {
  assert.equal(RC.priceFromLine("roticanai", 3.2, 2), 3.2, "two roti = the ×2 set");
  assert.equal(RC.priceFromLine("roticanai", 1.6, 1), 3.2);
  assert.equal(RC.priceFromLine("nasilemak", 8.5, 1), 8.5);
  assert.equal(RC.priceFromLine("kayatoast", 3.8, 1), null, "a set isn't comparable with one item");
  assert.equal(RC.priceFromLine("nasilemak", 0, 1), null);
});

test("receipt: saved spends are validated (bad dates, amounts and junk dropped)", () => {
  const ok = RC.validateSpend({ date: "2026-10-20", store: "<b>x</b>", items: [{ label: "Nasi lemak", rm: 4, category: "meal", mealId: "nasilemak" }, { label: "", rm: 3 }, { label: "Bad", rm: "x" }], total: 4 });
  assert.equal(ok.items.length, 1);
  assert.equal(ok.items[0].mealId, "nasilemak");
  assert.equal(RC.validateSpend({ date: "20/10/2026", items: [{ label: "a", rm: 1 }] }), null);
  assert.equal(RC.validateSpend({ date: "2026-10-20", items: [] }), null);
  assert.equal(RC.validateSpend({ date: "2026-10-20", items: [{ label: "a", rm: 1, category: "hack", mealId: "nope" }] }).items[0].category, "other");
  assert.deepEqual(RC.validateSpendLog("x"), []);
});

// ================= My real week =================
test("real week: categories, days, budget, and no double counting with the check-in", () => {
  const spends = RC.validateSpendLog([
    { id: "aaaa1", date: "2026-10-20", store: "Kopitiam", items: [{ label: "Nasi lemak", rm: 8.5, category: "meal" }, { label: "Kopi O", rm: 4.4, category: "drink" }], total: 13.9 },
    { id: "aaaa2", date: "2026-10-21", store: "Mydin", items: [{ label: "Beras 5kg", rm: 13, category: "groceries" }], total: 13 },
    { id: "aaaa3", date: "2026-10-01", store: "Old", items: [{ label: "Old", rm: 99, category: "meal" }], total: 99 }
  ]);
  const w = RW.realWeek({ spends, today: new Date(2026, 9, 24), budget: 120 });
  assert.equal(w.from, "2026-10-18");
  assert.equal(w.total, 26.9);
  assert.equal(w.byCat.meal, 8.5); assert.equal(w.byCat.drink, 4.4); assert.equal(w.byCat.groceries, 13);
  assert.equal(w.days.find(d => d.key === "2026-10-20").rm, 12.9 + 1);
  assert.equal(w.receipts, 2);
  // with a plan: receipt-linked check-in entries aren't counted again; a grocery receipt replaces the estimate
  const plan = P.planWeek(profile({})).plan;
  const log = C.validateLog({ groceries: true, days: { 2: { L: { status: "other", rm: 8.5, label: "Nasi lemak", src: "receipt" }, D: { status: "other", rm: 6, label: "Chapati" } } } });
  const w2 = RW.realWeek({ spends, today: new Date(2026, 9, 24), budget: 120, plan, start: "2026-10-18", log, mealById: F.mealById, mealPrice: F.mealPrice });
  assert.equal(w2.total, 26.9 + 6);
  assert.equal(w2.estimatedGroceries, 0);
  const w3 = RW.realWeek({ spends: [], today: new Date(2026, 9, 24), budget: 120, plan, start: "2026-10-18", log, mealById: F.mealById, mealPrice: F.mealPrice });
  assert.equal(w3.estimatedGroceries, P.evaluate(plan).grocery, "no grocery receipt: the list's estimate, flagged");
});

test("real week: tips only say what the numbers support", () => {
  const spends = RC.validateSpendLog([1, 2, 3].map(i => ({ id: "bt00" + i, date: "2026-10-2" + i, items: [{ label: "Bubble tea", rm: 11, category: "drink" }, { label: "Delivery fee", rm: 4, category: "fees" }], total: 15 })));
  const w = RW.realWeek({ spends, today: new Date(2026, 9, 24), budget: 40 });
  assert.ok(w.tips.some(t => /Drinks and snacks were RM 33.00/.test(t)));
  assert.ok(w.tips.some(t => /delivery fees/.test(t)));
  assert.ok(w.tips.some(t => /Bubble tea came up 3 times/.test(t)));
  assert.ok(w.tips.some(t => /RM 5.00 over your RM 40 budget/.test(t)));
  assert.deepEqual(RW.realWeek({ spends: [], today: new Date(), budget: 100 }).tips, []);
});

// ================= B: class codes =================
const studentCode = (o = {}, tag = "", seed = 0.5) => CC.encodeStudent(CC.studentValues({
  report: { spent: 132, budget: 120, co2: 12.34, fvDaysMet: 4, archetypeId: "hawk" }, budget: 120, kitchen: "shared", goal: "money",
  quizAsked: true, quizRight: 2, swaps: 3, adherence: 72, ...o }, () => seed), tag);

test("class code: round-trips, survives retyping, and holds only banded aggregates", () => {
  const code = studentCode({}, "BIO101");
  assert.match(code, /^EFT1-S-BIO101-[0-9A-Z]{5}(-[0-9A-Z]{1,5})+$/);
  const d = CC.decode(code);
  assert.ok(d.ok);
  assert.equal(d.tag, "BIO101");
  const v = CC.describeStudent(d.values);
  assert.deepEqual([v.costPct, v.budgetBand, v.co2, v.fvDays, v.archetype, v.quiz, v.swaps, v.adherence, v.kitchen, v.goal],
    [110, "RM 120–159", 12.3, 4, "hawk", 2, 3, 70, "shared", "money"]);
  // lower case, spaces for hyphens, no hyphens, O for 0 and I/L for 1 in the payload
  const payload = code.slice("EFT1-S-BIO101-".length);
  assert.ok(CC.decode(code.toLowerCase()).ok);
  assert.ok(CC.decode(code.replace(/-/g, " ")).ok);
  assert.ok(CC.decode(code.replace(/-/g, "")).ok);
  assert.ok(CC.decode("EFT1-S-BIO101-" + payload.replace(/0/g, "O").replace(/1/g, "l")).ok);
  assert.ok(CC.decode("Here's mine: " + code + " thanks").ok);
  // no tag
  assert.ok(CC.decode(studentCode()).ok);
  assert.equal(CC.decode(studentCode()).tag, "");
  // no simulated week: the week fields say "not included"
  const none = CC.describeStudent(CC.decode(studentCode({ report: null, quizAsked: false, adherence: undefined })).values);
  assert.deepEqual([none.played, none.costPct, none.co2, none.quiz, none.adherence], [false, null, null, null, null]);
  // the code is short enough to type
  assert.ok(code.length <= 36);
});

test("class code: any single-character change, swap or truncation is caught", () => {
  const code = studentCode({}, "BIO101");
  const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let caught = 0, total = 0;
  for (let i = "EFT1-S-BIO101-".length; i < code.length; i++) {
    if (code[i] === "-") continue;
    for (const ch of B32) {
      if (ch === code[i]) continue;
      total++;
      if (!CC.decode(code.slice(0, i) + ch + code.slice(i + 1)).ok) caught++;
    }
  }
  assert.equal(caught, total, "CRC-16 catches every single-character error");
  assert.equal(CC.decode(code.slice(0, -2)).ok, false);
  assert.equal(CC.decode(code.replace("BIO101", "BIO102")).ok, false, "editing the tag breaks the checksum");
  assert.equal(CC.decode(code.replace("EFT1", "EFT2")).error.includes("newer version"), true);
  assert.equal(CC.decode("hello").ok, false);
  const swapped = code.split("-"); const last = swapped.length - 2; swapped[last] = swapped[last].split("").reverse().join("");
  if (swapped.join("-") !== code) assert.equal(CC.decode(swapped.join("-")).ok, false);
});

test("class import: pasted chat or CSV, duplicates, rejects, other classes and summaries", () => {
  const a = studentCode({}, "BIO101", 0.1), b = studentCode({ swaps: 9 }, "BIO101", 0.2), other = studentCode({}, "CHE200", 0.3);
  const summary = CC.encodeClass(CC.classValues(CC.aggregate([a, b]), null, () => 0.4), "BIO101");
  const bad = a.slice(0, -1) + (a.slice(-1) === "A" ? "B" : "A");
  const csv = `name,code\n"Student 1",${a}\n"Student 2",${b}\n"Again",${a.toLowerCase()}\nx,${bad}\ny,${other}\nz,${summary}\n`;
  const r = CC.importCodes([], csv, "BIO101");
  assert.equal(r.added, 2); assert.equal(r.duplicates, 1); assert.equal(r.rejected.length, 1); assert.equal(r.otherTag, 1); assert.equal(r.summaries, 1);
  const again = CC.importCodes(r.codes, a, "BIO101");
  assert.equal(again.added, 0); assert.equal(again.duplicates, 1);
  assert.equal(CC.importCodes([], other + "\n" + a, "").added, 2, "no tag filter: every class");
  // the same results from two students are two codes (random part differs)
  assert.notEqual(studentCode({}, "", 0.1), studentCode({}, "", 0.9));
});

test("class aggregate: medians, histograms, archetypes and the group challenge", () => {
  const codes = [];
  for (let i = 0; i < 20; i++) codes.push(studentCode({ report: { spent: 60 + i * 5, budget: 100, co2: 8 + i * 0.5, fvDaysMet: i % 8, archetypeId: i < 12 ? "prepper" : "delivery" },
    quizRight: i % 4, adherence: 40 + i * 3 }, "", (i + 1) / 21));
  codes.push(studentCode({ report: null }, "", 0.99)); // joined but didn't finish the week
  const agg = CC.aggregate(codes, { type: 1, target: 35 });
  assert.equal(agg.n, 21); assert.equal(agg.played, 20);
  assert.equal(agg.cost.p50, 107.5);
  assert.equal(agg.overPct, 55);
  assert.equal(agg.hist.cost.reduce((s, x) => s + x.n, 0), 20);
  assert.equal(agg.hist.fv.reduce((s, x) => s + x.n, 0), 20);
  assert.deepEqual(agg.archetypes.map(a => [a.id, a.n]), [["prepper", 12], ["delivery", 8]]);
  assert.equal(agg.challenge.met, agg.fvMean * 10 >= 35);
  assert.equal(CC.aggregate([], null).n, 0);
  assert.equal(CC.aggregate(["junk"], null).n, 0);
  const co2 = CC.challengeStatus(agg, { type: 2, target: 120 });
  assert.equal(co2.met, agg.co2.p50 * 10 < 120);
});

test("class summary: a lecturer's code round-trips and a student compares privately", () => {
  const codes = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((s, i) => studentCode({ report: { spent: 90 + i * 10, budget: 120, co2: 9 + i, fvDaysMet: i, archetypeId: "hawk" } }, "", s));
  const agg = CC.aggregate(codes, { type: 3, target: 30 });
  const code = CC.encodeClass(CC.classValues(agg, { type: 3, target: 30 }, () => 0.5), "BIO101");
  const d = CC.decode(code);
  assert.ok(d.ok); assert.equal(d.type, "C");
  const cls = CC.describeClass(d.values);
  assert.equal(cls.n, 6);
  assert.equal(cls.cost.p50, Math.round(agg.cost.p50 / 5) * 5);
  assert.equal(cls.topArchetype, "hawk");
  assert.match(cls.challenge.text, /30% of the class over budget/);
  const me = CC.describeStudent(CC.decode(studentCode({ report: { spent: 200, budget: 120, co2: 30, fvDaysMet: 0, archetypeId: "delivery" } })).values);
  const rows = CC.compareToClass(me, cls);
  assert.equal(rows[0].where, "higher than most of the class");
  assert.equal(rows[2].where, "fewer than the class average");
  assert.equal(CC.importCodes([], code, "").summaries, 1, "a summary is never counted as a student");
});

// ================= C: stall notes =================
const stall = (over = {}) => ({ id: "kafe12ab", name: "Kafe Kolej 12", area: "UM", items: [{ name: "Nasi lemak ayam", rm: 6, date: "2026-10-01" }, { name: "Teh tarik", rm: 2.2, date: "2026-10-10" }], ...over });

test("stalls: merging keeps the newest price per item, adds new stalls and items, never duplicates", () => {
  const mine = [stall()];
  const theirs = [
    stall({ id: "zzzz9999", name: "kafe kolej 12!", area: "um", items: [{ name: "NASI LEMAK AYAM", rm: 6.5, date: "2026-10-20" }, { name: "Teh tarik", rm: 2.5, date: "2026-09-01" }, { name: "Milo ais", rm: 3, date: "2026-10-20" }] }),
    { id: "mamak777", name: "Mamak Bistro", area: "SS15", items: [{ name: "Roti canai", rm: 1.6, date: "2026-10-22" }] }
  ];
  const r = SL.mergeStalls(mine, theirs);
  assert.equal(r.stalls.length, 2); assert.equal(r.added, 1); assert.equal(r.updated, 1);
  const k = r.stalls.find(s => s.id === "kafe12ab");
  assert.equal(k.items.find(i => i.name === "Nasi lemak ayam").rm, 6.5, "newer price wins");
  assert.equal(k.items.find(i => i.name === "Teh tarik").rm, 2.2, "older price loses");
  assert.ok(k.items.some(i => i.name === "Milo ais"));
  const again = SL.mergeStalls(r.stalls, theirs);
  assert.equal(again.added + again.updated, 0, "merging twice changes nothing");
  assert.deepEqual(SL.mergeStalls(mine, []).stalls, SL.validateStalls(mine));
});

test("stalls: share links round-trip; tampered, cut or hostile links are rejected", () => {
  const list = [stall({ map: "https://maps.app.goo.gl/abc" }), { id: "mamak777", name: "Mamak Bistro", area: "", items: [{ name: "Roti canai", rm: 1.6, date: "2026-10-22" }] }];
  const code = SL.encodeStalls(list);
  const d = SL.decodeStalls(code);
  assert.ok(d.ok);
  assert.deepEqual(d.stalls, SL.validateStalls(list));
  const [body, chk] = code.split(".");
  assert.ok(SL.decodeStalls(`https://x.example/app.html#stalls?import=${body}&c=${chk}`).ok);
  assert.equal(SL.decodeStalls(body.slice(0, -4) + "." + chk).ok, false);
  assert.equal(SL.decodeStalls(body.replace(/^./, c => (c === "A" ? "B" : "A")) + "." + chk).ok, false);
  assert.equal(SL.decodeStalls("nonsense").ok, false);
  // hostile content: script map links, absurd prices and bad dates are dropped by validation
  const evil = SL.validateStalls([{ name: "<img src=x onerror=alert(1)>", map: "javascript:alert(1)", items: [{ name: "x", rm: 9999, date: "2026-10-01" }, { name: "y", rm: 2, date: "tomorrow" }] }]);
  assert.equal(evil[0].map, undefined);
  assert.equal(evil[0].items.length, 0);
  assert.equal(SL.cleanMapLink("http://maps.google.com/x"), "", "https only");
  assert.equal(SL.cleanMapLink("https://evil.example/maps"), "");
  assert.ok(SL.cleanMapLink("https://www.google.com/maps/place/x"));
});

test("stalls: newest stall prices feed My prices, converted to the app's meals", () => {
  const list = [stall(), { id: "mamak777", name: "Mamak", area: "", items: [{ name: "Roti canai", rm: 1.6, date: "2026-10-22" }, { name: "Nasi lemak biasa", rm: 4, date: "2026-10-23" }] }];
  const match = n => { const c = RC.categorize(n); return c.mealId && RC.PRICE_PIECES[c.mealId] ? c.mealId : null; };
  const p = SL.stallMealPrices(list, match, (id, rm) => RC.priceFromLine(id, rm, 1));
  assert.equal(p.roticanai.rm, 3.2);
  assert.equal(p.nasilemak.rm, 4, "the newer of two stalls' prices");
  assert.equal(p.tehtarik.rm, 2.2);
});

// ================= plumbing =================
test("browser scripts share one global scope: no top-level name is declared twice", () => {
  const files = ["icons", "foods", "storage", "week", "sim", "report", "planner", "checkin", "receipt", "realweek", "stalls", "classcode", "tools"];
  const seen = {};
  files.forEach(f => {
    const src = fs.readFileSync(path.join(__dirname, "..", "js", f + ".js"), "utf8");
    [...src.matchAll(/^(?:const|let|var|function|class) ([A-Za-z_$][\w$]*)/gm)].forEach(m => {
      assert.ok(!seen[m[1]], `${m[1]} is declared in both ${seen[m[1]]}.js and ${f}.js`);
      seen[m[1]] = f;
    });
  });
});

test("vendored OCR and QR files exist, and the heavy ones are cached lazily, not on install", () => {
  const { FILES } = require("../sw.js");
  ["vendor/tesseract/tesseract.min.js", "vendor/tesseract/worker.min.js", "vendor/tesseract/tesseract-core-lstm.wasm.js", "vendor/tesseract/lang/eng.traineddata.gz",
    "vendor/qr/qrcode.js", "vendor/qr/jsQR.js"].forEach(f => {
    assert.ok(fs.existsSync(path.join(__dirname, "..", f)), f);
    assert.ok(!FILES.includes(f), `${f} must not be precached`);
  });
  const sw = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  assert.match(sw, /cache: "reload"/);
  assert.match(sw, /skip-waiting/);
});
