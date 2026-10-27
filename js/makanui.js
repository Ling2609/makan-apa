// =============================================================
// makanui.js — Makan Apa? screens: Home, Pick for me, Eating with friends, Learn (goals, swaps,
// pairings, cooking, unsung heroes, "Which has more?", Plate check).
// The maths lives in makan.js and the sourced facts in knowledge.js; this is the interface.
// app.js passes `ui` (its helpers and state) to render().
// =============================================================
/* global KEYS, storeGet, storeSet, MEALS, mealById, mealStats, VENUES, ALLERGENS, allergenName, healthyPlate, FV_TARGET_G, SOURCES,
   KNOWLEDGE, SWAPDATA, MK_SLOT_NAME, HOME_ITEMS, mkSlotForHour, pick, validateAte, logAte, weekState, mealBudgetFor, groupPick,
   quizQuestions, plateCheck, keyOf, ingShort, planDay, validateLog, record, summary, toKey, addDays, PLAN_SLOTS, defaultProfile, validateHistory, evaluate */
const MA_ROUTES = ["home", "collection", "pick", "friends", "learn", "goals", "goal", "swaps", "pairs", "cook", "heroes", "quiz", "plate"];

const MA_UI = (function () {
  "use strict";
  let ui = null;
  const $ = sel => ui.view.querySelector(sel);
  const $$ = sel => [...ui.view.querySelectorAll(sel)];
  const query = () => new URLSearchParams((location.hash.split("?")[1] || ""));
  const todayKey = () => keyOf(new Date());
  const LEVEL = {
    strong: { label: "Strong evidence", cls: "ev-strong", tip: "A guideline, systematic review or official food table" },
    some: { label: "Some evidence", cls: "ev-some", tip: "At least one human study" },
    lab: { label: "Lab only", cls: "ev-lab", tip: "Lab or animal study: not tested in people" },
    myth: { label: "Myth", cls: "ev-myth", tip: "Tested and not supported, or no evidence" }
  };
  const badge = level => { const l = LEVEL[level] || LEVEL.some; return `<span class="ev ${l.cls}" title="${l.tip}">${ui.esc(l.label)}</span>`; };
  const srcLink = ev => ev && ev.url ? `<a class="src" href="${ui.esc(ev.url)}" target="_blank" rel="noopener">${ui.esc(shorten(ev.source || "Source"))}</a>` : ev && ev.source ? `<span class="src">${ui.esc(shorten(ev.source))}</span>` : "";
  const shorten = s => (s.length > 90 ? s.slice(0, 88).replace(/[ ,;]+[^ ]*$/, "") + "…" : s);
  const evLine = ev => ev ? `<p class="ev-line">${badge(ev.level)} ${srcLink(ev)}</p>` : "";
  const backTo = (href, label) => `<a class="btn btn-ghost back-link" href="${href}">${ui.icon("back")} ${label}</a>`;

  // ---------- stored choices ----------
  function loadPrefs() {
    const raw = storeGet(KEYS.picks, null) || {};
    const ids = a => (Array.isArray(a) ? a.filter(id => typeof id === "string" && mealById(id)) : []);
    const have = {};
    if (raw.have && typeof raw.have === "object") HOME_ITEMS.forEach(id => { if (raw.have[id] === true) have[id] = true; });
    const opts = raw.opts && typeof raw.opts === "object" ? raw.opts : {};
    return {
      never: ids(raw.never),
      notNow: raw.notNow && raw.notNow.date === todayKey() ? ids(raw.notNow.ids) : [],
      have,
      opts: { time: ["5", "15", "30", "any"].includes(String(opts.time)) ? String(opts.time) : "any", mode: ["any", "buy", "cook"].includes(opts.mode) ? opts.mode : "any",
        mood: ["any", "light", "filling"].includes(opts.mood) ? opts.mood : "any" },
      guideDone: raw.guideDone === true
    };
  }
  function savePrefs(p) {
    storeSet(KEYS.picks, { never: p.never, notNow: { date: todayKey(), ids: p.notNow }, have: p.have, opts: p.opts, guideDone: p.guideDone });
  }
  const loadAte = () => validateAte(storeGet(KEYS.ate, null));

  // ---------- the day so far: from the running plan's check-in if there is one, else from the "ate" log ----------
  function planToday() {
    const p = ui.loadPlan();
    if (!p || !p.started) return null;
    const idx = planDay(p.start, new Date());
    if (idx < 0 || idx > 6) return null;
    return { p, idx, log: validateLog(storeGet(KEYS.checkin, null)) };
  }
  const mealByName = name => MEALS.find(m => m.name === name) || null;
  const round2 = n => Math.round(n * 100) / 100;
  // Money a weekly plan's check-in spent on the dates from..to (both "YYYY-MM-DD"): meals bought or eaten
  // instead, plus the groceries if the shop fell in that range. Used for weeks a running plan doesn't cover.
  function checkinSpend(plan, start, log, from, to) {
    let sum = 0;
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, d);
      if (date < from || date > to) continue;
      PLAN_SLOTS.forEach(s => {
        const e = log.days[String(d)] && log.days[String(d)][s];
        if (!e) return;
        if (e.status === "other") sum += e.rm || 0;
        else if (e.status === "planned") { const m = plan[d] && mealById(plan[d][s]); if (m && m.source === "buy") sum += e.rm !== undefined ? e.rm : mealStats(m).rm; }
      });
    }
    const shop = addDays(start, -1);
    if (log.groceries && ((shop >= from && shop <= to) || (start >= from && start <= to))) sum += log.groceryRm !== undefined ? log.groceryRm : evaluate(plan, {}).grocery;
    return sum;
  }
  // Everything spent from..to: meals logged with Pick for me, past plans' check-ins (a plan remade mid-week),
  // and the current plan's check-in unless it's counted separately
  function spendIn(from, to, skipCurrent) {
    let sum = 0;
    loadAte().forEach(e => { if (e.date >= from && e.date <= to) sum += e.rm || 0; });
    validateHistory(storeGet(KEYS.history, null)).forEach(h => { sum += checkinSpend(h.plan, h.start, validateLog(h.log), from, to); });
    if (!skipCurrent) {
      const p = ui.loadPlan();
      if (p && p.started) sum += checkinSpend(p.plan, p.start, validateLog(storeGet(KEYS.checkin, null)), from, to);
    }
    return round2(sum);
  }
  function dayState() {
    const prof = ui.profile();
    const now = new Date();
    const pt = planToday();
    if (!pt) {
      const ate = loadAte();
      const ws = weekState(prof, ate, now);
      const entries = ate.filter(e => e.date === todayKey());
      const spent = spendIn(ws.weekStart, todayKey(), false);
      return { mode: "log", ...ws, spent, weekLeft: round2(prof.budget - spent), fromPlan: round2(spent - ws.spent) > 0, entries, ate };
    }
    const { p, idx, log } = pt;
    const sm = summary(p.plan, log, idx, ui.loadHave());
    const day = log.days[String(idx)] || {};
    const entries = [];
    PLAN_SLOTS.forEach(s => {
      const e = day[s];
      if (!e || e.status === "skipped") return;
      const meal = e.status === "planned" ? mealById(p.plan[idx][s]) : mealByName(e.label);
      if (e.status === "planned" && !meal) return; // a tick on a slot the plan no longer has
      entries.push({ date: todayKey(), slot: s, mealId: meal ? meal.id : undefined, label: e.status === "planned" ? meal.name : e.label, rm: e.status === "planned" ? (e.rm !== undefined ? e.rm : mealStats(meal).rm) : e.rm || 0 });
    });
    const today = { fv: 0, salty: 0, sugary: 0, rm: 0, ids: [] };
    entries.forEach(e => { const m = e.mealId && mealById(e.mealId); if (!m) return; const st = mealStats(m); today.fv += st.fv; if (st.salty) today.salty++; if (st.sugary) today.sugary++; today.ids.push(m.id); });
    const ate = loadAte();
    const ws = weekState(prof, ate, now);
    // Also meals logged with Pick for me in this plan week before the plan took over (e.g. earlier on a start-today day)
    const spent = round2(sm.cashOut + spendIn(p.start, todayKey(), true));
    return { mode: "plan", plan: p, idx, log, entries, today, recent: ws.recent, spent, weekLeft: round2(prof.budget - spent), daysLeft: 7 - idx };
  }
  function saveEaten(st, slot, meal, cost, label) {
    if (st.mode === "plan") {
      const planned = st.plan.plan[st.idx][slot];
      const entry = meal && planned === meal.id ? { status: "planned", rm: mealStats(meal).rm } : { status: "other", rm: meal ? cost.toBuy : cost, label: meal ? meal.name : label };
      storeSet(KEYS.checkin, record(st.log, st.idx, slot, entry));
      return;
    }
    const entry = { date: todayKey(), slot, rm: meal ? cost.total : cost, label: meal ? meal.name : label, at: Date.now() };
    if (meal) entry.mealId = meal.id;
    storeSet(KEYS.ate, logAte(loadAte(), entry));
  }
  function undoEaten(st, slot) {
    if (st.mode === "plan") { storeSet(KEYS.checkin, record(validateLog(storeGet(KEYS.checkin, null)), st.idx, slot, null)); return; }
    storeSet(KEYS.ate, loadAte().filter(e => !(e.date === todayKey() && e.slot === slot)));
  }

  // The meal to offer on Home: now, or the next one not logged yet today
  function nextSlot(eaten) {
    const order = ["B", "L", "D", "S"].filter(s => s !== "B" || ui.profile().breakfast !== false);
    const now = currentSlot();
    const from = Math.max(0, order.indexOf(now));
    return order.slice(from).find(s => !eaten.includes(s)) || now;
  }
  function currentSlot() {
    const s = mkSlotForHour(new Date().getHours());
    const prof = ui.profile();
    return s === "B" && prof.breakfast === false ? "L" : s;
  }
  const slotWord = s => MK_SLOT_NAME[s].toLowerCase().replace("snack or supper", "a snack");

  // =============================================================
  // HOME
  // =============================================================
  function renderHome() {
    const prof = ui.profile();
    const st = dayState();
    const prefs = loadPrefs();
    const eatenSlots = st.entries.map(e => e.slot);
    const slot = nextSlot(eatenSlots);
    const fv = Math.round(st.today.fv || 0);
    const fvPct = Math.min(100, (fv / FV_TARGET_G) * 100);
    const left = st.weekLeft;
    const leftPct = Math.max(0, Math.min(100, (left / prof.budget) * 100));
    const heroI = heroIndex();
    const hero = KNOWLEDGE.heroes[heroI];
    const planNext = st.mode === "plan" ? ["B", "L", "D"].find(s => !eatenSlots.includes(s) && st.plan.plan[st.idx][s]) : null;
    const guide = typeof MakanTour === "undefined" && !prefs.guideDone && st.mode !== "plan" && !loadAte().length && !st.entries.length;
    const slots = ["B", "L", "D", "S"].filter(s => s !== "B" || prof.breakfast !== false);
    ui.view.innerHTML = `<div class="page home">
      <section class="home-hero">
        <p class="eyebrow">${new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "short" })}</p>
        <div class="home-hero-copy"><span class="menu-kicker">YOUR DAILY FOOD COMPANION</span><h1>What’s on<br><em>your plate?</em></h1>
        <p class="lead">One good meal, matched to your budget and food rules.</p>
        <a class="btn btn-hero" href="#pick?slot=${slot}" id="pick-now">${ui.icon("plate")} Pick my ${slotWord(slot)}</a>
        <div class="home-alt">
          <a class="btn btn-quiet" href="#friends">${ui.icon("users")} With friends</a>
          <a class="btn btn-quiet" href="#plan">${ui.icon("calendar")} Plan my week</a>
        </div><p class="home-footnote">${ui.icon("check")} Your rules. Your budget. Always.</p></div>
        <div class="home-food-scene" aria-hidden="true"><img src="assets/food/kopitiam-hero.png" alt="" width="1536" height="1024"><span class="food-sticker">makan<br><strong>time!</strong></span><span class="scene-label">A little local flavour</span></div>
      </section>
      ${guide ? `<section class="card guide" aria-labelledby="guide-h">
        <h2 id="guide-h" class="card-title">${ui.icon("info")} How it works</h2>
        <ol class="guide-steps">
          <li><strong>Tap “Pick my ${slotWord(slot)}”.</strong> One meal, and why it fits.</li>
          <li><strong>Not feeling it?</strong> “Not this” tells it why: too pricey, not in the mood…</li>
          <li><strong>“I'll eat this”</strong> logs it, so the next pick fits the rest of your day.</li>
        </ol>
        <button type="button" class="btn btn-ghost" id="guide-done">${ui.icon("check")} Got it</button>
      </section>` : ""}
      ${guide ? "" : `<section class="card today-card" aria-labelledby="today-h">
        <div class="card-head"><h2 id="today-h" class="card-title">Today</h2>${st.mode === "plan" ? `<a class="btn btn-ghost" href="#today">${ui.icon("today")} Plan check-in</a>` : ""}</div>
        <ul class="slot-pills">${slots.map(s => {
          const e = st.entries.find(x => x.slot === s);
          const m = e && e.mealId && mealById(e.mealId);
          const name = MK_SLOT_NAME[s].replace("Snack or supper", "Snack");
          return `<li><button type="button" class="slot-pill ${e ? "eaten" : ""}" data-slot-pill="${s}">
            <span class="sp-name">${name}</span>
            ${e ? `<span class="sp-what">${ui.esc(e.label)}</span><span class="sp-rm num">${e.rm > 0 || !m || m.source === "buy" ? ui.rm(e.rm) : "groceries"}</span>`
              : `<span class="sp-what muted">${ui.icon("plus")} Log</span>`}
            <span class="sr-only">${e ? ", tap to change" : `: log ${name.toLowerCase()}`}</span></button></li>`;
        }).join("")}</ul>
        <div class="gauges">
          <div class="gauge"><div class="gauge-head"><span>${ui.icon("wallet")} Left this week</span><span class="num ${left < 0 ? "bad" : ""}">${ui.rm(left)}</span></div>
            <div class="meter ${left < 0 ? "over" : ""}" role="img" aria-label="${ui.rm(left)} left of ${ui.rm0(prof.budget)}"><span style="width:${leftPct}%"></span></div></div>
          <div class="gauge"><div class="gauge-head"><span>${ui.icon("leaf")} Fruit &amp; veg</span><span class="num">${fv} / ${FV_TARGET_G} g</span></div>
            <div class="meter leaf" role="img" aria-label="${fv} of ${FV_TARGET_G} grams today"><span style="width:${fvPct}%"></span></div></div>
        </div>
        <p class="tiny muted gauge-note">${ui.rm0(prof.budget)} a week, ${st.mode === "plan" ? "from your plan's check-in" : st.fromPlan ? "from meals you logged and your plan's check-in since Monday" : "from meals you logged since Monday"}. Fruit and veg: WHO suggests at least ${FV_TARGET_G} g a day${sourceA("WHO_D")}.</p>
        ${planNext ? `<p class="small plan-next">${ui.icon("calendar")} Your plan says ${slotWord(planNext)}: <strong>${ui.esc(mealById(st.plan.plan[st.idx][planNext]).name)}</strong>.</p>` : ""}
      </section>`}
      <section class="home-quick-menu" aria-labelledby="quick-menu-title"><div class="quick-menu-label"><p class="eyebrow">LET’S MAKE IT EASY</p><h2 id="quick-menu-title">Make it<br><em>your kind.</em></h2></div><button type="button" class="quick-mood" data-quick-mood="quick"><span class="mood-icon">${ui.icon("bolt")}</span><strong>Between classes.</strong><small>15 minutes or less</small><span class="mood-arrow" aria-hidden="true">↗</span></button><button type="button" class="quick-mood" data-quick-mood="light"><span class="mood-icon">${ui.icon("leaf")}</span><strong>Keep it light.</strong><small>A lighter meal mood</small><span class="mood-arrow" aria-hidden="true">↗</span></button><button type="button" class="quick-mood" data-quick-mood="cook"><span class="mood-icon">${ui.icon("pot")}</span><strong>Made by me.</strong><small>Cook or kettle options</small><span class="mood-arrow" aria-hidden="true">↗</span></button></section>
      <section class="home-discover card"><div><p class="eyebrow">THE EVERYDAY MENU</p><h2>Keep your favourites close.</h2><p class="muted small">Browse meals that fit your food rules, or return to something you love.</p></div><div class="btn-row"><a class="btn btn-quiet" href="#collection">${ui.icon("plate")} Explore meals</a><a class="btn btn-ghost" href="#collection?saved=1">${ui.icon("star")} Saved meals</a></div></section>
      ${guide ? "" : `<a class="fact-teaser" href="#heroes?i=${heroI}"><span class="ft-label">${ui.icon("star")} Did you know?</span>
        <span class="ft-text"><strong>${ui.esc(hero.name)}${hero.zh ? ` ${ui.esc(hero.zh)}` : ""}:</strong> ${ui.esc(firstSentence(hero.fact))}</span>${ui.icon("arrow")}</a>`}
    </div>`;
    $$("[data-quick-mood]").forEach(b => b.addEventListener("click", () => {
      const p = loadPrefs();
      p.opts = { time: "any", mode: "any", mood: "any" };
      if (b.dataset.quickMood === "quick") p.opts.time = "15";
      if (b.dataset.quickMood === "light") p.opts.mood = "light";
      if (b.dataset.quickMood === "cook") p.opts.mode = "cook";
      savePrefs(p); location.hash = `pick?slot=${slot}`;
    }));
    const g = $("#guide-done");
    if (g) g.addEventListener("click", () => { const p = loadPrefs(); p.guideDone = true; savePrefs(p); renderHome(); const b = $("#pick-now"); if (b) b.focus(); ui.say("Guide hidden"); });
    $$("[data-slot-pill]").forEach(b => b.addEventListener("click", () => {
      const s = b.dataset.slotPill;
      const e = st.entries.find(x => x.slot === s);
      if (e) openLogged(s, e); else openLog(s);
    }));
  }
  function heroIndex() {
    const prof = ui.profile();
    const start = [...todayKey()].reduce((a, c) => a + c.charCodeAt(0), 0);
    for (let k = 0; k < KNOWLEDGE.heroes.length; k++) {
      const i = (start + k) % KNOWLEDGE.heroes.length;
      if (!prof || !namedAllergens(KNOWLEDGE.heroes[i].name).some(a => prof.diet.allergies.includes(a))) return i;
    }
    return start % KNOWLEDGE.heroes.length;
  }
  const firstSentence = t => { const m = /^(.+?[.!?])(\s|$)/.exec(t); return m ? m[1] : t; };
  // A logged meal: see it, change it or remove it
  function openLogged(slot, e) {
    ui.openSheet(MK_SLOT_NAME[slot].replace("Snack or supper", "Snack"), `
      <p><strong>${ui.esc(e.label)}</strong> · <span class="num">${ui.rm(e.rm)}</span></p>
      <div class="sheet-actions"><button type="button" class="btn btn-quiet" id="lg-change">${ui.icon("swap")} Change it</button>
        <button type="button" class="btn btn-quiet" id="lg-remove">${ui.icon("trash")} Remove</button></div>`, root => {
      root.querySelector("#lg-change").addEventListener("click", () => { ui.closeSheet(); openLog(slot); });
      root.querySelector("#lg-remove").addEventListener("click", () => { undoEaten(dayState(), slot); ui.closeSheet(); ui.rerender(); ui.say("Removed"); });
    });
  }
  const sourceA = key => SOURCES[key] ? ` · <a class="src" href="${SOURCES[key].url}" target="_blank" rel="noopener">source</a>` : "";
  function dietLine(p) {
    const bits = [];
    if (p.diet.halal) bits.push("halal");
    if (p.diet.vegetarian) bits.push("vegetarian");
    if (p.diet.noBeef) bits.push("no beef");
    if (p.diet.allergies.length) bits.push("no " + p.diet.allergies.map(allergenName).map(s => s.toLowerCase()).join(", "));
    return bits.length ? bits.join(", ") : "no food rules";
  }

  // Log something that wasn't a pick
  function openLog(slot) {
    const prof = ui.profile();
    const common = MEALS.filter(m => m.slots.includes(slot) && m.id !== "skip" && !m.slots.includes("X") && !m.occasion && ui.fitsAll(m) && (!m.rahmah || prof.rahmah))
      .sort((a, b) => mealStats(a).rm - mealStats(b).rm);
    ui.openSheet(`What did you have for ${MK_SLOT_NAME[slot].toLowerCase()}?`, `
      <label class="field-label" for="log-search">${ui.icon("search")} Find a meal</label>
      <input id="log-search" class="text-input" type="search" placeholder="e.g. nasi lemak" autocomplete="off">
      <ul class="pick-list" id="log-list">${common.map(m => `<li data-name="${ui.esc(m.name.toLowerCase())}"><button type="button" class="btn btn-quiet pick" data-meal="${m.id}"><span class="pick-name">${ui.esc(m.name)}</span><span class="num pick-price">${ui.rm(mealStats(m).rm)}</span></button></li>`).join("")}</ul>
      <form id="log-form" class="other-form" novalidate>
        <h3 class="sheet-sub">Not in the list? Type it</h3>
        <label class="field-label" for="log-name">What was it?</label>
        <input id="log-name" class="text-input" type="text" maxlength="80" placeholder="e.g. Mee rebus">
        <label class="field-label" for="log-rm">How much did it cost?</label>
        <span class="money-input"><span>RM</span><input id="log-rm" type="number" inputmode="decimal" min="0" max="500" step="0.1"></span>
        <div id="log-error" role="alert"></div>
        <div class="sheet-actions"><button class="btn" type="submit">${ui.icon("check")} Save</button></div>
      </form>`, root => {
      const st = dayState();
      root.querySelector("#log-search").addEventListener("input", e => {
        const q = e.target.value.trim().toLowerCase();
        root.querySelectorAll("#log-list li").forEach(li => { li.hidden = q && !li.dataset.name.includes(q); });
      });
      root.querySelectorAll("button.pick").forEach(b => b.addEventListener("click", () => {
        const m = mealById(b.dataset.meal);
        const c = { total: mealStats(m).rm, toBuy: mealStats(m).rm };
        saveEaten(st, slot, m, c);
        ui.closeSheet(); ui.rerender(); ui.say(`Logged ${m.name}`);
      }));
      root.querySelector("#log-form").addEventListener("submit", e => {
        e.preventDefault();
        const name = root.querySelector("#log-name").value.trim();
        const v = Number(root.querySelector("#log-rm").value);
        if (!name || !Number.isFinite(v) || v < 0 || v > 500 || root.querySelector("#log-rm").value === "") {
          ui.showError(root.querySelector("#log-error"), "Type what it was and what it cost (RM 0 to RM 500).", root.querySelector("#log-form"));
          return;
        }
        saveEaten(st, slot, null, Math.round(v * 100) / 100, name.slice(0, 80));
        ui.closeSheet(); ui.rerender(); ui.say(`Logged ${name}`);
      });
    });
  }

  // =============================================================
  // PICK FOR ME
  // =============================================================
  let session = { slot: null, seed: 0, notNow: [], maxRm: undefined, haveOnly: false, logged: null, showNot: false, packed: false, adjustOpen: false, note: "" };
  function contextFor(slot) {
    const prof = ui.profile();
    const st = dayState();
    const prefs = loadPrefs();
    const opts = { ...prefs.opts, maxRm: session.maxRm, haveOnly: session.haveOnly, surprise: session.seed > 0 };
    const weekday = new Date().getDay() >= 1 && new Date().getDay() <= 5;
    // Weekday lunch on campus: you can only cook if you packed it
    if (slot === "L" && weekday && prof.campusLunch && opts.mode === "any" && !session.packed) opts.campus = true;
    return {
      st, prefs,
      ctx: {
        profile: prof, slot, today: st.today, recent: st.recent, weekLeft: st.weekLeft, daysLeft: st.daysLeft, have: prefs.have,
        prefs: { never: prefs.never, notNow: prefs.notNow.concat(session.notNow) },
        opts: opts.campus ? { ...opts, mode: "buy" } : opts,
        seed: `${todayKey()}-${slot}-${session.seed}`,
        mealBudget: mealBudgetFor(prof.budget, slot, prof.breakfast !== false)
      },
      campus: !!opts.campus
    };
  }
  function chip(group, value, label, cur) {
    return `<label class="chip"><input type="radio" name="${group}" value="${value}" ${String(cur) === String(value) ? "checked" : ""}><span>${label}</span></label>`;
  }
  function renderPick() {
    const prof = ui.profile();
    const q = query();
    const slot = ["B", "L", "D", "S"].includes(q.get("slot")) ? q.get("slot") : (session.slot || currentSlot());
    if (session.slot !== slot) session = { slot, seed: 0, notNow: [], maxRm: undefined, haveOnly: false, logged: null, showNot: false, packed: false, adjustOpen: false, note: "" };
    const { st, prefs, ctx, campus } = contextFor(slot);
    const res = pick(ctx);
    const already = st.entries.find(e => e.slot === slot);
    const haveN = Object.keys(prefs.have).length;
    ui.view.innerHTML = `<div class="page narrow pick-page">
      <div class="pick-intro"><p class="eyebrow">THE DECISION IS SERVED</p><h1>${MK_SLOT_NAME[slot].replace("Snack or supper", "Snack")} pick</h1><p class="muted small">One good option. All the reasons.</p></div>
      <form class="pick-opts" id="pick-opts" aria-label="What fits right now">
        <fieldset class="chips slot-chips"><legend class="sr-only">Meal</legend>${["B", "L", "D", "S"].map(s => chip("slot", s, MK_SLOT_NAME[s].replace("Snack or supper", "Snack"), slot)).join("")}</fieldset>
      </form>
      ${already && !session.logged ? `<div class="banner">${ui.icon("info")}<p>You logged ${ui.esc(already.label)} for ${MK_SLOT_NAME[slot].toLowerCase()}. Picking again replaces it.</p></div>` : ""}
      ${session.note ? `<div class="banner" id="pick-note" role="status">${ui.icon("info")}<p>${ui.esc(session.note)}</p></div>` : ""}
      <div id="pick-out" aria-live="polite">${session.logged ? loggedHtml(session.logged) : res.pick ? pickHtml(res, ctx) : noneHtml(res, campus)}</div>
    </div>`;
    session.note = "";
    wirePick(slot, res, ctx, st);
  }
  function optSummary(prefs, haveN, campus) {
    const t = prefs.opts.time === "any" ? "any time" : `${prefs.opts.time} min`;
    const m = campus ? "buy (on campus)" : { any: "buy or cook", buy: "buy", cook: "cook" }[prefs.opts.mode];
    const f = { any: "anything", light: "light", filling: "filling" }[prefs.opts.mood];
    return ui.esc(`${t} · ${m} · ${f}${haveN ? ` · ${haveN} at home` : ""}`);
  }
  function costLine(c) {
    const m = c.meal;
    if (m.source === "buy") return `<span class="pc-price num">${ui.rm(c.cost.toBuy)}</span>`;
    return `<span class="pc-price num">${ui.rm(c.cost.toBuy)} <small>${c.cost.haveIds.length ? `to buy (${ui.rm(c.cost.total)} with what you have)` : "of ingredients"}</small></span>`;
  }
  // One line icon per way of eating (no decorative emoji): buy, cook, or kettle/no cooking
  const mealIcon = m => ui.icon(m.source === "buy" ? "store" : m.source === "cook" ? "pot" : "kettle");
  const whereLine = m => m.source === "buy" ? (VENUES[m.venue] || "Buy") : m.source === "cook" ? "Cook" : "Kettle or no cooking";
  function allergyLine(c) {
    const a = c.allergens;
    if (!a.contains.length && !a.may.length) return `<p class="tiny muted allergen-line">Usual recipe: none of the ${ALLERGENS.length} common allergens.</p>`;
    const parts = [];
    if (a.contains.length) parts.push(`contains <strong>${a.contains.map(allergenName).join(", ").toLowerCase()}</strong>`);
    if (a.may.length) parts.push(`often also ${a.may.map(allergenName).join(", ").toLowerCase()}`);
    return `<p class="tiny muted allergen-line">${ui.icon("alert")}<span>Usual recipe ${parts.join("; ")}.${c.meal.source === "buy" ? " Stall food has no label: ask the seller." : ""}</span></p>`;
  }
  function tipHtml(c) {
    const T = tipTexts();
    const id = c.tips.find(t => T[t]);
    if (!id) return "";
    const t = T[id];
    return `<div class="tip">${ui.icon("bolt")}<div><p><strong>${ui.esc(t.title)}</strong> ${ui.esc(t.text)}</p>${evLine(t.evidence)}</div></div>`;
  }
  function pickHtml(res, ctx) {
    const c = res.pick;
    const m = c.meal;
    return `<article class="pick-card" aria-labelledby="pc-name">
        <div class="meal-showcase"><span class="menu-kicker">PICKED FOR YOUR DAY</span>${FoodArt.plate(m)}<span class="illustration-note">Meal illustration</span><span class="showcase-star" aria-hidden="true">✳</span></div>
        <div class="pick-card-content"><div class="pc-top"><span class="pc-emoji" aria-hidden="true">${mealIcon(m)}</span>
          <div class="pc-head"><p class="pc-where">${ui.esc(whereLine(m))} · ${m.min <= 5 ? "about 5 min" : `about ${m.min} min`}</p>
            <h2 id="pc-name">${ui.esc(m.name)}</h2><div class="pc-priceline">${costLine(c)}${m.steps ? `<button type="button" class="btn btn-ghost inline how" id="how-to">${ui.icon("pot")} How to make it</button>` : ""}</div></div></div>
        <ul class="reasons">${c.reasons.slice(0, 3).map(r => `<li class="${r.warn ? "warn" : ""}">${ui.icon(r.warn ? "alert" : "check")}<span>${ui.esc(r.text)}</span></li>`).join("")}</ul>
        ${allergyLine(c)}
        <div class="pc-actions">
          <button type="button" class="btn" id="eat-this">${ui.icon("check")} I'll eat this</button>
          <button type="button" class="btn btn-ghost" id="save-pick" aria-pressed="${savedMeals().includes(m.id)}">${ui.icon("star")} ${savedMeals().includes(m.id) ? "Saved" : "Save meal"}</button>
          <button type="button" class="btn btn-quiet" id="not-this" aria-expanded="${session.showNot}">${ui.icon("x")} Not this</button>
        </div>
        <div class="not-why" id="not-why" ${session.showNot ? "" : "hidden"}>
          <p class="small"><strong>Why not?</strong> The next pick takes it into account.</p>
          <div class="btn-row">
            <button type="button" class="btn btn-quiet" data-not="price">${ui.icon("wallet")} Too pricey</button>
            <button type="button" class="btn btn-quiet" data-not="mood">${ui.icon("refresh")} Not in the mood</button>
            ${m.source !== "buy" ? `<button type="button" class="btn btn-quiet" data-not="have">${ui.icon("fridge")} Don't have the stuff</button>` : ""}
            <button type="button" class="btn btn-quiet" data-not="never">${ui.icon("lock")} Never suggest this</button>
          </div>
        </div>
      </div></article>
      ${res.backups.length ? `<section class="backups" aria-labelledby="bk-h"><h2 id="bk-h" class="section-title small-title">Or</h2>
        <ul class="backup-list">${res.backups.map((b, i) => `<li><button type="button" class="backup" data-backup="${i}">
          <span class="bk-emoji" aria-hidden="true">${mealIcon(b.meal)}</span><span class="bk-main"><span class="bk-name">${ui.esc(b.meal.name)}</span>
          <span class="bk-meta">${ui.esc(b.meal.source === "buy" ? "Buy" : b.meal.source === "cook" ? "Cook" : "No cooking")} · ${b.meal.min} min · <span class="num">${ui.rm(b.cost.toBuy)}</span></span></span></button></li>`).join("")}</ul>
      </section>` : ""}
      ${toolsRow(res.count)}`;
  }
  // Under every pick: change what fits (in a panel, so the page stays one screen) and Surprise me
  function toolsRow(count) {
    const prefs = loadPrefs();
    const { campus } = contextFor(session.slot);
    return `<div class="pick-tools">
        <button type="button" class="btn btn-quiet" id="adjust-btn" aria-haspopup="dialog">${ui.icon("settings")} <span>Adjust<span class="adj-sum">: ${optSummary(prefs, Object.keys(prefs.have).length, campus)}</span></span></button>
        <button type="button" class="btn btn-quiet" id="surprise">${ui.icon("dice")} Surprise me</button>
      </div>
      ${campus ? `<p class="tiny muted campus-note">${ui.icon("school")}<span>Weekday lunch on campus, so these are things to buy. <button type="button" class="btn btn-ghost inline" id="packed">I packed lunch</button></span></p>` : ""}
      ${count !== undefined ? `<p class="tiny muted pick-count">${count} meal${count === 1 ? "" : "s"} fit right now.</p>` : ""}`;
  }
  function openAdjust() {
    const prof = ui.profile();
    const prefs = loadPrefs();
    const haveN = Object.keys(prefs.have).length;
    ui.openSheet("Adjust the pick", `<form id="adjust-form">
      <fieldset class="chips"><legend>Time I have</legend>${chip("time", "5", "5 min", prefs.opts.time)}${chip("time", "15", "15 min", prefs.opts.time)}${chip("time", "30", "30 min", prefs.opts.time)}${chip("time", "any", "Any", prefs.opts.time)}</fieldset>
      <fieldset class="chips"><legend>How</legend>${chip("mode", "any", "Either", prefs.opts.mode)}${chip("mode", "buy", "Buy", prefs.opts.mode)}${chip("mode", "cook", prof.kitchen === "hostel" ? "Make in my room" : "Cook", prefs.opts.mode)}</fieldset>
      <fieldset class="chips"><legend>Feel like</legend>${chip("mood", "any", "Anything", prefs.opts.mood)}${chip("mood", "light", "Something light", prefs.opts.mood)}${chip("mood", "filling", "Something filling", prefs.opts.mood)}</fieldset>
      <button type="button" class="btn btn-quiet athome-btn" id="have-btn">${ui.icon("fridge")} What's at home${haveN ? ` (${haveN} ticked)` : ""}</button>
      <div class="sheet-actions"><button type="submit" class="btn">${ui.icon("check")} Show my pick</button></div>
    </form>`, root => {
      const form = root.querySelector("#adjust-form");
      form.addEventListener("submit", e => {
        e.preventDefault();
        const p = loadPrefs();
        ["time", "mode", "mood"].forEach(k => { const v = form.querySelector(`input[name="${k}"]:checked`); if (v) p.opts[k] = v.value; });
        savePrefs(p);
        session.seed = 0; session.logged = null; session.showNot = false;
        ui.closeSheet(); rerenderKeep("#pick-out"); ui.say("Pick updated");
      });
      root.querySelector("#have-btn").addEventListener("click", () => { ui.closeSheet(); openHave(); });
      setTimeout(() => { const c = form.querySelector('input[name="time"]:checked'); if (c) c.focus(); }, 0);
    });
  }
  function noneHtml(res, campus) {
    return `<div class="banner warn">${ui.icon("alert")}<div><p>${ui.esc(res.why.text)}</p>
      <div class="banner-actions">
        ${res.why.key === "time" ? `<button type="button" class="btn btn-quiet" data-fix="time">Any time</button>` : ""}
        ${res.why.key === "mode" ? (campus ? `<button type="button" class="btn btn-quiet" data-fix="packed">I packed lunch</button>` : `<button type="button" class="btn btn-quiet" data-fix="mode">Buy or cook</button>`) : ""}
        ${res.why.key === "money" ? `<button type="button" class="btn btn-quiet" data-fix="money">Clear the price limit</button>` : ""}
        ${res.why.key === "mine" || res.why.key === "ingredients" ? `<button type="button" class="btn btn-quiet" data-fix="reset">Start this pick over</button>` : ""}
        <button type="button" class="btn btn-quiet" data-log-slot>${ui.icon("plus")} Log what I ate</button>
      </div></div></div>${toolsRow()}`;
  }
  function loggedHtml(l) {
    return `<div class="logged card">
      <p class="logged-title">${ui.icon("check")}<span><strong>Logged: ${ui.esc(l.name)}</strong> · <span class="num">${ui.rm(l.rm)}</span></span></p>
      <p class="small">${l.left !== null ? `${ui.rm(l.left)} left this week. ` : ""}Your next pick knows about it. Selamat makan!</p>
      ${l.tip || ""}
      <div class="btn-row"><a class="btn" href="#home">${ui.icon("home")} Back home</a><button type="button" class="btn btn-quiet" id="undo">${ui.icon("back")} Undo</button></div>
    </div>`;
  }
  function wirePick(slot, res, ctx, st) {
    // Changing the meal keeps focus on the chips (arrow keys move along the group)
    const slotForm = $("#pick-opts");
    if (!slotForm.dataset.wired) slotForm.dataset.wired = "1"; else return wireCard(slot, res, ctx, st);
    slotForm.addEventListener("change", e => {
      const t = e.target;
      if (t.name !== "slot") return;
      try { history.replaceState(null, "", `#pick?slot=${t.value}`); } catch (err) { location.hash = `pick?slot=${t.value}`; return; }
      rerenderKeep(`input[name="slot"][value="${t.value}"]`);
    });
    wireCard(slot, res, ctx, st);
  }
  function wireCard(slot, res, ctx, st) {
    const adjBtn = $("#adjust-btn");
    if (adjBtn) adjBtn.addEventListener("click", openAdjust);
    const packed = $("#packed");
    if (packed) packed.addEventListener("click", () => { session.packed = true; session.seed = 0; rerenderKeep("#pick-out"); ui.say("Including packed lunches you can make"); });
    const save = $("#save-pick");
    if (save) save.addEventListener("click", () => {
      const id = res.pick.meal.id, old = savedMeals(), wasSaved = old.includes(id);
      if (!storeSet(KEYS.saved, wasSaved ? old.filter(x => x !== id) : old.concat(id))) { ui.say("Could not save. Device storage may be full or blocked."); return; }
      save.setAttribute("aria-pressed", String(!wasSaved));
      save.innerHTML = `${ui.icon("star")} ${wasSaved ? "Save meal" : "Saved"}`;
      ui.say(wasSaved ? "Meal removed from saved" : "Meal saved");
    });
    const eat = $("#eat-this");
    if (eat) eat.addEventListener("click", () => logPick(res.pick, slot));
    const how = $("#how-to");
    if (how) how.addEventListener("click", () => ui.openSheet(`How to make ${res.pick.meal.short || res.pick.meal.name}`, `
      <ol class="steps">${res.pick.meal.steps.map(s => `<li>${ui.esc(s)}</li>`).join("")}</ol>
      ${res.pick.cost.needIds.length ? `<p class="small"><strong>To buy:</strong> ${res.pick.cost.needIds.map(ingShort).join(", ")}</p>` : `<p class="small">You have everything for this.</p>`}
      ${cookTipFor(res.pick.meal)}`));
    const not = $("#not-this");
    if (not) not.addEventListener("click", () => {
      session.showNot = !session.showNot;
      $("#not-why").hidden = !session.showNot;
      not.setAttribute("aria-expanded", String(session.showNot));
      if (session.showNot) $("#not-why button").focus();
    });
    $$("[data-not]").forEach(b => b.addEventListener("click", () => {
      const m = res.pick.meal, why = b.dataset.not;
      session.showNot = false;
      if (why === "price") {
        const cheaper = pick({ ...ctx, opts: { ...ctx.opts, maxRm: Math.max(0, res.pick.cost.toBuy - 0.01) } });
        if (!cheaper.pick) { session.note = `That's already the cheapest meal that fits right now (${ui.rm(res.pick.cost.toBuy)}). Tick what's at home under Adjust for cheaper home-made picks.`; rerenderKeep("#pick-note"); ui.say("Already the cheapest"); return; }
        session.maxRm = Math.max(0, res.pick.cost.toBuy - 0.01); session.notNow.push(m.id); ui.say(`Looking for something under ${ui.rm(res.pick.cost.toBuy)}`);
      }
      if (why === "mood") { const p = loadPrefs(); p.notNow = [...new Set(p.notNow.concat(m.id))]; savePrefs(p); ui.say("Not today. Here's another"); }
      if (why === "have") { session.haveOnly = Object.keys(loadPrefs().have).length > 0; session.notNow.push(m.id); ui.say(session.haveOnly ? "Only meals from what you have, or bought" : "Skipped. Tick what's at home for better picks"); if (!session.haveOnly) { rerenderKeep("#pick-out"); openHave(); return; } }
      if (why === "never") { const p = loadPrefs(); p.never = [...new Set(p.never.concat(m.id))]; savePrefs(p); ui.say(`${m.name} won't be suggested again. Undo under Setup`); }
      rerenderKeep("#pick-out");
    }));
    $$("[data-backup]").forEach(b => b.addEventListener("click", () => {
      const chosen = res.backups[Number(b.dataset.backup)];
      // the backup becomes the pick, with its own reasons
      $("#pick-out").innerHTML = pickHtml({ pick: chosen, backups: [res.pick].concat(res.backups.filter(x => x !== chosen)), count: res.count }, ctx);
      wirePick(slot, { ...res, pick: chosen, backups: [res.pick].concat(res.backups.filter(x => x !== chosen)) }, ctx, st);
      const h = $("#pc-name"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
    }));
    const sur = $("#surprise");
    if (sur) sur.addEventListener("click", () => { session.seed++; rerenderKeep("#pick-out"); ui.say("Here's a surprise pick"); });
    $$("[data-fix]").forEach(b => b.addEventListener("click", () => {
      const p = loadPrefs();
      if (b.dataset.fix === "time") p.opts.time = "any";
      if (b.dataset.fix === "mode") p.opts.mode = "any";
      if (b.dataset.fix === "money") session.maxRm = undefined;
      if (b.dataset.fix === "reset") { session.notNow = []; session.haveOnly = false; session.maxRm = undefined; p.notNow = []; }
      if (b.dataset.fix === "packed") session.packed = true;
      savePrefs(p);
      rerenderKeep("#pick-out");
    }));
    const lg = $("[data-log-slot]");
    if (lg) lg.addEventListener("click", () => openLog(slot));
    const undo = $("#undo");
    if (undo) undo.addEventListener("click", () => {
      const l = session.logged, st2 = dayState();
      if (l && l.prev && st2.mode === "plan" && l.mode === "plan") storeSet(KEYS.checkin, record(st2.log, st2.idx, slot, l.prev));
      else if (l && l.prev && l.mode === "log") storeSet(KEYS.ate, logAte(loadAte(), l.prev));
      else undoEaten(st2, slot);
      session.logged = null; rerenderKeep("#pick-out"); ui.say("Undone");
    });
  }
  function rerenderKeep(sel) {
    renderPick();
    const el = $(sel) || $("#pick-out");
    if (el) { if (!el.matches("input,button,a")) el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
  }
  function logPick(c, slot) {
    const st = dayState();
    // What was logged for this meal before, so Undo puts it back instead of leaving the meal empty
    const prev = st.mode === "plan" ? ((st.log.days[String(st.idx)] || {})[slot] || null) : (loadAte().find(e => e.date === todayKey() && e.slot === slot) || null);
    saveEaten(st, slot, c.meal, c.cost);
    const after = dayState();
    session.logged = { prev, mode: st.mode, name: c.meal.name, rm: st.mode === "plan" ? (st.plan.plan[st.idx][slot] === c.meal.id ? mealStats(c.meal).rm : c.cost.toBuy) : c.cost.total, left: after.weekLeft, tip: tipHtml(c) };
    rerenderKeep("#pick-out");
    ui.say(`Logged ${c.meal.name}`);
  }
  function openHave() {
    const p = loadPrefs();
    ui.openSheet("What's at home?", `
      <p class="small">Tick what you have. Picks use it first, and only count what you'd still need to buy.</p>
      <form id="have-form"><div class="have-grid">${HOME_ITEMS.map(id => `<label class="chip"><input type="checkbox" value="${id}" ${p.have[id] ? "checked" : ""}><span>${ui.esc(ingShort(id))}</span></label>`).join("")}</div>
      <div class="sheet-actions"><button class="btn" type="submit">${ui.icon("check")} Use these</button><button class="btn btn-quiet" type="button" id="have-clear">Clear all</button></div></form>`, root => {
      root.querySelector("#have-form").addEventListener("submit", e => {
        e.preventDefault();
        const q = loadPrefs();
        q.have = {};
        root.querySelectorAll("input:checked").forEach(i => { q.have[i.value] = true; });
        savePrefs(q);
        session.seed = 0;
        ui.closeSheet(); renderPick(); ui.say(`${Object.keys(q.have).length} things at home`);
      });
      root.querySelector("#have-clear").addEventListener("click", () => root.querySelectorAll("input").forEach(i => { i.checked = false; }));
    });
  }

  // Short tip texts drawn from the sourced knowledge (title + one sentence + evidence)
  let tipCache = null;
  function tipTexts() {
    if (tipCache) return tipCache;
    const P = KNOWLEDGE.pairings, C = KNOWLEDGE.cooking;
    const pair = (a, b) => P.find(x => x.a.toLowerCase().includes(a) && x.b.toLowerCase().includes(b));
    const cook = f => C.find(x => x.food.toLowerCase().includes(f));
    const T = {};
    const add = (id, title, item, field) => { if (item) T[id] = { title, text: item[field], evidence: item.evidence }; };
    add("tea-iron", "Teh or kopi? Have it an hour later.", pair("teh", "iron"), "text");
    add("vitc-iron", "Add some vitamin C.", pair("vitamin c", "plant iron"), "text");
    add("rice-cool", "Leftover rice:", cook("rice"), "tip");
    add("greens-steam", "Greens:", cook("leafy greens"), "tip");
    add("fat-carotenoid", "A little oil helps:", pair("oil", "carotenoid"), "text");
    add("bones-calcium", "Eat the bones:", cook("ikan bilis"), "tip");
    tipCache = T;
    return T;
  }
  function cookTipFor(m) {
    const ids = (m.recipe || []).map(p => p.id);
    const C = KNOWLEDGE.cooking;
    const hits = [];
    if (ids.includes("greens") || ids.includes("veg")) hits.push(C.find(x => /leafy greens/i.test(x.food)));
    if (ids.includes("tomato")) hits.push(C.find(x => /tomato/i.test(x.food)));
    if (ids.includes("rootveg")) hits.push(C.find(x => /carrot/i.test(x.food)));
    if (ids.includes("rice")) hits.push(C.find(x => /^rice/i.test(x.food)));
    if (ids.includes("beans")) hits.push(C.find(x => /dhal/i.test(x.food)));
    const list = hits.filter(Boolean).slice(0, 2);
    return list.length ? `<h3 class="sheet-sub">Keep more of the goodness</h3>${list.map(t => `<div class="tip">${ui.icon("leaf")}<div><p><strong>${ui.esc(t.food)}:</strong> ${ui.esc(t.tip)}</p>${evLine(t.evidence)}</div></div>`).join("")}` : "";
  }

  // =============================================================
  // EATING WITH FRIENDS
  // =============================================================
  let friends = null;
  let friendsResult = null; // the group pick, shown on its own screen
  function personLine(f) {
    const bits = [];
    if (f.halal) bits.push("halal");
    if (f.vegetarian) bits.push("vegetarian");
    if (f.noBeef) bits.push("no beef");
    if (f.allergies.length) bits.push("no " + f.allergies.map(allergenName).join(", ").toLowerCase());
    if (f.maxRm) bits.push(`up to ${ui.rm(f.maxRm)}`);
    return bits.join(" · ") || "eats anything";
  }
  function renderFriends() {
    const prof = ui.profile();
    const me = { name: "You", me: true, allergies: prof.diet.allergies.slice(), halal: prof.diet.halal, vegetarian: prof.diet.vegetarian, noBeef: prof.diet.noBeef, maxRm: null };
    if (!friends) friends = [me, { name: "Friend 1", allergies: [], halal: true, vegetarian: false, noBeef: false, maxRm: null }];
    else if (!friends[0].override) friends[0] = { ...me, maxRm: friends[0].maxRm }; // your current setup, unless changed here for this meal
    else friends[0].allergies = [...new Set(friends[0].allergies.concat(me.allergies))]; // never fewer allergies than your setup
    const q = query();
    const slot = ["B", "L", "D", "S"].includes(q.get("slot")) ? q.get("slot") : currentSlot();
    if (q.get("show") === "pick" && friendsResult) { renderFriendsResult(); return; }
    ui.view.innerHTML = `<div class="page narrow friends-page">
      <div class="pick-head">${backTo("#home", "Home")}<h1>Eating with friends</h1></div>
      <p class="small muted pager-lead">Add everyone's food rules and get one place that works for all of you.</p>
      <form id="fr-form" novalidate>
        <fieldset class="chips slot-chips"><legend class="sr-only">Meal</legend>${["B", "L", "D", "S"].map(s => chip("fslot", s, MK_SLOT_NAME[s].replace("Snack or supper", "Supper"), slot)).join("")}</fieldset>
        <ol class="people">${friends.map((f, i) => `<li class="person-row">
          <span class="pr-main"><strong>${ui.esc(f.name)}</strong><small>${ui.esc(personLine(f))}</small></span>
          <button type="button" class="btn btn-ghost" data-edit="${i}">${ui.icon("settings")} Edit<span class="sr-only"> ${ui.esc(f.name)}</span></button>
          ${f.me ? "" : `<button type="button" class="btn btn-ghost" data-remove="${i}">${ui.icon("trash")} Remove<span class="sr-only"> ${ui.esc(f.name)}</span></button>`}
        </li>`).join("")}</ol>
        <div class="btn-row">
          <button type="button" class="btn btn-quiet" id="fr-add" ${friends.length >= 8 ? "disabled" : ""}>${ui.icon("plus")} Add a person</button>
          <button type="submit" class="btn">${ui.icon("users")} Find a meal for all of us</button>
        </div>
      </form>
      <p class="tiny muted">Nothing here is saved or sent anywhere.</p>
    </div>`;
    $("#fr-add").addEventListener("click", () => { friendsResult = null; friends.push({ name: `Friend ${friends.length}`, allergies: [], halal: true, vegetarian: false, noBeef: false, maxRm: null }); openPerson(friends.length - 1); });
    $$("[data-remove]").forEach(b => b.addEventListener("click", () => { friendsResult = null; friends.splice(Number(b.dataset.remove), 1); renderFriends(); $("#fr-add").focus(); }));
    $$("[data-edit]").forEach(b => b.addEventListener("click", () => openPerson(Number(b.dataset.edit))));
    $("#fr-form").addEventListener("change", e => { if (e.target.name === "fslot") { try { history.replaceState(null, "", `#friends?slot=${e.target.value}`); } catch (err) { /* file:// */ } } });
    $("#fr-form").addEventListener("submit", e => {
      e.preventDefault();
      const s = ($("#fr-form").querySelector('input[name="fslot"]:checked') || {}).value || slot;
      friendsResult = { slot: s, res: groupPick(friends, s, { rahmah: prof.rahmah, seed: `${todayKey()}-g-${friends.length}` }), n: friends.length };
      location.hash = `friends?slot=${s}&show=pick`;
    });
  }
  function renderFriendsResult() {
    const { res, n, slot } = friendsResult;
    const rules = [];
    if (res.diet.halal) rules.push("halal");
    if (res.diet.vegetarian) rules.push("vegetarian");
    if (res.diet.noBeef) rules.push("no beef");
    if (res.diet.allergies.length) rules.push("no " + res.diet.allergies.map(allergenName).join(", ").toLowerCase());
    if (res.maxRm) rules.push(`up to ${ui.rm(res.maxRm)} each`);
    ui.view.innerHTML = `<div class="page narrow friends-page">
      <div class="pick-head">${backTo(`#friends?slot=${slot}`, "The group")}<h1>For all ${n} of you</h1></div>
      ${res.pick ? `<article class="pick-card group"><div class="group-food-art">${FoodArt.plate(res.pick.meal)}<span class="illustration-note">Meal illustration</span></div>
          <div class="pc-top"><span class="pc-emoji" aria-hidden="true">${mealIcon(res.pick.meal)}</span><div class="pc-head"><p class="pc-where">${ui.esc(whereLine(res.pick.meal))}</p>
          <h2>${ui.esc(res.pick.meal.name)}</h2><span class="pc-price num">${ui.rm(res.pick.cost.toBuy)} each</span></div></div>
          <p class="small">Works for everyone: ${ui.esc(rules.join(", ") || "no shared rules")}.</p>
          ${allergyLine(res.pick)}
        </article>
        ${res.backups.length ? `<h2 class="section-title small-title">Also works</h2><ul class="backup-list static">${res.backups.map(b => `<li><span class="bk-emoji" aria-hidden="true">${mealIcon(b.meal)}</span><span class="bk-main"><span class="bk-name">${ui.esc(b.meal.name)}</span><span class="bk-meta">${ui.esc(whereLine(b.meal))} · <span class="num">${ui.rm(b.cost.toBuy)}</span></span></span></li>`).join("")}</ul>` : ""}`
        : `<div class="banner warn">${ui.icon("alert")}<p>Nothing in our list works for everyone${res.maxRm ? ` at ${ui.rm(res.maxRm)}` : ""}. Try a higher limit, or a place where each person orders separately (an economy rice stall or a mamak works for most groups).</p></div>`}
    </div>`;
  }
  function openPerson(i) {
    const f = friends[i];
    ui.openSheet(f.me ? "You (from your setup)" : "A person in the group", `<form id="person-form" novalidate>
      ${f.me ? `<p class="small muted">Changes here are for this meal only. Change your own rules under Setup.</p>` : `<label class="field-label" for="pf-name">Name</label><input id="pf-name" class="text-input" type="text" maxlength="30" value="${ui.esc(f.name)}">`}
      <p class="field-sub">Can't eat</p>
      <div class="chips wrap allergy-chips" role="group" aria-label="Can't eat">${ALLERGENS.map(a => `<label class="chip"><input type="checkbox" class="pf-allergy" value="${a.id}" ${f.allergies.includes(a.id) ? "checked" : ""}><span>${ui.esc(a.name)}</span></label>`).join("")}</div>
      <p class="field-sub">Food rules</p>
      <div class="chips wrap" role="group" aria-label="Food rules">
        <label class="chip"><input type="checkbox" id="pf-halal" ${f.halal ? "checked" : ""}><span>Halal</span></label>
        <label class="chip"><input type="checkbox" id="pf-veg" ${f.vegetarian ? "checked" : ""}><span>Vegetarian</span></label>
        <label class="chip"><input type="checkbox" id="pf-nobeef" ${f.noBeef ? "checked" : ""}><span>No beef</span></label>
      </div>
      <label class="field-label" for="pf-max">Most they want to spend <span class="muted">(optional)</span></label>
      <span class="money-input"><span>RM</span><input id="pf-max" type="number" inputmode="decimal" min="1" max="200" step="0.5" value="${f.maxRm || ""}"></span>
      <div class="sheet-actions"><button class="btn" type="submit">${ui.icon("check")} Save</button></div>
    </form>`, root => {
      root.querySelector("#person-form").addEventListener("submit", e => {
        e.preventDefault();
        const v = Number(root.querySelector("#pf-max").value);
        const nameEl = root.querySelector("#pf-name");
        friends[i] = { ...f, name: f.me ? "You" : ((nameEl && nameEl.value.trim().slice(0, 30)) || `Friend ${i}`),
          allergies: [...root.querySelectorAll(".pf-allergy:checked")].map(x => x.value),
          halal: root.querySelector("#pf-halal").checked, vegetarian: root.querySelector("#pf-veg").checked, noBeef: root.querySelector("#pf-nobeef").checked,
          maxRm: root.querySelector("#pf-max").value !== "" && Number.isFinite(v) && v > 0 ? Math.min(200, v) : null };
        if (f.me) friends[i].override = true;
        friendsResult = null; // the old result no longer reflects the group
        ui.closeSheet(); renderFriends();
        const b = $(`[data-edit="${i}"]`); if (b) b.focus();
        ui.say("Saved");
      });
    });
  }

  // ---------- one card per screen, with Previous / Next (each card has its own address) ----------
  let lastPager = null;
  function pagerPage({ route, back, backLabel, title, lead, items, itemHtml, filters, extraQuery = "" }) {
    const q = query();
    const n = items.length;
    const i = Math.max(0, Math.min(n - 1, Number.parseInt(q.get("i"), 10) || 0));
    const key = `${route}?${extraQuery}`;
    const turned = lastPager && lastPager.key === key && lastPager.i !== i;
    lastPager = { key, i };
    const href = j => `#${route}?${extraQuery}${extraQuery ? "&" : ""}i=${j}`;
    ui.view.innerHTML = `<div class="page narrow pager-page">
      <div class="pick-head">${backTo(back, backLabel)}<h1>${title}</h1></div>
      ${lead ? `<p class="small muted pager-lead">${lead}</p>` : ""}
      ${filters || ""}
      ${n ? `<article class="card pager-card" aria-roledescription="card" aria-label="${i + 1} of ${n}">${itemHtml(items[i], i)}</article>
      <nav class="pager-nav" aria-label="${ui.esc(title.replace(/<[^>]+>/g, ""))}: cards">
        ${i > 0 ? `<a class="btn btn-quiet" href="${href(i - 1)}" rel="prev">${ui.icon("back")} Previous</a>` : `<span class="btn btn-quiet" aria-disabled="true">${ui.icon("back")} Previous</span>`}
        <span class="pager-count num" aria-live="polite">${i + 1} of ${n}</span>
        ${i < n - 1 ? `<a class="btn" href="${href(i + 1)}" rel="next">Next ${ui.icon("arrow")}</a>` : `<a class="btn" href="${back}">Done ${ui.icon("check")}</a>`}
      </nav>` : `<p class="muted">Nothing here for your food rules.</p>`}
    </div>`;
    // Turning a card: focus stays with the cards (not back at the page title) and the position is read out
    if (turned) setTimeout(() => { const c = $(".pager-card"); if (c) { c.setAttribute("tabindex", "-1"); c.focus({ preventScroll: true }); } ui.say(`${i + 1} of ${n}`); }, 0);
  }

  const LEARN_TILES = [
    { href: "#goals", icon: "star", title: "I want…", sub: "Foods for eyes, energy, bones and more" },
    { href: "#swaps", icon: "swap", title: "Smart swaps", sub: "Imported “superfoods” vs cheaper local food" },
    { href: "#pairs", icon: "alert", title: "Myth or real?", sub: "Foods that “clash” (食物相克), tested" },
    { href: "#cook", icon: "pot", title: "Cook it better", sub: "Keep more of the vitamins" },
    { href: "#heroes", icon: "leaf", title: "Unsung local heroes", sub: "Cheap local foods, surprising facts" },
    { href: "#quiz", icon: "dice", title: "Which has more?", sub: "5 quick questions" },
    { href: "#plate", icon: "plate", title: "Plate check", sub: "Is it suku-suku separuh?" }
  ];
  function renderLearn() {
    const L = loadLearn();
    ui.view.innerHTML = `<div class="page learn">
      <div class="section-masthead learn-masthead"><div><p class="eyebrow">A LITTLE FOOD FOR THOUGHT</p><h1>Learn about food</h1><p class="lead">Practical food knowledge, with the evidence behind it.</p></div><span class="masthead-doodle" aria-hidden="true">${ui.icon("leaf")}<small>stay curious.</small></span></div>
      <ul class="learn-grid">${LEARN_TILES.map((t, i) => `${i === 0 ? '<li class="hub-group-label"><h2>Everyday food knowledge</h2><p>Explore ingredients, habits and local alternatives.</p></li>' : i === 5 ? '<li class="hub-group-label"><h2>Try it yourself</h2><p>Put what you learn into practice.</p></li>' : ""}<li><a class="learn-tile" href="${t.href}"><span class="tile-number" aria-hidden="true">0${i + 1}</span>${ui.icon(t.icon)}<span><strong>${t.title}</strong><small>${t.sub}${t.href === "#quiz" && L.best !== null ? ` · best ${L.best}/5` : ""}</small></span></a></li>`).join("")}
        <li><button type="button" class="learn-tile" id="badges-help" aria-haspopup="dialog">${ui.icon("info")}<span><strong>Evidence labels</strong><small>What “strong”, “some”, “lab only” and “myth” mean</small></span></button></li></ul>
    </div>`;
    $("#badges-help").addEventListener("click", () => ui.openSheet("Evidence labels", `<ul class="ev-legend-list">${["strong", "some", "lab", "myth"].map(k => `<li>${badge(k)} <span>${LEVEL[k].tip}</span></li>`).join("")}</ul>
      <p class="small muted">Every tip links to its source. Nutrient numbers come from official food tables (USDA FoodData Central, Malaysia's MyFCD); prices from KPDN PriceCatcher or a named shop on a named date.</p>`));
  }
  function renderGoals() {
    ui.view.innerHTML = `<div class="page narrow">
      <div class="pick-head">${backTo("#learn", "Learn")}<h1>I want…</h1></div>
      <ul class="goal-grid">${KNOWLEDGE.goals.map(g => `<li><a class="goal-tile" href="#goal?id=${g.id}">${ui.icon(GOAL_ICON[g.id] || "leaf")}<span>${ui.esc(g.title)}</span>${ui.icon("arrow")}</a></li>`).join("")}</ul>
    </div>`;
  }
  const GOAL_ICON = { eyes: "eye", iron: "bolt", bones: "bone", digestion: "leaf", muscle: "dumbbell", bloodpressure: "heart", focus: "book" };
  function loadLearn() {
    const raw = storeGet(KEYS.learn, null) || {};
    return { best: Number.isInteger(raw.best) && raw.best >= 0 && raw.best <= 5 ? raw.best : null, played: Number.isInteger(raw.played) && raw.played >= 0 ? raw.played : 0 };
  }

  const COST = { low: "Cheap", mid: "Mid-price", high: "Pricey" };
  const EASY = { everywhere: "Easy to find", "wet market": "Wet market", supermarket: "Supermarket", imported: "Imported" };
  const COST_RANK = { low: 0, mid: 1, high: 2 }, EASY_RANK = { everywhere: 0, "wet market": 1, supermarket: 2, imported: 3 };
  function foodFits(f, prof) {
    if (prof.diet.halal && f.halal === false) return false;
    if (prof.diet.vegetarian && f.vegetarian === false) return false;
    if ((f.allergens || []).some(a => prof.diet.allergies.includes(a))) return false;
    return true;
  }
  function renderGoal() {
    const prof = ui.profile() || defaultProfile();
    const q = query();
    const g = KNOWLEDGE.goals.find(x => x.id === q.get("id")) || KNOWLEDGE.goals[0];
    const tab = q.get("tab") === "know" ? "know" : "foods";
    const fits = g.foods.filter(f => foodFits(f, prof));
    const hidden = g.foods.length - fits.length;
    const from = q.get("from");
    const tabs = `<nav class="tabs-inline" aria-label="${ui.esc(g.title)}">
        <a href="#goal?id=${g.id}" ${tab === "foods" ? 'aria-current="page"' : ""}>Foods that help (${fits.length})</a>
        <a href="#goal?id=${g.id}&tab=know" ${tab === "know" ? 'aria-current="page"' : ""}>Good to know (${(g.cautions || []).length})</a>
      </nav>`;
    const rest = g.plain.slice(firstSentence(g.plain).length).trim();
    const head = `<details class="goal-about"><summary>${ui.esc(firstSentence(g.plain))}${rest ? ` <span class="more">More</span>` : ""}</summary>${rest ? `<p class="small">${ui.esc(rest)}</p>` : ""}${evLine(g.evidence)}</details>${tabs}
      ${tab === "foods" && hidden ? `<p class="tiny muted">${hidden} food${hidden > 1 ? "s" : ""} hidden for your food rules or allergies. Cheapest and easiest first.</p>` : tab === "foods" ? `<p class="tiny muted">Cheapest and easiest first.</p>` : ""}
      ${from ? `<div class="banner" role="status">${ui.icon("info")}<p>Instead of ${ui.esc(from)}, try this.</p></div>` : ""}`;
    if (tab === "know") {
      pagerPage({ route: "goal", extraQuery: `id=${g.id}&tab=know`, back: "#goals", backLabel: "I want…", title: `${ui.icon(GOAL_ICON[g.id] || "leaf")} ${ui.esc(g.title)}`, filters: head,
        items: g.cautions || [], itemHtml: c => `<p>${ui.esc(c.text)}</p>${evLine(c.evidence)}` });
    } else {
      pagerPage({ route: "goal", extraQuery: `id=${g.id}`, back: "#goals", backLabel: "I want…", title: `${ui.icon(GOAL_ICON[g.id] || "leaf")} ${ui.esc(g.title)}`, filters: head,
        items: fits, itemHtml: (f, i) => foodHtml(f, i, fits, g) });
    }
    ui.view.querySelector(".pager-page h1").classList.add("icon-h1");
    $$("[data-hard]").forEach(b => b.addEventListener("click", () => {
      const i = Number(b.dataset.hard);
      const f = fits[i];
      const alt = fits.findIndex((x, j) => j !== i && COST_RANK[x.cost] <= COST_RANK[f.cost] && EASY_RANK[x.easy] <= EASY_RANK[f.easy] && (COST_RANK[x.cost] < COST_RANK[f.cost] || EASY_RANK[x.easy] < EASY_RANK[f.easy]));
      const box = ui.view.querySelector(`[data-alt="${i}"]`);
      const sw = KNOWLEDGE.swaps.find(s => s.from.toLowerCase().replace(/\s*\(.*\)$/, "") === f.name.toLowerCase().replace(/\s*\(.*\)$/, ""));
      if (alt >= 0) { location.hash = `goal?id=${g.id}&i=${alt}&from=${encodeURIComponent(f.name)}`; return; }
      box.hidden = false;
      box.innerHTML = sw ? `<p class="small"><strong>Swap:</strong> ${ui.esc(sw.from)} → ${ui.esc(sw.to)}. ${ui.esc(sw.why)}</p>${evLine(sw.evidence)}`
        : `<p class="small">This is already one of the cheapest and easiest foods for this goal. Small amounts count too.</p>`;
      box.setAttribute("tabindex", "-1"); box.focus();
    }));
  }
  function foodHtml(f, i) {
    return `<h2 class="card-title">${ui.esc(f.name)}${f.zh ? ` <span class="zh">${ui.esc(f.zh)}</span>` : ""}${f.ms && f.ms !== f.name ? ` <span class="muted small">${ui.esc(f.ms)}</span>` : ""}</h2>
      <p class="food-tags"><span class="tag">${COST[f.cost] || ""}</span><span class="tag">${EASY[f.easy] || ""}</span>${f.halal === false ? `<span class="tag flag">Not halal</span>` : ""}${(f.allergens || []).length ? `<span class="tag">Contains ${f.allergens.map(allergenName).join(", ").toLowerCase()}</span>` : ""}</p>
      <p>${ui.esc(f.why)}</p>
      ${evLine(f.evidence)}
      <button type="button" class="btn btn-ghost hard-btn" data-hard="${i}">${ui.icon("wallet")} Too pricey or hard to find?</button>
      <div class="alt" data-alt="${i}" hidden></div>`;
  }

  function renderSwaps() {
    const byId = id => SWAPDATA.foods.find(f => f.id === id);
    const extra = SWAPDATA.swaps.filter(s => !KNOWLEDGE.swaps.some(k => k.fromId === s.from && k.toId === s.to))
      .map(v => ({ v, a: byId(v.from), b: byId(v.to) })).filter(x => x.a && x.b);
    const items = KNOWLEDGE.swaps.map(s => ({ s, a: byId(s.fromId), b: byId(s.toId), v: SWAPDATA.swaps.find(x => x.from === s.fromId && x.to === s.toId) })).concat(extra);
    const priceRow = (a, b) => a && b ? `<p class="tiny muted">Prices: ${ui.esc(a.name)} about RM ${a.rmPerKg.toFixed(2)}/kg${srcBits(a.priceSource)}; ${ui.esc(b.name)} about RM ${b.rmPerKg.toFixed(2)}/kg${srcBits(b.priceSource)}. Per 100 g raw.</p>` : "";
    const nm = (name, zh, ms) => `<span>${ui.esc(name)}${ms && ms !== name ? ` <span class="ms">${ui.esc(ms)}</span>` : ""}${zh ? ` <span class="zh">${ui.esc(zh)}</span>` : ""}</span>`;
    const more = inner => `<details class="card-more"><summary>Prices and sources</summary>${inner}</details>`;
    pagerPage({ route: "swaps", back: "#learn", backLabel: "Learn", title: "Smart swaps",
      lead: "Imported “superfoods” vs local food: what the numbers say, including where the local food loses.",
      items, itemHtml: x => x.s
        ? `<h2 class="swap-title">${nm(x.s.from, x.s.fromZh, x.a && x.a.local)} ${ui.icon("arrow")} ${nm(x.s.to, x.s.toZh, x.b && x.b.local)}</h2>${avoidTag([x.s.to])}<p>${ui.esc(x.s.why)}</p>${x.v && (x.v.wins || x.v.loses) ? winLose(x.v) : ""}${evLine({ ...x.s.evidence, url: "", source: "" }).replace(/<p class="ev-line">/, '<p class="ev-line">')}${more(`${priceRow(x.a, x.b)}${evLine(x.s.evidence)}`)}`
        : `<h2 class="swap-title">${nm(x.a.name, x.a.zh, x.a.local)} ${ui.icon("arrow")} ${nm(x.b.name, x.b.zh, x.b.local)}</h2><p>${ui.esc(x.v.verdict)}</p>${winLose(x.v)}
           ${more(`${priceRow(x.a, x.b)}<p class="ev-line">${badge("strong")} ${srcLink({ source: x.a.nutrientSource.name, url: x.a.nutrientSource.url })} · ${srcLink({ source: x.b.nutrientSource.name, url: x.b.nutrientSource.url })}</p>`)}` });
  }
  const srcBits = s => s && s.url ? ` (<a class="src" href="${ui.esc(s.url)}" target="_blank" rel="noopener">source${s.date ? ", " + ui.esc(s.date) : ""}</a>)` : "";
  // "vitC per 100 g", "vitC per RM", … → "vitamin C" (both), "per ringgit only: iron"
  const NUT = { vitC: "vitamin C", vitA: "vitamin A", vitK: "vitamin K", vitA_RE: "vitamin A" };
  function nutList(list) {
    const per100 = new Set(), perRm = new Set();
    (list || []).forEach(x => { const m = /^(.+?) per (100 g|RM)$/i.exec(String(x).trim()); if (!m) { per100.add(String(x)); perRm.add(String(x)); return; } (m[2] === "RM" ? perRm : per100).add(m[1]); });
    const name = k => NUT[k] || k;
    const both = [...per100].filter(k => perRm.has(k)).map(name);
    const only100 = [...per100].filter(k => !perRm.has(k)).map(name);
    const onlyRm = [...perRm].filter(k => !per100.has(k)).map(name);
    return [both.join(", "), only100.length ? `per 100 g only: ${only100.join(", ")}` : "", onlyRm.length ? `per ringgit only: ${onlyRm.join(", ")}` : ""].filter(Boolean).join("; ");
  }
  const winLose = v => `<div class="winlose">${(v.wins || []).length ? `<p class="small">${ui.icon("check")} <strong class="good">Local wins:</strong> ${ui.esc(nutList(v.wins))}</p>` : ""}${(v.loses || []).length ? `<p class="small">${ui.icon("x")} <strong class="bad">Local loses:</strong> ${ui.esc(nutList(v.loses))}</p>` : ""}</div>`;

  // Allergens of the foods named in swaps and heroes (so they're flagged for people who avoid them)
  const NAMED_ALLERGENS = { "ikan bilis": ["fish"], tempeh: ["soy"], tauhu: ["soy"], "calcium-set tofu": ["soy"], "egg yolk": ["egg"], eggs: ["egg"], "ikan kembung": ["fish"], salmon: ["fish"], milk: ["milk"] };
  const namedAllergens = name => NAMED_ALLERGENS[String(name).toLowerCase().replace(/\s*\(.*\)$/, "")] || [];
  function avoidTag(names) {
    const prof = ui.profile();
    if (!prof) return "";
    const hit = [...new Set(names.flatMap(namedAllergens))].filter(a => prof.diet.allergies.includes(a));
    return hit.length ? `<p class="tag flag avoid">${ui.icon("alert")} Contains ${hit.map(allergenName).join(", ").toLowerCase()}, which you avoid</p>` : "";
  }
  const VERDICT = { caution: { label: "Real caution", icon: "alert" }, good: { label: "Better together", icon: "check" }, myth: { label: "Myth", icon: "x" } };
  function renderPairs() {
    const f = ["caution", "good", "myth"].includes(query().get("f")) ? query().get("f") : "all";
    const items = KNOWLEDGE.pairings.filter(p => f === "all" || p.verdict === f);
    const filters = `<nav class="tabs-inline" aria-label="Show">${[["all", "All"], ["myth", "Myths"], ["caution", "Real cautions"], ["good", "Better together"]]
      .map(([k, l]) => `<a href="#pairs${k === "all" ? "" : `?f=${k}`}" ${f === k ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>`;
    pagerPage({ route: "pairs", extraQuery: f === "all" ? "" : `f=${f}`, back: "#learn", backLabel: "Learn", title: "Myth or real?",
      lead: "Most “foods that clash” (食物相克) warnings don't hold up when tested. A few real ones do.", filters, items,
      itemHtml: p => `<p class="verdict ${p.verdict}">${ui.icon(VERDICT[p.verdict].icon)} ${VERDICT[p.verdict].label}</p>
        <h2 class="card-title">${ui.esc(p.a)} <span aria-hidden="true">+</span><span class="sr-only">with</span> ${ui.esc(p.b)}</h2><p>${ui.esc(p.text)}</p>${evLine(p.evidence)}` });
  }
  function renderCook() {
    pagerPage({ route: "cook", back: "#learn", backLabel: "Learn", title: "Cook it better", lead: "The same vegetables can give you more or less, depending on how you cook them.",
      items: KNOWLEDGE.cooking, itemHtml: c => `<h2 class="card-title">${ui.esc(c.food)}</h2><p>${ui.esc(c.tip)}</p>${c.keeps ? `<p class="tiny muted">Keeps: ${ui.esc(c.keeps)}</p>` : ""}${evLine(c.evidence)}` });
  }
  function renderHeroes() {
    pagerPage({ route: "heroes", back: "#learn", backLabel: "Learn", title: "Unsung local heroes", lead: "Cheap, local and easy to overlook. Each fact is checked against its source.",
      items: KNOWLEDGE.heroes, itemHtml: h => `<h2 class="card-title">${ui.esc(h.name)}${h.zh ? ` <span class="zh">${ui.esc(h.zh)}</span>` : ""}</h2>${avoidTag([h.name])}<p>${ui.esc(h.fact)}</p>${evLine(h.evidence)}` });
  }

  // ---------- Which has more? ----------
  let quiz = null;
  function renderQuiz() {
    if (!quiz) quiz = { seed: Date.now(), i: 0, score: 0, answered: null, qs: null };
    if (!quiz.qs) quiz.qs = quizQuestions(SWAPDATA, String(quiz.seed), 5);
    const qs = quiz.qs;
    if (quiz.i >= qs.length) {
      const L = loadLearn();
      const best = Math.max(L.best || 0, quiz.score);
      if (!quiz.saved) { storeSet(KEYS.learn, { best, played: L.played + 1 }); quiz.saved = true; }
      ui.view.innerHTML = `<div class="page narrow quiz-page">
        ${backTo("#learn", "Learn")}
        <h1>${quiz.score}/${qs.length}</h1>
        <p class="lead">${quiz.score === qs.length ? "Perfect. You know your food." : quiz.score >= 3 ? "Nice. A few surprises in there?" : "The cheap local foods often win. Now you know."} Best so far: ${best}/${qs.length}.</p>
        <div class="btn-row"><button type="button" class="btn" id="again">${ui.icon("refresh")} Play again</button><a class="btn btn-quiet" href="#swaps">${ui.icon("swap")} See smart swaps</a></div>
      </div>`;
      $("#again").addEventListener("click", () => { quiz = null; renderQuiz(); ui.focusHeading(); });
      return;
    }
    const q = qs[quiz.i];
    const a = quiz.answered;
    ui.view.innerHTML = `<div class="page narrow quiz-page">
      ${backTo("#learn", "Learn")}
      <p class="eyebrow">Question ${quiz.i + 1} of ${qs.length} · Score ${quiz.score}</p>
      <h1>${ui.esc(q.prompt)}</h1>
      <div class="quiz-options">${q.options.map(o => `<button type="button" class="quiz-opt ${a ? (o.id === q.answer ? "right" : o.id === a ? "wrong" : "") : ""}" data-ans="${o.id}" ${a ? "disabled" : ""}>
        <span class="qo-name">${ui.esc(o.name)}</span>${o.zh ? `<span class="zh">${ui.esc(o.zh)}</span>` : ""}${a && o.id === q.answer ? `<span class="qo-mark">${ui.icon("check")} More</span>` : ""}</button>`).join("")}</div>
      <div id="quiz-out" aria-live="polite">${a ? `<div class="card quiz-explain"><p><strong>${a === q.answer ? "Right!" : "Not this time."}</strong> ${ui.esc(q.explain)}</p>
        <p class="ev-line">${badge("strong")} ${q.sources.map(s => srcLink({ source: s.name, url: s.url })).join(" · ")}</p>
        <button type="button" class="btn" id="next-q">${quiz.i + 1 < qs.length ? `Next question ${ui.icon("arrow")}` : `See my score ${ui.icon("arrow")}`}</button></div>` : ""}</div>
    </div>`;
    $$("[data-ans]").forEach(b => b.addEventListener("click", () => {
      quiz.answered = b.dataset.ans;
      if (quiz.answered === q.answer) quiz.score++;
      renderQuiz();
      const n = $("#next-q"); if (n) n.focus();
      ui.say(quiz.answered === q.answer ? "Right" : "Not this time");
    }));
    const n = $("#next-q");
    if (n) n.addEventListener("click", () => { quiz.i++; quiz.answered = null; renderQuiz(); ui.focusHeading(); });
  }

  // ---------- Plate check ----------
  let plate = { carb: 2, protein: 1, veg: 1, fruit: 0 };
  const PLATE_GROUPS = [
    { k: "carb", name: "Rice, noodles, bread" }, { k: "protein", name: "Fish, chicken, egg, tofu, dhal" },
    { k: "veg", name: "Vegetables" }, { k: "fruit", name: "Fruit" }
  ];
  function renderPlate() {
    const r = plateCheck(plate);
    const deg = k => Math.round((r.shares[k] || 0) * 360);
    const c1 = deg("carb"), c2 = c1 + deg("protein");
    ui.view.innerHTML = `<div class="page narrow plate-page">
      ${backTo("#learn", "Learn")}
      <h1>Plate check</h1>
      <p class="lead">Malaysia's Healthy Plate is “suku-suku separuh”: a quarter carbs, a quarter protein, half fruit and vegetables.${sourceA("PLATE")}</p>
      <div class="plate-wrap">
        <div class="plate-vis" role="img" aria-label="Your plate: ${Math.round(r.shares.carb * 100)}% carbs, ${Math.round(r.shares.protein * 100)}% protein, ${Math.round(r.shares.fv * 100)}% fruit and vegetables"
          style="background: conic-gradient(var(--plate-carb) 0 ${c1}deg, var(--plate-protein) ${c1}deg ${c2}deg, var(--plate-fv) ${c2}deg 360deg)"></div>
        <ul class="plate-legend">
          <li><span class="sw carb"></span>Carbs ${Math.round(r.shares.carb * 100)}%</li>
          <li><span class="sw protein"></span>Protein ${Math.round(r.shares.protein * 100)}%</li>
          <li><span class="sw fv"></span>Fruit &amp; veg ${Math.round(r.shares.fv * 100)}%</li>
        </ul>
      </div>
      <ul class="plate-steppers">${PLATE_GROUPS.map(g => `<li><span class="ps-name"><span class="sw ${g.k === "fruit" || g.k === "veg" ? "fv" : g.k}" aria-hidden="true"></span> ${g.name}</span>
        <div class="stepper" role="group" aria-label="${g.name}: scoops"><button type="button" data-g="${g.k}" data-d="-1" aria-label="One scoop less of ${g.name}">−</button><output aria-live="polite">${plate[g.k]}</output><button type="button" data-g="${g.k}" data-d="1" aria-label="One scoop more of ${g.name}">+</button></div></li>`).join("")}</ul>
      <div class="banner ${r.ok ? "good" : "warn"}" id="plate-out">${ui.icon(r.ok ? "check" : "info")}<div>${r.notes.map(n => `<p>${ui.esc(n)}</p>`).join("")}</div></div>
    </div>`;
    $$("[data-g]").forEach(b => b.addEventListener("click", () => {
      plate[b.dataset.g] = Math.max(0, Math.min(6, plate[b.dataset.g] + Number(b.dataset.d)));
      const sel = `[data-g="${b.dataset.g}"][data-d="${b.dataset.d}"]`;
      renderPlate();
      const again = $(sel); if (again) again.focus();
    }));
  }

  // A browsable collection complements the one-pick flow without changing its engine.
  function savedMeals() { return MealCollection.cleanSaved(storeGet(KEYS.saved, [])); }
  function renderCollection() {
    const q = query();
    ui.view.innerHTML = `<div class="page collection-page">${backTo("#home", "Home")}
      <div class="collection-masthead"><p class="eyebrow">PULL UP A CHAIR</p><h1>The everyday <em>menu.</em></h1><span class="collection-doodle" aria-hidden="true">✳</span></div>
      <p class="lead">Every meal here fits your saved dietary rules and kitchen. Save the ones you'd come back for.</p>
      <form id="collection-form" class="collection-filters" role="search">
        <label>Find a meal<input type="search" id="meal-search" placeholder="Try rice, tofu, noodles…" maxlength="100" autocomplete="off"></label>
        <label>Sort by<select id="meal-sort"><option value="price">Lowest estimated cost</option><option value="time">Quickest first</option><option value="name">Meal name</option></select></label>
        <label class="collection-check"><input type="checkbox" id="saved-only" ${q.get("saved") === "1" ? "checked" : ""}> Saved only</label>
        <label class="collection-check"><input type="checkbox" id="quick-only"> 15 minutes or less</label>
      </form><p class="small muted" id="collection-count" role="status"></p><div class="meal-grid" id="meal-results"></div>
      <p class="small muted">Illustrations are decorative, not ingredient or portion guides. Costs are estimates per serving, including ingredients you may already own. Stall recipes vary: confirm ingredients and cross-contact with the seller.</p></div>`;
    $("#collection-form").addEventListener("submit", e => e.preventDefault());
    $("#meal-search").addEventListener("input", updateCollection);
    ["#meal-sort", "#saved-only", "#quick-only"].forEach(sel => $(sel).addEventListener("change", updateCollection));
    updateCollection();
  }
  function updateCollection() {
    const saved = savedMeals();
    const rows = MealCollection.search(ui.profile(), { query: $("#meal-search").value, sort: $("#meal-sort").value,
      saved, onlySaved: $("#saved-only").checked, quick: $("#quick-only").checked });
    $("#collection-count").textContent = `${rows.length} meal${rows.length === 1 ? "" : "s"} · ${saved.length} saved on this device`;
    $("#meal-results").innerHTML = rows.length ? rows.map(({meal: m, cost}) => `<article class="card meal-tile">
      <div class="meal-tile-art">${FoodArt.plate(m)}<span class="illustration-note">Meal illustration</span><span class="meal-time">${m.min} min</span></div><div class="meal-tile-top"><span class="meal-source">${ui.esc(whereLine(m))}</span><button type="button" class="btn btn-ghost" data-save-meal="${ui.esc(m.id)}" aria-pressed="${saved.includes(m.id)}" aria-label="Save ${ui.esc(m.name)}">${ui.icon("star")} ${saved.includes(m.id) ? "Saved" : "Save"}</button></div>
      <p class="eyebrow">${ui.esc(whereLine(m))} · ${m.min} min</p><h2>${ui.esc(m.name)}</h2>
      <div class="meal-tile-bottom"><strong class="num">${ui.rm(cost)}<span class="small muted"> / serving</span></strong><button class="btn btn-quiet" type="button" data-meal-details="${ui.esc(m.id)}">Details</button></div></article>`).join("") : `<div class="card collection-empty"><h2>${$("#saved-only").checked ? "Your saved meals will live here" : "No meals match just yet"}</h2><p>Try a different search or clear the filters. Your dietary rules always apply.</p><button class="btn btn-quiet" id="clear-collection" type="button">Clear filters</button></div>`;
    const clear = $("#clear-collection");
    if (clear) clear.addEventListener("click", () => { $("#meal-search").value = ""; $("#saved-only").checked = false; $("#quick-only").checked = false; updateCollection(); $("#meal-search").focus(); });
    $$("[data-save-meal]").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.saveMeal, old = savedMeals();
      if (!storeSet(KEYS.saved, old.includes(id) ? old.filter(x => x !== id) : old.concat(id))) { ui.say("Could not save. Device storage may be full or blocked."); return; }
      updateCollection();
      const next = $$("[data-save-meal]").find(x => x.dataset.saveMeal === id);
      (next || $("#saved-only")).focus(); ui.say(old.includes(id) ? "Meal removed from saved" : "Meal saved");
    }));
    $$("[data-meal-details]").forEach(b => b.addEventListener("click", () => {
      const m = mealById(b.dataset.mealDetails);
      ui.openSheet(m.name, `<p class="eyebrow">${ui.esc(whereLine(m))} · ${m.min} min</p><p class="lead">Estimated ${ui.rm(mealStats(m).rm)} per serving</p>
        ${m.steps ? `<h3>Make it</h3><ol>${m.steps.map(x => `<li>${ui.esc(x)}</li>`).join("")}</ol>` : `<p>Ask the stall about the ingredients and the current price before ordering.</p>`}
        <h3>Usual allergens</h3><p>${(m.contains || []).map(allergenName).map(ui.esc).join(", ") || "None listed in the usual recipe"}.</p><p class="small muted">May contain: ${(m.may || []).map(allergenName).map(ui.esc).join(", ") || "none listed"}. Recipes and cross-contact vary. Always check.</p>`);
    }));
  }

  let lastRendered = null;
  function render(route, u) {
    ui = u;
    // Coming back to Pick from another screen starts a fresh pick (not the last "Logged" card)
    if (route === "pick" && lastRendered !== "pick") session.logged = null;
    lastRendered = route;
    if (route === "home") renderHome();
    else if (route === "collection") renderCollection();
    else if (route === "pick") renderPick();
    else if (route === "friends") renderFriends();
    else if (route === "learn") renderLearn();
    else if (route === "goals") renderGoals();
    else if (route === "goal") renderGoal();
    else if (route === "swaps") renderSwaps();
    else if (route === "pairs") renderPairs();
    else if (route === "cook") renderCook();
    else if (route === "heroes") renderHeroes();
    else if (route === "quiz") renderQuiz();
    else if (route === "plate") renderPlate();
  }
  return { routes: MA_ROUTES, render };
})();
