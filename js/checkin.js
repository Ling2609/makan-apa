// =============================================================
// checkin.js — daily check-in against a plan, and calendar (.ics) export.
// Pure logic; unit tested.
// =============================================================

/* global mealById, mealStats, round2, PLAN_SLOTS, evaluate */
const CK_F = (typeof mealById === "function") ? { mealById, mealStats, round2 } : require("./foods.js");
const CK_P = (typeof evaluate === "function") ? { PLAN_SLOTS, evaluate } : require("./planner.js");

const STATUSES = ["planned", "other", "skipped"];

function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}
// Day of the plan (0–6) for a date; can be < 0 (not started) or > 6 (finished)
function planDay(startKey, today) {
  const start = fromKey(startKey);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t - start) / 86400000);
}

// Clean a stored log: { groceries: bool, days: { "0": { B: {status, rm?, label?} } } }
function validateLog(raw) {
  const log = { groceries: false, days: {} };
  if (!raw || typeof raw !== "object") return log;
  log.groceries = raw.groceries === true;
  // What the groceries really cost, when a receipt says so (otherwise the plan's estimate counts)
  const g = Number(raw.groceryRm);
  if (log.groceries && raw.groceryRm !== undefined && raw.groceryRm !== null && Number.isFinite(g) && g >= 0 && g <= 2000) log.groceryRm = CK_F.round2(g);
  // The grocery receipts the student linked (groceryRm is their grocery lines added up)
  if (log.groceries && Array.isArray(raw.groceryRids)) {
    const rids = [...new Set(raw.groceryRids.filter(isRid))].slice(0, 20);
    if (rids.length) log.groceryRids = rids;
  }
  const days = raw.days && typeof raw.days === "object" ? raw.days : {};
  for (let d = 0; d < 7; d++) {
    const day = days[String(d)];
    if (!day || typeof day !== "object") continue;
    CK_P.PLAN_SLOTS.forEach(s => {
      const e = day[s];
      if (!e || typeof e !== "object" || !STATUSES.includes(e.status)) return;
      const entry = { status: e.status };
      const rm = Number(e.rm);
      const okRm = e.rm !== undefined && e.rm !== null && e.rm !== "" && Number.isFinite(rm) && rm >= 0 && rm <= 500;
      // "Ate this" keeps the price the meal had when it was ticked: a later price change doesn't rewrite the past
      if (e.status === "planned" && okRm) entry.rm = CK_F.round2(rm);
      if (e.status === "other") {
        entry.rm = okRm ? CK_F.round2(rm) : 0;
        entry.label = typeof e.label === "string" ? e.label.slice(0, 80) : "Something else";
        if (e.src === "receipt") {
          entry.src = "receipt"; // logged from a scanned receipt (so the real-week report doesn't count it twice)
          // Which receipts, and each one's share: deleting one takes off only its share.
          // (Older logs kept a single rid for the whole entry.)
          let parts = Array.isArray(e.rids) ? e.rids.filter(x => x && isRid(x.id)).map(x => {
            const v = Number(x.rm);
            return { id: x.id, rm: Number.isFinite(v) && v >= 0 && v <= 500 ? CK_F.round2(v) : 0, label: typeof x.label === "string" ? x.label.slice(0, 80) : "" };
          }) : [];
          if (!parts.length && isRid(e.rid)) parts = [{ id: e.rid, rm: entry.rm, label: entry.label }];
          const seen = new Map();
          parts.forEach(x => seen.set(x.id, x)); // one share per receipt (the last one wins)
          parts = [...seen.values()].slice(0, 10);
          if (parts.length) {
            entry.rids = parts;
            entry.rm = CK_F.round2(Math.min(500, parts.reduce((a, x) => a + x.rm, 0)));
            entry.label = (parts.map(x => x.label).filter(Boolean).join(" + ") || entry.label).slice(0, 80);
          }
        }
      }
      log.days[String(d)] = log.days[String(d)] || {};
      log.days[String(d)][s] = entry;
    });
  }
  return log;
}

const isRid = v => typeof v === "string" && /^[a-z0-9]{4,16}$/i.test(v);

// A receipt was deleted: clear the meals it logged and take it off the groceries.
// groceryRm(rids) → the grocery money of the receipts still linked (or undefined when none are left).
function unlinkReceipt(log, rid, groceryRm) {
  const next = validateLog(log);
  Object.keys(next.days).forEach(d => Object.keys(next.days[d]).forEach(s => {
    const e = next.days[d][s];
    if (!e.rids || !e.rids.some(x => x.id === rid)) return;
    e.rids = e.rids.filter(x => x.id !== rid);
    if (!e.rids.length) delete next.days[d][s]; // that receipt was the whole meal
    else { e.rm = e.rids.reduce((a, x) => a + x.rm, 0); e.label = e.rids.map(x => x.label).filter(Boolean).join(" + ") || e.label; }
  }));
  if (next.groceryRids && next.groceryRids.includes(rid)) {
    next.groceryRids = next.groceryRids.filter(x => x !== rid);
    if (!next.groceryRids.length) { delete next.groceryRids; delete next.groceryRm; }
    else if (typeof groceryRm === "function") next.groceryRm = groceryRm(next.groceryRids);
  }
  return validateLog(next);
}

// A receipt's lines counted as a meal. A second receipt for the same meal (the drink bought
// at another stall) adds its share; the same receipt saved again replaces its own share.
function linkReceipt(log, day, slot, rid, rm, label) {
  const next = validateLog(log);
  const cur = next.days[String(day)] && next.days[String(day)][slot];
  const parts = cur && cur.status === "other" && cur.rids ? cur.rids.filter(x => x.id !== rid) : [];
  parts.push({ id: rid, rm, label: String(label || "").slice(0, 80) });
  return record(next, day, slot, { status: "other", rm: parts.reduce((a, x) => a + x.rm, 0), label: parts.map(x => x.label).join(" + "), src: "receipt", rids: parts });
}

function record(log, day, slot, entry) {
  const next = validateLog(log);
  next.days[String(day)] = next.days[String(day)] || {};
  if (entry === null) delete next.days[String(day)][slot];
  else next.days[String(day)][slot] = entry;
  return validateLog(next);
}

// Progress so far against the plan. Like is compared with like, over the meals logged so far:
//   planned cost of a meal = stall price if bought, ingredient cost per portion if home-made;
//   spent = the same when the plan was kept, what you typed when you ate something else,
//   nothing when skipped (a skipped home meal's food is still in the kitchen).
// Groceries are cash out of pocket on shopping day, reported separately (cashOut).
function summary(plan, log, todayIndex, have = {}) {
  const ev = CK_P.evaluate(plan, have);
  const lastDay = Math.max(-1, Math.min(6, todayIndex));
  const groceryCash = log.groceries ? (log.groceryRm !== undefined ? log.groceryRm : ev.grocery) : 0;
  let plannedToDate = 0, spentToDate = 0, cashOut = groceryCash;
  let due = 0, logged = 0, kept = 0, skipped = 0, other = 0;
  for (let d = 0; d <= lastDay; d++) {
    CK_P.PLAN_SLOTS.forEach(s => {
      const id = plan[d][s];
      if (!id) {
        // Something eaten where the plan had nothing (a snack picked with Pick for me): real money, no plan to compare with
        const x = log.days[String(d)] && log.days[String(d)][s];
        if (x && x.status === "other") { spentToDate += x.rm || 0; cashOut += x.rm || 0; }
        return;
      }
      const meal = CK_F.mealById(id);
      const plannedCost = CK_F.mealStats(meal).rm;
      const bought = meal.source === "buy";
      if (s !== "S") due++;
      const e = log.days[String(d)] && log.days[String(d)][s];
      if (!e) return;
      logged++;
      // a kept meal counts at the price it had when it was ticked (older logs: today's price)
      const keptCost = e.status === "planned" && e.rm !== undefined ? e.rm : plannedCost;
      plannedToDate += e.status === "planned" ? keptCost : plannedCost;
      if (e.status === "planned") { kept++; spentToDate += keptCost; if (bought) cashOut += keptCost; }
      else if (e.status === "other") { other++; spentToDate += e.rm || 0; cashOut += e.rm || 0; }
      else if (s !== "S") skipped++;
    });
  }
  // Tomorrow: home meals whose food is already bought
  const tomorrow = [];
  const t = lastDay + 1;
  if (t >= 0 && t <= 6 && log.groceries) CK_P.PLAN_SLOTS.forEach(s => {
    const m = plan[t][s] && CK_F.mealById(plan[t][s]);
    if (m && m.source !== "buy") tomorrow.push(m.short || m.name);
  });
  return {
    due, logged, kept, skipped, other,
    adherence: logged ? Math.round((kept / logged) * 100) : 0,
    plannedToDate: CK_F.round2(plannedToDate),
    spentToDate: CK_F.round2(spentToDate),
    difference: CK_F.round2(spentToDate - plannedToDate),
    cashOut: CK_F.round2(cashOut),
    groceries: groceryCash,
    weekOutlay: ev.outlay,
    tomorrow,
    foodAid: skipped >= 3
  };
}

// A finished or remade week's numbers, frozen when it is filed under Past weeks
// (so a later price change never rewrites an old week)
function weekSums(plan, log, have = {}) {
  const sm = summary(plan, log, 6, have);
  return { kept: sm.kept, logged: sm.logged, skipped: sm.skipped, spent: sm.spentToDate, planned: sm.plannedToDate, cashOut: sm.cashOut };
}

// Fresh ingredients a day's home meals should use up first
const USE_FIRST = { fish: "fish", greens: "greens", chicken: "chicken", tofu: "tofu", tomato: "tomatoes", veg: "vegetables", milk: "milk", bread: "bread" };
function useFirst(plan, d) {
  const out = [];
  ["B", "L", "D"].forEach(s => {
    const m = plan[d][s] && CK_F.mealById(plan[d][s]);
    if (!m || m.source === "buy") return;
    (m.recipe || []).forEach(p => { if (USE_FIRST[p.id] && !out.includes(USE_FIRST[p.id])) out.push(USE_FIRST[p.id]); });
  });
  return out;
}

// ---------- calendar (.ics, RFC 5545) ----------
function icsEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
// Fold lines longer than 75 octets (UTF-8 safe)
function icsFold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (enc.encode(cur + ch).length > limit) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.map((l, i) => (i === 0 ? l : " " + l)).join("\r\n");
}
function icsDate(key, hh, mm) {
  return key.replace(/-/g, "") + "T" + String(hh).padStart(2, "0") + String(mm).padStart(2, "0") + "00";
}
function icsStamp(now) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * One shopping reminder and a 20:00 check-in reminder each day.
 * The shop comes before anything needs the groceries: by default at 10:00 the day before the plan
 * starts (before the evening cook-ahead session). For a plan started today, pass
 * opts.shopDay = 0 and opts.shopHour (the app uses the next full hour).
 * Each event lists the plan and links back to the check-in page.
 * each listing the plan and linking back to the check-in page.
 */
function buildIcs(plan, startKey, url, now = new Date(), opts = {}) {
  const ev = CK_P.evaluate(plan, opts.have || {});
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Eat For Tomorrow//Week plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  const stamp = icsStamp(now);
  const uidBase = startKey.replace(/-/g, "") + "-" + Math.abs(hashString(JSON.stringify(plan))).toString(36);
  const slotName = { B: "Breakfast", L: "Lunch", D: "Dinner", S: "Snack" };
  const toBuy = ev.shopping.filter(i => i.packs > 0);
  if (toBuy.length) {
    const list = toBuy.map(i => `${i.packs} × ${i.name}`).join("\n");
    const shopKey = addDays(startKey, Number.isInteger(opts.shopDay) ? opts.shopDay : -1);
    const hh = Number.isInteger(opts.shopHour) && opts.shopHour >= 6 && opts.shopHour <= 22 ? opts.shopHour : 10;
    lines.push("BEGIN:VEVENT", `UID:${uidBase}-shop@eatfortomorrow`, `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(shopKey, hh, 0)}`, `DTEND:${icsDate(shopKey, hh, 45)}`,
      `SUMMARY:${icsEscape(`Grocery shop (about RM ${ev.grocery.toFixed(2)})`)}`,
      `DESCRIPTION:${icsEscape(list + (url ? `\n\n${url}` : ""))}`, "END:VEVENT");
  }
  for (let d = 0; d < 7; d++) {
    const key = addDays(startKey, d);
    let meals = CK_P.PLAN_SLOTS.filter(s => plan[d][s]).map(s => `${slotName[s]}: ${CK_F.mealById(plan[d][s]).name}`).join("\n");
    const first = useFirst(plan, d);
    if (first.length) meals += `\nUse first: ${first.join(", ")}`;
    if (opts.ifThen) meals += `\nYour plan for a weak moment: ${opts.ifThen}`;
    lines.push("BEGIN:VEVENT", `UID:${uidBase}-d${d}@eatfortomorrow`, `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(key, 20, 0)}`, `DTEND:${icsDate(key, 20, 10)}`,
      `SUMMARY:${icsEscape(`Food check-in, day ${d + 1} of 7`)}`,
      `DESCRIPTION:${icsEscape(meals + (url ? `\n\nTick it off: ${url}` : ""))}`);
    if (url) lines.push(`URL:${url}`);
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape("Food check-in")}`, "TRIGGER:-PT0M", "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

if (typeof module !== "undefined") {
  module.exports = { STATUSES, toKey, fromKey, addDays, planDay, validateLog, record, linkReceipt, unlinkReceipt, summary, weekSums, buildIcs, icsEscape, icsFold, useFirst };
}
