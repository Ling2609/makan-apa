// =============================================================
// makan.js — "Pick for me": one meal, with reasons, from everything that fits you right now.
// Pure logic (no DOM); unit tested in tests/makan.test.js.
//
// Why one pick and not a list: choice overload is strongest when people are unsure what they want
// and want to save effort (Chernev, Böckenholt & Goodman 2015, meta-analysis of 99 observations).
// So the screen shows one pick, the reasons for it, and at most two backups.
// =============================================================
/* global MEALS, mealById, mealStats, fitsDiet, fitsKitchen, healthyPlate, ingredientCost, packPrice, PACKS, round2,
   allergenHits, allergenName, FV_TARGET_G, ingredientById */
const MK_F = (typeof mealById === "function")
  ? { MEALS, mealById, mealStats, fitsDiet, fitsKitchen, healthyPlate, ingredientCost, packPrice, PACKS, round2, allergenHits, allergenName, FV_TARGET_G, ingredientById }
  : require("./foods.js");

const MK_SLOTS = ["B", "L", "D", "S"];
const MK_SLOT_NAME = { B: "Breakfast", L: "Lunch", D: "Dinner", S: "Snack or supper" };
// Share of a day's food money each meal usually takes (a planning guide, not a rule)
const MK_SHARE = { B: 0.2, L: 0.35, D: 0.35, S: 0.1 };
const TIME_LIMITS = { 5: 5, 15: 15, 30: 30, any: 999 };
// Things people keep at home that cooked and kettle meals use (ingredient ids)
const HOME_ITEMS = ["rice", "eggs", "noodles", "ricenoodle", "bread", "oats", "tofu", "beans", "chicken", "fish", "tuna", "sardines", "greens", "veg", "rootveg", "tomato", "potato", "sweetpotato", "banana", "apple", "citrus", "milk", "soymilk", "peanuts"];
const BASIC_IDS = ["oil", "sugar", "water"]; // assumed in every kitchen, never "to buy" for one meal
// Iron-rich ingredients (for the tea tip). Haem: meat and fish; non-haem: beans, tofu, greens.
const IRON_HAEM = ["beef", "lamb", "chicken", "fish", "tuna", "sardines", "prawns", "pork"];
const IRON_PLANT = ["beans", "tofu", "greens"];
const VITC_IDS = ["tomato", "citrus", "greens", "veg"];

function mkSlotForHour(h) {
  if (h >= 5 && h < 11) return "B";
  if (h >= 11 && h < 16) return "L";
  if (h >= 16 && h < 22) return "D";
  return "S";
}

// Small deterministic random numbers, so the same day gives the same pick until you ask for another
function mkRandom(seed) {
  let x = 2166136261 >>> 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return (x % 100000) / 100000; };
}

// Cost of a meal right now. Home meals: only what you'd still have to buy counts as "to buy";
// the full ingredient cost is still shown so the week's money stays honest.
function mealCost(meal, have) {
  const st = MK_F.mealStats(meal);
  if (meal.source === "buy") return { total: st.rm, toBuy: st.rm, haveIds: [], needIds: [] };
  const parts = (meal.recipe || []).filter(p => !BASIC_IDS.includes(p.id));
  const haveIds = parts.filter(p => have && have[p.id]).map(p => p.id);
  const needIds = parts.filter(p => !(have && have[p.id])).map(p => p.id);
  const toBuy = MK_F.ingredientCost((meal.recipe || []).filter(p => needIds.includes(p.id)));
  return { total: st.rm, toBuy: MK_F.round2(toBuy), haveIds, needIds };
}

const ING_SHORT = { rice: "rice", eggs: "eggs", noodles: "noodles", bread: "bread", oats: "oats", tofu: "tofu or tempeh", greens: "greens", veg: "vegetables",
  chicken: "chicken", fish: "fish", tuna: "canned tuna", sardines: "canned sardines", beans: "dhal", banana: "bananas", tomato: "tomatoes", sweetpotato: "sweet potato",
  ricenoodle: "kway teow or bihun", rootveg: "carrots", potato: "potatoes", milk: "milk", soymilk: "soy milk", apple: "apples", citrus: "oranges", peanuts: "peanuts", beef: "beef", prawns: "prawns" };
const ingShort = id => ING_SHORT[id] || ((MK_F.ingredientById(id) || { name: id }).name.toLowerCase());

function mainProtein(meal) {
  const p = (meal.recipe || []).find(x => ["beef", "lamb", "prawns", "fish", "tuna", "sardines", "pork", "chicken", "eggs", "tofu", "beans", "peanuts", "cheese"].includes(x.id));
  return p ? p.id : "none";
}

// The whole context for one decision.
//   profile: validated profile (diet incl. allergies, kitchen, budget, goal, rahmah)
//   slot: B | L | D | S
//   today: { fv, salty, sugary, ids: [meal ids eaten today] }
//   recent: { mealId: daysAgo } for the last few days
//   weekLeft: RM left this week; daysLeft: days left including today (1–7)
//   have: { ingredientId: true } things at home
//   prefs: { never: [ids], notNow: [ids] }
//   opts: { time: 5|15|30|"any", mode: "any"|"buy"|"cook", mood: "any"|"light"|"filling", maxRm, seed, haveOnly }
function mkCandidates(ctx) {
  const { profile, slot } = ctx;
  const opts = ctx.opts || {};
  const prefs = ctx.prefs || {};
  const reasons = { slot: 0, kitchen: 0, diet: 0, time: 0, mode: 0, money: 0, mine: 0, ingredients: 0 };
  const limit = TIME_LIMITS[opts.time] || 999;
  const out = [];
  MK_F.MEALS.forEach(m => {
    if (m.id === "skip" || m.occasion || m.slots.includes("X")) return;
    if (!m.slots.includes(slot)) { reasons.slot++; return; }
    if (m.snack && slot !== "S" && slot !== "B") { reasons.slot++; return; }
    if (m.rahmah && !profile.rahmah) return;
    if (!MK_F.fitsKitchen(m, profile.kitchen)) { reasons.kitchen++; return; }
    if (!MK_F.fitsDiet(m, profile.diet)) { reasons.diet++; return; }
    if ((prefs.never || []).includes(m.id) || (prefs.notNow || []).includes(m.id)) { reasons.mine++; return; }
    if (m.min > limit) { reasons.time++; return; }
    if (opts.mode === "buy" && m.source !== "buy") { reasons.mode++; return; }
    if (opts.mode === "cook" && m.source === "buy") { reasons.mode++; return; }
    if (opts.venues && !opts.venues.includes(m.venue)) { reasons.mode++; return; }
    const cost = mealCost(m, ctx.have);
    if (opts.haveOnly && m.source !== "buy" && cost.needIds.length) { reasons.ingredients++; return; }
    if (opts.maxRm !== undefined && cost.toBuy > opts.maxRm) { reasons.money++; return; }
    if (ctx.weekLeft !== undefined && cost.toBuy > Math.max(0, ctx.weekLeft) + 0.001) { reasons.money++; return; }
    out.push({ meal: m, cost });
  });
  return { list: out, reasons };
}

function scoreOne(c, ctx, rand) {
  const m = c.meal, st = MK_F.mealStats(m);
  const opts = ctx.opts || {};
  const today = ctx.today || { fv: 0, salty: 0, sugary: 0, ids: [] };
  const goal = ctx.profile.goal || "money";
  const w = { money: goal === "money" ? 1.5 : 1, health: goal === "health" ? 1.5 : 1, planet: goal === "planet" ? 2 : 1 };
  const parts = [];
  const add = (key, v, text) => { parts.push({ key, v, text }); };

  // Money: compare with this meal's share of what's left per day
  const mealBudget = ctx.mealBudget;
  if (mealBudget !== undefined && mealBudget > 0) {
    const r = c.cost.toBuy / mealBudget;
    add("money", w.money * (r <= 1 ? 1.5 + (1 - r) : 1.5 - 3 * (r - 1)), r <= 1 ? "fits" : "over");
  }
  // Fruit & veg still missing today (WHO: 400 g a day)
  const need = Math.max(0, MK_F.FV_TARGET_G - (today.fv || 0));
  if (st.fv > 0) add("fv", w.health * Math.min(st.fv, need) / 120, "fv");
  if (MK_F.healthyPlate(m)) add("plate", w.health * 0.8, "plate");
  if (st.salty) add("salty", -(today.salty ? 1.5 : 0.5), "salty");
  if (st.sugary) add("sugary", -(today.sugary ? 1.5 : 0.7), "sugary");
  // Variety: the same thing again today or yesterday is the main reason people stop trusting a picker
  const ago = (ctx.recent || {})[m.id];
  if ((today.ids || []).includes(m.id)) add("repeat", -4, "today");
  else if (ago === 1) add("repeat", -2, "yesterday");
  else if (ago === 2) add("repeat", -1, "recent");
  // Uses what's at home
  if (c.cost.haveIds.length) add("have", Math.min(1.8, 0.6 * c.cost.haveIds.length), "have");
  // Mood
  if (opts.mood === "light") add("mood", m.fill <= 1 ? 1 : m.fill >= 3 ? -1.2 : 0, "mood");
  if (opts.mood === "filling") add("mood", m.fill >= 3 ? 1 : m.fill <= 1 ? -1.2 : 0, "mood");
  // Quicker is better when you're hungry now
  add("time", -0.015 * m.min, "time");
  // Footprint: a small nudge, never the headline
  add("co2", -0.35 * w.planet * st.co2, "co2");
  // A little chance, so the pick changes day to day; "Surprise me" turns it up
  add("luck", (rand() - 0.5) * (opts.surprise ? 3 : 0.6), "luck");
  const score = parts.reduce((a, p) => a + p.v, 0);
  return { score, parts, stats: st };
}

// Plain reasons for the pick, strongest first (at most four)
function reasonsFor(c, s, ctx) {
  const m = c.meal, st = s.stats;
  const out = [];
  const today = ctx.today || { fv: 0 };
  if (ctx.mealBudget !== undefined) {
    if (c.cost.toBuy <= ctx.mealBudget) out.push({ k: "money", text: `Fits the RM ${ctx.mealBudget.toFixed(2)} you have for this meal` });
    else out.push({ k: "money", warn: true, text: `Over the RM ${ctx.mealBudget.toFixed(2)} you have for this meal: nothing cheaper fits as well` });
  }
  if (ctx.profile.diet && ctx.profile.diet.allergies && ctx.profile.diet.allergies.length) {
    out.push({ k: "allergy", text: `No ${ctx.profile.diet.allergies.map(MK_F.allergenName).map(n => n.toLowerCase()).join(", ")} in the usual recipe` });
  }
  const need = Math.max(0, MK_F.FV_TARGET_G - (today.fv || 0));
  if (st.fv >= 80 && need > 0) out.push({ k: "fv", text: `${Math.round(st.fv)} g of fruit and veg (${Math.round(today.fv || 0)} of ${MK_F.FV_TARGET_G} g so far today)` });
  if (c.cost.haveIds.length) out.push({ k: "have", text: `Uses what you have: ${c.cost.haveIds.map(ingShort).join(", ")}` });
  if (MK_F.healthyPlate(m)) out.push({ k: "plate", text: "Healthy Plate: half veg, a quarter carbs, a quarter protein" });
  if (st.co2 <= 0.5) out.push({ k: "co2", text: `Low footprint: ${st.co2.toFixed(2)} kg CO₂e` });
  return out.slice(0, 5);
}

// Tips that fit this meal (evidence-backed; the texts and sources live in knowledge.js)
function tipsFor(meal) {
  const ids = (meal.recipe || []).map(p => p.id);
  const tips = [];
  const ironHaem = ids.some(id => IRON_HAEM.includes(id));
  const ironPlant = ids.some(id => IRON_PLANT.includes(id));
  if (ironHaem || ironPlant) tips.push("tea-iron");
  if (ironPlant && !ironHaem && !ids.some(id => VITC_IDS.includes(id))) tips.push("vitc-iron");
  if (ids.includes("rice") && meal.source === "cook" && meal.prep && meal.prep.keeps > 0) tips.push("rice-cool");
  if (ids.includes("greens") && meal.source === "cook") tips.push("greens-steam");
  if (ids.some(id => ["rootveg", "tomato", "sweetpotato"].includes(id)) && meal.source !== "buy") tips.push("fat-carotenoid");
  if (ids.includes("sardines") || (ids.includes("fish") && meal.id === "nasigorengkg")) tips.push("bones-calcium");
  return tips;
}

function pick(ctx) {
  const { list, reasons } = mkCandidates(ctx);
  const rand = mkRandom(ctx.seed || "seed");
  const scored = list.map(c => ({ ...c, s: scoreOne(c, ctx, rand) })).sort((a, b) => b.s.score - a.s.score);
  if (!scored.length) return { pick: null, backups: [], why: whyNone(reasons, ctx), count: 0 };
  const top = scored[0];
  // Backups: the best two that are different enough (another way to eat, or another main protein)
  const backups = [];
  for (const c of scored.slice(1)) {
    if (backups.length >= 2) break;
    const differs = [top, ...backups].every(b => b.meal.source !== c.meal.source || mainProtein(b.meal) !== mainProtein(c.meal));
    if (differs) backups.push(c);
  }
  for (const c of scored.slice(1)) { if (backups.length >= 2) break; if (!backups.includes(c)) backups.push(c); }
  const pack = c => ({ meal: c.meal, cost: c.cost, stats: c.s.stats, score: c.s.score, reasons: reasonsFor(c, c.s, ctx), tips: tipsFor(c.meal),
    allergens: { contains: c.meal.contains.slice(), may: c.meal.may.slice() } });
  return { pick: pack(top), backups: backups.map(pack), count: scored.length };
}

// When nothing fits, say which setting removed the most meals, in words, with the fix
function whyNone(r, ctx) {
  const opts = ctx.opts || {};
  if (r.money) return { key: "money", text: ctx.weekLeft !== undefined && ctx.weekLeft < 3 ? `Only RM ${Math.max(0, ctx.weekLeft).toFixed(2)} is left this week. A meal from what's at home is the way through: tick what you have.` : opts.maxRm !== undefined ? "Nothing cheaper is left that fits right now. Clear the price limit, or cook from what's at home." : "Nothing fits the money left. Cook from what's at home." };
  if (r.mine && !r.time && !r.mode) return { key: "mine", text: "You've ruled out everything left for now. Clear today's \"not now\" list." };
  if (r.time && opts.time !== "any") return { key: "time", text: "Nothing that fits you is that quick. Allow more time." };
  if (r.mode && (opts.mode !== "any" || opts.campus)) return { key: "mode", text: opts.mode === "cook" ? "Nothing you can make fits right now. Try buying." : opts.campus ? "Nothing left to buy on campus fits. Packed a lunch?" : "Nothing to buy fits right now. Try cooking." };
  if (r.ingredients) return { key: "ingredients", text: "Nothing can be made only from what you have. Tick more items, or allow buying." };
  if (r.mine) return { key: "mine", text: "You've ruled out everything left for now. Clear today's \"not now\" list." };
  if (r.diet) return { key: "diet", text: "Your food rules and allergies leave no meal for this time of day in our list. You can still log what you eat." };
  return { key: "other", text: "Nothing in our list fits this meal. You can still log what you eat." };
}

// ---------- the day so far ----------
// ate: [{ date, slot, mealId?, label, rm, fv?, salty?, sugary?, at }]
function validateAte(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(e => e && typeof e === "object" && typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && MK_SLOTS.includes(e.slot))
    .slice(-400)
    .map(e => {
      const meal = typeof e.mealId === "string" ? MK_F.mealById(e.mealId) : null;
      const rmv = Number(e.rm);
      const out = { date: e.date, slot: e.slot, rm: Number.isFinite(rmv) && rmv >= 0 && rmv <= 500 ? MK_F.round2(rmv) : 0, at: Number.isFinite(e.at) ? e.at : 0 };
      if (meal) out.mealId = meal.id;
      out.label = typeof e.label === "string" && e.label.trim() ? e.label.trim().slice(0, 80) : meal ? meal.name : "Something else";
      return out;
    });
}
// One entry per day and meal: logging lunch again replaces the earlier lunch
function logAte(list, entry) {
  const rest = list.filter(e => !(e.date === entry.date && e.slot === entry.slot));
  return rest.concat([entry]).slice(-400);
}
function dayTotals(entries) {
  const t = { fv: 0, salty: 0, sugary: 0, rm: 0, ids: [], co2: 0 };
  entries.forEach(e => {
    t.rm += e.rm || 0;
    const m = e.mealId && MK_F.mealById(e.mealId);
    if (!m) return;
    const st = MK_F.mealStats(m);
    t.fv += st.fv; t.co2 += st.co2;
    if (st.salty) t.salty++;
    if (st.sugary) t.sugary++;
    t.ids.push(m.id);
  });
  t.rm = MK_F.round2(t.rm);
  return t;
}
function keyOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
// Monday of the week a date is in
function weekStartKey(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return keyOf(x);
}
function daysLeftInWeek(d) { return 7 - ((d.getDay() + 6) % 7); } // Monday 7 … Sunday 1
function recentMap(ate, now) {
  const out = {};
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  ate.forEach(e => {
    if (!e.mealId) return;
    const [y, mo, d] = e.date.split("-").map(Number);
    const ago = Math.round((t0 - new Date(y, mo - 1, d)) / 86400000);
    if (ago >= 1 && ago <= 6 && (out[e.mealId] === undefined || ago < out[e.mealId])) out[e.mealId] = ago;
  });
  return out;
}
// Money and the day so far, from the "ate" log (used when no plan is running today)
function weekState(profile, ate, now) {
  const wk = weekStartKey(now);
  const todayK = keyOf(now);
  const thisWeek = ate.filter(e => e.date >= wk && e.date <= todayK);
  const spent = MK_F.round2(thisWeek.reduce((a, e) => a + (e.rm || 0), 0));
  const today = dayTotals(ate.filter(e => e.date === todayK));
  return { spent, weekLeft: MK_F.round2(profile.budget - spent), daysLeft: daysLeftInWeek(now), today, recent: recentMap(ate, now), weekStart: wk };
}
// What this meal can cost: a day's share of the weekly budget, times this meal's usual share of a day.
// (Not "what's left ÷ days left": on a first Sunday that would hand one lunch the whole week's money.)
// People who skip breakfast spread it over the other meals. The week's money left is a separate hard limit.
function mealBudgetFor(budget, slot, breakfast = true) {
  const perDay = Math.max(0, budget) / 7;
  const total = breakfast ? 1 : 1 - MK_SHARE.B;
  return MK_F.round2(perDay * MK_SHARE[slot] / total);
}

// ---------- eating with friends ----------
// people: [{ name, allergies: [], halal, vegetarian, noBeef, maxRm }]
function groupPick(people, slot, opts = {}) {
  const diet = { halal: people.some(p => p.halal !== false), vegetarian: people.some(p => p.vegetarian), noBeef: people.some(p => p.noBeef),
    allergies: [...new Set(people.flatMap(p => p.allergies || []))] };
  const maxRm = Math.min(...people.map(p => (Number.isFinite(p.maxRm) && p.maxRm > 0 ? p.maxRm : 999)));
  const profile = { kitchen: "hostel", diet, goal: "money", budget: 999, rahmah: !!opts.rahmah };
  const ctx = { profile, slot, opts: { mode: "buy", time: "any", maxRm: maxRm < 999 ? maxRm : undefined, venues: ["kopitiam", "mamak", "cafeteria", "stall", "fastfood", "cafe", "night"] }, seed: opts.seed || "group", mealBudget: maxRm < 999 ? maxRm : undefined, today: { fv: 0, ids: [] } };
  const res = pick(ctx);
  return { ...res, diet, maxRm: maxRm < 999 ? maxRm : null };
}

// ---------- learn: "Which has more?" questions from sourced nutrient data ----------
const QUIZ_NUTRIENTS = [
  { k: "vitC", name: "vitamin C", unit: "mg" }, { k: "calcium", name: "calcium", unit: "mg" }, { k: "iron", name: "iron", unit: "mg" },
  { k: "fibre", name: "fibre", unit: "g" }, { k: "protein", name: "protein", unit: "g" }, { k: "potassium", name: "potassium", unit: "mg" },
  { k: "vitA_RAE", name: "vitamin A", unit: "µg" }, { k: "folate", name: "folate", unit: "µg" }
];
// MyFCD (1997) fibre is an older method and not comparable with USDA's dietary fibre
const comparable = (a, b, k) => !(k === "fibre" && [a, b].some(f => /MyFCD/i.test((f.nutrientSource || {}).name || "")));
function quizQuestions(data, seed, n = 5) {
  const rand = mkRandom(seed);
  const foods = (data && data.foods) || [];
  const pool = [];
  for (let i = 0; i < foods.length; i++) for (let j = i + 1; j < foods.length; j++) {
    const a = foods[i], b = foods[j];
    QUIZ_NUTRIENTS.forEach(nu => {
      const va = a.per100g && a.per100g[nu.k], vb = b.per100g && b.per100g[nu.k];
      if (typeof va !== "number" || typeof vb !== "number" || !comparable(a, b, nu.k)) return;
      const hi = Math.max(va, vb), lo = Math.min(va, vb);
      if (lo <= 0 || hi / lo < 1.5) return; // close calls teach nothing
      // Most interesting: the cheaper or more local food wins
      const winner = va > vb ? a : b, loser = va > vb ? b : a;
      const surprise = (winner.rmPerKg || 99) < (loser.rmPerKg || 0) ? 2 : 0;
      pool.push({ a, b, nu, va, vb, winner: winner.id, weight: surprise + rand() });
    });
  }
  pool.sort((x, y) => y.weight - x.weight);
  const out = [];
  const usedPairs = new Set();
  for (const q of pool) {
    const key = [q.a.id, q.b.id].sort().join("|");
    if (usedPairs.has(key)) continue;
    usedPairs.add(key);
    const flip = rand() < 0.5;
    const [x, y] = flip ? [q.b, q.a] : [q.a, q.b];
    const vx = x.per100g[q.nu.k], vy = y.per100g[q.nu.k];
    const ratio = Math.max(vx, vy) / Math.min(vx, vy);
    out.push({
      id: `${x.id}-${y.id}-${q.nu.k}`,
      prompt: `Which has more ${q.nu.name} per 100 g?`,
      options: [{ id: x.id, name: x.name, zh: x.zh }, { id: y.id, name: y.name, zh: y.zh }],
      answer: q.winner,
      explain: `${x.name}: ${fmtNum(vx)} ${q.nu.unit}; ${y.name}: ${fmtNum(vy)} ${q.nu.unit} per 100 g (${ratio >= 2 ? Math.round(ratio) + "×" : Math.round((ratio - 1) * 100) + "% more"}).` +
        (x.rmPerKg && y.rmPerKg ? ` Price: about RM ${fmtNum(x.rmPerKg)} vs RM ${fmtNum(y.rmPerKg)} a kg.` : ""),
      sources: [x.nutrientSource, y.nutrientSource].filter(Boolean)
    });
    if (out.length >= n) break;
  }
  return out;
}
const fmtNum = v => (v >= 100 ? String(Math.round(v)) : v >= 10 ? (Math.round(v * 10) / 10).toString() : (Math.round(v * 100) / 100).toString());

// ---------- learn: Healthy Plate check (suku-suku separuh) ----------
// scoops: { carb, protein, veg, fruit } in equal-size scoops
function plateCheck(sc) {
  const c = Math.max(0, sc.carb | 0), p = Math.max(0, sc.protein | 0), v = Math.max(0, sc.veg | 0), f = Math.max(0, sc.fruit | 0);
  const total = c + p + v + f;
  if (!total) return { ok: false, empty: true, shares: { carb: 0, protein: 0, fv: 0 }, notes: ["Add something to the plate."] };
  const shares = { carb: c / total, protein: p / total, fv: (v + f) / total };
  const notes = [];
  if (shares.fv < 0.45) notes.push(`Fruit and vegetables are ${Math.round(shares.fv * 100)}% of the plate; aim for about half.`);
  if (shares.carb > 0.3) notes.push(`Rice, noodles or bread take ${Math.round(shares.carb * 100)}%; a quarter is enough.`);
  if (shares.carb < 0.15) notes.push("Add some rice, noodles, bread or sweet potato: about a quarter.");
  if (shares.protein < 0.15) notes.push("Add some fish, chicken, egg, tofu, tempeh or dhal: about a quarter.");
  if (shares.protein > 0.35) notes.push(`Protein is ${Math.round(shares.protein * 100)}%; a quarter is enough.`);
  if (v === 0 && f > 0) notes.push("Fruit counts, but vegetables should be part of the half too.");
  return { ok: notes.length === 0, shares, notes: notes.length ? notes : ["That's a Malaysian Healthy Plate: half fruit and veg, a quarter carbs, a quarter protein."] };
}

if (typeof module !== "undefined") {
  module.exports = { MK_SLOTS, MK_SLOT_NAME, HOME_ITEMS, mkSlotForHour, mkRandom, mealCost, mkCandidates, pick, whyNone, tipsFor, validateAte, logAte, dayTotals,
    weekStartKey, daysLeftInWeek, recentMap, weekState, mealBudgetFor, ingShort, groupPick, quizQuestions, plateCheck, keyOf };
}
