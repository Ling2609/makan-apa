// =============================================================
// sim.js — the week simulation engine (pure logic, no DOM; unit tested).
//
// State lives in one plain object so it can be saved after every decision
// and restored exactly (no re-rolling by reloading).
// =============================================================

/* global MEALS, PACKS, mealById, mealStats, fitsDiet, fitsKitchen, SCENES, BASKETS, PANTRY, buildSchedule, ingredientName, round2, mealPrice, packPrice, ING_ALLERGENS, ingredientById */
const SIM_F = (typeof mealById === "function")
  ? { MEALS, PACKS, mealById, mealStats, fitsDiet, fitsKitchen, round2, mealPrice, packPrice, ING_ALLERGENS, ingredientById }
  : require("./foods.js");
const SIM_W = (typeof SCENES !== "undefined")
  ? { SCENES, BASKETS, PANTRY, buildSchedule, ingredientName }
  : require("./week.js");

const SIM_VERSION = 3;

// Money that bites: you can't pay for what you can't afford. You may borrow from a
// housemate (RM 20 at a time, at most twice); the debt shows on the receipt and report.
const BORROW_STEP = 20;
const BORROW_MAX = 40;

// "Cook what's left" makes one generous plate, not a whole fridge (grams per group)
const USEUP_CAPS = { grain: 100, protein: 120, fv: 250 };
const GRAIN_IDS = ["rice", "noodles", "oats", "bread"];
const PROTEIN_IDS_SIM = ["chicken", "fish", "tofu", "eggs", "beans", "peanuts", "beef"];

// If a meal doesn't fit the player's diet, offer the closest local alternative
const DIET_ALT = {
  nasilemak: "roticanai", chickenrice: "ecoricetofu", ecorice: "ecoricetofu", yongtaufoo: "ecoricetofu",
  rendang: "chapati", burgermeal: "meegoreng", friedchicken: "meegoreng", pizzashare: "meegoreng",
  satay: "fruitpack", dimsum: "meegoreng", chickenstirfry: "tofukangkung", fishcurry: "dhalrice"
};

const PERISHABLE = ["greens", "veg", "banana", "tomato", "rootveg", "chicken", "tofu", "fish", "milk", "soymilk", "apple", "citrus", "eggs", "bread"];

function resolveMeal(mealId, profile) {
  let meal = SIM_F.mealById(mealId);
  if (meal && meal.rahmah && !profile.rahmah) return null;
  let guard = 0;
  while (meal && !SIM_F.fitsDiet(meal, profile.diet) && guard++ < 4) meal = SIM_F.mealById(DIET_ALT[meal.id]);
  return meal && SIM_F.fitsDiet(meal, profile.diet) ? meal : null;
}

function newSim(profile) {
  return {
    v: SIM_VERSION,
    profile,
    cursor: 0,
    inventory: {},
    flags: { lunchbox: 0, lunchboxMeal: null, shop: null, skippedLunch: false },
    borrowed: 0,
    debtDay: null,
    habits: {},
    lines: [],
    decisions: [],
    guesses: null,
    spent: 0,
    done: false,
    current: null
  };
}

// ---------- inventory ----------
function trackedParts(recipe) {
  return (recipe || []).filter(p => !SIM_W.PANTRY.includes(p.id));
}
function missingFor(state, recipe, times = 1) {
  return trackedParts(recipe).filter(p => (state.inventory[p.id] || 0) + 1e-9 < p.g * times).map(p => p.id);
}
function consume(state, recipe, times = 1) {
  trackedParts(recipe).forEach(p => {
    state.inventory[p.id] = Math.max(0, (state.inventory[p.id] || 0) - p.g * times);
  });
}
function inventoryValue(inv, onlyPerishable) {
  return Object.keys(inv).reduce((sum, id) => {
    if (onlyPerishable && !PERISHABLE.includes(id)) return sum;
    const pack = SIM_F.PACKS[id];
    return sum + (pack ? inv[id] * SIM_F.packPrice(id) / pack.g : 0);
  }, 0);
}
function packFits(id, profile) {
  const al = (profile.diet && profile.diet.allergies) || [];
  const hits = (SIM_F.ING_ALLERGENS && SIM_F.ING_ALLERGENS[id]) || [];
  if (hits.some(a => al.includes(a))) return false;
  const ing = SIM_F.ingredientById ? SIM_F.ingredientById(id) : null;
  if (ing && profile.diet && profile.diet.vegetarian && ing.meat) return false;
  if (ing && profile.diet && profile.diet.noBeef && id === "beef") return false;
  return true;
}
function basketCost(packIds) {
  return SIM_F.round2((packIds || []).reduce((s, id) => s + SIM_F.packPrice(id), 0));
}

// Money you can still spend this week (budget + anything borrowed − spent)
function moneyLeft(state) {
  return SIM_F.round2(state.profile.budget + (state.borrowed || 0) - state.spent);
}

// ---------- options ----------
function textOf(v, state) {
  return typeof v === "function" ? v(state) : v;
}

// Returns the options of a scene with their availability and preview stats
function sceneOptions(state, scene) {
  const raw = scene.options(state) || [];
  const seen = new Set();
  const out = [];
  raw.forEach(opt => {
    const o = { id: opt.id, label: opt.label || null, note: opt.note || null, social: opt.social || null, fee: opt.fee || 0, feeLabel: opt.feeLabel || "" };
    if (opt.basket !== undefined) {
      o.kind = "basket";
      // No packs the player is allergic to (or can't eat) go in the trolley
      o.basket = opt.basket ? SIM_W.BASKETS[opt.basket].filter(id => packFits(id, state.profile)) : null;
      o.cash = o.basket ? basketCost(o.basket) : 0;
      o.available = true;
    } else if (opt.prep) {
      const ids = Array.isArray(opt.prep) ? opt.prep : [opt.prep];
      const meal = ids.map(id => resolveMeal(id, state.profile)).find(m => m && missingFor(state, m.recipe, 1).length === 0) || null;
      o.kind = "prep";
      o.meal = meal;
      o.count = opt.count || 3;
      o.cash = 0;
      o.available = !!meal;
      if (meal) o.label = `Cook three boxes of ${meal.name.toLowerCase()}`;
      else o.reason = "Not enough groceries";
    } else if (opt.useUp) {
      o.kind = "useup";
      o.cash = 0;
      o.available = Object.keys(state.inventory).some(k => state.inventory[k] > 0);
      if (state.profile.kitchen === "hostel") o.label = "Finish what's left: no-cook plate from your shelf";
      if (!o.available) o.reason = "Nothing left";
    } else if (opt.meal) {
      if (opt.lunchbox) {
        if (!state.flags.lunchboxMeal && state.flags.lunchbox === 0) return; // never prepared: don't show
        const meal = SIM_F.mealById(state.flags.lunchboxMeal) || resolveMeal(opt.meal, state.profile);
        o.kind = "lunchbox";
        o.meal = meal;
        o.cash = 0;
        o.available = state.flags.lunchbox > 0;
        if (!o.available) o.reason = "No lunchboxes left";
      } else {
        const meal = resolveMeal(opt.meal, state.profile);
        if (!meal) return;
        if (!opt.fee && seen.has(meal.id)) return; // same meal twice (e.g. after a diet swap): keep one
        o.kind = "meal";
        o.meal = meal;
        if (!SIM_F.fitsKitchen(meal, state.profile.kitchen)) {
          o.available = false;
          o.reason = meal.source === "cook" ? "Needs a stove — your hostel has a kettle only" : "Not possible here";
        } else if (meal.source !== "buy") {
          const missing = missingFor(state, meal.recipe);
          o.available = missing.length === 0;
          if (!o.available) o.reason = Object.keys(state.inventory).length ? `Not in your kitchen: ${missing.slice(0, 2).map(SIM_W.ingredientName).join(", ")}` : "Nothing at home — you didn't shop";
        } else {
          o.available = true;
        }
        o.cash = meal.source === "buy" ? SIM_F.round2(SIM_F.mealPrice(meal) + o.fee) : 0;
      }
      if (o.meal) {
        o.stats = SIM_F.mealStats(o.meal);
        if (!o.label) o.label = o.meal.name;
        if (!o.fee) seen.add(o.meal.id);
      }
    }
    if (!o.kind) { o.kind = "none"; o.cash = 0; o.available = true; }
    out.push(o);
  });
  // Money that bites: lock what you can't pay for
  const left = moneyLeft(state);
  out.forEach(o => {
    if (o.available && o.cash > 0 && o.cash > left + 1e-9) {
      o.available = false;
      o.broke = true;
      o.reason = left > 0 ? `Only RM ${left.toFixed(2)} left: can't cover this` : "No money left this week";
    }
  });
  const broke = out.some(o => o.broke);
  if (broke && (state.borrowed || 0) < BORROW_MAX) {
    out.push({ id: "borrow", kind: "borrow", label: `Borrow RM ${BORROW_STEP} from a housemate`, note: { text: "You pay it back next week, so next week starts RM " + BORROW_STEP + " shorter.", src: null },
      cash: 0, fee: 0, feeLabel: "", available: true, social: null });
  }
  // There is always something you can do, even broke
  if (!out.some(o => o.available && o.kind !== "borrow")) {
    const skip = SIM_F.mealById("skip");
    out.push({ id: "skip-broke", kind: "meal", meal: skip, label: "Skip it: you're out of money", cash: 0, fee: 0, feeLabel: "", available: true,
      stats: SIM_F.mealStats(skip), note: { text: "Skipped meals are how a broke week usually ends. A cheap shelf of oats, bread and bananas is the safety net.", src: null } });
  }
  return out;
}

// Visible options: all available ones, plus at most two locked ones (they teach why)
function visibleOptions(state, scene) {
  const all = sceneOptions(state, scene);
  const locked = all.filter(o => !o.available).slice(0, 3);
  return all.filter(o => o.available || locked.includes(o));
}

// ---------- lines ----------
function pushLine(state, point, kind, label, cash, stats, extra = {}) {
  const line = {
    day: point.day, slot: point.slot, kind, label,
    cash: SIM_F.round2(cash || 0),
    co2: stats ? stats.co2 : 0, fv: stats ? stats.fv : 0,
    sugary: !!(stats && stats.sugary), salty: !!(stats && stats.salty),
    ...extra
  };
  state.lines.push(line);
  state.spent = SIM_F.round2(state.spent + line.cash);
  return line;
}

// The cheapest everyday bought meal for a slot that fits the player's diet and allergies (or skipping)
function safeBuy(p, slot) {
  const s = slot === "N" || slot === "X" ? "S" : slot;
  return SIM_F.MEALS.filter(m => m.source === "buy" && m.slots.includes(s) && !m.occasion && m.id !== "skip" && !m.slots.includes("X") && (!m.rahmah || p.rahmah) && SIM_F.fitsDiet(m, p.diet))
    .sort((a, b) => SIM_F.mealPrice(a) - SIM_F.mealPrice(b))[0] || SIM_F.mealById("skip");
}
function defaultMeal(state, slot) {
  const p = state.profile;
  if (slot === "B") return p.breakfast ? resolveMeal("nasilemak", p) || safeBuy(p, "B") : SIM_F.mealById("skip");
  if (slot === "L") return resolveMeal("ecoriceegg", p) || safeBuy(p, "L");
  return resolveMeal("ecorice", p) || safeBuy(p, "D");
}

// Fill a meal slot from habit (or default)
function applyHabit(state, point) {
  const habit = state.habits[point.slot];
  if (habit === "lunchbox" && state.flags.lunchbox > 0) {
    const meal = SIM_F.mealById(state.flags.lunchboxMeal);
    state.flags.lunchbox--;
    return pushLine(state, point, "habit", `${meal.name} (lunchbox)`, 0, SIM_F.mealStats(meal), { mealId: meal.id, home: true });
  }
  let meal = habit && habit !== "lunchbox" ? SIM_F.mealById(habit) : null;
  if (meal && meal.source !== "buy") {
    if (!SIM_F.fitsKitchen(meal, state.profile.kitchen) || missingFor(state, meal.recipe).length) meal = null;
  }
  if (!meal) meal = defaultMeal(state, point.slot);
  let forced = false;
  // Out of money: fall back to the cheapest thing you can still have
  if (meal.source === "buy" && SIM_F.mealPrice(meal) > moneyLeft(state) + 1e-9) {
    forced = true;
    const fallbacks = ["breadpeanut", "oatsbanana", "instantnoodles", "storenoodles", "roticanai", "skip"]
      .map(id => resolveMeal(id, state.profile)).filter(Boolean)
      .filter(m => m.source === "buy" ? SIM_F.mealPrice(m) <= moneyLeft(state) + 1e-9
        : SIM_F.fitsKitchen(m, state.profile.kitchen) && missingFor(state, m.recipe).length === 0);
    meal = fallbacks[0] || SIM_F.mealById("skip");
  }
  const stats = SIM_F.mealStats(meal);
  if (meal.source !== "buy") consume(state, meal.recipe);
  return pushLine(state, point, "habit", meal.name + (forced ? " (money ran out)" : ""), meal.source === "buy" ? SIM_F.mealPrice(meal) : 0, stats,
    { mealId: meal.id, home: meal.source !== "buy", forced });
}

// ---------- stepping ----------
function sceneAt(state, point) {
  if (point.slot === "B" && !state.profile.breakfast) return null; // "I eat breakfast" off: no breakfast scene, no breakfast cost
  return SIM_W.SCENES.find(s => s.day === point.day && s.slot === point.slot && (!s.when || s.when(state))) || null;
}

// Advance until the next scene that needs a decision (or the end). Returns the scene or null.
function advance(state) {
  const schedule = SIM_W.buildSchedule();
  while (state.cursor < schedule.length) {
    const point = schedule[state.cursor];
    const scene = sceneAt(state, point);
    if (scene) {
      state.current = scene.id;
      return scene;
    }
    const meal = point.slot === "L" || point.slot === "D" || (point.slot === "B" && state.profile.breakfast);
    if (meal && point.day >= 0) applyHabit(state, point);
    state.cursor++;
  }
  state.current = null;
  state.done = true;
  return null;
}

function currentScene(state) {
  if (!state.current) return null;
  return SIM_W.SCENES.find(s => s.id === state.current) || null;
}

// Apply a choice. Returns { line, option } or throws on an invalid/unavailable option.
function choose(state, optionId) {
  const scene = currentScene(state);
  if (!scene) throw new Error("No decision pending");
  const schedule = SIM_W.buildSchedule();
  const point = schedule[state.cursor];
  const options = sceneOptions(state, scene);
  const opt = options.find(o => o.id === optionId);
  if (!opt) throw new Error("Unknown option " + optionId);
  if (!opt.available) throw new Error("Option not available: " + optionId);

  // Borrowing doesn't use up the decision: the same scene stays, with more money
  if (opt.kind === "borrow") {
    state.borrowed = (state.borrowed || 0) + BORROW_STEP;
    if (state.debtDay === null || state.debtDay === undefined) state.debtDay = point.day;
    const line = pushLine(state, point, "borrow", `Borrowed RM ${BORROW_STEP} from a housemate`, 0, null, { borrow: BORROW_STEP });
    return { line, option: opt, meanwhile: [], stay: true };
  }

  let line;
  if (opt.kind === "basket") {
    state.flags.shop = optionId;
    if (opt.basket) {
      opt.basket.forEach(id => { state.inventory[id] = (state.inventory[id] || 0) + SIM_F.PACKS[id].g; });
      line = pushLine(state, point, "shop", `Groceries (${opt.basket.length} packs)`, opt.cash, null, { basket: opt.basket.slice() });
    } else {
      line = pushLine(state, point, "shop", "No shop", 0, null);
    }
  } else if (opt.kind === "prep") {
    let made = 0;
    for (let i = 0; i < opt.count; i++) {
      if (missingFor(state, opt.meal.recipe).length) break;
      consume(state, opt.meal.recipe);
      made++;
    }
    state.flags.lunchbox += made;
    state.flags.lunchboxMeal = opt.meal.id;
    line = pushLine(state, point, "prep", `Cooked ${made} lunchboxes: ${opt.meal.name}`, 0, null);
  } else if (opt.kind === "useup") {
    const recipe = useUpRecipe(state);
    const stats = SIM_F.mealStats({ source: "cook", recipe });
    consume(state, recipe);
    const binned = SIM_F.round2(inventoryValue(state.inventory, true));
    line = pushLine(state, point, "choice", "Fried rice from what's left (one plate)", 0, stats, { home: true, mealId: null, binnedRm: binned });
  } else if (opt.kind === "none") {
    line = pushLine(state, point, "plan", opt.label, 0, null);
  } else if (opt.kind === "lunchbox") {
    state.flags.lunchbox--;
    line = pushLine(state, point, "choice", `${opt.meal.name} (lunchbox)`, 0, opt.stats, { mealId: opt.meal.id, home: true });
    if (["B", "L", "D"].includes(point.slot)) state.habits[point.slot] = "lunchbox";
  } else {
    const meal = opt.meal;
    if (meal.source !== "buy") consume(state, meal.recipe);
    line = pushLine(state, point, "choice", opt.label, opt.cash, opt.stats,
      { mealId: meal.id, home: meal.source !== "buy", fee: opt.fee, feeLabel: opt.feeLabel });
    if (["B", "L", "D"].includes(point.slot) && meal.id !== "skip" && scene.kind !== "curveball") state.habits[point.slot] = meal.id;
    if (scene.id === "wed-l" && meal.id === "skip") state.flags.skippedLunch = true;
  }
  line.sceneId = scene.id;
  line.optionId = optionId;
  const linesBefore = state.lines.length;

  // Record the decision with what else was available, for the report
  const alternatives = options.filter(o => o.available && o.id !== optionId && o.stats)
    .map(o => ({ id: o.id, label: o.label, cash: o.cash, co2: o.stats.co2, fv: o.stats.fv, sugary: o.stats.sugary, salty: o.stats.salty }));
  state.decisions.push({ sceneId: scene.id, day: point.day, slot: point.slot, optionId, label: line.label, cash: line.cash, co2: line.co2, fv: line.fv,
    sugary: line.sugary, salty: line.salty, kind: opt.kind, alternatives });

  state.cursor++;
  state.current = null;
  advance(state);
  // Everything that happened by habit until the next decision ("Meanwhile")
  const meanwhile = state.lines.slice(linesBefore);
  return { line, option: opt, meanwhile };
}

// One generous plate from what's in the kitchen: capped per food group so a single
// meal can't "eat" a whole fridge. Fresh food goes in first.
function useUpRecipe(state) {
  const group = id => GRAIN_IDS.includes(id) ? "grain" : PROTEIN_IDS_SIM.includes(id) ? "protein"
    : (SIM_F.MEALS && ["greens", "veg", "rootveg", "tomato", "banana", "apple", "citrus"].includes(id)) ? "fv" : null;
  const room = { ...USEUP_CAPS };
  const ids = Object.keys(state.inventory).filter(k => state.inventory[k] > 0)
    .sort((a, b) => (PERISHABLE.includes(b) ? 1 : 0) - (PERISHABLE.includes(a) ? 1 : 0) || a.localeCompare(b));
  const recipe = [];
  ids.forEach(id => {
    const g = group(id);
    if (!g || room[g] <= 0) return;
    const take = Math.min(room[g], state.inventory[id]);
    if (take <= 0) return;
    room[g] -= take;
    recipe.push({ id, g: Math.round(take) });
  });
  return recipe;
}

// ---------- totals ----------
function totals(state) {
  const days = Array.from({ length: 7 }, () => ({ cash: 0, co2: 0, fv: 0 }));
  let co2 = 0, fv = 0, sugary = 0, salty = 0, fees = 0, homeMeals = 0, boughtMeals = 0, grocery = 0;
  state.lines.forEach(l => {
    co2 += l.co2; fv += l.fv;
    if (l.sugary) sugary++;
    if (l.salty) salty++;
    if (l.fee) fees += l.fee;
    if (l.kind === "shop") grocery += l.cash;
    if (["B", "L", "D"].includes(l.slot) && l.day >= 0 && l.mealId !== "skip" && l.kind !== "borrow") {
      if (l.home) homeMeals++; else boughtMeals++;
    }
    if (l.day >= 0) { days[l.day].cash += l.cash; days[l.day].co2 += l.co2; days[l.day].fv += l.fv; }
  });
  const leftover = inventoryValue(state.inventory, false);
  const perishableLeft = inventoryValue(state.inventory, true);
  return {
    spent: SIM_F.round2(state.spent), budget: state.profile.budget, left: SIM_F.round2(state.profile.budget - state.spent),
    borrowed: state.borrowed || 0, debtDay: state.debtDay === undefined ? null : state.debtDay, moneyLeft: moneyLeft(state),
    skipped: state.lines.filter(l => l.mealId === "skip" && ["B", "L", "D"].includes(l.slot) && l.day >= 0).length,
    co2: Math.round(co2 * 100) / 100, fv: Math.round(fv), fvPerDay: Math.round(fv / 7),
    sugary, salty, fees: SIM_F.round2(fees), grocery: SIM_F.round2(grocery),
    meals: state.profile.breakfast ? 21 : 14,
    homeMeals, boughtMeals, leftover: SIM_F.round2(leftover), perishableLeft: SIM_F.round2(perishableLeft), days
  };
}

// ---------- calibration ("guess first") ----------
function calibrationQuestions() {
  const st = id => SIM_F.mealStats(SIM_F.mealById(id));
  const dinners = ["chickenrice", "meegoreng", "ecoricetofu"];
  const lowest = dinners.reduce((a, b) => (st(b).co2 < st(a).co2 ? b : a));
  const raw = 5 * (SIM_F.mealPrice(SIM_F.mealById("ecorice")) - st("eggfriedrice").rm);
  const r5 = n => Math.max(5, Math.round(n / 5) * 5);
  const diff = r5(raw);
  const low = r5(diff / 2) === diff ? diff - 5 : r5(diff / 2);
  const high = r5(diff * 1.7) === diff ? diff + 10 : r5(diff * 1.7);
  return [
    { id: "q1", text: "Which dinner has the lowest carbon footprint?",
      options: dinners.map(id => ({ id, label: SIM_F.mealById(id).name })), answer: lowest,
      explain: `${dinners.map(id => `${SIM_F.mealById(id).name}: ${st(id).co2.toFixed(2)} kg CO₂e`).join("; ")}. Noodles and egg beat chicken.` },
    { id: "q2", text: "How much vegetable is in economy rice with two vegetable dishes?",
      options: [{ id: "40", label: "About 40 g" }, { id: "160", label: "About 160 g" }, { id: "400", label: "About 400 g" }], answer: "160",
      explain: "About 160 g in our estimate of two typical scoops — 40% of WHO's 400 g a day in one meal." },
    { id: "q3", text: "Lunch at RM 8 every weekday vs cooking egg fried rice at home. What's the difference over five days?",
      options: [{ id: String(low), label: `About RM ${low}` }, { id: String(diff), label: `About RM ${diff}` }, { id: String(high), label: `About RM ${high}` }], answer: String(diff),
      explain: `Egg fried rice costs about RM ${st("eggfriedrice").rm.toFixed(2)} a plate from supermarket packs, so five days saves about RM ${raw.toFixed(0)}.` }
  ];
}

// ---------- persistence ----------
// Rebuilds a state from saved JSON. Returns null if the save is not usable.
function restoreSim(saved, validateProfile) {
  if (!saved || typeof saved !== "object" || saved.v !== SIM_VERSION) return null;
  const profile = validateProfile(saved.profile);
  if (!profile) return null;
  const schedule = SIM_W.buildSchedule();
  if (!Number.isInteger(saved.cursor) || saved.cursor < 0 || saved.cursor > schedule.length) return null;
  if (!Array.isArray(saved.lines) || !Array.isArray(saved.decisions)) return null;
  const okNum = n => typeof n === "number" && Number.isFinite(n);
  const SLOTS = ["X", "B", "L", "D", "N"];
  for (const l of saved.lines) {
    if (!l || typeof l !== "object" || !okNum(l.cash) || !okNum(l.co2) || !okNum(l.fv)) return null;
    if (!Number.isInteger(l.day) || l.day < -1 || l.day > 6 || !SLOTS.includes(l.slot) || typeof l.label !== "string") return null;
    if (l.kind === "borrow" && !okNum(l.borrow)) return null;
    if (l.fee !== undefined && !okNum(l.fee)) return null;
  }
  for (const d of saved.decisions) {
    if (!d || typeof d !== "object" || typeof d.sceneId !== "string" || !okNum(d.cash) || !okNum(d.co2) || !okNum(d.fv)) return null;
    if (!Number.isInteger(d.day) || d.day < -1 || d.day > 6 || (d.alternatives !== undefined && !Array.isArray(d.alternatives))) return null;
    if ((d.alternatives || []).some(a => !a || !okNum(a.cash) || !okNum(a.co2) || !okNum(a.fv))) return null;
  }
  const inv = {};
  if (saved.inventory && typeof saved.inventory === "object") {
    Object.keys(saved.inventory).forEach(k => { if (SIM_F.PACKS[k] && okNum(saved.inventory[k]) && saved.inventory[k] >= 0) inv[k] = saved.inventory[k]; });
  }
  const state = newSim(profile);
  state.cursor = saved.cursor;
  state.inventory = inv;
  const f = saved.flags || {};
  state.flags = {
    lunchbox: Number.isInteger(f.lunchbox) && f.lunchbox >= 0 && f.lunchbox <= 10 ? f.lunchbox : 0,
    lunchboxMeal: typeof f.lunchboxMeal === "string" && SIM_F.mealById(f.lunchboxMeal) ? f.lunchboxMeal : null,
    shop: typeof f.shop === "string" ? f.shop : null,
    skippedLunch: !!f.skippedLunch
  };
  const h = saved.habits || {};
  ["B", "L", "D"].forEach(k => { if (typeof h[k] === "string" && (h[k] === "lunchbox" || SIM_F.mealById(h[k]))) state.habits[k] = h[k]; });
  state.lines = saved.lines;
  state.decisions = saved.decisions;
  state.spent = SIM_F.round2(saved.lines.reduce((s, l) => s + l.cash, 0));
  state.guesses = saved.guesses && typeof saved.guesses === "object" ? saved.guesses : null;
  state.borrowed = [0, BORROW_STEP, BORROW_MAX].includes(saved.borrowed) ? saved.borrowed : 0;
  state.debtDay = Number.isInteger(saved.debtDay) && saved.debtDay >= -1 && saved.debtDay <= 6 ? saved.debtDay : null;
  state.done = false;
  state.current = null;
  advance(state);
  return state;
}

function serializeSim(state) {
  const { current, ...rest } = state; // eslint-disable-line no-unused-vars
  return rest;
}

if (typeof module !== "undefined") {
  module.exports = {
    SIM_VERSION, DIET_ALT, PERISHABLE, BORROW_STEP, BORROW_MAX, USEUP_CAPS, resolveMeal, newSim, sceneOptions, visibleOptions, advance, currentScene, choose,
    totals, calibrationQuestions, restoreSim, serializeSim, missingFor, inventoryValue, basketCost, textOf, moneyLeft, useUpRecipe
  };
}
