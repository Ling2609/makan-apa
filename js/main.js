// =============================================================
// main.js — shared by every page: theme (follows the device until the user
// picks one), labelled theme toggle, and the offline service worker.
// =============================================================
(function () {
  const root = document.documentElement;
  function saved() {
    try { const t = localStorage.getItem("theme"); return t === "dark" || t === "light" ? t : null; } catch (e) { return null; }
  }
  function effective() {
    const s = saved();
    if (s) return s;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function apply() {
    const s = saved();
    if (s) root.setAttribute("data-theme", s); else root.removeAttribute("data-theme");
    const now = effective();
    document.querySelectorAll("[data-theme-toggle]").forEach(btn => {
      const next = now === "dark" ? "light" : "dark";
      btn.setAttribute("aria-label", `Switch to ${next} theme`);
      const label = btn.querySelector("[data-theme-label]");
      if (label) label.textContent = next === "dark" ? "Dark" : "Light";
      const icon = btn.querySelector("[data-theme-icon]");
      if (icon) icon.innerHTML = next === "dark"
        ? '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>'
        : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
    });
  }
  apply();
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.querySelectorAll("[data-theme-toggle]").forEach(btn => btn.addEventListener("click", () => {
      const next = effective() === "dark" ? "light" : "dark";
      try { localStorage.setItem("theme", next); } catch (e) { /* storage blocked */ }
      apply();
    }));
  });
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", apply);
  }
  // Offline support (only over http(s); opening the files directly still works, just not offline)
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    // A new version installs in the background and waits; a banner offers to switch to it,
    // so nobody is moved mid-task and nobody stays on an old version without knowing.
    const offer = reg => {
      if (!reg.waiting || !navigator.serviceWorker.controller || document.getElementById("update-banner")) return;
      const bar = document.createElement("div");
      bar.id = "update-banner";
      bar.className = "update-banner";
      bar.setAttribute("role", "status");
      bar.innerHTML = '<p>A new version of Makan Apa? is ready.</p><button type="button" class="btn">Reload now</button><button type="button" class="btn btn-quiet">Later</button>';
      const [now, later] = bar.querySelectorAll("button");
      now.addEventListener("click", () => { reg.waiting && reg.waiting.postMessage({ type: "skip-waiting" }); });
      later.addEventListener("click", () => bar.remove());
      document.body.appendChild(bar);
    };
    // Reload only when an old version is being replaced. On the very first visit the new worker takes
    // control of a page that had none (clients.claim): nothing is out of date, so nothing reloads.
    let reloading = false;
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController) { hadController = true; return; } // first install claimed this page: later updates do reload
      if (reloading) return;
      reloading = true; location.reload();
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then(reg => {
        offer(reg);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (w) w.addEventListener("statechange", () => { if (w.state === "installed") offer(reg); });
        });
      }).catch(() => {});
    });
  }
})();
