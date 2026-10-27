// =============================================================
// receipt.js — turns the text of a Malaysian receipt (from on-device OCR, or pasted/typed)
// into lines the student checks before anything is saved. Pure logic; unit tested.
//
// OCR makes mistakes, so nothing here is trusted on its own:
//   - every amount is parsed with common OCR slips fixed (O→0, S→5, l→1, "8,50", "8. 50");
//   - lines are sorted into items, discounts, SST/service tax, service charge, rounding and total;
//   - the items are added up and compared with the printed total, so the confirm sheet can say
//     "these add up to RM 23.40 but the receipt says RM 25.50: check the lines".
// Rounding adjustment: Malaysia rounds cash totals to the nearest 5 sen (BNM, since 2008).
// =============================================================

/* global mealById, MEALS, PACKS, round2 */
const RC_F = (typeof mealById === "function") ? { mealById, MEALS, PACKS, round2 } : require("./foods.js");

const RECEIPT_MAX_LINES = 80;
const RECEIPT_MAX_RM = 2000;

// Characters OCR confuses with digits, inside something that is clearly a number
const DIGIT_FIX = { O: "0", o: "0", D: "0", Q: "0", S: "5", s: "5", l: "1", I: "1", i: "1", "|": "1", "!": "1", Z: "2", B: "8", g: "9" };

// An amount at the end of a line: optional minus or "RM", digits (maybe with OCR slips),
// a decimal point or comma, two digits, then optional tax codes ("SR", "ZR", "T", "*").
const AMOUNT_AT_END = /(-|−)?\s*(?:RM|R\.M\.?)?\s*([0-9OoDQSslIi|!ZBg]{1,4}(?:[ ,][0-9]{3})*)\s?[.,]\s?([0-9OoDQSslIi|!ZBg]{2})\s*(-)?\s*(?:[A-Z]{1,2}|\*|\(?[A-Z]\)?)?\s*$/;

const fixDigits = s => s.replace(/[OoDQSslIi|!ZBg]/g, c => DIGIT_FIX[c] || c).replace(/[ ,]/g, "");

// Parse "RM8.5O" / "8,50" / "S.50" → 8.5 (or null)
function parseAmount(text) {
  const m = String(text).trim().match(AMOUNT_AT_END);
  if (!m) return null;
  const whole = fixDigits(m[2]);
  const cents = fixDigits(m[3]);
  if (!/^\d+$/.test(whole) || !/^\d{2}$/.test(cents)) return null;
  const v = Number(whole + "." + cents);
  if (!Number.isFinite(v) || v > RECEIPT_MAX_RM) return null;
  return (m[1] || m[4]) ? -v : v;
}

// What kind of line this is, from its words (English and Malay)
const LINE_KINDS = [
  { kind: "skip", re: /\b(change|baki|cash|tunai|tendered|paid|amount paid|bayar|dibayar|telah dibayar|visa|master|mydebit|debit|credit|card|kad|tng|touch ?n ?go|e-?wallet|grabpay|boost(?! ?juice)|shopee ?pay|duitnow|qr pay|balance)\b/i },
  { kind: "rounding", re: /\b(round(ing)?|pelarasan|pembundaran|adj(ustment)?\.?)\b/i },
  { kind: "service", re: /\b(service charge|svc ?chg|caj perkhidmatan|s\/c)\b/i },
  { kind: "subtotal", re: /\b(sub ?-?total|jumlah kecil|total excl|nett? total before)\b/i },
  // "Nett" alone (or "Nett total/amount") is a total; "Nett Chicken 500g" is an item
  { kind: "total", re: /\b(grand ?total|total|jumlah|amount due|amaun)\b|^\s*nett?(\s+(total|amount|amt|payable|jumlah))?\s*[:=]?\s*$/i },
  { kind: "tax", re: /\b(sst|service tax|sales tax|cukai|gst|tax)\b/i },
  { kind: "discount", re: /\b(discount|diskaun|disc\.?|promo|voucher|baucar|less)\b/i }
];
// OCR puts digits inside words ("T0TAL", "G0RENG", "MA1L") and letters inside numbers ("1.6O")
function ocrWords(line) {
  return line
    .replace(/(?<=[A-Za-z])0(?=[A-Za-z])|(?<=\b[A-Za-z])0(?=[A-Za-z])/g, "O")
    .replace(/(?<=[A-Za-z])1(?=[A-Za-z])/g, "I")
    .replace(/(?<=[A-Za-z])5(?=[A-Za-z])/g, "S")
    .replace(/(^|\s)([0-9OoSlI]{1,4}[.,][0-9OoSlI]{2})(?=\s|$)/g, (m, sp, num) => /\d/.test(num) ? sp + fixDigits(num.replace(",", "#")).replace("#", ".") : m);
}
// Header and footer lines that carry no money (dates, invoice numbers, phone, thanks)
const NOISE = /\b(tel|fax|phone|invoice|inv no|receipt no|resit|bill no|order no|table|meja|cashier|kasyier|counter|pos|terminal|gst id|sst id|sst no|reg(istration)? no|co\.? ?no|sdn|bhd|enterprise|thank|terima kasih|welcome|selamat|www\.|\.com|please come|qty|item count|pax)\b/i;
const DATE_RE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/;

/**
 * parseReceipt(text) → {
 *   store, date (YYYY-MM-DD or null),
 *   items: [{ label, qty, unit, rm }]       (discounts have rm < 0)
 *   subtotal, tax, service, rounding, total (numbers or null),
 *   itemsSum, expected (items + tax + service + rounding), check: { ok, diff }, warnings: [text]
 * }
 */
// Typed by hand, people write "8.5", "RM5" or "Teh tarik 3": 0–2 decimals, the number last on the line.
// (Only for typed text: on a photo, a number without cents is a quantity, a table or a phone number.)
const TYPED_AMOUNT_AT_END = /(^|\s)(-|−)?(?:RM|R\.M\.?)?\s?(\d{1,4})(?:[.,](\d{1,2}))?\s*$/i;
function parseTypedAmount(text) {
  const m = String(text).trim().match(TYPED_AMOUNT_AT_END);
  if (!m) return null;
  const v = Number(m[3] + "." + (m[4] || "0").padEnd(2, "0"));
  if (!Number.isFinite(v) || v > RECEIPT_MAX_RM) return null;
  return m[2] ? -v : v;
}

function parseReceipt(text, opts = {}) {
  const typed = opts.typed === true;
  const raw = String(text || "").replace(/\r/g, "").split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, RECEIPT_MAX_LINES);
  const out = { store: null, date: null, items: [], subtotal: null, tax: null, service: null, rounding: null, total: null, warnings: [] };
  let pendingLabel = null; // an item name whose price sits on a later line
  raw.forEach((rawLine, i) => {
    const line = ocrWords(rawLine);
    if (!out.date) {
      const d = line.match(DATE_RE);
      if (d) out.date = rcDate(d[1], d[2], d[3]);
    }
    let amount = parseAmount(line);
    let words = amount === null ? line : line.replace(AMOUNT_AT_END, "").trim();
    if (amount === null && typed && !DATE_RE.test(line)) {
      amount = parseTypedAmount(line);
      if (amount !== null) words = line.replace(TYPED_AMOUNT_AT_END, "").trim();
    }
    const kind = (LINE_KINDS.find(k => k.re.test(words)) || { kind: "item" }).kind;
    if (amount === null) {
      // The first wordy line near the top is usually the shop name
      if (!out.store && i < 4 && /[a-z]{3}/i.test(line) && !NOISE.test(line) && !DATE_RE.test(line) && !/order summary|tax invoice|invois|receipt|resit/i.test(line)) out.store = rcTitle(line).slice(0, 40);
      else if (kind === "item" && !NOISE.test(line) && /[a-z]{3}/i.test(line) && !DATE_RE.test(line) && line.length <= 40 && (out.store || i > 0)) {
        pendingLabel = pendingLabel && pendingLabel.length < 40 ? `${pendingLabel}, ${line}` : line; // a two-line item name
      }
      return;
    }
    if (kind === "skip") { pendingLabel = null; return; }
    if (kind === "rounding") { out.rounding = RC_F.round2((out.rounding || 0) + amount); return; }
    if (kind === "service") { out.service = RC_F.round2(Math.abs(amount)); return; }
    if (kind === "tax") { if (Math.abs(amount) > 0) out.tax = RC_F.round2((out.tax || 0) + Math.abs(amount)); return; }
    if (kind === "subtotal") { out.subtotal = Math.abs(amount); return; }
    if (kind === "total") {
      // "Total qty 3" style lines have no decimals, so they never reach here. Keep the last total
      // (grand total comes after subtotal), but a "total" smaller than an earlier one is a sub-line.
      if (out.total === null || /grand|amount due|jumlah besar/i.test(words) || Math.abs(amount) >= out.total) out.total = Math.abs(amount);
      return;
    }
    if (NOISE.test(words) && !/[a-z]{3,}.*[a-z]{3,}/i.test(words.replace(NOISE, ""))) return;
    let label = words;
    if (!/[a-z]{2}/i.test(label) && pendingLabel) label = pendingLabel + " " + label;
    pendingLabel = null;
    const item = itemFrom(label, amount, kind === "discount");
    if (item) { if (kind === "discount") item.discount = true; out.items.push(item); }
  });
  out.itemsSum = RC_F.round2(out.items.reduce((s, it) => s + it.rm, 0));
  out.expected = RC_F.round2(out.itemsSum + (out.tax || 0) + (out.service || 0) + (out.rounding || 0));
  // Some receipts print prices tax-inclusive with an SST line "included": then items alone match
  const candidates = [out.expected, out.itemsSum, RC_F.round2(out.itemsSum + (out.rounding || 0))];
  if (out.total !== null) {
    const best = candidates.reduce((a, b) => (Math.abs(b - out.total) < Math.abs(a - out.total) ? b : a));
    const diff = RC_F.round2(out.total - best);
    out.check = { ok: Math.abs(diff) <= 0.05, diff };
    if (!out.check.ok) out.warnings.push(`The lines add up to RM ${best.toFixed(2)} but ${typed ? "the total you typed" : "the receipt total"} says RM ${out.total.toFixed(2)}. ${typed ? "Check the amounts you typed, or a line may be missing." : "A price was probably misread: check each line."}`);
  } else {
    out.check = { ok: false, diff: null };
    if (!typed) out.warnings.push("No total found. Check the lines and type the total from the receipt.");
  }
  if (!out.items.length) out.warnings.push(typed ? "No item lines found. Put each item on its own line with its price last, like “Teh tarik 2.80”, or add them below." : "No item lines found. Add them below, or try a sharper, flatter photo.");
  return out;
}

// "2 x MILO AIS @3.20" / "MILO AIS 2 3.20" / "2 MILO AIS" → { label, qty, unit, rm }
function itemFrom(label, amount, isDiscount) {
  let qty = 1, unit = null;
  let name = label;
  let m = name.match(/^(\d{1,2})\s?[xX×*]\s?(.+)$/) || name.match(/^(.+?)\s[xX×*]\s?(\d{1,2})$/);
  if (m) {
    const lead = /^\d/.test(m[1]);
    qty = Number(lead ? m[1] : m[2]);
    name = (lead ? m[2] : m[1]).trim();
  }
  m = name.match(/^(.+?)\s@\s?(?:RM)?\s?(\d+[.,]\d{2})$/i);
  if (m) { name = m[1].trim(); unit = Number(m[2].replace(",", ".")); }
  // A qty column and/or a unit price column before the line total: "NASI LEMAK 2 3.50"
  m = name.match(/^(.+?)\s(\d{1,2})\s(\d+[.,]\d{2})$/);
  if (m && Math.abs(Number(m[2]) * Number(m[3].replace(",", ".")) - Math.abs(amount)) < 0.06) { name = m[1]; qty = Number(m[2]); unit = Number(m[3].replace(",", ".")); }
  else {
    m = name.match(/^(.+?)\s(\d{1,2})$/);
    if (m && /[a-z]{3}/i.test(m[1])) { name = m[1]; qty = Number(m[2]); }
  }
  if (!m) {
    // "2 Teh Tarik" is two; "7 Up" is a drink (a leading number counts only before a real word)
    m = name.match(/^(\d{1,2})\s([a-z].+)$/i);
    if (m && /[a-z]{3}/i.test(m[2]) && !/^7\s?up\b/i.test(name)) { qty = Number(m[1]); name = m[2]; }
  }
  name = name.replace(/^[^a-z0-9]+|[^a-z0-9)]+$/gi, "").replace(/\s+/g, " ").trim();
  // Item codes and barcodes at the start ("1001 NASI LEMAK", "9556001 MILO")
  name = name.replace(/^\d{4,}\s+/, "");
  if (!/[a-z]{2}/i.test(name)) return null;
  if (qty < 1 || qty > 50) qty = 1;
  const rm = isDiscount ? -Math.abs(amount) : amount;
  return { label: rcTitle(name).slice(0, 60), qty, unit: unit !== null && Number.isFinite(unit) ? unit : null, rm: RC_F.round2(rm) };
}

function rcDate(d, m, y) {
  let year = Number(y);
  if (year < 100) year += 2000;
  const day = Number(d), month = Number(m);
  if (year < 2015 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function rcTitle(s) {
  return String(s).toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

// ---------- what each line is ----------
// category: "meal" | "drink" | "snack" | "groceries" | "fees" | "other"; plus a matching meal or pack
const MEAL_WORDS = [
  [/nasi lemak/i, "nasilemak"], [/roti canai|roti kosong|roti telur/i, "roticanai"], [/kaya.*toast|roti bakar/i, "kayatoast"],
  [/chicken rice|nasi ayam/i, "chickenrice"], [/economy rice|nasi campur|mixed rice|cai fan|chap fan/i, "ecorice"],
  [/mee goreng|mi goreng|mee mamak/i, "meegoreng"], [/maggi goreng/i, "maggigoreng"], [/chapati|capati/i, "chapati"],
  [/yong tau foo|yong tau fu|ytf/i, "yongtaufoo"], [/rendang/i, "rendang"], [/burger/i, "burgermeal"], [/fried chicken|ayam goreng/i, "friedchicken"],
  [/pizza/i, "pizzashare"], [/satay|sate/i, "satay"], [/dim sum|dimsum|siew mai|har gow/i, "dimsum"], [/cup noodle|mee cup|mi cawan/i, "storenoodles"],
  [/menu rahmah|rahmah/i, "rahmah"]
];
const DRINK_WORDS = /\b(teh|tea|kopi|coffee|latte|americano|milo|neslo|sirap|bandung|limau|lime|juice|jus|air|water|mineral|soya|soy ?milk|coke|cola|pepsi|100 ?plus|sprite|boba|bubble|chatime|tealive|zus|bottle|botol|ice|ais|tarik)\b/i;
const DRINK_MEAL = [[/teh tarik/i, "tehtarik"], [/kopi[- ]?o kosong/i, "kopiokosong"], [/milo/i, "icedmilo"], [/bubble|boba|brown sugar/i, "bubbletea"]];
const SNACK_WORDS = /\b(chips|keropok|biscuit|biskut|cookie|chocolate|coklat|kit ?kat|candy|gula-gula|cake|kek|donut|ice cream|aiskrim|snack|kuih|pau|curry puff|karipap)\b/i;
const FEE_WORDS = /\b(delivery|penghantaran|service fee|platform fee|small order|bag|beg|packaging|takeaway charge|bungkus charge)\b/i;
const PACK_WORDS = [
  [/\b(beras|rice)\b.*\b(\d+ ?kg)\b|\b(\d+ ?kg)\b.*\b(beras|rice)\b|\bberas\b/i, "rice"], [/\b(telur|eggs?)\b/i, "eggs"], [/\b(sayur|vegetables?|veg|cabbage|kubis|bayam|spinach|broccoli|brokoli)\b/i, "veg"],
  [/\b(kangkung|sawi|choy|choi)\b/i, "greens"], [/\b(ayam|chicken)\b/i, "chicken"], [/\b(tauhu|tofu|tempe|tempeh)\b/i, "tofu"],
  [/\b(oat|oats)\b/i, "oats"], [/\b(pisang|banana)\b/i, "banana"], [/\b(tomato|tomatoes)\b/i, "tomato"], [/\b(lobak|carrot)\b/i, "rootveg"],
  [/\b(dhal|dal|lentil|kacang dal)\b/i, "beans"], [/\b(roti|bread|gardenia|massimo)\b/i, "bread"], [/\b(kacang|peanut)\b/i, "peanuts"],
  [/\b(soya|soy milk|soymilk)\b/i, "soymilk"], [/\b(epal|apple)\b/i, "apple"], [/\b(mee|mi|noodle|maggi|bihun|kuey teow|spaghetti|pasta)\b/i, "noodles"],
  [/\b(ikan|fish|kembung)\b/i, "fish"], [/\b(susu|milk|dutch lady|farm fresh)\b/i, "milk"]
];

function categorize(label, context = {}) {
  const t = String(label || "");
  if (FEE_WORDS.test(t)) return { category: "fees" };
  // In a supermarket (lots of lines, a grocery-looking store) raw foods are groceries
  const grocery = context.grocery === true;
  if (!grocery) {
    for (const [re, id] of MEAL_WORDS) if (re.test(t)) return { category: "meal", mealId: id };
    for (const [re, id] of DRINK_MEAL) if (re.test(t)) return { category: "drink", mealId: id };
  }
  if (grocery || /\b(\d+ ?(kg|g|gm|pcs|biji|pkt|pack|ikat))\b/i.test(t)) {
    for (const [re, id] of PACK_WORDS) if (re.test(t)) return { category: "groceries", packId: id };
    if (grocery && !SNACK_WORDS.test(t)) return { category: "groceries" }; // Milo powder at Mydin is groceries
  }
  if (DRINK_WORDS.test(t)) return { category: "drink" };
  if (SNACK_WORDS.test(t)) return { category: "snack" };
  if (grocery) return { category: "groceries" };
  return { category: /\b(nasi|mee|mi|rice|noodle|set|ayam|chicken|ikan|fish|daging|beef|roti|bihun|kuey teow|soup|sup|tomyam|tom yam|curry|kari)\b/i.test(t) ? "meal" : "other" };
}

// A receipt looks like a supermarket one when the store or most lines say so
// (Convenience stores like 7-Eleven and FamilyMart sell ready food, so they don't count.)
const GROCERY_STORE = /\b(mydin|lotus'?s?|tesco|aeon|giant|econsave|jaya grocer|village grocer|mercato|99 ?speedmart|speedmart|nsk|hero|cold storage|mydin mart|pasar ?raya|market|pasar|grocer|supermarket|hypermarket|borong)\b/i;
function looksLikeGrocery(parsed) {
  if (parsed.store && GROCERY_STORE.test(parsed.store)) return true;
  // Otherwise: most lines carry a pack size ("5kg", "10 biji", "500ml") and aren't cooked food
  const sized = parsed.items.filter(it => /\d+ ?(kg|g|gm|ml|l|pcs|biji|pkt|pack|ikat|s)\b/i.test(it.label) && !MEAL_WORDS.some(([re]) => re.test(it.label))).length;
  return parsed.items.length >= 3 && sized / parsed.items.length >= 0.5;
}

// Ready-to-confirm lines: parsed items with a category and a sensible default
// A discount line belongs to the item above it (same category, never a meal of its own)
function confirmLines(parsed) {
  const grocery = looksLikeGrocery(parsed);
  let prev = null;
  return parsed.items.map(it => {
    if (it.discount || it.rm < 0) {
      const cat = prev ? prev.category : (grocery ? "groceries" : "other");
      return { ...it, category: cat, discount: true };
    }
    const line = { ...it, ...categorize(it.label, { grocery }) };
    prev = line;
    return line;
  });
}

// ---------- prices for My prices ----------
// Only meals a receipt line really compares with: one roti canai is half of our "×2 with dhal",
// a set (kaya toast, maggi goreng + teh tarik, yong tau foo pieces) isn't comparable at all.
const PRICE_PIECES = { nasilemak: 1, roticanai: 2, chapati: 2, chickenrice: 1, ecorice: 1, meegoreng: 1, rendang: 1, rahmah: 1,
  tehtarik: 1, kopiokosong: 1, icedmilo: 1, bubbletea: 1, storenoodles: 1 };
// The price of the app's meal from a line (rm for qty items), or null if it doesn't compare
function priceFromLine(mealId, rm, qty) {
  const pieces = PRICE_PIECES[mealId];
  const q = Number(qty) >= 1 ? Number(qty) : 1;
  if (!pieces || !(rm > 0)) return null;
  const v = RC_F.round2((rm / q) * pieces);
  return v >= 0.1 && v <= 200 ? v : null;
}

// How closely a line names the app's meal. "close": nothing on the line but the meal and filler
// ("Nasi Lemak Bungkus", "2 x Roti Canai", "TEH TARIK (R)"); "loose": the line is a different dish
// that only contains the meal's name ("Nasi Lemak Ayam Goreng Berempah" is not a plain nasi lemak,
// and costs twice as much), so its price is never saved unless the student picks it.
const PRICE_FILLER = /\b(bungkus|bks|biasa|kosong|ori|original|regular|reg|set|satu|one|pcs?|x|qty|r|m|panas|hot|ais|iced?|tapau|takeaway|dine|in|sst|rm|mamak)\b/gi;
// Names that count as the plain meal (a roti telur is not a roti canai, and costs more)
const PRICE_CORE = { roticanai: /roti canai|roti kosong/i };
function priceMatch(label, mealId) {
  if (!PRICE_PIECES[mealId]) return null;
  const t = String(label || "");
  const all = MEAL_WORDS.concat(DRINK_MEAL).filter(([, id]) => id === mealId).map(([re]) => re);
  if (!all.some(re => re.test(t))) return null;
  const res = PRICE_CORE[mealId] ? [PRICE_CORE[mealId]] : all;
  let rest = t;
  res.forEach(re => { rest = rest.replace(new RegExp(re.source, "gi"), " "); });
  rest = rest.replace(/[\d.,:;()\[\]#*+@/-]+/g, " ").replace(PRICE_FILLER, " ").replace(/\s+/g, " ").trim();
  return rest.length <= 1 ? "close" : "loose";
}

// Is a typed or read total too far from the lines to trust without asking?
// Lines higher than the total by over 50 sen means a misread or missed discount; a total higher than the
// lines by more than 50 sen and more than 17% is beyond what SST (6–8%) plus a 10% service charge add.
function totalMismatch(total, lineSum) {
  const t = Number(total), s = Number(lineSum);
  if (!Number.isFinite(t) || !Number.isFinite(s)) return false;
  const diff = Math.round((t - s) * 100) / 100;
  return diff < -0.5 || (diff > 0.5 && diff > 0.17 * Math.max(0, s));
}

// ---------- the confirmed spend record ----------
const SPEND_CATS = ["meal", "drink", "snack", "groceries", "fees", "other"];
const SPEND_MAX = 400; // receipts kept on the device (a semester and a bit)
function validateSpend(raw) {
  if (!raw || typeof raw !== "object") return null;
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
  // a real calendar day, and not in the future (a day of slack for time zones)
  if (!date || !rcRealDay(date) || date > rcKey(new Date(Date.now() + 86400000))) return null;
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, RECEIPT_MAX_LINES).map(it => {
    if (!it || typeof it !== "object") return null;
    const rm = Number(it.rm);
    const label = typeof it.label === "string" ? it.label.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (!label || !Number.isFinite(rm) || rm < -RECEIPT_MAX_RM || rm > RECEIPT_MAX_RM) return null;
    const out = { label, rm: RC_F.round2(rm), category: SPEND_CATS.includes(it.category) ? it.category : "other" };
    if (typeof it.mealId === "string" && RC_F.mealById(it.mealId)) out.mealId = it.mealId;
    if (typeof it.packId === "string" && RC_F.PACKS[it.packId]) out.packId = it.packId;
    if (["B", "L", "D", "S"].includes(it.slot)) out.slot = it.slot; // the check-in meal this line was counted as
    return out;
  }).filter(Boolean);
  if (!items.length) return null;
  const total = Number(raw.total);
  const sum = RC_F.round2(items.reduce((s, it) => s + it.rm, 0));
  return {
    // Old records without an id get a stable one from their content; new records get newSpendId()
    id: typeof raw.id === "string" && /^[a-z0-9]{4,16}$/i.test(raw.id) ? raw.id : "s" + Math.abs(rcHash(date + JSON.stringify(items) + String(raw.at || ""))).toString(36),
    date, store: typeof raw.store === "string" ? raw.store.slice(0, 40) : "",
    items, total: Number.isFinite(total) && total >= 0 && total <= RECEIPT_MAX_RM ? RC_F.round2(total) : sum,
    source: raw.source === "receipt" ? "receipt" : "typed"
  };
}
// Two identical spends (same coffee, same day) are two spends: a repeated id gets a new one, never dropped
function validateSpendLog(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map(validateSpend).filter(Boolean).map((s, i) => {
    let id = s.id, n = i;
    while (seen.has(id)) id = (s.id.slice(0, 12) + (n++).toString(36)).slice(0, 16);
    seen.add(id);
    return id === s.id ? s : { ...s, id };
  }).slice(0, SPEND_MAX);
}
// The student changed a receipt-linked meal in the check-in: the receipt no longer stands for that meal.
// Its lines lose that slot (they stay in My real week as their own spend; nothing is deleted).
function unslotSpends(spends, ids, date, slot) {
  const want = new Set(ids || []);
  return validateSpendLog(spends).map(sp => (!want.has(sp.id) || sp.date !== date) ? sp
    : { ...sp, items: sp.items.map(it => { if (it.slot !== slot) return it; const { slot: _s, ...rest } = it; return rest; }) });
}
// A fresh id for a new spend: random, so two identical spends never share one
function newSpendId(rand = Math.random) {
  let id = "s";
  while (id.length < 12) id += Math.floor(rand() * 36).toString(36);
  return id;
}
// A receipt still being checked (kept across a reload). Anything odd is dropped; a draft older than 3 days is stale.
function validateDraft(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.lines)) return null;
  if (!(Number(raw.at) > 0) || now - Number(raw.at) > 3 * 86400000) return null;
  const today = rcKey(new Date(now));
  const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  const lines = raw.lines.slice(0, RECEIPT_MAX_LINES).filter(l => l && typeof l === "object").map(l => {
    const rm = Number(l.rm), qty = Number(l.qty);
    return { label: str(l.label, 60), rm: Number.isFinite(rm) && Math.abs(rm) <= RECEIPT_MAX_RM ? RC_F.round2(rm) : 0,
      category: SPEND_CATS.includes(l.category) ? l.category : "other",
      mealId: typeof l.mealId === "string" && RC_F.mealById(l.mealId) ? l.mealId : null,
      packId: typeof l.packId === "string" && RC_F.PACKS[l.packId] ? l.packId : null,
      qty: Number.isInteger(qty) && qty >= 1 && qty <= 50 ? qty : 1, slot: ["B", "L", "D", "S"].includes(l.slot) ? l.slot : "", price: l.price === true };
  });
  if (!lines.length) return null;
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && rcRealDay(raw.date) && raw.date <= today ? raw.date : today;
  const total = raw.total === null || raw.total === undefined || raw.total === "" ? null : Number(raw.total);
  return { source: raw.source === "receipt" ? "receipt" : "typed", store: str(raw.store, 40), date,
    total: total !== null && Number.isFinite(total) && total >= 0 && total <= RECEIPT_MAX_RM ? RC_F.round2(total) : null,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter(w => typeof w === "string").slice(0, 5).map(w => w.slice(0, 300)) : [],
    ocrText: str(raw.ocrText, 3000), lines, groceries: raw.groceries === true, savePrices: raw.savePrices === true, at: Number(raw.at) };
}

function rcKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function rcRealDay(key) { const [y, m, d] = key.split("-").map(Number); const t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; }
function rcHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

if (typeof module !== "undefined") {
  module.exports = { PRICE_PIECES, priceFromLine, priceMatch, parseAmount, parseTypedAmount, parseReceipt, itemFrom, categorize, looksLikeGrocery, confirmLines, validateSpend, validateSpendLog, validateDraft, unslotSpends, newSpendId, totalMismatch, SPEND_CATS, SPEND_MAX, rcTitle };
}
