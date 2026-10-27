// =============================================================
// report.js — turns a finished week into the Week Report (pure logic).
// Every number comes from the simulation lines; every claim is checkable.
// =============================================================

/* global totals, calibrationQuestions, referenceDay, mealById, mealStats, round2 */
const RP_S = (typeof totals === "function") ? { totals, calibrationQuestions } : require("./sim.js");
const RP_F = (typeof referenceDay === "function") ? { referenceDay, mealById, mealStats, round2 } : require("./foods.js");

// Value of a choice for the player's goal (higher is better). Other goals count a little.
function choiceValue(c, goal) {
  const money = -c.cash / 4;            // RM 4 ≈ one unit
  const planet = -c.co2 * 1.5;          // 0.67 kg ≈ one unit
  const health = c.fv / 80 - (c.sugary ? 1 : 0) - (c.salty ? 0.7 : 0);
  const w = { money: [2, 0.6, 0.6], planet: [0.6, 2, 0.6], health: [0.6, 0.6, 2] }[goal] || [1, 1, 1];
  return w[0] * money + w[1] * planet + w[2] * health;
}

function bestAndWorst(decisions, goal) {
  const rated = decisions
    .filter(d => (d.kind === "meal" || d.kind === "lunchbox") && d.alternatives && d.alternatives.length)
    .map(d => {
      const mine = choiceValue(d, goal);
      const alts = d.alternatives.map(a => ({ ...a, value: choiceValue(a, goal) }));
      const bestAlt = alts.reduce((a, b) => (b.value > a.value ? b : a));
      const avg = alts.reduce((s, a) => s + a.value, 0) / alts.length;
      return { d, gain: mine - avg, regret: bestAlt.value - mine, bestAlt };
    });
  if (!rated.length) return { best: null, worst: null };
  const best = rated.reduce((a, b) => (b.gain > a.gain ? b : a));
  const worstPick = rated.reduce((a, b) => (b.regret > a.regret ? b : a));
  return { best, worst: worstPick.regret > 0.3 ? worstPick : null };
}

// One honest label for the week's pattern, with the numbers behind it
const RP_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// The two priciest different picks (the same meal bought twice is one pick, said once with "twice")
function priciest(lines) {
  const by = new Map();
  lines.filter(l => l.cash > 0 && l.kind !== "shop").forEach(l => {
    const k = String(l.label).toLowerCase();
    const cur = by.get(k);
    if (!cur) by.set(k, { label: l.label, cash: l.cash, n: 1 });
    else { cur.n++; cur.cash = Math.max(cur.cash, l.cash); }
  });
  return [...by.values()].sort((a, b) => b.cash - a.cash).slice(0, 2);
}
function priciestText(big) {
  const one = x => `“${x.label}” (RM ${x.cash.toFixed(2)}${x.n === 2 ? ", twice" : x.n > 2 ? `, ${x.n} times` : ""})`;
  if (!big.length) return "";
  if (big.length === 1) return `Your priciest pick was ${one(big[0])}.`;
  return `Your two priciest picks were ${one(big[0])} and ${one(big[1])}.`;
}

function archetype(state, t) {
  const lines = state.lines;
  const lateNight = lines.some(l => l.slot === "N" && l.cash > 0);
  const preps = lines.some(l => l.kind === "prep" && /Cooked [1-9]/.test(l.label));
  const big = priciest(lines);
  const bigText = priciestText(big);
  if (t.borrowed > 0) {
    const day = t.debtDay !== null && t.debtDay >= 0 ? RP_DAYS[t.debtDay] : "the weekend";
    return { id: "borrowed", name: `Broke by ${day}`, why: `The money ran out on ${day}, so you borrowed RM ${t.borrowed} from a housemate. Next week starts RM ${t.borrowed} short.`,
      tip: `${bigText} A broke week usually comes from a few meals, not every day.`.trim() };
  }
  if (t.moneyLeft < Math.max(5, t.budget * 0.04) && t.skipped > 0) {
    return { id: "lastringgit", name: "Down to the last ringgit", why: `You finished with RM ${t.moneyLeft.toFixed(2)} and skipped ${t.skipped} meal${t.skipped > 1 ? "s" : ""}.`,
      tip: `${bigText} Skipped meals tend to come back as expensive late-night orders.`.trim() };
  }
  if (preps && t.homeMeals >= 8) {
    return { id: "prepper", name: "The meal prepper", why: `${t.homeMeals} of your ${t.meals} meals came from your own kitchen.`,
      tip: "Keep the Sunday cook. It is the single habit that most changed your week." };
  }
  if (t.fees >= 7) {
    return { id: "delivery", name: "The delivery regular", why: `You paid RM ${t.fees.toFixed(2)} in delivery fees and service charges.`,
      tip: "Fees add nothing to your plate. One lunchbox or one walk in the rain saves the same money." };
  }
  if (t.left >= t.budget * 0.15) {
    return { id: "hawk", name: "The budget hawk", why: `You finished RM ${t.left.toFixed(2)} under budget.`,
      tip: t.fvPerDay < 400 ? `Spend a little of that on fruit: you averaged ${t.fvPerDay} g of fruit and vegetables a day.` : "You also kept your fruit and vegetables up. Rare combination." };
  }
  if (lateNight) {
    return { id: "nightowl", name: "The night owl", why: "Late-night food made it onto your receipt.",
      tip: "A shelf with bread, peanut butter and bananas costs less than one supper run." };
  }
  return { id: "balanced", name: "The steady one", why: "No single habit dominated your week.",
    tip: "The plan below can push one goal further without changing much." };
}

function buildReport(state) {
  const t = RP_S.totals(state);
  const ref = RP_F.referenceDay();
  const refWeek = { co2: Math.round(ref.co2 * 7 * 100) / 100 };
  const meals = state.lines.filter(l => ["B", "L", "D"].includes(l.slot) && l.day >= 0 && l.kind !== "borrow");
  const topSpend = state.lines.filter(l => l.cash > 0 && l.kind !== "shop").slice().sort((a, b) => b.cash - a.cash).slice(0, 3);
  const topCo2 = state.lines.filter(l => l.co2 > 0).slice().sort((a, b) => b.co2 - a.co2).slice(0, 3);
  const fvDaysMet = t.days.filter(d => d.fv >= 400).length;
  const { best, worst } = bestAndWorst(state.decisions, state.profile.goal);
  // A "habit" only if that meal repeated by habit later in the week
  if (worst) {
    const id = (state.lines.find(l => l.sceneId === worst.d.sceneId) || {}).mealId;
    worst.repeated = !!id && state.lines.filter(l => l.kind === "habit" && l.mealId === id).length;
  }

  let guesses = null;
  if (state.guesses && typeof state.guesses === "object") {
    const qs = RP_S.calibrationQuestions();
    guesses = qs.map(q => ({ q, guess: state.guesses[q.id] || null, right: state.guesses[q.id] === q.answer }));
    if (guesses.every(g => g.guess === null)) guesses = null;
  }

  return {
    profile: state.profile,
    totals: t,
    referenceWeek: refWeek,
    meals: meals.length,
    topSpend, topCo2, fvDaysMet,
    best, worst,
    archetype: archetype(state, t),
    guesses,
    bought: t.boughtMeals, home: t.homeMeals
  };
}

// The numbers for the share image: one big number + a short label each (no claims beyond the numbers)
function shareStats(r) {
  const t = r.totals;
  return [
    { big: `RM ${t.spent.toFixed(2)}`, label: t.borrowed ? `spent: RM ${t.budget} budget + RM ${t.borrowed} borrowed` : `spent of a RM ${t.budget} budget` },
    { big: `${t.co2.toFixed(1)} kg`, label: `CO₂e (reference week ${r.referenceWeek.co2.toFixed(1)} kg)` },
    { big: `${r.fvDaysMet} of 7`, label: "days with 400 g of fruit & veg" }
  ];
}
// Kept for anything that wants plain lines
function shareLines(r) {
  return shareStats(r).map(x => `${x.big} ${x.label}`).concat(r.archetype.name);
}

if (typeof module !== "undefined") {
  module.exports = { priciest, priciestText, choiceValue, bestAndWorst, archetype, buildReport, shareLines, shareStats };
}
