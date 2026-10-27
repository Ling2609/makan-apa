// First-use walkthrough. No sample meals are logged or plans created by the tour.
const MakanTour = (() => {
  'use strict';
  const KEY = 'ma-tour-v1';
  const steps = [
    { route: 'home', target: '#pick-now', tag: '01 / YOUR NEXT MEAL', title: 'Start with “makan apa?”', text: 'This button picks one meal for your budget, food rules and time of day. Eating with friends? The group option combines everyone’s rules.', icon: 'plate' },
    { route: 'pick?slot=L', target: '.pick-card', tag: '02 / UNDERSTAND YOUR PICK', title: 'A meal. And the reasons.', text: 'Check the price, why it fits and the usual allergens. Save a favourite, ask for another pick, or log it with “I’ll eat this”. This tour won’t log anything for you.', icon: 'check' },
    { route: 'home', target: '.today-card', tag: '03 / YOUR DAY, AT A GLANCE', title: 'Small choices add up.', text: 'Log breakfast, lunch, dinner or a snack here. Your weekly money and today’s fruit and vegetables update from your entries. Plan helps you organise a whole week and its shopping list.', icon: 'wallet' },
    { route: 'home', target: '[data-tab="plan"]', tag: '04 / THINK AHEAD', title: 'A whole week. One plan.', text: 'Plan builds a week of meals around your budget, kitchen and food rules. It also prepares a shopping list, cooking-ahead ideas and a daily check-in. Open it when you’re ready; the tour won’t create a plan.', icon: 'calendar' },
    { route: 'collection', target: '.collection-filters', tag: '05 / FIND YOUR FAVOURITES', title: 'Your own little menu.', text: 'Search meals, sort by cost or time, and filter for quick options. Save meals to find them again. Your current dietary and kitchen rules still apply.', icon: 'star' },
    { route: 'learn', target: '.learn-grid', tag: '06 / FOOD FOR THOUGHT', title: 'Curiosity looks good on you.', text: 'Explore local swaps, food myths, cooking tips and the plate check. Every fact includes an evidence label, so you can see how well it is supported.', icon: 'leaf' },
    { route: 'tools', target: '.tool-list', tag: '07 / THE HANDY EXTRAS', title: 'A toolkit for real life.', text: 'More is home to receipts, spending, stall prices, your plan check-in and the practice-week game. Open each tool when you need it; no need to do everything at once.', icon: 'more' },
    { route: 'tools', target: '#replay-tour', tag: '08 / YOU’RE READY', title: 'Your table is ready.', text: 'This guide will now stay out of your way. Find “Show me around” here in More, or in Setup, whenever you want another walkthrough.', icon: 'check' }
  ];
  const raw = storeGet(KEY, null);
  let state = { completed: !!(raw && raw.completed === true), setupAcknowledged: !!(raw && raw.setupAcknowledged === true), step: raw && Number.isInteger(raw.step) && raw.step >= 0 && raw.step < steps.length ? raw.step : 0 };
  let active = false, replay = false, queued = false, previousFocus = null, dialog = null, resizeFrame = null, trackingCleanup = null, runtimeProfile = null;
  const hasProfile = () => runtimeProfile || loadProfile();
  function save() { return storeSet(KEY, state); }
  function ensure() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.id = 'app-tour'; dialog.className = 'app-tour';
    dialog.setAttribute('aria-labelledby', 'tour-title'); dialog.setAttribute('aria-describedby', 'tour-description');
    dialog.addEventListener('cancel', e => { e.preventDefault(); if (replay) close(); });
    document.body.appendChild(dialog);

  }
  function show(content) {
    ensure(); dialog.innerHTML = content;
    document.body.classList.add('tour-open');
    if (!dialog.open) dialog.showModal();
    const focus = dialog.querySelector('[data-tour-next]'); if (focus) focus.focus({ preventScroll: true });
  }
  function close() {
    stopTracking(); active = false; if (dialog && dialog.open) dialog.close(); document.body.classList.remove('tour-open');
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    else { const heading = document.querySelector("main h1"); if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); } }
  }
  function mascot() {
    return '<img src="assets/favicon/favicon.svg?v=1.6.0" class="tour-mascot" width="112" height="112" alt="">';
  }
  function welcome() {
    active = true; previousFocus = document.activeElement;
    show(`<div class="tour-card tour-welcome"><div class="tour-welcome-art">${mascot()}<span>YOUR MAKAN MATE</span></div><p class="eyebrow">BEFORE WE TAKE YOUR ORDER</p><h2 id="tour-title">New here?<br><em>Pull up a chair.</em></h2><p id="tour-description">We’ll help you set your food rules, then show you how meal picks, your budget and the other tools fit together. This first walkthrough is required; after that it’s yours to replay whenever you like.</p><div class="tour-welcome-note">${icon('lock')} No sign-up. Your choices stay on this device.</div><button class="btn" type="button" data-tour-next>First, my food rules ${icon('arrow')}</button></div>`);
    dialog.querySelector('[data-tour-next]').addEventListener('click', () => {
      state.setupAcknowledged = true; save(); close();
      if (!document.querySelector('#setup-form')) location.hash = 'home';
      document.querySelector('#setup-form h1, .setup-main h1, #setup-form input')?.focus();
    });
  }
  function targetFor(step) { return [...document.querySelectorAll(step.target)].find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); }
  function stopTracking() {
    if (trackingCleanup) trackingCleanup(); trackingCleanup = null;
    cancelAnimationFrame(resizeFrame);
  }
  function refresh() {
    cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(position);
  }
  function track(target) {
    stopTracking();
    const observer = new ResizeObserver(refresh);
    [target, target.closest('.page'), dialog.querySelector('.tour-card')].filter(Boolean).forEach(el => observer.observe(el));
    document.addEventListener('scroll', refresh, true);
    document.addEventListener('load', refresh, true);
    window.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('scroll', refresh);
    trackingCleanup = () => {
      observer.disconnect(); document.removeEventListener('scroll', refresh, true);
      document.removeEventListener('load', refresh, true); window.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('scroll', refresh);
    };
    document.fonts?.ready.then(() => { if (active && target === targetFor(steps[state.step])) refresh(); });
    refresh();
  }
  function position() {
    if (!active || !dialog?.open) return;
    const target = targetFor(steps[state.step]);
    const spot = dialog.querySelector('.tour-spotlight'), card = dialog.querySelector('.tour-card');
    if (!spot || !target || !card) return;
    const r = target.getBoundingClientRect(), pad = 6, gap = 18, edge = 12;
    const topEdge = (document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0) + edge;
    const radius = Math.min(parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0, Math.min(r.width,r.height)/2) + pad;
    // Keep the highlight in the same viewport coordinate system as its actual target.
    // Clip only to the visible scrollport/screen edges; never push header targets down or square off pills.
    const port = target.closest('#view')?.getBoundingClientRect();
    const bounds = {left:Math.max(2,port?.left || 0),top:Math.max(2,port?.top || 0),right:Math.min(innerWidth-2,port?.right ?? innerWidth),bottom:Math.min(innerHeight-2,port?.bottom ?? innerHeight)};
    const box = {left:Math.max(bounds.left,r.left-pad),top:Math.max(bounds.top,r.top-pad),right:Math.min(bounds.right,r.right+pad),bottom:Math.min(bounds.bottom,r.bottom+pad)};
    Object.assign(spot.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${Math.max(0,box.right-box.left)}px`, height: `${Math.max(0,box.bottom-box.top)}px`, borderRadius: `${radius}px` });
    card.classList.remove('tour-card-above');
    Object.assign(card.style, { right: 'auto', bottom: 'auto', left: `${edge}px`, top: `${topEdge}px` });
    const w = card.getBoundingClientRect().width, h = card.getBoundingClientRect().height;
    const clamp = (v,lo,hi) => Math.max(lo,Math.min(v,Math.max(lo,hi)));
    const x = clamp(r.left+(r.width-w)/2,edge,innerWidth-w-edge);
    const y = clamp(r.top+(r.height-h)/2,topEdge,innerHeight-h-edge);
    const candidates = [
      {x:r.right+gap,y,side:'right'}, {x:r.left-w-gap,y,side:'left'},
      {x,y:Math.max(topEdge,r.bottom+gap),side:'bottom'}, {x,y:r.top-h-gap,side:'top'},
      {x:innerWidth-w-edge,y:innerHeight-h-edge,side:'corner'},
      {x:edge,y:topEdge,side:'corner'}
    ];
    const visible = box;
    const overlap = c => Math.max(0,Math.min(c.x+w,visible.right)-Math.max(c.x,visible.left))*Math.max(0,Math.min(c.y+h,visible.bottom)-Math.max(c.y,visible.top));
    let best = null, score = Infinity;
    for (const [i,c] of candidates.entries()) {
      const outside = Math.max(0,edge-c.x)+Math.max(0,c.x+w+edge-innerWidth)+Math.max(0,topEdge-c.y)+Math.max(0,c.y+h+edge-innerHeight);
      const n = outside*100000 + overlap(c) + i*.01;
      if(n<score){best=c;score=n;}
    }
    Object.assign(card.style,{left:`${clamp(best.x,edge,innerWidth-w-edge)}px`,top:`${clamp(best.y,topEdge,innerHeight-h-edge)}px`});
    card.dataset.placement = best.side;
  }
  function reveal(target) {
    const scroller = document.getElementById('view');
    if (!target || !scroller?.contains(target)) return;
    const r = target.getBoundingClientRect(), bounds = scroller.getBoundingClientRect();
    if (r.top < bounds.top+18 || r.bottom > bounds.bottom-18) scroller.scrollBy({top:r.top-bounds.top-22,behavior:'instant'});
  }
  function draw() {
    if (!active || !hasProfile()) return;
    stopTracking();
    const step = steps[state.step];
    const current = location.hash.replace(/^#/, '') || 'home';
    if (current !== step.route) { if (dialog?.open) dialog.close(); document.body.classList.remove('tour-open'); location.hash = step.route; return; }
    document.body.classList.add('tour-open');
    const target = targetFor(step);
    reveal(target);
    show(`<div class="tour-spotlight" aria-hidden="true"></div><div class="tour-card"><div class="tour-card-top"><span class="tour-symbol" aria-hidden="true">${icon(step.icon)}</span>${replay ? '<button type="button" class="btn btn-ghost" data-tour-close aria-label="Close walkthrough">Close</button>' : '<span class="tour-required">FIRST-VISIT GUIDE</span>'}</div><p class="eyebrow">${step.tag}</p><h2 id="tour-title">${step.title}</h2><p id="tour-description">${step.text}</p><div class="tour-progress" role="img" aria-label="Step ${state.step + 1} of ${steps.length}">${steps.map((_,i)=>`<span class="${i <= state.step ? 'done' : ''}"></span>`).join('')}</div><div class="tour-controls"><button type="button" class="btn btn-ghost" data-tour-back ${state.step === 0 ? 'disabled' : ''}>${icon('back')} Back</button><span class="tour-count">${state.step + 1} / ${steps.length}</span><button type="button" class="btn" data-tour-next>${state.step === steps.length - 1 ? 'Let’s makan' : 'Next'} ${icon('arrow')}</button></div></div>`);
    position();
    if (target) track(target);
    dialog.querySelector('[data-tour-back]').addEventListener('click', () => { if (state.step > 0) { state.step--; if (!replay) save(); draw(); } });
    dialog.querySelector('[data-tour-close]')?.addEventListener('click', close);
    dialog.querySelector('[data-tour-next]').addEventListener('click', () => {
      if (state.step < steps.length - 1) { state.step++; if (!replay) save(); draw(); return; }
      state.completed = true; state.setupAcknowledged = true; state.step = 0;
      const persisted = save(); close();
      document.getElementById('announcer').textContent = persisted ? 'Walkthrough complete. Replay it from More or Setup.' : 'Walkthrough complete. Storage is unavailable, so this device may show it again next time.';
      location.hash = 'home';
    });
  }
  function onRender(profile) {
    runtimeProfile = profile || loadProfile();
    if (queued) return; queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!hasProfile()) { if (!state.completed && !state.setupAcknowledged && !active) welcome(); else if (!state.completed && state.setupAcknowledged && !document.querySelector('#setup-form')) location.hash = 'home'; return; }
      if (!state.completed && !active) { active = true; replay = false; previousFocus = document.activeElement; }
      if (active) draw();
    });
  }
  function start() {
    if (!hasProfile()) { state.setupAcknowledged = false; welcome(); return; }
    replay = state.completed; state.step = 0; active = true; previousFocus = document.activeElement; draw();
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-replay-tour]')) { e.preventDefault(); const sheet = document.getElementById('sheet'); if (sheet?.open) sheet.close(); start(); } });
  return { onRender, start };
})();
