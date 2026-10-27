// =============================================================
// storage.js — safe localStorage + validation of everything we read back.
// Anything malformed is ignored (treated as "not saved") instead of crashing.
// =============================================================

const KEYS = {
  profile: "eft2-profile",
  sim: "eft2-sim",
  report: "eft2-report",
  plan: "eft2-plan",
  checkin: "eft2-checkin",
  prices: "eft2-prices",
  have: "eft2-have",
  ifthen: "eft2-ifthen",
  history: "eft2-history",   // past weeks' plans and check-in logs (kept when a plan is remade)
  spend: "eft2-spend",       // receipts and typed spending (My real week)
  stalls: "eft2-stalls",     // stall price notes
  classroom: "eft2-class",   // lecturer's imported class codes
  classref: "eft2-classref", // a class summary a student imported to compare against
  draft: "eft2-receipt-draft", // a receipt being checked, so a reload or a closed tab doesn't lose it
  ate: "ma-ate",             // what you ate, from Pick for me (days without a running plan)
  saved: "ma-saved",          // validated favourite meal IDs
  picks: "ma-picks",         // Pick for me: meals you never want, what's at home, last choices
  learn: "ma-learn"          // quiz score and the facts you've seen
};
// Allergen ids (kept here too so storage.js works on its own in tests)
const ST_ALLERGEN_IDS = ["gluten", "peanut", "treenut", "soy", "fish", "crustacean", "mollusc", "egg", "milk", "sesame"];
const HISTORY_MAX = 12;

const BUDGET_MIN = 40;
const BUDGET_MAX = 400;
const GOALS = ["money", "health", "planet"];

function storeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}
function storeRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* storage blocked */ }
}

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);

// Returns a clean profile or null
function validateProfile(p) {
  if (!isObj(p)) return null;
  const budget = Math.round(Number(p.budget));
  if (!Number.isFinite(budget) || budget < BUDGET_MIN || budget > BUDGET_MAX) return null;
  if (!["hostel", "shared", "home"].includes(p.kitchen)) return null;
  if (!GOALS.includes(p.goal)) return null;
  return {
    budget,
    kitchen: p.kitchen,
    goal: p.goal,
    diet: {
      halal: p.diet && p.diet.halal === false ? false : true,
      vegetarian: !!(p.diet && p.diet.vegetarian),
      noBeef: !!(p.diet && p.diet.noBeef),
      // "shellfish" (an earlier single group) means both crustaceans and molluscs
      allergies: p.diet && Array.isArray(p.diet.allergies) ? [...new Set(p.diet.allergies.flatMap(a => (a === "shellfish" ? ["crustacean", "mollusc"] : [a])).filter(a => ST_ALLERGEN_IDS.includes(a)))] : []
    },
    campusLunch: p.campusLunch === false ? false : true,
    cooks: p.kitchen === "hostel" ? 0 : (Number.isInteger(p.cooks) && p.cooks >= 0 && p.cooks <= 14 ? p.cooks : 6),
    breakfast: p.breakfast === false ? false : true,
    rahmah: p.rahmah === true,
    preset: p.preset === "tight" ? "tight" : "normal"
  };
}

function defaultProfile() {
  return { budget: 120, kitchen: "shared", goal: "money", diet: { halal: true, vegetarian: false, noBeef: false, allergies: [] }, campusLunch: true, breakfast: true, cooks: 6, rahmah: false, preset: "normal" };
}

// The tight-week preset: RM 10 a day, Menu Rahmah on, money first
const TIGHT_WEEK = { budget: 70, goal: "money", rahmah: true, preset: "tight" };

// If-then plan for a weak moment: two short phrases the student writes themselves
function validateIfThen(raw) {
  if (!isObj(raw)) return null;
  const clean = v => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 80) : "");
  const when = clean(raw.when), then = clean(raw.then);
  return when && then ? { when, then } : null;
}

// Past weeks: [{ start, plan, log, budget, reason, at }]. Logs are re-validated where they are used.
function validateHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(h => isObj(h) && typeof h.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.start) && Array.isArray(h.plan) && h.plan.length === 7 && isObj(h.log))
    .slice(0, HISTORY_MAX)
    .map(h => ({ start: h.start, plan: h.plan, log: h.log, budget: Number.isFinite(Number(h.budget)) ? Number(h.budget) : null,
      reason: typeof h.reason === "string" ? h.reason.slice(0, 40) : "", at: Number.isFinite(h.at) ? h.at : 0, sums: validSums(h.sums) }))
    .map(h => { if (!h.sums) delete h.sums; return h; });
}
// The week's numbers as they were when it was filed (older history has none: they are worked out again)
function validSums(x) {
  if (!isObj(x)) return null;
  const ints = ["kept", "logged", "skipped"], money = ["spent", "planned", "cashOut"];
  if (!ints.every(k => Number.isInteger(x[k]) && x[k] >= 0 && x[k] <= 28) || !money.every(k => Number.isFinite(x[k]) && x[k] >= 0 && x[k] <= 20000)) return null;
  return Object.fromEntries(ints.concat(money).map(k => [k, x[k]]));
}

function loadProfile() {
  return validateProfile(storeGet(KEYS.profile, null));
}

if (typeof module !== "undefined") {
  module.exports = { KEYS, BUDGET_MIN, BUDGET_MAX, GOALS, storeGet, storeSet, storeRemove, validateProfile, defaultProfile, loadProfile, isObj, TIGHT_WEEK, validateIfThen, validateHistory, HISTORY_MAX };
}
