// =============================================================
// tools.js — the Tools tab: receipt scanning → My real week, stall price notes, class mode.
// The maths lives in receipt.js, realweek.js, stalls.js and classcode.js; this is the interface.
// app.js passes `ui` (its helpers and state) to render().
// Heavy libraries (OCR 7 MB, QR) load only on the screen that needs them, from /vendor.
// =============================================================
/* global KEYS, storeGet, storeSet, storeRemove, parseReceipt, confirmLines, categorize, validateSpend, validateSpendLog, validateDraft, newSpendId, totalMismatch, SPEND_CATS, unlinkReceipt, linkReceipt, linkedGroceryRm,
   realWeek, RW_CAT_NAMES, RW_CATS, validateStalls, mergeStalls, encodeStalls, decodeStalls, cleanMapLink, newStallId, stallMealPrices, isStallDate,
   studentValues, encodeStudent, describeStudent, decode, importCodes, extractCodes, aggregate, classValues, encodeClass, describeClass,
   compareToClass, CHALLENGES, priceFromLine, priceMatch, PRICE_PIECES, ARCHETYPE_NAMES, cleanTag, validateLog, record, summary, planDay, toKey, addDays, fromKey, mealById, mealPrice,
   MEALS, cleanPriceOverrides, setPriceOverrides, buildReport, evaluate, Tesseract, qrcode, jsQR, BarcodeDetector */
const TOOL_ROUTES = ["tools", "receipt", "realweek", "stalls", "class"];

const EFT_TOOLS = (function () {
  "use strict";
  let ui = null;
  const $ = sel => ui.view.querySelector(sel);
  const CAT_LABEL = { meal: "Meal", drink: "Drink", snack: "Snack", groceries: "Groceries", fees: "Fees", other: "Other" };
  const todayKey = () => toKey(new Date());

  // ---------- small shared pieces ----------
  const scripts = {};
  function loadScript(src) {
    if (!scripts[src]) scripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => resolve(); s.onerror = () => { delete scripts[src]; reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
    return scripts[src];
  }
  const absUrl = p => new URL(p, location.href).href;
  // Route query: #stalls?import=… / #class?code=…
  const query = () => new URLSearchParams((location.hash.split("?")[1] || ""));
  const clearQuery = route => { try { history.replaceState(null, "", "#" + route); } catch (e) { /* file:// */ } };
  const shareBase = () => (/^https?:$/.test(location.protocol) ? location.href.split("#")[0] : "");

  async function qrSvg(text, label) {
    await loadScript("vendor/qr/qrcode.js");
    const qr = qrcode(0, text.length > 300 ? "L" : "M");
    qr.addData(text);
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    return `<figure class="qr" role="img" aria-label="${ui.esc(label)}">${svg.replace(/<svg /, '<svg aria-hidden="true" focusable="false" ')}</figure>`;
  }
  async function copyText(text, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      ta.remove();
    }
    if (btn) { const old = btn.innerHTML; btn.innerHTML = `${ui.icon("check")} ${ok ? "Copied" : "Select and copy it"}`; setTimeout(() => { if (btn.isConnected) btn.innerHTML = old; }, 1800); }
    ui.say(ok ? "Copied" : "Copy didn't work: select the text and copy it");
  }
  // In-page confirm (never a pop-up): resolves with yes()/no() buttons named for the action
  function confirmBox(anchor, text, yesLabel, yes) {
    const old = ui.view.querySelector(".confirm"); if (old) old.remove();
    const box = document.createElement("div");
    box.className = "banner warn confirm"; box.setAttribute("role", "alert");
    box.innerHTML = `${ui.icon("alert")}<div><p>${text}</p><div class="banner-actions"><button type="button" class="btn btn-danger" data-yes>${ui.esc(yesLabel)}</button><button type="button" class="btn btn-quiet" data-no>Keep it</button></div></div>`;
    anchor.insertAdjacentElement("afterend", box);
    box.querySelector("[data-yes]").addEventListener("click", () => { box.remove(); yes(); });
    box.querySelector("[data-no]").addEventListener("click", () => { box.remove(); anchor.focus && anchor.focus(); });
    box.querySelector("[data-no]").focus();
  }
  const daysAgo = key => {
    const n = Math.round((fromKey(todayKey()) - fromKey(key)) / 86400000);
    return n <= 0 ? "today" : n === 1 ? "yesterday" : n < 30 ? `${n} days ago` : n < 60 ? "a month ago" : `${Math.round(n / 30)} months ago`;
  };
  const backLink = () => `<a class="btn btn-ghost back-link" href="#tools">${ui.icon("back")} More</a>`;
  function histHtml(rows, label, unit) {
    const max = Math.max(1, ...rows.map(r => r.n));
    return `<div class="hist" role="group" aria-label="${ui.esc(label)}">${rows.map(r => `<div class="hist-row"><span class="hist-k">${ui.esc(r.label)}</span>
      <span class="bar" aria-hidden="true"><span style="width:${(r.n / max) * 100}%"></span></span><span class="num hist-n">${r.n}<span class="sr-only"> ${unit}</span></span></div>`).join("")}</div>`;
  }

  // ---------- running plan context (for linking receipts to the check-in) ----------
  function planContext() {
    const p = ui.loadPlan();
    if (!p || !p.started) return null;
    const idx = planDay(p.start, new Date());
    // From a week before the start (the shop for a plan starting next Monday) to a week after the end
    if (idx < -7 || idx > 13) return null;
    return { p, idx, log: validateLog(storeGet(KEYS.checkin, null)) };
  }

  // =============================================================
  // HUB
  // =============================================================
  function renderHub() {
    const wk = weekFor(0);
    const stalls = validateStalls(storeGet(KEYS.stalls, null));
    const cls = storeGet(KEYS.classroom, null);
    const n = cls && Array.isArray(cls.codes) ? cls.codes.length : 0;
    ui.view.innerHTML = `<div class="page tools">
      <div class="section-masthead tools-masthead"><div><p class="eyebrow">YOUR FOOD-DAY TOOLKIT</p><h1>More</h1><p class="lead">Your money tools, practice space and a little help.</p></div><span class="masthead-doodle" aria-hidden="true">${ui.icon("wallet")}<small>make it count.</small></span></div>
      <div class="tool-list">
        <section class="tool-group" aria-labelledby="tools-daily"><div class="hub-section-head"><span class="eyebrow">01 / EVERYDAY</span><h2 id="tools-daily">Keep the week on track</h2><p>Check in, record a receipt and see where your money goes.</p></div><ul class="tool-group-list">
        <li><a class="tool" href="#today">${ui.icon("today")}<span><strong>Plan check-in</strong><small>Tick off your weekly plan's meals. Needs a started plan from the Plan tab.</small></span></a></li>
        <li><a class="tool" href="#receipt">${ui.icon("camera")}<span><strong>Scan a receipt</strong><small>Photo or pasted text → lines you check → your real week. Read on this phone, never uploaded.</small></span></a></li>
        <li><a class="tool" href="#realweek">${ui.icon("chart")}<span><strong>My real week</strong><small>${wk.total ? `${ui.rm(wk.total)} ${wk.planWeek ? "so far in your plan's week" : "in the last 7 days"}, by kind and day.` : "Where the money really went, against your budget and plan."}</small></span></a></li>
        <li><a class="tool" href="#stalls">${ui.icon("pin")}<span><strong>Stall price notes</strong><small>${stalls.length ? `${stalls.length} stall${stalls.length > 1 ? "s" : ""} noted. Share the list with friends by link or QR.` : "Note what stalls near you charge; feed the prices into your plan."}</small></span></a></li>
        </ul></section>
        <section class="tool-group" aria-labelledby="tools-practice"><div class="hub-section-head"><span class="eyebrow">02 / PRACTICE</span><h2 id="tools-practice">Learn by doing</h2><p>Try a food week, then share and compare in class.</p></div><ul class="tool-group-list">
        <li><a class="tool" href="#week">${ui.icon("play")}<span><strong>Practice week (game)</strong><small>Live one student food week in 10 minutes: kopitiam breakfasts, rainy-day delivery, a 1 a.m. mamak run. Mistakes cost nothing.</small></span></a></li>
        <li><a class="tool" href="#class">${ui.icon("school")}<span><strong>Class mode</strong><small>${n ? `${n} result codes in your class view.` : "Share an anonymous result code, or collect your class's codes as a lecturer. No server, no names."}</small></span></a></li>
        </ul></section>
      </div>
      <div class="tour-replay-banner"><div><h2>Need a hand?</h2><p>Replay the walkthrough whenever you like.</p></div><button type="button" class="btn" id="replay-tour" data-replay-tour>Show me around ${ui.icon("arrow")}</button></div>

    </div>`;
  }

  // =============================================================
  // RECEIPT → confirm → My real week
  // =============================================================
  let draft = null; // { store, date, total, lines: [{label, rm, category, mealId?, packId?, slot?}], warnings, source }
  // The draft lives on the device until it is saved or discarded: a reload or a closed tab doesn't lose a checked receipt
  // (the raw camera text is not kept: only the lines, which the student sees and can discard)
  const keepDraft = () => { if (draft) { draft.at = Date.now(); storeSet(KEYS.draft, { ...draft, ocrText: "" }); } };
  const dropDraft = () => { draft = null; storeRemove(KEYS.draft); };

  function renderReceipt() {
    if (!draft) draft = validateDraft(storeGet(KEYS.draft, null));
    if (draft) { renderConfirm(); return; }
    storeRemove(KEYS.draft);
    const fileOk = /^https?:$/.test(location.protocol);
    ui.view.innerHTML = `<div class="page narrow receipt-page">
      ${backLink()}
      <h1>Scan a receipt</h1>
      <p class="lead">Turn a receipt into spending lines. You check every line before anything is saved: phone cameras and receipt paper both make mistakes.</p>
      <div class="banner">${ui.icon("lock")}<p><strong>The photo never leaves this phone.</strong> It's read here, by an engine built into the app, and thrown away as soon as the text is out. Only the lines you confirm are kept, on this device.</p></div>
      <section class="card rc-start" aria-labelledby="rc-photo">
        <h2 id="rc-photo" class="card-title">${ui.icon("camera")} From a photo</h2>
        ${fileOk ? `<label class="btn file-btn" for="rc-file">${ui.icon("camera")} Take or choose a photo</label>
        <input id="rc-file" class="sr-only" type="file" accept="image/*" capture="environment">
        <p class="tiny muted">Lay it flat, fill the frame, good light. The first scan loads the reading engine (about 7 MB) once; after that it works offline.</p>
        <div id="rc-progress" aria-live="polite"></div>`
        : `<p class="small">Photo scanning needs the app opened from a web address (run <code>npm run serve</code>). Paste the text below instead.</p>`}
      </section>
      <section class="card rc-start" aria-labelledby="rc-text-h">
        <h2 id="rc-text-h" class="card-title">${ui.icon("receipt")} Paste or type it</h2>
        <form id="rc-text-form" novalidate>
          <label class="field-label" for="rc-text">Receipt text, one item per line</label>
          <textarea id="rc-text" class="text-input" rows="6" placeholder="NASI LEMAK AYAM  8.50&#10;TEH TARIK  2.80&#10;TOTAL  11.30"></textarea>
          <div id="rc-error"></div>
          <button class="btn btn-quiet" type="submit">${ui.icon("check")} Read these lines</button>
        </form>
      </section>
      <section class="card rc-start" aria-labelledby="rc-quick-h">
        <h2 id="rc-quick-h" class="card-title">${ui.icon("wallet")} No receipt? Add a spend</h2>
        <form id="rc-quick" class="quick-form" novalidate>
          <label class="field-label" for="q-label">What was it?</label>
          <input id="q-label" class="text-input" type="text" maxlength="60" placeholder="e.g. Nasi kandar and iced Milo">
          <div class="quick-row">
            <div><label class="field-label" for="q-rm">Amount</label><span class="money-input"><span>RM</span><input id="q-rm" type="number" inputmode="decimal" min="0.1" max="2000" step="0.1"></span></div>
            <div><label class="field-label" for="q-cat">Kind</label><select id="q-cat" class="text-input">${SPEND_CATS.map(c => `<option value="${c}">${CAT_LABEL[c]}</option>`).join("")}</select></div>
            <div><label class="field-label" for="q-date">Date</label><input id="q-date" class="text-input" type="date" value="${todayKey()}" max="${todayKey()}"></div>
          </div>
          <div id="q-error"></div>
          <button class="btn btn-quiet" type="submit">${ui.icon("plus")} Add to my real week</button>
        </form>
      </section>
    </div>`;
    const file = $("#rc-file");
    if (file) file.addEventListener("change", () => { if (file.files && file.files[0]) scanPhoto(file.files[0]); file.value = ""; });
    $("#rc-text-form").addEventListener("submit", e => {
      e.preventDefault();
      const t = $("#rc-text").value;
      if (!t.trim()) { ui.showError($("#rc-error"), "Paste or type the receipt's lines first.", e.target); return; }
      startDraft(t, "typed");
    });
    $("#rc-quick").addEventListener("submit", e => {
      e.preventDefault();
      const label = $("#q-label").value.trim(), rm = Number($("#q-rm").value), date = $("#q-date").value;
      if (!label) { ui.showError($("#q-error"), "Say what it was.", e.target); $("#q-label").focus(); return; }
      if (!(rm >= 0.1 && rm <= 2000)) { ui.showError($("#q-error"), "Add an amount between RM 0.10 and RM 2,000.", e.target); $("#q-rm").focus(); return; }
      const cat = $("#q-cat").value;
      const c = categorize(label);
      const sp = validateSpend({ id: newSpendId(), date: date || todayKey(), store: "", items: [{ label, rm, category: cat, mealId: c.mealId, packId: c.packId }], total: rm, source: "typed" });
      if (!sp) { ui.showError($("#q-error"), "Check the date.", e.target); return; }
      saveSpend(sp);
      showWeekOf(sp.date);
      ui.say("Added to your real week");
      ui.go("realweek");
    });
  }

  // Downscale, greyscale and stretch contrast: Tesseract reads receipts much better this way
  async function prepareImage(fileBlob) {
    const url = URL.createObjectURL(fileBlob);
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("Not an image")); i.src = url; });
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = longest > 2200 ? 2200 / longest : longest < 900 ? 900 / longest : 1;
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height);
      let lo = 255, hi = 0;
      const grey = new Uint8ClampedArray(c.width * c.height);
      for (let i = 0, j = 0; i < d.data.length; i += 4, j++) {
        const v = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        grey[j] = v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
      const span = Math.max(1, hi - lo);
      for (let i = 0, j = 0; i < d.data.length; i += 4, j++) { const v = ((grey[j] - lo) / span) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
      g.putImageData(d, 0, 0);
      return c;
    } finally { URL.revokeObjectURL(url); }
  }

  async function scanPhoto(fileBlob) {
    const box = $("#rc-progress");
    const show = (text, pct) => { if (box && box.isConnected) box.innerHTML = `<p class="small">${ui.esc(text)}</p>${pct !== null ? `<span class="meter" aria-hidden="true"><span style="width:${Math.round(pct * 100)}%"></span></span>` : ""}`; };
    let canvas = null, worker = null;
    try {
      show("Getting the photo ready…", 0.05);
      canvas = await prepareImage(fileBlob);
      show("Loading the reading engine (once, about 7 MB)…", 0.1);
      await loadScript("vendor/tesseract/tesseract.min.js");
      worker = await Tesseract.createWorker("eng", 1, {
        workerPath: absUrl("vendor/tesseract/worker.min.js"), corePath: absUrl("vendor/tesseract/tesseract-core-lstm.wasm.js"),
        langPath: absUrl("vendor/tesseract/lang"), gzip: true, workerBlobURL: false, cacheMethod: "none",
        logger: m => { if (m.status === "recognizing text") show(`Reading the receipt… ${Math.round(m.progress * 100)}%`, 0.2 + m.progress * 0.8); }
      });
      await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
      const { data } = await worker.recognize(canvas);
      startDraft(data.text || "", "receipt");
    } catch (e) {
      show(null, null);
      if (box && box.isConnected) box.innerHTML = `<div class="banner bad">${ui.icon("alert")}<p>Couldn't read that photo (${ui.esc(e.message || "unknown error")}). Try a sharper, flatter photo, or type the lines below.</p></div>`;
    } finally {
      if (worker) worker.terminate().catch(() => {});
      if (canvas) { canvas.width = 0; canvas.height = 0; } // the image is gone once the text is out
    }
  }

  function startDraft(text, source) {
    const parsed = parseReceipt(text, { typed: source === "typed" });
    const ctx = planContext();
    draft = {
      source, store: parsed.store || "", date: parsed.date && parsed.date <= todayKey() ? parsed.date : todayKey(),
      total: parsed.total, warnings: parsed.warnings, ocrText: source === "receipt" ? text.slice(0, 3000) : "",
      lines: confirmLines(parsed).map(l => ({ label: l.label, rm: l.rm, category: l.category, mealId: l.mealId || null, packId: l.packId || null, qty: l.qty, slot: "" })),
      groceries: !!ctx && parsed.items.length > 0 && confirmLines(parsed).filter(l => l.category === "groceries").length >= Math.max(1, parsed.items.length / 2),
      savePrices: false
    };
    if (!draft.lines.length) draft.lines.push({ label: "", rm: 0, category: "meal", mealId: null, packId: null, qty: 1, slot: "" });
    renderConfirm();
    ui.focusHeading();
  }

  function renderConfirm() {
    const d = draft;
    keepDraft();
    const ctx = planContext();
    const dayIdx = ctx ? planDay(ctx.p.start, fromKey(d.date)) : -99;
    const inPlan = !!ctx && dayIdx >= 0 && dayIdx <= 6;
    // Groceries bought on shopping day (the day before the plan starts) still belong to the plan
    const groceryDay = !!ctx && dayIdx >= -7 && dayIdx <= 6;
    const dayName = d.date === todayKey() ? "today's" : `${fromKey(d.date).toLocaleDateString("en-MY", { weekday: "long" })}'s`;
    const slotOpts = inPlan ? ["B", "L", "D", "S"].filter(s => ctx.p.plan[dayIdx][s]).map(s => ({ s, name: mealById(ctx.p.plan[dayIdx][s]).name })) : [];
    const SLOTN = { B: "Breakfast", L: "Lunch", D: "Dinner", S: "Snack" };
    const sum = Math.round(d.lines.reduce((a, l) => a + (Number(l.rm) || 0), 0) * 100) / 100;
    const priceable = d.lines.filter(l => l.mealId && l.rm > 0 && priceFromLine(l.mealId, l.rm, l.qty) !== null);
    ui.view.innerHTML = `<div class="page narrow receipt-page">
      <h1>Check the lines</h1>
      <p class="lead">${d.source === "receipt" ? "This is what the camera read. Fix anything wrong, remove what isn't food, then save." : "Fix anything wrong, remove what isn't food, then save."}</p>
      ${d.warnings.length ? `<div class="banner warn" id="rc-warn">${ui.icon("alert")}<div>${d.warnings.map(w => `<p>${ui.esc(w)}</p>`).join("")}</div></div>` : ""}
      <form id="rc-form" novalidate>
        <div class="rc-meta">
          <div><label class="field-label" for="rc-store">Shop</label><input id="rc-store" class="text-input" type="text" maxlength="40" value="${ui.esc(d.store)}"></div>
          <div><label class="field-label" for="rc-date">Date</label><input id="rc-date" class="text-input" type="date" value="${d.date}" max="${todayKey()}"></div>
        </div>
        <ol class="rc-lines">${d.lines.map((l, i) => `<li class="rc-line">
          <label class="sr-only" for="rl-label-${i}">Line ${i + 1}: what</label>
          <input id="rl-label-${i}" class="text-input rl-label" data-i="${i}" data-f="label" type="text" maxlength="60" value="${ui.esc(l.label)}" placeholder="What was it?">
          <div class="rl-row">
            <span class="money-input"><span>RM</span><label class="sr-only" for="rl-rm-${i}">Line ${i + 1}: amount</label><input id="rl-rm-${i}" data-i="${i}" data-f="rm" type="number" inputmode="decimal" step="0.01" min="-2000" max="2000" value="${l.rm ? Number(l.rm).toFixed(2) : ""}"></span>
            <label class="sr-only" for="rl-cat-${i}">Line ${i + 1}: kind</label>
            <select id="rl-cat-${i}" class="text-input" data-i="${i}" data-f="category">${SPEND_CATS.map(c => `<option value="${c}" ${l.category === c ? "selected" : ""}>${CAT_LABEL[c]}</option>`).join("")}</select>
            <button type="button" class="btn btn-ghost rl-del" data-del="${i}" aria-label="Remove line ${i + 1}${l.label ? ": " + ui.esc(l.label) : ""}">${ui.icon("trash")} Remove</button>
          </div>
          ${slotOpts.length && ["meal", "drink", "snack"].includes(l.category) ? `<label class="field-label tiny" for="rl-slot-${i}">Count it in ${ui.esc(dayName)} check-in as</label>
            <select id="rl-slot-${i}" class="text-input" data-i="${i}" data-f="slot"><option value="">Don't link it</option>${slotOpts.map(o => `<option value="${o.s}" ${l.slot === o.s ? "selected" : ""}>${SLOTN[o.s]} (planned: ${ui.esc(o.name)})</option>`).join("")}</select>` : ""}
        </li>`).join("")}</ol>
        <button type="button" class="btn btn-quiet" id="rc-add">${ui.icon("plus")} Add a line</button>
        <dl class="kv rc-sum">
          <div><dt>Lines add up to</dt><dd class="num" id="rc-sum">${ui.rm(sum)}</dd></div>
          <div><dt><label for="rc-total">Total on the receipt</label></dt><dd><span class="money-input"><span>RM</span><input id="rc-total" type="number" inputmode="decimal" step="0.01" min="0" max="2000" value="${d.total !== null && d.total !== undefined ? Number(d.total).toFixed(2) : ""}"></span></dd></div>
        </dl>
        <p class="tiny muted">Tax, service charge and rounding are the difference between the two, and count too. Malaysian cash totals round to the nearest 5 sen.</p>
        ${groceryDay && d.lines.some(l => l.category === "groceries") ? `<label class="switch"><span>These are this week's groceries<small>Ticks “I bought the groceries” in your check-in, at what you really paid. A second grocery receipt adds to it.</small></span><input type="checkbox" id="rc-groc" ${d.groceries ? "checked" : ""}></label>` : ""}
        ${priceable.length ? `<fieldset class="field rc-prices" id="rc-prices"><legend>Save prices to My prices <small class="muted">(your plan then uses what you really pay)</small></legend>
          ${priceable.map(l => { const i = d.lines.indexOf(l); const close = priceMatch(l.label, l.mealId) === "close"; return `<label class="check-line"><input type="checkbox" data-price="${i}" ${l.price ? "checked" : ""}>
            <span>${ui.esc(mealById(l.mealId).name)} ${ui.rm(priceFromLine(l.mealId, l.rm, l.qty))}${close ? "" : `<small class="tag flag">Not the same meal?</small>`}
            <small class="muted">from “${ui.esc(l.label)}”${close ? "" : `. This line names a different dish than the plan's ${ui.esc(mealById(l.mealId).name)}: tick it only if it's the same meal.`}</small></span></label>`; }).join("")}
        </fieldset>` : ""}
        <div id="rc-form-error"></div>
        <div class="btn-row"><button class="btn" type="submit">${ui.icon("check")} Save to my real week</button><button type="button" class="btn btn-quiet" id="rc-cancel">Discard</button></div>
      </form>
      ${d.ocrText ? `<details class="rc-raw"><summary>What the camera read</summary><pre>${ui.esc(d.ocrText)}</pre></details>` : ""}
    </div>`;
    const form = $("#rc-form");
    const sync = () => {
      d.store = $("#rc-store").value; d.date = $("#rc-date").value || todayKey();
      const t = $("#rc-total").value; d.total = t === "" ? null : Number(t);
      const g = $("#rc-groc"); if (g) d.groceries = g.checked;
      form.querySelectorAll("[data-price]").forEach(cb => { const l = d.lines[Number(cb.dataset.price)]; if (l) l.price = cb.checked; });
      keepDraft();
    };
    form.addEventListener("input", e => {
      const el = e.target;
      if (el.dataset && el.dataset.i !== undefined) {
        const l = d.lines[Number(el.dataset.i)];
        if (el.dataset.f === "rm") l.rm = el.value === "" ? 0 : Number(el.value);
        else if (el.dataset.f === "label") { l.label = el.value; const c = categorize(el.value); l.mealId = c.mealId || null; l.packId = c.packId || null; l.price = false; }
        else l[el.dataset.f] = el.value;
        const s = Math.round(d.lines.reduce((a, x) => a + (Number(x.rm) || 0), 0) * 100) / 100;
        $("#rc-sum").textContent = ui.rm(s);
      }
      sync();
    });
    // a kind change can add or remove the check-in link, and the date changes which plan day it is
    form.addEventListener("change", e => { if (e.target.dataset.f === "category" || e.target.id === "rc-date") { sync(); keepFocus(e.target.id); } });
    form.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => { sync(); d.lines.splice(Number(b.dataset.del), 1); if (!d.lines.length) d.lines.push({ label: "", rm: 0, category: "meal", slot: "" }); keepFocus("rc-add"); ui.say("Line removed"); }));
    $("#rc-add").addEventListener("click", () => { sync(); d.lines.push({ label: "", rm: 0, category: "meal", slot: "" }); keepFocus(`rl-label-${d.lines.length - 1}`); });
    $("#rc-cancel").addEventListener("click", () => { dropDraft(); renderReceipt(); ui.focusHeading(); ui.say("Discarded"); });
    let totalChecked = false; // the student has seen and answered the total-vs-lines question
    form.addEventListener("input", () => { totalChecked = false; });
    form.addEventListener("submit", e => {
      e.preventDefault();
      sync();
      const lines = d.lines.filter(l => String(l.label).trim() || Number(l.rm));
      const bad = lines.find(l => !String(l.label).trim() || !Number.isFinite(Number(l.rm)) || Number(l.rm) === 0 || Math.abs(Number(l.rm)) > 2000);
      if (!lines.length) { ui.showError($("#rc-form-error"), "Add at least one line with what it was and what it cost.", form); return; }
      if (bad) { ui.showError($("#rc-form-error"), `Each line needs a name and an amount. Check “${ui.esc(bad.label || "the empty line")}”.`, form); return; }
      const lineSum = Math.round(lines.reduce((a, l) => a + Number(l.rm), 0) * 100) / 100;
      const hasTotal = d.total !== null && Number.isFinite(d.total) && d.total >= 0;
      // A total far from the lines usually means a misread price (or a missed line): ask before trusting it
      if (hasTotal && !totalChecked && totalMismatch(d.total, lineSum)) {
        totalBox(lineSum, d.total, useTotal => { totalChecked = true; if (!useTotal) { d.total = lineSum; $("#rc-total").value = lineSum.toFixed(2); } form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true })); });
        return;
      }
      const total = hasTotal ? d.total : lineSum;
      const linkable = l => inPlan && l.slot && ["meal", "drink", "snack"].includes(l.category);
      const sp = validateSpend({ id: newSpendId(), date: d.date, store: d.store, total, source: d.source === "receipt" ? "receipt" : "typed",
        items: lines.map(l => ({ label: l.label, rm: Number(l.rm), category: l.category, mealId: l.mealId, packId: l.packId, slot: linkable(l) ? l.slot : undefined })) });
      if (!sp) { ui.showError($("#rc-form-error"), "Check the date and the amounts.", form); return; }
      saveSpend(sp);
      // Link to the check-in: logged as "something else" at the real price, marked with this receipt's id.
      // Two lines counted as the same meal (nasi lemak + teh tarik as breakfast) add up into one entry.
      if (ctx && (inPlan || groceryDay)) {
        let log = ctx.log;
        const bySlot = {};
        lines.forEach(l => { if (linkable(l)) { const b = bySlot[l.slot] = bySlot[l.slot] || { rm: 0, labels: [] }; b.rm += Math.max(0, Number(l.rm)); b.labels.push(String(l.label).trim()); } });
        Object.keys(bySlot).forEach(slot => { log = linkReceipt(log, dayIdx, slot, sp.id, Math.round(bySlot[slot].rm * 100) / 100, bySlot[slot].labels.join(" + ").slice(0, 80)); });
        if (d.groceries && $("#rc-groc")) {
          const rids = (log.groceryRids || []).concat(sp.id);
          log = validateLog({ ...log, groceries: true, groceryRids: rids, groceryRm: linkedGroceryRm(validateSpendLog(storeGet(KEYS.spend, null)), rids) });
        }
        storeSet(KEYS.checkin, log);
      }
      // only the lines the student ticked, each one checked against the meal it would price
      const picked = d.lines.filter(l => l.price && l.mealId && l.rm > 0 && priceFromLine(l.mealId, l.rm, l.qty) !== null);
      if (picked.length) {
        const pr = cleanPriceOverrides(storeGet(KEYS.prices, null));
        picked.forEach(l => { pr.meals[l.mealId] = priceFromLine(l.mealId, l.rm, l.qty); });
        storeSet(KEYS.prices, setPriceOverrides(pr));
      }
      dropDraft();
      // groceries linked to a running plan count in the plan's week: show that week, not the shopping day's
      showWeekOf(d.groceries && $("#rc-groc") && ctx && ctx.idx >= 0 && ctx.idx <= 6 ? ctx.p.start : sp.date);
      ui.say(`Saved ${lines.length} line${lines.length > 1 ? "s" : ""}`);
      ui.go("realweek");
    });
    function totalBox(lineSum, total, done) {
      const old = ui.view.querySelector(".confirm"); if (old) old.remove();
      const box = document.createElement("div");
      box.className = "banner warn confirm"; box.setAttribute("role", "alert"); box.id = "rc-total-check";
      const more = total > lineSum;
      box.innerHTML = `${ui.icon("alert")}<div><p>The lines add up to ${ui.rm(lineSum)} but the total says ${ui.rm(total)}, ${ui.rm(Math.abs(total - lineSum))} ${more ? "more" : "less"}. ${more ? "That's more than tax and service charge usually add: a line may be missing or misread." : "A price was probably misread, or a discount is missing."}</p>
        <div class="banner-actions"><button type="button" class="btn" data-total>Save ${ui.rm(total)}, the receipt total</button><button type="button" class="btn btn-quiet" data-lines>Use the lines: ${ui.rm(lineSum)}</button><button type="button" class="btn btn-ghost" data-fix>Fix the lines</button></div></div>`;
      $("#rc-form-error").insertAdjacentElement("afterend", box);
      box.querySelector("[data-total]").addEventListener("click", () => { box.remove(); done(true); });
      box.querySelector("[data-lines]").addEventListener("click", () => { box.remove(); done(false); });
      box.querySelector("[data-fix]").addEventListener("click", () => { box.remove(); const f = $("#rl-rm-0"); if (f) f.focus(); });
      box.querySelector("[data-total]").focus();
    }
    function keepFocus(id) { renderConfirm(); const el = document.getElementById(id); if (el) el.focus(); }
  }

  function saveSpend(sp) {
    const all = validateSpendLog(storeGet(KEYS.spend, null)).filter(x => x.id !== sp.id);
    all.unshift(sp);
    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    storeSet(KEYS.spend, all.slice(0, 400));
  }

  // =============================================================
  // MY REAL WEEK
  // =============================================================
  let rwOffset = 0; // weeks back from the current one
  // After saving, show the week the receipt belongs to
  function showWeekOf(date) {
    const ctx = planContext();
    const baseFrom = ctx && ctx.idx >= 0 && ctx.idx <= 6 ? ctx.p.start : addDays(todayKey(), -6);
    const back = Math.round((fromKey(baseFrom) - fromKey(date)) / 86400000);
    rwOffset = back > 0 ? Math.ceil(back / 7) : 0;
  }
  // The same numbers on the Tools hub and on My real week: the plan's week while one runs, else the last 7 days
  function weekFor(offset) {
    const profile = ui.profile();
    const spends = validateSpendLog(storeGet(KEYS.spend, null));
    const ctx = planContext();
    const running = !!ctx && ctx.idx >= 0 && ctx.idx <= 6;
    const baseFrom = running ? ctx.p.start : addDays(todayKey(), -6);
    const from = addDays(baseFrom, -7 * offset);
    const planWeekShown = running && offset === 0;
    const wk = realWeek({ spends, today: new Date(), budget: profile ? profile.budget : null, plan: planWeekShown ? ctx.p.plan : null, start: from,
      log: planWeekShown ? ctx.log : null, have: ui.loadHave(), mealById, mealPrice,
      // the shop for the running plan counts in the plan's week, so not again in the week it was bought
      groceriesElsewhere: running && !planWeekShown ? ctx.log.groceryRids || [] : [] });
    return Object.assign(wk, { planWeek: planWeekShown, spends, from });
  }
  function renderRealWeek() {
    const wk = weekFor(rwOffset);
    const spends = wk.spends, from = wk.from, planWeekShown = wk.planWeek;
    const older = spends.some(s => s.date < from);
    const maxDay = Math.max(1, ...wk.days.map(x => x.rm));
    const cats = RW_CATS.filter(c => Math.abs(wk.byCat[c]) > 0.001);
    const maxCat = Math.max(1, ...cats.map(c => wk.byCat[c]));
    const inWindow = spends.filter(s => s.date >= wk.from && s.date <= wk.to);
    const pct = wk.budget ? Math.min(100, (wk.total / wk.budget) * 100) : 0;
    const label = k => fromKey(k).toLocaleDateString("en-MY", { weekday: "short" });
    ui.view.innerHTML = `<div class="page realweek">
      ${backLink()}
      <header class="rw-head">
        <h1>My real week</h1>
        <p class="lead">${ui.esc(fromKey(wk.from).toLocaleDateString("en-MY", { day: "numeric", month: "short" }))} – ${ui.esc(fromKey(wk.to).toLocaleDateString("en-MY", { day: "numeric", month: "short" }))}${planWeekShown ? ", your plan's week" : rwOffset ? "" : ", the last 7 days"}. Everything here comes from receipts and spending you confirmed${planWeekShown ? " and your check-in" : ""}.</p>
        <div class="btn-row"><a class="btn" href="#receipt">${ui.icon("camera")} Scan a receipt</a>
          <button type="button" class="btn btn-quiet" id="rw-prev" ${older ? "" : "disabled"}>${ui.icon("back")} Earlier week</button>
          <button type="button" class="btn btn-quiet" id="rw-next" ${rwOffset ? "" : "disabled"}>Later week ${ui.icon("arrow")}</button></div>
      </header>
      ${!wk.total ? `<div class="card empty-card"><p>Nothing logged for these days yet. Scan a receipt or add a spend, and this shows where the money went: meals, drinks, groceries and fees, day by day.</p></div>` : `
      <section class="totals rw-totals" aria-label="Week totals">
        <div class="total ${wk.overBudget > 0 ? "bad" : ""}"><span class="t-label">${ui.icon("wallet")} Spent</span><span class="t-value num">${ui.rm(wk.total)}</span>
          <span class="t-sub">${wk.overBudget > 0 ? `${ui.rm(wk.overBudget)} over your ${ui.rm0(wk.budget)} budget` : `of your ${ui.rm0(wk.budget)} budget`}</span>
          <span class="meter ${wk.overBudget > 0 ? "over" : ""}" aria-hidden="true"><span style="width:${pct}%"></span></span></div>
        ${wk.planned !== null ? `<div class="total"><span class="t-label">${ui.icon("calendar")} Your plan</span><span class="t-value num">${ui.rm(wk.planned)}</span><span class="t-sub">${wk.total > wk.planned ? `${ui.rm(wk.total - wk.planned)} more than planned so far` : "for the whole week"}</span></div>` : ""}
        <div class="total"><span class="t-label">${ui.icon("receipt")} Logged</span><span class="t-value num">${inWindow.length}</span><span class="t-sub">receipts and spends${wk.estimatedGroceries ? `; groceries estimated at ${ui.rm(wk.estimatedGroceries)} from your list` : ""}</span></div>
      </section>
      ${wk.tips.length ? `<section class="card rw-tips" aria-labelledby="rw-tips-h"><h2 id="rw-tips-h" class="card-title">${ui.icon("bolt")} What stands out</h2><ul>${wk.tips.map(t => `<li>${ui.esc(t)}</li>`).join("")}</ul></section>` : ""}
      <div class="rw-grid">
        <section class="card" aria-labelledby="rw-cat-h"><h2 id="rw-cat-h" class="card-title">By kind</h2>
          <div class="hist">${cats.map(c => `<div class="hist-row"><span class="hist-k">${RW_CAT_NAMES[c]}</span><span class="bar" aria-hidden="true"><span style="width:${Math.max(0, (wk.byCat[c] / maxCat) * 100)}%"></span></span><span class="num hist-n">${ui.rm(wk.byCat[c])}</span></div>`).join("")}</div>
        </section>
        <section class="card" aria-labelledby="rw-day-h"><h2 id="rw-day-h" class="card-title">By day</h2>
          <div class="rw-days">${wk.days.map(x => `<div class="rw-day"><span class="rw-bar" aria-hidden="true"><span style="height:${(Math.max(0, x.rm) / maxDay) * 100}%"></span></span><span class="tiny">${label(x.key)}</span><span class="tiny num">${x.rm ? Math.round(x.rm) : "–"}</span></div>`).join("")}</div>
          <p class="sr-only">${wk.days.map(x => `${label(x.key)}: ${ui.rm(x.rm)}`).join("; ")}</p>
        </section>
      </div>
      <section class="card" aria-labelledby="rw-top-h"><h2 id="rw-top-h" class="card-title">Biggest items</h2>
        <dl class="kv">${wk.items.slice(0, 6).map(it => `<div><dt>${ui.esc(it.label)}${it.n > 1 ? ` <span class="muted">×${it.n}</span>` : ""}</dt><dd class="num">${ui.rm(it.rm)}</dd></div>`).join("")}</dl>
      </section>`}
      ${spends.length ? `<section class="rw-receipts" aria-labelledby="rw-rec-h"><h2 id="rw-rec-h" class="section-title">${ui.icon("receipt")} Saved receipts and spends</h2>
        <ul class="rec-list">${spends.slice(0, 30).map(s => `<li class="rec-item"><span><strong>${ui.esc(s.store || s.items[0].label)}</strong><span class="tiny muted">${ui.esc(fromKey(s.date).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" }))} · ${s.items.length} line${s.items.length > 1 ? "s" : ""}${s.source === "receipt" ? " · scanned" : ""}</span></span>
          <span class="num rec-total">${ui.rm(s.total)}</span><button type="button" class="btn btn-ghost" data-del-spend="${s.id}" aria-label="Delete ${ui.esc(s.store || s.items[0].label)}, ${ui.rm(s.total)}">${ui.icon("trash")} Delete</button></li>`).join("")}</ul></section>` : ""}
      <p class="tiny muted">Receipts stay on this device. Meals you ticked as eaten in your check-in count at their planned price. A meal linked to a receipt counts once, at the receipt's price, and deleting the receipt clears it from the check-in.</p>
    </div>`;
    $("#rw-prev").addEventListener("click", () => { rwOffset++; renderRealWeek(); const b = $("#rw-prev"); (b && !b.disabled ? b : $("#rw-next")).focus(); });
    $("#rw-next").addEventListener("click", () => { rwOffset = Math.max(0, rwOffset - 1); renderRealWeek(); const b = $("#rw-next"); (b && !b.disabled ? b : $("#rw-prev")).focus(); });
    ui.view.querySelectorAll("[data-del-spend]").forEach(b => b.addEventListener("click", () => {
      const rid = b.dataset.delSpend;
      const c = planContext();
      const linked = c && (Object.values(c.log.days).some(day => Object.values(day).some(e => (e.rids || []).some(x => x.id === rid))) || (c.log.groceryRids || []).includes(rid));
      confirmBox(b.closest("li"), `Delete this receipt from your real week?${linked ? " The check-in meals and groceries it logged are cleared too." : ""}`, "Delete it", () => {
        const left = validateSpendLog(storeGet(KEYS.spend, null)).filter(s => s.id !== rid);
        storeSet(KEYS.spend, left);
        if (c) storeSet(KEYS.checkin, unlinkReceipt(c.log, rid, rids => linkedGroceryRm(left, rids)));
        renderRealWeek(); ui.focusHeading(); ui.say("Deleted");
      });
    }));
  }

  // =============================================================
  // STALL PRICE NOTES
  // =============================================================
  const mealMatch = name => { const c = categorize(name); return c.mealId && PRICE_PIECES[c.mealId] ? c.mealId : null; };
  function loadStalls() { return validateStalls(storeGet(KEYS.stalls, null)); }

  function renderStalls() {
    const stalls = loadStalls();
    const q = query();
    let incoming = null;
    if (q.get("import")) {
      const d = decodeStalls(q.get("import") + (q.get("c") ? "." + q.get("c") : ""));
      incoming = d.ok ? { ...mergeStalls(stalls, d.stalls), count: d.stalls.length } : { error: d.error };
    }
    const prices = stallMealPrices(stalls, mealMatch, (id, rm) => priceFromLine(id, rm, 1));
    const nPrices = Object.keys(prices).length;
    ui.view.innerHTML = `<div class="page narrow stalls-page">
      ${backLink()}
      <h1>Stall price notes</h1>
      <p class="lead">What the stalls and cafés near you really charge. Your plan can use these prices instead of our estimates.</p>
      ${incoming ? (incoming.error ? `<div class="banner bad" role="alert">${ui.icon("alert")}<p>${ui.esc(incoming.error)}</p></div>`
        : `<div class="banner" role="alert" id="import-banner">${ui.icon("users")}<div><p><strong>A friend shared ${incoming.count} stall${incoming.count > 1 ? "s" : ""}.</strong> Adding them gives you ${incoming.added} new stall${incoming.added === 1 ? "" : "s"} and newer prices for ${incoming.updated}. Where you both noted a price, the newer one is kept.</p>
          <div class="banner-actions"><button type="button" class="btn" id="import-yes">${ui.icon("check")} Add to my notes</button><button type="button" class="btn btn-quiet" id="import-no">Not now</button></div></div></div>`) : ""}
      <div class="btn-row"><button type="button" class="btn" id="stall-add">${ui.icon("plus")} Add a stall</button>
        ${stalls.length ? `<button type="button" class="btn btn-quiet" id="stall-share">${ui.icon("qr")} Share my list</button>` : ""}
        ${nPrices ? `<button type="button" class="btn btn-quiet" id="stall-prices">${ui.icon("tag")} Use in My prices (${nPrices})</button>` : ""}</div>
      ${stalls.length ? `<ul class="stall-list">${stalls.map(s => `<li class="card stall-card">
          <div class="stall-head"><h2 class="card-title">${ui.esc(s.name)}</h2>${s.area ? `<p class="small muted">${ui.icon("pin")} ${ui.esc(s.area)}</p>` : ""}</div>
          ${s.items.length ? `<dl class="kv">${s.items.map(it => `<div><dt>${ui.esc(it.name)} <span class="tiny muted">${daysAgo(it.date)}</span></dt><dd class="num">${ui.rm(it.rm)}</dd></div>`).join("")}</dl>` : `<p class="small muted">No prices yet.</p>`}
          <div class="btn-row">${s.map ? `<a class="btn btn-ghost" href="${ui.esc(s.map)}" target="_blank" rel="noopener noreferrer">${ui.icon("pin")} Map</a>` : ""}
            <button type="button" class="btn btn-quiet" data-edit="${s.id}">${ui.icon("tag")} Prices</button>
            <button type="button" class="btn btn-ghost" data-del-stall="${s.id}" aria-label="Delete ${ui.esc(s.name)}">${ui.icon("trash")} Delete</button></div>
        </li>`).join("")}</ul>`
        : `<div class="card empty-card"><p>No stalls yet. Add the places you actually eat: the faculty canteen, the mamak by the hostel, the economy rice stall. A price from last week beats any estimate.</p></div>`}
      <form id="paste-form" class="paste-form" novalidate>
        <label class="field-label" for="paste-link">Got a stall list link from a friend?</label>
        <input id="paste-link" class="text-input" type="text" placeholder="Paste the link">
        <div id="paste-error"></div>
        <button class="btn btn-quiet" type="submit">${ui.icon("users")} Look at their list</button>
      </form>
      <div class="banner">${ui.icon("info")}<p><strong>Honest limits.</strong> These are your notes and your friends'. It isn't a live community map: nobody checks the prices, and they change. Each price shows how old it is. A shared list is a link: the stall data sits after the “#”, which never reaches any server.</p></div>
    </div>`;
    const on = (id, fn) => { const el = $("#" + id); if (el) el.addEventListener("click", fn); };
    on("stall-add", () => openStallSheet(null));
    on("stall-share", openShareStalls);
    on("stall-prices", () => applyStallPrices(prices));
    on("import-yes", () => { storeSet(KEYS.stalls, incoming.stalls); clearQuery("stalls"); renderStalls(); ui.focusHeading(); ui.say("Added your friend's stalls"); });
    on("import-no", () => { clearQuery("stalls"); renderStalls(); ui.focusHeading(); });
    $("#paste-form").addEventListener("submit", e => {
      e.preventDefault();
      const d = decodeStalls($("#paste-link").value);
      if (!d.ok) { ui.showError($("#paste-error"), ui.esc(d.error), e.target); return; }
      const [body, chk] = encodeStalls(d.stalls).split(".");
      try { history.replaceState(null, "", `#stalls?import=${body}&c=${chk}`); } catch (err) { /* file:// */ }
      renderStalls(); const yes = $("#import-yes"); if (yes) yes.focus();
    });
    ui.view.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openStallSheet(stalls.find(s => s.id === b.dataset.edit))));
    ui.view.querySelectorAll("[data-del-stall]").forEach(b => b.addEventListener("click", () => {
      confirmBox(b.closest(".btn-row"), "Delete this stall and its prices?", "Delete the stall", () => {
        storeSet(KEYS.stalls, loadStalls().filter(s => s.id !== b.dataset.delStall)); renderStalls(); ui.focusHeading(); ui.say("Stall deleted");
      });
    }));
  }

  function openStallSheet(stall) {
    const s = stall || { name: "", area: "", map: "", items: [] };
    const rows = s.items.concat([{ name: "", rm: "", date: todayKey() }, { name: "", rm: "", date: todayKey() }]);
    ui.openSheet(stall ? `Prices at ${s.name}` : "Add a stall", `
      <form id="stall-form" novalidate>
        <label class="field-label" for="sf-name">Stall or café</label>
        <input id="sf-name" class="text-input" type="text" maxlength="50" value="${ui.esc(s.name)}" placeholder="e.g. Kafe Kolej 12">
        <label class="field-label" for="sf-area">Campus or area <span class="muted small">(optional)</span></label>
        <input id="sf-area" class="text-input" type="text" maxlength="50" value="${ui.esc(s.area)}" placeholder="e.g. UM, near the library">
        <label class="field-label" for="sf-map">Map link <span class="muted small">(optional, https Google Maps, Waze or OpenStreetMap)</span></label>
        <input id="sf-map" class="text-input" type="url" maxlength="300" value="${ui.esc(s.map || "")}" placeholder="https://maps.app.goo.gl/…">
        <h3 class="sheet-sub">Prices you saw</h3>
        <ol class="sf-items">${rows.map((it, i) => `<li class="sf-item">
          <label class="sr-only" for="sf-i-${i}">Item ${i + 1}</label><input id="sf-i-${i}" class="text-input" type="text" maxlength="50" data-k="name" data-i="${i}" value="${ui.esc(it.name)}" placeholder="e.g. Nasi lemak ayam">
          <span class="money-input"><span>RM</span><label class="sr-only" for="sf-p-${i}">Price of item ${i + 1}</label><input id="sf-p-${i}" type="number" inputmode="decimal" step="0.1" min="0.1" max="200" data-k="rm" data-i="${i}" value="${it.rm !== "" ? Number(it.rm).toFixed(2) : ""}"></span>
          <label class="sr-only" for="sf-d-${i}">Date seen, item ${i + 1}</label><input id="sf-d-${i}" class="text-input" type="date" max="${todayKey()}" data-k="date" data-i="${i}" value="${it.date}">
        </li>`).join("")}</ol>
        <p class="tiny muted">Change a price and its date updates to today. Leave a row empty to skip it.</p>
        <div id="sf-error"></div>
        <div class="sheet-actions"><button class="btn" type="submit">${ui.icon("check")} Save</button></div>
      </form>`, root => {
      const form = root.querySelector("#stall-form");
      form.addEventListener("input", e => {
        if (e.target.dataset.k === "rm" || e.target.dataset.k === "name") { const d = root.querySelector(`#sf-d-${e.target.dataset.i}`); if (d) d.value = todayKey(); }
      });
      form.addEventListener("submit", e => {
        e.preventDefault();
        const name = root.querySelector("#sf-name").value.trim();
        if (!name) { ui.showError(root.querySelector("#sf-error"), "Give the stall a name.", form); root.querySelector("#sf-name").focus(); return; }
        const mapRaw = root.querySelector("#sf-map").value.trim();
        if (mapRaw && !cleanMapLink(mapRaw)) { ui.showError(root.querySelector("#sf-error"), "The map link needs to be an https Google Maps, Waze, OpenStreetMap or Apple Maps link.", form); root.querySelector("#sf-map").focus(); return; }
        const items = [];
        let bad = null, badDate = null;
        rows.forEach((_, i) => {
          const n = root.querySelector(`#sf-i-${i}`).value.trim(), p = root.querySelector(`#sf-p-${i}`).value, d = root.querySelector(`#sf-d-${i}`).value;
          if (!n && p === "") return;
          if (!n || !(Number(p) >= 0.1 && Number(p) <= 200)) { bad = bad || root.querySelector(`#sf-${n ? "p" : "i"}-${i}`); return; }
          // a date the list can't keep (future, before 2020, half-typed) is an error here, never a silently dropped price
          if (d && !isStallDate(d)) { badDate = badDate || root.querySelector(`#sf-d-${i}`); return; }
          items.push({ name: n, rm: Number(p), date: d || todayKey() });
        });
        if (bad) { ui.showError(root.querySelector("#sf-error"), "Each price needs an item name and an amount between RM 0.10 and RM 200.", form); bad.focus(); return; }
        if (badDate) { ui.showError(root.querySelector("#sf-error"), "A date seen can't be in the future or before 2020. Fix it or clear it to use today.", form); badDate.focus(); return; }
        const next = { id: stall ? stall.id : newStallId(name), name, area: root.querySelector("#sf-area").value, map: mapRaw, items };
        const all = loadStalls().filter(x => x.id !== next.id);
        all.unshift(next);
        storeSet(KEYS.stalls, validateStalls(all));
        ui.closeSheet(); renderStalls(); ui.say("Stall saved");
      });
    });
  }

  async function openShareStalls() {
    const stalls = loadStalls();
    const code = encodeStalls(stalls);
    const base = shareBase();
    const link = base ? `${base}#stalls?import=${code.replace(".", "&c=")}` : code;
    ui.openSheet("Share my stall list", `
      <p class="small">Friends open this link (or scan the QR) and choose whether to add your ${stalls.length} stall${stalls.length > 1 ? "s" : ""} to their notes. It contains only stall names, areas, map links, prices and dates. No name of yours, no location of yours.</p>
      <label class="field-label" for="share-link">Link</label>
      <textarea id="share-link" class="text-input share-text" rows="3" readonly>${ui.esc(link)}</textarea>
      <div class="sheet-actions"><button type="button" class="btn" id="share-copy">${ui.icon("copy")} Copy link</button>
        ${navigator.share && base ? `<button type="button" class="btn btn-quiet" id="share-native">${ui.icon("users")} Share…</button>` : ""}</div>
      <div id="share-qr"><p class="small muted">Making the QR…</p></div>`, async root => {
      root.querySelector("#share-copy").addEventListener("click", e => copyText(link, e.currentTarget));
      const n = root.querySelector("#share-native");
      if (n) n.addEventListener("click", () => navigator.share({ title: "My stall price notes", text: "Stall prices near campus", url: link }).catch(() => {}));
      const box = root.querySelector("#share-qr");
      if (link.length > 2300) { box.innerHTML = `<p class="small">Too many stalls for one QR code; share the link instead.</p>`; return; }
      try { box.innerHTML = await qrSvg(link, `QR code for a link to ${stalls.length} stalls`); } catch (e) { box.innerHTML = `<p class="small">QR unavailable offline before first use; the link works.</p>`; }
    });
  }

  function applyStallPrices(prices) {
    const ids = Object.keys(prices);
    ui.openSheet("Use stall prices in My prices", `
      <p class="small">The newest price you noted for each of these meals replaces our estimate in your plan, week and check-in.</p>
      <dl class="kv">${ids.map(id => `<div><dt>${ui.esc(mealById(id).name)} <span class="tiny muted">${ui.esc(prices[id].stall)}, ${daysAgo(prices[id].date)}</span></dt><dd class="num">${ui.rm(prices[id].rm)}</dd></div>`).join("")}</dl>
      <div class="sheet-actions"><button type="button" class="btn" id="sp-yes">${ui.icon("check")} Use these prices</button></div>`, root => {
      root.querySelector("#sp-yes").addEventListener("click", () => {
        const pr = cleanPriceOverrides(storeGet(KEYS.prices, null));
        ids.forEach(id => { pr.meals[id] = prices[id].rm; });
        storeSet(KEYS.prices, setPriceOverrides(pr));
        ui.closeSheet(); ui.say(`${ids.length} prices saved to My prices`);
      });
    });
  }

  // =============================================================
  // CLASS MODE
  // =============================================================
  let classTab = "student";
  function loadClass() {
    const c = storeGet(KEYS.classroom, null);
    const ok = c && typeof c === "object";
    const ch = ok && c.challenge && typeof c.challenge === "object" ? c.challenge : { type: 0, target: 0 };
    return { codes: ok && Array.isArray(c.codes) ? c.codes.filter(x => typeof x === "string" && decode(x).ok).slice(0, 500) : [], tag: ok ? cleanTag(c.tag) : "",
      challenge: { type: CHALLENGES.some(x => x.id === ch.type) ? ch.type : 0, target: Number.isFinite(Number(ch.target)) ? Math.max(0, Math.min(1023, Math.round(Number(ch.target)))) : 0 } };
  }
  const saveClass = c => storeSet(KEYS.classroom, c);

  // The student's own numbers, from the finished week, the plan and the check-in
  function myResult() {
    const profile = ui.profile() || {}; // class mode opens without a setup (a lecturer's phone, a shared link)
    const s = ui.loadFinishedSim();
    let report = null, quizAsked = false, quizRight = 0;
    if (s) {
      const r = buildReport(s);
      report = { spent: r.totals.spent, budget: r.totals.budget, co2: r.totals.co2, fvDaysMet: r.fvDaysMet, archetypeId: r.archetype.id };
      if (r.guesses) { quizAsked = true; quizRight = r.guesses.filter(g => g.right).length; }
    }
    const p = ui.loadPlan();
    let adherence;
    if (p && p.started) {
      const log = validateLog(storeGet(KEYS.checkin, null));
      const sm = summary(p.plan, log, Math.min(6, planDay(p.start, new Date())), ui.loadHave());
      if (sm.logged) adherence = sm.adherence;
    }
    return { report, budget: profile.budget, kitchen: profile.kitchen, goal: profile.goal, quizAsked, quizRight, swaps: p ? p.swaps : 0, adherence };
  }

  function renderClass() {
    const q = query();
    const incoming = q.get("code") ? decode(q.get("code")) : null;
    if (incoming && incoming.ok) classTab = incoming.type === "S" ? "lecturer" : "student";
    ui.view.innerHTML = `<div class="page class-page">
      ${backLink()}
      <h1>Class mode</h1>
      <p class="lead">Compare a class without collecting anyone's data. Students share a short anonymous code; the lecturer's phone or laptop adds them up. Nothing goes to a server, because there isn't one.</p>
      <div class="seg-tabs" role="tablist" aria-label="Who are you?">
        <button type="button" role="tab" id="tab-student" aria-controls="class-panel" aria-selected="${classTab === "student"}" class="seg ${classTab === "student" ? "on" : ""}" data-tab-k="student">${ui.icon("users")} I'm a student</button>
        <button type="button" role="tab" id="tab-lecturer" aria-controls="class-panel" aria-selected="${classTab === "lecturer"}" class="seg ${classTab === "lecturer" ? "on" : ""}" data-tab-k="lecturer">${ui.icon("school")} I'm a lecturer</button>
      </div>
      <div id="class-panel" role="tabpanel" aria-labelledby="tab-${classTab}"></div>
    </div>`;
    ui.view.querySelectorAll("[data-tab-k]").forEach(b => b.addEventListener("click", () => { classTab = b.dataset.tabK; clearQuery("class"); renderClass(); const t = document.getElementById("tab-" + classTab); if (t) t.focus(); }));
    if (classTab === "student") renderStudent(incoming); else renderLecturer(incoming);
  }

  function renderStudent(incoming) {
    const panel = $("#class-panel");
    const me = myResult();
    const values = studentValues(me);
    const d = describeStudent(values);
    const ref = storeGet(KEYS.classref, null);
    const refD = ref && typeof ref.code === "string" ? decode(ref.code) : null;
    const cls = refD && refD.ok && refD.type === "C" ? describeClass(refD.values) : null;
    const pending = incoming && incoming.ok && incoming.type === "C" ? incoming : null;
    const row = (k, v) => `<div><dt>${k}</dt><dd class="num">${v === null || v === undefined ? `<span class="muted">not included</span>` : ui.esc(String(v))}</dd></div>`;
    panel.innerHTML = `
      ${incoming && !incoming.ok ? `<div class="banner bad" role="alert">${ui.icon("alert")}<p>${ui.esc(incoming.error)}</p></div>` : ""}
      ${pending ? `<div class="banner" role="alert">${ui.icon("school")}<div><p><strong>Your lecturer's class summary${pending.tag ? ` (${ui.esc(pending.tag)})` : ""}.</strong> Compare yourself with it on this phone only.</p>
        <div class="banner-actions"><button type="button" class="btn" id="ref-yes">${ui.icon("check")} Compare with my class</button></div></div></div>` : ""}
      <div class="class-grid">
        <section class="card" aria-labelledby="mycode-h">
          <h2 id="mycode-h" class="card-title">${ui.icon("qr")} My result code</h2>
          ${!d.played ? `<p class="small">${ui.icon("info")} Play the simulated week first: most of the code comes from your week report.</p>` : ""}
          <p class="small">Exactly what the code contains, and nothing else:</p>
          <dl class="kv">
            ${row("Week cost vs budget", d.costPct !== null ? `${d.costPct}%` : null)}
            ${row("Budget band", d.budgetBand)}
            ${row("Footprint", d.co2 !== null ? `${d.co2.toFixed(1)} kg CO₂e` : null)}
            ${row("Fruit & veg days", d.fvDays !== null ? `${d.fvDays} of 7` : null)}
            ${row("Your week's label", d.archetype ? ARCHETYPE_NAMES[d.archetype] : null)}
            ${row("Guess-first quiz", d.quiz !== null ? `${d.quiz} of 3` : null)}
            ${row("Swaps in your plan", d.swaps)}
            ${row("Plan kept (check-in)", d.adherence !== null ? `${d.adherence}%` : null)}
            ${row("Kitchen and goal", `${d.kitchen || "?"}, ${d.goal || "?"}`)}
          </dl>
          <form id="code-form" novalidate>
            <label class="field-label" for="code-tag">Class tag from your lecturer <span class="muted small">(optional, letters and numbers)</span></label>
            <input id="code-tag" class="text-input" type="text" maxlength="8" autocapitalize="characters" placeholder="e.g. BIO101">
            <button class="btn" type="submit">${ui.icon("qr")} Make my code</button>
          </form>
          <div id="code-out" aria-live="polite"></div>
        </section>
        <section class="card" aria-labelledby="cmp-h">
          <h2 id="cmp-h" class="card-title">${ui.icon("chart")} Compare with my class</h2>
          ${cls ? compareHtml(d, cls, refD.tag) : `<p class="small">When your lecturer shares a class summary code, paste it here. The comparison happens on this phone; nobody sees where you sit.</p>`}
          <form id="ref-form" novalidate>
            <label class="field-label" for="ref-code">Class summary code</label>
            <input id="ref-code" class="text-input" type="text" maxlength="80" placeholder="EFT1-C-…" autocapitalize="characters">
            <div id="ref-error"></div>
            <button class="btn btn-quiet" type="submit">${ui.icon("check")} Compare</button>
          </form>
        </section>
      </div>
      <div class="banner">${ui.icon("lock")}<p><strong>Privacy, plainly.</strong> The code holds the numbers in the list above, rounded into bands, plus a random number so duplicates can be spotted. No name, no student ID, no exact budget, no meals, no dates, no location. You choose whether to share it, and with whom. The checksum catches typos; it isn't a lock, so a code shows what someone chose to share, not proof of what they did.</p></div>`;
    panel.querySelector("#code-form").addEventListener("submit", async e => {
      e.preventDefault();
      const tag = cleanTag(panel.querySelector("#code-tag").value);
      const code = encodeStudent(studentValues(me), tag);
      const base = shareBase();
      const link = base ? `${base}#class?code=${code}` : code;
      const out = panel.querySelector("#code-out");
      out.innerHTML = `<p class="code-big num" id="my-code">${ui.esc(code)}</p>
        <div class="btn-row"><button type="button" class="btn btn-quiet" id="code-copy">${ui.icon("copy")} Copy code</button></div>
        <div id="code-qr"><p class="small muted">Making the QR…</p></div>
        <p class="tiny muted">Paste it into the class form or chat, or let your lecturer scan the QR. A new code is made each time (the random part changes), so send just one.</p>`;
      out.querySelector("#code-copy").addEventListener("click", ev => copyText(code, ev.currentTarget));
      try { out.querySelector("#code-qr").innerHTML = await qrSvg(link, `QR code of your result code ${code}`); } catch (err) { out.querySelector("#code-qr").innerHTML = ""; }
      ui.say("Code ready");
    });
    const saveRef = code => { storeSet(KEYS.classref, { code, at: Date.now() }); clearQuery("class"); renderClass(); ui.focusHeading(); ui.say("Compared with your class"); };
    if (pending) panel.querySelector("#ref-yes").addEventListener("click", () => saveRef(pending.code));
    panel.querySelector("#ref-form").addEventListener("submit", e => {
      e.preventDefault();
      const r = decode(panel.querySelector("#ref-code").value);
      if (!r.ok) { ui.showError(panel.querySelector("#ref-error"), ui.esc(r.error), e.target); return; }
      if (r.type !== "C") { ui.showError(panel.querySelector("#ref-error"), "That's a student's result code. Paste the class summary code your lecturer shared.", e.target); return; }
      saveRef(r.code);
    });
  }

  function compareHtml(me, cls, tag) {
    const rows = compareToClass(me, cls);
    if (!rows.length) return `<p class="small">${cls.n} students${tag ? ` in ${ui.esc(tag)}` : ""}. Play the simulated week to see where you sit.</p>`;
    return `<p class="small">${cls.n} student${cls.n === 1 ? "" : "s"}${tag ? ` in ${ui.esc(tag)}` : ""}. Most common week: ${cls.topArchetype ? ui.esc(ARCHETYPE_NAMES[cls.topArchetype]) : "none"}.</p>
      <div class="cmp-table" role="table" aria-label="You and your class">
        <div class="cmp-tr cmp-th" role="row"><span role="columnheader"></span><span role="columnheader">You</span><span role="columnheader">Class</span></div>
        ${rows.map(r => `<div class="cmp-tr" role="row"><span role="rowheader">${ui.esc(r.k)}</span><span role="cell" class="num">${ui.esc(r.me)}</span><span role="cell">${ui.esc(r.cls)}${r.where ? `<br><span class="tiny muted">You: ${ui.esc(r.where)}</span>` : ""}</span></div>`).join("")}
      </div>
      ${cls.challenge ? `<p class="small">${ui.icon("bolt")} Class challenge: ${ui.esc(cls.challenge.text)}.</p>` : ""}`;
  }

  function renderLecturer(incoming) {
    const panel = $("#class-panel");
    const c = loadClass();
    const pending = incoming && incoming.ok && incoming.type === "S" ? incoming : null;
    const agg = aggregate(c.codes, c.challenge);
    const ch = agg.challenge;
    panel.innerHTML = `
      ${incoming && !incoming.ok ? `<div class="banner bad" role="alert">${ui.icon("alert")}<p>${ui.esc(incoming.error)}</p></div>` : ""}
      ${pending ? `<div class="banner" role="alert">${ui.icon("users")}<div><p><strong>A student's result code${pending.tag ? ` for ${ui.esc(pending.tag)}` : ""}.</strong> Add it to your class view on this device?</p>
        <div class="banner-actions"><button type="button" class="btn" id="add-one">${ui.icon("plus")} Add to my class</button></div></div></div>` : ""}
      <div class="class-grid">
        <section class="card" aria-labelledby="imp-h">
          <h2 id="imp-h" class="card-title">${ui.icon("upload")} Collect codes</h2>
          <form id="setup-class" novalidate class="class-setup">
            <label class="field-label" for="cl-tag">Class tag <span class="muted small">(optional; students type it when making their code)</span></label>
            <input id="cl-tag" class="text-input" type="text" maxlength="8" value="${ui.esc(c.tag)}" autocapitalize="characters" placeholder="e.g. BIO101">
          </form>
          <form id="imp-form" novalidate>
            <label class="field-label" for="imp-text">Paste codes <span class="muted small">(any mix of text: chat, a form export, one per line)</span></label>
            <textarea id="imp-text" class="text-input" rows="4" placeholder="EFT1-S-…"></textarea>
            <div class="btn-row"><button class="btn" type="submit">${ui.icon("plus")} Add codes</button>
              <label class="btn btn-quiet file-btn" for="imp-file">${ui.icon("upload")} Upload CSV or QR photos</label>
              <input id="imp-file" class="sr-only" type="file" multiple accept=".csv,.txt,text/csv,text/plain,image/*">
              <button type="button" class="btn btn-quiet" id="imp-cam">${ui.icon("camera")} Scan QR codes</button></div>
          </form>
          <div id="imp-result" aria-live="polite"></div>
          <p class="small"><strong>${agg.n}</strong> code${agg.n === 1 ? "" : "s"} in this class${agg.played < agg.n ? ` (${agg.played} with a finished week)` : ""}.</p>
          ${agg.n ? `<div class="btn-row"><button type="button" class="btn btn-ghost" id="cl-csv">${ui.icon("download")} Download codes (CSV)</button><button type="button" class="btn btn-ghost" id="cl-clear">${ui.icon("trash")} Clear the class</button></div>` : ""}
        </section>
        <section class="card" aria-labelledby="ch-h">
          <h2 id="ch-h" class="card-title">${ui.icon("bolt")} Group challenge</h2>
          <form id="ch-form" novalidate>
            <label class="field-label" for="ch-type">Challenge</label>
            <select id="ch-type" class="text-input">${CHALLENGES.map(x => `<option value="${x.id}" ${x.id === c.challenge.type ? "selected" : ""}>${ui.esc(x.name)}</option>`).join("")}</select>
            <div id="ch-target-wrap" ${c.challenge.type ? "" : "hidden"}><label class="field-label" for="ch-target">Target <span class="muted small" id="ch-unit">${ui.esc(targetUnit(c.challenge.type))}</span></label>
              <input id="ch-target" class="text-input" type="number" inputmode="decimal" step="any" min="0" value="${shownTarget(c.challenge.type, c.challenge.target)}"></div>
            <button class="btn btn-quiet" type="submit">${ui.icon("check")} Set challenge</button>
          </form>
          ${ch.type ? `<div class="challenge ${ch.met ? "met" : ""}"><p><strong>${ui.esc(ch.text)}</strong></p>
            ${ch.value !== null ? `<span class="meter ${ch.met ? "leaf" : ""}" aria-hidden="true"><span style="width:${Math.round((ch.progress || 0) * 100)}%"></span></span>
            <p class="small">${ch.met ? "Met." : "Not yet."} Now: ${ui.esc(challengeNow(ch))}.</p>` : `<p class="small muted">Waiting for codes.</p>`}</div>` : ""}
        </section>
      </div>
      ${agg.n ? classPictureHtml(agg) : `<div class="card empty-card"><p>No codes yet. Ask students to open Tools → Class mode → “Make my code” after their simulated week, and paste the codes here or scan their QR codes.</p></div>`}
      ${agg.n ? `<section class="card" aria-labelledby="sum-h"><h2 id="sum-h" class="card-title">${ui.icon("qr")} Share the class summary</h2>
        <p class="small">Students paste this code into “Compare with my class” to see where they sit, privately. It holds the class medians and ranges, the most common week and the challenge, never anyone's code.</p>
        ${agg.played ? `<button type="button" class="btn" id="sum-make">${ui.icon("qr")} Make the summary code</button>` : `<p class="small muted" id="sum-wait">${ui.icon("info")} None of these codes has a finished simulated week yet, so there is nothing to summarise. Ask students to play the week, then make their code again.</p>`}<div id="sum-out" aria-live="polite"></div></section>` : ""}
      <div class="banner">${ui.icon("lock")}<p><strong>Privacy, plainly.</strong> Codes are kept only in this browser. They carry banded numbers, no names, so you can't tell whose is whose, and a class under five students is too small to keep anonymous: share the summary only with bigger groups. Duplicates (the same code pasted twice) are dropped; a student could still send two different codes, so treat this as a class discussion tool, not an assessment.</p></div>`;
    const resultHtml = r => `<div class="banner ${r.rejected.length ? "warn" : ""}">${ui.icon(r.added ? "check" : "info")}<div><p>${r.added} added${r.duplicates ? `, ${r.duplicates} already in` : ""}${r.otherTag ? `, ${r.otherTag} for another class tag` : ""}${r.summaries ? `, ${r.summaries} class summary code${r.summaries > 1 ? "s" : ""} skipped` : ""}${r.rejected.length ? `, ${r.rejected.length} rejected` : ""}.</p>
        ${r.rejected.length ? `<ul class="small">${r.rejected.slice(0, 5).map(x => `<li><span class="num">${ui.esc(x.text)}</span>: ${ui.esc(x.error)}</li>`).join("")}</ul>` : ""}</div></div>`;
    const addText = text => {
      const cur = loadClass();
      const r = importCodes(cur.codes, text, cur.tag);
      cur.codes = r.codes;
      saveClass(cur);
      return r;
    };
    const rerender = r => { renderClass(); const box = $("#imp-result"); if (box && r) box.innerHTML = resultHtml(r); const f = $("#imp-text"); if (f) f.focus(); };
    panel.querySelector("#cl-tag").addEventListener("change", e => { const cur = loadClass(); cur.tag = cleanTag(e.target.value); e.target.value = cur.tag; saveClass(cur); ui.say(cur.tag ? `Class tag ${cur.tag}: codes for other tags are skipped` : "No class tag"); });
    panel.querySelector("#imp-form").addEventListener("submit", e => {
      e.preventDefault();
      const r = addText(panel.querySelector("#imp-text").value);
      rerender(r);
      ui.say(`${r.added} codes added`);
    });
    panel.querySelector("#imp-file").addEventListener("change", async e => {
      const files = [...(e.target.files || [])].slice(0, 60);
      let text = "", unread = 0;
      for (const f of files) {
        if (/^image\//.test(f.type)) { const t = await readQrFromImage(f).catch(() => null); if (t) text += "\n" + t; else unread++; }
        else if (f.size < 2e6) text += "\n" + await f.text();
      }
      const r = addText(text);
      if (unread) r.rejected.push({ text: `${unread} photo${unread > 1 ? "s" : ""}`, error: "No QR code found. Try a closer, sharper photo." });
      rerender(r);
    });
    panel.querySelector("#imp-cam").addEventListener("click", () => openScanner(text => { const r = addText(text); return r; }));
    const on = (id, fn) => { const el = panel.querySelector("#" + id); if (el) el.addEventListener("click", fn); };
    on("add-one", () => { const r = addText(pending.code); clearQuery("class"); rerender(r); });
    on("cl-csv", () => {
      const rows = ["code,cost_pct_of_budget,budget_band,kg_co2e,fv_days,archetype,quiz,swaps,adherence_pct,kitchen,goal"]
        .concat(loadClass().codes.map(code => { const v = describeStudent(decode(code).values); return [code, v.costPct, v.budgetBand, v.co2, v.fvDays, v.archetype, v.quiz, v.swaps, v.adherence, v.kitchen, v.goal].map(x => x === null || x === undefined ? "" : String(x)).join(","); }));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([rows.join("\r\n") + "\r\n"], { type: "text/csv" }));
      a.download = `class-codes${c.tag ? "-" + c.tag : ""}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      ui.say("Codes downloaded");
    });
    on("cl-clear", () => confirmBox(panel.querySelector("#cl-clear").closest(".btn-row"), `Remove all ${agg.n} codes from this device? Download them first if you need them.`, "Clear the class", () => {
      const cur = loadClass(); cur.codes = []; saveClass(cur); renderClass(); ui.focusHeading(); ui.say("Class cleared");
    }));
    const typeSel = panel.querySelector("#ch-type");
    typeSel.addEventListener("change", () => {
      const t = Number(typeSel.value);
      panel.querySelector("#ch-target-wrap").hidden = !t;
      panel.querySelector("#ch-unit").textContent = targetUnit(t);
      panel.querySelector("#ch-target").value = shownTarget(t, defaultTarget(t));
    });
    panel.querySelector("#ch-form").addEventListener("submit", e => {
      e.preventDefault();
      const t = Number(typeSel.value);
      const cur = loadClass();
      cur.challenge = { type: t, target: t ? storedTarget(t, Number(panel.querySelector("#ch-target").value)) : 0 };
      saveClass(cur); renderClass(); ui.say("Challenge set");
    });
    on("sum-make", async () => {
      const cur = loadClass();
      const code = encodeClass(classValues(aggregate(cur.codes, cur.challenge), cur.challenge), cur.tag);
      const base = shareBase();
      const link = base ? `${base}#class?code=${code}` : code;
      const out = panel.querySelector("#sum-out");
      out.innerHTML = `<p class="code-big num">${ui.esc(code)}</p><div class="btn-row"><button type="button" class="btn btn-quiet" id="sum-copy">${ui.icon("copy")} Copy code</button></div><div id="sum-qr"></div>
        ${agg.n < 5 ? `<p class="small">${ui.icon("alert")} Fewer than five students: the summary could point to individuals. Wait for more codes before sharing.</p>` : ""}`;
      out.querySelector("#sum-copy").addEventListener("click", ev => copyText(code, ev.currentTarget));
      try { out.querySelector("#sum-qr").innerHTML = await qrSvg(link, "QR code of the class summary"); } catch (err) { /* link still works */ }
    });
  }
  // challenge targets are shown in their natural unit and stored ×10 where needed
  const defaultTarget = t => ({ 1: 40, 2: 120, 3: 30, 4: 70 }[t] || 0);
  const targetUnit = t => ({ 1: "(average fruit-and-veg days, 0–7)", 2: "(kg CO₂e a week)", 3: "(% of the class, 0–100)", 4: "(% of planned meals kept)" }[t] || "");
  const shownTarget = (t, stored) => (t === 1 || t === 2 ? stored / 10 : stored);
  const storedTarget = (t, shown) => Math.max(0, Math.min(1023, Math.round(t === 1 || t === 2 ? shown * 10 : shown)));
  const challengeNow = ch => ch.type === 1 ? `${ch.value.toFixed(1)} days on average` : ch.type === 2 ? `${ch.value.toFixed(1)} kg median` : `${Math.round(ch.value)}%`;

  function classPictureHtml(agg) {
    const f1 = v => (v === null ? "–" : v.toFixed(1));
    const f0 = v => (v === null ? "–" : String(Math.round(v)));
    return `<section class="card class-picture" aria-labelledby="pic-h">
      <h2 id="pic-h" class="card-title">${ui.icon("chart")} The class at a glance</h2>
      <p class="small">${agg.played} finished week${agg.played === 1 ? "" : "s"}: the middle student spent <strong>${f0(agg.cost.p50)}%</strong> of their budget (middle half ${f0(agg.cost.p25)}–${f0(agg.cost.p75)}%), and <strong>${agg.overPct === null ? "–" : agg.overPct + "%"}</strong> went over.
        Footprint median <strong>${f1(agg.co2.p50)} kg CO₂e</strong>; fruit and veg on <strong>${f1(agg.fvMean)}</strong> of 7 days on average.${agg.quizN ? ` Quiz: ${f1(agg.quizMean)} of 3 right on average.` : ""}${agg.adhN ? ` Plans kept: ${f0(agg.adhP50)}% median (${agg.adhN} checking in).` : ""}</p>
      <div class="hist-grid">
        <div><h3 class="hist-title">Week cost vs budget</h3>${histHtml(agg.hist.cost, "Students by week cost as a share of budget", "students")}</div>
        <div><h3 class="hist-title">Footprint (kg CO₂e)</h3>${histHtml(agg.hist.co2, "Students by weekly footprint", "students")}</div>
        <div><h3 class="hist-title">Days at 400 g fruit &amp; veg</h3>${histHtml(agg.hist.fv, "Students by days meeting 400 g of fruit and vegetables", "students")}</div>
        <div><h3 class="hist-title">The week's label</h3>${histHtml(agg.archetypes.map(a => ({ label: a.name, n: a.n })), "Students by week label", "students")}</div>
        ${agg.quizN ? `<div><h3 class="hist-title">Guess-first quiz</h3>${histHtml(agg.hist.quiz, "Students by quiz score", "students")}</div>` : ""}
      </div>
    </section>`;
  }

  // ---------- QR reading (camera and photos) ----------
  async function detectQr(source) {
    if (typeof BarcodeDetector !== "undefined") {
      try {
        const det = new BarcodeDetector({ formats: ["qr_code"] });
        const found = await det.detect(source);
        if (found.length) return found.map(f => f.rawValue).join("\n");
        return null;
      } catch (e) { /* fall back to jsQR */ }
    }
    await loadScript("vendor/qr/jsQR.js");
    const c = document.createElement("canvas");
    const w = source.videoWidth || source.naturalWidth || source.width, h = source.videoHeight || source.naturalHeight || source.height;
    const scale = Math.min(1, 1000 / Math.max(w, h));
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(source, 0, 0, c.width, c.height);
    const img = g.getImageData(0, 0, c.width, c.height);
    const r = jsQR(img.data, c.width, c.height);
    return r ? r.data : null;
  }
  async function readQrFromImage(fileBlob) {
    const url = URL.createObjectURL(fileBlob);
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      return await detectQr(img);
    } finally { URL.revokeObjectURL(url); }
  }
  function openScanner(onText) {
    let stream = null, timer = null, total = 0;
    ui.openSheet("Scan QR codes", `
      <p class="small">Point the camera at each student's QR code. Each new code is added straight away; duplicates are skipped.</p>
      <video id="scan-video" class="scan-video" playsinline muted aria-label="Camera preview"></video>
      <p id="scan-status" class="small" aria-live="polite">Starting the camera…</p>
      <div class="sheet-actions"><button type="button" class="btn" id="scan-done">${ui.icon("check")} Done</button></div>`, root => {
      const video = root.querySelector("#scan-video"), status = root.querySelector("#scan-status");
      const stop = () => { if (timer) clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
      root.querySelector("#scan-done").addEventListener("click", () => { stop(); ui.closeSheet(); renderClass(); });
      document.getElementById("sheet").addEventListener("close", stop, { once: true });
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status.textContent = "This browser can't use the camera here. Upload photos of the QR codes instead."; return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then(s => {
        stream = s; video.srcObject = s; return video.play();
      }).then(() => {
        status.textContent = "Looking for QR codes…";
        let busyScan = false, last = "";
        timer = setInterval(async () => {
          if (busyScan || !video.videoWidth) return;
          busyScan = true;
          try {
            const t = await detectQr(video);
            if (t && t !== last) {
              last = t;
              const r = onText(t);
              total += r.added;
              status.textContent = r.added ? `Added. ${total} new code${total === 1 ? "" : "s"} this scan.` : r.duplicates ? "Already added." : r.rejected.length ? r.rejected[0].error : "That QR isn't a result code.";
              if (navigator.vibrate && r.added) navigator.vibrate(60);
            }
          } catch (e) { /* keep looking */ }
          busyScan = false;
        }, 350);
      }).catch(() => { status.textContent = "No camera access. Allow the camera, or upload photos of the QR codes."; });
    });
  }

  // =============================================================
  return {
    routes: TOOL_ROUTES,
    render(route, helpers) {
      ui = helpers;
      if (route === "tools") renderHub();
      else if (route === "receipt") renderReceipt();
      else if (route === "realweek") renderRealWeek();
      else if (route === "stalls") renderStalls();
      else if (route === "class") renderClass();
    },
    // for tests
    _draft: () => draft
  };
})();

if (typeof module !== "undefined") module.exports = { TOOL_ROUTES };
