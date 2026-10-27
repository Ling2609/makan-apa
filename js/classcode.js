// =============================================================
// classcode.js — class mode with no server. Pure logic; unit tested.
//
// A student turns their results into a short anonymous code (and a QR of it). It holds only
// banded aggregates: how the week's cost compared with the budget, the budget band, kg CO2e,
// days at 400 g fruit and veg, the week's label (archetype), the quiz score, how many swaps
// they made and how well they kept the plan. No name, no exact budget, no dates, no meals.
// A random 12-bit nonce makes each export unique, so a lecturer can drop exact duplicates.
//
// A lecturer pastes, scans or uploads many codes; aggregate() gives the class picture and a
// group challenge; the class summary is itself a code students import to compare privately.
//
// Codes are versioned and checksummed (CRC-16), so typos and edited codes are rejected. The
// checksum is not a signature: a student who reads this file can make a code that passes.
// It stops mistakes, not cheating; that needs a server, which this app deliberately doesn't have.
//
// Format: EFT1-S-<TAG>-<payload, Crockford base32 in groups of 5>, e.g. EFT1-S-BIO101-8Z3KQ-0MN2C-4A
//   (S = student result, C = class summary; TAG = optional class tag, 0–8 of A–Z 0–9)
// =============================================================

const CC_VERSION = 1;
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O, U
const ARCHETYPES = ["borrowed", "lastringgit", "prepper", "delivery", "hawk", "nightowl", "balanced"];
const ARCHETYPE_NAMES = { borrowed: "Broke before Sunday", lastringgit: "Down to the last ringgit", prepper: "The meal prepper", delivery: "The delivery regular",
  hawk: "The budget hawk", nightowl: "The night owl", balanced: "The steady one" };
const KITCHENS_CC = ["hostel", "shared", "home"];
const GOALS_CC = ["money", "health", "planet"];

// Fields of a student result: [name, bits]. Values are stored as small integers.
const STUDENT_FIELDS = [
  ["costPct5", 7],   // week cost as % of budget, in 5% steps (0–635%); 127 = no simulated week
  ["budgetBand", 4], // budget in RM 40 bands: 0 = RM 40–79 … 9 = RM 400; 15 = unknown
  ["co2x10", 10],    // kg CO2e × 10 (0–102.3 kg); 1023 = unknown
  ["fvDays", 3],     // days at WHO's 400 g (0–7)
  ["arch", 3],       // archetype index; 7 = none
  ["quiz", 3],       // right answers in the "guess first" quiz (0–3); 7 = skipped
  ["swaps", 5],      // swaps made in the plan (0–31, capped)
  ["adh5", 5],       // check-in adherence in 5% steps (0–20); 31 = no check-in
  ["kitchen", 2],    // 0 hostel, 1 shared, 2 home; 3 unknown
  ["goal", 2],       // 0 money, 1 health, 2 planet; 3 unknown
  ["nonce", 12]
];
// Fields of a class summary
const CLASS_FIELDS = [
  ["n", 9],                                        // students (0–511)
  ["costP25", 7], ["costP50", 7], ["costP75", 7],  // % of budget, 5% steps
  ["overPct", 7],                                  // % of class over budget (0–100)
  ["co2P25", 10], ["co2P50", 10], ["co2P75", 10],  // kg × 10
  ["fvMean10", 7],                                 // mean F&V days × 10 (0–70)
  ["quizMean10", 5],                               // mean quiz score × 10 (0–30); 31 = none
  ["adhP50", 5],                                   // median adherence, 5% steps; 31 = none
  ["topArch", 3],                                  // most common archetype; 7 = none
  ["chType", 3], ["chTarget", 10],                 // group challenge (see CHALLENGES)
  ["nonce", 8]
];
// Group challenges a lecturer can set. target is in the field's own unit.
const CHALLENGES = [
  { id: 0, key: "none", name: "No challenge", text: () => "No challenge set" },
  { id: 1, key: "fv", name: "Fruit & veg days (class average)", text: t => `Class average of ${(t / 10).toFixed(1)} fruit-and-veg days or more`, unit: "fv days × 10" },
  { id: 2, key: "co2", name: "Footprint (class median)", text: t => `Class median footprint under ${(t / 10).toFixed(1)} kg CO₂e`, unit: "kg × 10" },
  { id: 3, key: "over", name: "Share of the class over budget", text: t => `No more than ${t}% of the class over budget`, unit: "%" },
  { id: 4, key: "adh", name: "Plan kept (class median)", text: t => `Median plan kept at ${t}% or more`, unit: "%" }
];

// ---------- bits ----------
function packBits(fields, values) {
  let bits = "";
  fields.forEach(([name, n]) => {
    const max = (1 << n) - 1;
    const v = Math.max(0, Math.min(max, Math.round(Number(values[name]) || 0)));
    bits += v.toString(2).padStart(n, "0");
  });
  return bits;
}
function unpackBits(fields, bits) {
  const out = {};
  let i = 0;
  for (const [name, n] of fields) {
    if (i + n > bits.length) return null;
    out[name] = parseInt(bits.slice(i, i + n), 2);
    i += n;
  }
  return out;
}
function bitsToB32(bits) {
  const padded = bits.padEnd(Math.ceil(bits.length / 5) * 5, "0");
  let s = "";
  for (let i = 0; i < padded.length; i += 5) s += B32[parseInt(padded.slice(i, i + 5), 2)];
  return s;
}
function b32ToBits(s) {
  let bits = "";
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    bits += v.toString(2).padStart(5, "0");
  }
  return bits;
}
// Crockford decoding is forgiving: I/L → 1, O → 0, U is never used
function normalise(code) {
  return String(code || "").toUpperCase().replace(/[\s_-]+/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
}

// CRC-16/CCITT-FALSE over the text before the checksum
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let k = 0; k < 8; k++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function cleanTag(tag) {
  return String(tag || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function encode(type, tag, fields, values) {
  const t = cleanTag(tag);
  const body = bitsToB32(packBits(fields, values));
  const head = `EFT${CC_VERSION}-${type}-${t}-${body}`;
  // checksum: 16 bits → 4 base32 chars (20 bits, top 4 zero)
  const chk = bitsToB32(crc16(head).toString(2).padStart(20, "0"));
  const groups = (body + chk).match(/.{1,5}/g).join("-");
  return `EFT${CC_VERSION}-${type}-${t ? t + "-" : ""}${groups}`;
}

/**
 * decode(text) → { ok: true, type: "S"|"C", tag, values } or { ok: false, error }
 * Accepts lower case, spaces, missing hyphens inside the payload, and I/L/O mix-ups.
 */
function decode(text) {
  // A code inside a sentence ("here's mine: EFT1-S-… thanks"): try the code as written first
  const inText = extractCodes(text);
  if (inText.length) { const d = decodeOne(inText[0]); if (d.ok) return d; }
  return decodeOne(text);
}
function decodeOne(text) {
  const up = String(text || "").toUpperCase().replace(/[\s_]+/g, "");
  const m = up.match(/EFT(\d)-?([SC])-?([0-9A-Z-]+)$/) || up.match(/EFT(\d)-?([SC])-?([0-9A-Z-]+)/);
  if (!m) return { ok: false, error: "Not an Eat For Tomorrow code" };
  if (Number(m[1]) !== CC_VERSION) return { ok: false, error: `Made by a newer version (v${m[1]}). Update the app.` };
  const type = m[2];
  const fields = type === "S" ? STUDENT_FIELDS : CLASS_FIELDS;
  const need = Math.ceil(fields.reduce((s, f) => s + f[1], 0) / 5) + 4; // payload + checksum characters
  const parts = m[3].split("-").filter(Boolean);
  const all = parts.join("");
  let tag = "", payload;
  if (parts.length > 1 && parts.slice(1).join("").length === need && parts[0].length <= 8) { tag = parts[0]; payload = parts.slice(1).join(""); }
  else if (all.length >= need && all.length - need <= 8) { tag = all.slice(0, all.length - need); payload = all.slice(all.length - need); }
  else return { ok: false, error: "The code is too short or too long. Check it was copied in full." };
  payload = normalise(payload);
  const bodyLen = need - 4;
  const body = payload.slice(0, bodyLen), chk = payload.slice(bodyLen);
  const head = `EFT${CC_VERSION}-${type}-${tag}-${body}`;
  const want = bitsToB32(crc16(head).toString(2).padStart(20, "0"));
  if (chk !== want) return { ok: false, error: "The checksum doesn't match: a character was mistyped or the code was edited." };
  const bits = b32ToBits(body);
  const values = bits && unpackBits(fields, bits);
  if (!values) return { ok: false, error: "Damaged code" };
  // The checksum stops typos, not a crafted code: numbers no real result can have are refused
  if (!(type === "S" ? studentInRange(values) : classInRange(values))) return { ok: false, error: "This code holds numbers no real result can have, so it was made or edited by hand." };
  return { ok: true, type, tag, values, code: encode(type, tag, fields, values) };
}
const okOr = (v, max, none) => v === none || (v >= 0 && v <= max);
function studentInRange(v) {
  return okOr(v.costPct5, 126, 127) && okOr(v.budgetBand, 9, 15) && okOr(v.co2x10, 1022, 1023) && v.fvDays <= 7 &&
    okOr(v.arch, ARCHETYPES.length - 1, 7) && okOr(v.quiz, 3, 7) && okOr(v.adh5, 20, 31) && v.kitchen <= 3 && v.goal <= 3;
}
function classInRange(v) {
  const ordered = (a, b, c, none) => (a === none && b === none && c === none) || (a !== none && b !== none && c !== none && a <= b && b <= c);
  return ordered(v.costP25, v.costP50, v.costP75, 127) && v.costP75 <= 127 && okOr(v.overPct, 100, 127) &&
    ordered(v.co2P25, v.co2P50, v.co2P75, 1023) && okOr(v.fvMean10, 70, 127) && okOr(v.quizMean10, 30, 31) && okOr(v.adhP50, 20, 31) &&
    okOr(v.topArch, ARCHETYPES.length - 1, 7) && v.chType < CHALLENGES.length && (v.n > 0 || (v.costP50 === 127 && v.co2P50 === 1023));
}

// ---------- student result ----------
/**
 * studentValues({ report?, budget, kitchen, goal, quizRight?, quizAsked?, swaps, adherence? })
 *   report: { spent, budget, co2, fvDaysMet, archetypeId } from the finished simulated week (optional)
 */
function studentValues(o, rand = Math.random) {
  const r = o.report || null;
  const budget = Number(o.budget);
  return {
    // Over budget always reads as over (101% is stored as 105%, never rounded down to 100%)
    costPct5: r && r.budget > 0 ? costStep((r.spent / r.budget) * 100) : 127,
    budgetBand: Number.isFinite(budget) && budget >= 40 ? Math.min(9, Math.floor((budget - 40) / 40)) : 15,
    co2x10: r ? Math.round(r.co2 * 10) : 1023,
    fvDays: r ? r.fvDaysMet : 0,
    arch: r && ARCHETYPES.includes(r.archetypeId) ? ARCHETYPES.indexOf(r.archetypeId) : 7,
    quiz: o.quizAsked ? Math.max(0, Math.min(3, o.quizRight || 0)) : 7,
    swaps: Math.min(31, Math.max(0, o.swaps || 0)),
    adh5: Number.isFinite(o.adherence) ? Math.round(o.adherence / 5) : 31,
    kitchen: KITCHENS_CC.includes(o.kitchen) ? KITCHENS_CC.indexOf(o.kitchen) : 3,
    goal: GOALS_CC.includes(o.goal) ? GOALS_CC.indexOf(o.goal) : 3,
    nonce: Math.floor(rand() * 4096)
  };
}
function costStep(pct) {
  if (!Number.isFinite(pct) || pct < 0) return 127;
  return Math.min(126, pct > 100 ? Math.max(21, Math.ceil(pct / 5 - 1e-9)) : Math.round(pct / 5));
}
function encodeStudent(values, tag) { return encode("S", tag, STUDENT_FIELDS, values); }

// Human-readable reading of a student code (what the lecturer and the student both see)
function describeStudent(v) {
  return {
    played: v.costPct5 !== 127,
    costPct: v.costPct5 !== 127 ? v.costPct5 * 5 : null,
    budgetBand: v.budgetBand <= 9 ? (v.budgetBand === 9 ? "RM 400" : `RM ${40 + v.budgetBand * 40}–${79 + v.budgetBand * 40}`) : null,
    co2: v.co2x10 !== 1023 ? v.co2x10 / 10 : null,
    fvDays: v.costPct5 !== 127 ? v.fvDays : null,
    archetype: v.arch < ARCHETYPES.length ? ARCHETYPES[v.arch] : null,
    quiz: v.quiz <= 3 ? v.quiz : null,
    swaps: v.swaps,
    adherence: v.adh5 <= 20 ? v.adh5 * 5 : null,
    kitchen: v.kitchen < 3 ? KITCHENS_CC[v.kitchen] : null,
    goal: v.goal < 3 ? GOALS_CC[v.goal] : null
  };
}

// ---------- class ----------
// Pull every code out of pasted text or a CSV (any column, any separator)
function extractCodes(text) {
  // codes never contain spaces once copied, so a space, comma, quote or new line ends one
  // Two codes pasted with nothing between them ("…-AB12EFT1-S-…") are split where the second one starts
  const up = String(text || "").toUpperCase().replace(/(?=EFT\d-[SC]-)/g, " ");
  const found = up.match(/EFT\d-?[SC]-?[0-9A-Z][0-9A-Z-]{8,400}/g) || [];
  return found.map(s => s.replace(/-+$/, ""));
}
// A run that fails as one code but holds two or more joined without hyphens ("…EFT1S…"): split it
function splitJoined(t) {
  const starts = [];
  const re = /EFT\d-?[SC]/g;
  let m;
  while ((m = re.exec(t))) if (m.index > 0) starts.push(m.index);
  for (const i of starts) {
    const a = t.slice(0, i), b = t.slice(i);
    if (decodeOne(a).ok) { const rest = decodeOne(b).ok ? [b] : splitJoined(b); if (rest) return [a].concat(rest); }
  }
  return null;
}

/**
 * importCodes(existing codes, text, tag filter?) → { codes, added, duplicates, rejected: [{ text, error }], otherTag }
 * Keeps canonical student codes only; drops exact duplicates (same nonce and values).
 */
function importCodes(existing, text, tag) {
  const codes = (existing || []).slice();
  const seen = new Set(codes);
  const out = { codes, added: 0, duplicates: 0, rejected: [], otherTag: 0, summaries: 0 };
  const want = cleanTag(tag);
  const tokens = [];
  extractCodes(text).forEach(t => { const d = decodeOne(t); tokens.push(...(d.ok ? [t] : splitJoined(t) || [t])); });
  tokens.forEach(t => {
    const d = decode(t);
    if (!d.ok) { out.rejected.push({ text: t.slice(0, 40), error: d.error }); return; }
    if (d.type !== "S") { out.summaries++; return; }
    if (want && d.tag !== want) { out.otherTag++; return; }
    if (seen.has(d.code)) { out.duplicates++; return; }
    seen.add(d.code); codes.push(d.code); out.added++;
  });
  return out;
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
// Histogram helper: counts per bin label
function bins(values, edges, labels) {
  const counts = labels.map(() => 0);
  values.forEach(v => { let i = edges.findIndex(e => v < e); if (i < 0) i = labels.length - 1; counts[i]++; });
  return labels.map((label, i) => ({ label, n: counts[i] }));
}

/**
 * aggregate(codes, challenge?) → the anonymous class picture:
 *   { n, played, cost: {p25,p50,p75}, overPct, co2: {...}, fvMean, quizMean, adhP50, archetypes: [{id,name,n}],
 *     hist: { cost, co2, fv, quiz }, kitchens, challenge: { text, met, value } }
 */
function aggregate(codes, challenge) {
  const rows = (codes || []).map(decode).filter(d => d.ok && d.type === "S").map(d => describeStudent(d.values));
  const played = rows.filter(r => r.played);
  const sorted = a => a.slice().sort((x, y) => x - y);
  const cost = sorted(played.map(r => r.costPct));
  const co2 = sorted(played.filter(r => r.co2 !== null).map(r => r.co2));
  const fv = played.map(r => r.fvDays);
  const quiz = rows.filter(r => r.quiz !== null).map(r => r.quiz);
  const adh = sorted(rows.filter(r => r.adherence !== null).map(r => r.adherence));
  const arch = {};
  played.forEach(r => { if (r.archetype) arch[r.archetype] = (arch[r.archetype] || 0) + 1; });
  const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const q3 = a => ({ p25: quantile(a, 0.25), p50: quantile(a, 0.5), p75: quantile(a, 0.75) });
  const kitchens = Object.fromEntries(KITCHENS_CC.map(k => [k, rows.filter(r => r.kitchen === k).length]));
  const res = {
    n: rows.length, played: played.length,
    cost: q3(cost), overPct: played.length ? Math.round((played.filter(r => r.costPct > 100).length / played.length) * 100) : null,
    co2: q3(co2), fvMean: mean(fv), quizMean: mean(quiz), quizN: quiz.length, adhP50: quantile(adh, 0.5), adhN: adh.length,
    swapsMean: mean(rows.map(r => r.swaps)),
    archetypes: Object.keys(arch).map(id => ({ id, name: ARCHETYPE_NAMES[id], n: arch[id] })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id)),
    kitchens,
    hist: {
      cost: bins(cost, [80, 90, 100, 110, 125], ["under 80%", "80–89%", "90–99%", "100–109%", "110–124%", "125% or more"]),
      co2: bins(co2, [8, 10, 12, 15, 20], ["under 8 kg", "8–10", "10–12", "12–15", "15–20", "20 kg or more"]),
      fv: [0, 1, 2, 3, 4, 5, 6, 7].map(d => ({ label: String(d), n: fv.filter(x => x === d).length })),
      quiz: [0, 1, 2, 3].map(d => ({ label: `${d} of 3`, n: quiz.filter(x => x === d).length }))
    }
  };
  res.challenge = challengeStatus(res, challenge);
  return res;
}

function challengeStatus(agg, ch) {
  const c = ch && CHALLENGES.find(x => x.id === ch.type);
  if (!c || c.id === 0) return { type: 0, text: CHALLENGES[0].text(), met: null, value: null };
  const t = Number(ch.target) || 0;
  let value = null, met = null, progress = null;
  if (c.key === "fv" && agg.fvMean !== null) { value = agg.fvMean; met = value * 10 >= t; progress = Math.min(1, (value * 10) / Math.max(1, t)); }
  if (c.key === "co2" && agg.co2.p50 !== null) { value = agg.co2.p50; met = value * 10 < t; progress = Math.min(1, t / Math.max(1, value * 10)); }
  if (c.key === "over" && agg.overPct !== null) { value = agg.overPct; met = value <= t; progress = value <= t ? 1 : Math.max(0, 1 - (value - t) / 100); }
  if (c.key === "adh" && agg.adhP50 !== null) { value = agg.adhP50; met = value >= t; progress = Math.min(1, value / Math.max(1, t)); }
  return { type: c.id, target: t, text: c.text(t), met, value, progress };
}

// Lecturer → students: the class picture as a code
// Empty values travel as the field's all-ones sentinel, so "no data" never reads as 0% or 0 kg
const NONE = { cost: 127, over: 127, co2: 1023, fv: 127 };
function classValues(agg, challenge, rand = Math.random) {
  const r5 = v => (v === null || v === undefined ? NONE.cost : Math.min(126, Math.round(v / 5)));
  const c10 = v => (v === null || v === undefined ? NONE.co2 : Math.min(1022, Math.round(v * 10)));
  const top = agg.archetypes[0];
  return {
    n: agg.n,
    costP25: r5(agg.cost.p25), costP50: r5(agg.cost.p50), costP75: r5(agg.cost.p75),
    overPct: agg.overPct === null ? NONE.over : agg.overPct,
    co2P25: c10(agg.co2.p25), co2P50: c10(agg.co2.p50), co2P75: c10(agg.co2.p75),
    fvMean10: agg.fvMean === null || agg.fvMean === undefined ? NONE.fv : Math.round(agg.fvMean * 10),
    quizMean10: agg.quizMean === null ? 31 : Math.round(agg.quizMean * 10),
    adhP50: agg.adhP50 === null ? 31 : Math.round(agg.adhP50 / 5),
    topArch: top ? ARCHETYPES.indexOf(top.id) : 7,
    chType: challenge ? challenge.type || 0 : 0, chTarget: challenge ? challenge.target || 0 : 0,
    nonce: Math.floor(rand() * 256)
  };
}
function encodeClass(values, tag) { return encode("C", tag, CLASS_FIELDS, values); }
function describeClass(v) {
  return {
    n: v.n,
    cost: v.costP50 === NONE.cost ? { p25: null, p50: null, p75: null } : { p25: v.costP25 * 5, p50: v.costP50 * 5, p75: v.costP75 * 5 },
    overPct: v.overPct === NONE.over ? null : v.overPct,
    co2: v.co2P50 === NONE.co2 ? { p25: null, p50: null, p75: null } : { p25: v.co2P25 / 10, p50: v.co2P50 / 10, p75: v.co2P75 / 10 },
    fvMean: v.fvMean10 === NONE.fv ? null : v.fvMean10 / 10, quizMean: v.quizMean10 === 31 ? null : v.quizMean10 / 10, adhP50: v.adhP50 === 31 ? null : v.adhP50 * 5,
    topArchetype: v.topArch < ARCHETYPES.length ? ARCHETYPES[v.topArch] : null,
    challenge: v.chType ? { type: v.chType, target: v.chTarget, text: (CHALLENGES.find(c => c.id === v.chType) || CHALLENGES[0]).text(v.chTarget) } : null
  };
}

// Where one student sits against a class summary, in plain words
function compareToClass(me, cls) {
  const out = [];
  const pos = (v, q, lowerIsBetter) => {
    if (v === null || v === undefined) return null;
    if (v < q.p25) return lowerIsBetter ? "lower than most of the class" : "below most of the class";
    if (v > q.p75) return lowerIsBetter ? "higher than most of the class" : "above most of the class";
    return "about the middle of the class";
  };
  if (me.costPct !== null && cls.cost.p50 !== null) out.push({ k: "Week cost vs budget", me: `${me.costPct}%`, cls: `${cls.cost.p50}% (middle half ${cls.cost.p25}–${cls.cost.p75}%)`, where: pos(me.costPct, cls.cost, true) });
  if (me.co2 !== null && cls.co2.p50 !== null) out.push({ k: "Footprint", me: `${me.co2.toFixed(1)} kg`, cls: `${cls.co2.p50.toFixed(1)} kg (middle half ${cls.co2.p25.toFixed(1)}–${cls.co2.p75.toFixed(1)})`, where: pos(me.co2, cls.co2, true) });
  if (me.fvDays !== null && cls.fvMean !== null) out.push({ k: "Fruit & veg days", me: `${me.fvDays} of 7`, cls: `${cls.fvMean.toFixed(1)} on average`, where: me.fvDays > cls.fvMean + 0.5 ? "more than the class average" : me.fvDays < cls.fvMean - 0.5 ? "fewer than the class average" : "about the class average" });
  if (me.quiz !== null && cls.quizMean !== null) out.push({ k: "Guess-first quiz", me: `${me.quiz} of 3`, cls: `${cls.quizMean.toFixed(1)} on average`, where: null });
  if (me.adherence !== null && cls.adhP50 !== null) out.push({ k: "Plan kept", me: `${me.adherence}%`, cls: `${cls.adhP50}% median`, where: null });
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { CC_VERSION, ARCHETYPES, ARCHETYPE_NAMES, CHALLENGES, STUDENT_FIELDS, CLASS_FIELDS, crc16, encode, decode, normalise, cleanTag,
    studentValues, encodeStudent, describeStudent, extractCodes, importCodes, aggregate, challengeStatus, classValues, encodeClass, describeClass, compareToClass, packBits, bitsToB32 };
}
