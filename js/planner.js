// =============================================================
// planner.js — "Plan my real week": a 7-day meal plan that fits the
// student's budget, kitchen and diet, optimised for their goal.
// Pure logic, deterministic (same input → same plan), unit tested.
//
// Money is counted the way it is really spent:
//   bought meals at their stall price + whole grocery packs for home meals
//   (you can't buy 75 g of rice), minus anything the student already has at home.
// Oil and sugar are treated as pantry staples you already have.
//
// Rules a plan always keeps:
//   - never over budget when a plan within budget exists;
//   - diet, kitchen and "meals I can really cook" limits;
//   - no meal more than three times a week (the meal plus two repeats);
//   - breakfast, lunch and dinner on the same day are three different meals;
//   - spare budget goes to fruit snacks on days short of 400 g of fruit and veg.
// =============================================================

/* global MEALS, PACKS, AISLES, mealById, mealStats, fitsDiet, fitsKitchen, round2, mealPrice, packPrice, healthyPlate */
const PL_F = (typeof mealById === "function")
  ? { MEALS, PACKS, AISLES, mealById, mealStats, fitsDiet, fitsKitchen, round2, mealPrice, packPrice, healthyPlate }
  : require("./foods.js");

const PLAN_SLOTS = ["B", "L", "D", "S"];
const MEAL_SLOTS = ["B", "L", "D"];
const PANTRY_IDS = ["oil", "sugar", "water"];
const MAX_USES = { B: 3, L: 3, D: 3, S: 7 };   // three uses = the meal plus two repeats
const MAX_COOKED_USES = 3;
const MONEY_FLOOR = 0.75; // the money goal stops chasing savings below 75% of the budget
// Packs that keep for weeks: leftovers of these carry into next week's plan
const KEEPS = ["rice", "oats", "noodles", "beans", "peanuts", "sugar", "oil"];
// Fresh food that should be eaten early in the week (higher = sooner)
const FRESHNESS = { fish: 4, greens: 4, chicken: 3, tofu: 3, tomato: 2, veg: 2, banana: 1, bread: 1 };

function cookLimit(profile) {
  if (profile.kitchen === "hostel") return 0;
  return Number.isInteger(profile.cooks) ? profile.cooks : 6;
}

function slotActive(profile, slot) {
  if (slot === "B") return profile.breakfast;
  return true;
}
// The snack slot may stay empty
function slotRequired(profile, slot) {
  return slot !== "S" && slotActive(profile, slot);
}

// A weekday campus lunch (day = weekday, 0 = Monday)
function campusDay(profile, day, slot) {
  return !!profile.campusLunch && slot === "L" && day < 5;
}
// A cooked meal works as a lunchbox when it keeps at least two days and isn't a soup
function lunchboxOk(m) {
  return !!(m.prep && m.prep.keeps >= 2);
}

// Ready to eat with nothing bought today: a bought meal, or a kettle meal whose groceries
// are all already at home (a plan started today has no shop before breakfast and lunch).
function readyBeforeShop(m, have) {
  if (m.source === "buy") return m.id !== "water";
  if (m.source !== "kettle") return false;
  return m.recipe.every(p => PANTRY_IDS.includes(p.id) || ((have || {})[p.id] || 0) >= p.g);
}

// Candidate meals for a slot on a given plan day (0 = the plan's first day).
// A plan started mid-week carries profile._wd0 (weekday of day 0, 0 = Monday) and
// profile._noCook0 (day-0 slots that come before today's shop), set by startToday().
function candidates(profile, planDay, slot) {
  const day = (planDay + (profile._wd0 || 0)) % 7;
  const beforeShop = planDay === 0 && (profile._noCook0 || []).includes(slot);
  return PL_F.MEALS.filter(m => {
    if (beforeShop && !readyBeforeShop(m, profile._have)) return false;
    if (slot === "S") return !!m.snack && PL_F.fitsDiet(m, profile.diet);
    if (m.snack || m.pickOnly || !m.slots.includes(slot) || m.occasion || m.id === "skip" || m.slots.includes("X")) return false;
    if (m.rahmah && !profile.rahmah) return false;
    if (!PL_F.fitsDiet(m, profile.diet) || !PL_F.fitsKitchen(m, profile.kitchen)) return false;
    // Weekday lunch on campus: bought, or a lunchbox cooked at home (not kettle food, and not
    // something that only keeps a day, like noodle soup)
    if (campusDay(profile, day, slot) && (m.source === "kettle" || (m.source === "cook" && !lunchboxOk(m)))) return false;
    return true;
  });
}

// ---------- have (already in the kitchen) ----------
// { packId: grams }. Anything unknown or negative is dropped.
function cleanHave(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  Object.keys(raw).forEach(id => {
    const g = Number(raw[id]);
    if (PL_F.PACKS[id] && Number.isFinite(g) && g > 0 && g <= 20000) out[id] = Math.round(g);
  });
  return out;
}

// ---------- evaluation ----------
function needFor(mealIds) {
  const need = {};
  mealIds.forEach(id => {
    const m = PL_F.mealById(id);
    if (!m || m.source === "buy") return;
    m.recipe.forEach(p => {
      if (PANTRY_IDS.includes(p.id)) return;
      need[p.id] = (need[p.id] || 0) + p.g;
    });
  });
  return need;
}

function shoppingFor(mealIds, have = {}) {
  const need = needFor(mealIds);
  const items = Object.keys(need).map(id => {
    const pack = PL_F.PACKS[id];
    const haveG = Math.min(have[id] || 0, need[id]);
    const toBuy = Math.max(0, need[id] - (have[id] || 0));
    const packs = toBuy > 0 ? Math.ceil(toBuy / pack.g - 1e-9) : 0;
    const price = PL_F.packPrice(id);
    const bought = packs * pack.g;
    const left = bought + (have[id] || 0) - need[id];
    return { id, name: pack.name, aisle: pack.aisle, packs, cost: PL_F.round2(packs * price), needG: Math.round(need[id]), haveG: Math.round(haveG),
      leftG: Math.round(Math.max(0, left)), leftRm: PL_F.round2(Math.max(0, Math.min(left, bought)) * price / pack.g), src: pack.src || null };
  });
  items.sort((a, b) => a.aisle - b.aisle || a.name.localeCompare(b.name));
  return items;
}

function planMealIds(plan) {
  const ids = [];
  plan.forEach(day => PLAN_SLOTS.forEach(s => { if (day[s]) ids.push(day[s]); }));
  return ids;
}

function evaluate(plan, have = {}) {
  const ids = planMealIds(plan);
  let buy = 0, co2 = 0, fv = 0, sugary = 0, salty = 0, plate = 0, mainMeals = 0;
  ids.forEach(id => {
    const m = PL_F.mealById(id);
    const st = PL_F.mealStats(m);
    if (m.source === "buy") buy += PL_F.mealPrice(m);
    co2 += st.co2; fv += st.fv;
    if (st.sugary) sugary++;
    if (st.salty) salty++;
    if (!m.snack) { mainMeals++; if (PL_F.healthyPlate(m)) plate++; }
  });
  const shopping = shoppingFor(ids, have);
  const grocery = shopping.reduce((s, i) => s + i.cost, 0);
  const leftover = shopping.reduce((s, i) => s + i.leftRm, 0);
  const fvDays = plan.map(day => PLAN_SLOTS.reduce((s, k) => s + (day[k] ? PL_F.mealStats(PL_F.mealById(day[k])).fv : 0), 0));
  const counts = {};
  ids.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  const repeats = Object.keys(counts).reduce((s, id) => s + Math.max(0, counts[id] - 1) * (PL_F.mealById(id).snack ? 0 : 1), 0);
  return {
    outlay: PL_F.round2(buy + grocery), buy: PL_F.round2(buy), grocery: PL_F.round2(grocery), leftover: PL_F.round2(leftover),
    co2: Math.round(co2 * 100) / 100, fv: Math.round(fv), fvPerDay: Math.round(fv / 7), fvDays, fvDaysMet: fvDays.filter(g => g >= 400).length,
    sugary, salty, repeats, plateMeals: plate, mainMeals,
    meals: ids.length, shopping
  };
}

// Lower is better. Every goal keeps a small pull towards the others, and towards variety.
function objective(ev, goal, budget) {
  const fvShortfall = ev.fvDays.reduce((s, g) => s + Math.max(0, 400 - g), 0); // grams short of WHO, summed over days
  const variety = 0.6 * ev.repeats;
  if (goal === "money") {
    // Saving money matters most, but a week that leaves a quarter of the budget unspent while
    // short of fruit and veg isn't one a student keeps: below 75% of the budget, every ringgit
    // saved counts for a fifth as much, so the search spends it on vegetables and variety.
    const floor = budget ? budget * MONEY_FLOOR : 0;
    const money = ev.outlay >= floor ? ev.outlay : floor - (floor - ev.outlay) * 0.2;
    return money + fvShortfall / 60 + 1.2 * ev.sugary + 1.5 * ev.salty + variety;
  }
  if (goal === "health") return fvShortfall / 25 + 3 * ev.sugary + 2 * ev.salty + 0.05 * ev.outlay + 0.2 * ev.co2 + variety;
  return ev.co2 * 5 + fvShortfall / 60 + 0.05 * ev.outlay + 0.5 * ev.salty + 0.5 * ev.sugary + variety; // planet
}

// ---------- constraints ----------
function usesOf(plan, id) {
  let n = 0;
  plan.forEach(day => PLAN_SLOTS.forEach(s => { if (day[s] === id) n++; }));
  return n;
}
function cookedCount(plan) {
  let n = 0;
  plan.forEach(day => MEAL_SLOTS.forEach(s => { const m = day[s] && PL_F.mealById(day[s]); if (m && m.source === "cook") n++; }));
  return n;
}
function useLimit(meal, slot) {
  let limit = meal.snack ? MAX_USES.S : slot === "B" ? MAX_USES.B : (meal.source === "cook" ? MAX_COOKED_USES : MAX_USES.L);
  if (meal.maxWeek) limit = Math.min(limit, meal.maxWeek);
  return limit;
}
function varietyOk(plan, profile) {
  if (profile && cookedCount(plan) > cookLimit(profile)) return false;
  const counts = {};
  for (let d = 0; d < plan.length; d++) {
    const day = plan[d];
    // one day's breakfast, lunch and dinner are three different meals
    if ((day.L && day.L === day.D) || (day.B && (day.B === day.L || day.B === day.D))) return false;
    for (const s of PLAN_SLOTS) {
      if (!day[s]) continue;
      counts[day[s]] = counts[day[s]] || { n: 0, slot: s };
      counts[day[s]].n++;
    }
  }
  return Object.keys(counts).every(id => counts[id].n <= useLimit(PL_F.mealById(id), counts[id].slot));
}

function clonePlan(plan) {
  return plan.map(d => ({ B: d.B || null, L: d.L || null, D: d.D || null, S: d.S || null }));
}

// Hill climbing over single-slot swaps (the snack slot may also be emptied).
function improve(profile, plan, score, accept, have) {
  let best = clonePlan(plan);
  let bestEv = evaluate(best, have);
  let bestScore = score(bestEv);
  for (let round = 0; round < 10; round++) {
    let improved = false;
    for (let d = 0; d < 7; d++) {
      for (const s of PLAN_SLOTS) {
        if (!slotActive(profile, s)) continue;
        const opts = candidates(profile, d, s).map(m => m.id);
        if (s === "S") opts.push(null);
        for (const id of opts) {
          if (id === best[d][s]) continue;
          const trial = clonePlan(best);
          trial[d][s] = id;
          if (!varietyOk(trial, profile)) continue;
          const ev = evaluate(trial, have);
          if (!accept(ev)) continue;
          const sc = score(ev);
          if (sc < bestScore - 1e-9) { best = trial; bestEv = ev; bestScore = sc; improved = true; }
        }
      }
    }
    if (!improved) break;
  }
  return { plan: best, ev: bestEv };
}

function emptyPlan() {
  return Array.from({ length: 7 }, () => ({ B: null, L: null, D: null, S: null }));
}

// Greedy start: cheapest meal per slot that keeps variety
function greedyCheapest(profile) {
  const plan = emptyPlan();
  for (let d = 0; d < 7; d++) {
    for (const s of MEAL_SLOTS) {
      if (!slotActive(profile, s)) continue;
      const list = candidates(profile, d, s).slice().sort((a, b) => PL_F.mealStats(a).rm - PL_F.mealStats(b).rm || a.id.localeCompare(b.id));
      for (const m of list) {
        plan[d][s] = m.id;
        if (varietyOk(plan, profile)) break;
        plan[d][s] = null;
      }
      if (!plan[d][s]) plan[d][s] = list[0] ? list[0].id : null;
    }
  }
  return plan;
}

// Greedy start by the goal (ignores the budget; the penalised search repairs it)
function greedyByGoal(profile, have) {
  const plan = emptyPlan();
  for (let d = 0; d < 7; d++) {
    for (const s of MEAL_SLOTS) {
      if (!slotActive(profile, s)) continue;
      const scored = candidates(profile, d, s).map(m => {
        const trial = emptyPlan();
        trial[0][s] = m.id;
        return { m, sc: objective(evaluate(trial, have), profile.goal) };
      }).sort((a, b) => a.sc - b.sc || a.m.id.localeCompare(b.m.id));
      for (const { m } of scored) {
        plan[d][s] = m.id;
        if (varietyOk(plan, profile)) break;
        plan[d][s] = null;
      }
      if (!plan[d][s] && scored[0]) plan[d][s] = scored[0].m.id;
    }
  }
  return plan;
}

// Spare budget → fruit. Adds the cheapest fruit snack to days short of 400 g, while the
// plan stays within budget (and never past 92% of it, so there is a little slack left).
function addFruit(profile, plan, have) {
  let cur = clonePlan(plan);
  const cap = profile.budget * 0.92;
  for (let pass = 0; pass < 7; pass++) {
    const ev = evaluate(cur, have);
    const short = ev.fvDays.map((g, d) => ({ d, g })).filter(x => x.g < 400 && !cur[x.d].S).sort((a, b) => a.g - b.g || a.d - b.d);
    if (!short.length) break;
    let bestTrial = null;
    for (const { d } of short) {
      for (const m of candidates(profile, d, "S")) {
        const trial = clonePlan(cur);
        trial[d].S = m.id;
        if (!varietyOk(trial, profile)) continue;
        const tev = evaluate(trial, have);
        if (tev.outlay > cap + 1e-9) continue;
        const cost = tev.outlay - ev.outlay;
        if (!bestTrial || cost < bestTrial.cost - 1e-9) bestTrial = { trial, cost };
      }
      if (bestTrial) break;
    }
    if (!bestTrial) break;
    cur = bestTrial.trial;
  }
  return cur;
}

// How perishable a meal's fresh ingredients are (0 = keeps for weeks)
function freshness(id) {
  const m = id && PL_F.mealById(id);
  if (!m || m.source !== "cook") return 0;
  return m.recipe.reduce((s, p) => Math.max(s, FRESHNESS[p.id] || 0), 0);
}
// Days fresh food waits in the fridge before it is cooked, weighted by how perishable it is.
// Position 0 is the first day after the shop.
function freshnessWait(plan) {
  let w = 0;
  plan.forEach((day, i) => ["L", "D"].forEach(s => { w += freshness(day[s]) * i; }));
  return w;
}

/**
 * Fresh food first. Moves meals within the lunch row and within the dinner row (so the week's
 * cost, footprint and shopping list don't change) until perishable cooked meals come as soon
 * after the shop as the rules allow. A cooked meal can trade places with a bought one.
 *   opts.weekday0  weekday of the plan's first day (0 = Monday), for the campus-lunch rule
 *   opts.noCookDay0  slots on day 0 that come before today's shop (a plan started today): bought meals only
 */
function orderForFreshness(plan, profile, opts = {}) {
  const pf = { ...profile };
  if (opts.weekday0 !== undefined) pf._wd0 = opts.weekday0;
  if (opts.noCookDay0) pf._noCook0 = opts.noCookDay0;
  if (opts.have) pf._have = opts.have;
  const fits = (id, i, s) => !id || candidates(pf, i, s).some(c => c.id === id);
  let cur = clonePlan(plan);
  // First make the plan legal where it isn't (a rotated plan can put a cooked meal before the shop)
  for (const s of ["B", "L", "D"]) {
    if (!slotActive(pf, s) || fits(cur[0][s], 0, s)) continue;
    for (let j = 1; j < 7; j++) {
      const t = clonePlan(cur); [t[0][s], t[j][s]] = [t[j][s], t[0][s]];
      if (fits(t[0][s], 0, s) && fits(t[j][s], j, s) && varietyOk(t, pf)) { cur = t; break; }
    }
    // No meal to trade with (oats every morning): use the cheapest one that fits and keeps the
    // variety rules (no second copy on day 1, no fourth use in the week)
    if (!fits(cur[0][s], 0, s)) {
      const list = candidates(pf, 0, s).slice().sort((a, b) => PL_F.mealStats(a).rm - PL_F.mealStats(b).rm || a.id.localeCompare(b.id));
      const pick = list.find(m => { const t = clonePlan(cur); t[0][s] = m.id; return varietyOk(t, pf); }) || list[0];
      if (pick) cur[0][s] = pick.id;
    }
  }
  const fvMet = p => evaluate(p).fvDaysMet;
  let best = freshnessWait(cur), bestFv = fvMet(cur);
  for (let round = 0; round < 6; round++) {
    let moved = false;
    for (const s of ["L", "D"]) {
      for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
        if (cur[i][s] === cur[j][s]) continue;
        const t = clonePlan(cur); [t[i][s], t[j][s]] = [t[j][s], t[i][s]];
        if (!fits(t[i][s], i, s) || !fits(t[j][s], j, s) || !varietyOk(t, pf)) continue;
        const w = freshnessWait(t);
        if (w < best - 1e-9) {
          const fv = fvMet(t);
          if (fv < bestFv) continue; // never trade away a fruit-and-veg day for freshness
          cur = t; best = w; bestFv = fv; moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return cur;
}

/**
 * Build a plan. Returns
 *   { feasible, plan: [{B,L,D,S} × 7], totals, minOutlay, baseline, fruitAdded }
 * feasible = false when even the cheapest plan costs more than the budget
 * (the cheapest plan is returned so the student sees what is possible).
 * have = { packId: grams } already in the kitchen (costs nothing).
 */
function planWeek(profile, have = {}) {
  have = cleanHave(have);
  const cheapest = improve(profile, greedyCheapest(profile), ev => ev.outlay + 0.01 * ev.repeats, () => true, have);
  const minOutlay = cheapest.ev.outlay;
  const baseline = baselineBuyAll(profile);
  if (minOutlay > profile.budget) {
    return { feasible: false, plan: cheapest.plan, totals: cheapest.ev, minOutlay, baseline, fruitAdded: 0 };
  }
  // Two searches: one that never leaves the budget, one that may pass through over-budget plans
  // (with a heavy penalty) to escape local optima. The best plan within budget wins.
  const goal = ev => objective(ev, profile.goal, profile.budget);
  const penalised = ev => goal(ev) + 1000 * Math.max(0, ev.outlay - profile.budget);
  const runs = [
    improve(profile, cheapest.plan, goal, ev => ev.outlay <= profile.budget, have),
    improve(profile, greedyByGoal(profile, have), penalised, () => true, have)
  ].filter(r => r.ev.outlay <= profile.budget);
  runs.sort((a, b) => goal(a.ev) - goal(b.ev));
  const best = runs[0];
  const before = best.ev.outlay;
  const withFruit = orderForFreshness(addFruit(profile, best.plan, have), profile);
  const ev = evaluate(withFruit, have);
  return { feasible: true, plan: withFruit, totals: ev, minOutlay, baseline, fruitAdded: PL_F.round2(ev.outlay - before) };
}

// The tight-week preset (RM 10 a day, Menu Rahmah on, money first) for this kitchen and diet.
// RM 70 isn't always possible (a hostel kettle, a vegetarian week): then the budget is raised to
// the cheapest week that is, and `raised` says so, so the app never offers a plan it can't keep.
function tightWeek(profile, tight) {
  const base = { ...profile, ...tight };
  const r = planWeek(base);
  if (r.feasible) return { profile: base, raised: false, minOutlay: r.minOutlay, result: r };
  const budget = Math.ceil(r.minOutlay);
  const raisedProfile = { ...base, budget };
  return { profile: raisedProfile, raised: true, minOutlay: r.minOutlay, result: planWeek(raisedProfile) };
}

// What the week costs if every meal is bought (a typical cafeteria/stall week)
function baselineBuyAll(profile) {
  const plan = emptyPlan();
  // Typical stall meals first; with allergies or food rules that rule them all out, the cheapest bought meal that fits
  const fallback = slot => PL_F.MEALS.filter(m => m.source === "buy" && !m.pickOnly && m.slots.includes(slot) && !m.occasion && m.id !== "skip" && !m.slots.includes("X") && PL_F.fitsDiet(m, profile.diet))
    .sort((a, b) => PL_F.mealPrice(a) - PL_F.mealPrice(b))[0];
  const pick = (ids, slot) => { const m = ids.map(id => PL_F.mealById(id)).find(x => x && PL_F.fitsDiet(x, profile.diet)) || fallback(slot); return m ? m.id : null; };
  for (let d = 0; d < 7; d++) {
    if (profile.breakfast) plan[d].B = pick(["nasilemak", "roticanai"], "B");
    plan[d].L = pick(["ecoriceegg", "ecoricetofu"], "L");
    plan[d].D = pick(["ecorice", "ecoricetofu", "chapati"], "D");
  }
  return evaluate(plan);
}

// Alternatives for one slot, with the change they make to the weekly totals
function swapOptions(profile, plan, day, slot, have = {}) {
  const current = evaluate(plan, have);
  const opts = candidates(profile, day, slot).map(m => m.id);
  if (slot === "S") opts.push(null);
  return opts
    .filter(id => id !== plan[day][slot])
    .map(id => {
      const trial = clonePlan(plan);
      trial[day][slot] = id;
      const ev = evaluate(trial, have);
      return {
        meal: id ? PL_F.mealById(id) : null, ok: varietyOk(trial, profile), withinBudget: ev.outlay <= profile.budget,
        dOutlay: PL_F.round2(ev.outlay - current.outlay), dCo2: Math.round((ev.co2 - current.co2) * 100) / 100, dFv: ev.fv - current.fv,
        score: objective(ev, profile.goal, profile.budget) - objective(current, profile.goal, profile.budget)
      };
    })
    .filter(o => o.ok)
    .sort((a, b) => a.score - b.score);
}

function applySwap(plan, day, slot, mealId) {
  const trial = clonePlan(plan);
  trial[day][slot] = mealId || null;
  return trial;
}

// Replace every use of one meal in a slot with another; returns null if that breaks a rule.
function applySwapAll(profile, plan, slot, fromId, toId) {
  const trial = clonePlan(plan);
  let n = 0;
  for (let d = 0; d < 7; d++) {
    if (trial[d][slot] === fromId && candidates(profile, d, slot).some(m => m.id === toId)) { trial[d][slot] = toId; n++; }
  }
  if (!n || !varietyOk(trial, profile)) return null;
  return trial;
}

// Sunday prep: which cooked meals to batch, how many portions, when, and how long it takes.
// A batch only covers the days it keeps for; later portions become a second, mid-week cook.
//   earliest: the first day a session can happen (-1 = the evening before day 1, after the shop;
//   0 for a plan started today, when the shop happens on day 1 itself).
function prepSessions(plan, earliest = -1) {
  const occ = {};
  for (let d = 0; d < 7; d++) {
    ["L", "D"].forEach(s => {
      const m = plan[d][s] && PL_F.mealById(plan[d][s]);
      if (m && m.source === "cook" && m.prep && m.prep.keeps > 0) (occ[m.id] = occ[m.id] || []).push(d);
    });
  }
  const sessions = [];
  Object.keys(occ).forEach(id => {
    const m = PL_F.mealById(id);
    const days = occ[id].sort((a, b) => a - b);
    let batch = [];
    const flush = () => {
      if (!batch.length) return;
      const cookOn = Math.max(earliest, batch[0] - 1);
      const frozen = cookOn >= 3 && m.recipe.some(p => ["chicken", "fish"].includes(p.id));
      sessions.push({ mealId: id, name: m.name, cookOn, portions: batch.length, days: batch.slice(), minutes: m.prep.min, keeps: m.prep.keeps, steps: m.steps || [], freeze: frozen });
      batch = [];
    };
    days.forEach(d => {
      // cooked the evening before the first day; good for `keeps` days
      if (batch.length && d - Math.max(earliest, batch[0] - 1) > m.prep.keeps) flush();
      batch.push(d);
    });
    flush();
  });
  sessions.sort((a, b) => a.cookOn - b.cookOn || a.name.localeCompare(b.name));
  return sessions;
}

// Plans are built Monday → Sunday. A plan started on another weekday is rotated so
// each day keeps its weekday (campus lunches stay on weekdays).
function weekdayIndex(date) {
  return (date.getDay() + 6) % 7; // Monday = 0
}
function rotatePlan(plan, startWeekday) {
  const w = ((startWeekday % 7) + 7) % 7;
  return clonePlan(plan.map((_, i) => plan[(w + i) % 7]));
}

/**
 * Start a plan today instead of next Monday. The plan is rotated so weekdays still line up,
 * breakfast and lunch on day 1 come before today's shop (bought meals, or kettle meals whose
 * groceries are already at home), and fresh food moves to the days right after the shop.
 * Starting today never turns a plan within budget into one over it:
 *   1. rotate and reorder (the week the student reviewed, same meals);
 *   2. if that costs more, repair it with single swaps under the start-today rules;
 *   3. if that still costs more, re-plan the week under the start-today rules.
 * Returns { plan, outlay, budget, changed, overBy } — overBy > 0 only when no week started
 * today fits the budget (then "Next Monday" is the honest choice).
 */
function startToday(plan, profile, wd, have = {}) {
  have = cleanHave(have);
  const pf = { ...profile, _wd0: ((wd % 7) + 7) % 7, _noCook0: ["B", "L"], _have: have };
  const budget = profile.budget;
  const before = evaluate(plan, have).outlay;
  const cap = Math.max(budget, before); // a plan already over budget may not get dearer either
  const legal = p => varietyOk(p, pf) && p.every((d, i) => PLAN_SLOTS.every(s => !d[s] || candidates(pf, i, s).some(c => c.id === d[s])))
    && MEAL_SLOTS.every(s => !slotRequired(pf, s) || p.every(d => d[s]));
  const done = (p, changed) => {
    const outlay = evaluate(p, have).outlay;
    return { plan: p, outlay, budget, changed, overBy: PL_F.round2(Math.max(0, outlay - budget)) };
  };
  const ordered = orderForFreshness(rotatePlan(plan, pf._wd0), pf);
  if (legal(ordered) && evaluate(ordered, have).outlay <= cap + 1e-9) return done(ordered, false);
  // 2. single swaps from the reviewed week, scored by the goal with a heavy price on going over
  const goal = ev => objective(ev, profile.goal, budget) + 1000 * Math.max(0, ev.outlay - cap);
  if (legal(ordered)) {
    const fixed = improve(pf, ordered, goal, () => true, have);
    if (legal(fixed.plan) && fixed.ev.outlay <= cap + 1e-9) return done(orderForFreshness(fixed.plan, pf), true);
  }
  // 3. a fresh plan under the start-today rules (cheapest possible if nothing fits)
  const r = planWeek(pf, have);
  const fresh = r.feasible ? r.plan : r.plan;
  if (!r.feasible || evaluate(fresh, have).outlay > cap + 1e-9) {
    // nothing started today fits: keep the cheapest legal week and say what it costs extra
    const cheap = legal(ordered) && evaluate(ordered, have).outlay < evaluate(fresh, have).outlay ? ordered : fresh;
    return done(cheap, cheap !== ordered);
  }
  return done(fresh, true);
}

// What should carry into next week: leftovers of long-keeping packs (grams).
// With the check-in log, home meals logged as skipped or replaced by something else
// left their dry ingredients in the cupboard too, so those carry over as well.
function carryOver(ev, plan, log) {
  const out = {};
  ev.shopping.forEach(i => { if (KEEPS.includes(i.id) && i.leftG > 0) out[i.id] = i.leftG; });
  if (plan && log && log.days) {
    const bought = {};
    ev.shopping.forEach(i => { bought[i.id] = i.packs * ((PL_F.PACKS[i.id] || {}).g || 0) + i.haveG; });
    plan.forEach((day, d) => PLAN_SLOTS.forEach(s => {
      const e = log.days[String(d)] && log.days[String(d)][s];
      const m = day[s] && PL_F.mealById(day[s]);
      if (!e || e.status === "planned" || !m || m.source === "buy") return;
      m.recipe.forEach(p => { if (KEEPS.includes(p.id) && !PANTRY_IDS.includes(p.id)) out[p.id] = (out[p.id] || 0) + p.g; });
    }));
    // never more than was actually there
    Object.keys(out).forEach(id => { if (bought[id] !== undefined) out[id] = Math.min(out[id], Math.round(bought[id])); out[id] = Math.round(out[id]); });
  }
  return out;
}

// Validate a stored plan; returns null if unusable
function validatePlan(saved, profile) {
  if (!saved || !Array.isArray(saved.plan) || saved.plan.length !== 7) return null;
  for (let d = 0; d < 7; d++) {
    const day = saved.plan[d];
    if (!day || typeof day !== "object") return null;
    for (const s of PLAN_SLOTS) {
      if (day[s] === null || day[s] === undefined) { if (slotRequired(profile, s)) return null; continue; }
      const m = PL_F.mealById(day[s]);
      if (!m || !m.slots.includes(s) || !PL_F.fitsDiet(m, profile.diet) || !PL_F.fitsKitchen(m, profile.kitchen)) return null;
      if (s === "S" && !m.snack) return null;
      if (m.rahmah && !profile.rahmah) return null;
    }
  }
  if (typeof saved.start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(saved.start)) return null;
  return { plan: clonePlan(saved.plan), start: saved.start };
}

if (typeof module !== "undefined") {
  module.exports = {
    PLAN_SLOTS, MEAL_SLOTS, MAX_USES, MAX_COOKED_USES, KEEPS, cookLimit, cookedCount, candidates, evaluate, objective, varietyOk, planWeek,
    baselineBuyAll, swapOptions, applySwap, applySwapAll, shoppingFor, validatePlan, slotActive, slotRequired, prepSessions, rotatePlan,
    weekdayIndex, carryOver, cleanHave, usesOf, addFruit, orderForFreshness, freshnessWait, campusDay, lunchboxOk, MONEY_FLOOR, tightWeek, startToday, readyBeforeShop
  };
}
