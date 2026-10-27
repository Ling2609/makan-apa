// =============================================================
// app.js — the interface: setup, week simulation, week report, plan, check-in.
// All numbers come from the pure modules (foods, sim, report, planner, checkin).
// =============================================================
/* global icon, KEYS, storeGet, storeSet, storeRemove, validateProfile, defaultProfile, loadProfile, BUDGET_MIN, BUDGET_MAX,
   TIGHT_WEEK, validateIfThen, KITCHENS, MEALS, PACKS, SOURCES, AISLES, VENUES, mealById, mealStats, fitsDiet, fitsKitchen, round2, ALLERGENS, allergenName, MA_ROUTES, MA_UI,
   FV_TARGET_G, healthyPlate, mealPrice, packPrice, cleanPriceOverrides, setPriceOverrides, PRICE_MIN, PRICE_MAX,
   DAY_NAMES, DAY_SHORT, SLOT_NAMES, newSim, advance, currentScene, visibleOptions, choose, totals, calibrationQuestions,
   restoreSim, serializeSim, textOf, moneyLeft, BORROW_STEP, buildReport, shareStats, planWeek, evaluate, swapOptions,
   applySwap, applySwapAll, validatePlan, cookLimit, baselineBuyAll, PLAN_SLOTS, prepSessions, rotatePlan, weekdayIndex, orderForFreshness, tightWeek, startToday,
   validateHistory, HISTORY_MAX, TOOL_ROUTES, EFT_TOOLS,
   carryOver, cleanHave, usesOf, toKey, fromKey, addDays, planDay, validateLog, record, summary, weekSums, unslotSpends, validateSpendLog, buildIcs, useFirst, referenceDay */
(function () {
  "use strict";
  const view = document.getElementById("view");
  const sheet = document.getElementById("sheet");
  const sheetBody = document.getElementById("sheet-body");
  const sheetTitle = document.getElementById("sheet-title");
  const announcer = document.getElementById("announcer");

  // ---------- formatting ----------
  const rm = n => `RM ${Number(n).toFixed(2)}`;
  const rm0 = n => `RM ${Math.round(Number(n))}`;
  const kg = n => `${Number(n).toFixed(Number(n) < 10 ? 2 : 1)} kg`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sign = n => (n > 0 ? "+" : n < 0 ? "−" : "±");
  const signedRm = n => sign(n) + "RM " + Math.abs(n).toFixed(2);
  const signedKg = n => sign(n) + Math.abs(n).toFixed(2) + " kg";
  const signedG = n => sign(n) + Math.abs(Math.round(n)) + " g";
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const SOURCE_TAG = { buy: "Buy", cook: "Cook", kettle: "Kettle" };
  const GOAL_NAME = { money: "Save money", health: "Eat healthier", planet: "Lower footprint" };
  const SLOT_ALL = { ...SLOT_NAMES, S: "Fruit snack" };
  const say = msg => { announcer.textContent = ""; setTimeout(() => { announcer.textContent = msg; }, 30); };
  const sourceLink = key => key && SOURCES[key] ? ` <a class="src" href="${SOURCES[key].url}" target="_blank" rel="noopener">${esc(SOURCES[key].name)}</a>` : "";
  const srcShort = (key, label) => key && SOURCES[key] ? ` <a class="src" href="${SOURCES[key].url}" target="_blank" rel="noopener" title="${esc(SOURCES[key].name)}">${label}</a>` : "";
  const shortName = m => (m && (m.short || m.name)) || "";

  // ---------- state ----------
  let profile = loadProfile();
  let sim = null;
  let lastResult = null;       // the decision just made, shown until "Next"
  let busy = false;            // guards against double taps between screens
  let setupStep = 0;           // onboarding wizard step
  let draft = null;            // answers between wizard steps (saved on the last step)

  // The student's own prices, used everywhere
  setPriceOverrides(storeGet(KEYS.prices, null));
  const loadHave = () => cleanHave(storeGet(KEYS.have, null));

  function loadSim() {
    if (!profile) return null;
    const saved = storeGet(KEYS.sim, null);
    return saved ? restoreSim(saved, validateProfile) : null;
  }
  function saveSim() { if (sim) storeSet(KEYS.sim, serializeSim(sim)); }

  // ---------- focus + sheet ----------
  function focusHeading() {
    const h = view.querySelector("h1");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    view.scrollTo(0, 0);
  }
  let sheetOpener = null;
  function openSheet(title, html, onMount) {
    const origin = document.activeElement;
    const originMenu = origin && origin.closest && origin.closest("details.more");
    sheetOpener = originMenu ? originMenu.querySelector("summary") : origin;
    view.querySelectorAll("details.more[open]").forEach(menu => { menu.open = false; });
    sheetTitle.textContent = title;
    sheetBody.innerHTML = html;
    if (!sheet.open) sheet.showModal();
    document.body.classList.add("sheet-open"); // the page behind doesn't scroll
    if (onMount) onMount(sheetBody);
    const first = sheetBody.querySelector("button, input, a, select");
    if (first) first.focus();
  }
  function closeSheet() { if (sheet.open) sheet.close(); }
  sheet.addEventListener("close", () => {
    if (sheet.open) return; // another sheet opened straight after this one closed: keep its content
    document.body.classList.remove("sheet-open");
    sheetBody.innerHTML = "";
    if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus();
  });
  document.getElementById("sheet-close").addEventListener("click", closeSheet);
  sheet.addEventListener("click", e => { if (e.target === sheet) closeSheet(); }); // click on the backdrop

  // Briefly ignore input after a screen change, so a double tap can't hit the next screen
  function guard(ms = 350) {
    busy = true;
    setTimeout(() => { busy = false; }, ms);
  }
  // In-page error that clears as soon as the student edits the form
  function showError(box, text, form) {
    box.innerHTML = `<div class="banner bad">${icon("alert")}<p>${text}</p></div>`;
    if (form) form.addEventListener("input", () => { box.innerHTML = ""; }, { once: true });
  }

  // ---------- router ----------
  const ROUTES = ["setup", "week", "report", "plan", "today"].concat(typeof TOOL_ROUTES !== "undefined" ? TOOL_ROUTES : [], typeof MA_ROUTES !== "undefined" ? MA_ROUTES : []);
  function currentRoute() {
    const h = location.hash.replace(/^#/, "").split("?")[0];
    return ROUTES.includes(h) ? h : "home";
  }
  function go(route) {
    if (location.hash === "#" + route) render(); else location.hash = route;
  }
  // Redirects made while a screen renders replace the history entry, so Back never bounces into a loop
  function redirect(route) {
    if (location.hash === "#" + route) render(); else location.replace("#" + route);
  }
  window.addEventListener("hashchange", render);

  // Which bottom tab a screen belongs to
  const TAB_OF = { home: "home", collection: "home", pick: "home", friends: "home", plan: "plan",
    learn: "learn", goals: "learn", goal: "learn", swaps: "learn", pairs: "learn", cook: "learn", heroes: "learn", quiz: "learn", plate: "learn",
    today: "tools", week: "tools", report: "tools", tools: "tools", receipt: "tools", realweek: "tools", stalls: "tools", class: "tools" };
  function setTabs(route) {
    document.querySelectorAll("[data-tab]").forEach(a => {
      if (a.dataset.tab === TAB_OF[route]) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    // The browser tab names the screen you are on
    const TITLES = { setup: "Set up", collection: "Meal collection", home: "Home", pick: "Pick for me", friends: "Eating with friends", week: "Practice week", report: "Your week, wrapped", plan: "Plan", today: "Today", tools: "More",
      receipt: "Scan a receipt", realweek: "My real week", stalls: "Stall price notes", class: "Class mode",
      learn: "Learn", goals: "I want…", goal: "I want…", swaps: "Smart swaps", pairs: "Foods together", cook: "Cook it better", heroes: "Unsung heroes", quiz: "Which has more?", plate: "Plate check" };
    document.title = (TITLES[route] ? TITLES[route] + " · " : "") + "Makan Apa?";
  }

  const NO_PROFILE = ["stalls", "class", "learn", "goals", "goal", "swaps", "pairs", "cook", "heroes", "quiz", "plate"];
  // Where the last setup button goes, in words
  const DEST_NAME = { home: "Done", pick: "Show me a pick", friends: "Done", today: "Go to today", tools: "Go to Tools", receipt: "Scan my receipt", realweek: "See my real week", stalls: "Go to my stall notes", class: "Go to class mode", report: "See my report" };
  let lastRoute = null;
  let todayDayOverride = null; // a day dot tapped on the Today screen; cleared on any route change
  function render() {
    const route = currentRoute();
    if (route !== lastRoute) { todayDayOverride = null; lastRoute = route; }
    setTabs(route);
    closeSheet();
    document.body.classList.toggle("onboarding", !profile && !NO_PROFILE.includes(route));
    document.body.dataset.route = route;
    // Opening a friend's stall list or a class code needs no budget; everything else asks for setup first,
    // then carries on to the link that was opened (query included, so the import still happens)
    if (!profile && route !== "setup" && !NO_PROFILE.includes(route)) { renderSetup(location.hash.replace(/^#/, "") || "home"); focusHeading(); if (typeof MakanTour !== "undefined") MakanTour.onRender(profile); return; }
    if (route === "setup") renderSetup("home");
    else if (route === "week") renderWeek();
    else if (route === "report") renderReport();
    else if (route === "plan") renderPlan();
    else if (route === "today") renderToday();
    else if (typeof EFT_TOOLS !== "undefined" && EFT_TOOLS.routes.includes(route)) EFT_TOOLS.render(route, toolsUi());
    else if (typeof MA_UI !== "undefined" && MA_UI.routes.includes(route)) MA_UI.render(route, toolsUi());
    focusHeading();
    guard();
    if (typeof MakanTour !== "undefined") MakanTour.onRender(profile);
  }

  // =============================================================
  // SETUP (a four-step wizard on first run; one form in the settings sheet)
  // =============================================================
  // First run: three steps. (The goal for weekly plans has a sensible default and lives in Setup.)
  const STEPS = [
    { id: "rules", name: "Food rules" }, { id: "allergies", name: "Allergies" }, { id: "kitchen", name: "Kitchen" }, { id: "budget", name: "Budget" }
  ];
  function profileFormHtml(p, idPrefix) {
    const k = id => `${idPrefix}-${id}`;
    const radio = (name, val, cur, title, desc) => `
      <label class="choice"><input type="radio" name="${k(name)}" value="${val}" ${cur === val ? "checked" : ""}>
        <span>${title}<small>${desc}</small></span></label>`;
    return `
      <fieldset class="field" data-part="budget">
        <legend id="${k("budget-label")}">Weekly food budget</legend>
        <span class="hint">Everything you spend on food and drinks in a normal week.</span>
        <div class="range-row">
          <input type="range" id="${k("budget-range")}" min="${BUDGET_MIN}" max="${BUDGET_MAX}" step="5" value="${p.budget}" aria-labelledby="${k("budget-label")}">
          <label class="money-input"><span>RM</span><input type="number" inputmode="numeric" id="${k("budget")}" min="${BUDGET_MIN}" max="${BUDGET_MAX}" step="1" value="${p.budget}" aria-label="Weekly budget in ringgit"></label>
        </div>
        <span class="hint num" id="${k("budget-hint")}"></span>
        <p class="budget-compare small" id="${k("budget-compare")}" aria-live="polite"></p>
        <button type="button" class="btn btn-quiet preset" id="${k("tight")}">${icon("bolt")} Tight week: RM 10 a day</button>
        <label class="switch"><span>Count Menu Rahmah RM 5 meals<small>Set meals at participating stalls and campus cafés</small></span><input type="checkbox" id="${k("rahmah")}" ${p.rahmah ? "checked" : ""}></label>
      </fieldset>
      <fieldset class="field" data-part="kitchen">
        <legend>Where you live</legend>
        <div class="choices">
          ${radio("kitchen", "hostel", p.kitchen, "Hostel room", "Kettle and a small fridge")}
          ${radio("kitchen", "shared", p.kitchen, "Shared kitchen", "Stove you can use")}
          ${radio("kitchen", "home", p.kitchen, "At home", "Family kitchen")}
        </div>
        <div id="${k("cooks-field")}" class="cooks">
          <p class="field-sub" id="${k("cooks-label")}">Meals you could realistically cook a week</p>
          <span class="hint">Lunchboxes count. Be honest: plans you can't keep don't save money.</span>
          <div class="stepper" role="group" aria-labelledby="${k("cooks-label")}">
            <button type="button" data-step="-1" aria-label="One fewer">−</button>
            <output id="${k("cooks")}" aria-live="polite">${p.cooks}</output>
            <button type="button" data-step="1" aria-label="One more">+</button>
          </div>
        </div>
      </fieldset>
      <fieldset class="field" data-part="rules">
        <legend>Food rules</legend>
        <label class="switch"><span>Halal only</span><input type="checkbox" id="${k("halal")}" ${p.diet.halal ? "checked" : ""}></label>
        <label class="switch"><span>Vegetarian<small>Eggs and dairy are fine</small></span><input type="checkbox" id="${k("veg")}" ${p.diet.vegetarian ? "checked" : ""}></label>
        <label class="switch"><span>No beef</span><input type="checkbox" id="${k("nobeef")}" ${p.diet.noBeef ? "checked" : ""}></label>
        <label class="switch"><span>I eat breakfast</span><input type="checkbox" id="${k("breakfast")}" ${p.breakfast ? "checked" : ""}></label>
        <label class="switch"><span>Weekday lunch is on campus<small>Picks for lunch are things to buy, unless you packed one</small></span><input type="checkbox" id="${k("campus")}" ${p.campusLunch ? "checked" : ""}></label>
      </fieldset>
      <fieldset class="field" data-part="allergies">
        <legend id="${k("allergy-label")}">Allergies or foods you must avoid</legend>
        <span class="hint">Meals that contain them, or often do (like sambal belacan or soy sauce), are never suggested. Stall food has no label, so still ask the seller.</span>
        <div class="chips wrap allergy-chips" role="group" aria-labelledby="${k("allergy-label")}">
          ${ALLERGENS.map(a => `<label class="chip"><input type="checkbox" class="allergy" value="${a.id}" ${(p.diet.allergies || []).includes(a.id) ? "checked" : ""}><span>${a.name}${a.hint ? `<small>${a.hint}</small>` : ""}</span></label>`).join("")}
        </div>
      </fieldset>
      <fieldset class="field" data-part="goal">
        <legend>What matters most this week</legend>
        <div class="choices">
          ${radio("goal", "money", p.goal, "Save money", "Cheapest week that still feeds you")}
          ${radio("goal", "health", p.goal, "Eat healthier", "More fruit and veg, less sugar and salt")}
          ${radio("goal", "planet", p.goal, "Lower footprint", "Less CO₂e per plate")}
        </div>
      </fieldset>`;
  }

  function readProfileForm(root, idPrefix) {
    const k = id => `${idPrefix}-${id}`;
    const q = sel => root.querySelector(sel);
    return validateProfile({
      budget: Number(q("#" + k("budget")).value),
      kitchen: (q(`input[name="${k("kitchen")}"]:checked`) || {}).value,
      goal: (q(`input[name="${k("goal")}"]:checked`) || {}).value,
      cooks: Number(q("#" + k("cooks")).textContent),
      diet: { halal: q("#" + k("halal")).checked, vegetarian: q("#" + k("veg")).checked, noBeef: q("#" + k("nobeef")).checked,
        allergies: [...root.querySelectorAll("input.allergy:checked")].map(i => i.value) },
      breakfast: q("#" + k("breakfast")).checked,
      campusLunch: q("#" + k("campus")).checked,
      rahmah: q("#" + k("rahmah")).checked,
      preset: root.dataset.preset === "tight" ? "tight" : "normal"
    });
  }

  function wireProfileForm(root, idPrefix, onChange) {
    const k = id => `${idPrefix}-${id}`;
    const range = root.querySelector("#" + k("budget-range"));
    const num = root.querySelector("#" + k("budget"));
    const out = root.querySelector("#" + k("cooks"));
    const cooksField = root.querySelector("#" + k("cooks-field"));
    const hint = root.querySelector("#" + k("budget-hint"));
    const sync = () => {
      const b = Number(num.value);
      const meals = root.querySelector("#" + k("breakfast")).checked ? 21 : 14;
      hint.textContent = Number.isFinite(b) && b >= BUDGET_MIN && b <= BUDGET_MAX
        ? `About ${rm(b / 7)} a day, ${rm(b / meals)} a meal across ${meals} meals.`
        : `Enter an amount between RM ${BUDGET_MIN} and RM ${BUDGET_MAX}.`;
      const hostel = (root.querySelector(`input[name="${k("kitchen")}"]:checked`) || {}).value === "hostel";
      cooksField.hidden = hostel;
      if (onChange) onChange();
    };
    range.addEventListener("input", () => { num.value = range.value; root.dataset.preset = ""; sync(); });
    num.addEventListener("input", () => { const v = Number(num.value); if (v >= BUDGET_MIN && v <= BUDGET_MAX) range.value = v; root.dataset.preset = ""; sync(); });
    root.querySelector("#" + k("tight")).addEventListener("click", () => {
      num.value = range.value = TIGHT_WEEK.budget;
      root.querySelector("#" + k("rahmah")).checked = true;
      const money = root.querySelector(`input[name="${k("goal")}"][value="money"]`);
      if (money) money.checked = true;
      root.dataset.preset = "tight";
      // RM 70 isn't possible for every kitchen and diet: use the cheapest week that is
      const cur = readProfileForm(root, idPrefix);
      const tw = cur ? tightWeek(cur, TIGHT_WEEK) : null;
      if (tw && tw.raised) num.value = range.value = tw.profile.budget;
      sync();
      say(tw && tw.raised
        ? `RM ${TIGHT_WEEK.budget} isn't possible with this kitchen and food rules. Budget set to the cheapest week, RM ${tw.profile.budget}. Menu Rahmah on, goal: save money`
        : `Budget set to RM ${TIGHT_WEEK.budget}, Menu Rahmah on, goal: save money`);
    });
    root.querySelectorAll("[data-step]").forEach(b => b.addEventListener("click", () => {
      const v = Math.max(0, Math.min(14, Number(out.textContent) + Number(b.dataset.step)));
      out.textContent = String(v);
      sync();
    }));
    root.querySelectorAll("input[type=radio], input[type=checkbox]").forEach(i => i.addEventListener("change", sync));
    if (((idPrefix === "su" && draft) || profile || {}).preset === "tight") root.dataset.preset = "tight";
    sync();
  }

  function setupSummary(pr) {
    if (!pr) return "Budget not set yet";
    return [rm0(pr.budget) + " a week", KITCHENS[pr.kitchen].name.split(",")[0], (pr.diet.vegetarian ? "Vegetarian" : "Meat and fish") + (pr.diet.halal ? ", halal" : "") + (pr.diet.noBeef ? ", no beef" : "")]
      .concat(pr.diet.allergies && pr.diet.allergies.length ? ["No " + pr.diet.allergies.map(allergenName).join(", ").toLowerCase()] : [], pr.rahmah ? ["Menu Rahmah"] : []).join(" · ");
  }

  function renderSetup(next) {
    const p = draft || profile || defaultProfile();
    if (setupStep >= STEPS.length) setupStep = 0;
    const last = setupStep === STEPS.length - 1;
    const nextRoute = String(next || "week").split("?")[0];
    view.innerHTML = `
      <div class="page setup">
        <section class="setup-main">
          <p class="step-count small"><span>Step ${setupStep + 1} of ${STEPS.length}</span><span class="muted">${STEPS[setupStep].name}</span></p>
          <div class="meter step-meter" aria-hidden="true"><span style="width:${((setupStep + 1) / STEPS.length) * 100}%"></span></div>
          <h1>${["Any food rules?", "Any allergies?", "Where do you eat and cook?", "How much is your food week?"][setupStep]}</h1>
          <p class="lead">${["Picks only ever show meals that fit. Everything stays on this device.", "Tick anything you must avoid. Tap Next if none.", "This decides what you can make yourself.", "Every pick fits this. You can change it any time."][setupStep]}</p>
          ${setupStep === 0 && !profile ? `<p class="promise">${icon("check")} <span><strong>Makan Apa? picks one meal for you, with the reasons.</strong> Four quick questions first, so every pick fits.</span></p>` : ""}
          <p class="setup-pinned small" id="setup-pinned" aria-live="polite"></p>
          <form id="setup-form" novalidate data-step="${STEPS[setupStep].id}">
            ${profileFormHtml(p, "su")}
            <div id="setup-error" role="alert"></div>
            <div class="btn-row wizard-nav">
              ${setupStep > 0 ? `<button class="btn btn-quiet" type="button" id="setup-back">${icon("back")} Back</button>` : ""}
              <button class="btn" type="submit">${last ? (nextRoute === "plan" ? "Make my plan" : nextRoute === "week" ? "Start the practice week" : DEST_NAME[nextRoute] || "Done") : `Next: ${STEPS[setupStep + 1].name}`} ${icon("arrow")}</button>
            </div>
          </form>
        </section>
        <aside class="setup-aside" aria-labelledby="preview-title" ${STEPS[setupStep].id === "budget" ? "" : "hidden"}>
          <h2 id="preview-title">What this budget looks like</h2>
          <div id="preview" class="preview" aria-live="polite"><p class="muted small">Working it out…</p></div>
          <p class="tiny muted">Prices are Klang Valley estimates for 2026 unless a source is shown. Rice is the controlled RM 2.60/kg price; nasi lemak, satay and beef use DOSM 2024 averages. You can enter your own prices in your plan.</p>
        </aside>
      </div>`;
    const form = document.getElementById("setup-form");
    form.querySelectorAll("[data-part]").forEach(f => { f.hidden = f.dataset.part !== STEPS[setupStep].id; });
    let t = null;
    const preview = () => {
      const pr = readProfileForm(form, "su");
      document.getElementById("setup-pinned").textContent = setupSummary(pr);
      clearTimeout(t);
      t = setTimeout(() => {
        const box = document.getElementById("preview");
        if (!box || !form.isConnected) return; // the student has already moved on
        if (!pr) { box.innerHTML = `<p class="muted">Enter a budget between RM ${BUDGET_MIN} and RM ${BUDGET_MAX}.</p>`; return; }
        const r = planFor(pr);
        const cmp = document.getElementById("su-budget-compare");
        if (cmp) cmp.textContent = r.feasible ? `Buying every meal: ${rm(r.baseline.outlay)} a week. Cheapest realistic week for you: ${rm(r.minOutlay)}.` : `Even the cheapest week with this setup costs ${rm(r.minOutlay)}.`;
        const meals = pr.breakfast ? 21 : 14;
        box.innerHTML = `
          <dl class="preview-list">
            <div><dt>Buying every meal</dt><dd class="num">${rm(r.baseline.outlay)}</dd></div>
            <div><dt>Cheapest realistic week for you</dt><dd class="num">${rm(r.minOutlay)}</dd></div>
            <div class="${r.feasible ? "" : "over"}"><dt>Your budget</dt><dd class="num">${rm(pr.budget)}</dd></div>
          </dl>
          ${r.feasible
            ? `<p class="small">${pr.budget >= r.baseline.outlay ? "You could buy every meal and stay inside this budget." : `Buying every meal would go ${rm(r.baseline.outlay - pr.budget)} over. Cooking some meals closes the gap.`}</p>`
            : `<div class="banner bad">${icon("alert")}<p>Even the cheapest week for ${meals} meals with this setup costs ${rm(r.minOutlay)}.${pr.rahmah ? "" : " Menu Rahmah meals may close the gap."}</p></div>`}`;
      }, 350);
    };
    wireProfileForm(form, "su", preview);
    const save = target => {
      const pr = readProfileForm(form, "su");
      const changed = !profile || JSON.stringify(profile) !== JSON.stringify(pr);
      profile = pr;
      storeSet(KEYS.profile, profile);
      if (changed) { storeRemove(KEYS.sim); sim = null; dropPlan("setup changed"); }
      setupStep = 0;
      draft = null;
      go(target);
    };
    const stepValid = () => {
      const b = Number(form.querySelector("#su-budget").value);
      if (STEPS[setupStep].id === "budget" && !(Number.isFinite(b) && b >= BUDGET_MIN && b <= BUDGET_MAX)) {
        showError(document.getElementById("setup-error"), `Enter a weekly budget between RM ${BUDGET_MIN} and RM ${BUDGET_MAX}.`, form);
        form.querySelector("#su-budget").focus();
        return false;
      }
      return !!readProfileForm(form, "su") || setupStep < STEPS.length - 1;
    };
    const stay = () => { draft = readProfileForm(form, "su") || draft; }; // keep answers between steps
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (busy || !stepValid()) return;
      if (setupStep < STEPS.length - 1) {
        stay();
        setupStep++;
        renderSetupWith(next);
        return;
      }
      save(next || "home");
    });
    const back = document.getElementById("setup-back");
    if (back) back.addEventListener("click", () => { stay(); setupStep--; renderSetupWith(next); });
    const skip = document.getElementById("setup-plan");
    if (skip) skip.addEventListener("click", () => { if (stepValid()) save("plan"); });
  }
  function renderSetupWith(next) {
    renderSetup(next);
    focusHeading();
    guard();
  }

  function openSettings() {
    const p = profile || defaultProfile();
    openSheet("My setup", `
      <p class="settings-tour-link"><button type="button" class="btn btn-quiet" data-replay-tour>Show me around ${icon("arrow")}</button></p><form id="settings-form" novalidate>
        ${profileFormHtml(p, "st")}
        <div id="settings-error" role="alert"></div>
        <div class="banner" id="settings-note">${icon("info")}<p>Saving a change restarts the week simulation and remakes your plan, so both fit your new setup.${logHasEntries(validateLog(storeGet(KEYS.checkin, null))) ? " This week's check-in ticks move to Past weeks on the Today tab." : ""}</p></div>
        <div class="sheet-actions"><button class="btn" type="submit">${icon("check")} Save setup</button>
          <button class="btn btn-quiet" type="button" id="st-prices">${icon("tag")} My prices</button></div>
      </form>`, root => {
      const form = root.querySelector("#settings-form");
      wireProfileForm(form, "st");
      root.querySelector("#st-prices").addEventListener("click", openPrices);
      form.addEventListener("submit", e => {
        e.preventDefault();
        const pr = readProfileForm(form, "st");
        if (!pr) { showError(root.querySelector("#settings-error"), `Enter a weekly budget between RM ${BUDGET_MIN} and RM ${BUDGET_MAX}.`, form); return; }
        const changed = JSON.stringify(profile) !== JSON.stringify(pr);
        profile = pr;
        storeSet(KEYS.profile, profile);
        if (changed) { storeRemove(KEYS.sim); sim = null; lastResult = null; dropPlan("setup changed"); }
        closeSheet();
        render();
        say(changed ? "Setup saved" : "Nothing changed");
      });
    });
  }
  document.querySelectorAll("[data-open-settings]").forEach(b => b.addEventListener("click", () => {
    if (!profile) { go("setup"); return; }
    openSettings();
  }));

  // ---------- My prices ----------
  function openPrices() {
    const saved = cleanPriceOverrides(storeGet(KEYS.prices, null));
    const diet = profile ? profile.diet : { halal: true, vegetarian: false };
    const meals = MEALS.filter(m => m.source === "buy" && m.id !== "skip" && m.id !== "water" && fitsDiet(m, diet))
      .sort((a, b) => a.price - b.price);
    const row = (kind, id, name, base) => `<li class="price-row"><label for="pr-${kind}-${id}">${esc(name)}</label>
      <span class="money-input"><span>RM</span><input id="pr-${kind}-${id}" data-kind="${kind}" data-id="${id}" type="number" inputmode="decimal" min="${PRICE_MIN}" max="${PRICE_MAX}" step="0.1"
        placeholder="${base.toFixed(2)}" value="${saved[kind][id] !== undefined ? saved[kind][id] : ""}"></span></li>`;
    openSheet("My prices", `
      <p class="small">Type what things cost where you shop. Leave a box empty to use our estimate (shown greyed out). Your prices stay on this device and are used in the week, your plan and the check-in.</p>
      <form id="prices-form" novalidate>
        <h3 class="sheet-sub">Groceries</h3>
        <ul class="price-list">${Object.keys(PACKS).filter(id => !["oil", "sugar"].includes(id)).map(id => row("packs", id, PACKS[id].name, PACKS[id].rm)).join("")}</ul>
        <h3 class="sheet-sub">Bought meals</h3>
        <ul class="price-list">${meals.map(m => row("meals", m.id, m.name, m.price)).join("")}</ul>
        <div id="prices-error" role="alert"></div>
        <div class="sheet-actions"><button class="btn" type="submit">${icon("check")} Save my prices</button>
          <button class="btn btn-quiet" type="button" id="prices-reset">${icon("refresh")} Use estimates</button></div>
      </form>`, root => {
      const form = root.querySelector("#prices-form");
      form.addEventListener("submit", e => {
        e.preventDefault();
        const raw = { meals: {}, packs: {} };
        let bad = null;
        form.querySelectorAll("input[data-id]").forEach(inp => {
          if (inp.value.trim() === "") return;
          const v = Number(inp.value);
          if (!Number.isFinite(v) || v < PRICE_MIN || v > PRICE_MAX) { bad = bad || inp; return; }
          raw[inp.dataset.kind][inp.dataset.id] = v;
        });
        if (bad) {
          showError(root.querySelector("#prices-error"), `Prices need to be between RM ${PRICE_MIN.toFixed(2)} and RM ${PRICE_MAX}. Check “${esc(bad.closest("li").querySelector("label").textContent)}”.`, form);
          bad.focus();
          return;
        }
        const clean = setPriceOverrides(raw);
        storeSet(KEYS.prices, clean);
        closeSheet(); render();
        say(`Saved ${Object.keys(clean.meals).length + Object.keys(clean.packs).length} prices`);
      });
      root.querySelector("#prices-reset").addEventListener("click", () => {
        setPriceOverrides({}); storeRemove(KEYS.prices); closeSheet(); render(); say("Back to estimated prices");
      });
    });
  }

  // =============================================================
  // WEEK SIMULATION
  // =============================================================
  function ensureSim() {
    if (sim) return sim;
    sim = loadSim();
    if (!sim) { sim = newSim(profile); advance(sim); saveSim(); }
    return sim;
  }
  // While a result is on screen, the week display stays on the day it happened
  const shownDay = s => lastResult ? lastResult.day : (s.done ? 7 : (currentScene(s) ? currentScene(s).day : 7));

  function dayStripHtml(s) {
    const curDay = shownDay(s);
    const items = [{ d: -1, label: "Prep" }].concat(DAY_SHORT.map((n, i) => ({ d: i, label: n })));
    return `<ol class="daystrip" aria-label="Week progress">${items.map(it => {
      const state = it.d < curDay ? "done" : it.d === curDay ? "now" : "next";
      return `<li class="${state}" ${state === "now" ? 'aria-current="step"' : ""}><span>${it.label}</span></li>`;
    }).join("")}</ol>`;
  }

  // The running envelope + metrics (desktop rail and phone sheet share this)
  function statusHtml(s) {
    const t = totals(s);
    const ref = referenceDay();
    const daysIn = Math.max(1, Math.min(7, shownDay(s) + 1));
    const left = moneyLeft(s);
    const pct = Math.min(100, (t.spent / (t.budget + t.borrowed)) * 100);
    const fvAvg = Math.round(t.days.slice(0, daysIn).reduce((a, d) => a + d.fv, 0) / daysIn);
    const started = s.decisions.length > 0;
    return `
      <div class="envelope">
        <div class="env-head"><span>${icon("wallet")} Food money</span><span class="num ${left < 5 ? "bad" : ""}">${rm(left)} left</span></div>
        <div class="meter ${left < 5 ? "over" : ""}" role="img" aria-label="${rm(t.spent)} spent of ${rm(t.budget + t.borrowed)}"><span style="width:${pct}%"></span></div>
        <div class="env-foot num"><span>${rm(t.spent)} spent</span><span>of ${rm0(t.budget)}${t.borrowed ? ` + ${rm0(t.borrowed)} borrowed` : ""}</span></div>
      </div>
      ${started ? `<dl class="metrics">
        <div><dt>${icon("cloud")} Footprint</dt><dd><span class="num">${kg(t.co2)} CO₂e</span><span class="sub">reference pace ${kg(ref.co2 * daysIn)}</span></dd></div>
        <div><dt>${icon("leaf")} Fruit &amp; veg</dt><dd><span class="num">${fvAvg} g a day</span><span class="sub">WHO: at least ${FV_TARGET_G} g</span></dd></div>
        <div><dt>${icon("drop")} Sugary or salty</dt><dd><span class="num">${t.sugary} sugary, ${t.salty} salty</span><span class="sub">picks so far</span></dd></div>
      </dl>` : `<p class="small muted rail-wait">Footprint and fruit &amp; veg appear after your first decision, so you don't pick by the numbers before you've seen the options.</p>`}`;
  }

  function receiptHtml(s) {
    const t = totals(s);
    if (!s.lines.length) return `<div class="receipt"><p class="receipt-empty">Your receipt fills up as the week goes. Every meal lands here, including the ones your habits decide.</p></div>`;
    const byDay = {};
    s.lines.forEach(l => { (byDay[l.day] = byDay[l.day] || []).push(l); });
    const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
    return `<div class="receipt" role="table" aria-label="Receipt">
      ${days.map(d => `
        <div class="r-day" role="rowgroup">
          <div class="r-dayname" role="row"><span role="columnheader">${d < 0 ? "Sunday before" : DAY_NAMES[d]}</span><span role="columnheader" class="r-amt">RM</span></div>
          ${byDay[d].map(l => `<div class="r-line ${l.kind === "habit" ? "habit" : ""} ${l.kind === "borrow" ? "borrow" : ""}" role="row">
              <span role="cell">${esc(l.label)}${l.kind === "habit" ? ' <em>habit</em>' : ""}${l.fee ? ` <em>+fee</em>` : ""}</span>
              <span role="cell" class="r-amt">${l.kind === "borrow" ? "+" + l.borrow.toFixed(2) : l.cash ? l.cash.toFixed(2) : (l.home ? "home" : "–")}</span></div>`).join("")}
        </div>`).join("")}
      <div class="r-total" role="row"><span role="cell">Total spent</span><span role="cell" class="r-amt">${t.spent.toFixed(2)}</span></div>
    </div>`;
  }

  function optionCost(o) {
    if (o.kind === "none" || o.kind === "borrow") return null;
    if (o.cash > 0) return { text: rm(o.cash), soft: false };
    if (o.kind === "basket" && !o.basket) return { text: "RM 0.00", soft: false };
    if (o.meal && o.meal.source === "buy") return { text: "RM 0.00", soft: false };
    if (o.stats && o.stats.rm > 0 && o.kind !== "basket") return { text: `From stock ≈ ${rm(o.stats.rm)}`, soft: true };
    return { text: "From stock", soft: true };
  }
  function optionPreviewHtml(o) {
    const tag = o.kind === "basket" ? (o.basket ? "Groceries" : "No shop") : o.kind === "prep" ? "Cook ahead" : o.kind === "lunchbox" ? "Lunchbox" :
      o.kind === "useup" ? "Use it up" : o.meal ? (o.meal.source === "buy" ? VENUES[o.meal.venue] : o.meal.source === "cook" ? "Cook" : "Kettle") : "";
    const cost = optionCost(o);
    return `<span class="opt-main"><span class="opt-label">${esc(o.label)}</span>
      <span class="opt-meta">${tag ? `<span class="opt-tag">${esc(tag)}</span>` : ""}${o.meal && o.meal.rahmah ? `<span class="opt-tag rahmah">Menu Rahmah</span>` : ""}${o.fee ? `<span class="opt-fee">incl. ${rm(o.fee)} ${esc(o.feeLabel)}</span>` : ""}${!o.available ? `<span class="opt-lock">${icon("lock")}${esc(o.reason || "Not available")}</span>` : ""}</span></span>
      ${cost ? `<span class="opt-price ${cost.soft ? "soft" : ""}">${cost.text}</span>` : ""}`;
  }

  // What an option really costs: stall price, or ingredients for home food
  const realCost = o => (o.cash > 0 ? o.cash : (o.stats ? o.stats.rm : 0));
  const optName = o => (o.meal ? shortName(o.meal) : o.label.toLowerCase());
  function compareSentence(chosen, others) {
    if (!chosen.stats || !others.length) return "";
    const all = [chosen, ...others];
    const minCost = Math.min(...all.map(realCost));
    const minCo2 = Math.min(...all.map(o => o.stats.co2));
    const cheapest = all.find(o => realCost(o) === minCost);
    const greenest = all.find(o => o.stats.co2 === minCo2);
    const parts = [];
    const mine = realCost(chosen);
    if (mine === minCost) parts.push("The cheapest option here.");
    else parts.push(`${rm(mine - minCost)} more than ${esc(optName(cheapest))}${cheapest.cash > 0 ? "" : " (ingredient cost)"}.`);
    if (chosen.stats.co2 === minCo2) parts.push("The lowest footprint here.");
    else if (minCo2 > 0 && chosen.stats.co2 / minCo2 >= 1.8) parts.push(`About ${Math.round(chosen.stats.co2 / minCo2)}× the footprint of ${esc(optName(greenest))}.`);
    if (chosen.stats.fv >= 120) parts.push(`${Math.round((chosen.stats.fv / FV_TARGET_G) * 100)}% of today's fruit and veg.`);
    return parts.join(" ");
  }

  const SLOT_WORD = { B: "breakfast", L: "lunch", D: "dinner", X: "afternoon", N: "late night" };
  function meanwhileHtml(res) {
    const listed = [res.line].concat(res.meanwhile || []).filter(Boolean);
    const sum = k => listed.reduce((a, l) => a + (l[k] || 0), 0);
    const cash = round2(sum("cash")), co2 = Math.round(sum("co2") * 100) / 100, fv = Math.round(sum("fv"));
    const mw = res.meanwhile || [];
    const habitCash = round2(mw.reduce((a, l) => a + l.cash, 0));
    return `${mw.length ? `<section class="meanwhile" aria-labelledby="mw-title">
        <h2 id="mw-title" class="mw-title">${icon("clock")} Meanwhile, your habits filled in ${mw.length} meal${mw.length > 1 ? "s" : ""}</h2>
        <ul class="mw-list">${mw.map(l => `<li><span class="mw-when">${DAY_SHORT[l.day] || ""} ${SLOT_WORD[l.slot] || ""}</span><span class="mw-what">${esc(l.label)}</span><span class="mw-rm num">${l.cash ? rm(l.cash) : l.home ? "home" : "RM 0.00"}</span></li>`).join("")}</ul>
        ${habitCash > 0 ? `<p class="small muted">Habits cost ${rm(habitCash)} here without a single decision. That's what a routine does.</p>` : ""}
      </section>` : ""}
      <p class="delta small" data-delta-cash="${cash}" data-delta-co2="${co2}" data-delta-fv="${fv}"><strong>Change since your last decision:</strong>
        <span class="num">${cash ? "−" + rm(cash) : "RM 0.00"}</span> money ·
        <span class="num">${signedKg(co2)}</span> CO₂e ·
        <span class="num">${signedG(fv)}</span> fruit &amp; veg</p>`;
  }

  function resultHtml(res) {
    const c = res.chosen;
    const others = res.options.filter(o => o.id !== c.id && o.available && o.stats);
    let body = "";
    if (c.kind === "basket") {
      body = c.basket
        ? `<p>${rm(c.cash)} now for ${c.basket.length} packs. Meals cooked from them cost about RM 2–3 a plate later in the week, against RM 6–9 at a stall.</p>`
        : `<p>No groceries this week. Every meal will be bought.</p>`;
    } else if (c.kind === "prep") {
      body = `<p>${esc(res.line.label)}. Each box cost about ${rm(c.stats ? c.stats.rm : mealStats(c.meal).rm)} in ingredients.</p>`;
    } else if (c.kind !== "none" && res.line) {
      const l = res.line;
      body = `<dl class="result-figures">
          <div><dt>Paid</dt><dd class="num">${l.cash ? rm(l.cash) : (l.home ? "From your groceries" : "RM 0.00")}</dd></div>
          <div><dt>CO₂e</dt><dd class="num">${kg(l.co2)}</dd></div>
          <div><dt>Fruit &amp; veg</dt><dd class="num">${Math.round(l.fv)} g</dd></div>
          ${l.sugary || l.salty ? `<div class="watch"><dt>Watch</dt><dd>${l.sugary ? '<span class="tag flag">Sugary</span> ' : ""}${l.salty ? '<span class="tag flag">Salty</span>' : ""}</dd></div>` : ""}
        </dl>
        <p class="compare">${compareSentence(c, others)}</p>
        ${l.binnedRm > 0.5 ? `<p class="note">${rm(l.binnedRm)} of fresh food was still left and won't keep another week.</p>` : ""}`;
    }
    const note = c.note ? `<p class="note">${esc(c.note.text)}${sourceLink(c.note.src)}</p>` : "";
    const social = c.social ? `<p class="note">${esc(c.social)}</p>` : "";
    const rows = [c, ...others].filter(o => o.stats);
    const table = others.length ? `
      <details class="others">
        <summary>Compare with the other options</summary>
        <ul class="cmp" aria-label="Options compared">
          <li class="cmp-head" aria-hidden="true"><span>Option</span><span>Cost</span><span>CO₂e</span><span>Fruit &amp; veg</span></li>
          ${rows.map(o => `<li class="cmp-row ${o.id === c.id ? "mine" : ""}"><span class="cmp-name">${esc(o.label)}${o.id === c.id ? " <em>(yours)</em>" : ""}</span>
            <span class="cmp-v"><span class="cmp-k">Cost</span>${o.cash ? rm(o.cash) : `≈${rm(o.stats.rm)} home`}</span>
            <span class="cmp-v"><span class="cmp-k">CO₂e</span>${o.stats.co2.toFixed(2)} kg</span>
            <span class="cmp-v"><span class="cmp-k">Fruit &amp; veg</span>${Math.round(o.stats.fv)} g</span></li>`).join("")}
        </ul>
      </details>` : "";
    return `<div class="result">
        <p class="result-choice">${icon("check")}<span>${esc(c.label)}</span></p>
        ${body}${meanwhileHtml(res)}${note}${social}${table}
      </div>`;
  }

  function calibrationHtml() {
    const qs = calibrationQuestions();
    return `
      <article class="scene calib">
        <p class="scene-time">${icon("info")} Before the week starts</p>
        <h1>Guess first</h1>
        <p class="scene-text">Three quick guesses. You'll see how close you were in your week report, not now.</p>
        <form id="calib-form">
          ${qs.map(q => `<fieldset class="field"><legend>${esc(q.text)}</legend><div class="choices">
            ${q.options.map(o => `<label class="choice"><input type="radio" name="${q.id}" value="${esc(o.id)}"><span>${esc(o.label)}</span></label>`).join("")}
          </div></fieldset>`).join("")}
          <div class="btn-row"><button class="btn" type="submit">Lock in my guesses</button><button class="btn btn-quiet" type="button" id="calib-skip">Skip the guesses</button></div>
        </form>
      </article>`;
  }

  function stakeHtml(opts) {
    const costs = opts.filter(o => o.available && o.kind !== "borrow" && o.kind !== "none").map(realCost);
    if (costs.length < 2) return "";
    const lo = Math.min(...costs), hi = Math.max(...costs);
    if (hi - lo < 0.5) return "";
    return `<span class="stake">At stake: ${rm(hi - lo)}</span>`;
  }

  function renderWeek() {
    const s = ensureSim();
    if (s.done && !lastResult) { redirect("report"); return; }
    const sc = currentScene(s);
    let stage;
    if (lastResult) {
      const r = lastResult;
      stage = `<article class="scene result-scene">
          <p class="scene-time">${icon("clock")} ${esc(r.time)}</p>
          <h1>${esc(r.title)}</h1>
          ${resultHtml(r)}
          <div class="next-bar"><button class="btn" id="next-btn" type="button">${s.done ? "See my week report" : "Next"} ${icon("arrow")}</button></div>
        </article>`;
    } else if (s.guesses === null && s.decisions.length === 0) {
      stage = calibrationHtml();
    } else {
      const opts = visibleOptions(s, sc);
      const choices = opts.filter(o => o.kind !== "borrow");
      const borrow = opts.find(o => o.kind === "borrow");
      const locked = choices.filter(o => o.broke).length;
      const kindLabel = { curveball: "Curveball", plan: "Plan ahead", extra: "Extra", meal: "" }[sc.kind] || "";
      stage = `<article class="scene ${sc.kind}">
          ${sc.kind === "curveball" ? `<div class="curve-bar">${icon("alert")}<span>Curveball</span>${stakeHtml(opts)}</div>` : ""}
          <p class="scene-time">${icon("clock")} ${esc(sc.time)}${kindLabel && sc.kind !== "curveball" ? `<span class="scene-kind">${kindLabel}</span>` : ""}${sc.kind !== "curveball" ? stakeHtml(opts) : ""}</p>
          <h1>${esc(textOf(sc.title, s))}</h1>
          <p class="scene-text">${esc(textOf(sc.text, s))}</p>
          ${locked ? `<div class="banner bad broke">${icon("wallet")}<div><p><strong>${rm(moneyLeft(s))} left.</strong> ${locked} option${locked > 1 ? "s are" : " is"} locked until you have the money.${borrow ? ` Borrowing unlocks them, but next week starts ${rm0(BORROW_STEP)} short.` : " You've borrowed as much as a housemate will lend."}</p>
            ${borrow ? `<div class="banner-actions"><button type="button" class="btn btn-quiet" id="borrow-btn">${icon("users")} Borrow ${rm0(BORROW_STEP)} from a housemate</button></div>` : ""}</div></div>` : ""}
          <ol class="options" aria-label="Your options">
            ${choices.map((o, i) => o.available
              ? `<li><button type="button" class="option" data-id="${esc(o.id)}" aria-keyshortcuts="${i + 1}">${optionPreviewHtml(o)}</button></li>`
              : `<li><div class="option locked ${o.broke ? "broke" : ""}" aria-disabled="true">${optionPreviewHtml(o)}</div></li>`).join("")}
          </ol>
          <p class="tiny muted kbd-hint">Prices are shown; footprints are revealed after you choose. Keys 1–${choices.filter(o => o.available).length} pick an option.</p>
        </article>`;
    }
    const left = moneyLeft(s);
    view.innerHTML = `
      <div class="page week ${lastResult ? "has-next" : ""}">
        <div class="week-main">
          <div class="week-top">${dayStripHtml(s)}</div>
          <div class="hud" aria-label="This week so far">
            <span class="hud-item num ${left < 5 ? "bad" : ""}" data-left="${left}">${icon("wallet")}${rm(left)} left</span>
            <span class="hud-item num" data-co2="${totals(s).co2}">${icon("cloud")}${kg(totals(s).co2)} CO₂e</span>
            <button type="button" class="btn btn-quiet hud-btn" id="hud-receipt">${icon("receipt")} Receipt</button>
          </div>
          ${stage}
          ${weekSoFarHtml(s)}
        </div>
        <aside class="week-rail" aria-labelledby="rail-title">
          <h2 id="rail-title" class="rail-title">This week</h2>
          ${statusHtml(s)}
          <h3 class="rail-sub">${icon("receipt")} Receipt</h3>
          <div class="rail-receipt" tabindex="0" role="region" aria-label="Receipt so far, scrolls">${receiptHtml(s)}</div>
        </aside>
      </div>`;
    const rr = view.querySelector(".rail-receipt");
    if (rr) rr.scrollTop = rr.scrollHeight; // newest lines in view
    wireWeek(s);
  }

  // Day-by-day running totals (tablet and desktop; phones use the receipt sheet)
  function weekSoFarHtml(s) {
    const t = totals(s);
    const upTo = shownDay(s);
    const cell = (d, v) => (d <= upTo ? v : '<span class="muted">–</span>');
    return `<section class="sofar" aria-labelledby="sofar-title">
      <h2 id="sofar-title" class="sofar-title">Week so far</h2>
      <div class="sofar-scroll" tabindex="0" role="region" aria-label="Week so far"><table class="sofar-table">
        <thead><tr><th scope="col"><span class="sr-only">Measure</span></th>${DAY_SHORT.map((d, i) => `<th scope="col" class="${i === upTo ? "now" : ""}">${d}</th>`).join("")}</tr></thead>
        <tbody>
          <tr><th scope="row">RM spent</th>${t.days.map((x, d) => `<td class="num">${cell(d, x.cash ? x.cash.toFixed(0) : "0")}</td>`).join("")}</tr>
          <tr><th scope="row">kg CO₂e</th>${t.days.map((x, d) => `<td class="num">${cell(d, x.co2.toFixed(1))}</td>`).join("")}</tr>
          <tr><th scope="row">Fruit &amp; veg g</th>${t.days.map((x, d) => `<td class="num ${d <= upTo && x.fv >= FV_TARGET_G ? "met" : ""}">${cell(d, Math.round(x.fv))}</td>`).join("")}</tr>
        </tbody></table></div>
      <p class="tiny muted">Meals you don't decide repeat your last choice for that meal, like a real habit.</p>
    </section>`;
  }

  function wireWeek(s) {
    const next = document.getElementById("next-btn");
    if (next) {
      next.focus({ preventScroll: true });
      next.addEventListener("click", () => {
        if (busy) return;
        lastResult = null;
        if (s.done) finishWeek(); else { renderWeek(); focusHeading(); guard(); }
      });
    }
    document.getElementById("hud-receipt").addEventListener("click", () => openSheet("This week", `<div class="rail-in-sheet">${statusHtml(s)}<h3 class="rail-sub">${icon("receipt")} Receipt</h3>${receiptHtml(s)}</div>`));
    const borrow = document.getElementById("borrow-btn");
    if (borrow) borrow.addEventListener("click", () => {
      if (busy) return;
      try { choose(s, "borrow"); } catch (e) { return; }
      saveSim(); renderWeek();
      say(`Borrowed ${rm0(BORROW_STEP)}. ${rm(moneyLeft(s))} left.`);
      const first = view.querySelector("button.option");
      if (first) first.focus();
      guard();
    });
    const calib = document.getElementById("calib-form");
    if (calib) {
      calib.addEventListener("submit", e => {
        e.preventDefault();
        const g = {};
        calibrationQuestions().forEach(q => { const c = calib.querySelector(`input[name="${q.id}"]:checked`); if (c) g[q.id] = c.value; });
        s.guesses = g; saveSim(); renderWeek(); focusHeading(); guard();
      });
      document.getElementById("calib-skip").addEventListener("click", () => { s.guesses = {}; saveSim(); renderWeek(); focusHeading(); guard(); });
      return;
    }
    view.querySelectorAll("button.option").forEach(btn => btn.addEventListener("click", () => pick(btn.dataset.id)));
  }

  function pick(optionId) {
    if (busy || !sim || lastResult) return;
    const sc = currentScene(sim);
    if (!sc) return;
    const before = visibleOptions(sim, sc);
    const time = sc.time, title = textOf(sc.title, sim), day = sc.day;
    let res;
    try { res = choose(sim, optionId); } catch (e) { return; }
    const chosen = before.find(o => o.id === optionId);
    lastResult = { time, title, day, options: before, chosen, line: res.line, meanwhile: res.meanwhile || [] };
    saveSim();
    if (sim.done) storeSet(KEYS.report, { at: Date.now(), sim: serializeSim(sim) }); // a reload on the last screen keeps the report
    renderWeek();
    view.scrollTo(0, 0);
    say(`Chose ${chosen.label}. ${rm(moneyLeft(sim))} left.`);
    guard();
  }

  document.addEventListener("keydown", e => {
    if (currentRoute() !== "week" || lastResult || busy || sheet.open || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!/^[1-9]$/.test(e.key)) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    const b = view.querySelectorAll("button.option")[Number(e.key) - 1];
    if (b) { e.preventDefault(); b.click(); }
  });

  function finishWeek() {
    storeSet(KEYS.report, { at: Date.now(), sim: serializeSim(sim) });
    go("report");
  }

  // =============================================================
  // WEEK REPORT — one number per card, swipeable on phones
  // =============================================================
  function loadFinishedSim() {
    if (sim && sim.done) return sim;
    const saved = storeGet(KEYS.report, null);
    if (!saved || !saved.sim) return null;
    const s = restoreSim(saved.sim, validateProfile);
    return s && s.done ? s : null;
  }

  function renderReport() {
    const s = loadFinishedSim();
    if (!s) {
      const playing = sim || loadSim();
      const n = playing ? playing.decisions.length : 0;
      view.innerHTML = `<div class="page narrow empty">
        <h1>${n ? "Your report is waiting for Sunday" : "No week played yet"}</h1>
        <p class="lead">${n ? `You've made ${n} decisions so far. Finish the week and your report shows where the money went, your footprint against a reference week, and the one habit worth changing.` : "Play one simulated week, about ten minutes and 16 decisions. Your report shows where the money went, your footprint against a reference week, and the one habit worth changing."}</p>
        <div class="btn-row"><a class="btn" href="#week">${icon("play")} ${n ? "Carry on with the week" : "Start the week"}</a><a class="btn btn-quiet" href="#plan">${icon("calendar")} Skip to my real plan</a></div></div>`;
      return;
    }
    const r = buildReport(s);
    const t = r.totals;
    const maxDayFv = Math.max(FV_TARGET_G, ...t.days.map(d => d.fv));
    const pct = n => Math.max(2, Math.min(100, n));
    const right = r.guesses ? r.guesses.filter(g => g.right).length : 0;
    const cards = [];
    cards.push(`<section class="wcard money" aria-labelledby="w-money">
      <h2 id="w-money">Money</h2>
      <p class="w-big num ${t.borrowed ? "bad" : ""}">${rm(t.spent)}</p>
      <p class="w-label">spent of your ${rm0(t.budget)} budget${t.borrowed ? `, plus ${rm0(t.borrowed)} borrowed` : `, ${rm(t.left)} left`}</p>
      <dl class="kv">
        <div><dt>Groceries</dt><dd class="num">${rm(t.grocery)}</dd></div>
        <div><dt>Bought food and drinks</dt><dd class="num">${rm(t.spent - t.grocery - t.fees)}</dd></div>
        <div><dt>Delivery fees and service charges</dt><dd class="num">${rm(t.fees)}</dd></div>
      </dl>
      ${r.topSpend.length ? `<p class="small">Biggest: ${r.topSpend.map(l => `${esc(l.label)} (${rm(l.cash)})`).join(", ")}.</p>` : ""}
    </section>`);
    cards.push(`<section class="wcard footprint" aria-labelledby="w-co2">
      <h2 id="w-co2">Footprint</h2>
      <p class="w-big num">${kg(t.co2)}</p>
      <p class="w-label">CO₂e this week</p>
      <div class="bars">
        <div class="bar-row"><span>You</span><span class="bar"><span style="width:${pct((t.co2 / Math.max(t.co2, r.referenceWeek.co2)) * 100)}%"></span></span><span class="num">${kg(t.co2)}</span></div>
        <div class="bar-row ref"><span>Reference</span><span class="bar"><span style="width:${pct((r.referenceWeek.co2 / Math.max(t.co2, r.referenceWeek.co2)) * 100)}%"></span></span><span class="num">${kg(r.referenceWeek.co2)}</span></div>
      </div>
      <p class="small muted">Reference week: oats and banana, tofu economy rice and home-cooked dhal every day.</p>
      ${r.topCo2.length ? `<p class="small">Heaviest: ${r.topCo2.map(l => `${esc(l.label)} (${l.co2.toFixed(1)} kg)`).join(", ")}.</p>` : ""}
    </section>`);
    cards.push(`<section class="wcard plants" aria-labelledby="w-fv">
      <h2 id="w-fv">Fruit &amp; veg</h2>
      <p class="w-big num">${r.fvDaysMet} of 7</p>
      <p class="w-label">days with WHO's 400 g · ${t.fvPerDay} g a day on average</p>
      <div class="dayfv" role="img" aria-label="Fruit and vegetables per day: ${t.days.map((d, i) => `${DAY_SHORT[i]} ${Math.round(d.fv)} grams`).join(", ")}">
        ${t.days.map((d, i) => `<div class="dayfv-col"><span class="dayfv-bar ${d.fv >= FV_TARGET_G ? "met" : ""}" style="height:${pct((d.fv / maxDayFv) * 100)}%"></span><span class="dayfv-label">${DAY_SHORT[i]}</span></div>`).join("")}
      </div>
      <p class="small">${t.sugary} sugary and ${t.salty} salty picks.</p>
    </section>`);
    if (r.worst) {
      const alt = r.worst.bestAlt;
      const save = round2(Math.max(0, r.worst.d.cash - alt.cash));
      const times = Math.max(1, (r.worst.repeated || 0) + 1);
      cards.push(`<section class="wcard habit" aria-labelledby="w-habit">
        <h2 id="w-habit">The habit worth changing</h2>
        <p class="w-big num">${save > 0 ? rm(save * times) : `${(Math.max(0, r.worst.d.co2 - alt.co2) * times).toFixed(1)} kg`}</p>
        <p class="w-label">${save > 0 ? "more than the better option" : "more CO₂e than the better option"}${times > 1 ? `, across ${times} meals` : ""}</p>
        <p class="small"><strong>${esc(r.worst.d.label)}</strong>, ${dayLabel(r.worst.d.day, r.worst.d.slot)}${times > 1 ? `, repeated by habit ${times - 1} more time${times > 2 ? "s" : ""}` : ""}. ${callWhy(r.worst.d, alt, false)}</p>
        ${r.best ? `<p class="small muted">Best call: ${esc(r.best.d.label)}, ${dayLabel(r.best.d.day, r.best.d.slot)}.</p>` : ""}
      </section>`);
    } else if (r.best) {
      cards.push(`<section class="wcard habit" aria-labelledby="w-habit">
        <h2 id="w-habit">Best call</h2>
        <p class="w-big">${esc(r.best.d.label)}</p>
        <p class="small">${dayLabel(r.best.d.day, r.best.d.slot)}. ${callWhy(r.best.d, r.best.bestAlt, true)}</p>
      </section>`);
    }
    cards.push(`<section class="wcard kitchen" aria-labelledby="w-kit">
      <h2 id="w-kit">Your kitchen</h2>
      <p class="w-big num">${t.homeMeals} of ${t.meals}</p>
      <p class="w-label">meals from your own food</p>
      ${t.leftover > 0.5
        ? `<p class="small">${rm(t.leftover)} of groceries are left, ${rm(t.perishableLeft)} of it fresh food that won't last another week. Households cause about 60% of food waste.${sourceLink("UNEP")}</p>`
        : `<p class="small">${t.grocery > 0 ? "You used up what you bought. Nothing went to waste." : "No groceries, so every meal paid stall prices."}</p>`}
    </section>`);
    if (r.guesses) cards.push(`<section class="wcard guesses" aria-labelledby="w-g">
      <h2 id="w-g">Your guesses</h2>
      <p class="w-big num">${right} of ${r.guesses.length}</p>
      <p class="w-label">right before the week</p>
      <ol class="guess-list">${r.guesses.map(g => {
        const ans = (g.q.options.find(o => o.id === g.q.answer) || {}).label || "";
        const mine = (g.q.options.find(o => o.id === g.guess) || {}).label || "";
        return `<li class="${g.right ? "right" : "wrong"}"><p class="g-q">${g.right ? icon("check") : `<span class="g-x" aria-hidden="true">✗</span>`}<span>${esc(g.q.text)}</span></p>
          <p class="small">${g.guess === null ? "Skipped." : g.right ? `<span class="sr-only">Right. </span>${esc(ans)}.` : `<span class="sr-only">Wrong. </span>You said ${esc(mine)}; answer: <strong>${esc(ans)}</strong>.`} ${esc(g.q.explain)}</p></li>`;
      }).join("")}</ol>
    </section>`);
    view.innerHTML = `
      <div class="page report">
        <header class="report-head">
          <p class="eyebrow-free muted">Your week, wrapped</p>
          <h1>${esc(r.archetype.name)}</h1>
          <p class="lead">${esc(r.archetype.why)} ${esc(r.archetype.tip)}</p>
          <div class="btn-row">
            <a class="btn" href="#plan">${icon("calendar")} Plan my real week</a>
            <button class="btn btn-quiet" type="button" id="share-btn">${icon("download")} Share image</button>
            <button class="btn btn-ghost" type="button" id="again-btn">${icon("refresh")} Play again</button>
          </div>
        </header>
        <div class="wrapped" tabindex="0" role="region" aria-label="Week report cards, swipe or scroll sideways on phones">${cards.join("")}</div>
        <p class="tiny muted swipe-hint">Swipe for ${cards.length - 1} more cards.</p>
        <footer class="report-foot small muted">
          <p>How to read this: footprints are global averages per kg of food (Poore &amp; Nemecek 2018) applied to our portion estimates; real values vary by farm and supplier. Prices are 2026 Klang Valley estimates unless a source is named. One simulated week, not a verdict on your diet.</p>
        </footer>
      </div>`;
    document.getElementById("again-btn").addEventListener("click", () => {
      storeRemove(KEYS.sim); sim = null; lastResult = null; go("week");
    });
    document.getElementById("share-btn").addEventListener("click", () => shareImage(r));
  }

  function dayLabel(day, slot) {
    if (day < 0) return "Sunday before the week";
    return `${DAY_NAMES[day]} ${SLOT_WORD[slot] || ""}`.trim();
  }
  function callWhy(d, alt, good) {
    if (good) return `${d.cash ? rm(d.cash) : "From home"}, ${d.co2.toFixed(2)} kg CO₂e and ${Math.round(d.fv)} g of fruit and veg: the best fit for your goal (${GOAL_NAME[profile ? profile.goal : "money"].toLowerCase()}).`;
    const parts = [];
    if (alt.cash < d.cash) parts.push(`${rm(d.cash - alt.cash)} cheaper`);
    if (alt.co2 < d.co2) parts.push(`${(d.co2 - alt.co2).toFixed(2)} kg less CO₂e`);
    if (alt.fv > d.fv) parts.push(`${Math.round(alt.fv - d.fv)} g more fruit and veg`);
    // Choice labels are often instructions ("Eat a lunchbox you cooked"): name the choice, don't start the sentence with it
    return `Choosing “${esc(alt.label)}” would have been ${parts.join(", ") || "a better fit for your goal"}.`;
  }

  // Share image: 1080 × 1350 PNG drawn on a canvas (no network, no tracking).
  // Every line is measured and shrunk or wrapped to fit its box.
  function fitText(g, text, x, y, maxW, size, minSize, weight, family) {
    let s = size;
    g.font = `${weight} ${s}px ${family}`;
    while (g.measureText(text).width > maxW && s > minSize) { s -= 2; g.font = `${weight} ${s}px ${family}`; }
    g.fillText(text, x, y);
    const w = g.measureText(text).width;
    window.__shareDebug.push({ text, width: Math.round(w), max: maxW, size: s });
    return s;
  }
  function wrapText(g, text, x, y, max, lh, maxLines = 4) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    words.forEach(w => {
      const test = line ? line + " " + w : w;
      if (g.measureText(test).width > max && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    lines.slice(0, maxLines).forEach((l, i) => {
      g.fillText(l, x, y + i * lh);
      window.__shareDebug.push({ text: l, width: Math.round(g.measureText(l).width), max, size: 0 });
    });
    return lines.length;
  }
  async function shareImage(r) {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* ignore */ }
    window.__shareDebug = [];
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1350;
    const g = c.getContext("2d");
    const head = "'Bricolage Grotesque', sans-serif", text = "Inter, sans-serif";
    g.fillStyle = "#254f3a"; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = "#e7f3f0";
    fitText(g, "Makan Apa?", 80, 120, 920, 40, 28, 600, head);
    fitText(g, "One simulated student food week in Malaysia", 80, 170, 920, 30, 22, 400, text);
    g.fillStyle = "#fffdf7"; g.fillRect(80, 220, 920, 1000);
    g.fillStyle = "#17211e";
    g.font = `700 72px ${head}`;
    const name = r.archetype.name;
    let y = 330;
    if (g.measureText(name).width <= 820) fitText(g, name, 130, y, 820, 72, 48, 700, head);
    else { const n = wrapText(g, name, 130, y, 820, 80, 2); y += (n - 1) * 80; }
    const stats = shareStats(r);
    stats.forEach((st, i) => {
      const top = y + 110 + i * 200;
      g.fillStyle = "#17211e";
      fitText(g, st.big, 130, top + 60, 820, 88, 48, 700, head);
      g.fillStyle = "#3c4844";
      fitText(g, st.label, 130, top + 110, 820, 34, 22, 400, text);
      g.strokeStyle = "#d5ddd8"; g.setLineDash([10, 10]); g.beginPath(); g.moveTo(130, top + 150); g.lineTo(950, top + 150); g.stroke();
    });
    g.setLineDash([]);
    g.font = `400 26px ${text}`; g.fillStyle = "#5b6863";
    wrapText(g, "Footprints are global averages (Poore & Nemecek 2018); prices are estimates. One simulated week, not a diet verdict.", 130, 1120, 820, 36, 2);
    g.fillStyle = "#e7f3f0";
    fitText(g, "Plan your real week at Makan Apa?", 80, 1290, 920, 30, 22, 400, text);
    const url = c.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = "my-food-week.png";
    document.body.appendChild(a); a.click(); a.remove();
    say("Share image downloaded");
  }

  // =============================================================
  // PLAN MY REAL WEEK
  // =============================================================
  function nextMonday() {
    const d = new Date();
    const add = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + add);
    return toKey(d);
  }
  function loadPlan() {
    const saved = storeGet(KEYS.plan, null);
    // Compare the saved profile in today's shape, so a plan saved by an older version (no allergies field) survives an update
    if (!saved || saved.budget !== profile.budget || JSON.stringify(validateProfile(saved.profile)) !== JSON.stringify(profile)) return null;
    const v = validatePlan(saved, profile);
    if (!v) return null;
    const num = n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 10000;
    return { ...v, started: saved.started === true, ticks: Array.isArray(saved.ticks) ? saved.ticks.filter(x => typeof x === "string") : [],
      feasible: saved.feasible === false ? false : true, minOutlay: num(saved.minOutlay) ? saved.minOutlay : null,
      startMode: saved.startMode === "today" ? "today" : "monday", swaps: Number.isInteger(saved.swaps) && saved.swaps >= 0 && saved.swaps < 1000 ? saved.swaps : 0,
      cause: saved.cause === "start-today" ? "start-today" : null, startExtra: saved.cause === "start-today" && num(saved.startExtra) ? saved.startExtra : null };
  }
  function savePlan(p) {
    storeSet(KEYS.plan, { plan: p.plan, start: p.start, started: !!p.started, ticks: p.ticks || [], budget: profile.budget, profile,
      feasible: p.feasible !== false, minOutlay: p.minOutlay === undefined ? null : p.minOutlay, startMode: p.startMode || "monday", swaps: p.swaps || 0,
      cause: p.cause === "start-today" ? "start-today" : null, startExtra: p.cause === "start-today" ? p.startExtra : null });
  }
  // The planner takes a few hundred ms on a slow phone: remember results for the same setup
  const planCache = new Map();
  function planFor(pr, have = {}) {
    const key = JSON.stringify([pr, have, storeGet(KEYS.prices, null)]);
    if (!planCache.has(key)) {
      if (planCache.size > 24) planCache.delete(planCache.keys().next().value);
      planCache.set(key, planWeek(pr, have));
    }
    return planCache.get(key);
  }

  // ---------- keeping the check-in history safe ----------
  // Anything that throws away a plan first files its check-in ticks under "Past weeks".
  function logHasEntries(log) {
    return !!log && Object.keys(log.days || {}).some(d => Object.keys(log.days[d]).length > 0);
  }
  function archiveWeek(reason) {
    const saved = storeGet(KEYS.plan, null);
    const log = validateLog(storeGet(KEYS.checkin, null));
    if (!saved || !saved.started || !logHasEntries(log) || !Array.isArray(saved.plan)) return false;
    const hist = validateHistory(storeGet(KEYS.history, null));
    const plan = saved.plan.map(d => ({ B: d && d.B || null, L: d && d.L || null, D: d && d.D || null, S: d && d.S || null }));
    let sums = null;
    try { if (!plan.some(d => Object.values(d).some(id => id && !mealById(id)))) sums = weekSums(plan, log, loadHave()); } catch (e) { sums = null; }
    hist.unshift({ start: saved.start, plan: saved.plan, log, budget: saved.budget, reason, at: Date.now(), ...(sums ? { sums } : {}) });
    storeSet(KEYS.history, hist.slice(0, HISTORY_MAX));
    return true;
  }
  function dropPlan(reason) {
    archiveWeek(reason);
    storeRemove(KEYS.plan);
    storeRemove(KEYS.checkin);
  }
  // Ask in the page before an action that would remove logged ticks; runs `yes` straight away when there are none.
  function confirmDrop(actionLabel, yes) {
    const log = validateLog(storeGet(KEYS.checkin, null));
    if (!logHasEntries(log)) { yes(); return; }
    const n = Object.keys(log.days).reduce((a, d) => a + Object.keys(log.days[d]).length, 0);
    const old = document.getElementById("confirm-drop");
    if (old) old.remove();
    const box = document.createElement("div");
    box.id = "confirm-drop";
    box.className = "banner warn confirm";
    box.setAttribute("role", "alert");
    box.innerHTML = `${icon("alert")}<div><p><strong>This starts a new plan.</strong> Your ${n} check-in tick${n > 1 ? "s" : ""} for this week move to Past weeks on the Today tab, so nothing is lost, but the new plan starts with an empty check-in.</p>
      <div class="banner-actions"><button type="button" class="btn" id="confirm-yes">${esc(actionLabel)}</button><button type="button" class="btn btn-quiet" id="confirm-no">Keep my plan</button></div></div>`;
    const page = view.querySelector(".page") || view;
    page.insertBefore(box, page.firstChild);
    box.scrollIntoView({ block: "nearest" });
    box.querySelector("#confirm-yes").addEventListener("click", yes);
    box.querySelector("#confirm-no").addEventListener("click", () => { box.remove(); say("Kept your plan"); focusHeading(); });
    box.querySelector("#confirm-yes").focus();
  }

  // Why a plan made within budget is now over it: say the real cause, not always "your swaps"
  function overCause(p) {
    const pr = cleanPriceOverrides(storeGet(KEYS.prices, null));
    const prices = Object.keys(pr.meals).length + Object.keys(pr.packs).length > 0;
    const swaps = p.swaps || 0;
    if (p.cause === "start-today") {
      const extra = p.startExtra ? `${rm(p.startExtra)} over` : "over budget";
      return `Starting today put the plan ${extra}: day-1 breakfast and lunch come before today's shop, so they are bought, and no week started today fits the budget.${swaps ? ` Your swap${swaps > 1 ? "s" : ""} changed it after that.` : ""}${prices ? " Your own prices (My prices) may add to it." : ""}`;
    }
    if (swaps && prices) return "Your swaps or your own prices (My prices) took the plan over.";
    if (swaps) return `Your swap${swaps > 1 ? "s" : ""} took the plan over.`;
    if (prices) return "Prices changed after this plan was made (My prices or stall prices), and that took it over.";
    return "The plan costs more now than when it was made.";
  }
  function renderPlan() {
    let p = loadPlan();
    let result = null;
    const have = loadHave();
    if (!p) {
      result = planFor(profile, have);
      p = { plan: result.plan, start: nextMonday(), started: false, ticks: [], feasible: result.feasible, minOutlay: result.minOutlay, startMode: "monday", swaps: 0 };
      savePlan(p);
    }
    const ev = evaluate(p.plan, have);
    // Whether a plan within budget exists is saved with the plan, so a swap or a reload never loses the fix
    if (!result) result = { feasible: p.feasible, minOutlay: p.minOutlay, baseline: baselineBuyAll(profile) };
    const baseline = result.baseline;
    const saving = round2(baseline.outlay - ev.outlay);
    const over = ev.outlay > profile.budget;
    const slots = ["B", "L", "D"].filter(s => s !== "B" || profile.breakfast).concat(p.plan.some(d => d.S) ? ["S"] : []);
    const sessions = prepSessions(p.plan, p.startMode === "today" ? 0 : -1);
    const ifThen = validateIfThen(storeGet(KEYS.ifthen, null));
    const carried = Object.keys(have);
    // One part of the plan per screen: the week, cooking ahead, the shopping list, a plan for a weak moment
    const pv = ["week", "cook", "shop", "weak"].includes(new URLSearchParams(location.hash.split("?")[1] || "").get("view")) ? new URLSearchParams(location.hash.split("?")[1]).get("view") : "week";
    const pvClass = v => `pv${v === pv ? "" : " pv-off"}`;
    const todayIdx = p.started ? Math.max(0, Math.min(6, planDay(p.start, new Date()))) : 0;
    view.innerHTML = `
      <div class="page plan" data-view="${pv}">
        <nav class="tabs-inline plan-views" aria-label="Parts of the plan">
          <a href="#plan" ${pv === "week" ? 'aria-current="page"' : ""}>${icon("calendar")} Week</a>
          ${sessions.length ? `<a href="#plan?view=cook" ${pv === "cook" ? 'aria-current="page"' : ""}>${icon("pot")} Cook ahead</a>` : ""}
          <a href="#plan?view=shop" ${pv === "shop" ? 'aria-current="page"' : ""}>${icon("cart")} Shopping list</a>
          <a href="#plan?view=weak" ${pv === "weak" ? 'aria-current="page"' : ""}>${icon("bolt")} Weak moment</a>
        </nav>

        <header class="plan-head">
          <div class="plan-title">
            <h1>Your plan for the week</h1>
            <p class="setup-line small"><span>${esc(setupSummary(profile))}</span> <button type="button" class="btn btn-ghost" id="plan-setup">Change</button></p>
            <p class="lead">${planLead(ev, saving, over)}</p>
          </div>
          <div class="plan-actions">
            <button class="btn" type="button" id="plan-start">${icon(p.started ? "today" : "check")} ${p.started ? "Go to today's check-in" : "Start this plan"}</button>
            <details class="more">
              <summary class="btn btn-quiet">${icon("more")} More</summary>
              <div class="more-menu">
                <button class="btn btn-quiet" type="button" id="plan-ics">${icon("calendar")} Add reminders to calendar</button>
                <button class="btn btn-quiet" type="button" id="plan-print">${icon("print")} Print plan and list</button>
                <button class="btn btn-quiet" type="button" id="plan-prices">${icon("tag")} My prices</button>
                <button class="btn btn-quiet" type="button" id="plan-redo">${icon("refresh")} Remake plan</button>
              </div>
            </details>
          </div>
        </header>
        ${over || result.feasible === false ? `<div class="banner bad fix" id="over-banner" role="alert">${icon("alert")}<div><p><strong>${rm(ev.outlay - profile.budget)} over your ${rm0(profile.budget)} budget.</strong> ${result.feasible === false ? `${result.minOutlay ? `The cheapest plan for ${slots.filter(s => s !== "S").length * 7} meals with this setup costs ${rm(result.minOutlay)}.` : "No plan with this setup fits the budget."}` : `${overCause(p)} A plan within budget is possible.`} Fix it:</p>
          <div class="banner-actions">
            ${result.feasible !== false ? `<button class="btn btn-quiet" type="button" id="fix-remake">${icon("refresh")} Remake within budget</button>` : ""}
            ${!profile.rahmah ? `<button class="btn btn-quiet" type="button" id="fix-rahmah">${icon("store")} Use Menu Rahmah meals</button>` : ""}
            <button class="btn btn-quiet" type="button" id="fix-setup">${icon("settings")} Cook more or change budget</button>
          </div></div></div>` : ""}
        <div class="${pvClass("week")}">
        <section class="totals" aria-label="Week totals">
          <div class="total ${over ? "bad" : ""}"><span class="t-label">${icon("wallet")} Week cost</span><span class="t-value num">${rm(ev.outlay)}</span><span class="t-sub">${over ? `${rm(ev.outlay - profile.budget)} over budget` : `${rm(profile.budget - ev.outlay)} under budget`}</span></div>
          <div class="total"><span class="t-label">${icon("store")} ${saving >= 0 ? "Saved" : "Extra"} vs buying</span><span class="t-value num">${rm(Math.abs(saving))}</span><span class="t-sub">buying every meal: ${rm(baseline.outlay)}</span></div>
          <div class="total"><span class="t-label">${icon("leaf")} Fruit &amp; veg</span><span class="t-value num">${ev.fvDaysMet} of 7 days</span><span class="t-sub">at WHO's 400 g · ${ev.fvPerDay} g a day</span></div>
          <div class="total"><span class="t-label">${icon("plate")} Healthy Plate</span><span class="t-value num">${ev.plateMeals} of ${ev.mainMeals}</span><span class="t-sub">meals, suku-suku separuh${srcShort("PLATE", "· source")}</span></div>
          <div class="total"><span class="t-label">${icon("cloud")} Footprint</span><span class="t-value num">${kg(ev.co2)}</span><span class="t-sub">CO₂e, vs ${kg(baseline.co2)} buying</span></div>
        </section>
        <section class="plan-grid-wrap" aria-labelledby="grid-title">
          <h2 id="grid-title" class="section-title">Meals</h2>
          <p class="small muted">Select a meal to swap it. Swaps show exactly what changes for the week.</p>
          <div class="plan-grid" style="--rows:${slots.length}">
            <div class="pg-corner" aria-hidden="true"></div>
            ${DAY_SHORT.map((d, i) => `<div class="pg-day" role="heading" aria-level="3"><span class="pg-day-name">${planDayName(p.start, i)}</span><span class="pg-date tiny muted">${dateLabel(addDays(p.start, i))}</span></div>`).join("")}
            ${slots.map(s => `<div class="pg-slot">${SLOT_ALL[s]}</div>${DAY_SHORT.map((_, d) => mealCellHtml(p, d, s)).join("")}`).join("")}
          </div>
          <div class="day-chips screen-only" role="group" aria-label="Day">${DAY_SHORT.map((_, d) => `<button type="button" class="day-chip" data-daychip="${d}" aria-pressed="${d === todayIdx}">${planDayName(p.start, d, true)}</button>`).join("")}</div>
          <div class="plan-days">
            ${DAY_SHORT.map((_, d) => `<section class="pd-day ${d === todayIdx ? "on" : ""}" data-pd="${d}" aria-labelledby="pd-${d}"><h3 id="pd-${d}">${planDayName(p.start, d)} <span class="tiny muted">${dateLabel(addDays(p.start, d))}</span></h3>
              ${slots.map(s => `<div class="pd-row"><span class="pd-slot">${SLOT_ALL[s]}</span>${mealCellHtml(p, d, s)}</div>`).join("")}</section>`).join("")}
          </div>
        </section>
        </div>
        <div class="${pvClass("cook")}">${sessions.length ? prepHtml(p, sessions) : `<p class="muted">Nothing to cook ahead in this plan.</p>`}</div>
        <div class="${pvClass("weak")}">${ifThenHtml(ifThen)}</div>
        <div class="${pvClass("shop")}">
        <section class="shopping" aria-labelledby="shop-title">
          <h2 id="shop-title" class="section-title">${icon("cart")} Shopping list <span class="muted num">${rm(ev.grocery)}</span></h2>
          ${carried.length ? `<p class="small">${icon("check")} Using what you already have: ${carried.map(id => `${have[id]} g ${esc(PACKS[id].name.split(",")[0].toLowerCase())}`).join(", ")}.</p>` : ""}
          ${ev.shopping.length ? shoppingHtml(ev, p, have) : `<p class="muted">Nothing to buy: every meal in this plan is bought ready to eat.</p>`}
          <p class="tiny muted screen-only">Assumes you have cooking oil and sugar. Tap “I have it” for anything already in your kitchen and the list and costs update. Long-keeping leftovers (rice, oats, dhal) carry into next week's plan.</p>
        </section>
        </div>
        <section class="print-only print-sources"><p>Prices: Klang Valley estimates 2026${Object.keys(cleanPriceOverrides(storeGet(KEYS.prices, null)).packs).length ? " and your own prices" : ""}; local white rice RM 2.60/kg (controlled price); nasi lemak, satay and beef: DOSM 2024 averages. Footprints: Poore &amp; Nemecek 2018 global averages.</p></section>
      </div>`;
    wirePlan(p, have);
    // Phones and tablets: one day of the plan at a time
    // …and one aisle / one cooking session at a time
    view.querySelectorAll("[data-partchip]").forEach(b => b.addEventListener("click", () => {
      const group = b.closest(".part-chips");
      group.querySelectorAll("[data-partchip]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      const prefix = b.dataset.partchip.split("-")[0];
      view.querySelectorAll(`[data-part^="${prefix}-"]`).forEach(x => x.classList.toggle("on", x.dataset.part === b.dataset.partchip));
    }));
    view.querySelectorAll("[data-daychip]").forEach(b => b.addEventListener("click", () => {
      view.querySelectorAll("[data-daychip]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      view.querySelectorAll("[data-pd]").forEach(x => x.classList.toggle("on", x.dataset.pd === b.dataset.daychip));
    }));
  }

  function planLead(ev, saving, over) {
    return over
      ? `This plan costs ${rm(ev.outlay)}, more than your budget. Use one of the fixes below.`
      : `${rm(ev.outlay)} for the whole week, groceries included${saving > 0 ? `: ${rm(saving)} less than buying every meal` : ""}. No meal more than three times; every one fits your kitchen and food rules.`;
  }
  // Weekday names follow the plan's real start date (a plan can start on any day)
  function planDayName(start, i, short) {
    return fromKey(addDays(start, i)).toLocaleDateString("en-MY", { weekday: short ? "short" : "long" });
  }
  function dateLabel(key) {
    return fromKey(key).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
  }
  function mealCellHtml(p, d, s) {
    const id = p.plan[d][s];
    if (!id) return `<div class="pg-cell empty">${s === "S" ? "No snack" : "–"}</div>`;
    const m = mealById(id);
    const st = mealStats(m);
    const plate = !m.snack && healthyPlate(m);
    return `<button type="button" class="pg-cell" data-day="${d}" data-slot="${s}" aria-label="${planDayName(p.start, d)} ${SLOT_ALL[s]}: ${esc(m.name)}, ${m.source === "buy" ? rm(st.rm) : "about " + rm(st.rm) + " in groceries"}${plate ? ", Healthy Plate" : ""}. Swap">
        <span class="pg-name">${esc(m.name)}</span>
        <span class="pg-meta"><span class="pg-tags"><span class="tag ${m.source}">${SOURCE_TAG[m.source]}</span>${plate ? `<span class="tag plate">Healthy Plate</span>` : ""}</span><span class="num pg-price">${rm(st.rm)}</span></span>
      </button>`;
  }
  function prepHtml(p, sessions) {
    const total = sessions.reduce((a, x) => a + x.minutes, 0);
    const day = d => d < 0 ? `${planDayName(p.start, -1)} evening, after the shop` : d === 0 && p.startMode === "today" ? `${planDayName(p.start, 0)} ${dateLabel(p.start)}, after the shop` : planDayName(p.start, d); // a date, not "today": the plan gets printed
    return `<section class="card prep" aria-labelledby="prep-title">
      <h2 id="prep-title" class="card-title">${icon("pot")} Cook-ahead plan</h2>
      <p class="small muted">${sessions.length} cooking session${sessions.length > 1 ? "s" : ""}, about ${total} minutes in all. Cooked food keeps 2–3 days in the fridge.</p>
      ${sessions.length > 1 ? `<div class="part-chips screen-only" role="group" aria-label="Cooking session">${sessions.map((x, k) => `<button type="button" class="day-chip" data-partchip="prep-${k}" aria-pressed="${k === 0}">${k + 1}. ${esc(planDayName(p.start, Math.max(0, x.cookOn), true))}</button>`).join("")}</div>` : ""}
      <ol class="prep-list">${sessions.map((x, k) => `<li class="part ${k === 0 ? "on" : ""}" data-part="prep-${k}">
        <p class="prep-when"><strong>${esc(day(x.cookOn))}</strong> · ${x.minutes} min · ${x.portions} portion${x.portions > 1 ? "s" : ""}</p>
        <p class="prep-what">${esc(x.name)} <span class="muted small">for ${x.days.map(d => planDayName(p.start, d, true)).join(", ")}</span></p>
        ${x.freeze ? `<p class="tiny">${icon("info")} Freeze the ${x.mealId === "fishcurry" ? "fish" : "chicken"} on shopping day and move it to the fridge the night before you cook.</p>` : ""}
        ${x.steps.length ? `<ol class="steps small">${x.steps.map(st => `<li>${esc(st)}</li>`).join("")}</ol>` : ""}</li>`).join("")}</ol>
    </section>`;
  }
  function ifThenHtml(it) {
    return `<section class="card ifthen" aria-labelledby="if-title">
      <h2 id="if-title" class="card-title">${icon("bolt")} Plan for a weak moment</h2>
      ${it ? `<p class="if-line">If <strong>${esc(it.when)}</strong>, then <strong>${esc(it.then)}</strong>.</p>
        <p class="tiny muted">It's in your calendar reminders too. Expect a small nudge, not a fix: if-then plans add about a quarter of a portion of fruit and veg a day on average.${sourceLink("IFTHEN")}</p>
        <button type="button" class="btn btn-quiet" id="if-edit">Change it</button>`
      : `<p class="small">Pick the moment your plan usually breaks and decide now what you'll do instead.</p>
        <form id="if-form" class="if-form" novalidate>
          <label class="field-label" for="if-when">If…</label>
          <input id="if-when" class="text-input" type="text" maxlength="80" placeholder="it's 11 pm and I want to order food">
          <label class="field-label" for="if-then">then I…</label>
          <input id="if-then" class="text-input" type="text" maxlength="80" placeholder="have the instant noodles and a banana in my room">
          <div id="if-error" role="alert"></div>
          <button class="btn btn-quiet" type="submit">${icon("check")} Save my plan</button>
        </form>
        <p class="tiny muted">Small, honest effect: about a quarter of a portion of fruit and veg a day on average.${sourceLink("IFTHEN")}</p>`}
    </section>`;
  }
  function shoppingHtml(ev, p, have) {
    const byAisle = {};
    ev.shopping.forEach(i => { (byAisle[i.aisle] = byAisle[i.aisle] || []).push(i); });
    const keys = Object.keys(byAisle);
    return `${keys.length > 1 ? `<div class="part-chips screen-only" role="group" aria-label="Aisle">${keys.map((a, k) => `<button type="button" class="day-chip" data-partchip="aisle-${a}" aria-pressed="${k === 0}">${["Fruit & veg", "Eggs & tofu", "Meat & fish", "Dry goods", "Bakery"][a] || esc(AISLES[a])}</button>`).join("")}</div>` : ""}
      <div class="aisles">${keys.map((a, k) => `
      <div class="aisle part ${k === 0 ? "on" : ""}" data-part="aisle-${a}"><h3>${esc(AISLES[a])}</h3><ul>
        ${byAisle[a].map(i => i.packs > 0 ? `<li><div class="tick-line"><label class="tick-row"><input type="checkbox" data-item="${i.id}" ${p.ticks.includes(i.id) ? "checked" : ""}>
          <span class="tick-box print-only" aria-hidden="true"></span>
          <span class="tick-name">${i.packs} × ${esc(i.name)}</span><span class="num tick-cost">${rm(i.cost)}</span></label>
          <button type="button" class="btn btn-ghost have-btn screen-only" data-have="${i.id}" data-g="${i.needG}" aria-label="I already have ${esc(i.name)}">I have it</button></div>
          ${i.leftG > 0 ? `<span class="tiny muted tick-left">Left over after the week: ${i.leftG} g (${rm(i.leftRm)})</span>` : ""}</li>`
        : `<li><div class="tick-line have"><span class="tick-name">${esc(i.name)} <span class="muted small">already in your kitchen (${i.haveG} g used)</span></span>
          <button type="button" class="btn btn-ghost have-btn screen-only" data-need="${i.id}" aria-label="I need to buy ${esc(i.name)}">I need it</button></div></li>`).join("")}
      </ul></div>`).join("")}</div>`;
  }

  function downloadIcs(p, have) {
    const url = /^https?:$/.test(location.protocol) ? location.href.split("#")[0] + "#today" : "";
    const it = validateIfThen(storeGet(KEYS.ifthen, null));
    const today = p.startMode === "today";
    const shopHour = Math.min(21, Math.max(8, new Date().getHours() + 1));
    const ics = buildIcs(p.plan, p.start, url, new Date(), { have, ifThen: it ? `If ${it.when}, then ${it.then}` : "", shopDay: today ? 0 : -1, shopHour: today ? shopHour : 10 });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "food-week-reminders.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say("Calendar file downloaded");
  }

  function wirePlan(p, have) {
    const remake = msg => { dropPlan("remade"); renderPlan(); focusHeading(); say(msg); };
    document.getElementById("plan-setup").addEventListener("click", openSettings);
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
    on("fix-setup", openSettings);
    on("fix-remake", () => confirmDrop("Remake within budget", () => remake("Plan remade within budget")));
    on("fix-rahmah", () => confirmDrop("Add Menu Rahmah and remake", () => { profile = { ...profile, rahmah: true }; storeSet(KEYS.profile, profile); remake("Menu Rahmah meals added to your options"); }));
    on("plan-redo", () => { const m = document.querySelector(".more[open]"); if (m) m.open = false; confirmDrop("Remake the plan", () => remake("Plan remade")); });
    on("plan-print", () => window.print());
    on("plan-prices", openPrices);
    on("plan-ics", () => downloadIcs(p, have));
    on("if-edit", () => { storeRemove(KEYS.ifthen); renderPlan(); const f = document.getElementById("if-when"); if (f) f.focus(); });
    const ifForm = document.getElementById("if-form");
    if (ifForm) ifForm.addEventListener("submit", e => {
      e.preventDefault();
      const it = validateIfThen({ when: ifForm.querySelector("#if-when").value, then: ifForm.querySelector("#if-then").value });
      if (!it) { showError(ifForm.querySelector("#if-error"), "Fill in both parts: the moment, and what you'll do.", ifForm); return; }
      storeSet(KEYS.ifthen, it); renderPlan(); say("Saved your plan for a weak moment");
      const b = document.getElementById("if-edit"); if (b) b.focus();
    });
    document.getElementById("plan-start").addEventListener("click", () => {
      if (p.started) { go("today"); return; }
      const today = toKey(new Date());
      const wd = weekdayIndex(new Date());
      // Starting today never quietly costs more: work out the day-1 version first and say what it costs
      const st = startToday(p.plan, profile, wd, have);
      const wasWithin = evaluate(p.plan, have).outlay <= profile.budget + 1e-9;
      const extra = wasWithin ? st.overBy : 0;
      openSheet("Start this plan", `
        <form id="start-form" novalidate>
          <fieldset class="field"><legend>When does your week start?</legend>
            <div class="choices">
              <label class="choice"><input type="radio" name="start" value="monday" ${extra > 0 ? "checked" : ""}><span>Next Monday${extra > 0 ? ` <span class="tag plate">Recommended</span>` : ""}<small>${dateLabel(nextMonday())}${extra > 0 ? ", the plan stays within your budget" : ""}</small></span></label>
              <label class="choice"><input type="radio" name="start" value="today" ${extra > 0 ? "" : "checked"}><span>Today<small>${dateLabel(today)}, plan shifts so weekdays still line up</small></span></label>
            </div></fieldset>
          ${extra > 0 ? `<div class="banner warn" id="start-warn" role="note">${icon("alert")}<p class="small"><strong>Starting today costs ${rm(extra)} more than your ${rm0(profile.budget)} budget.</strong> Today's breakfast and lunch come before the shop, so they have to be bought, and no week started today fits ${rm0(profile.budget)}. Next Monday keeps it within budget.</p></div>`
            : st.changed ? `<p class="small muted" id="start-note">Starting today, breakfast and lunch come before the shop, so a few meals change to keep the week within ${rm0(profile.budget)} (${rm(st.outlay)}).</p>` : ""}
          <p class="small muted">Each evening, tick off what you actually ate. Your check-in stays on this device.</p>
          <div class="sheet-actions"><button class="btn" type="submit">${icon("check")} Start the plan</button></div>
        </form>`, root => {
        root.querySelector("#start-form").addEventListener("submit", e => {
          e.preventDefault();
          const choice = root.querySelector('input[name="start"]:checked').value;
          if (choice === "today") {
            // Rotated so weekdays line up, nothing cooked before today's shop, fresh food first,
            // and re-planned under the same budget where the rotated week would cost more
            p.plan = st.plan;
            p.start = today;
            p.startMode = "today";
            p.cause = extra > 0 ? "start-today" : null;
            p.startExtra = extra > 0 ? extra : null;
          } else { p.start = nextMonday(); p.startMode = "monday"; p.cause = null; p.startExtra = null; }
          p.started = true;
          savePlan(p);
          storeSet(KEYS.checkin, validateLog(null));
          todayDayOverride = null;
          closeSheet();
          go("today");
        });
      });
    });
    view.querySelectorAll(".pg-cell[data-day]").forEach(btn => btn.addEventListener("click", () => openSwap(p, Number(btn.dataset.day), btn.dataset.slot, have)));
    view.querySelectorAll("input[data-item]").forEach(cb => cb.addEventListener("change", () => {
      const set = new Set(p.ticks);
      if (cb.checked) set.add(cb.dataset.item); else set.delete(cb.dataset.item);
      p.ticks = [...set]; savePlan(p);
    }));
    view.querySelectorAll("[data-have]").forEach(b => b.addEventListener("click", () => {
      const h = loadHave(); h[b.dataset.have] = (h[b.dataset.have] || 0) + Number(b.dataset.g);
      storeSet(KEYS.have, cleanHave(h)); renderPlan(); say("Taken off the list");
      const back = view.querySelector(`[data-need="${b.dataset.have}"]`); if (back) back.focus();
    }));
    view.querySelectorAll("[data-need]").forEach(b => b.addEventListener("click", () => {
      const h = loadHave(); delete h[b.dataset.need];
      storeSet(KEYS.have, h); renderPlan(); say("Back on the list");
      const back = view.querySelector(`[data-have="${b.dataset.need}"]`); if (back) back.focus();
    }));
  }

  function openSwap(p, day, slot, have) {
    const current = p.plan[day][slot] ? mealById(p.plan[day][slot]) : null;
    const opts = swapOptions(profile, p.plan, day, slot, have).slice(0, 10);
    const uses = current ? usesOf(p.plan, current.id) : 0;
    const delta = (label, val, text, worse) => `<span class="d ${worse ? "worse" : val === 0 ? "" : "better"}"><span class="d-k">${label}</span> ${text}</span>`;
    openSheet(`Swap ${planDayName(p.start, day)} ${SLOT_ALL[slot].toLowerCase()}`, `
      <p class="small">Now: <strong>${current ? esc(current.name) : "nothing"}</strong>${uses > 1 ? ` (${uses} times this week)` : ""}. Sorted by what helps your goal (${GOAL_NAME[profile.goal].toLowerCase()}) most. Changes are for the whole week.</p>
      ${opts.length ? `<ul class="swap-list">${opts.map(o => `<li class="swap-item">
        <div class="swap-info"><span class="swap-name">${o.meal ? esc(o.meal.name) : "No snack"}</span>
          <span class="swap-deltas small">${delta("Cost", o.dOutlay, signedRm(o.dOutlay), o.dOutlay > 0)}${delta("CO₂e", o.dCo2, signedKg(o.dCo2), o.dCo2 > 0)}${delta("Fruit & veg", o.dFv, signedG(o.dFv), o.dFv < 0)}</span>
          ${o.withinBudget ? "" : `<span class="tag bad">Goes over budget</span>`}${o.meal && !o.meal.snack && healthyPlate(o.meal) ? `<span class="tag plate">Healthy Plate</span>` : ""}</div>
        <div class="swap-btns"><button type="button" class="btn btn-quiet" data-meal="${o.meal ? o.meal.id : ""}">Use this</button>
          ${uses > 1 && o.meal && applySwapAll(profile, p.plan, slot, current.id, o.meal.id) ? `<button type="button" class="btn btn-ghost" data-all="${o.meal.id}">Use for all ${uses}</button>` : ""}</div></li>`).join("")}</ul>`
        : `<p class="muted">No other meal fits this slot with your kitchen, food rules and variety limits.</p>`}`, root => {
      const done = (plan, name) => {
        // A meal already ticked "Ate this" stays what was eaten: it becomes "something else" with its name and price
        let log = validateLog(storeGet(KEYS.checkin, null)), touched = false;
        plan.forEach((dayPlan, d) => PLAN_SLOTS.forEach(s => {
          const e = log.days[String(d)] && log.days[String(d)][s];
          if (e && e.status === "planned" && p.plan[d][s] !== dayPlan[s]) {
            const old = mealById(p.plan[d][s]);
            // A home meal was paid for with the groceries (already counted): only a bought meal's price is extra cash
            const paid = old && old.source === "buy" ? (e.rm !== undefined ? e.rm : mealStats(old).rm) : 0;
            log = record(log, d, s, { status: "other", rm: paid, label: old ? old.name : "Planned meal" });
            touched = true;
          }
        }));
        if (touched) storeSet(KEYS.checkin, log);
        p.plan = plan; p.swaps = (p.swaps || 0) + 1; savePlan(p); closeSheet(); renderPlan();
        const banner = document.getElementById("over-banner");
        if (banner) {
          // The swap took the week over budget: say so, and show the fixes rather than the cell
          say(`Swapped to ${name}. The plan is now over budget.`);
          banner.setAttribute("tabindex", "-1"); banner.focus(); banner.scrollIntoView({ block: "start" });
          return;
        }
        say(`Swapped to ${name}`);
        const cell = view.querySelector(`.pg-cell[data-day="${day}"][data-slot="${slot}"]`);
        if (cell && cell.offsetParent) cell.focus();
      };
      root.querySelectorAll("button[data-meal]").forEach(b => b.addEventListener("click", () => {
        done(applySwap(p.plan, day, slot, b.dataset.meal || null), b.dataset.meal ? mealById(b.dataset.meal).name : "no snack");
      }));
      root.querySelectorAll("button[data-all]").forEach(b => b.addEventListener("click", () => {
        const plan = applySwapAll(profile, p.plan, slot, current.id, b.dataset.all);
        if (plan) done(plan, `${mealById(b.dataset.all).name} for all ${uses}`);
      }));
    });
  }

  // =============================================================
  // TODAY (daily check-in)
  // =============================================================

  function renderToday() {
    const p = loadPlan();
    if (!p || !p.started) {
      view.innerHTML = `<div class="page narrow empty">
        <h1>No plan running yet</h1>
        <p class="lead">${p ? "Your plan is ready. Start it, do the shop, and check in here each evening: about 20 seconds a day." : "Make a plan for your real week, start it, and check in here each evening: about 20 seconds a day."}</p>
        <ul class="empty-points small"><li>See money spent against the plan, meal by meal</li><li>Get a reminder of what's in your fridge for tomorrow</li><li>Leftovers carry into next week's plan</li></ul>
        <a class="btn" href="#plan">${icon("calendar")} ${p ? "Open my plan" : "Make my plan"}</a>${pastWeeksHtml()}</div>`;
      return;
    }
    const have = loadHave();
    const idx = planDay(p.start, new Date());
    let log = validateLog(storeGet(KEYS.checkin, null));
    if (idx < 0) {
      const ev = evaluate(p.plan, have);
      view.innerHTML = `<div class="page narrow empty"><h1>Your plan starts ${esc(dateLabel(p.start))}</h1>
        <p class="lead">${log.groceries && log.groceryRm !== undefined
          ? `Shop done: ${rm(log.groceryRm)} of groceries from your receipt${log.groceryRids && log.groceryRids.length > 1 ? "s" : ""}, counted in your plan's week.${prepSessions(p.plan).length ? " Next: the first cook-ahead session." : ""}`
          : `Before then: do the shop (${ev.shopping.filter(i => i.packs > 0).length} items, about ${rm(ev.grocery)})${prepSessions(p.plan).length ? " and the first cook-ahead session" : ""}. Scan the grocery receipt in Tools and it counts in your plan's week.`} Your first check-in opens on ${esc(planDayName(p.start, 0))}.</p>
        <a class="btn" href="#plan">${icon("cart")} Open the shopping list</a></div>`;
      return;
    }
    const sumAll = summary(p.plan, log, Math.min(6, idx), have);
    if (idx > 6 && todayDayOverride === null) {
      const carry = carryOver(evaluate(p.plan, have), p.plan, log);
      const carryText = Object.keys(carry).map(id => `${carry[id]} g ${PACKS[id].name.split(",")[0].toLowerCase()}`).join(", ");
      view.innerHTML = `<div class="page narrow empty"><h1>Your week is done</h1>
        <p class="lead">You kept ${sumAll.kept} of ${sumAll.logged} logged meals (${sumAll.adherence}%). For those meals you spent ${rm(sumAll.spentToDate)} against ${rm(sumAll.plannedToDate)} planned.</p>
        ${carryText ? `<p>${icon("check")} Next week's plan will use what's left: ${esc(carryText)}.</p>` : ""}
        <div class="btn-row"><button class="btn" type="button" id="next-week">${icon("refresh")} Plan next week</button>
        <button class="btn btn-quiet" type="button" id="review">Review the week</button></div></div>`;
      document.getElementById("next-week").addEventListener("click", () => {
        dropPlan("finished"); storeSet(KEYS.have, carry); go("plan");
      });
      document.getElementById("review").addEventListener("click", () => { todayDayOverride = 6; renderToday(); focusHeading(); });
      return;
    }
    const day = todayDayOverride !== null ? todayDayOverride : Math.min(6, idx);
    const meals = PLAN_SLOTS.filter(s => p.plan[day][s]);
    const dayLog = log.days[String(day)] || {};
    const diff = sumAll.difference;
    const ev = evaluate(p.plan, have);
    const first = useFirst(p.plan, day);
    const isToday = day === Math.min(6, idx);
    const tomorrow = isToday && sumAll.tomorrow.length ? sumAll.tomorrow : [];
    view.innerHTML = `
      <div class="page today">
        <header class="today-head">
          <h1>${isToday ? "Today" : planDayName(p.start, day)}, day ${day + 1} of 7</h1>
          <p class="lead">${esc(dateLabel(addDays(p.start, day)))}. Tick off what you actually ate. Skipped home meals leave their rice, oats or dhal in the cupboard, and next week's plan uses them.</p>
        </header>
        <ol class="weekdots" aria-label="Days of this plan">
          ${DAY_SHORT.map((_, d) => {
            const logged = PLAN_SLOTS.filter(s => p.plan[d][s] && log.days[String(d)] && log.days[String(d)][s]).length;
            const due = PLAN_SLOTS.filter(s => p.plan[d][s]).length;
            return `<li><button type="button" class="wd ${d === day ? "on" : ""} ${logged === due ? "full" : ""}" data-day="${d}" ${d > idx ? "disabled" : ""} ${d === day ? 'aria-current="date"' : ""}>
              <span>${planDayName(p.start, d, true)}</span><span class="tiny num">${logged}/${due}</span></button></li>`;
          }).join("")}
        </ol>
        <div class="today-grid">
          <section class="today-meals" aria-label="Meals">
            ${ev.shopping.some(i => i.packs > 0) ? `<label class="switch groceries"><span>${icon("cart")} I bought this week's groceries (${log.groceries && log.groceryRm !== undefined ? `${rm(log.groceryRm)} paid, from ${log.groceryRids && log.groceryRids.length > 1 ? `${log.groceryRids.length} receipts` : "your receipt"}` : `about ${rm(ev.grocery)}`})</span><input type="checkbox" id="groc" ${log.groceries ? "checked" : ""}></label>` : ""}
            ${first.length ? `<p class="use-first small">${icon("leaf")} Use first today: ${esc(first.join(", "))}.</p>` : ""}
            ${meals.map(s => checkCardHtml(p, day, s, dayLog[s])).join("")}
          </section>
          <aside class="today-side" aria-labelledby="sofar">
            <h2 id="sofar" class="rail-title">So far</h2>
            <dl class="kv big-kv">
              <div><dt>Meals as planned</dt><dd class="num">${sumAll.kept} of ${sumAll.logged} logged</dd></div>
              <div><dt>Planned cost of those meals</dt><dd class="num">${rm(sumAll.plannedToDate)}</dd></div>
              <div><dt>What they really cost</dt><dd class="num">${rm(sumAll.spentToDate)}</dd></div>
              <div><dt>Cash out, groceries included</dt><dd class="num">${rm(sumAll.cashOut)}</dd></div>
            </dl>
            ${!sumAll.logged ? `<p class="small muted">Nothing logged yet. Mark a meal and this compares its real cost with the plan. Home meals count at their ingredient cost.</p>` : ""}
            ${sumAll.logged ? `<div class="banner ${diff > 0.5 ? "warn" : ""}">${icon(diff > 0.5 ? "alert" : "check")}<p>${diff > 0.5 ? `${rm(diff)} over plan so far.${tomorrow.length ? ` Tomorrow's ${esc(tomorrow[0])} is already in your kitchen, so it costs nothing extra.` : " One home meal tomorrow wins most of it back."}` : diff < -0.5 ? `${rm(-diff)} under plan so far.` : "Right on plan."}</p></div>` : ""}
            ${tomorrow.length && !(diff > 0.5) ? `<p class="small">${icon("calendar")} Tomorrow: ${esc(tomorrow.join(" and "))}, already bought.</p>` : ""}
            ${sumAll.foodAid ? `<div class="banner aid">${icon("info")}<div><p><strong>${sumAll.skipped} meals skipped this week.</strong> If that's about money, you're far from the only one: running short of food is common among Malaysian university students.${sourceLink("FOODINSEC")} Your student affairs office can usually help quietly, and surplus-food groups give away good food.${sourceLink("SURPLUS")}</p>
              ${aidTightHtml()}</div></div>` : ""}
          </aside>
        </div>
        ${pastWeeksHtml()}
      </div>`;
    wireToday(p, day, log);
  }

  // Weeks whose plan was remade or finished: their check-ins are kept here, read-only
  function pastWeeksHtml() {
    const hist = validateHistory(storeGet(KEYS.history, null));
    if (!hist.length) return "";
    const rows = hist.map(h => {
      const log = validateLog(h.log);
      const plan = h.plan.map(d => ({ B: d && d.B || null, L: d && d.L || null, D: d && d.D || null, S: d && d.S || null }));
      if (plan.some(d => Object.values(d).some(id => id && !mealById(id)))) return null;
      const sm = h.sums || weekSums(plan, log, {});
      return `<li><span><strong>Week of ${esc(dateLabel(h.start))}</strong><span class="tiny muted">${esc(h.reason || "")}</span></span>
        <span class="small">${sm.kept} of ${sm.logged} meals as planned${sm.skipped ? `, ${sm.skipped} skipped` : ""} · ${rm(sm.spent)} against ${rm(sm.planned)} planned · ${rm(sm.cashOut)} cash out</span></li>`;
    }).filter(Boolean);
    return rows.length ? `<details class="past-weeks"><summary class="btn btn-quiet">${icon("clock")} Past weeks (${rows.length})</summary><ul class="past-list">${rows.join("")}</ul></details>` : "";
  }

  // The food-aid box offers the cheapest week only when it really costs less than this one
  function aidTightHtml() {
    const tw = tightWeek(profile, TIGHT_WEEK);
    const cheaper = tw.profile.budget < profile.budget;
    return `<p class="small">${tw.raised
      ? `With your kitchen and food rules the cheapest possible week is ${rm(tw.minOutlay)}, so RM ${TIGHT_WEEK.budget} isn't reachable. If even that is too much, food aid is the better step: it's what it's for.`
      : `A tight-week plan costs about ${rm(tw.result.totals.outlay)} with Menu Rahmah meals.`}</p>
      ${cheaper ? `<div class="banner-actions"><button type="button" class="btn btn-quiet" id="aid-tight">${icon("bolt")} Switch to the RM ${tw.profile.budget} plan</button></div>` : ""}`;
  }

  function checkCardHtml(p, day, slot, entry) {
    const m = mealById(p.plan[day][slot]);
    const st = mealStats(m);
    const status = entry ? entry.status : null;
    const btn = (val, label) => `<button type="button" class="seg ${status === val ? "on" : ""}" data-slot="${slot}" data-status="${val}" aria-pressed="${status === val}">${label}</button>`;
    return `<article class="check-card ${status ? "done" : ""}">
        <div class="cc-head"><span class="cc-slot">${SLOT_ALL[slot]}</span><span class="tag ${m.source}">${SOURCE_TAG[m.source]}</span></div>
        <p class="cc-meal">${esc(m.name)}</p>
        <p class="tiny muted num">${m.source === "buy" ? rm(st.rm) : `About ${rm(st.rm)} of your groceries`} · ${st.co2.toFixed(2)} kg CO₂e · ${st.fv} g fruit &amp; veg</p>
        ${m.steps && m.source !== "buy" ? `<details class="cc-steps"><summary>How to make it</summary><ol class="steps small">${m.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol></details>` : ""}
        <div class="segs" role="group" aria-label="${SLOT_ALL[slot]}: what happened">
          ${btn("planned", "Ate this")}${btn("other", "Something else")}${btn("skipped", "Skipped")}
        </div>
        ${status === "other" ? `<p class="small cc-other">${esc(entry.label)}: ${rm(entry.rm)}${entry.src === "receipt" ? ` <span class="tiny muted">${icon("receipt")} from a receipt</span>` : ""}</p>` : ""}
      </article>`;
  }

  function wireToday(p, day, log) {
    const groc = document.getElementById("groc");
    if (groc) groc.addEventListener("change", () => { log.groceries = groc.checked; storeSet(KEYS.checkin, log); renderToday(); const g = document.getElementById("groc"); if (g) g.focus(); });
    const aid = document.getElementById("aid-tight");
    if (aid) aid.addEventListener("click", () => {
      const tw = tightWeek(profile, TIGHT_WEEK);
      confirmDrop(`Switch to the RM ${tw.profile.budget} plan`, () => {
        dropPlan("tight week");
        profile = validateProfile(tw.profile);
        storeSet(KEYS.profile, profile); go("plan");
      });
    });
    view.querySelectorAll(".wd[data-day]").forEach(b => b.addEventListener("click", () => { todayDayOverride = Number(b.dataset.day); renderToday(); focusHeading(); }));
    view.querySelectorAll(".seg").forEach(b => b.addEventListener("click", () => {
      const slot = b.dataset.slot, status = b.dataset.status;
      const current = log.days[String(day)] && log.days[String(day)][slot];
      // A meal logged from a receipt: say what changing it does before changing it
      if (current && current.src === "receipt" && !b.dataset.sure) {
        const card = b.closest(".check-card");
        const old = card.querySelector(".confirm"); if (old) old.remove();
        const box = document.createElement("div");
        box.className = "banner warn confirm"; box.setAttribute("role", "alert");
        box.innerHTML = `${icon("alert")}<div><p>This meal came from a receipt (${esc(current.label)}, ${rm(current.rm)}). Changing it takes the receipt off this meal: the receipt stays in My real week as a spend of its own, and this meal counts as you mark it. If the receipt was a mistake, delete it in Tools → My real week instead.</p>
          <div class="banner-actions"><button type="button" class="btn" data-yes>Change it anyway</button><button type="button" class="btn btn-quiet" data-no>Keep the receipt's meal</button></div></div>`;
        card.appendChild(box);
        box.querySelector("[data-yes]").addEventListener("click", () => {
          // the receipt's lines stop standing for this meal (so the meal and the receipt are never the same money)
          storeSet(KEYS.spend, unslotSpends(storeGet(KEYS.spend, null), (current.rids || []).map(x => x.id), addDays(p.start, day), slot));
          log = record(log, day, slot, null);
          b.dataset.sure = "1"; box.remove(); b.click();
        });
        box.querySelector("[data-no]").addEventListener("click", () => { box.remove(); b.focus(); });
        box.querySelector("[data-no]").focus();
        return;
      }
      if (status === "other") { openOther(p, day, slot, log); return; }
      // "Ate this" keeps today's price with the tick, so a later price change doesn't rewrite the week
      const next = current && current.status === status ? null : status === "planned" ? { status, rm: mealStats(mealById(p.plan[day][slot])).rm } : { status };
      log = record(log, day, slot, next);
      storeSet(KEYS.checkin, log);
      renderToday();
      say(next ? "Saved" : "Cleared");
      const again = view.querySelector(`.seg[data-slot="${slot}"][data-status="${status}"]`);
      if (again) again.focus();
    }));
  }

  function openOther(p, day, slot, log) {
    const s = slot === "S" ? "L" : slot;
    const common = MEALS.filter(m => m.slots.includes(s) && m.source === "buy" && m.id !== "skip" && m.id !== "water" && fitsDiet(m, profile.diet) && (!m.rahmah || profile.rahmah))
      .sort((a, b) => mealPrice(a) - mealPrice(b)).slice(0, 8);
    openSheet(`What did you have for ${SLOT_ALL[slot].toLowerCase()}?`, `
      <ul class="pick-list">${common.map(m => `<li><button type="button" class="btn btn-quiet pick" data-meal="${m.id}"><span class="pick-name">${esc(m.name)}</span><span class="num pick-price">${rm(mealPrice(m))}</span></button></li>`).join("")}</ul>
      <form id="other-form" class="other-form" novalidate>
        <h3 class="sheet-sub">Or type it in</h3>
        <label class="field-label" for="other-name">What was it?</label>
        <input id="other-name" class="text-input" type="text" maxlength="80" placeholder="e.g. Nasi kandar">
        <label class="field-label" for="other-rm">How much did it cost?</label>
        <span class="money-input"><span>RM</span><input id="other-rm" type="number" inputmode="decimal" min="0" max="500" step="0.1"></span>
        <div id="other-error" role="alert"></div>
        <div class="sheet-actions"><button class="btn" type="submit">${icon("check")} Save</button></div>
      </form>`, root => {
      const save = (label, amount) => {
        log = record(log, day, slot, { status: "other", rm: amount, label });
        storeSet(KEYS.checkin, log);
        closeSheet(); renderToday(); say("Saved");
      };
      root.querySelectorAll("button.pick").forEach(b => b.addEventListener("click", () => { const m = mealById(b.dataset.meal); save(m.name, mealPrice(m)); }));
      const form = root.querySelector("#other-form");
      form.addEventListener("submit", e => {
        e.preventDefault();
        const name = root.querySelector("#other-name").value.trim();
        const raw = root.querySelector("#other-rm").value;
        const amount = Number(raw);
        if (!name) { showError(root.querySelector("#other-error"), "Add what you ate.", form); root.querySelector("#other-name").focus(); return; }
        if (raw.trim() === "" || !Number.isFinite(amount) || amount < 0 || amount > 500) { showError(root.querySelector("#other-error"), "Add a price between RM 0 and RM 500.", form); root.querySelector("#other-rm").focus(); return; }
        save(name, amount);
      });
    });
  }

  // Helpers the Tools tab (tools.js) uses
  function toolsUi() {
    return { view, esc, rm, rm0, icon, say, showError, openSheet, closeSheet, focusHeading, guard, go,
      profile: () => profile, loadPlan, loadHave, loadFinishedSim, dateLabel, planDayName,
      fitsAll: m => !!profile && fitsDiet(m, profile.diet) && fitsKitchen(m, profile.kitchen), rerender: render };
  }

  // ---------- go ----------
  render();
})();
