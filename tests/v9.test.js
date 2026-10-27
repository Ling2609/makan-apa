// v9 unit tests: regressions for the Round C review findings, and a property test over the real-week
// money flows (check-in ticks, receipt links, several receipts per meal, deletes, the shop before the
// plan starts, price changes): Today, My real week, the Tools hub and Past weeks must agree.
// npm run test:unit
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const F = require("../js/foods.js");
const St = require("../js/storage.js");
const P = require("../js/planner.js");
const C = require("../js/checkin.js");
const RC = require("../js/receipt.js");
const CC = require("../js/classcode.js");
const SL = require("../js/stalls.js");
const RW = require("../js/realweek.js");
const RP = require("../js/report.js");

const src = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const profile = over => St.validateProfile({ ...St.defaultProfile(), ...over });
const plan = P.planWeek(profile({})).plan;
const TODAY = new Date();
const START = C.addDays(C.toKey(TODAY), -6); // a plan whose last day is today
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} vs ${b}`);
const boughtSlots = () => { const out = []; for (let d = 0; d < 7; d++) for (const s of ["B", "L", "D"]) if (plan[d][s] && F.mealById(plan[d][s]).source === "buy") out.push({ d, s }); return out; };
const week = (spends, log, extra = {}) => RW.realWeek({ spends: RC.validateSpendLog(spends), today: TODAY, budget: 120, plan, start: START, log: C.validateLog(log), mealById: F.mealById, mealPrice: F.mealPrice, ...extra });
const spend = (id, d, items) => ({ id, date: C.addDays(START, d), store: "", items, total: Math.round(items.reduce((a, it) => a + it.rm, 0) * 100) / 100, source: "typed" });

// ---------- 1 (critical): several receipts for one meal ----------
test("C1: a second receipt for the same meal adds its share; deleting one takes off only its share", () => {
  const { d, s } = boughtSlots()[0];
  const a = spend("rcptaaaa0001", d, [{ label: "Nasi lemak", rm: 6, category: "meal", slot: s }]);
  const b = spend("rcptbbbb0002", d, [{ label: "Teh tarik", rm: 2.5, category: "drink", slot: s }]);
  let log = C.linkReceipt(C.validateLog(null), d, s, a.id, 6, "Nasi lemak");
  log = C.linkReceipt(log, d, s, b.id, 2.5, "Teh tarik");
  const e = log.days[d][s];
  assert.equal(e.rm, 8.5, "both receipts count");
  assert.equal(e.label, "Nasi lemak + Teh tarik");
  assert.deepEqual(e.rids.map(x => [x.id, x.rm]), [[a.id, 6], [b.id, 2.5]]);
  assert.equal(week([a, b], log).total, 8.5);
  close(C.summary(plan, log, 6).cashOut, 8.5, "Today agrees");
  // the same receipt saved again replaces its own share, never doubles it
  assert.equal(C.linkReceipt(log, d, s, b.id, 3, "Teh tarik").days[d][s].rm, 9);
  // deleting the first receipt leaves the second one's share
  const after = C.unlinkReceipt(log, a.id);
  assert.equal(after.days[d][s].rm, 2.5);
  assert.equal(after.days[d][s].label, "Teh tarik");
  assert.equal(week([b], after).total, 2.5);
  assert.equal(C.unlinkReceipt(after, b.id).days[d], undefined, "no receipt left: the meal is cleared");
  // a stored log keeps the shares through validation
  assert.deepEqual(C.validateLog(JSON.parse(JSON.stringify(log))), log);
});

// ---------- 2 (high): the shop before a "Next Monday" plan starts ----------
test("C2: a grocery receipt from days before the start counts in the plan's week, on day 1", () => {
  const g = spend("groc0000aaaa", -3, [{ label: "Beras 5kg", rm: 13, category: "groceries" }, { label: "Telur", rm: 6.5, category: "groceries" }]);
  const log = C.validateLog({ groceries: true, groceryRids: [g.id], groceryRm: 19.5 });
  const wk = week([g], log);
  assert.equal(wk.total, 19.5);
  assert.equal(wk.days[0].rm, 19.5);
  close(C.summary(plan, log, 6).cashOut, 19.5, "Today agrees");
  // the Receipt screen allows linking from a week before the start (tools.js planContext)
  assert.match(src("js/tools.js"), /if \(idx < -7 \|\| idx > 13\) return null;/);
  assert.match(src("js/tools.js"), /const groceryDay = !!ctx && dayIdx >= -7 && dayIdx <= 6;/);
});

// ---------- 4: the shop counted in two weeks ----------
test("C4: the earlier week leaves out the shop the plan's week already counts (its other lines stay)", () => {
  const g = spend("groc0000bbbb", -1, [{ label: "Beras 5kg", rm: 13, category: "groceries" }, { label: "Kit Kat", rm: 3, category: "snack" }]);
  const log = C.validateLog({ groceries: true, groceryRids: [g.id], groceryRm: 13 });
  const earlier = RW.realWeek({ spends: RC.validateSpendLog([g]), today: TODAY, budget: 120, start: C.addDays(START, -7), groceriesElsewhere: log.groceryRids });
  assert.equal(earlier.total, 3, "only the snack is left in the earlier week");
  assert.equal(week([g], log).total, 13, "the groceries are in the plan's week");
  assert.equal(earlier.total + week([g], log).total, g.total, "together: the receipt once");
  assert.match(src("js/tools.js"), /groceriesElsewhere: running && !planWeekShown \? ctx\.log\.groceryRids \|\| \[\] : \[\]/);
});

// ---------- 5: typed amounts ----------
test("C5: typed lines take 0–2 decimals and 'RM n'; photo text still needs cents; dates are never prices", () => {
  const p = RC.parseReceipt("Teh tarik 2.8\nNasi lemak RM5\nKopi o 3\nRoti canai RM 1.50\n12/10/26", { typed: true });
  assert.deepEqual(p.items.map(i => [i.label, i.rm]), [["Teh Tarik", 2.8], ["Nasi Lemak", 5], ["Kopi O", 3], ["Roti Canai", 1.5]]);
  assert.equal(p.date, "2026-10-12");
  assert.equal(RC.parseTypedAmount("RM5"), 5);
  assert.equal(RC.parseTypedAmount("8.5"), 8.5);
  assert.equal(RC.parseTypedAmount("Total 11,30"), 11.3);
  assert.equal(RC.parseReceipt("Kopi o 3\nTable 12").items.length, 0, "a photo's '3' is not RM 3");
  // typed text gets typed-text advice
  const w = RC.parseReceipt("Teh 2.8\nTotal 9", { typed: true }).warnings.join(" ");
  assert.match(w, /the total you typed says RM 9\.00/);
  assert.match(w, /Check the amounts you typed/);
  assert.doesNotMatch(w, /misread|photo/);
  assert.equal(RC.parseReceipt("Teh 2.8", { typed: true }).warnings.length, 0, "no 'type the total' nag for typed text");
});

// ---------- 6: the over-budget banner names the real cause ----------
test("C6: the over-budget banner blames prices when there were no swaps", () => {
  const a = src("js/app.js");
  assert.doesNotMatch(a, /Your swaps took the plan over; a plan within budget is possible/);
  assert.match(a, /Prices changed after this plan was made \(My prices or stall prices\), and that took it over\./);
  assert.match(a, /\$\{overCause\(p\)\} A plan within budget is possible\./);
});

// ---------- 7: print tags ----------
test("C7: print tags stack inside their cell, no stray separator", () => {
  const css = src("css/print.css");
  assert.doesNotMatch(css, /\.tag \+ \.tag::before/);
  assert.match(css, /\.pg-tags \{ display: flex; flex-direction: column;/);
  assert.match(css, /\.pg-tags \.tag \{ white-space: normal; overflow-wrap: break-word;/);
});

// ---------- 8: stall dates ----------
test("C8: stall dates are checked with the same rule the list keeps, and the sheet says so", () => {
  const tomorrow = C.addDays(C.toKey(new Date()), 2);
  assert.equal(SL.isStallDate(tomorrow), false);
  assert.equal(SL.isStallDate("2019-12-31"), false);
  assert.equal(SL.isStallDate(C.toKey(new Date())), true);
  assert.match(src("js/tools.js"), /if \(d && !isStallDate\(d\)\) \{ badDate = badDate \|\| root\.querySelector\(`#sf-d-\$\{i\}`\); return; \}/);
});

// ---------- 9: class over-budget ----------
test("C9: a student a little over budget is over in the class code and the class picture", () => {
  for (const spent of [120.01, 121, 122, 124.9]) {
    const v = CC.studentValues({ report: { spent, budget: 120, co2: 10, fvDaysMet: 3, archetypeId: "hawk" }, budget: 120 }, () => 0.5);
    const back = CC.describeStudent(CC.decode(CC.encodeStudent(v, "")).values);
    assert.ok(back.costPct > 100, `${spent} of 120 reads as over (${back.costPct}%)`);
    assert.equal(CC.aggregate([CC.encodeStudent(v, "")]).overPct, 100);
  }
  const under = CC.studentValues({ report: { spent: 119.9, budget: 120, co2: 10, fvDaysMet: 3, archetypeId: "hawk" }, budget: 120 }, () => 0.5);
  assert.equal(CC.describeStudent(under).costPct, 100);
  assert.equal(CC.aggregate([CC.encodeStudent(under, "")]).overPct, 0, "at budget is not over");
});

// ---------- 10: the UNEP claim ----------
test("C10: the week only claims what the UNEP report says (≈60% of food waste is at home)", () => {
  const w = src("js/week.js");
  assert.doesNotMatch(w, /most common household food waste/);
  assert.match(w, /About 60% of the food wasted worldwide is wasted at home\./);
});

// ---------- 11: "Ate this" keeps the price it had ----------
test("C11: a ticked meal keeps its price when prices change later (Today, My real week, Past weeks)", () => {
  const { d, s } = boughtSlots()[0];
  const m = F.mealById(plan[d][s]);
  const was = F.mealStats(m).rm;
  const log = C.record(C.validateLog(null), d, s, { status: "planned", rm: was });
  assert.equal(log.days[d][s].rm, was, "the price is stored with the tick");
  const before = { today: C.summary(plan, log, 6), real: week([], log).total, past: C.weekSums(plan, log) };
  F.setPriceOverrides({ meals: { [m.id]: was + 5 } });
  try {
    assert.equal(C.summary(plan, log, 6).spentToDate, before.today.spentToDate);
    assert.equal(C.summary(plan, log, 6).cashOut, before.today.cashOut);
    assert.equal(week([], log).total, before.real);
    assert.deepEqual(C.weekSums(plan, log), before.past);
    // an older tick without a price still follows today's price
    assert.equal(C.summary(plan, C.record(C.validateLog(null), d, s, { status: "planned" }), 6).cashOut, Math.round((was + 5) * 100) / 100);
  } finally { F.setPriceOverrides({}); }
  assert.match(src("js/app.js"), /status === "planned" \? \{ status, rm: mealStats\(mealById\(p\.plan\[day\]\[slot\]\)\)\.rm \}/);
  // Past weeks are frozen when filed
  const h = St.validateHistory([{ start: START, plan, log, budget: 120, reason: "finished", at: 1, sums: before.past }]);
  assert.deepEqual(h[0].sums, before.past);
  assert.equal(St.validateHistory([{ start: START, plan, log, sums: { kept: -1 } }])[0].sums, undefined, "bad sums are dropped, not trusted");
});

// ---------- 12: the report's words ----------
test("C12: the report names each priciest pick once, and 'Choosing … would have been' reads as English", () => {
  const big = RP.priciest([{ label: "Nasi kandar", cash: 14, kind: "meal" }, { label: "Nasi kandar", cash: 14, kind: "meal" }, { label: "Bubble tea", cash: 9, kind: "drink" }, { label: "Shop", cash: 40, kind: "shop" }]);
  assert.equal(RP.priciestText(big), "Your two priciest picks were “Nasi kandar” (RM 14.00, twice) and “Bubble tea” (RM 9.00).");
  assert.equal(RP.priciestText(RP.priciest([{ label: "Pizza", cash: 20, kind: "meal" }, { label: "pizza", cash: 20, kind: "meal" }])), "Your priciest pick was “Pizza” (RM 20.00, twice).");
  assert.equal(RP.priciestText([]), "");
  const a = src("js/app.js");
  assert.match(a, /return `Choosing “\$\{esc\(alt\.label\)\}” would have been /);
  assert.doesNotMatch(a, /return `\$\{esc\(alt\.label\)\} would have been/);
});

// ---------- 13: parser slips ----------
test("C13: '7 Up' is a drink, not seven 'Up'; Boost Juice is a drink, Boost e-wallet is a payment", () => {
  const p = RC.parseReceipt("KEDAI\n7 Up 2.50\nBOOST JUICE BLENDS 12.90\n2 Teh Tarik 5.60\nBOOST 21.00\nTOTAL 21.00");
  assert.deepEqual(p.items.map(i => [i.label, i.qty, i.rm]), [["7 Up", 1, 2.5], ["Boost Juice Blends", 1, 12.9], ["Teh Tarik", 2, 5.6]]);
  assert.equal(RC.categorize("Boost Juice Blends").category, "drink");
});

// ---------- 14: crafted class codes ----------
test("C14: a code that passes the checksum but holds impossible numbers is refused", () => {
  const good = CC.studentValues({ report: { spent: 100, budget: 120, co2: 10, fvDaysMet: 3, archetypeId: "hawk" }, budget: 120, quizAsked: true, quizRight: 2, adherence: 80 }, () => 0.1);
  assert.equal(CC.decode(CC.encodeStudent(good, "")).ok, true);
  for (const bad of [{ quiz: 5 }, { adh5: 25 }, { budgetBand: 12 }]) assert.equal(CC.decode(CC.encodeStudent({ ...good, ...bad }, "")).ok, false, JSON.stringify(bad));
  for (const edge of [{ costPct5: 126 }, { co2x10: 1023 }, { quiz: 7 }, { adh5: 31 }, { budgetBand: 15 }]) assert.equal(CC.decode(CC.encodeStudent({ ...good, ...edge }, "")).ok, true, JSON.stringify(edge));
  const cls = CC.classValues(CC.aggregate([CC.encodeStudent(good, "")]), null, () => 0.1);
  assert.equal(CC.decode(CC.encodeClass(cls, "")).ok, true);
  for (const bad of [{ overPct: 110 }, { costP25: 30, costP50: 20 }, { fvMean10: 90 }, { adhP50: 25 }, { chType: 6 }, { co2P75: 1 }]) {
    const r = CC.decode(CC.encodeClass({ ...cls, ...bad }, ""));
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.error, /no real result can have/);
  }
});

// ---------- 15: future spend dates ----------
test("C15: a spend dated in the future (or on a day that doesn't exist) is refused", () => {
  const item = [{ label: "Kopi", rm: 2, category: "drink" }];
  assert.equal(RC.validateSpend({ date: C.addDays(C.toKey(new Date()), 3), items: item, total: 2 }), null);
  assert.equal(RC.validateSpend({ date: "2026-02-30", items: item, total: 2 }), null);
  assert.ok(RC.validateSpend({ date: C.toKey(new Date()), items: item, total: 2 }));
});

// ---------- 16: the docs' test counts ----------
test("C16: README and the project report state the real number of tests", () => {
  const unit = ["tests/unit.test.js", "tests/v7.test.js", "tests/v8.test.js", "tests/v9.test.js", "tests/v10.test.js", "tests/makan.test.js", "tests/collection.test.js"].reduce((a, f) => a + (src(f).match(/^test\(/gm) || []).length, 0);
  const e2eFiles = fs.readdirSync(path.join(__dirname, "e2e")).filter(f => f.endsWith(".test.js"));
  const widths = src("tests/e2e/helpers.js").match(/const WIDTHS = \[([^\]]*)\]/)[1].split(",").length; // responsive.js runs one test per width
  const responsive = (src("tests/e2e/responsive.js").match(/^\s*test\(/gm) || []).length * widths;
  const e2e = e2eFiles.reduce((a, f) => { const t = src(`tests/e2e/${f}`); return a + (/require\("\.\/responsive"\)/.test(t) ? responsive : (t.match(/^test\(/gm) || []).length); }, 0);
  assert.match(src("package.json"), /tests\/v9\.test\.js tests\/v10\.test\.js/);
  for (const doc of ["README.md", "docs/PROJECT_REPORT.md"]) {
    const t = src(doc);
    assert.ok(t.includes(`${unit} unit`), `${doc} says ${unit} unit tests`);
    assert.ok(t.includes(`${e2e} end-to-end`), `${doc} says ${e2e} end-to-end tests`);
    assert.doesNotMatch(t, /82 unit|28 e2e|98 unit|35 end-to-end|118 unit|42 end-to-end/, `${doc} has no stale counts`);
  }
});

// ---------- 17: map links ----------
test("C17: bare goo.gl short links are refused (any URL could hide behind them); maps.app.goo.gl stays", () => {
  assert.equal(SL.cleanMapLink("https://goo.gl/maps/xyz"), "");
  assert.equal(SL.cleanMapLink("https://goo.gl/abc"), "");
  assert.ok(SL.cleanMapLink("https://maps.app.goo.gl/abc"));
});

// ---------- 18: start today, print wording, receipt drafts ----------
test("C18: a plan started today buys day 1's breakfast and lunch (nothing at home before the shop)", () => {
  for (const kitchen of ["hostel", "shared", "home"]) {
    const pr = profile({ kitchen });
    const base = P.planWeek(pr).plan;
    for (let wd = 0; wd < 7; wd++) {
      const p = P.orderForFreshness(P.rotatePlan(base, wd), pr, { weekday0: wd, noCookDay0: ["B", "L"] });
      for (const s of ["B", "L"]) if (p[0][s]) assert.equal(F.mealById(p[0][s]).source, "buy", `${kitchen}, weekday ${wd}, ${s}: ${p[0][s]}`);
    }
  }
  // oats every morning: nothing to trade with, so day 1's breakfast is bought
  const pr = profile({ kitchen: "hostel" });
  const oats = P.planWeek(pr).plan.map(d => ({ ...d, B: "oatssoy" }));
  const fixed = P.orderForFreshness(oats, pr, { weekday0: 2, noCookDay0: ["B", "L"] });
  assert.equal(F.mealById(fixed[0].B).source, "buy");
});

test("C18: the printed cook-ahead plan names a date, never 'today'", () => {
  const a = src("js/app.js");
  assert.doesNotMatch(a, /\(today, after the shop\)/);
  assert.match(a, /`\$\{planDayName\(p\.start, 0\)\} \$\{dateLabel\(p\.start\)\}, after the shop`/);
});

test("C18: a receipt draft survives a reload, cleaned; stale or broken drafts are dropped", () => {
  const now = Date.now();
  const raw = { source: "typed", store: "Kafe", date: C.toKey(new Date()), total: "11.30", warnings: ["x"], ocrText: "", at: now - 1000, groceries: false, savePrices: true,
    lines: [{ label: "Nasi lemak", rm: 8.5, category: "meal", mealId: "nasilemak", qty: 1, slot: "L" }, { label: "Teh", rm: "2.8", category: "nope", mealId: "bogus", qty: 99, slot: "Z" }] };
  const d = RC.validateDraft(JSON.parse(JSON.stringify(raw)), now);
  assert.equal(d.total, 11.3);
  assert.deepEqual(d.lines[1], { label: "Teh", rm: 2.8, category: "other", mealId: null, packId: null, qty: 1, slot: "", price: false });
  assert.equal(d.savePrices, true);
  assert.equal(RC.validateDraft({ ...raw, at: now - 4 * 86400000 }, now), null, "older than 3 days: stale");
  assert.equal(RC.validateDraft({ ...raw, lines: [] }, now), null);
  assert.equal(RC.validateDraft({ ...raw, date: "2099-01-01" }, now).date, C.toKey(new Date(now)), "a future date falls back to today");
  assert.equal(St.KEYS.draft, "eft2-receipt-draft");
  const t = src("js/tools.js");
  assert.match(t, /if \(!draft\) draft = validateDraft\(storeGet\(KEYS\.draft, null\)\);/);
  assert.match(t, /storeSet\(KEYS\.draft, \{ \.\.\.draft, ocrText: "" \}\)/, "the raw camera text is never kept");
});

// ---------- the property test: every money flow, every screen agrees ----------
// A seeded generator plays random weeks the way the interface does (same functions, same order) and
// keeps its own ledger of the money. After every step:
//   L. My real week = the ledger (each receipt once, each ticked meal once, the shop once)
//   T. Today's cash out = My real week minus the receipt lines that aren't a check-in meal or the shop
//   W. the earlier week + the plan's week = every receipt dated in those 14 days, once, plus the check-in's own money
//   H. the Tools hub's number is My real week's (same call, tools.js weekFor)
//   P. a meal price change never changes money already logged; the week filed under Past weeks keeps its numbers
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

test("property: Today, My real week, the hub and Past weeks agree through every combination of ticks, receipts, deletes, the shop and price changes", () => {
  const slots = []; for (let d = 0; d < 7; d++) for (const s of P.PLAN_SLOTS) if (plan[d][s]) slots.push({ d, s });
  const buyMeals = F.MEALS.filter(m => m.source === "buy" && m.id !== "skip" && m.id !== "water");
  const ev0 = () => P.evaluate(plan, {});
  let checks = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed * 2654435761);
    const pick = a => a[Math.floor(r() * a.length)];
    const money = () => Math.round((1 + r() * 14) * 10) / 10;
    let spends = [], log = C.validateLog(null), n = 0;
    const truth = {}; // "d|s" → { kind: "planned"|"typed"|"skip"|"receipt", rm?, ids? }
    const newId = () => `p${seed.toString(36)}x${(n++).toString(36)}`.padEnd(8, "0").slice(0, 16);
    F.setPriceOverrides({});
    const changeAnyway = (d, s) => {
      // Today's "Change it anyway" on a receipt meal (app.js wireToday)
      const cur = log.days[d] && log.days[d][s];
      if (cur && cur.src === "receipt") {
        spends = RC.unslotSpends(spends, (cur.rids || []).map(x => x.id), C.addDays(START, d), s);
        log = C.record(log, d, s, null);
      }
    };
    const steps = 4 + Math.floor(r() * 14);
    for (let step = 0; step < steps; step++) {
      const act = r();
      const { d, s } = pick(slots);
      const k = `${d}|${s}`;
      if (act < 0.16) { // "Ate this" (price kept with the tick)
        changeAnyway(d, s);
        const m = F.mealById(plan[d][s]);
        log = C.record(log, d, s, { status: "planned", rm: F.mealStats(m).rm });
        truth[k] = { kind: "planned", rm: m.source === "buy" ? F.mealStats(m).rm : 0 };
      } else if (act < 0.26) { // "Something else", typed
        changeAnyway(d, s);
        const v = money();
        log = C.record(log, d, s, { status: "other", rm: v, label: "Typed" });
        truth[k] = { kind: "typed", rm: v };
      } else if (act < 0.32) {
        changeAnyway(d, s);
        log = C.record(log, d, s, { status: "skipped" });
        truth[k] = { kind: "skip" };
      } else if (act < 0.52) { // a receipt for this meal (maybe a second one), maybe with a line that's no meal
        const id = newId();
        const lines = [{ label: "Meal " + id, rm: money(), category: "meal", slot: s }];
        if (r() < 0.4) lines.push({ label: "Drink " + id, rm: money(), category: "drink", slot: s });
        if (r() < 0.3) lines.push({ label: "Extra " + id, rm: money(), category: "snack" });
        const sp = RC.validateSpend(spend(id, d, lines));
        spends = RC.validateSpendLog([sp].concat(spends));
        const share = Math.round(lines.filter(l => l.slot).reduce((a, l) => a + l.rm, 0) * 100) / 100;
        log = C.linkReceipt(log, d, s, id, share, "R " + id);
        truth[k] = truth[k] && truth[k].kind === "receipt" ? { kind: "receipt", ids: truth[k].ids.concat(id) } : { kind: "receipt", ids: [id] };
      } else if (act < 0.62) { // the shop: from a week before the start up to the last day, linked as the groceries
        const id = newId();
        const day = -7 + Math.floor(r() * 14);
        const sp = RC.validateSpend(spend(id, day, [{ label: "Beras " + id, rm: money(), category: "groceries" }, { label: "Telur " + id, rm: money(), category: "groceries" }]));
        spends = RC.validateSpendLog([sp].concat(spends));
        const rids = (log.groceryRids || []).concat(id);
        log = C.validateLog({ ...log, groceries: true, groceryRids: rids, groceryRm: RW.linkedGroceryRm(spends, rids) });
      } else if (act < 0.67) { // ticked the groceries by hand, no receipt
        if (!log.groceryRids) log = C.validateLog({ ...log, groceries: true });
      } else if (act < 0.72) { // a coffee before the plan started: the earlier week's money, never the plan's
        const id = newId();
        spends = RC.validateSpendLog([RC.validateSpend(spend(id, -1 - Math.floor(r() * 6), [{ label: "Kopi " + id, rm: money(), category: "drink" }]))].concat(spends));
      } else if (act < 0.86) { // delete a receipt (tools.js: unlinkReceipt with what's left)
        if (!spends.length) continue;
        const gone = pick(spends).id;
        spends = spends.filter(x => x.id !== gone);
        log = C.unlinkReceipt(log, gone, rids => RW.linkedGroceryRm(spends, rids));
        Object.keys(truth).forEach(t => { if (truth[t].kind === "receipt") { truth[t].ids = truth[t].ids.filter(x => x !== gone); if (!truth[t].ids.length) delete truth[t]; } });
      } else { // a price change (My prices or a stall price): money already logged must not move
        const before = { today: C.summary(plan, log, 6), real: week(spends, log).total, past: St.validateHistory([{ start: START, plan, log, sums: C.weekSums(plan, log) }])[0].sums };
        const m = pick(buyMeals);
        F.setPriceOverrides({ meals: { [m.id]: Math.round((F.PRICE_MIN + r() * 20) * 100) / 100 } });
        const after = C.summary(plan, log, 6);
        close(after.spentToDate, before.today.spentToDate, `seed ${seed}: Today's spent after a price change`);
        close(after.cashOut, before.today.cashOut, `seed ${seed}: Today's cash out after a price change`);
        close(week(spends, log).total, before.real, `seed ${seed}: My real week after a price change`);
        assert.deepEqual(before.past, St.validateHistory([{ start: START, plan, log, sums: before.past }])[0].sums, "Past weeks keep the filed numbers");
      }

      // ----- the checks -----
      const inWin = spends.filter(x => x.date >= START && x.date <= C.addDays(START, 6));
      const linkedG = log.groceryRids || [];
      const wk = week(spends, log);
      const sm = C.summary(plan, log, 6);
      // L: the ledger
      let ledger = inWin.reduce((a, x) => a + x.total, 0);
      ledger += spends.filter(x => linkedG.includes(x.id) && x.date < START).reduce((a, x) => a + x.items.filter(i => i.category === "groceries").reduce((b, i) => b + i.rm, 0), 0);
      Object.values(truth).forEach(t => { if (t.kind === "planned" || t.kind === "typed") ledger += t.rm; });
      const anyGrocLines = inWin.some(x => x.items.some(i => i.category === "groceries"));
      if (log.groceries && !linkedG.length && !anyGrocLines) ledger += log.groceryRm !== undefined ? log.groceryRm : ev0().grocery;
      close(wk.total, ledger, `seed ${seed} step ${step}: My real week = the ledger`);
      // T: Today = My real week minus what isn't a check-in meal or the shop
      const notCheckin = inWin.reduce((a, x) => a + x.items.filter(i => !i.slot && i.category !== "groceries").reduce((b, i) => b + i.rm, 0) + (x.total - x.items.reduce((b, i) => b + i.rm, 0)), 0);
      if (!(log.groceries && !linkedG.length && anyGrocLines)) close(sm.cashOut, wk.total - notCheckin, `seed ${seed} step ${step}: Today's cash out`);
      // W: two weeks side by side count each receipt once
      const earlier = RW.realWeek({ spends, today: TODAY, budget: 120, start: C.addDays(START, -7), groceriesElsewhere: linkedG });
      const fortnight = spends.filter(x => x.date >= C.addDays(START, -7) && x.date <= C.addDays(START, 6)).reduce((a, x) => a + x.total, 0);
      const checkinOnly = Object.values(truth).reduce((a, t) => a + (t.kind === "planned" || t.kind === "typed" ? t.rm : 0), 0)
        + (log.groceries && !linkedG.length && !anyGrocLines ? (log.groceryRm !== undefined ? log.groceryRm : ev0().grocery) : 0);
      close(earlier.total + wk.total, fortnight + checkinOnly, `seed ${seed} step ${step}: earlier week + plan week`);
      // H: the hub calls realWeek with the same arguments as My real week (tools.js weekFor)
      assert.match(src("js/tools.js"), /const wk = weekFor\(0\);[\s\S]*const wk = weekFor\(rwOffset\);/);
      // the check-in never points at a receipt that's gone, and every share is a receipt that's there
      Object.values(log.days).forEach(day => Object.values(day).forEach(e => (e.rids || []).forEach(x => assert.ok(spends.some(sp => sp.id === x.id), `seed ${seed}: dangling receipt ${x.id}`))));
      checks++;
    }
  }
  F.setPriceOverrides({});
  assert.ok(checks > 3000, `${checks} states checked`);
});
