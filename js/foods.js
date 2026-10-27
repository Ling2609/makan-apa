// =============================================================
// foods.js — the single source of truth for every number in the app.
//
// INGREDIENTS
//   co2   kg CO2e per kg of food. Poore & Nemecek (2018), global averages,
//         via Our World in Data (grapher: ghg-per-kg-poore). Real values vary widely.
//   fv    counts towards WHO's 400 g/day fruit & vegetable target
//         (WHO excludes potatoes and other starchy roots).
//   meat  "red" | "white" | "fish" | "pork" — used for diet filters (halal, vegetarian).
//
// GROCERY PACKS (what you actually buy at a Malaysian supermarket)
//   g, rm     pack size in grams and pack price in RM.
//   src       "rice" → controlled price of local white rice, RM2.60/kg (Malay Mail, 13 Jul 2026);
//             "dosm" → DOSM CPI 2024 average price (Malay Mail, 30 Apr 2025). DOSM's 2025 analysis
//             gives no per-dish prices and changed its beef specification, so 2024 stays, labelled;
//             otherwise an estimate for a Klang Valley supermarket in 2026.
//
// MEALS (what a student eats)
//   source    "buy" (any kitchen), "kettle" (hostel: kettle + fridge), "cook" (needs a stove)
//   price     shop/stall price in RM (buy meals only). Cooked and kettle meals are costed from
//             grocery packs: grams × pack price / pack grams.
//   recipe    [{ id, g }] ingredient grams for one serving → footprint and fruit & veg grams.
//   sugary / salty  flags for WHO sugar (< 10% of energy) and salt (< 5 g/day) reminders.
//   occasion  a treat or social meal: appears in the week simulation, never in generated plans.
//   maxWeek   most times a generated plan may use it in a week (instant noodles: 2).
//   short     a short noun for comparison sentences ("the chapati").
//   prep      { min, keeps } batch-cooking time in minutes and fridge life in days (cooked meals).
//   steps     three plain steps to make it (cooked and kettle meals).
//   rahmah    a Menu Rahmah RM5 meal: only offered when the student says their campus has one.
//   snack     a fruit snack the planner can add when the budget allows.
//
// MY PRICES: students can override any meal or pack price (setPriceOverrides). Every cost in the
// app goes through mealPrice()/packPrice(), so overrides reach the week, the plan and the check-in.
// =============================================================

const INGREDIENTS = [
  { id: "beef", name: "Beef", co2: 99.48, meat: "red" },
  { id: "lamb", name: "Lamb / mutton", co2: 39.72, meat: "red" },
  { id: "prawns", name: "Prawns (farmed)", co2: 26.87, meat: "fish" },
  { id: "fish", name: "Fish (farmed)", co2: 13.63, meat: "fish" },
  { id: "pork", name: "Pork", co2: 12.31, meat: "pork" },
  { id: "chicken", name: "Chicken", co2: 9.87, meat: "white" },
  { id: "eggs", name: "Eggs", co2: 4.67 },
  { id: "tofu", name: "Tofu / tempeh", co2: 3.16 },
  { id: "beans", name: "Dhal / lentils / beans", co2: 1.79 },
  { id: "peanuts", name: "Peanuts", co2: 3.23 },
  { id: "cheese", name: "Cheese", co2: 23.88 },
  { id: "milk", name: "Dairy milk", co2: 3.15 },
  { id: "soymilk", name: "Soy milk", co2: 0.98 },
  { id: "coffee", name: "Coffee beans", co2: 28.53 },
  { id: "rice", name: "Rice (dry)", co2: 4.45 },
  { id: "bread", name: "Bread / flatbread", co2: 1.57 },
  { id: "noodles", name: "Wheat noodles (dry)", co2: 1.57 },
  { id: "oats", name: "Oats", co2: 2.48 },
  { id: "potato", name: "Potatoes", co2: 0.46 },
  { id: "oil", name: "Palm cooking oil", co2: 7.32 },
  { id: "sugar", name: "Sugar", co2: 3.2 },
  { id: "chocolate", name: "Dark chocolate", co2: 46.65 },
  { id: "greens", name: "Leafy greens (kangkung, sawi)", co2: 0.51, fv: true },
  { id: "veg", name: "Mixed vegetables", co2: 0.53, fv: true },
  { id: "rootveg", name: "Carrots", co2: 0.43, fv: true },
  { id: "tomato", name: "Tomatoes", co2: 2.09, fv: true },
  { id: "banana", name: "Bananas", co2: 0.86, fv: true },
  { id: "apple", name: "Apples", co2: 0.43, fv: true },
  { id: "citrus", name: "Oranges", co2: 0.39, fv: true },
  { id: "water", name: "Water", co2: 0 },
  // Canned fish: OWID has no separate canned value, so these use the farmed-fish figure (an over-estimate for sardines)
  { id: "tuna", name: "Canned tuna", co2: 13.63, meat: "fish" },
  { id: "sardines", name: "Canned sardines", co2: 13.63, meat: "fish" },
  { id: "ricenoodle", name: "Rice noodles (kway teow, bihun)", co2: 4.45 },
  { id: "sweetpotato", name: "Sweet potato", co2: 0.46 }
];

// Aisles, in the order you walk a typical supermarket
const AISLES = ["Fruit & vegetables", "Tofu, eggs & dairy", "Meat & fish", "Rice, noodles & dry goods", "Bakery"];

const PACKS = {
  greens: { name: "Kangkung or sawi, 1 bunch", g: 250, rm: 2.0, aisle: 0 },
  veg: { name: "Mixed vegetables (cabbage, long beans), 500 g", g: 500, rm: 4.0, aisle: 0 },
  rootveg: { name: "Carrots, 500 g", g: 500, rm: 3.0, aisle: 0 },
  tomato: { name: "Tomatoes, 500 g", g: 500, rm: 4.0, aisle: 0 },
  banana: { name: "Bananas, 1 kg", g: 1000, rm: 5.0, aisle: 0 },
  apple: { name: "Apples, 4 pack", g: 600, rm: 6.0, aisle: 0 },
  citrus: { name: "Oranges, 4 pack", g: 600, rm: 6.0, aisle: 0 },
  potato: { name: "Potatoes, 1 kg", g: 1000, rm: 4.0, aisle: 0 },
  tofu: { name: "Tofu or tempeh, 300 g", g: 300, rm: 2.2, aisle: 1 },
  eggs: { name: "Eggs, 10 pack", g: 500, rm: 5.5, aisle: 1 },
  milk: { name: "Fresh milk, 1 L", g: 1000, rm: 7.5, aisle: 1 },
  soymilk: { name: "Soy milk, 1 L", g: 1000, rm: 4.5, aisle: 1 },
  chicken: { name: "Chicken, 1 kg", g: 1000, rm: 11.0, aisle: 2 },
  fish: { name: "Fish (ikan kembung), 500 g", g: 500, rm: 9.0, aisle: 2 },
  beef: { name: "Local beef, 500 g", g: 500, rm: 18.92, aisle: 2, src: "dosm" },
  rice: { name: "Local white rice, 1 kg", g: 1000, rm: 2.6, aisle: 3, src: "rice" },
  noodles: { name: "Dry noodles, 400 g", g: 400, rm: 3.0, aisle: 3 },
  oats: { name: "Rolled oats, 500 g", g: 500, rm: 6.5, aisle: 3 },
  beans: { name: "Dhal lentils, 500 g", g: 500, rm: 4.5, aisle: 3 },
  peanuts: { name: "Peanuts, 200 g", g: 200, rm: 3.0, aisle: 3 },
  oil: { name: "Cooking oil, 1 kg packet", g: 1000, rm: 2.5, aisle: 3 },
  sugar: { name: "Sugar, 1 kg", g: 1000, rm: 2.85, aisle: 3 },
  bread: { name: "Wholemeal bread, 400 g loaf", g: 400, rm: 3.8, aisle: 4 },
  tuna: { name: "Canned tuna, 150 g", g: 150, rm: 4.5, aisle: 3 },
  sardines: { name: "Canned sardines in tomato sauce, 425 g", g: 425, rm: 6.5, aisle: 3 },
  ricenoodle: { name: "Dry kway teow or bihun, 400 g", g: 400, rm: 3.0, aisle: 3 },
  sweetpotato: { name: "Sweet potatoes, 1 kg", g: 1000, rm: 5.0, aisle: 0 }
};

// Venues — used for wording and icons
const VENUES = {
  kopitiam: "Kopitiam", mamak: "Mamak", cafeteria: "Campus cafeteria", fastfood: "Fast food",
  stall: "Hawker stall", home: "Your kitchen", hostel: "Your room", cafe: "Café", night: "Pasar malam", store: "Convenience store"
};

const MEALS = [
  // ---- Bought meals (prices are estimates unless marked dosm) ----
  { id: "nasilemak", short: "the nasi lemak", name: "Nasi lemak bungkus", slots: ["B", "L"], source: "buy", venue: "stall", price: 3.68, priceSrc: "dosm",
    recipe: [{ id: "rice", g: 75 }, { id: "eggs", g: 25 }, { id: "peanuts", g: 15 }, { id: "fish", g: 10 }, { id: "veg", g: 20 }, { id: "oil", g: 5 }] },
  { id: "roticanai", short: "the roti canai", name: "Roti canai ×2 with dhal", slots: ["B", "D", "S"], source: "buy", venue: "mamak", price: 3.5,
    recipe: [{ id: "bread", g: 160 }, { id: "beans", g: 30 }, { id: "oil", g: 15 }] },
  { id: "kayatoast", short: "the kaya toast set", name: "Kaya toast + 2 half-boiled eggs", slots: ["B"], source: "buy", venue: "kopitiam", price: 5.5, sugary: true,
    recipe: [{ id: "bread", g: 80 }, { id: "eggs", g: 100 }, { id: "sugar", g: 15 }] },
  { id: "chickenrice", short: "the chicken rice", name: "Chicken rice", slots: ["L", "D"], source: "buy", venue: "stall", price: 9,
    recipe: [{ id: "rice", g: 75 }, { id: "chicken", g: 100 }, { id: "veg", g: 20 }, { id: "oil", g: 5 }] },
  { id: "ecorice", short: "chicken economy rice", name: "Economy rice: 2 veg + fried chicken", slots: ["L", "D"], source: "buy", venue: "cafeteria", price: 8,
    recipe: [{ id: "rice", g: 75 }, { id: "veg", g: 160 }, { id: "chicken", g: 80 }, { id: "oil", g: 15 }] },
  { id: "ecoricetofu", short: "tofu economy rice", name: "Economy rice: 2 veg + tofu", slots: ["L", "D"], source: "buy", venue: "cafeteria", price: 6,
    recipe: [{ id: "rice", g: 75 }, { id: "veg", g: 160 }, { id: "tofu", g: 80 }, { id: "oil", g: 10 }] },
  { id: "ecoriceegg", short: "egg economy rice", name: "Economy rice: 2 veg + egg", slots: ["L", "D"], source: "buy", venue: "cafeteria", price: 6,
    recipe: [{ id: "rice", g: 75 }, { id: "veg", g: 160 }, { id: "eggs", g: 50 }, { id: "oil", g: 10 }] },
  { id: "meegoreng", short: "the mee goreng", name: "Mee goreng mamak", slots: ["L", "D", "S"], source: "buy", venue: "mamak", price: 8, salty: true,
    recipe: [{ id: "noodles", g: 100 }, { id: "eggs", g: 50 }, { id: "tofu", g: 20 }, { id: "veg", g: 40 }, { id: "oil", g: 15 }] },
  { id: "maggigoreng", short: "the maggi goreng", occasion: true, name: "Maggi goreng + teh tarik", slots: ["S"], source: "buy", venue: "mamak", price: 9.5, salty: true, sugary: true,
    recipe: [{ id: "noodles", g: 80 }, { id: "eggs", g: 50 }, { id: "veg", g: 30 }, { id: "oil", g: 15 }, { id: "milk", g: 70 }, { id: "sugar", g: 15 }] },
  { id: "chapati", short: "the chapati", name: "Chapati ×2 with dhal and vegetables", slots: ["D", "L"], source: "buy", venue: "mamak", price: 6,
    recipe: [{ id: "bread", g: 120 }, { id: "beans", g: 60 }, { id: "veg", g: 80 }] },
  { id: "yongtaufoo", short: "the yong tau foo", name: "Yong tau foo soup (6 pieces)", slots: ["L", "D"], source: "buy", venue: "stall", price: 9, salty: true,
    recipe: [{ id: "tofu", g: 80 }, { id: "fish", g: 40 }, { id: "greens", g: 80 }, { id: "noodles", g: 60 }] },
  { id: "rendang", short: "the rendang", name: "Beef rendang with rice", slots: ["L", "D"], source: "buy", venue: "stall", price: 12,
    recipe: [{ id: "rice", g: 75 }, { id: "beef", g: 100 }, { id: "oil", g: 10 }] },
  { id: "burgermeal", short: "the burger meal", occasion: true, name: "Burger meal with fries and a soft drink", slots: ["L", "D"], source: "buy", venue: "fastfood", price: 18, sugary: true, salty: true,
    recipe: [{ id: "beef", g: 100 }, { id: "bread", g: 70 }, { id: "potato", g: 120 }, { id: "oil", g: 20 }, { id: "sugar", g: 40 }] },
  { id: "friedchicken", short: "the fried chicken set", occasion: true, name: "Korean fried chicken set", slots: ["D"], source: "buy", venue: "cafe", price: 24, salty: true, sugary: true,
    recipe: [{ id: "chicken", g: 250 }, { id: "rice", g: 75 }, { id: "oil", g: 30 }, { id: "sugar", g: 20 }] },
  { id: "pizzashare", short: "the pizza", occasion: true, name: "Pizza, shared four ways (2 slices)", slots: ["D"], source: "buy", venue: "fastfood", price: 15, salty: true,
    recipe: [{ id: "bread", g: 150 }, { id: "cheese", g: 50 }, { id: "chicken", g: 30 }, { id: "tomato", g: 30 }] },
  { id: "satay", short: "the satay", occasion: true, name: "Chicken satay ×10 with nasi impit", slots: ["D"], source: "buy", venue: "night", price: 12.4, priceSrcNote: "satay at RM1.09 a stick (DOSM 2024) + nasi impit",
    recipe: [{ id: "chicken", g: 150 }, { id: "rice", g: 60 }, { id: "peanuts", g: 30 }, { id: "sugar", g: 10 }, { id: "veg", g: 30 }] },
  { id: "fruitpack", short: "the fruit pack", occasion: true, name: "Cut fruit pack + roti john half", slots: ["D"], source: "buy", venue: "night", price: 9,
    recipe: [{ id: "banana", g: 100 }, { id: "apple", g: 100 }, { id: "citrus", g: 100 }, { id: "bread", g: 100 }, { id: "eggs", g: 50 }] },
  { id: "brunchcafe", short: "the café brunch", occasion: true, name: "Café brunch: eggs on sourdough + latte", slots: ["L"], source: "buy", venue: "cafe", price: 32,
    recipe: [{ id: "bread", g: 120 }, { id: "eggs", g: 100 }, { id: "milk", g: 200 }, { id: "coffee", g: 18 }, { id: "tomato", g: 40 }] },
  { id: "dimsum", short: "the dim sum", occasion: true, name: "Dim sum, 4 baskets shared", slots: ["L"], source: "buy", venue: "stall", price: 16,
    recipe: [{ id: "prawns", g: 40 }, { id: "chicken", g: 60 }, { id: "bread", g: 120 }, { id: "greens", g: 40 }] },
  { id: "storenoodles", short: "the cup noodles", maxWeek: 2, name: "Cup noodles from 7-Eleven", slots: ["D", "S"], source: "buy", venue: "store", price: 3.2, salty: true,
    recipe: [{ id: "noodles", g: 70 }, { id: "oil", g: 15 }] },
  { id: "rahmah", short: "the Menu Rahmah set", rahmah: true, name: "Menu Rahmah set: rice, chicken and vegetables", slots: ["L", "D"], source: "buy", venue: "cafeteria", price: 5, priceSrc: "rahmah",
    recipe: [{ id: "rice", g: 75 }, { id: "chicken", g: 60 }, { id: "veg", g: 80 }, { id: "oil", g: 8 }] },
  { id: "skip", short: "skipping", name: "Skip the meal", slots: ["B", "L", "D", "S"], source: "buy", venue: "hostel", price: 0, recipe: [] },

  // ---- Kettle meals (hostel-friendly) ----
  { id: "oatsbanana", short: "oats", steps: ["Pour 50 g oats into a mug", "Add hot water from the kettle, stir, wait 3 minutes", "Slice a banana on top"], name: "Oats with banana", slots: ["B"], source: "kettle", venue: "hostel",
    recipe: [{ id: "oats", g: 50 }, { id: "banana", g: 120 }] },
  { id: "oatssoy", short: "overnight oats", steps: ["Night before: 50 g oats + 200 ml soy milk in a jar", "Fridge overnight", "Morning: chop an apple on top"], name: "Overnight oats with soy milk and apple", slots: ["B"], source: "kettle", venue: "hostel",
    recipe: [{ id: "oats", g: 50 }, { id: "soymilk", g: 200 }, { id: "apple", g: 150 }] },
  { id: "breadpeanut", short: "bread and peanut butter", steps: ["Two slices of wholemeal bread (no toaster needed)", "Spread with peanut butter (or crushed peanuts)", "Slice a banana on top"], name: "Wholemeal bread with peanut butter and banana", slots: ["B", "S"], source: "kettle", venue: "hostel",
    recipe: [{ id: "bread", g: 80 }, { id: "peanuts", g: 30 }, { id: "banana", g: 120 }] },
  { id: "instantnoodles", short: "instant noodles", steps: ["Boil the kettle", "Noodles in a bowl, cover with water for 3 minutes", "Use half the seasoning sachet to cut the salt"], maxWeek: 2, name: "Instant noodles in your room", slots: ["L", "D", "S"], source: "kettle", venue: "hostel", salty: true,
    recipe: [{ id: "noodles", g: 70 }, { id: "oil", g: 15 }] },

  // ---- Fruit snacks (the planner adds them when the budget allows) ----
  { id: "bananasnack", short: "a banana", snack: true, name: "Banana", slots: ["S"], source: "kettle", venue: "hostel", recipe: [{ id: "banana", g: 120 }] },
  { id: "applesnack", short: "an apple", snack: true, name: "Apple", slots: ["S"], source: "kettle", venue: "hostel", recipe: [{ id: "apple", g: 150 }] },
  { id: "orangesnack", short: "an orange", snack: true, name: "Orange", slots: ["S"], source: "kettle", venue: "hostel", recipe: [{ id: "citrus", g: 150 }] },

  // ---- Cooked meals (need a stove) ----
  { id: "eggfriedrice", short: "egg fried rice", prep: { min: 25, keeps: 2 }, steps: ["Cook rice, ideally the day before (cold rice fries better)", "Scramble 2 eggs in a little oil, add chopped vegetables for 3 min", "Add the rice and a splash of soy sauce, fry 5 min"], name: "Egg fried rice with vegetables", slots: ["L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "rice", g: 75 }, { id: "eggs", g: 100 }, { id: "veg", g: 120 }, { id: "oil", g: 10 }] },
  { id: "chickenstirfry", short: "the chicken stir-fry", prep: { min: 35, keeps: 3 }, steps: ["Cook the rice; slice chicken into strips", "Fry chicken 6–8 min until cooked through", "Add vegetables and sauce, fry 3 min; box with rice"], name: "Chicken and vegetable stir-fry with rice", slots: ["L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "rice", g: 75 }, { id: "chicken", g: 100 }, { id: "veg", g: 150 }, { id: "oil", g: 10 }] },
  { id: "tofukangkung", short: "tofu and kangkung", prep: { min: 30, keeps: 2 }, steps: ["Cook the rice; cube and pan-fry the tofu until golden", "Fry garlic and chilli 1 min, add kangkung for 2 min (belacan is shrimp paste: leave it out if vegetarian)", "Combine and season with soy sauce; box with rice"], name: "Tofu with chilli-garlic kangkung and rice", slots: ["L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "rice", g: 75 }, { id: "tofu", g: 150 }, { id: "greens", g: 160 }, { id: "oil", g: 10 }] },
  { id: "dhalrice", short: "dhal and rice", prep: { min: 40, keeps: 4 }, steps: ["Rinse 80 g dhal per portion; simmer 20 min with turmeric", "Add chopped carrot and tomato, simmer 10 min more", "Cook rice while it simmers; box together"], name: "Dhal curry with carrots and rice", slots: ["L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "rice", g: 75 }, { id: "beans", g: 80 }, { id: "rootveg", g: 100 }, { id: "tomato", g: 60 }, { id: "oil", g: 10 }] },
  { id: "fishcurry", short: "the fish curry", prep: { min: 40, keeps: 2 }, steps: ["Fry curry paste in oil 2 min, add water and tomato", "Add the fish, simmer 10–12 min", "Blanch the greens 2 min; serve with rice"], name: "Ikan kembung curry with rice and greens", slots: ["L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "rice", g: 75 }, { id: "fish", g: 120 }, { id: "greens", g: 120 }, { id: "tomato", g: 40 }, { id: "oil", g: 10 }] },
  { id: "noodlesoup", short: "noodle soup", prep: { min: 15, keeps: 1 }, steps: ["Boil water with a vegetable stock cube", "Add noodles and sawi, cook 3–4 min", "Crack in an egg, stir gently 1 min"], name: "Noodle soup with egg and sawi", slots: ["L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "noodles", g: 90 }, { id: "eggs", g: 50 }, { id: "greens", g: 120 }] },
  { id: "eggtoast", short: "eggs on toast", prep: { min: 10, keeps: 0 }, steps: ["Toast the bread", "Scramble 2 eggs in a little oil over low heat", "Serve with sliced tomato"], name: "Scrambled eggs on toast with tomato", slots: ["B"], source: "cook", venue: "home",
    recipe: [{ id: "bread", g: 80 }, { id: "eggs", g: 100 }, { id: "tomato", g: 80 }, { id: "oil", g: 5 }] },


  // ---- Everyday meals used only by "Pick for me" (pickOnly: never in generated plans or the week game).
  //      Prices are Klang Valley estimates for 2026; everyone can enter their own under My prices. ----
  { id: "wantanmee", pickOnly: true, short: "the wantan mee", name: "Wantan mee (dry, with char siu)", slots: ["L", "D"], source: "buy", venue: "stall", price: 8, salty: true,
    recipe: [{ id: "noodles", g: 100 }, { id: "pork", g: 50 }, { id: "greens", g: 40 }, { id: "oil", g: 8 }] },
  { id: "charkwayteow", pickOnly: true, short: "the char kway teow", name: "Char kway teow", slots: ["L", "D"], source: "buy", venue: "stall", price: 9, salty: true,
    recipe: [{ id: "ricenoodle", g: 120 }, { id: "prawns", g: 30 }, { id: "eggs", g: 50 }, { id: "veg", g: 40 }, { id: "oil", g: 15 }] },
  { id: "currylaksa", pickOnly: true, short: "the curry laksa", name: "Curry laksa", slots: ["L", "D"], source: "buy", venue: "stall", price: 9.5, salty: true,
    recipe: [{ id: "noodles", g: 100 }, { id: "chicken", g: 50 }, { id: "tofu", g: 30 }, { id: "veg", g: 50 }, { id: "oil", g: 10 }] },
  { id: "nasikandar", pickOnly: true, short: "the nasi kandar", name: "Nasi kandar: chicken and 2 vegetables", slots: ["L", "D"], source: "buy", venue: "mamak", price: 10, salty: true,
    recipe: [{ id: "rice", g: 90 }, { id: "chicken", g: 100 }, { id: "veg", g: 80 }, { id: "oil", g: 15 }] },
  { id: "thosai", pickOnly: true, short: "the thosai", name: "Thosai ×2 with sambar and chutney", slots: ["B", "L", "D"], source: "buy", venue: "mamak", price: 4,
    recipe: [{ id: "rice", g: 70 }, { id: "beans", g: 50 }, { id: "veg", g: 50 }, { id: "oil", g: 6 }] },
  { id: "bihungoreng", pickOnly: true, short: "the bihun goreng", name: "Bihun goreng with egg", slots: ["B", "L"], source: "buy", venue: "stall", price: 4.5,
    recipe: [{ id: "ricenoodle", g: 80 }, { id: "eggs", g: 25 }, { id: "veg", g: 40 }, { id: "oil", g: 10 }] },
  { id: "nasigorengkg", pickOnly: true, short: "nasi goreng kampung", name: "Nasi goreng kampung with fried egg", slots: ["L", "D"], source: "buy", venue: "stall", price: 7.5, salty: true,
    recipe: [{ id: "rice", g: 80 }, { id: "eggs", g: 50 }, { id: "fish", g: 15 }, { id: "greens", g: 50 }, { id: "oil", g: 12 }] },
  { id: "chickenporridge", pickOnly: true, short: "chicken porridge", name: "Chicken porridge", slots: ["B", "L", "D"], source: "buy", venue: "stall", price: 6,
    recipe: [{ id: "rice", g: 50 }, { id: "chicken", g: 60 }, { id: "greens", g: 20 }] },
  { id: "panmee", pickOnly: true, short: "the pan mee", name: "Pan mee soup with ikan bilis and sayur manis", slots: ["L", "D"], source: "buy", venue: "stall", price: 8.5, salty: true,
    recipe: [{ id: "noodles", g: 100 }, { id: "eggs", g: 25 }, { id: "fish", g: 15 }, { id: "greens", g: 60 }, { id: "chicken", g: 30 }] },
  { id: "rotitelur", pickOnly: true, short: "the roti telur", name: "Roti telur with dhal", slots: ["B", "D", "S"], source: "buy", venue: "mamak", price: 3,
    recipe: [{ id: "bread", g: 80 }, { id: "eggs", g: 50 }, { id: "beans", g: 30 }, { id: "oil", g: 12 }] },
  { id: "tunasandwich", pickOnly: true, short: "the tuna sandwich", name: "Tuna sandwich from a convenience store", slots: ["B", "L", "S"], source: "buy", venue: "store", price: 5.5,
    recipe: [{ id: "bread", g: 90 }, { id: "tuna", g: 40 }, { id: "veg", g: 15 }] },
  { id: "onigiri", pickOnly: true, short: "the onigiri", name: "Tuna mayo onigiri ×2", slots: ["B", "L", "S"], source: "buy", venue: "store", price: 7,
    recipe: [{ id: "rice", g: 180 }, { id: "tuna", g: 40 }] },
  { id: "bananaleaf", pickOnly: true, short: "banana leaf rice", name: "Banana leaf rice, vegetarian", slots: ["L"], source: "buy", venue: "stall", price: 9,
    recipe: [{ id: "rice", g: 110 }, { id: "veg", g: 160 }, { id: "beans", g: 40 }, { id: "oil", g: 15 }] },
  { id: "ecoriceveg", pickOnly: true, short: "veg economy rice", name: "Economy rice: 3 vegetables", slots: ["L", "D"], source: "buy", venue: "cafeteria", price: 5,
    recipe: [{ id: "rice", g: 75 }, { id: "veg", g: 120 }, { id: "greens", g: 80 }, { id: "oil", g: 12 }] },
  { id: "tunabread", pickOnly: true, short: "tuna on bread", steps: ["Drain half a can of tuna", "Mix with chopped tomato and a little pepper", "Pile onto two slices of wholemeal bread"], name: "Tuna and tomato on wholemeal bread", slots: ["B", "L"], source: "kettle", venue: "hostel",
    recipe: [{ id: "bread", g: 80 }, { id: "tuna", g: 75 }, { id: "tomato", g: 60 }] },
  { id: "sardinebread", pickOnly: true, short: "sardines on bread", steps: ["Open a can of sardines in tomato sauce", "Mash a third of the can with a fork, bones and all (that's the calcium)", "Spread on two slices of wholemeal bread with sliced cucumber or tomato"], name: "Sardines on wholemeal bread", slots: ["B", "L", "D"], source: "kettle", venue: "hostel",
    recipe: [{ id: "bread", g: 80 }, { id: "sardines", g: 140 }, { id: "tomato", g: 50 }] },
  { id: "omeletterice", pickOnly: true, short: "the omelette rice", prep: { min: 15, keeps: 1 }, steps: ["Cook or reheat rice", "Beat 2 eggs with chopped vegetables and a pinch of salt", "Fry 3 minutes a side over medium heat; serve on the rice"], name: "Vegetable omelette with rice", slots: ["B", "L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "rice", g: 75 }, { id: "eggs", g: 100 }, { id: "veg", g: 80 }, { id: "oil", g: 8 }] },
  { id: "sardinerice", pickOnly: true, short: "sardine rice", prep: { min: 15, keeps: 2 }, steps: ["Cook rice; slice an onion and a chilli", "Fry the onion 3 min, add a can of sardines in tomato sauce, break them up, simmer 5 min", "Serve on rice with blanched sawi or cucumber"], name: "Sardines in tomato sauce with rice and greens", slots: ["L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "rice", g: 75 }, { id: "sardines", g: 140 }, { id: "greens", g: 100 }, { id: "oil", g: 5 }] },
  { id: "tempehrice", pickOnly: true, short: "tempeh and greens", prep: { min: 20, keeps: 2 }, steps: ["Cook rice; slice tempeh thinly", "Pan-fry tempeh in a little oil until golden, 5–6 min", "Stir-fry the greens with garlic 2 min; serve together"], name: "Pan-fried tempeh with greens and rice", slots: ["L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "rice", g: 75 }, { id: "tofu", g: 120 }, { id: "greens", g: 120 }, { id: "oil", g: 12 }] },
  { id: "kicapchicken", pickOnly: true, short: "ayam masak kicap", prep: { min: 35, keeps: 3 }, steps: ["Brown chicken pieces with garlic and onion, 6 min", "Add kicap, a little water and sliced cabbage; simmer 15 min until cooked through", "Serve with rice"], name: "Ayam masak kicap with cabbage and rice", slots: ["L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "rice", g: 75 }, { id: "chicken", g: 120 }, { id: "veg", g: 120 }, { id: "oil", g: 10 }, { id: "sugar", g: 5 }] },
  { id: "aglioolio", pickOnly: true, short: "aglio olio", prep: { min: 15, keeps: 1 }, steps: ["Boil spaghetti 9–10 min; keep a cup of the water", "Fry sliced garlic and chilli in oil 1 min, add greens for 2 min", "Toss with the pasta, a splash of pasta water and a fried egg on top"], name: "Spaghetti aglio olio with greens and egg", slots: ["L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "noodles", g: 100 }, { id: "eggs", g: 50 }, { id: "greens", g: 100 }, { id: "oil", g: 15 }] },
  { id: "abcsoup", pickOnly: true, short: "ABC soup", prep: { min: 45, keeps: 3 }, steps: ["Simmer chicken pieces in water 15 min, skim the top", "Add chunks of potato, carrot and tomato; simmer 25 min", "Season and serve with rice (drink the soup: that's where the vitamins went)"], name: "ABC soup with chicken and rice", slots: ["L", "D"], source: "cook", venue: "home",
    recipe: [{ id: "rice", g: 60 }, { id: "chicken", g: 80 }, { id: "potato", g: 80 }, { id: "rootveg", g: 80 }, { id: "tomato", g: 60 }] },
  { id: "sweetpotatoegg", pickOnly: true, short: "sweet potato and eggs", prep: { min: 25, keeps: 2 }, steps: ["Steam or boil a sweet potato 20 min (skin on)", "Boil 2 eggs 9 min", "Eat with a banana or any fruit"], name: "Sweet potato, boiled eggs and fruit", slots: ["B"], source: "cook", venue: "home",
    recipe: [{ id: "sweetpotato", g: 150 }, { id: "eggs", g: 100 }, { id: "banana", g: 100 }] },

  // ---- Drinks (simulation only) ----
  { id: "tehtarik", short: "teh tarik", name: "Teh tarik", slots: ["X"], source: "buy", venue: "mamak", price: 2.5, sugary: true,
    recipe: [{ id: "milk", g: 70 }, { id: "sugar", g: 15 }] },
  { id: "kopiokosong", short: "kopi-O kosong", name: "Kopi-O kosong (no sugar)", slots: ["X"], source: "buy", venue: "kopitiam", price: 1.8,
    recipe: [{ id: "coffee", g: 7 }] },
  { id: "icedmilo", short: "iced Milo", name: "Iced Milo", slots: ["X"], source: "buy", venue: "kopitiam", price: 4, sugary: true,
    recipe: [{ id: "milk", g: 100 }, { id: "sugar", g: 20 }] },
  { id: "bubbletea", short: "bubble tea", name: "Brown sugar bubble tea", slots: ["X"], source: "buy", venue: "cafe", price: 11, sugary: true,
    recipe: [{ id: "milk", g: 250 }, { id: "sugar", g: 40 }] },
  { id: "water", short: "water", name: "Water from your bottle", slots: ["X"], source: "buy", venue: "hostel", price: 0, recipe: [{ id: "water", g: 500 }] }
];

// ---------- Allergens, emoji, time and how filling each meal is ----------
// Allergen groups follow Malaysia's Food Regulations 1985, reg. 11(1) (gluten cereals, peanut and soy, tree nuts,
// fish incl. crustaceans and molluscs, milk, eggs), with sesame added, and shellfish split into crustaceans and molluscs
// because people are often allergic to one and not the other (as in EU Regulation 1169/2011, Annex II).
// Packaged food must declare these; stall and café food has no label, so for bought meals "may" lists what the
// dish usually or often contains (sambal belacan, soy sauce, oyster sauce, ghee). Always ask the seller.
const ALLERGENS = [
  { id: "gluten", name: "Gluten", hint: "wheat, barley, oats; most soy sauce" },
  { id: "peanut", name: "Peanuts", hint: "incl. kuah kacang, sambal with kacang" },
  { id: "treenut", name: "Tree nuts", hint: "cashew, almond, candlenut" },
  { id: "soy", name: "Soy", hint: "tofu, tempeh, soy sauce" },
  { id: "fish", name: "Fish", hint: "incl. ikan bilis, fish sauce, fish cake" },
  { id: "crustacean", name: "Prawn & crab", hint: "incl. belacan, dried shrimp" },
  { id: "mollusc", name: "Squid & cockles", hint: "clams, oyster sauce" },
  { id: "egg", name: "Eggs", hint: "incl. mayonnaise, egg noodles" },
  { id: "milk", name: "Milk", hint: "incl. ghee, condensed milk" },
  { id: "sesame", name: "Sesame", hint: "seeds and sesame oil" }
];
const ALLERGEN_IDS = ALLERGENS.map(a => a.id);
const ING_ALLERGENS = {
  bread: ["gluten"], noodles: ["gluten"], oats: ["gluten"], eggs: ["egg"], milk: ["milk"], cheese: ["milk"],
  peanuts: ["peanut"], tofu: ["soy"], soymilk: ["soy"], fish: ["fish"], tuna: ["fish"], sardines: ["fish"], prawns: ["crustacean"]
};
// Shorthands for the sauces and pastes that hide allergens in stall food
const BELACAN = "crustacean", OYSTER = "mollusc";
const BUFFET = ["soy", "gluten", BELACAN, OYSTER, "fish", "egg", "peanut", "milk", "sesame"]; // economy rice trays: anything can be on them
// id: [emoji, minutes to get or make it, fill (1 light – 3 very filling), extra "contains", "may contain"]
const MEAL_META = {
  nasilemak: ["🍛", 10, 2, [BELACAN], []],
  roticanai: ["🫓", 10, 2, [], ["milk", "egg", "fish", BELACAN]],
  kayatoast: ["🍞", 10, 1, ["milk"], ["soy"]],
  chickenrice: ["🍗", 10, 2, ["soy", "gluten", "sesame"], [OYSTER]],
  ecorice: ["🍱", 10, 3, ["gluten"], BUFFET],
  ecoricetofu: ["🍱", 10, 2, [], BUFFET],
  ecoriceegg: ["🍱", 10, 2, [], BUFFET],
  meegoreng: ["🍝", 10, 2, ["soy"], [BELACAN, OYSTER, "fish"]],
  maggigoreng: ["🍜", 15, 2, ["soy"], [BELACAN]],
  chapati: ["🫓", 10, 2, [], ["milk"]],
  yongtaufoo: ["🥣", 10, 2, [], [BELACAN, OYSTER, "egg", "sesame"]],
  rendang: ["🍛", 10, 3, [], []],
  burgermeal: ["🍔", 15, 3, ["milk", "egg", "sesame"], ["soy"]],
  friedchicken: ["🍗", 25, 3, ["soy", "sesame", "gluten"], ["egg", "peanut", "milk"]],
  pizzashare: ["🍕", 30, 2, [], ["egg", "soy"]],
  satay: ["🍢", 15, 2, [], ["soy", BELACAN]],
  fruitpack: ["🍉", 15, 2, [], ["milk"]],
  brunchcafe: ["🥐", 40, 2, [], []],
  dimsum: ["🥟", 40, 2, ["soy", "egg"], ["sesame", "fish", OYSTER]],
  storenoodles: ["🍜", 5, 1, ["soy"], [BELACAN, "egg", "milk", "fish"]],
  rahmah: ["🍱", 10, 2, [], BUFFET],
  skip: ["⏭️", 0, 0, [], []],
  oatsbanana: ["🥣", 5, 2, [], []],
  oatssoy: ["🥣", 5, 2, [], []],
  breadpeanut: ["🥜", 5, 2, [], []],
  instantnoodles: ["🍜", 5, 1, ["soy"], [BELACAN, "egg", "fish"]],
  bananasnack: ["🍌", 1, 1, [], []],
  applesnack: ["🍎", 1, 1, [], []],
  orangesnack: ["🍊", 2, 1, [], []],
  eggfriedrice: ["🍳", 20, 2, ["soy", "gluten"], []],
  chickenstirfry: ["🥘", 25, 3, ["soy", "gluten"], [OYSTER]],
  tofukangkung: ["🥬", 20, 2, ["gluten"], [BELACAN]],
  dhalrice: ["🍛", 40, 3, [], []],
  fishcurry: ["🐟", 30, 3, [], [BELACAN]],
  noodlesoup: ["🍜", 15, 2, [], ["soy", "milk"]],
  eggtoast: ["🍳", 10, 2, [], ["milk"]],
  wantanmee: ["🍜", 10, 2, ["egg", "soy"], [BELACAN, OYSTER, "sesame"]],
  charkwayteow: ["🍝", 10, 2, ["soy", "gluten", OYSTER], ["fish"]],
  currylaksa: ["🍜", 10, 3, [BELACAN], ["fish", "egg", OYSTER, "treenut"]],
  nasikandar: ["🍛", 15, 3, [], ["milk", "fish", BELACAN, OYSTER, "peanut", "sesame", "egg", "gluten", "treenut"]],
  thosai: ["🫓", 10, 2, [], ["milk", "peanut"]],
  bihungoreng: ["🍝", 5, 2, ["soy"], [BELACAN, "gluten", "fish"]],
  nasigorengkg: ["🍳", 10, 3, [BELACAN], ["soy"]],
  chickenporridge: ["🥣", 10, 1, ["soy"], ["gluten", "sesame"]],
  panmee: ["🍜", 10, 2, [], ["soy", BELACAN, OYSTER]],
  rotitelur: ["🫓", 10, 2, [], ["milk", "fish", BELACAN]],
  tunasandwich: ["🥪", 5, 1, ["egg"], ["milk", "soy"]],
  onigiri: ["🍙", 5, 1, ["egg", "soy"], ["gluten", "sesame"]],
  bananaleaf: ["🍛", 15, 3, [], ["milk", "fish", "gluten"]],
  ecoriceveg: ["🥗", 10, 2, [], BUFFET],
  tunabread: ["🥪", 5, 2, [], []],
  sardinebread: ["🐟", 5, 2, [], []],
  omeletterice: ["🍳", 15, 2, [], []],
  sardinerice: ["🐟", 15, 3, [], []],
  tempehrice: ["🥬", 20, 2, [], []],
  kicapchicken: ["🍗", 35, 3, ["soy", "gluten"], []],
  aglioolio: ["🍝", 15, 2, [], []],
  abcsoup: ["🥣", 45, 2, [], []],
  sweetpotatoegg: ["🍠", 25, 2, [], []],
  tehtarik: ["🥤", 5, 0, [], []],
  kopiokosong: ["☕", 5, 0, [], ["milk"]],
  icedmilo: ["🥤", 5, 0, ["gluten", "soy"], []],
  bubbletea: ["🧋", 10, 0, [], ["soy"]],
  water: ["💧", 0, 0, [], []]
};
MEALS.forEach(m => {
  const x = MEAL_META[m.id];
  if (!x) throw new Error("No meta for meal " + m.id);
  const fromRecipe = new Set();
  (m.recipe || []).forEach(p => (ING_ALLERGENS[p.id] || []).forEach(a => fromRecipe.add(a)));
  m.emoji = x[0]; m.min = x[1]; m.fill = x[2];
  m.contains = [...new Set([...fromRecipe, ...x[3]])];
  m.may = x[4].filter(a => !m.contains.includes(a));
});

const FV_TARGET_G = 400;   // WHO: at least 400 g of fruit and vegetables a day
const SOURCES = {
  OWID: { name: "Poore & Nemecek (2018), via Our World in Data", url: "https://ourworldindata.org/grapher/ghg-per-kg-poore" },
  WHO_D: { name: "WHO — Healthy diet fact sheet", url: "https://www.who.int/news-room/fact-sheets/detail/healthy-diet" },
  WHO_S: { name: "WHO — Guideline: sugars intake for adults and children", url: "https://www.who.int/publications/i/item/9789241549028" },
  UNEP: { name: "UNEP Food Waste Index Report 2024", url: "https://wedocs.unep.org/bitstream/handle/20.500.11822/45275/Food-Waste-Index-2024-key-messages.pdf?sequence=4" },
  NHMS23: { name: "NHMS 2023 Fact Sheet, Ministry of Health Malaysia", url: "https://iku.moh.gov.my/images/nhms2023/fact-sheet-nhms-2023.pdf" },
  NHMS24: { name: "CodeBlue on NHMS 2024 (key findings)", url: "https://codeblue.galencentre.org/2025/06/nhms-reveals-just-how-bad-malaysian-diets-are/" },
  DOSM: { name: "DOSM CPI 2024 average prices, via Malay Mail (30 Apr 2025)", url: "https://www.malaymail.com/news/malaysia/2025/04/30/from-roti-canai-to-satay-beloved-malaysian-foods-see-prices-nearly-double-over-13-years-says-dosm/174999" },
  RICE: { name: "Malay Mail, local white rice held at RM2.60/kg (13 Jul 2026)", url: "https://www.malaymail.com/news/malaysia/2026/07/13/malaysia-has-six-months-rice-supply-local-white-rice-price-held-at-rm260kg-says-economy-minister/227456" },
  SWCORP: { name: "The Star, citing SWCorp (2021)", url: "https://thestar.com.my/news/nation/2021/05/20/daily-food-waste-staggering" },
  RAHMAH: { name: "Malay Mail: Menu Rahmah operators reach 3,210 premises as of July 2026 (Aug 2026)", url: "https://www.malaymail.com/news/malaysia/2026/08/16/menu-rahmah-operators-nationwide-reach-3210-as-of-july-says-deputy-minister/231508" },
  RAHMAHCAMPUS: { name: "Bernama: UTM introduces RM5 Menu Siswa Rahmah at 14 campus cafés (30 Sep 2025)", url: "https://www.bernama.com/en/news.php?id=2473091" },
  RAHMAHPRICE: { name: "Selangor Journal: students on RM5 Menu Rahmah meals at campus cafés (Jul 2023)", url: "https://selangorjournal.my/2023/07/ipt-students-hope-menu-rahmah-initiative-will-continue" },
  PLATE: { name: "IMU: the Malaysian Healthy Plate (2025)", url: "https://imu.edu.my/imunews/eating-healthy-with-the-malaysian-healthy-plate/" },
  PLATECOST: { name: "CodeBlue: a Healthy Plate meal averages RM12.60 (Sep 2025)", url: "https://codeblue.galencentre.org/?p=62115" },
  IFTHEN: { name: "Melum & Martiny-Huenger (2026), implementation intentions and fruit & veg intake", url: "https://link.springer.com/article/10.1186/s12966-026-01915-y" },
  SURPLUS: { name: "SAYS: buying restaurant surplus at a discount (Mar 2026)", url: "https://says.com/my/lifestyle/malaysians-way-buy-restaurant-meals-for-a-discount" },
  CPI2025: { name: "DOSM (2026), Analysis of Annual Consumer Price Index 2025", url: "https://www.dosm.gov.my/portal-main/release-content/analysis-of-annual-consumer-price-index-malaysia-2025" },
  FOODINSEC: { name: "Malaysian Journal of Nutrition (2019): food insecurity among university students", url: "https://www.nutriweb.org.my/mjn/publication/25-1/f.pdf" }
};

// A transparent reference for footprints: a simple, mostly plant-based student day,
// built from the same data. Used only as a yardstick, never as a target.
const REFERENCE_DAY = ["oatsbanana", "ecoricetofu", "dhalrice"];

const ingredientById = id => INGREDIENTS.find(i => i.id === id) || null;
const mealById = id => MEALS.find(m => m.id === id) || null;
const round2 = n => Math.round(n * 100) / 100;

// ---------- My prices (local overrides) ----------
const PRICE_OVERRIDES = { meals: {}, packs: {} };
const PRICE_MIN = 0.1;
const PRICE_MAX = 200;
// Accepts { meals: { id: rm }, packs: { id: rm } }; anything unknown or out of range is dropped.
function cleanPriceOverrides(raw) {
  const out = { meals: {}, packs: {} };
  if (!raw || typeof raw !== "object") return out;
  const num = v => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) ? Number(v) : NaN;
  const ok = v => Number.isFinite(num(v)) && num(v) >= PRICE_MIN && num(v) <= PRICE_MAX;
  Object.keys(raw.meals || {}).forEach(id => { const m = mealById(id); if (m && m.source === "buy" && m.id !== "skip" && m.id !== "water" && ok(raw.meals[id])) out.meals[id] = round2(num(raw.meals[id])); });
  Object.keys(raw.packs || {}).forEach(id => { if (PACKS[id] && ok(raw.packs[id])) out.packs[id] = round2(num(raw.packs[id])); });
  return out;
}
function setPriceOverrides(raw) {
  const c = cleanPriceOverrides(raw);
  PRICE_OVERRIDES.meals = c.meals;
  PRICE_OVERRIDES.packs = c.packs;
  return c;
}
// Shop price of a bought meal (with the student's own price if they set one)
function mealPrice(meal) {
  if (!meal || meal.source !== "buy") return 0;
  return Object.prototype.hasOwnProperty.call(PRICE_OVERRIDES.meals, meal.id) ? PRICE_OVERRIDES.meals[meal.id] : meal.price;
}
// Price of one grocery pack
function packPrice(id) {
  const pack = PACKS[id];
  if (!pack) return 0;
  return Object.prototype.hasOwnProperty.call(PRICE_OVERRIDES.packs, id) ? PRICE_OVERRIDES.packs[id] : pack.rm;
}

// Cost of one serving of a kettle/cooked meal from grocery pack prices
function ingredientCost(recipe) {
  return (recipe || []).reduce((sum, part) => {
    const pack = PACKS[part.id];
    return sum + (pack ? part.g * packPrice(part.id) / pack.g : 0);
  }, 0);
}

// Malaysian Healthy Plate ("suku-suku separuh"): half fruit and vegetables, a quarter carbs,
// a quarter protein. We check the plate by weight: fruit & veg at least ~40% of the food,
// plus some carbohydrate and some protein. A guide, not a nutrition score.
const CARB_IDS = ["rice", "bread", "noodles", "oats", "potato", "ricenoodle", "sweetpotato"];
const FRUIT_IDS = ["banana", "apple", "citrus"];
const PROTEIN_IDS = ["beef", "lamb", "prawns", "fish", "pork", "chicken", "eggs", "tofu", "beans", "peanuts", "cheese", "tuna", "sardines"];
function healthyPlate(meal) {
  const parts = (meal.recipe || []).filter(p => !["oil", "sugar", "water", "coffee", "milk", "soymilk"].includes(p.id));
  const total = parts.reduce((s, p) => s + p.g, 0);
  if (!total) return false;
  const fv = parts.filter(p => (ingredientById(p.id) || {}).fv).reduce((s, p) => s + p.g, 0);
  const carb = parts.some(p => CARB_IDS.includes(p.id));
  const protein = parts.some(p => PROTEIN_IDS.includes(p.id));
  // The plate is half vegetables *and* fruit: a sandwich with a banana on the side isn't a plate meal
  const veg = parts.some(p => (ingredientById(p.id) || {}).fv && !FRUIT_IDS.includes(p.id));
  return carb && protein && veg && fv / total >= 0.4;
}

// Per-serving stats: rm, co2 (kg), fv (g), sugary, salty, meat kinds
function mealStats(meal) {
  let co2 = 0, fv = 0;
  const meats = new Set();
  (meal.recipe || []).forEach(part => {
    const ing = ingredientById(part.id);
    if (!ing) throw new Error("Unknown ingredient: " + part.id);
    co2 += ing.co2 * part.g / 1000;
    if (ing.fv) fv += part.g;
    if (ing.meat) meats.add(ing.meat);
  });
  const rm = meal.source === "buy" ? mealPrice(meal) : ingredientCost(meal.recipe);
  return { rm: round2(rm), co2: Math.round(co2 * 1000) / 1000, fv, sugary: !!meal.sugary, salty: !!meal.salty, meats: [...meats] };
}

// Diet rules: halal excludes pork; vegetarian excludes all meat and fish (eggs and dairy are fine);
// no beef excludes beef; allergies exclude any meal that contains OR may contain the allergen (strict on purpose).
function fitsDiet(meal, diet) {
  const { meats } = mealStats(meal);
  if (diet && diet.halal !== false && meats.includes("pork")) return false;
  if (diet && diet.vegetarian && meats.length > 0) return false;
  if (diet && diet.noBeef && (meal.recipe || []).some(p => p.id === "beef")) return false;
  if (diet && Array.isArray(diet.allergies) && diet.allergies.length && allergenHits(meal, diet.allergies).length) return false;
  return true;
}
// Which of these allergens the meal contains or may contain: [{ id, sure }]
function allergenHits(meal, allergies) {
  return (allergies || []).filter(a => (meal.contains || []).includes(a) || (meal.may || []).includes(a))
    .map(a => ({ id: a, sure: (meal.contains || []).includes(a) }));
}
const allergenName = id => (ALLERGENS.find(a => a.id === id) || { name: id }).name;

// Kitchen rules: hostel = kettle only; shared/home = full kitchen
const KITCHENS = {
  hostel: { name: "Hostel room, kettle only", allows: ["buy", "kettle"] },
  shared: { name: "Shared kitchen", allows: ["buy", "kettle", "cook"] },
  home: { name: "Living at home", allows: ["buy", "kettle", "cook"] }
};
function fitsKitchen(meal, kitchen) {
  const k = KITCHENS[kitchen] || KITCHENS.hostel;
  return k.allows.includes(meal.source);
}

function referenceDay() {
  return REFERENCE_DAY.map(id => mealStats(mealById(id))).reduce((a, s) => ({ rm: a.rm + s.rm, co2: a.co2 + s.co2, fv: a.fv + s.fv }), { rm: 0, co2: 0, fv: 0 });
}

if (typeof module !== "undefined") {
  module.exports = {
    INGREDIENTS, PACKS, AISLES, VENUES, MEALS, KITCHENS, FV_TARGET_G, SOURCES, REFERENCE_DAY, PRICE_OVERRIDES, PRICE_MIN, PRICE_MAX,
    ingredientById, mealById, ingredientCost, mealStats, fitsDiet, fitsKitchen, referenceDay, round2,
    cleanPriceOverrides, setPriceOverrides, mealPrice, packPrice, healthyPlate,
    ALLERGENS, ALLERGEN_IDS, ING_ALLERGENS, allergenHits, allergenName, MEAL_META
  };
}
