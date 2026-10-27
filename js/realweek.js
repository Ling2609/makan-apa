// =============================================================
// realweek.js — "My real week": what the student really spent, from confirmed receipts,
// typed spending and the daily check-in, against their budget and plan. Pure logic; unit tested.
//
// Nothing is counted twice: a check-in slot linked to a receipt line counts at the receipt's price
// only, whatever the check-in says later; and when grocery receipts are linked to the plan, they are
// the groceries (the plan's estimate is used only when the groceries were ticked with no receipt).
// Nothing is lost: deleting a receipt clears the meals it logged (checkin.unlinkReceipt).
// =============================================================

/* global evaluate, toKey, addDays, fromKey */
const RW_P = (typeof evaluate === "function") ? { evaluate } : require("./planner.js");
const RW_C = (typeof addDays === "function") ? { toKey, addDays, fromKey } : require("./checkin.js");

const RW_CATS = ["meal", "drink", "snack", "groceries", "fees", "other"];
const RW_CAT_NAMES = { meal: "Meals bought", drink: "Drinks", snack: "Snacks", groceries: "Groceries", fees: "Delivery and fees", other: "Other" };
const rw2 = n => Math.round(n * 100) / 100;

/**
 * realWeek({ spends, today, budget, plan?, start?, log?, have? }) → {
 *   from, to, days: [{ key, rm }], total, byCat: { cat: rm }, items: [{ label, rm, n }],
 *   receipts, estimatedGroceries, planned, budget, overBudget, tips: [text]
 * }
 * With a running plan (start), the window is the plan's 7 days; otherwise the 7 days ending today.
 */
function realWeek(o) {
  const today = o.today instanceof Date ? o.today : new Date();
  const from = o.start || RW_C.addDays(RW_C.toKey(today), -6);
  const keys = Array.from({ length: 7 }, (_, i) => RW_C.addDays(from, i));
  const to = keys[6];
  const days = keys.map(key => ({ key, rm: 0 }));
  const byCat = Object.fromEntries(RW_CATS.map(c => [c, 0]));
  const items = {};
  const add = (dayIdx, cat, label, rm) => {
    days[dayIdx].rm += rm;
    byCat[cat] = (byCat[cat] || 0) + rm;
    const k = label.toLowerCase();
    items[k] = items[k] || { label, rm: 0, n: 0, cat };
    items[k].rm += rm; items[k].n++;
  };
  let receipts = 0;
  const spends = o.spends || [];
  const inWin = spends.filter(sp => keys.includes(sp.date));
  // Check-in slots a receipt line already covers (by plan day): their check-in price is never added again
  const covered = new Set();
  const planned = o.start && o.plan ? true : false;
  inWin.forEach(sp => {
    const i = keys.indexOf(sp.date);
    receipts++;
    const elsewhere = (o.groceriesElsewhere || []).includes(sp.id);
    sp.items.forEach(it => {
      if (elsewhere && it.category === "groceries") return; // the plan's shop: counted in the plan's week
      add(i, it.category, it.label, it.rm); if (planned && it.slot) covered.add(i + it.slot);
    });
    // tax, service charge and rounding are not food: they count as fees
    const extra = rw2(sp.total - sp.items.reduce((s, it) => s + it.rm, 0));
    if (Math.abs(extra) > 0.001) add(i, "fees", "Tax, service charge and rounding", extra);
  });
  let estimatedGroceries = 0;
  if (o.plan && o.start && o.log) {
    const ev = RW_P.evaluate(o.plan, o.have || {});
    const ids = new Set(spends.map(sp => sp.id));
    Object.keys(o.log.days || {}).forEach(d => {
      const day = Number(d);
      Object.keys(o.log.days[d]).forEach(slot => {
        const e = o.log.days[d][slot];
        if (covered.has(day + slot)) return;
        const cat = slot === "S" ? "snack" : "meal";
        if (e.status === "other" && e.src === "receipt") {
          // Logged from receipts: each share counts here only if its receipt is gone (older logs kept no id: trust them)
          (e.rids || []).filter(x => !ids.has(x.id) && x.rm > 0).forEach(x => add(day, cat, x.label || e.label, x.rm));
        } else if (e.status === "other" && e.rm > 0) add(day, cat, e.label, e.rm);
        if (e.status === "planned") {
          const id = o.plan[day] && o.plan[day][slot];
          const m = id && o.mealById ? o.mealById(id) : null;
          // at the price it had when it was ticked (older logs: today's price)
          if (m && m.source === "buy" && o.mealPrice) add(day, "meal", m.name, e.rm !== undefined ? e.rm : o.mealPrice(m));
        }
      });
    });
    if (o.log.groceries) {
      // Linked grocery receipts are the groceries. One dated on shopping day (the day before the plan)
      // falls outside these 7 days, so its grocery lines are added on day 1.
      const linked = spends.filter(sp => (o.log.groceryRids || []).includes(sp.id));
      if (linked.length) {
        linked.filter(sp => !keys.includes(sp.date)).forEach(sp => {
          const g = rw2(sp.items.filter(it => it.category === "groceries").reduce((s, it) => s + it.rm, 0));
          if (g) add(0, "groceries", sp.store ? `Groceries (${sp.store})` : "Groceries", g);
        });
      } else if (!inWin.some(sp => sp.items.some(it => it.category === "groceries"))) {
        // Ticked with no receipt linked: the receipt-derived amount from an older log, else the list's estimate.
        // (A grocery receipt saved in these days without linking is taken to be that shop: never both.)
        if (o.log.groceryRm !== undefined) { if (o.log.groceryRm > 0) add(0, "groceries", "Groceries", o.log.groceryRm); }
        else if (ev.grocery > 0) { add(0, "groceries", "Groceries (from your plan's list)", ev.grocery); estimatedGroceries = ev.grocery; }
      }
    }
  }
  const total = rw2(days.reduce((s, d) => s + d.rm, 0));
  Object.keys(byCat).forEach(c => { byCat[c] = rw2(byCat[c]); });
  days.forEach(d => { d.rm = rw2(d.rm); });
  const list = Object.values(items).map(x => ({ ...x, rm: rw2(x.rm) })).filter(x => Math.abs(x.rm) > 0.001).sort((a, b) => b.rm - a.rm);
  const plannedOutlay = o.plan ? RW_P.evaluate(o.plan, o.have || {}).outlay : null;
  const budget = Number(o.budget) || null;
  return { from, to, days, total, byCat, items: list, receipts, estimatedGroceries: rw2(estimatedGroceries), planned: plannedOutlay, budget,
    overBudget: budget ? rw2(total - budget) : null, tips: realWeekTips({ total, byCat, list, budget, days }) };
}

// Plain, numbers-first observations; only the ones the data supports
// What the linked grocery receipts add up to (grocery lines only)
function linkedGroceryRm(spends, rids) {
  return rw2((spends || []).filter(sp => (rids || []).includes(sp.id)).reduce((s, sp) => s + sp.items.filter(it => it.category === "groceries").reduce((a, it) => a + it.rm, 0), 0));
}

function realWeekTips({ total, byCat, list, budget, days }) {
  const tips = [];
  if (!total) return tips;
  const drinks = byCat.drink + byCat.snack;
  if (drinks >= 8 && drinks / total >= 0.12) {
    tips.push(`Drinks and snacks were RM ${drinks.toFixed(2)}, ${Math.round((drinks / total) * 100)}% of the week. Water from your bottle instead of half of them is about RM ${(drinks / 2).toFixed(0)} a week.`);
  }
  if (byCat.fees >= 3) tips.push(`RM ${byCat.fees.toFixed(2)} went on delivery fees, service charges and tax: none of it is food.`);
  const top = list.find(x => x.n >= 3 && x.cat !== "groceries");
  if (top) tips.push(`${top.label} came up ${top.n} times (RM ${top.rm.toFixed(2)}). It's your most regular buy, so its price matters most: worth adding to My prices.`);
  if (budget && total > budget) {
    tips.push(`RM ${(total - budget).toFixed(2)} over your RM ${Math.round(budget)} budget.`);
  } else if (budget) {
    const spentDays = days.filter(d => d.rm > 0).length;
    if (spentDays && spentDays < 7) tips.push(`RM ${(budget - total).toFixed(2)} of your budget left for the rest of the week.`);
  }
  if (byCat.groceries > 0 && byCat.meal > 0) {
    tips.push(`Groceries were ${Math.round((byCat.groceries / total) * 100)}% of what you spent; bought meals ${Math.round((byCat.meal / total) * 100)}%.`);
  }
  return tips.slice(0, 4);
}

if (typeof module !== "undefined") module.exports = { realWeek, realWeekTips, linkedGroceryRm, RW_CATS, RW_CAT_NAMES };
