// =============================================================
// week.js — the scenes of one student week (Sunday prep + Mon–Sun).
//
// Days: -1 = the Sunday before, 0 = Monday … 6 = Sunday.
// Slots: B breakfast, L lunch, D dinner (meals); X afternoon and N late night (extras).
// A slot with no scene is filled by HABIT: your last choice for that meal repeats
// (if you still can), otherwise a default. That is how one decision shapes a whole week.
//
// Option fields
//   meal      id in foods.js MEALS (numbers always come from there)
//   fee       extra RM paid on top (delivery fee, service charge), with feeLabel
//   basket    a grocery shop: list of pack ids bought (cost from PACKS)
//   prep      meal ids to batch-cook (first one your groceries allow) → adds lunchboxes
//   lunchbox  true = eat one of your prepared lunchboxes
//   social    a short note when a choice has a social side (no score — it's your call)
//   note      { text, src } a short, sourced line shown after choosing
// =============================================================

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_NAMES = { B: "Breakfast", L: "Lunch", D: "Dinner", X: "Afternoon", N: "Late night" };

// Pantry staples everyone is assumed to have (not tracked as stock)
const PANTRY = ["oil", "sugar", "water"];

// Grocery baskets: pack ids from foods.js PACKS
const BASKETS = {
  kitchenFull: ["rice", "eggs", "veg", "veg", "greens", "greens", "chicken", "oats", "banana", "tomato", "rootveg", "beans"],
  kitchenFullVeg: ["rice", "eggs", "veg", "veg", "greens", "greens", "tofu", "tofu", "oats", "banana", "tomato", "rootveg", "beans"],
  kitchenSmall: ["rice", "eggs", "veg", "greens", "oats", "banana"],
  hostelShelf: ["oats", "banana", "bread", "peanuts", "soymilk", "apple", "noodles"]
};

const SCENES = [
  // ---------------- Sunday before ----------------
  {
    id: "shop", day: -1, slot: "X", time: "Sunday, 5 p.m.", kind: "plan",
    title: "Do you shop for the week?",
    text: s => s.profile.kitchen === "hostel"
      ? "Your hostel room has a kettle and a small fridge. The 99 Speedmart downstairs closes at 11."
      : "The hypermarket is a 15-minute bus ride. You have about an hour before dinner.",
    options: s => s.profile.kitchen === "hostel"
      ? [
          { id: "shelf", label: "Stock a snack shelf: oats, bananas, bread, peanuts, soy milk, apples, noodles", basket: "hostelShelf" },
          { id: "none", label: "Skip it and buy food as you go", basket: null,
            note: { text: "Buying every meal is simple, but nothing at home means nothing cheap at 11 p.m.", src: null } }
        ]
      : [
          { id: "full", label: "Full shop for the week (rice, eggs, vegetables, protein, fruit, oats)", basket: s.profile.diet.vegetarian ? "kitchenFullVeg" : "kitchenFull" },
          { id: "small", label: "Small top-up: rice, eggs, one bag of vegetables, oats, bananas", basket: "kitchenSmall" },
          { id: "none", label: "Skip it and buy food as you go", basket: null,
            note: { text: "Nothing in the fridge keeps the week flexible, but every meal will be bought at stall prices.", src: null } }
        ]
  },
  {
    id: "prep", day: -1, slot: "N", time: "Sunday, 8 p.m.", kind: "plan",
    title: "Cook lunchboxes for Mon–Wed?",
    when: s => s.profile.kitchen !== "hostel" && s.flags.shop && s.flags.shop !== "none",
    text: () => "It would take about 45 minutes. Three boxes in the fridge means three lunches already sorted.",
    options: s => [
      { id: "prep", label: "Cook three boxes", prep: s.profile.diet.vegetarian
        ? ["tofukangkung", "eggfriedrice", "dhalrice"] : ["chickenstirfry", "eggfriedrice", "tofukangkung", "dhalrice"], count: 3 },
      { id: "noprep", label: "Not tonight", note: { text: "Groceries you bought and don't cook are food you paid for and throw away. About 60% of the food wasted worldwide is wasted at home.", src: "UNEP" } }
    ]
  },
  // ---------------- Monday ----------------
  {
    id: "mon-b", day: 0, slot: "B", time: "Monday, 7:40 a.m.", kind: "meal",
    title: "8 a.m. lecture",
    text: () => "You're up late again. Whatever you pick here becomes your usual breakfast for the week.",
    options: () => [
      { id: "home", meal: "oatsbanana" },
      { id: "stall", meal: "nasilemak", note: { text: "DOSM's 2024 average for a plate of nasi lemak was RM3.68, up 81% on 2011 (RM2.03).", src: "DOSM" } },
      { id: "kopitiam", meal: "kayatoast" },
      { id: "skip", meal: "icedmilo", label: "Skip food, grab an iced Milo",
        note: { text: "A sweet drink instead of breakfast is common: 59% of Malaysian adults have more than one sugary drink a day.", src: "NHMS24" } }
    ]
  },
  {
    id: "mon-l", day: 0, slot: "L", time: "Monday, 12:50 p.m.", kind: "meal",
    title: "Campus cafeteria",
    text: () => "Forty minutes until the next class. This becomes your default lunch on days you don't decide.",
    options: () => [
      { id: "box", meal: "chickenstirfry", lunchbox: true, label: "Eat a lunchbox you cooked" },
      { id: "rahmah", meal: "rahmah", note: { text: "Menu Rahmah sets are capped at RM5, and 3,210 premises took part by July 2026. Some campuses run their own RM5 student menus: UTM has 14 cafés in one.", src: "RAHMAHCAMPUS" } },
      { id: "eco-veg", meal: "ecoricetofu" },
      { id: "eco-chicken", meal: "ecorice" },
      { id: "chickenrice", meal: "chickenrice" },
      { id: "burger", meal: "burgermeal" }
    ]
  },
  {
    id: "mon-d", day: 0, slot: "D", time: "Monday, 7:30 p.m.", kind: "meal",
    title: "Dinner",
    text: () => "Your housemates are heading to the mamak. You're tired but hungry.",
    options: () => [
      { id: "cook", meal: "eggfriedrice" },
      { id: "kettle", meal: "instantnoodles" },
      { id: "mamak", meal: "meegoreng" },
      { id: "chapati", meal: "chapati" },
      { id: "eco", meal: "ecorice" }
    ]
  },
  // ---------------- Tuesday ----------------
  {
    id: "tue-x", day: 1, slot: "X", time: "Tuesday, 3:15 p.m.", kind: "extra",
    title: "The 3 p.m. slump",
    text: () => "Two hours of lab left. Everyone is ordering drinks.",
    options: () => [
      { id: "water", meal: "water" },
      { id: "kopi", meal: "kopiokosong" },
      { id: "teh", meal: "tehtarik" },
      { id: "boba", meal: "bubbletea", note: { text: "WHO advises keeping free sugars under 10% of daily energy, and less than 5% (about 25 g) for extra benefit. One large sweet drink can pass that.", src: "WHO_S" } }
    ]
  },
  {
    id: "tue-d", day: 1, slot: "D", time: "Tuesday, 7:50 p.m.", kind: "curveball",
    title: "Heavy rain",
    text: () => "It's pouring. The delivery app shows a 'high demand' fee on everything.",
    options: () => [
      { id: "deliver", meal: "chickenrice", fee: 7, feeLabel: "delivery + rain surcharge", label: "Order chicken rice to your door" },
      { id: "cook", meal: "tofukangkung" },
      { id: "kettle", meal: "instantnoodles" },
      { id: "store", meal: "storenoodles", label: "Run to 7-Eleven for cup noodles" },
      { id: "walk", meal: "ecoriceegg", label: "Walk to the cafeteria with an umbrella" }
    ]
  },
  // ---------------- Wednesday ----------------
  {
    id: "wed-l", day: 2, slot: "L", time: "Wednesday, 12:30 p.m.", kind: "curveball",
    title: "Exam week starts",
    text: () => "Midterm at 2 p.m. You have 20 minutes, not 40.",
    options: () => [
      { id: "box", meal: "chickenstirfry", lunchbox: true, label: "Eat a lunchbox you cooked" },
      { id: "roti", meal: "roticanai" },
      { id: "eco", meal: "ecoriceegg" },
      { id: "rahmah", meal: "rahmah", label: "Grab a Menu Rahmah set" },
      { id: "skip", meal: "skip", label: "Skip lunch and revise",
        note: { text: "Skipping saves money today, but hungry evenings are when the expensive late-night orders happen.", src: null } }
    ]
  },
  {
    id: "wed-d", day: 2, slot: "D", time: "Wednesday, 8 p.m.", kind: "meal",
    title: "Group study night",
    text: () => "Four of you in the library discussion room. Someone suggests pizza.",
    options: () => [
      { id: "pizza", meal: "pizzashare", label: "Split the pizza (your share)" },
      { id: "cook", meal: "noodlesoup", label: "Go home and cook noodle soup" },
      { id: "takeaway", meal: "ecoricetofu", label: "Take away economy rice to the room" },
      { id: "kettle", meal: "instantnoodles" }
    ]
  },
  {
    id: "wed-n", day: 2, slot: "N", time: "Wednesday, 1:05 a.m.", kind: "curveball",
    title: "\"Mamak?\"",
    text: s => s.flags.skippedLunch
      ? "The group chat lights up. You skipped lunch, so you're starving."
      : "The group chat lights up. Everyone is going for a study break.",
    options: () => [
      { id: "full", meal: "maggigoreng" },
      { id: "light", meal: "roticanai", label: "Go, but just roti canai" },
      { id: "home", meal: "breadpeanut", label: "Stay in and make toast" },
      { id: "sleep", meal: "skip", label: "Sleep instead", social: "You miss the gossip, and you sleep." }
    ]
  },
  // ---------------- Thursday ----------------
  {
    id: "thu-l", day: 3, slot: "L", time: "Thursday, 1 p.m.", kind: "meal",
    title: "Halfway check",
    text: s => {
      const left = s.profile.budget + (s.borrowed || 0) - s.spent;
      return `RM ${left.toFixed(2)} left for the rest of the week: four more days.${s.borrowed ? ` That includes RM ${s.borrowed} you borrowed.` : ""}`;
    },
    options: () => [
      { id: "box", meal: "chickenstirfry", lunchbox: true, label: "Eat a lunchbox you cooked" },
      { id: "eco", meal: "ecoricetofu" },
      { id: "ytf", meal: "yongtaufoo" },
      { id: "rendang", meal: "rendang", note: { text: "Beef averages about 100 kg CO₂e per kg, the highest of any common food. A rendang lunch weighs more than a week of tofu lunches.", src: "OWID" } }
    ]
  },
  {
    id: "thu-d", day: 3, slot: "D", time: "Thursday, 8:15 p.m.", kind: "curveball",
    title: "The new fried chicken place",
    text: () => "A friend has a 20%-off voucher that expires tonight. The set is still RM 24.",
    options: () => [
      { id: "go", meal: "friedchicken" },
      { id: "cook", meal: "dhalrice" },
      { id: "mamak", meal: "chapati" },
      { id: "kettle", meal: "instantnoodles" }
    ]
  },
  // ---------------- Friday ----------------
  {
    id: "fri-d", day: 4, slot: "D", time: "Friday, 7:45 p.m.", kind: "curveball",
    title: "A friend's birthday dinner",
    text: () => "Dinner at a restaurant in Bangsar. Bills are split by what you order, plus 10% service charge.",
    options: () => [
      { id: "big", meal: "friedchicken", fee: 2.4, feeLabel: "10% service charge", label: "Order a full set" },
      { id: "small", meal: "dimsum", fee: 1.6, feeLabel: "10% service charge", label: "Share small plates" },
      { id: "skip", meal: "eggfriedrice", label: "Eat at home and join for dessert only",
        social: "You still show up. That counts." }
    ]
  },
  // ---------------- Saturday ----------------
  {
    id: "sat-l", day: 5, slot: "L", time: "Saturday, 11:30 a.m.", kind: "meal",
    title: s => (s.profile.budget + (s.borrowed || 0) - s.spent) < s.profile.budget * 0.25 ? "Running low" : "Weekend brunch",
    text: s => {
      const left = s.profile.budget + (s.borrowed || 0) - s.spent;
      return left < s.profile.budget * 0.25
        ? `RM ${Math.max(0, left).toFixed(2)} left for two more days. Your friends want brunch.`
        : `RM ${left.toFixed(2)} left for the weekend. Your friends want brunch.`;
    },
    options: () => [
      { id: "cafe", meal: "brunchcafe" },
      { id: "dimsum", meal: "dimsum" },
      { id: "home", meal: "eggtoast", label: "Make eggs on toast at home" },
      { id: "roti", meal: "roticanai" }
    ]
  },
  {
    id: "sat-d", day: 5, slot: "D", time: "Saturday, 8 p.m.", kind: "meal",
    title: "Pasar malam",
    text: () => "The night market is on. The satay smoke reaches your window.",
    options: () => [
      { id: "satay", meal: "satay", note: { text: "DOSM's 2024 average for one stick of chicken satay was RM1.09.", src: "DOSM" } },
      { id: "fruit", meal: "fruitpack", note: { text: "Tip: near closing, surplus-food apps sell restaurant and bakery leftovers at a discount (Value Food lists 80+ merchants in the Klang Valley and Johor Bahru).", src: "SURPLUS" } },
      { id: "cook", meal: "fishcurry" },
      { id: "mamak", meal: "chapati", label: "Skip the market: chapati at the mamak" },
      { id: "kettle", meal: "instantnoodles" }
    ]
  },
  // ---------------- Sunday ----------------
  {
    id: "sun-l", day: 6, slot: "L", time: "Sunday, 1 p.m.", kind: "plan",
    title: "What's left in the fridge?",
    when: s => Object.keys(s.inventory).some(k => s.inventory[k] > 0),
    text: s => `Still in your kitchen: ${stockSummary(s)}. Anything fresh you don't use soon gets thrown out.`,
    options: () => [
      { id: "useup", useUp: true, label: "Cook what's left into fried rice (one plate)" },
      { id: "order", meal: "chickenrice", fee: 5, feeLabel: "delivery fee", label: "Order delivery" },
      { id: "out", meal: "ecoricetofu", label: "Eat out" }
    ]
  }
];

const STOCK_NAMES = { rice: "rice", eggs: "eggs", veg: "vegetables", greens: "greens", chicken: "chicken", tofu: "tofu", oats: "oats",
  banana: "bananas", tomato: "tomatoes", rootveg: "carrots", beans: "dhal", bread: "bread", peanuts: "peanuts", soymilk: "soy milk",
  apple: "apples", noodles: "noodles", fish: "fish", milk: "milk" };
function ingredientName(id) { return STOCK_NAMES[id] || String(id).replace(/[^a-z ]/gi, " ").trim(); }

function stockSummary(s) {
  const left = Object.keys(s.inventory).filter(k => s.inventory[k] > 0).map(k => `${ingredientName(k)} (${Math.round(s.inventory[k])} g)`);
  return left.length ? left.slice(0, 5).join(", ") + (left.length > 5 ? " and more" : "") : "nothing";
}

// Order of points in the week. Meals (B/L/D) are always filled; extras only when a scene exists.
function buildSchedule() {
  const points = [{ day: -1, slot: "X" }, { day: -1, slot: "N" }];
  for (let d = 0; d < 7; d++) ["B", "L", "X", "D", "N"].forEach(slot => points.push({ day: d, slot }));
  return points;
}

if (typeof module !== "undefined") {
  module.exports = { DAY_NAMES, DAY_SHORT, SLOT_NAMES, PANTRY, BASKETS, SCENES, buildSchedule, stockSummary, ingredientName };
}
