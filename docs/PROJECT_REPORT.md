> v1.5 update: alignment, scrolling and Plan layout corrections are documented in LAYOUT_V1.5.md. The project contains 146 unit tests and 59 end-to-end tests, plus main-page and tour audits. Current results: VALIDATION_V1.5.md. Historical review claims below refer to the original release.

# Makan Apa? — Project Report

**Can't decide what to eat? One pick, with the reasons.** Makan Apa? ("what to eat?") picks one meal that fits your budget, allergies, halal or vegetarian rules, kitchen, the time you have, what's at home and what you've already eaten today. Not a list of fifty options: one pick, why it fits, and two backups. Along the way it teaches you about food, and every fact carries its evidence level and source.

It works offline, can be installed as an app, has no accounts and does no tracking. Everything stays on the device.

> **Origin.** Makan Apa? started from *Eat For Tomorrow*, a hackathon game by team Keluar (Ling2609 and sevenpluseight). Versions 2–10 of Eat For Tomorrow and all of Makan Apa? were built by Low Wei Ling independently; the other contributor was not involved. The earlier report is kept at [`EFT_V10_REPORT.md`](EFT_V10_REPORT.md).

---

## 1. Problem statement

Every day, several times a day, a student has to answer *"makan apa?"*: what to eat, or what to cook. The answer has to fit:
- **money** (how much is left this week),
- **allergies and food rules** (halal, vegetarian, no beef, peanuts, prawns hidden in sambal belacan),
- **resources** (a kettle in a hostel room, or a stove; 5 minutes or 30; what's in the fridge; whether lunch is on campus),
- **nutrition** (has there been any fruit or veg today?), and
- **variety** (not the same thing as yesterday).

Weighing all of that for every meal is tiring, so people default to whatever is nearest: another cup noodles, another delivery with fees, or skipping the meal.

The research says the problem is real and specific:
- **Too many options hurt most when people are unsure what they want and want to save effort.** A meta-analysis of 99 results found that choice overload grows with preference uncertainty and an effort-minimising goal ([Chernev, Böckenholt & Goodman, 2015](https://www.kellogg.northwestern.edu/faculty/research/detail/2015/when-product-assortment-leads-to-choice-overload-a-conceptual)). That is exactly "makan apa?" at 7 p.m.
- **Money is tight.** In one Malaysian study, 54.4% of university students were food insecure, linked to spending on books, parents' income and time constraints ([Mal J Nutr 2019, n = 307](https://www.nutriweb.org.my/mjn/publication/25-1/f.pdf)). Rising living costs are Malaysians' top worry (58%), and 42% have started tracking what they spend ([UOB ASEAN Consumer Sentiment Study 2025](https://www.uob.com.sg/assets/web-resources/asean-insights/pdf/acss-2025-malaysia-report.pdf)).
- **Diets fall short.** 95.1% of Malaysian adults eat fewer than five servings of fruit and vegetables a day ([NHMS 2023](https://iku.moh.gov.my/images/nhms2023/fact-sheet-nhms-2023.pdf)).
- **Food myths and "superfoods" mislead.** "Foods that clash" (食物相克) warnings are widely shared, and imported "superfoods" like kale and blueberries cost five to ten times more than local foods with similar or better nutrients per ringgit.

**In one sentence:** students who are tired of deciding what to eat need one trustworthy pick that already accounts for their money, allergies, kitchen and day, plus honest, sourced food knowledge instead of myths and marketing.

## 2. Target users

| Group | Who | What they get |
|---|---|---|
| **Primary** | Students and young adults aged 18–24 in Malaysia who buy their own food: hostel rooms with only a kettle, shared kitchens, or living at home. Especially people who find choosing tiring (选择困难). | One pick per meal with the reasons, in ringgit, respecting allergies and halal rules; a day that adds up (money left, fruit and veg so far) |
| **Secondary** | People with food allergies, and friend groups choosing where to eat | Strict allergen filtering (including hidden allergens in stall food), and one group pick that works for everyone's rules and budget |
| **Also useful for** | Student-affairs and wellness offices, lecturers, parents | Evidence-labelled food facts, myth-busting, smart local swaps, and the practice-week game for a class activity |

## 3. Solution

| Feature | What it does |
|---|---|
| **Pick for me** (the core) | One meal for breakfast, lunch, dinner or a snack, chosen from about 60 everyday Malaysian meals (stalls, mamak, campus cafés, convenience stores, kettle-only and stove meals). Shows the price, the time, up to three reasons ("Fits the RM 6.00 you have for this meal", "160 g of fruit and veg (0 of 400 g so far today)", "No peanuts, prawn & crab in the usual recipe") and what the usual recipe contains. Two different backups, and **Surprise me**. |
| **Not this** | Say why, and the next pick takes it into account: *too pricey* (it finds something cheaper, or says this is already the cheapest), *not in the mood* (gone for today), *don't have the stuff* (only meals from what's at home), *never suggest this*. |
| **Adjust** | Time (5 / 15 / 30 min / any), buy or cook, light or filling, and **what's at home** (24 everyday items). Home-made picks only count what you'd still have to buy. Weekday lunch on campus means things to buy, unless you packed lunch. |
| **I'll eat this** | Logs the meal. Home shows **Today** (each meal, money left this week, fruit and veg so far against WHO's 400 g) and the next pick fits the rest of the day. Undo puts back whatever was there before. |
| **Eating with friends** | Everyone's allergies, food rules and price limit together, then one place that works for all of you (stall, mamak, café; no convenience-store sandwich for a group meal). |
| **Learn** | 7 tiles, one card per screen: **I want…** (healthier eyes, less tired, stronger bones, better digestion, muscle on a budget, blood pressure, steady energy; foods cheapest and easiest first, with *"Too pricey or hard to find?"* jumping to a cheaper food), **Smart swaps** (kale → kailan, blueberries → guava, salmon → ikan kembung, with where the local food *loses*), **Myth or real?** (食物相克 tested), **Cook it better**, **Unsung local heroes** (冷知识), **Which has more?** (a quiz built from the nutrient data) and **Plate check** (suku-suku separuh). |
| **Plan my week** | The weekly planner from Eat For Tomorrow, now split into Week, Cook ahead, Shopping list and Weak moment, each fitting one screen, with day and aisle chips on phones. |
| **More** | Plan check-in, receipt scanning (on-device OCR), My real week, stall price notes, class mode, and the **practice week** game. |

Every screen is designed to fit one phone screen (390 × 844) and one desktop screen; anything longer moves to its own page.

## 4. Wow features

1. **One pick, with reasons, that knows your day.** The pick changes after lunch: more vegetables if you've had none, nothing fried twice, never the same thing twice in a day, inside the money left.
2. **Allergy-strict, including hidden allergens.** Ten allergen groups (Malaysia's Food Regulations 1985 reg. 11 list, with sesame added and shellfish split into prawn/crab and squid/cockles). Stall dishes carry "often contains" lists (sambal belacan, oyster sauce, ghee, kuah kacang), and any meal that contains *or often contains* your allergen is never suggested: not in picks, plans, the practice game, the group pick or the log list.
3. **Evidence labels on every fact.** *Strong* (guideline, systematic review, official food table), *Some* (human study), *Lab only*, or *Myth*, each with a link. Myths are labelled myths: durian + crab, prawns + vitamin C. Real cautions are there too: durian + alcohol (lab), tea with an iron-rich meal.
4. **Smart swaps in ringgit.** Per 100 g *and* per ringgit, with KPDN PriceCatcher or named-shop prices and dates. The data also says where the local food loses (kale has more fibre than watercress).
5. **Eating with friends** in one tap, respecting everyone's allergies.

## 5. Research & evidence

### 5.1 Why this design

| Decision | Evidence |
|---|---|
| One pick, not a list | Choice overload is strongest with preference uncertainty and an effort-minimising goal ([Chernev et al. 2015](https://www.kellogg.northwestern.edu/faculty/research/detail/2015/when-product-assortment-leads-to-choice-overload-a-conceptual)) |
| Money is the hard limit, health the score, planet a bonus | Gen Z rank taste (4.67/5), price (4.40) and own health (4.33) above environment (3.50) ([Nutrients 2025, n = 650, Poland](https://pmc.ncbi.nlm.nih.gov/articles/PMC11820165)); Malaysian student food insecurity 54.4% ([Mal J Nutr 2019](https://www.nutriweb.org.my/mjn/publication/25-1/f.pdf)) |
| No reflex mini-games for adults; real goals, progress and feedback instead | Game elements raised activity (g = 0.42) but the effect shrank by follow-up (g = 0.15) ([Mazeas et al., JMIR 2022, 16 RCTs](https://www.jmir.org/2022/1/E26779/)) |
| Allergen labels can't be relied on for stall food | Malaysia requires allergen declarations on *packaged* food (Food Regulations 1985 reg. 11(1), [ChemLinked](https://food.chemlinked.com/expert-article/how-to-label-food-allergen-information-for-the-malaysian-market)); unpackaged food has no label, so the app shows what dishes usually contain and asks you to check with the seller |
| Fruit and veg target | [WHO healthy diet fact sheet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet): at least 400 g a day |
| Healthy Plate | [Malaysian Healthy Plate (IMU)](https://imu.edu.my/imunews/eating-healthy-with-the-malaysian-healthy-plate/): half fruit and veg, a quarter carbs, a quarter protein |

### 5.2 Food facts (Learn)

All in `js/knowledge.json` and `js/swapsdata.json`, built into `js/knowledge.js` by `npm run data`. 7 goals (36 foods, 18 cautions), 10 swaps, 13 food pairings (5 real cautions, 3 good pairs, 5 myths), 10 cooking tips and 15 unsung heroes, plus 20 foods with sourced nutrients per 100 g and Malaysian prices. Main sources:
- Nutrients: [USDA FoodData Central](https://fdc.nal.usda.gov/) (official record links), [Malaysian Food Composition Database (MyFCD)](https://myfcd.moh.gov.my/), Philippine FCT for ikan kembung.
- Guidance: [NIH Office of Dietary Supplements](https://ods.od.nih.gov/) fact sheets, [National Eye Institute AREDS/AREDS2](https://nei.nih.gov/research/clinical-trials/age-related-eye-disease-studies-aredsareds2/about-areds-and-areds2), WHO.
- Studies: Hurrell et al. 1999 (tea and iron, [doi](https://doi.org/10.1017/S0007114599000537)), Maninang et al. 2009 (durian and alcohol, lab, [doi](https://doi.org/10.1016/j.foodchem.2009.03.106)), Canter & Ernst 2004 (bilberry and night vision, [PubMed](https://pubmed.ncbi.nlm.nih.gov/14711439/)), and others listed on each card.
- Prices: KPDN PriceCatcher (via calculatormalaysia.com, Oct 2026), named supermarket and online-shop listings with dates.

An independent fact-check spot-checked about 30 claims and 10 foods against their sources; its corrections (lutein study used *enriched* eggs, lutein's AREDS2 role, a wrong multiplier, mirror links, levels that were too generous, and egg prices) are all applied.

**Corrections the research made to the owner's ideas** (kept honest on purpose):
- Kale vs 西洋菜 (watercress): per 100 g, kale has more of every nutrient listed, including fibre (4.1 vs 0.5 g). Watercress wins per ringgit on calcium and vitamins A, C and K. The closest local swap for kale is **kailan** (same species, about a fifth of the price).
- Blueberry → 猪肝 (pig liver): not a match. Blueberries' pigment (anthocyanins) is in pulut hitam and bunga telang; vitamin C is far cheaper in guava. Liver is rich in vitamin A (with an upper-limit caution); pig liver isn't halal, so chicken liver is suggested.
- 食物相克: most "clashing" pairs (durian + crab) have no evidence of harm; a few real cautions are shown instead.

## 6. How a pick is made (`js/makan.js`)

1. **Hard filters:** meal time slot, kitchen (kettle-only meals in hostels), diet (halal, vegetarian, no beef), allergens (contains *or* often contains), time limit, buy/cook, "never" and "not now" lists, and cost to buy ≤ money left this week.
2. **Score:** fit to this meal's money (a day's share of the weekly budget: breakfast 20%, lunch 35%, dinner 35%, snack 10%), fruit and veg still missing today, Healthy Plate, salty or sugary food already eaten today, variety (eaten today −4, yesterday −2), uses what's at home, mood, time, a small footprint nudge, and a little day-seeded chance so picks vary. The weekly-plan goal (money, health, planet) weights these.
3. **Answer:** the best meal, two backups that differ in way of eating or main protein, up to three plain reasons, the allergen line and a matching tip. If nothing fits, the reason in words with a one-tap fix.

## 7. SDLC

| Phase | What was done |
|---|---|
| Requirements | Owner interviews over several sessions (the "messy, no tour guide, no real target" feedback; the 选择困难 target; evidence-only rule; fit one screen); research on choice overload, food insecurity, gamification and allergen law |
| Design | One-pick card, evidence labels, one card per screen, the original Eat For Tomorrow gradient kept as the wordmark; two rounds of independent UI critique |
| Implementation | Plain HTML/CSS/JS, no build step; pure logic modules (`makan.js`, `foods.js`, `planner.js`, `checkin.js`, `sim.js`) separate from screens |
| Testing | 146 unit tests and 59 end-to-end tests (below); two rounds of independent code review and one fact-check; every critical and high finding fixed |
| Deployment | Not in scope. It's a static site: any static host works, with HTTPS needed for install and offline mode |

## 8. Testing

```bash
npm run test:unit    # 146 unit tests
npm run test:e2e     # 59 end-to-end tests (set CHROMIUM_PATH or run `npx playwright install chromium` first)
```

- **146 unit tests**, including:
  - an allergen sweep: every pick and backup for 14 allergy sets × 2 kitchens × 4 diets × 4 meals × 3 modes × 2 seeds, never breaking an allergy, halal, vegetarian or no-beef rule;
  - the practice week played to the end for 15 allergy sets × 2 kitchens × 2 diets × 3 strategies, never serving or selling an allergen;
  - money never over what's left, variety, time and mood filters, the meal budget, the eaten log and Monday weeks, group picks, quiz answers checked against the data, the Plate check;
  - the knowledge data: built from its sources, every item has an evidence level and an https link, no mirror links, myths labelled myths, the kale and watercress fact kept honest;
  - the earlier Eat For Tomorrow planner, check-in, receipt, class-code and stall tests.
- **59 end-to-end tests** in Chromium:
  - first run, pick → eat → Home → remove;
  - allergies in the browser (no pick, backup or log option ever shows an allergen);
  - "Too pricey" chains, friends with the edit panel, Learn pagers, "too pricey or hard to find?", the quiz;
  - every Makan Apa? screen fitting a 390 × 844 phone;
  - every screen at 360, 390, 768, 1024 and 1440 px in light and dark, checked with axe (no serious or critical issues), no sideways scroll, no clipped text and 44 px touch targets;
  - plus the earlier flows: the plan, check-in, receipts with real OCR, stalls, class mode, offline updates and print.

## 9. Honest limits

- **Prices** are Klang Valley estimates for 2026 unless a source is shown; anyone can enter their own under My prices.
- **Allergens** for stall food are what the dish *usually* contains. Recipes vary, so the app says to ask the seller. It is a filter, not a guarantee, and not medical advice.
- **The meal list** has about 60 meals. It's enough for variety across a week but is not every dish in Malaysia; anything else can be logged by name and price.
- **Nutrition** is tracked as fruit and veg grams, Healthy Plate, salty and sugary flags, not full calories or micronutrients.
- **Evidence labels** summarise the cited source; some sources are news reports of studies, and the label says so.
- **No server:** nothing syncs between devices, and friends' rules are not saved.

## 10. Credits

Makan Apa? by Low Wei Ling. Started from [Eat For Tomorrow](https://github.com/sevenpluseight/eat-for-tomorrow), a hackathon game by team Keluar (Ling2609 and sevenpluseight); this version was rebuilt independently. MIT licence.
