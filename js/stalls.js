// =============================================================
// stalls.js — personal stall price notes, shared between friends by link or QR. Pure logic.
//
// A stall: { id, name, area, map?, items: [{ name, rm, date }] }. Each price carries the date it
// was seen. Merging a friend's list keeps both, matches the same stall by id or by name + area,
// and for each item keeps the newest price. Nothing is uploaded anywhere: a shared list is a
// link whose data sits after the "#", which browsers never send to a server.
// This is not a live community map; that needs a server and moderation, which this app avoids.
// =============================================================

const STALL_MAX = 60;
const STALL_ITEMS_MAX = 30;
const STALL_SHARE_VERSION = 1;

const st2 = n => Math.round(n * 100) / 100;
const clip = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
// A price date must be a real calendar day, not before 2020 and not in the future (a day of slack for time zones)
const todayKey = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const isDate = d => {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(d + "T00:00:00Z");
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d && d >= "2020-01-01" && d <= todayKey();
};
const isStallDate = isDate; // the stall sheet checks dates with the same rule before saving
// Matching ignores case and punctuation in any script ("Nasi Lemak", "nasi-lemak", "日式拉面", "رامن")
const norm = s => {
  const c = clip(s, 80).normalize("NFKC").toLowerCase();
  let out;
  try { out = c.replace(/[^\p{L}\p{N}]+/gu, " ").trim(); } catch (e) { out = c.replace(/[\s.,;:!?'"()\-_/]+/g, " ").trim(); }
  return out || c;
};
const MAP_HOSTS = ["google.com", "www.google.com", "maps.google.com", "google.com.my", "www.google.com.my", "maps.google.com.my",
  "maps.app.goo.gl", "waze.com", "www.waze.com", "ul.waze.com", "openstreetmap.org", "www.openstreetmap.org", "osm.org",
  "maps.apple.com"];

// Only plain https map links (Google Maps, Waze, OpenStreetMap, Apple Maps) are kept
function cleanMapLink(url) {
  const u = clip(url, 300);
  if (!u) return "";
  try {
    const p = new URL(u);
    if (p.protocol !== "https:") return "";
    if (!MAP_HOSTS.includes(p.hostname.toLowerCase()) || p.username || p.password || p.port) return "";
    // google.com is only a map link on its maps paths
    if (/google\.com(\.my)?$/.test(p.hostname) && !/^maps\./.test(p.hostname) && !/^\/maps(\/|$)/.test(p.pathname)) return "";
    return p.href;
  } catch (e) { return ""; }
}

function validateStall(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = clip(raw.name, 50);
  if (!name) return null;
  const items = [];
  const seen = new Set();
  (Array.isArray(raw.items) ? raw.items : []).forEach(it => {
    if (!it || typeof it !== "object" || items.length >= STALL_ITEMS_MAX) return;
    const n = clip(it.name, 50);
    const rm = Number(it.rm);
    if (!n || !Number.isFinite(rm) || rm < 0.1 || rm > 200 || !isDate(it.date) || seen.has(norm(n))) return;
    seen.add(norm(n));
    items.push({ name: n, rm: st2(rm), date: it.date });
  });
  const id = typeof raw.id === "string" && /^[a-z0-9]{6,12}$/.test(raw.id) ? raw.id : newStallId(name + clip(raw.area, 50));
  const out = { id, name, area: clip(raw.area, 50), items };
  const map = cleanMapLink(raw.map);
  if (map) out.map = map;
  return out;
}
function validateStalls(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = new Set();
  return raw.map(validateStall).filter(s => s && !ids.has(s.id) && ids.add(s.id)).slice(0, STALL_MAX);
}
function newStallId(seed, rand = Math.random) {
  let h = 0;
  const s = String(seed) + rand();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h.toString(36) + Math.floor(rand() * 1e9).toString(36)).replace(/[^a-z0-9]/g, "").slice(0, 10).padEnd(6, "0");
}
const lastSeen = st => st.items.reduce((d, it) => (it.date > d ? it.date : d), "");

/**
 * mergeStalls(mine, theirs) → { stalls, added, updated, unchanged }
 * Same stall = same id, or same name and area (case and punctuation ignored).
 * Per item, the newer date wins; on the same date, mine wins. Items only one side has are kept.
 */
function mergeStalls(mine, theirs) {
  const out = validateStalls(mine).map(s => ({ ...s, items: s.items.slice() }));
  let added = 0, updated = 0, unchanged = 0;
  validateStalls(theirs).forEach(t => {
    const key = norm(t.name) + "|" + norm(t.area);
    const m = out.find(s => s.id === t.id) || out.find(s => norm(s.name) + "|" + norm(s.area) === key);
    if (!m) {
      if (out.length >= STALL_MAX) return;
      out.push({ ...t, items: t.items.slice() }); added++; return;
    }
    let changed = false;
    t.items.forEach(ti => {
      const mi = m.items.find(x => norm(x.name) === norm(ti.name));
      if (!mi) { if (m.items.length < STALL_ITEMS_MAX) { m.items.push({ ...ti }); changed = true; } return; }
      if (ti.date > mi.date && (ti.rm !== mi.rm || ti.date !== mi.date)) { mi.rm = ti.rm; mi.date = ti.date; changed = true; }
    });
    if (!m.map && t.map) { m.map = t.map; changed = true; }
    if (changed) updated++; else unchanged++;
  });
  return { stalls: out, added, updated, unchanged };
}

// ---------- sharing ----------
// Compact form: [v, [[id, name, area, map, [[item, rm*100, days since 2020-01-01], …]], …]]
const EPOCH = Date.UTC(2020, 0, 1);
const dayNum = d => Math.round((Date.parse(d + "T00:00:00Z") - EPOCH) / 86400000);
// Day numbers from a shared link: whole numbers from 2020 up to today only; anything else is dropped
const numDay = n => (Number.isInteger(n) && n >= 0 && n <= 40000 ? new Date(EPOCH + n * 86400000).toISOString().slice(0, 10) : null);

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function sumCheck(str) { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 33 + str.charCodeAt(i)) % 1679616; return h.toString(36).padStart(4, "0"); }

function encodeStalls(stalls) {
  const clean = validateStalls(stalls);
  const data = JSON.stringify([STALL_SHARE_VERSION, clean.map(s => [s.id, s.name, s.area, s.map || "", s.items.map(it => [it.name, Math.round(it.rm * 100), dayNum(it.date)])])]);
  const body = b64urlEncode(data);
  return body + "." + sumCheck(body);
}
// → { ok, stalls } or { ok: false, error }
function decodeStalls(text) {
  // Accepts the bare code ("BODY.CHK") or a shared link ("…#stalls?import=BODY&c=CHK")
  let s = String(text || "").trim();
  const link = s.match(/[?&#]import=([A-Za-z0-9_-]+)&c=([0-9a-z]{4})/);
  if (link) s = link[1] + "." + link[2];
  s = s.replace(/\s+/g, "");
  const m = s.match(/^([A-Za-z0-9_-]+)\.([0-9a-z]{4})$/);
  if (!m) return { ok: false, error: "That isn't a stall list link." };
  if (sumCheck(m[1]) !== m[2]) return { ok: false, error: "The link was cut off or changed. Ask your friend to share it again." };
  let data;
  try { data = JSON.parse(b64urlDecode(m[1])); } catch (e) { return { ok: false, error: "The link is damaged." }; }
  if (!Array.isArray(data) || data[0] !== STALL_SHARE_VERSION || !Array.isArray(data[1])) return { ok: false, error: "Made by a different version of the app." };
  try {
    const stalls = validateStalls(data[1].map(r => Array.isArray(r) ? ({
      id: r[0], name: r[1], area: r[2], map: r[3],
      items: Array.isArray(r[4]) ? r[4].map(it => Array.isArray(it) ? ({ name: it[0], rm: Number(it[1]) / 100, date: numDay(it[2]) }) : null) : []
    }) : null));
    return { ok: true, stalls };
  } catch (e) { return { ok: false, error: "The link is damaged." }; }
}

// Stall prices for the plan's bought meals: the newest price per meal across stalls.
// match(itemName) → mealId or null (the app passes the receipt categoriser).
// perMeal(mealId, price) converts a stall price to the app's meal (e.g. one roti → the ×2 set).
function stallMealPrices(stalls, match, perMeal) {
  const best = {};
  validateStalls(stalls).forEach(s => s.items.forEach(it => {
    const id = match(it.name);
    if (!id) return;
    const rm = typeof perMeal === "function" ? perMeal(id, it.rm) : it.rm;
    if (rm === null || rm === undefined) return;
    if (!best[id] || it.date > best[id].date) best[id] = { rm, date: it.date, stall: s.name };
  }));
  return best;
}

if (typeof module !== "undefined") {
  module.exports = { STALL_MAX, STALL_ITEMS_MAX, validateStall, validateStalls, mergeStalls, encodeStalls, decodeStalls, cleanMapLink, newStallId, stallMealPrices, lastSeen, isStallDate, normName: norm };
}
