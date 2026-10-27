# v1.5

Correct viewport-aligned tour highlights and rounded control outlines, live scroll/resize/font/image refresh, a fixed header with one content scroller, consistent Plan statistics and meal rows, usable narrow day controls, full-width narrow money fields, compact game counters, clean modal/menu transitions and print flow. Added geometry and shell regression tests. Sources and details: docs/LAYOUT_V1.5.md.

# v1.4

Required first-use setup welcome and eight-step Makan Mate tour, persistent completion/progress, optional replay in More/Setup, accessible modal spotlight and short-screen support. More expressive food layouts, a custom bowl guide illustration and functional quick/light/cook Home shortcuts. Tour actions leave meal logs, plans and dietary settings untouched. See docs/EXPERIENCE_V1.4.md.

# v1.3

Complete modern-kopitiam visual direction across landing, Home, Pick, Collection, Learn, More and shared app components. Custom local food image, native meal illustrations, editorial typography, short motion with reduced-motion support, coherent dark mode, updated offline assets and share-card branding. Corrected collection eligibility and the mobile plan-menu overlap. See docs/DESIGN_V1.3.md.

# v1.2

Shared UI refinement, meal collection and saved meals. See docs/REFINEMENT_NOTES.md for full details and verification status.

# Changes

## Makan Apa? 1.0 (October 2026)

A new project built on Eat For Tomorrow v10, with a new target: students who can't decide what to eat.

**New**
- **Pick for me:** one meal with reasons, two backups, Surprise me, "Not this" with reasons, Adjust (time, buy/cook, mood, what's at home), campus lunch, I'll eat this with Undo. About 25 new everyday meals (pick-only, so weekly plans are unchanged).
- **Allergens:** ten groups with "contains" and "often contains" for every meal, applied everywhere: picks, plans, the practice week, group picks and the log list. Old saved "shellfish" becomes prawn/crab and squid/cockles.
- **Home:** today's meals, money left this week (from the Pick log, a running plan, and plans remade mid-week), fruit and veg so far, a first-run guide, a daily fact.
- **Eating with friends:** compact list, edit panel, result page.
- **Learn:** goals, smart swaps, myth or real, cook it better, unsung heroes, quiz and plate check, all from sourced data with evidence labels.
- **One screen per page:** Learn cards one at a time; the plan split into Week, Cook ahead, Shopping list and Weak moment, with day and aisle chips on phones; setup in four short steps.
- **Look:** the original gradient as the wordmark, a blue action colour, a smaller type scale, a new landing page.

**Reviews and fixes**
- Round 1 (code review, UI critique, fact-check):
  - allergy-safe practice week (it stalled with gluten or soy allergies), group pick using stale allergies, v10 plans dropped after the update, unplanned snacks not counted, spending lost when a plan ended mid-week, the campus lunch dead end, keyboard focus on meal chips;
  - hidden allergens added (fried chicken gluten; buffet trays; banana leaf rice fish and gluten; yong tau foo sesame; and more), shellfish split;
  - evidence corrections (lutein study used enriched eggs; AREDS2 wording; dhal "16 times"; egg price; official links; two levels lowered).
- Round 2:
  - a ticked meal swapped away no longer crashes Home and Pick, and keeps its money;
  - stale group results;
  - sheets opened from another sheet were blank;
  - spending across remade plans;
  - Undo restores the earlier meal;
  - pager focus and announcements;
  - allergen flags on swaps and heroes;
  - desktop layouts without blank halves;
  - small-phone fits.

**Tests:** 143 unit tests and 52 end-to-end tests.

---

# Eat For Tomorrow history

# v10: Start today stays within budget (latest)

The Round C re-review found that **"Start today" could turn a plan within budget into one over it**: 70 of 2,016 setups (30 of 336 on the RM 70 tight-week preset), e.g. shared kitchen, RM 50, 14 cooks, no breakfast showed "RM 3.48 over … costs more now than when it was made". The rotate-and-reorder step put the cheapest bought meal on day 1 with no budget check, no variety check and no same-day check.

| # | Sev | Finding | Fix | Regression test |
|---|---|---|---|---|
| 1 | High | Start today pushed 70 within-budget plans over budget | `startToday()` (planner): rotate and reorder the reviewed week; if that costs more, repair it with single swaps under the start-today rules; if still over, re-plan the week under them (`candidates` knows the start weekday and which day-1 slots come before the shop). Day-1 breakfast and lunch are bought meals, or kettle meals whose groceries are all at home. If no week started today fits (14 setups: vegetarian, RM 60, 14 cooks, breakfast on), the start sheet says "Starting today costs RM 4.80 more than your RM 60 budget", preselects Next Monday as Recommended, and a plan started anyway stores `cause: "start-today"` so the banner names the start, with the same amount | unit *sweep* (2,016 + 336 starts), *reviewer's case*, *impossible case*; e2e v10 ×2 |
| 2 | Med | The same meal twice on day 1 (nasi lemak for breakfast and lunch) | Breakfast, lunch and dinner on one day are three different meals (`varietyOk`), for every plan, not only started ones; the day-1 fallback picks the cheapest meal that keeps the rules | unit *sweep*, *three different meals* |
| 3 | Med | The variety rule (≤ 3 uses) broke in 22 start-today setups | The day-1 fallback and the repair only accept variety-legal weeks | unit *sweep* |
| 4 | Med | "Save to My prices" mapped "Nasi Lemak Ayam Goreng Berempah RM 9.50" onto the plain nasi lemak bungkus | Prices are picked per line (nothing ticked by default). `priceMatch` says whether a line is the plan's meal ("close": only the name and filler like *bungkus*, *2 x*, *(R)*) or a different dish that contains its name ("loose": flagged "Not the same meal?"); a roti telur no longer prices the roti canai. The tick is kept in the receipt draft | unit *receipt prices*; e2e v10 *receipt* |

**Sweep result** (`tests/v10.test.js`, the reviewer's grid of 3 kitchens × 2 diets × 6 budgets × 4 cooking levels × breakfast on/off × 7 weekdays, plus the tight preset): 0 within-budget plans over budget after Start today, 0 variety breaks, 0 day-1 repeats; 14 genuinely impossible starts, each warned with the exact extra cost.

Tests: 125 unit (was 118), 45 end-to-end (was 42), all passing. Service worker cache: `eft-v12`.

# v9: Round C fixes

v8 was reviewed again (Round C: 18 findings — 1 critical, 2 high, 8 medium, 7 low). v9 fixes all 18; every fix has a regression test (unit `tests/v9.test.js`, browser `tests/e2e/v9.test.js`), and a property test now checks the real-week money flows end to end.

| # | Sev | Finding | Fix | Regression test |
|---|---|---|---|---|
| 1 | Critical | A second receipt linked to the same meal (the drink from the next stall) overwrote the first one's entry: RM lost from Today, and deleting either receipt cleared the whole meal | A linked entry keeps a list of receipts with each one's share (`rids: [{id, rm, label}]`, `linkReceipt`); amounts add up, the same receipt saved again replaces only its own share, deleting a receipt takes off only its share. Old single-`rid` logs are read as a one-receipt list | unit *C1*; e2e *C1* |
| 2 | High | Before a "Next Monday" plan started, the receipt screen had no plan context, so the shop (done days before) couldn't be linked as the week's groceries | Receipts from up to 7 days before the start can link groceries; Today's pre-start screen says "Shop done: RM x … counted in your plan's week" | unit *C2*; e2e *C2* |
| 3 | High | Plan day cards at 360 px split meal names inside words ("Econo-my") because tags and price squeezed the name (`overflow-wrap: anywhere`) | Day cards put tags and price on a line under the full-width name; names wrap only between words (`overflow-wrap: break-word`) | e2e *C3*: every word of every meal name measured with `Range.getClientRects` at 360/390/768 px × 3 kitchens (fails on v8's CSS) |
| 4 | Med | The shop-day receipt counted in the plan's week and again in the week before | The earlier week leaves out the grocery lines of the running plan's linked receipts (`groceriesElsewhere`); its other lines stay there; after saving a linked grocery receipt, My real week opens on the plan's week | unit *C4*; property test (W) |
| 5 | Med | Typed receipts needed two decimals: "8.5", "RM5", "Teh tarik 3" were not read; typed text got photo advice ("misread", "sharper photo") | Typed text takes 0–2 decimals and "RM n" (never on dates); its warnings speak about typing; no "type the total" nag | unit *C5*; e2e *C5 + C18* |
| 6 | Med | The over-budget banner always blamed "your swaps", also when new prices did it | It names the cause: swaps, My prices/stall prices, or both | unit *C6*; e2e *C6* (prices raised, no swaps); v7 *M6* now checks the swap wording |
| 7 | Med | Printed, "HEALTHY PLATE" ran past narrow cells and a stray "·" joined the tags | Print tags stack one per line and wrap inside the cell; no separator | unit *C7*; e2e *C7* (print media, every tag inside its cell; fails on v8's CSS) |
| 8 | Med | Stall prices with a future or pre-2020 date were silently dropped (the form is `novalidate`) | The sheet checks dates with the list's own rule (`isStallDate`), shows an error and focuses the date | unit *C8*; e2e *C8* |
| 9 | Med | A student 1–2 % over budget was stored as "100 %" in the 5 % steps and counted as not over | Over budget always rounds up to at least 105 % | unit *C9* |
| 10 | Med | "Groceries you don't cook are the most common household food waste" was not in the cited UNEP report | Replaced with what the report supports: about 60 % of food wasted worldwide is wasted at home | unit *C10* |
| 11 | Med | "Ate this" kept no price: changing My prices later rewrote Today, My real week and Past weeks | The tick stores the meal's price (`rm`); Past weeks are filed with their numbers frozen (`sums`); older ticks without a price follow today's | unit *C11*; property test (P) |
| 12 | Low | The report named the same priciest pick twice; "Eat a lunchbox you cooked would have been…" | Picks are grouped ("… (RM 14.00, twice)"); "Choosing “…” would have been …" | unit *C12* |
| 13 | Low | "7 Up 2.50" read as seven "Up"; "BOOST JUICE BLENDS" dropped as an e-wallet payment | A leading number is a quantity only before a real word (and never in "7 Up"); "Boost" is a payment unless followed by "Juice" | unit *C13* |
| 14 | Low | Hand-made class codes that passed the checksum showed impossible numbers (quiz 5 of 3, adherence 125 %, P25 above P75) | Every field is range-checked after decoding; such codes are refused with a plain message | unit *C14* |
| 15 | Low | Spends dated in the future (or 30 Feb) were accepted | `validateSpend` needs a real calendar day, not after tomorrow | unit *C15* |
| 16 | Low | README and the report still said 82 unit / 28 e2e tests | Counts updated (118 unit, 42 end-to-end); a unit test counts the tests and checks the docs | unit *C16* |
| 17 | Low | Bare `goo.gl` links (a general URL shortener) were accepted as map links | Only `maps.app.goo.gl` is kept | unit *C17*; v8 *B12* moved `goo.gl` to the refused list |
| 18 | Low | A plan started today could put a kettle breakfast (oats, bread) before the shop; the printed cook-ahead said "(today, after the shop)", stale on paper; a receipt being checked was lost on reload | Day 1's breakfast and lunch are bought meals when the plan starts today (swapped, or the cheapest bought meal); the print names the date; the receipt draft is kept on the device until saved or discarded (lines only, never the raw camera text; dropped after 3 days) | unit *C18* ×3; e2e *C5 + C18* |

**Own adversarial pass over the money flows.** `tests/v9.test.js` → *property*: 400 seeded random weeks of check-in ticks, receipt links, second receipts for a meal, deletes, the shop from a week before the start, hand-ticked groceries, coffees before the start and price changes (> 3,000 states). After every step: My real week = an independent ledger; Today's cash out = My real week minus receipt lines that are no check-in meal; earlier week + plan week = each receipt once; a price change moves no logged money; Past weeks keep their numbers; no entry points at a deleted receipt. It found one more disagreement, fixed here: **"Change it anyway"** on a receipt meal used to leave the receipt standing for that meal, so Today counted the new tick while My real week kept the receipt. Now the receipt's lines stop standing for that meal (`unslotSpends`): the receipt stays in My real week as a spend of its own and the meal counts as ticked, and the card says so before you confirm.

Service worker cache: `eft-v11`.

# v8: Round B fixes

v7 was reviewed again (Round B: 1 critical, 6 high, 9 medium). v8 fixes all 16; every fix has a regression test (unit `tests/v8.test.js`, browser `tests/e2e/v8.test.js`).

| # | Sev | Finding | Fix | Regression test |
|---|---|---|---|---|
| 1 | Critical | Two identical spends (same coffee, same day) got the same content-hash id: the second replaced the first, and deleting one deleted both | New spends get a random 12-character id (`newSpendId`); stored records with a repeated or missing id get a distinct, stable one instead of being dropped | unit *B1*; e2e *B1* (two coffees → RM 4, delete one → RM 2) |
| 2 | High | Money inputs were 5ch wide: "RM 1,234.56" scrolled out of sight | 8ch, flexible, right-aligned figures; price rows 8ch; the quick-spend amount column is wider on phones | e2e *B2* (receipt, quick spend, "something else" at 5 widths) + a new **input-text overflow check** (`scrollWidth > clientWidth` on number/date/money inputs) in every responsive screen, with 1,234.56 typed on the receipt, stall and prices sheets |
| 3 | High | Check-in ↔ receipt double counting and loss: re-ticking a receipt-linked meal added its planned price on top; two lines linked to one meal overwrote each other; deleting a receipt left its check-in entry (uncounted) | Linked check-in entries carry the receipt id (`rid`); receipt lines carry their slot, and My real week never adds a check-in price for a slot a receipt line covers; lines linked to the same meal add up into one entry; deleting a receipt clears what it logged (`unlinkReceipt`), and an entry whose receipt is gone counts instead of vanishing; re-ticking a linked meal asks first, in the card | unit *B3* ×2; e2e *B3…* |
| 4 | High | Deep links died at setup (a shared stall or class link opened the wizard, then dropped the query); the last button always said "Start the week" | Setup carries on to the full link opened, query included, and the button names where it goes ("See my real week"); stall imports and class mode open without a setup (a lecturer's laptop, a friend's phone) | unit *B4*; e2e *B4* |
| 5 | High | A crafted stall link with a huge day number threw (`toISOString` RangeError) and broke the screen | Day numbers must be whole, 0–40000; decoding is wrapped and reports "The link is damaged" | unit *B5* (huge, negative, fractional, junk rows) |
| 6 | High | Stall prices dated in the future were accepted, and won every merge forever | Dates must be real calendar days from 2020 to today (one day of time-zone slack) | unit *B6* |
| 7 | High | Item and stall matching stripped every non-Latin letter: all Chinese/Tamil names became "" and merged into one | Unicode-aware normalisation (NFKC, `\p{L}\p{N}`), with the raw lower-case text as fallback | unit *B7* |
| 8 | Med | First visit reloaded the page as soon as the service worker claimed it | Reload only when a controlled page changes controller (an update), never on the first claim | unit *B8*; **e2e *B8* with service workers enabled**: no reload on first visit, works offline, a new `sw.js` shows the banner without moving the page, "Reload now" reloads exactly once onto the new cache, "Later" leaves the page |
| 9 | Med | A total far from the lines was saved without a word; "Jumlah dibayar" / "Amount paid" were read as totals | In-page check before saving when lines exceed the total by > RM 0.50, or the total exceeds them by > RM 0.50 and > 17 % (more than SST + service charge): save the total, use the lines, or fix them; payment words added | unit *B9*; e2e *B3…* |
| 10 | Med | Challenge meter rendered as an inline span with no size | `.meter` is a block, full width | unit + e2e *B11 + B10* (measured) |
| 11 | Med | Class summary with no finished weeks encoded medians as 0 ("0 % of budget, 0 kg") and compared students with it | Empty values travel as all-ones sentinels and decode to "no data"; comparison rows need class data; the lecturer screen offers no summary until a code has a finished week | unit *B11*; e2e *B11* |
| 12 | Med | Map links allowed any `*.apple.com`, `google.evil…` style hosts | Exact host allow-list; google.com only on `/maps`; no user, password or port | unit *B12* (8 allowed, 9 refused) |
| 13 | Med | A grocery receipt from shopping day (the day before the plan) couldn't link; a second grocery receipt replaced the first | Receipts from day −1 to 6 can link groceries; linked receipts are listed (`groceryRids`) and the grocery amount is their grocery lines added up; Today shows "RM x paid, from 2 receipts" | unit *B13*; e2e *B13* |
| 14 | Med | Tools hub showed the last 7 days of receipts; My real week showed the plan's week with check-in: two different totals | One `weekFor()` feeds both | unit *B14*; e2e *B3…* (same RM 11.30 on both) |
| 15 | Med | Codes pasted with nothing between them were read as one broken code | Split where the next `EFT1-S-` starts; a run without hyphens is split where each part checks out | unit *B15* |
| 16 | Med | Link label always said "today's check-in" for older receipts; tax and service went to "Other"; discounts were categorised on their own words; "NETT CHICKEN" read as a total | Label names the receipt's day; tax, service charge and rounding count as fees; a discount takes its item's category and never links as a meal; "Nett" is a total only on its own or as "Nett total/amount" | unit *B16* |

Service worker cache: `eft-v10`.

# v7: your real week, your stalls, your class

v6 was reviewed again (Round A: 4 high, 12 medium, 9 low; every one reproduced). v7 fixes all 25 and adds three tools for the real week, all still static, offline and private: **receipt scanning → My real week**, **stall price notes** shared by link/QR, and **class mode** with anonymous result codes. A new **Tools** tab holds them.

## Round A findings

| # | Sev | Finding | Fix | Regression test |
|---|---|---|---|---|
| 1 | High | Back trapped after the week ended (`go("report")` pushed history) | Render-time redirects use `location.replace` (`redirect()`) | e2e *H1 + M5* (Back leaves `#week`) |
| 2 | High | "I eat breakfast" off ignored in the week; reports said "of 21" | Breakfast scenes and habit lines skipped; totals carry `meals` (14/21) used by the kitchen card and the prepper label | unit *H2* (3 strategies) |
| 3 | High | Remake / Menu Rahmah fix / tight-week / setup save deleted check-in ticks silently | Every plan removal goes through `dropPlan()`, which files the plan + log under **Past weeks** (Today tab, last 12); actions with ticks ask first in an **in-page banner** ("Remake the plan" / "Keep my plan"); the setup sheet says the ticks move | e2e *H3 + M15*; unit *past weeks* |
| 4 | High | Tight-week preset / food-aid button offered RM 70 plans that can't be kept (hostel, vegetarian) | `tightWeek()` checks feasibility; if RM 70 is impossible the preset uses the cheapest possible week and says so; the food-aid box names the cheapest week and offers the switch only if it is cheaper, otherwise points to food aid | unit *H4* (18 setups); e2e tight-week |
| 5 | Med | Reload on the last result lost the report | Report saved the moment the week ends | e2e *H1 + M5* |
| 6 | Med | After an over-budget swap the "Remake within budget" fix vanished and was off-screen | Feasibility and cheapest cost are saved with the plan; the banner is announced, focused and scrolled into view | e2e *M6 + M7* |
| 7 | Med | Impossible budget blamed "a swap" after any re-render | Same stored values: "The cheapest plan … costs RM x" survives reloads; swap wording only when a within-budget plan exists | e2e *M7* |
| 8 | Med | Corrupted save (`day: 9`) gave a permanent blank screen | `restoreSim` checks day range, slot, label, borrow and fee numbers, and decision shape | unit *M8* (8 corruptions) |
| 9 | Med | Cook-ahead "yesterday"; grocery reminder after Monday breakfast | `prepSessions(plan, earliest)` (0 for start-today); start-today plans move cooked breakfasts/lunches off day 1 and re-order for freshness by real weekday; `.ics` shop is the morning before (or the next hour today) | unit *M9* (7 weekdays) |
| 10 | Med | Fresh food not early; noodle soup as a campus lunchbox | Swap-based freshness ordering within each row (cost unchanged, never loses a fruit-and-veg day), cooked meals can trade with bought ones; campus lunchboxes must keep ≥ 2 days; freeze tip for chicken/fish cooked from day 4 | unit *M10* (18 setups × 3 budgets) |
| 11 | Med | Default plan left RM 47 unspent with 3 fruit-and-veg days | Money goal stops rewarding savings below 75 % of the budget (a ringgit there counts ⅕) and weighs fruit-and-veg shortfall 2.5× more, salty/sugary more | unit *M11*: default plan now RM 88.78, 6 of 7 days at 400 g |
| 12 | Med | Belacan and stock cube in vegetarian plans | Chilli-garlic kangkung (belacan flagged as shrimp paste), vegetable stock cube | unit *M12* |
| 13 | Med | Menu Rahmah campus claim unsupported | Note now says "capped at RM5; 3,210 premises by July 2026; UTM runs RM5 student menus at 14 campus cafés", citing Bernama (Sep 2025); Malay Mail title corrected | unit *M13* |
| 14 | Med | "Honest answers make next week's plan better" was false | Now true: `carryOver(ev, plan, log)` adds the dry ingredients of skipped/replaced home meals; the sentence says exactly that | unit *M14* |
| 15 | Med | Chosen check-in day stuck all session | Reset on every route change and when a plan starts | e2e *H3 + M15* |
| 16 | Med | Planner froze the page ~1 s on slow phones | Results cached per setup + prices (`planFor`), preview debounce 350 ms | (perf; cache exercised by every e2e) |
| 17 | Low | "Not in your kitchen: beans, rootveg" | Plain names via `ingredientName` | unit *L17* |
| 18 | Low | PB-banana toast was "Healthy Plate" and a kettle "toast" | Healthy Plate needs a vegetable; renamed "Wholemeal bread with peanut butter and banana" | unit *L18* |
| 19 | Low | If-then "a third of a portion" | "About a quarter" (paper: MD 0.29) | — |
| 20 | Low | Empty "Grocery shop (RM 0.00)" reminder | Only when something must be bought | unit *L20* |
| 21 | Low | 15 vs 16 decisions | "16 decisions (15 if you skip breakfast)" everywhere | — |
| 22 | Low | Old version served once after deploy | Precache with `cache: "reload"`; new versions wait and a **"New version ready – Reload now"** banner switches; vendor files in their own cache | unit *sw* |
| 23 | Low | Misleading settings test name | Settings test kept; the real confirm flow now has its own test (*H3*) | — |
| 24 | Low | "Almost double" nasi lemak | "up 81% on 2011 (RM2.03)" | unit *M13 + L24* |
| 25 | Low | Plan cell squeezed by tags at 390 px | Tags on their own line | responsive e2e |

## New: three tools for the real week

**A. Receipt → My real week.** Take or choose a photo; **Tesseract.js 5 (LSTM-only core + English data) is vendored in `/vendor`** and runs in a Web Worker on the phone: the photo is downscaled, greyscaled, contrast-stretched, read and discarded (canvas zeroed, object URL revoked). Total engine size **≈ 7.1 MB**, loaded only on first scan and then cached by the service worker. The parser (`js/receipt.js`) handles Malaysian receipts: RM amounts with OCR slips (O/0, S/5, l/1, "8,50", "8. 50", trailing SR/Z codes), quantity forms (`2 x … @3.20`, qty and unit columns, `x1`), SST/service tax, service charge, cash rounding adjustment, discounts, payment lines ignored, wrapped item names, and Malay words (Jumlah, Tunai, Baki, Cukai, Pelarasan). Lines are categorised (meal/drink/snack/groceries/fees/other) and matched to app meals or grocery packs. The **confirm screen** never auto-trusts: every line is editable/removable, the sum is compared with the printed total and differences are flagged; meals can be linked to today's check-in slot (stored as "something else" at the real price, marked `src: receipt` so nothing is counted twice), grocery receipts can tick "groceries bought" at the real amount, and comparable meal prices can be saved to My prices (×2 for roti/chapati sets). Paste-text and a quick "add a spend" form use the same pipeline. **My real week** shows spend vs budget and plan, by kind and by day, biggest items, saved receipts with delete, earlier/later weeks, and plain tips the numbers support (drinks share, fees, most regular buy).

**B. Class mode without a server.** Students make an anonymous **result code** (`EFT1-S-[TAG-]XXXXX-…`, ~33 chars, Crockford base32, CRC-16) + QR: week cost as % of budget (5 % steps), budget band, kg CO₂e, fruit-and-veg days, archetype, quiz score, swaps, check-in adherence, kitchen, goal, and a random nonce for duplicate detection. The screen lists exactly what the code holds. Lecturers paste codes from chat or forms, upload a CSV or QR photos, or scan QR codes with the camera (BarcodeDetector, jsQR fallback); duplicates, other class tags, summary codes and broken codes are reported. The class view shows medians and ranges, over-budget share, histograms (cost, CO₂e, fruit-and-veg days, archetypes, quiz), a **group challenge** with progress, CSV download, and a **class summary code** students import to compare privately. Small-class (< 5) warning.

**C. Stall price notes.** Stalls with area, optional https map link and dated prices; shared as a link (data after `#`, never sent to a server) and QR; friends see a preview banner, then merge (same stall by id or name + area; per item the newest date wins). "Use in My prices" applies the newest comparable price per meal. The UI says plainly that it's personal notes, not a live community map.

## Numbers

- Unit tests: **82** (48 → 82: 34 new in `tests/v7.test.js`), all passing.
- E2E tests: **28** (20 → 28: 8 new in `tests/e2e/v7.test.js`, including a real OCR run on a receipt image), plus every new screen added to the 5-width × light/dark sweep (axe, overflow, 44 px targets). All passing.

# v6: a tool that bites back

v5 was reviewed (21 findings) as a good idea with a soft simulation, a plan that wasted budget and mobile chrome that ate the screen. v6 fixes every finding and adds the strongest features from the research pass.

## The 21 critique findings

| # | Finding | Fix |
|---|---|---|
| 1 | Budget never bit: you could spend past zero | Options you can't afford are **locked with the reason** ("Only RM 2.02 left"); a banner offers **Borrow RM 20 from a housemate** (max RM 40, next week starts short); when nothing is affordable you can always skip. Spending can never pass budget + borrowed (unit fuzz + e2e) |
| 2 | Habit meals changed the money silently | Every result shows a **Meanwhile** list of the meals your habits filled, and **Change since your last decision**. The HUD change equals the choice plus the listed lines (unit test over 9 profiles, e2e on 9 decisions) |
| 3 | Use-it-up dinner was a 1,250 g, 6.9 kg CO₂e plate | Capped per food group (grain 100 g, protein 120 g, fruit & veg 250 g), perishables first; leftover fresh food reported as binned |
| 4 | Report was a wall of panels | **Wrapped cards, one big number each** (money, CO₂e, fruit & veg days, the habit worth changing, kitchen, guesses); swipe carousel on phones, 2–3 columns on desktop |
| 5 | Share image text overflowed | Every line is measured and shrunk or wrapped (`fitText`); test asserts each width ≤ its box, including the longest archetype |
| 6 | Desktop rail CSS leaked onto phones | Rail only ≥ 1024 px; "Week so far" table only ≥ 761 px |
| 7 | Mobile chrome took ~150 px | **56 px top bar + labelled bottom tab bar** (Week, Plan, Today, Setup), hidden during onboarding; **fixed Next bar** above it |
| 8 | Day strip and tables jumped ahead on the result screen | Display stays on the decided day until Next |
| 9 | Comparison table overflowed at 360 px | Becomes a labelled list below 600 px; overflow test now checks cells, prices and values at every width |
| 10 | Comparisons used long names and RM 0 for home food | Short names; home food compared at ingredient cost |
| 11 | Curveballs looked like other scenes | Kunyit **Curveball bar** with **At stake: RM x**; every scene shows the stake |
| 12 | HUD said "kg" without CO₂e | HUD reads "4.09 kg CO₂e"; single line, icons dropped below 400 px |
| 13 | Mono everywhere | Inter tabular figures; mono only on receipts. Heading weights 680/620/600 |
| 14 | Plan header had five equal buttons | **One primary** (Start / Today's check-in) + **More** menu; one-line setup summary with Change |
| 15 | Over-budget plan had no way out | YNAB-style **Fix it** banner: Remake within budget, Use Menu Rahmah meals, Cook more or change budget |
| 16 | Plan repeated meals 5–7× and left budget idle | **Max three times per meal** (breakfast too), lunch ≠ dinner; spare budget buys **fruit snacks** on days short of 400 g (≤ 92 % of budget); health plan uses most of the budget for 6–7 fruit & veg days |
| 17 | No help actually cooking | **Cook-ahead plan**: sessions with day, minutes, portions, which days they cover (respecting how long food keeps), and ≤ 3-step recipes; steps also on each check-in card |
| 18 | Print layout broke | A4 rules: no buttons, small prices, plain tags, empty tick boxes, cook-ahead and if-then cards, no forced page break |
| 19 | Check-in maths compared groceries with meals | Like-for-like over **logged meals only**: planned cost (stall price or ingredient cost) vs real cost; cash out (groceries included) shown separately; concrete "Tomorrow's dhal curry is already in your kitchen" |
| 20 | Sheets scrolled the page, used browser validation, centred lists | Body scroll locked; `novalidate` + in-page errors that clear on edit; left-aligned pick list, nowrap prices, labelled deltas (Cost / CO₂e / Fruit & veg), sticky actions |
| 21 | Dark mode surfaces flat; landing receipt didn't add up | Raised dark surface tokens and dark-text check icon; landing receipt now sums to RM 112.40 (Fri–Sun line added, surcharge shown as "of which"), wider stat column, 3 product thumbnails, aligned footer, useful waiting/empty states |

Also: setup is a **four-step wizard** with a pinned summary and a live preview; plans started mid-week are **rotated** so weekdays keep their meals; `.ics` reminders list **Use first** ingredients and your if-then line.

## New features (from the research pass)

| Feature | Detail | Source |
|---|---|---|
| **Menu Rahmah** | Setup switch; RM 5 set (rice, chicken, vegetables) in the week and planner | [Malay Mail, Aug 2026](https://www.malaymail.com/news/malaysia/2026/08/16/menu-rahmah-operators-nationwide-reach-3210-as-of-july-says-deputy-minister/231508) |
| **My prices** | Edit any grocery pack or bought meal; validated (RM 0.10–200), stored locally, used by week, plan and check-in | — |
| **I have it / leftovers carry over** | Mark items already in the kitchen; long-keeping leftovers (rice, oats, dhal…) carry into next week's plan | — |
| **Use it up first** | Plan orders fish, greens and chicken early; Today and `.ics` say what to use first | — |
| **If-then plan** | Two short phrases for a weak moment, saved and added to reminders; effect stated honestly (≈ a third of a portion a day) | [Melum & Martiny-Huenger 2026](https://link.springer.com/article/10.1186/s12966-026-01915-y) |
| **Malaysian Healthy Plate** | "Healthy Plate" tag (quarter carbs, quarter protein, half fruit & veg) and a count, alongside WHO 400 g | [IMU 2025](https://imu.edu.my/imunews/eating-healthy-with-the-malaysian-healthy-plate/) |
| **Tight week preset** | RM 70 (RM 10 a day), Menu Rahmah on, goal money; offered again after 3+ skipped meals with a calm food-aid pointer | [MJN 2019](https://www.nutriweb.org.my/mjn/publication/25-1/f.pdf), [SAYS 2026](https://says.com/my/lifestyle/malaysians-way-buy-restaurant-meals-for-a-discount) |
| **Surplus-food tip** | In the pasar malam scene | [SAYS 2026](https://says.com/my/lifestyle/malaysians-way-buy-restaurant-meals-for-a-discount) |
| **DOSM CPI 2025** | Landing fact: restaurants +3.2 %, food & drink +2.1 %, headline 1.4 % | [DOSM 2026](https://www.dosm.gov.my/portal-main/release-content/analysis-of-annual-consumer-price-index-malaysia-2025) |

**Skipped, and why:** PriceCatcher (`storage.data.gov.my`) and the DOSM file server could not be downloaded from the build environment (the proxy rejected the connection), so live prices were not wired in; "My prices" covers the gap. DOSM's 2025 CPI release has no per-dish prices, so nasi lemak, satay and beef stay on the labelled DOSM 2024 averages; eggs and chicken are labelled estimates.

**Tests:** 48 unit (was 32) and 20 e2e (was 14), all passing.

---

# v5: from a game to a tool

v4 was a 14-day points game with four mini-games. Reviewers called it "a kindergarten game" that wasn't useful. v5 replaces the product.

| Change | Why |
|---|---|
| **Removed** the 14-day points game, the 4 mini-games, Health/Wallet/Planet points, endings, quiz and toolkit page (`game.html` and `toolkit.html` now redirect) | Abstract points and reflex games read as childish for 18–24-year-olds and taught nothing transferable |
| **New onboarding** (under 60 s): budget, kitchen, cooking limit, halal by default or vegetarian, goal, with a live feasibility preview | Every later screen uses the student's real constraints |
| **New week simulation** with real units (RM, g, kg CO₂e), inventory from the Sunday shop, habits that fill undecided meals, curveballs, locked options with reasons, and price-before / footprint-after reveals with a comparison | Learn by doing in the units of real life; based on *Spent*, *Reigns* and *80 Days* (see `docs/DESIGN_RESEARCH.md`) |
| **New Week Report** with a rule-based archetype, money/footprint/fruit-veg panels, best call and costliest habit, leftovers, guesses and a local share PNG | A Wrapped-style artefact worth keeping and sharing |
| **New planner** that never exceeds the budget and respects diet, kitchen, cooking limit and variety; swaps with exact deltas; shopping list by aisle in whole packs; A4 print; `.ics`; daily check-in | The useful part: a week the student can actually buy and keep |
| **New visual system:** editorial/fintech, 15–17 px body, no emoji, labelled icons everywhere, in-page banners, an accessible `<dialog>` sheet, light/dark, reduced motion | The previous look was oversized and toy-like; pop-ups behaved badly |
| **Tests rewritten:** 32 unit and 14 e2e (every screen at 5 widths × 2 themes with axe, overflow and 44 px checks) | The old tests covered removed features |
| Fixed during v5 QA: debounced setup preview crashing after navigation; scrollable regions not keyboard-focusable; 360 px day buttons under 44 px; print overlap in the shopping list; a misleading archetype; breakfasts repeating 7×; wrong weekday labels for non-Monday starts | Found by the new e2e and screenshot reviews |

---

# What changed (v1 → v4), and why

Written so you can explain each change in a viva or demo. "Why" is in plain words.

## 1. Bugs fixed

| # | Bug in v1 | Fix | Why it mattered |
|---|---|---|---|
| 1 | **Quick Click counted the wallet twice.** The mini-game gave +2, then `game.js` added the whole click count (e.g. +20) | Quick Click was replaced by Footprint Face-off; every mini-game now applies its result in one place (`miniGameResult`) | One mini-game could decide the whole ending |
| 2 | **Supermarket Dash crashed on every catch:** `updateDashScore()` didn't exist | Rewritten with a live score | Errors in the console; the score never showed |
| 3 | **Supermarket Dash only worked with arrow keys** | Added on-screen Left/Right buttons (hold to move) and drag | Unplayable on phones |
| 4 | **Eco Plate "not enough veggies" took −3** but showed nothing | Mini-games are now bonus-only, with a clear result screen | Hidden penalties feel unfair |
| 5 | **`main.js` crashed on the game page** (theme button missing) | Null-safe theme code shared by all pages, with a toggle on every page | JavaScript error on every load |
| 6 | **Double-tapping Continue on a phone picked the next day's food** | One-shot Continue buttons, plus a 350 ms guard on new choice buttons | The player lost control of their own game |
| 7 | **Memory Match and Eco Plate couldn't be played by keyboard** | Cards and foods are real buttons; relaxed no-timer mode; skip button | Keyboard and screen-reader users always lost points |
| 8 | **Endings could lie,** e.g. "Middle Path – balanced" at health −22 | New ending rules plus a "Mixed Bag" ending whose text is built from your real stats; unit-tested on 20,000 random cases | The verdict is the main feedback, so it has to be true |
| 9 | **"Wealthy but Wasteful" could never happen** (0% in simulation) | Prices rebalanced; every ending is now reachable (`npm run balance`) | Dead content; no money trade-off to learn |
| 10 | **Facts contradicted each other,** e.g. "beef and lamb are the two most carbon-intensive" although chocolate is higher than lamb | Facts rewritten from the Poore & Nemecek table; facts with no real source are labelled "Tip" | An education app can't be wrong about its own data |
| 11 | **Scores contradicted facts:** chocolate gave planet 0, milk gave planet +1 | Rescored and covered by a regression test | Same reason as 10 |
| 12 | **The game taught "healthy = expensive":** 25 of 27 healthy choices cost money | Real RM prices; wallet comes from the price; every day you pay for food has a cheap option that isn't bad for you (unit-tested) | That message is false for Malaysian students and discourages change |
| 13 | **Recommended swaps followed code order,** not your biggest problem | Swaps are ranked by how far past the threshold you went | Advice should target your real issue |
| 14 | **Plate Check praised "low-impact" without checking the total** | Praise needs ≤ 2 kg CO₂e **and** the fruit and veg target met; always shows your biggest contributor | It was praising high-carbon days |
| 15 | **Focus jumped to the top of the page after every screen** | Focus goes to the new heading or the same tick box | Keyboard and screen-reader users got lost |
| 16 | **The whole game area was a live region,** so every second of every timer was read aloud | One small hidden status message instead | Screen readers were flooded |
| 17 | **Holding a Dash button at game over left a timer running forever** | All timers and listeners are cleared on finish (tested) | Memory/CPU leak |
| 18 | **Coins in Dash had no cap** | Capped at +2 wallet | A reflex game shouldn't outweigh real choices |
| 19 | **Reloading re-rolled random results** | Saved right after each choice (`phase: "feedback"`) | Players could cheat the "mystery" picks |
| 20 | **A corrupted saved challenge crashed the toolkit;** a tab left open past midnight logged to yesterday | Validation and defaults; today's date is re-read on every action | Robustness |
| 21 | **Ctrl/Cmd-click on Start Game couldn't open a new tab** | Normal links aren't hijacked when a modifier key is held | Expected browser behaviour |
| 22 | **The Supermarket Dash trolley floated at the top of the play area** (found in the v3 visual check) | Positioning moved into CSS; a regression test checks it sits on the floor and actually catches items | The game couldn't be won |
| 23 | **A save from the previous version resumed into the new, different days** | Saves carry a version number; old ones are ignored | Mismatched choices and facts after updating |

## 2. Content: localised and honest

- **New scenarios:** 14 days rewritten for Malaysian student life, including kopitiam breakfast, economy rice, mamak supper, pasar malam, the balik-kampung R&R stop and assignment-deadline night.
- **Prices:** every choice shows an RM price estimate.
- **Rounded figures:** footprints are rounded (≈100, not 99.48) with a note that these are global averages and real values vary.
- **Landing page:** a new "Why It Matters" section with NHMS 2023, NHMS 2024, SWCorp, UNEP 2024 and Harkin 2016, all linked.

## 3. New features

- **Feedback after every choice:** what you chose, its price, stat changes, and a fact with its source.
- **Stat bars with real numbers** (−15…+15 scale).
- **Bonus-only mini-games:** skip, relaxed no-timer mode, full keyboard support. **Footprint Face-off** is a new knowledge game where you pick the lower-carbon food and see the real numbers. In Memory Match, each matched pair reveals a food fact.
- **Personal insights at the end:** truthful takeaways calculated from your run, plus up to 3 ranked real-life swaps.
- **Before/after Food IQ quiz:** answers are hidden before; parallel questions after; per-topic before/after table.
- **Endings collection** (x/6), **best score**, **share result**, a **14-day recap table**, and **best/toughest choice**.
- **Save and resume** after a refresh.
- **Real-Life Toolkit (`toolkit.html`):**
  - **Real Plate Check:** 7 local dishes (*est.*) plus 31 foods. Shows CO₂e total, biggest contributor, swap saving, fruit and veg progress to 400 g, a comparison with a simple plant-based student day, and a 7-day chart.
  - **7-Day Swap Challenge:** pre-filled from your game. Daily ticks, streak, %, future days locked. **Calendar reminders (.ics)**. Restart confirmation is an in-page banner, not a pop-up.

## 4. Design rules applied

- **Icons always have text labels:** the theme toggle now says "Dark"/"Light", Eco Plate foods show their names, and Dash buttons say "Left"/"Right".
- **No pop-ups:** confirmations and status use in-page banners with buttons named after their action ("Delete ticks and restart" / "Keep my progress").
- **Responsive at 360–1440 px:** no horizontal scroll, every touch target at least 44×44 px, light and dark.

## 5. Testing added (none existed before)

- `tests/unit.test.js`: **34** unit tests.
- `tests/e2e.test.js`: Playwright + axe end-to-end, regression, keyboard-only, accessibility and responsive sweep (360/768/1024/1440 × light/dark).
- `tests/balance.js`: ending balance simulation.

See `docs/PROJECT_REPORT.md` for the full SDLC write-up.

## Files

- **Added:**
  - `js/facts.js`, `js/rules.js`, `js/insights.js`, `js/quiz.js`
  - `js/foods.js`, `js/challenge.js`, `js/toolkit.js`
  - `js/miniGames/common.js`, `js/miniGames/footprint-faceoff.js`
  - `toolkit.html`, `css/toolkit.css`
  - `tests/*`, `docs/PROJECT_REPORT.md`, `package.json`
- **Rewritten:**
  - `js/data.js`, `js/game.js`
  - `js/miniGames/memory-game.js`, `js/miniGames/eco-plate.js`, `js/miniGames/supermarket-dash.js`
- **Updated:** `index.html`, `game.html`, `js/main.js`, `css/*.css`, `README.md`
- **Removed:** `js/miniGames/quick-click.js`, replaced by Footprint Face-off.


## v4 — second independent review: every finding fixed

An independent reviewer tried to break v3. They found 12 problems and 5 weaknesses in the idea. Every one of them is fixed below.

| # | Problem found in v3 | Fix in v4 | Why it mattered |
|---|---|---|---|
| 1 | **Mini-game bonuses decided about 1 in 3 endings,** so "bonus-only" wasn't true | Bonuses go into a **separate tally** shown next to the ending; the ending uses food choices only | Reflexes shouldn't decide a food lesson. Skipping now really costs nothing. |
| 2 | **Phone double-tap started or skipped the next mini-game,** or answered quiz question 1 | 400 ms **tap guard on every new screen** (keyboard unaffected). The 360 px test **fails when the guard is removed**, which was verified. | The player must stay in control |
| 3 | **Corrupted localStorage crashed things.** Example: a bad `eft-endings` lost the whole run; one bad plate item emptied the Challenge tab | Every stored value is validated (`validateSave`, `sanitize*`); each toolkit panel starts in its own try/catch | One bad value shouldn't destroy a 14-day run |
| 4 | **A toolkit tab left open past midnight** showed yesterday and edited the wrong day | Re-renders on focus, visibility change and the date change; edits go to the date on screen | Real people leave tabs open overnight |
| 5 | **Reloading on the ending lost it,** and reloading on Day 1 repeated the pre-quiz | The ending is saved (`phase: "ending"`) until Play Again; the pre-quiz result is saved immediately | Lost results feel broken |
| 6 | **Takeaways counted tags, not picks** ("10 fried picks" when there were 6) | `countPicks()`: each pick counted once | The feedback must be true |
| 7 | **Scores contradicted facts** (fish vs chicken, steamboat, grocery basket prices) | **The Planet score is calculated from each choice's recipe**, the same data the facts use. A unit test checks all 56 choices. | Can't contradict itself any more |
| 8 | **Some facts claimed more than their source** (SWCorp figure, "frying adds no footprint", "cheapest") | Reworded, re-cited, or labelled Tip; added palm oil (~7.3 kg CO₂e/kg) from the same dataset | Honesty |
| 9 | **The "after" quiz was easier than the "before"** | Two sets of matched difficulty (same option counts, different "surprise" foods), in **random order** | A fairer before/after comparison |
| 10 | **The report claimed "works offline" and "no tracking"** while loading Google Fonts and Font Awesome | Self-hosted fonts, no icon font, **service worker and manifest** (installable); a test checks 0 third-party requests and that pages load offline | The claim is now true |
| 11 | **At 360 px the challenge table hid today and later days;** tabs had no arrow keys; dark mode ignored the device setting | Sticky swap column and auto-scroll to today; WAI-ARIA tabs; follows `prefers-color-scheme` until you choose | Mobile and accessibility |
| 12 | **Plate Check advice misled:** breakfast alone was called "at or below a full day"; rice→bread and chicken rice→nasi lemak swaps; teh tarik used fresh milk | "So far today" until 5+ portions; local swaps that are no worse for health; condensed-milk estimate | Advice should be good advice |

**The 5 idea critiques:**
- **Nothing brought users back.** The .ics reminders now link to `toolkit.html#challenge-today`, a one-tap check-in. The app is also installable and works offline.
- **No real dilemma.** The Day 3 groceries decision now locks or unlocks cheap home-cooked meals later. The balance test checks that "cheapest today" never gets Eco Hero and that a planner always does.
- **Per-kg comparisons misled.** Footprint Face-off now compares **per typical serving**: a cup of coffee is lower than a chicken portion, even though coffee is higher per kg.
- **Carbon only.** The Plate Check now shows a rough **RM cost** and **sugar/salt flags** with WHO advice.
- **No way to measure learning.** An optional **class pilot**: a class code plus an anonymous CSV export, created on the device with nothing uploaded.

**Also found during v4's own test runs:** a mini-game timer could outlive its screen (for example after leaving mid-game) and throw an error, or apply a result to a different screen. Every mini-game timer now stops itself when its screen is gone, and there's a regression test that fails without the fix.

**Tests:** 54 unit and 38 E2E, all passing. The E2E suite was split into 4 files running in parallel, about 6 minutes instead of 12.
