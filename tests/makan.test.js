// Makan Apa?: Pick for me, eating with friends, quiz, plate check, and the sourced knowledge data.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const F = require("../js/foods.js");
Object.assign(global, F);
const M = require("../js/makan.js");
const S = require("../js/storage.js");
const P = require("../js/planner.js");
const { KNOWLEDGE, SWAPDATA } = require("../js/knowledge.js");

const prof = over => S.validateProfile({ budget: 120, kitchen: "shared", goal: "money", diet: { halal: true }, campusLunch: true, breakfast: true, ...over });
const ctxFor = (p, over = {}) => ({
  profile: p, slot: "L", today: { fv: 0, salty: 0, sugary: 0, ids: [] }, recent: {}, weekLeft: p.budget, daysLeft: 7, have: {}, prefs: {},
  opts: { time: "any", mode: "any", mood: "any" }, seed: "t", mealBudget: M.mealBudgetFor(p.budget, over.slot || "L", true), ...over
});

test("allergies, halal, vegetarian and no beef are never broken: every pick and backup, every combination", () => {
  const AL = F.ALLERGEN_IDS;
  const sets = [[]].concat(AL.map(a => [a]), [["peanut", "crustacean"], ["gluten", "egg", "milk"], ["soy", "fish", "crustacean", "mollusc"]]);
  let checked = 0;
  for (const allergies of sets) for (const kitchen of ["hostel", "shared"]) for (const diet of [{ halal: true }, { halal: false }, { halal: true, vegetarian: true }, { halal: false, noBeef: true }])
    for (const slot of M.MK_SLOTS) for (const mode of ["any", "buy", "cook"]) for (const seed of ["a", "b"]) {
      const p = prof({ kitchen, diet: { ...diet, allergies } });
      const r = M.pick(ctxFor(p, { slot, seed, opts: { time: "any", mode, mood: "any", surprise: seed === "b" } }));
      for (const c of [r.pick, ...r.backups].filter(Boolean)) {
        const m = c.meal;
        assert.equal(F.allergenHits(m, allergies).length, 0, `${m.id} vs ${allergies}`);
        const meats = F.mealStats(m).meats;
        if (p.diet.halal) assert.ok(!meats.includes("pork"), `${m.id} not halal`);
        if (p.diet.vegetarian) assert.equal(meats.length, 0, `${m.id} not vegetarian`);
        if (p.diet.noBeef) assert.ok(!m.recipe.some(x => x.id === "beef"), `${m.id} has beef`);
        assert.ok(F.fitsKitchen(m, kitchen), `${m.id} needs a stove`);
        assert.ok(m.slots.includes(slot), `${m.id} not a ${slot}`);
        if (mode === "buy") assert.equal(m.source, "buy");
        if (mode === "cook") assert.notEqual(m.source, "buy");
        checked++;
      }
    }
  assert.ok(checked > 2000, `checked ${checked}`);
});

test("every meal has an emoji, a time, allergens worked out from its recipe, and hidden ones on top", () => {
  F.MEALS.forEach(m => {
    assert.ok(m.emoji && Number.isFinite(m.min) && Number.isFinite(m.fill), m.id);
    assert.ok(Array.isArray(m.contains) && Array.isArray(m.may), m.id);
    m.contains.concat(m.may).forEach(a => assert.ok(F.ALLERGEN_IDS.includes(a), `${m.id}: ${a}`));
    assert.equal(m.may.filter(a => m.contains.includes(a)).length, 0, `${m.id}: may repeats contains`);
  });
  assert.deepEqual(F.mealById("nasilemak").contains.sort(), ["crustacean", "egg", "fish", "peanut"]);   // sambal belacan
  assert.ok(F.mealById("satay").may.includes("soy") && F.mealById("satay").contains.includes("peanut"));
  assert.ok(F.mealById("chickenrice").contains.includes("soy") && F.mealById("chickenrice").contains.includes("gluten"));
});

test("the pick never costs more than what's left this week, and says so in words when nothing fits", () => {
  const p = prof({});
  for (const left of [0, 1, 2.5, 4, 8]) {
    const r = M.pick(ctxFor(p, { weekLeft: left, opts: { time: "any", mode: "buy", mood: "any" } }));
    if (r.pick) [r.pick, ...r.backups].forEach(c => assert.ok(c.cost.toBuy <= left + 1e-9, `${c.meal.id} ${c.cost.toBuy} > ${left}`));
    else { assert.equal(r.why.key, "money"); assert.match(r.why.text, /left this week|price/); }
  }
  // With rice and eggs at home, a near-empty week still finds a home meal
  const r = M.pick(ctxFor(p, { weekLeft: 1, have: { rice: true, eggs: true, veg: true }, opts: { time: "any", mode: "cook", mood: "any" } }));
  assert.ok(r.pick, "a meal from what's at home");
  assert.ok(r.pick.cost.toBuy <= 1);
});

test("what's at home lowers the cost to buy and shows up as a reason", () => {
  const p = prof({});
  const egg = F.mealById("omeletterice");
  const without = M.mealCost(egg, {}), withHave = M.mealCost(egg, { rice: true, eggs: true });
  assert.ok(withHave.toBuy < without.toBuy);
  assert.equal(withHave.total, without.total, "the full cost stays honest");
  assert.deepEqual(withHave.haveIds.sort(), ["eggs", "rice"]);
  const r = M.pick(ctxFor(p, { have: { rice: true, eggs: true, veg: true }, opts: { time: "any", mode: "cook", mood: "any" } }));
  assert.ok(r.pick.reasons.some(x => x.k === "have"), "uses what you have");
});

test("variety: what you ate today is not picked again, and yesterday's meal is less likely", () => {
  const p = prof({});
  const first = M.pick(ctxFor(p));
  const again = M.pick(ctxFor(p, { today: { fv: 0, salty: 0, sugary: 0, ids: [first.pick.meal.id] } }));
  assert.notEqual(again.pick.meal.id, first.pick.meal.id);
  const notNow = M.pick(ctxFor(p, { prefs: { notNow: [first.pick.meal.id] } }));
  assert.ok(![notNow.pick, ...notNow.backups].some(c => c.meal.id === first.pick.meal.id), "\"not now\" removes it");
  const never = M.pick(ctxFor(p, { prefs: { never: [first.pick.meal.id] } }));
  assert.notEqual(never.pick.meal.id, first.pick.meal.id);
});

test("time, mood, and the backups being different enough", () => {
  const p = prof({});
  const r5 = M.pick(ctxFor(p, { opts: { time: "5", mode: "any", mood: "any" } }));
  [r5.pick, ...r5.backups].forEach(c => assert.ok(c.meal.min <= 5, c.meal.id));
  const light = M.pick(ctxFor(p, { opts: { time: "any", mode: "any", mood: "light" } }));
  assert.ok(light.pick.meal.fill <= 2);
  const r = M.pick(ctxFor(p));
  assert.equal(r.backups.length, 2);
  assert.equal(new Set([r.pick, ...r.backups].map(c => c.meal.id)).size, 3);
});

test("the same day gives the same pick; Surprise me changes it", () => {
  const p = prof({});
  assert.equal(M.pick(ctxFor(p, { seed: "x" })).pick.meal.id, M.pick(ctxFor(p, { seed: "x" })).pick.meal.id);
  const ids = new Set();
  for (let i = 0; i < 12; i++) ids.add(M.pick(ctxFor(p, { seed: "s" + i, opts: { time: "any", mode: "any", mood: "any", surprise: true } })).pick.meal.id);
  assert.ok(ids.size >= 3, `surprise gave ${ids.size} different meals`);
});

test("fruit and veg still missing today pushes the pick towards vegetables", () => {
  const p = prof({ goal: "health" });
  const hungry = M.pick(ctxFor(p, { today: { fv: 0, salty: 0, sugary: 0, ids: [] } }));
  assert.ok(hungry.pick.stats.fv >= 100, `${hungry.pick.meal.id} has ${hungry.pick.stats.fv} g`);
});

test("meal budget: a day's share of the weekly budget, not the whole week on a Sunday", () => {
  assert.equal(M.mealBudgetFor(140, "L", true), 7);        // 140 / 7 × 0.35
  assert.equal(M.mealBudgetFor(140, "B", true), 4);
  assert.ok(M.mealBudgetFor(140, "L", false) > 7, "no breakfast: more for lunch");
  assert.ok(M.mealBudgetFor(140, "L", true) < 20);
});

test("the eaten log: one entry per meal of a day, junk ignored, the week starts on Monday", () => {
  let log = M.validateAte([{ date: "2026-10-19", slot: "L", mealId: "chickenrice", rm: 9 }, { date: "bad", slot: "L" }, { date: "2026-10-19", slot: "Z" }, null, { date: "2026-10-20", slot: "D", label: "x".repeat(200), rm: -3 }]);
  assert.equal(log.length, 2);
  assert.equal(log[1].label.length, 80);
  assert.equal(log[1].rm, 0);
  log = M.logAte(log, { date: "2026-10-19", slot: "L", mealId: "thosai", rm: 4, label: "Thosai" });
  assert.equal(log.filter(e => e.date === "2026-10-19" && e.slot === "L").length, 1);
  assert.equal(M.weekStartKey(new Date(2026, 9, 25)), "2026-10-19");   // Sunday → that week's Monday
  assert.equal(M.weekStartKey(new Date(2026, 9, 19)), "2026-10-19");
  assert.equal(M.daysLeftInWeek(new Date(2026, 9, 19)), 7);
  assert.equal(M.daysLeftInWeek(new Date(2026, 9, 25)), 1);
  const ws = M.weekState({ budget: 100 }, log.concat([{ date: "2026-10-12", slot: "L", rm: 50 }]), new Date(2026, 9, 20, 12));
  assert.equal(ws.spent, 4, "last week's spending doesn't count");
  assert.equal(ws.recent.thosai, 1, "eaten yesterday");
});

test("eating with friends: everyone's allergies and rules together, the lowest price limit", () => {
  const people = [{ allergies: ["peanut"], halal: true }, { allergies: ["crustacean"], vegetarian: true, maxRm: 7 }, { allergies: [], noBeef: true, maxRm: 12 }];
  const r = M.groupPick(people, "D", { seed: "g" });
  assert.deepEqual(r.diet.allergies.sort(), ["crustacean", "peanut"]);
  assert.equal(r.maxRm, 7);
  for (const c of [r.pick, ...r.backups].filter(Boolean)) {
    assert.equal(c.meal.source, "buy");
    assert.equal(F.allergenHits(c.meal, ["peanut", "crustacean"]).length, 0);
    assert.equal(F.mealStats(c.meal).meats.length, 0);
    assert.ok(c.cost.toBuy <= 7);
  }
});

test("Which has more? answers match the sourced data; older MyFCD fibre is never compared with USDA", () => {
  for (const seed of ["1", "2", "3", "4", "5"]) {
    const qs = M.quizQuestions(SWAPDATA, seed, 5);
    assert.equal(qs.length, 5);
    assert.equal(new Set(qs.map(q => q.options.map(o => o.id).sort().join())).size, 5, "no pair twice");
    qs.forEach(q => {
      const k = q.id.split("-").pop();
      const [a, b] = q.options.map(o => SWAPDATA.foods.find(f => f.id === o.id));
      const winner = a.per100g[k] > b.per100g[k] ? a.id : b.id;
      assert.equal(q.answer, winner, q.id);
      if (k === "fibre") assert.ok(![a, b].some(f => /MyFCD/i.test(f.nutrientSource.name)), q.id);
      assert.ok(q.sources.length === 2 && q.sources.every(s => /^https:\/\//.test(s.url)), q.id);
    });
  }
});

test("Plate check: suku-suku separuh", () => {
  assert.equal(M.plateCheck({ carb: 1, protein: 1, veg: 2, fruit: 0 }).ok, true);
  assert.equal(M.plateCheck({ carb: 1, protein: 1, veg: 1, fruit: 1 }).ok, true);
  const rice = M.plateCheck({ carb: 3, protein: 1, veg: 0, fruit: 0 });
  assert.equal(rice.ok, false);
  assert.ok(rice.notes.some(n => /half/.test(n)));
  assert.equal(M.plateCheck({ carb: 0, protein: 0, veg: 0, fruit: 0 }).empty, true);
});

test("knowledge data: built from its sources, every item has an evidence level and an https link", () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, "../tools/build-knowledge.js"), "--check"], { stdio: "pipe" });
  void out; // exits 1 (and throws) when js/knowledge.js is out of date: run `npm run data`
  const levels = Object.keys(KNOWLEDGE.levels);
  const items = [];
  KNOWLEDGE.goals.forEach(g => { items.push(g); g.foods.forEach(f => items.push(f)); (g.cautions || []).forEach(c => items.push(c)); });
  ["swaps", "pairings", "cooking", "heroes"].forEach(k => KNOWLEDGE[k].forEach(x => items.push(x)));
  assert.ok(items.length > 100, `${items.length} items`);
  items.forEach(x => {
    assert.ok(x.evidence && levels.includes(x.evidence.level), JSON.stringify(x).slice(0, 80));
    assert.match(x.evidence.url, /^https:\/\//);
    assert.ok(x.evidence.source.length > 5);
    assert.doesNotMatch(x.evidence.source, /\.json/, "no file names in user-facing sources");
  });
  assert.doesNotMatch(JSON.stringify(KNOWLEDGE) + JSON.stringify(SWAPDATA), /getfoodfacts\.com\/food/, "USDA links go to FoodData Central itself");
  // The claim the owner asked about, kept honest: kale has more fibre than watercress per 100 g
  const kale = SWAPDATA.foods.find(f => f.id === "kale"), wc = SWAPDATA.foods.find(f => f.id === "watercress");
  assert.ok(kale.per100g.fibre > wc.per100g.fibre);
  assert.ok(wc.rmPerKg < kale.rmPerKg);
  // Myth verdicts are labelled myths
  KNOWLEDGE.pairings.filter(p => p.verdict === "myth").forEach(p => assert.equal(p.evidence.level, "myth", p.a));
});

test("pick-only meals never go into a weekly plan, and plans with allergies keep to them", () => {
  for (const allergies of [[], ["peanut", "crustacean"], ["gluten"], ["egg", "milk"]]) {
    for (const kitchen of ["hostel", "shared"]) {
      const p = prof({ kitchen, diet: { halal: true, allergies } });
      const r = P.planWeek(p, {});
      r.plan.forEach(day => Object.values(day).filter(Boolean).forEach(id => {
        const m = F.mealById(id);
        assert.ok(!m.pickOnly, `${id} is pick-only`);
        assert.equal(F.allergenHits(m, allergies).length, 0, `${id} vs ${allergies}`);
      }));
      assert.ok(P.baselineBuyAll(p), "the buy-everything baseline still works");
    }
  }
});

test("profile keeps only known allergens and the no-beef rule", () => {
  const p = S.validateProfile({ budget: 100, kitchen: "hostel", goal: "money", diet: { halal: true, noBeef: 1, allergies: ["peanut", "peanut", "kryptonite", 3] } });
  assert.deepEqual(p.diet.allergies, ["peanut"]);
  assert.equal(p.diet.noBeef, true);
  assert.deepEqual(S.validateProfile({ budget: 100, kitchen: "hostel", goal: "money" }).diet.allergies, []);
});

test("the practice week finishes for every allergy profile and never serves or sells an allergen", () => {
  const W = require("../js/week.js"); Object.assign(global, W);
  const Sim = require("../js/sim.js");
  const sets = [[]].concat(F.ALLERGEN_IDS.map(a => [a]), [["gluten", "egg"], ["soy", "gluten"], ["peanut", "crustacean"], F.ALLERGEN_IDS]);
  let runs = 0;
  for (const al of sets) for (const kitchen of ["hostel", "shared"]) for (const vegetarian of [false, true]) for (const strat of [0, 1, 2]) {
    const p = S.validateProfile({ budget: 120, kitchen, goal: "money", diet: { halal: true, vegetarian, allergies: al }, breakfast: true });
    const st = Sim.newSim(p); Sim.advance(st);
    let n = 0;
    while (!st.done && n++ < 80) {
      const opts = Sim.visibleOptions(st, Sim.currentScene(st)).filter(o => o.available);
      assert.ok(opts.length, `${al} ${kitchen}: a decision with no options`);
      Sim.choose(st, (strat === 0 ? opts[0] : strat === 1 ? opts[opts.length - 1] : opts[n % opts.length]).id);
    }
    assert.ok(st.done, `${al} ${kitchen} veg=${vegetarian}: the week never ends`);
    st.lines.forEach(l => {
      const m = l.mealId && F.mealById(l.mealId);
      if (m) assert.equal(F.allergenHits(m, al).length, 0, `${al}: ate ${m.id}`);
      (l.basket || []).forEach(id => assert.ok(!(F.ING_ALLERGENS[id] || []).some(a => al.includes(a)), `${al}: bought ${id}`));
    });
    runs++;
  }
  assert.ok(runs > 150);
});

test("an old saved \"shellfish\" allergy becomes both prawn/crab and squid/cockles", () => {
  const p = S.validateProfile({ budget: 100, kitchen: "hostel", goal: "money", diet: { allergies: ["shellfish"] } });
  assert.deepEqual(p.diet.allergies.sort(), ["crustacean", "mollusc"]);
});
