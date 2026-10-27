// v8 unit tests: regressions for the Round B review findings (spend ids, receipt ↔ check-in links,
// groceries from receipts, stall link validation, class summary sentinels, parser words). npm run test:unit
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

const profile = over => St.validateProfile({ ...St.defaultProfile(), ...over });
const plan = P.planWeek(profile({})).plan;
const START = "2026-10-18";
const TODAY = new Date(2026, 9, 24);
const week = (spends, log) => RW.realWeek({ spends: RC.validateSpendLog(spends), today: TODAY, budget: 120, plan, start: START, log: C.validateLog(log), mealById: F.mealById, mealPrice: F.mealPrice });
const boughtSlot = () => { for (let d = 0; d < 7; d++) for (const s of ["B", "L", "D"]) if (plan[d][s] && F.mealById(plan[d][s]).source === "buy") return { d, s }; return null; };

// ---------- 1 (critical): two identical spends are two spends ----------
test("B1: identical spends get different ids and both count; deleting one keeps the other", () => {
  const a = RC.newSpendId(), b = RC.newSpendId();
  assert.notEqual(a, b);
  assert.match(a, /^[a-z0-9]{12}$/);
  const coffee = { date: "2026-10-20", items: [{ label: "Kopi O", rm: 2, category: "drink" }], total: 2 };
  const log = RC.validateSpendLog([{ ...coffee, id: a }, { ...coffee, id: b }]);
  assert.equal(log.length, 2);
  assert.equal(RW.realWeek({ spends: log, today: TODAY, budget: 100 }).total, 4);
  assert.equal(log.filter(s => s.id !== a).length, 1, "deleting by id removes exactly one");
  // stored before ids were random: two identical records without ids, or with the same id, are both kept
  const legacy = RC.validateSpendLog([coffee, coffee, { ...coffee, id: "same1" }, { ...coffee, id: "same1" }]);
  assert.equal(legacy.length, 4);
  assert.equal(new Set(legacy.map(s => s.id)).size, 4);
  assert.deepEqual(RC.validateSpendLog(legacy).map(s => s.id), legacy.map(s => s.id), "ids are stable once assigned");
});

// ---------- 3 (high): receipt ↔ check-in, no double counting, no loss ----------
test("B3: a receipt-linked meal counts once at the receipt price, even after the check-in is re-ticked", () => {
  const bs = boughtSlot();
  assert.ok(bs, "the default plan buys at least one meal");
  const date = C.addDays(START, bs.d);
  const sp = { id: "rcpt00000001", date, items: [{ label: "Nasi lemak", rm: 8.5, category: "meal", slot: bs.s }, { label: "Teh tarik", rm: 2.8, category: "drink", slot: bs.s }], total: 11.3 };
  assert.equal(RC.validateSpend(sp).items[0].slot, bs.s, "the line keeps its check-in slot");
  const linked = { days: { [bs.d]: { [bs.s]: { status: "other", rm: 11.3, label: "Nasi lemak + Teh tarik", src: "receipt", rid: sp.id } } } };
  assert.deepEqual(C.validateLog(linked).days[bs.d][bs.s].rids.map(x => x.id), [sp.id], "the check-in entry remembers its receipt (an old single rid becomes a one-receipt list)");
  assert.equal(week([sp], linked).total, 11.3);
  // the student later taps "Ate this" on the same meal: still counted once, at the receipt's price
  const reticked = { days: { [bs.d]: { [bs.s]: { status: "planned" } } } };
  assert.equal(week([sp], reticked).total, 11.3);
  // the student types "something else" over it: the receipt still wins, nothing is added twice
  assert.equal(week([sp], { days: { [bs.d]: { [bs.s]: { status: "other", rm: 5, label: "Typed" } } } }).total, 11.3);
});

test("B3: deleting a receipt clears the meals it logged and its groceries; nothing is lost or left behind", () => {
  const sp = { id: "rcpt00000002", date: "2026-10-20", items: [{ label: "Chicken rice", rm: 7, category: "meal", slot: "L" }], total: 7 };
  const groc = { id: "groc00000001", date: "2026-10-18", store: "Mydin", items: [{ label: "Beras 5kg", rm: 13, category: "groceries" }, { label: "Telur", rm: 6, category: "groceries" }], total: 19 };
  const log = C.validateLog({ groceries: true, groceryRids: [groc.id], groceryRm: 19, days: { 2: { L: { status: "other", rm: 7, label: "Chicken rice", src: "receipt", rid: sp.id }, D: { status: "other", rm: 6, label: "Chapati" } } } });
  assert.equal(week([sp, groc], log).total, 7 + 19 + 6);
  const after = C.unlinkReceipt(log, sp.id, rids => RW.linkedGroceryRm([groc], rids));
  assert.equal(after.days["2"].L, undefined, "the linked meal is cleared with its receipt");
  assert.equal(after.days["2"].D.label, "Chapati", "other meals stay");
  assert.equal(week([groc], after).total, 19 + 6);
  const noGroc = C.unlinkReceipt(after, groc.id, rids => RW.linkedGroceryRm([], rids));
  assert.equal(noGroc.groceryRids, undefined);
  assert.equal(noGroc.groceryRm, undefined, "no linked receipt left: back to the list's estimate");
  assert.equal(noGroc.groceries, true);
  assert.equal(week([], noGroc).estimatedGroceries, P.evaluate(plan).grocery);
  // an entry whose receipt vanished some other way (older version, cleared storage) is counted, not lost
  assert.equal(week([], { days: { 2: { L: { status: "other", rm: 7, label: "Chicken rice", src: "receipt", rid: "gone00000000" } } } }).total, 7);
});

// ---------- 13: groceries from receipts are additive, shop-day receipts link ----------
test("B13: two grocery receipts add up; a shop-day receipt (the day before the plan) still counts once", () => {
  const shop = { id: "groc00000002", date: "2026-10-17", store: "Lotus's", items: [{ label: "Beras 5kg", rm: 13, category: "groceries" }], total: 13 };
  const topup = { id: "groc00000003", date: "2026-10-21", store: "99 Speedmart", items: [{ label: "Sayur", rm: 4, category: "groceries" }, { label: "Kopi O", rm: 2, category: "drink" }], total: 6 };
  const rids = [shop.id, topup.id];
  assert.equal(RW.linkedGroceryRm([shop, topup], rids), 17, "grocery lines only, both receipts");
  const log = C.validateLog({ groceries: true, groceryRids: rids, groceryRm: 17 });
  assert.equal(C.summary(plan, log, 3).groceries, 17);
  const w = week([shop, topup], log);
  assert.equal(w.byCat.groceries, 17, "shop-day receipt added on day 1, top-up on its own day");
  assert.equal(w.total, 19);
  assert.equal(w.estimatedGroceries, 0);
  // ticked with no receipt at all: the plan's estimate, flagged as an estimate
  assert.equal(week([], { groceries: true }).estimatedGroceries, P.evaluate(plan).grocery);
});

// ---------- 14: the hub and My real week agree ----------
test("B14: Tools hub and My real week use the same week (the plan's) and the same total", () => {
  const src = fs.readFileSync(path.join(__dirname, "../js/tools.js"), "utf8");
  const hub = src.slice(src.indexOf("function renderHub"), src.indexOf("function renderReceipt"));
  assert.match(hub, /weekFor\(0\)/);
  assert.doesNotMatch(hub, /realWeek\(/, "the hub doesn't compute its own, different week");
  assert.match(src.slice(src.indexOf("function renderRealWeek"), src.indexOf("function renderRealWeek") + 200), /weekFor\(rwOffset\)/);
});

// ---------- 9: total vs lines, payment words ----------
test("B9: a total far from the lines asks first; tax and service charge within reason don't", () => {
  assert.equal(RC.totalMismatch(11.3, 11.3), false);
  assert.equal(RC.totalMismatch(17.65, 16.7), false, "SST and rounding");
  assert.equal(RC.totalMismatch(18.5, 16), false, "10% service + 6% SST");
  assert.equal(RC.totalMismatch(25.5, 16.7), true, "far more than tax adds");
  assert.equal(RC.totalMismatch(10, 12), true, "lines more than the total");
  assert.equal(RC.totalMismatch(2.4, 2), false, "under 50 sen is rounding");
  const r = RC.parseReceipt("NASI LEMAK 8.50\nTOTAL 8.50\nJUMLAH DIBAYAR 10.00\nAMOUNT PAID 10.00\nBAKI 1.50");
  assert.equal(r.total, 8.5, "what was paid is not the total");
  assert.equal(r.items.length, 1);
  assert.ok(r.check.ok);
});

// ---------- 16: day label, fees, discounts, NETT ----------
test("B16: NETT is a total only on its own; discounts stay with their item; tax counts as fees", () => {
  const r = RC.parseReceipt("NETT CHICKEN 500G 9.90\nSAYUR BAYAM 3.50\nDISKAUN -1.00\nNETT 12.40");
  assert.deepEqual(r.items.map(i => i.label), ["Nett Chicken 500g", "Sayur Bayam", "Diskaun"]);
  assert.equal(r.total, 12.4);
  assert.ok(r.check.ok);
  const lines = RC.confirmLines({ ...r, store: "Mydin" });
  assert.equal(lines[2].category, "groceries", "the discount takes the category of the item above");
  assert.equal(lines[2].discount, true);
  assert.equal(lines[2].mealId, undefined);
  assert.equal(RC.parseReceipt("ITEM 5.00\nNett Total 5.00").total, 5);
  // tax, service charge and rounding (total − lines) are fees, never "other"
  const w = RW.realWeek({ spends: RC.validateSpendLog([{ id: "taxx00000001", date: "2026-10-20", items: [{ label: "Nasi", rm: 10, category: "meal" }], total: 11.6 }]), today: TODAY, budget: 100 });
  assert.equal(w.byCat.fees, 1.6);
  assert.equal(w.byCat.other, 0);
  // the check-in link is labelled with the receipt's own day
  const src = fs.readFileSync(path.join(__dirname, "../js/tools.js"), "utf8");
  assert.match(src, /Count it in \$\{ui\.esc\(dayName\)\} check-in as/);
  assert.doesNotMatch(src, /Count it in today's check-in as/);
});

// ---------- 5, 6, 7, 12: stalls ----------
test("B5: hostile stall links never throw: huge, negative and fractional day numbers are dropped", () => {
  const bad = JSON.stringify([1, [["abcdef12", "Kafe", "", "", [["Nasi", 500, 1e12], ["Teh", 200, -5], ["Milo", 300, 1.5], ["Roti", 160, 2000]]]]]);
  const body = Buffer.from(bad).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  let chk = 7; for (let i = 0; i < body.length; i++) chk = (chk * 33 + body.charCodeAt(i)) % 1679616;
  let d;
  assert.doesNotThrow(() => { d = SL.decodeStalls(body + "." + chk.toString(36).padStart(4, "0")); });
  assert.ok(d.ok);
  assert.deepEqual(d.stalls[0].items.map(i => i.name), ["Roti"], "only the real past date survives");
  for (const junk of [[1, [[1, 2, 3, 4, [[{}, [], "x"]]]]], [1, [["a", { toString: null }]]], [1, [null, 5, "x", [[]]]]]) {
    const b = Buffer.from(JSON.stringify(junk)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    let c = 7; for (let i = 0; i < b.length; i++) c = (c * 33 + b.charCodeAt(i)) % 1679616;
    assert.doesNotThrow(() => SL.decodeStalls(b + "." + c.toString(36).padStart(4, "0")));
  }
});

test("B6: a price seen in the future, or before 2020, or on 31 February, is rejected", () => {
  const tomorrow2 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(SL.isStallDate(today), true);
  assert.equal(SL.isStallDate(tomorrow2), false);
  assert.equal(SL.isStallDate("2099-01-01"), false);
  assert.equal(SL.isStallDate("2019-12-31"), false);
  assert.equal(SL.isStallDate("2026-02-31"), false);
  const s = SL.validateStall({ name: "Kafe", items: [{ name: "Future nasi", rm: 5, date: "2099-01-01" }, { name: "Nasi", rm: 5, date: "2026-10-01" }] });
  assert.deepEqual(s.items.map(i => i.name), ["Nasi"]);
  // a future price can't win a merge forever
  const merged = SL.mergeStalls([{ id: "abcdef12", name: "Kafe", area: "", items: [{ name: "Nasi", rm: 5, date: "2026-10-01" }] }],
    [{ id: "abcdef12", name: "Kafe", area: "", items: [{ name: "Nasi", rm: 50, date: "2099-01-01" }] }]);
  assert.equal(merged.stalls[0].items[0].rm, 5);
});

test("B7: names in any script match and stay distinct (Chinese, Tamil, Arabic, accents)", () => {
  assert.equal(SL.normName("Nasi-Lemak!"), "nasi lemak");
  assert.notEqual(SL.normName("鸡饭"), SL.normName("面"), "two Chinese names are two items");
  assert.notEqual(SL.normName("சாதம்"), "");
  assert.equal(SL.normName("Café"), SL.normName("CAFÉ"));
  assert.equal(SL.normName("ＡＢＣ"), "abc", "full-width letters fold");
  const s = SL.validateStall({ name: "Restoran", items: [{ name: "鸡饭", rm: 7, date: "2026-10-01" }, { name: "面", rm: 6, date: "2026-10-01" }, { name: "بريani", rm: 9, date: "2026-10-01" }] });
  assert.equal(s.items.length, 3, "no item dropped as a duplicate of another");
  const m = SL.mergeStalls([{ id: "abcdef12", name: "海南鸡饭", area: "", items: [] }], [{ id: "zzzzzz99", name: "海南鸡饭", area: "", items: [] }, { id: "yyyyyy88", name: "肉骨茶", area: "", items: [] }]);
  assert.equal(m.stalls.length, 2, "same Chinese name merges; a different one is added");
});

test("B12: only exact map hosts are kept", () => {
  for (const ok of ["https://maps.app.goo.gl/abc", "https://www.google.com/maps/place/x", "https://maps.google.com/?q=1", "https://www.google.com.my/maps/@3,101,15z",
    "https://waze.com/ul?ll=3,101", "https://www.openstreetmap.org/#map=15/3/101", "https://maps.apple.com/?q=x"]) assert.ok(SL.cleanMapLink(ok), ok);
  for (const bad of ["https://evil.apple.com/x", "https://phish.google.evil.com/maps", "https://google.com.evil.my/maps", "https://attacker.waze.com.example/x",
    "https://www.google.com/search?q=x", "https://user:pw@maps.google.com/", "https://maps.google.com:8443/", "https://evilwaze.com/", "http://maps.apple.com/", "https://goo.gl/maps/xyz"]) assert.equal(SL.cleanMapLink(bad), "", bad);
});

// ---------- 11, 15: class codes ----------
test("B11: an empty class summary says 'no data', never 0% or 0 kg", () => {
  const notPlayed = [0.1, 0.2].map(seed => CC.encodeStudent(CC.studentValues({ report: null, budget: 120, kitchen: "shared", goal: "money" }, () => seed), ""));
  const agg = CC.aggregate(notPlayed, null);
  assert.equal(agg.played, 0);
  const cls = CC.describeClass(CC.decode(CC.encodeClass(CC.classValues(agg, null, () => 0.3), "")).values);
  assert.deepEqual([cls.cost.p50, cls.co2.p50, cls.fvMean, cls.overPct, cls.quizMean, cls.adhP50], [null, null, null, null, null, null]);
  const me = CC.describeStudent(CC.decode(CC.encodeStudent(CC.studentValues({ report: { spent: 100, budget: 120, co2: 10, fvDaysMet: 3, archetypeId: "hawk" }, budget: 120 }, () => 0.4))).values);
  assert.deepEqual(CC.compareToClass(me, cls), [], "nothing to compare with: no rows, no 'below most of the class'");
  // real zeros still read as zero
  const zero = CC.classValues({ n: 1, cost: { p25: 0, p50: 0, p75: 0 }, overPct: 0, co2: { p25: 0, p50: 0, p75: 0 }, fvMean: 0, quizMean: null, adhP50: null, archetypes: [] }, null, () => 0);
  const z = CC.describeClass(zero);
  assert.deepEqual([z.cost.p50, z.co2.p50, z.fvMean, z.overPct], [0, 0, 0, 0]);
  // the lecturer screen won't offer a summary with no finished weeks
  const src = fs.readFileSync(path.join(__dirname, "../js/tools.js"), "utf8");
  assert.match(src, /agg\.played \? `<button type="button" class="btn" id="sum-make">/);
});

test("B15: codes pasted with nothing between them are all found", () => {
  const codes = [0.1, 0.2, 0.3].map(seed => CC.encodeStudent(CC.studentValues({ report: { spent: 100, budget: 120, co2: 10, fvDaysMet: 3, archetypeId: "hawk" }, budget: 120 }, () => seed), "BIO101"));
  assert.equal(CC.importCodes([], codes.join("")).added, 3, "joined with hyphens intact");
  assert.equal(CC.importCodes([], codes.map(c => c.replace(/-/g, "")).join("")).added, 3, "joined with hyphens stripped");
  assert.equal(CC.importCodes([], codes.join(",")).added, 3);
  const r = CC.importCodes([], codes[0] + codes[1].slice(0, -3));
  assert.equal(r.added, 1); assert.equal(r.rejected.length, 1, "a cut-off second code is reported, not silently merged");
});

// ---------- 8, 10, 2: plumbing the browser tests also cover ----------
test("B8: the first visit never reloads; only an update replacing an old version does", () => {
  const src = fs.readFileSync(path.join(__dirname, "../js/main.js"), "utf8");
  assert.match(src, /let hadController = !!navigator\.serviceWorker\.controller/);
  assert.match(src, /if \(!hadController\) \{ hadController = true; return; \}/);
  assert.match(fs.readFileSync(path.join(__dirname, "../sw.js"), "utf8"), /const CACHE = "makan-v\d+"/);
});

test("B2 + B10: money inputs fit RM 1,234.56; meters are blocks even inside inline wrappers", () => {
  const css = fs.readFileSync(path.join(__dirname, "../css/base.css"), "utf8");
  assert.match(css, /\.money-input input \{[^}]*width: 8ch/);
  assert.match(css, /\.meter \{ display: block;/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "../css/app.css"), "utf8"), /money-input input \{ width: [1-7]ch/);
});

test("B4: setup keeps the opened link (query and all); stall and class links open without a setup", () => {
  const src = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
  assert.match(src, /const NO_PROFILE = \["stalls", "class", "learn"/);
  assert.match(src, /renderSetup\(location\.hash\.replace\(\/\^#\/, ""\) \|\| "home"\)/);
  assert.match(src, /save\(next \|\| "home"\)/);
  assert.doesNotMatch(src, /save\(next === "plan" \? "plan" : next\)/);
});
