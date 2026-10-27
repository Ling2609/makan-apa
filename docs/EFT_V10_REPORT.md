# Eat For Tomorrow — Project Report (v8)

Live one simulated student food week in Malaysia, in ringgit, grams and kg CO₂e. Then plan your real week inside your budget, with a shopping list by aisle, a printable A4 copy, calendar reminders and a 20-second daily check-in. Tools for the real week turn receipts into a spending record, keep stall prices with friends, and let a class compare results with anonymous codes. It works offline, can be installed, has no accounts and does no tracking.

---

## 1. Problem statement

Malaysian young adults rarely see how a single food choice affects their **health, budget and the environment** at the same time.

- **Health:**
  - In 2023, **95.1% of Malaysian adults** ate fewer than the recommended 5 servings of fruit and vegetables a day, and **54.4%** were overweight or obese (NHMS 2023).
  - In 2024, about **59% of adults** had more than one sugary drink a day (NHMS 2024, as reported by CodeBlue).
- **Waste:**
  - SWCorp reported about **17,000 tonnes of food waste a day** in Malaysia in 2021, about **4,080 tonnes** of it still edible (The Star, 2021).
  - Worldwide, **households cause about 60%** of food waste, and food loss and waste cause an estimated **8–10% of global greenhouse-gas emissions** (UNEP Food Waste Index 2024).
- **Climate:** foods differ a lot in carbon footprint. Beef averages about 100 kg CO₂e per kg; tofu averages about 3 (Poore & Nemecek 2018, global averages).

Most nutrition information is a one-way lecture. It doesn't let people try choices safely, see the trade-offs, or carry a small change into real life.

**Problem in one sentence:** students buying their own food for the first time have no quick, honest way to see what a normal week of choices really costs in ringgit, fruit and veg and footprint, and no simple tool that turns that into a week they can actually afford and keep.

## 2. Target users

| Group | Who | What they get |
|---|---|---|
| **Primary** | Students aged 18–24 in Malaysia who are buying their own food for the first time: hostel rooms with only a kettle, shared kitchens, or living at home | A realistic week that shows where their money actually goes (delivery fees, the 1 a.m. mamak run, the birthday service charge), followed by a plan that fits **their** budget, kitchen and halal/vegetarian rules |
| **Secondary** | Student-affairs, wellness and sustainability offices; lecturers | A 10-minute, no-login activity that works on phones and offline, with an actionable take-home (the plan) instead of a quiz score |

## 3. Research & evidence

### 3.1 Content evidence

| Claim used in the app | Source |
|---|---|
| 95.1% of adults eat < 5 servings of fruit and veg a day; 54.4% overweight or obese | [NHMS 2023 Fact Sheet, MOH](https://iku.moh.gov.my/images/nhms2023/fact-sheet-nhms-2023.pdf) |
| ~59% of adults have more than 1 sugary drink a day | [CodeBlue on NHMS 2024 (2025)](https://codeblue.galencentre.org/2025/06/nhms-reveals-just-how-bad-malaysian-diets-are/). This is a news report of the key findings; confirm against the full MOH report. |
| ~17,000 t/day food waste in Malaysia, ~4,080 t of it still edible | [The Star, citing SWCorp (2021)](https://thestar.com.my/news/nation/2021/05/20/daily-food-waste-staggering) |
| 1.05 billion tonnes wasted in 2022; ~60% from households; 8–10% of global GHG | [UNEP Food Waste Index Report 2024, key messages](https://wedocs.unep.org/bitstream/handle/20.500.11822/45275/Food-Waste-Index-2024-key-messages.pdf?sequence=4) |
| kg CO₂e per kg for every food, including palm oil (~7.3) | [Poore & Nemecek (2018), via Our World in Data](https://ourworldindata.org/grapher/ghg-per-kg-poore) |
| ≥ 400 g of fruit and veg a day; < 5 g salt a day | [WHO Healthy diet fact sheet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet) |
| Keep free sugars < 10% of energy (< 5%, about 25 g, for extra benefit) | [WHO sugars guideline](https://www.who.int/publications/i/item/9789241549028) |
| Gamified nutrition interventions raise nutrition knowledge (SMD 0.88, 6 RCTs) | [Suleiman-Martos et al., *Nutrients* 2021](https://www.mdpi.com/2072-6643/13/7/2478) |
| Monitoring goal progress improves goal attainment (d = 0.40, 138 studies), more so when progress is recorded | [Harkin et al., *Psychological Bulletin* 2016](https://eprints.whiterose.ac.uk/91437/) |
| Goal-setting and self-monitoring are recognised behaviour-change techniques | [Michie et al., BCT Taxonomy v1, 2013](https://research-portal.uea.ac.uk/en/publications/the-behavior-change-technique-taxonomy-v1-of-93-hierarchically-cl/) |

| Menu Rahmah RM 5 meals at 3,210 premises (July 2026) | [Malay Mail, Aug 2026](https://www.malaymail.com/news/malaysia/2026/08/16/menu-rahmah-operators-nationwide-reach-3210-as-of-july-says-deputy-minister/231508) |
| Malaysian Healthy Plate: quarter rice/grains, quarter protein, half fruit and vegetables ("suku-suku separuh") | [IMU (2025)](https://imu.edu.my/imunews/eating-healthy-with-the-malaysian-healthy-plate/) |
| A Healthy Plate meal bought out averages about RM 12.60 | [CodeBlue (Sep 2025)](https://codeblue.galencentre.org/?p=62115) |
| If-then plans raise fruit & veg intake by a small amount (SMD ≈ 0.20, about +0.29 portions a day) | [Melum & Martiny-Huenger, *IJBNPA* 2026](https://link.springer.com/article/10.1186/s12966-026-01915-y) |
| Food insecurity is common among Malaysian university students | [Malaysian Journal of Nutrition 25(1), 2019](https://www.nutriweb.org.my/mjn/publication/25-1/f.pdf) |
| Surplus-food apps sell restaurant leftovers at a discount | [SAYS (Mar 2026)](https://says.com/my/lifestyle/malaysians-way-buy-restaurant-meals-for-a-discount) |
| 2025: headline inflation 1.4 %, food & beverages +2.1 %, restaurants & accommodation +3.2 % | [DOSM, Annual CPI 2025](https://www.dosm.gov.my/portal-main/release-content/analysis-of-annual-consumer-price-index-malaysia-2025) |

**Data we could not get:** PriceCatcher (`storage.data.gov.my`) and the DOSM file server were unreachable from the build environment, so prices are not live; the "My prices" sheet lets each student enter their own. The DOSM 2025 CPI release has no per-dish prices, so nasi lemak, satay and beef stay on the labelled 2024 averages, and egg and chicken prices are labelled estimates.

**Counter-evidence, stated honestly:**
- **Weak evidence base:** most gamified-nutrition evidence comes from children. The pooled knowledge effect rests on 6 RCTs with a wide confidence interval, and showed no effect on BMI.
- **Mixed results:** a review of nutrition serious games found most only *partially* met their aims ([Adaji 2022](https://journal.seriousgamessociety.org/index.php/IJSG/article/view/466)).
- **If-then plans are a nudge, not a fix:** the 2026 meta-analysis found a small effect, and the app says so next to the feature.
- **We claim little:** awareness and a first habit attempt, not lasting behaviour change. The daily check-in records what was actually eaten against the plan, so a student (or a study) can *measure* adherence rather than assume it (§10).
- **Global averages:** carbon figures are global averages with a very wide spread, so every figure is rounded and carries a "global averages; real values vary" note.

### 3.2 Design research

How other games and products handle money decisions, reveals and reports is in [`DESIGN_RESEARCH.md`](DESIGN_RESEARCH.md): *Spent*, *Reigns*, *80 Days*, Spotify Wrapped, YNAB, a 454-student Malaysian cost-of-living study, DOSM prices, the controlled rice price and WCAG 2.5.8. Only sources that were opened are cited.

## 4. Solution

| Step | Screen | What happens |
|---|---|---|
| 1 | **Setup** (four short steps) | Budget (RM 40–400, or the **tight-week preset**: RM 70, Menu Rahmah on, goal money), **Menu Rahmah** switch, kitchen and realistic cooking count, food rules, goal. A pinned one-line summary and a live preview show the cost of buying every meal and the cheapest realistic week. |
| 2 | **Guess first** (optional) | Three calibration questions, scored in the report with the right answer. |
| 3 | **The week** | 16 timed decisions (15 with breakfast off) with curveballs (kunyit bar with **At stake: RM x**). **Money bites:** options you can't afford are locked with the reason; you may **borrow RM 20** twice (next week starts short) or skip. Results show the figures, a short comparison (home food at ingredient cost), the **Meanwhile** list of meals your habits filled, and the total change since your last decision, which always equals the HUD change. |
| 4 | **Week report** | Wrapped cards, one number each: money (and borrowing), CO₂e vs a reference week, fruit & veg days, the habit worth changing (cost × repeats), your kitchen and waste, guesses ✓/✗ with answers. Share PNG with measured, fitted text. |
| 5 | **Plan my real week** | Never over budget; no meal more than three times; lunch ≠ dinner; **spare budget buys fruit** on days short of 400 g; fresh food early in the week; **Healthy Plate** tags and count; one primary action and a More menu; **Fix it** banner when over; **cook-ahead plan** (sessions, minutes, portions, ≤ 3-step recipes); **if-then plan**; shopping list in whole packs with **I have it** toggles; **My prices**; A4 print; `.ics` with "use first" and the if-then line. Plans started mid-week are rotated so weekdays line up. |
| 6 | **Today** | *Ate this / Something else / Skipped*; like-for-like money over logged meals, cash out with groceries separately; "use first today"; tomorrow's home meal named; after 3+ skipped meals a calm food-aid note and, only when it is really cheaper and affordable, a switch to the cheapest tight week; Past weeks keeps earlier check-ins; at the end, leftovers carry into next week. |
| 7 | **Tools: receipt → My real week** | Photo (on-device OCR, vendored Tesseract.js) or pasted text → parsed lines (RM amounts with OCR slips fixed, quantities, SST/service, rounding, discounts) → a confirm screen where every line is checked, the sum is compared with the printed total, meals can be linked to the check-in and prices saved → **My real week**: spend vs budget and plan, by kind and day, biggest items, tips, earlier weeks. The image never leaves the device and is discarded after reading. |
| 8 | **Tools: stall price notes** | Personal, dated stall prices; share by link/QR (data after `#`); merge a friend's list (newest price per item wins); feed comparable prices into My prices. Not a live map. |
| 9 | **Tools: class mode** | Student: an anonymous, versioned, CRC-checked result code + QR listing exactly what it holds. Lecturer: paste/CSV/QR-photo/camera import, duplicate and tamper rejection, medians and histograms, a group challenge, and a class summary code students compare against privately. |

## 5. Wow features

1. **Game → plan loop.** The same food data drives the simulation and the planner, so what you learn in the week is exactly what the plan uses.
2. **Real units and reveal-after-choice.** No points: ringgit, grams and kg CO₂e. You pick by price as you would in real life, then see the hidden costs side by side with the alternatives.
3. **Carry-forward consequences.** Your Sunday basket decides which meals you can cook later. Your first lunch becomes your default. Leftovers are counted in the report.
4. **A planner that buys whole packs.** Plans count real supermarket packs (1 kg rice at the controlled RM 2.60, a 10-egg pack and so on), not fractional grams, and list what is left over.
5. **It respects the student.** Halal by default, hostel-kettle plans with no cooking, a "cook at most N meals" limit, no meal more than 3 times a week and at most 2 instant-noodle meals.
6. **Money that bites, and maths that adds up.** You can't spend money you don't have; every change on screen is itemised (choice + meanwhile), and the check-in compares like with like.
7. **Local, current options.** Menu Rahmah RM 5 meals, the Malaysian Healthy Plate, your own prices and a tight-week mode for the weeks that are hard.
8. **Receipt to real week, on the phone.** A photo becomes checked spending lines without any upload: OCR, Malaysian receipt rules (SST, 5-sen rounding, Malay labels) and a confirm screen that never trusts the camera blindly.
9. **A class picture with no server.** Anonymous codes with a checksum carry only banded aggregates; a lecturer's laptop adds them up; students compare privately.

## 6. Requirements

**Functional**

| ID | Requirement | Verified by |
|---|---|---|
| F1 | Onboarding collects budget, kitchen, diet (halal default), cooking limit and goal, and validates them in-page | e2e flow, unit `validateProfile` |
| F2 | The week runs 16 scenes with inventory, habits, diet/kitchen locks and curveballs, and resumes after a reload | unit sim fuzz (36 profiles × 25 runs), e2e reload |
| F3 | Choices show the price before and footprint/fruit-veg after, with a comparison | e2e result screen |
| F4 | The report is generated from the finished week, with a share PNG | unit report, e2e PNG signature |
| F5 | The plan never exceeds the budget; diet, kitchen and cooking limits always hold; if infeasible, the app says how much more is needed | unit planner constraints (36 profiles), infeasible-budget test |
| F6 | Swaps, shopping list by aisle, print view, `.ics` export | unit swaps/ICS, e2e swap/print/download |
| F7 | Daily check-in with "something else" and a like-for-like money summary | unit check-in maths, e2e check-in |
| F8 | Spending never exceeds budget + borrowed; locked options show why | unit budget-lock + fuzz, e2e budget lock |
| F9 | On-screen change = choice + listed habit lines | unit meanwhile test, e2e HUD delta on 9 decisions |
| F11 | Receipts: OCR on device, Malaysian receipt parsing, line-by-line confirmation, check-in link without double counting, My real week | unit parser on 8 receipt texts (incl. noisy OCR), real-week maths; e2e paste flow + real OCR of a receipt image |
| F12 | Class codes: versioned, checksummed, anonymous; import from paste/CSV/QR; aggregate, challenge, summary code; private comparison | unit round-trip, every single-character error caught, import/dup/tag, aggregation, summary; e2e student → lecturer → student |
| F13 | Stall notes: dated prices, share link/QR, newest-wins merge, My prices | unit merge/encode/tamper/hostile input; e2e add → share → friend merges |
| F14 | No logged data is lost by remaking a plan or changing setup; Back never loops | e2e H1/H3, unit history |
| F10 | Plan caps (≤ 3 uses), spare budget to fruit, cook-ahead sessions, My prices, I have it, if-then, Menu Rahmah | unit planner/prices/rahmah/prep tests, e2e features |

**Non-functional:** works offline (service worker); no third-party requests (blocked and checked in e2e); all data in `localStorage` and validated on load; axe 0 serious/critical; 44 px targets; no sideways scrolling from 360 to 1440 px; light/dark; reduced motion; print on A4; phone chrome ≤ 56 px on top plus a labelled bottom tab bar; sheets lock background scroll.

## 7. Design

- **Architecture:** plain HTML/CSS/JS with no build step. The pure modules are `foods.js` (data), `storage.js`, `week.js` (scenes), `sim.js` (state machine), `report.js`, `planner.js`, `checkin.js`, and in v7 `receipt.js` (parser and categoriser), `realweek.js`, `classcode.js` (codec, import, aggregation) and `stalls.js` (validation, merge, share codec). Each is unit-tested in Node. `app.js` is a hash router for setup, week, report, plan and today; `tools.js` renders the Tools tab. A unit test checks the browser scripts never declare the same global twice.
- **Heavy libraries load on demand.** Tesseract.js (66 KB + 121 KB worker + 3.8 MB LSTM core with inlined WASM + 2.8 MB `eng` best-int data) and the QR libraries (qrcode-generator 55 KB, jsQR 251 KB) are vendored, never precached, loaded only on the screen that needs them, and cached by the service worker on first use in a cache that survives app updates.
- **Planner:** greedy cheapest start (feasibility), then hill-climbing over single-slot swaps (including an optional fruit-snack slot) to minimise a goal objective with a variety penalty under the budget, plus a penalised search from a goal-greedy start. The best feasible plan then gets fruit snacks on short days while it stays within 92 % of the budget, and cooked fresh meals move earlier in the week. Groceries are costed in whole packs, minus what the student already has. Deterministic; about 2.5 s for 18 profiles in Node.
- **Visual system:** see [`DESIGN_RESEARCH.md`](DESIGN_RESEARCH.md) §5. Editorial and fintech in feel, 15–17 px body text, Inter tabular figures (mono only on receipts), a kopitiam palette, one decorative object (the receipt), labelled icons everywhere, and in-page banners instead of pop-ups. The only overlay is an accessible `<dialog>` sheet.

## 8. Testing (all run on this version)

| Suite | Count | What it covers |
|---|---|---|
| Unit v10 (`tests/v10.test.js`) | **7 tests**, all passing | **Start-today sweep** over the reviewer's grid: 3 kitchens × 2 diets × 6 budgets (RM 50–120) × 4 cooking levels × breakfast on/off × 7 weekdays = 2,016 starts, plus the RM 70 tight-week preset (336 starts). Each start: within budget whenever the reviewed plan was (or reported impossible to the cent, and checked impossible by a fresh start-today plan), no meal twice on day 1, no meal more than 3 times, day-1 breakfast and lunch ready before the shop. Result: 0 over budget, 0 variety breaks, 0 day-1 repeats; 14 starts (vegetarian, RM 60, 14 cooks, breakfast on) are genuinely impossible (RM 4.80 more) and are warned about. Also: receipt lines only price the app's meal on a close match |
| E2E v10 (`tests/e2e/v10.test.js`) | **3 tests**, all passing | The reviewer's RM 50 start today stays within budget with no banner; the impossible case shows the exact extra cost, preselects Next Monday as Recommended, and the banner then names the start (same amount); a "Nasi Lemak Ayam Goreng Berempah" receipt line is flagged, unticked and never saved as the nasi lemak price |
| Unit v9 (`tests/v9.test.js`) | **20 tests**, all passing | Round C regressions (several receipts per meal with per-receipt shares, the shop before a Next Monday start, the earlier week never recounting the shop, typed amounts, over-budget cause, print tags, stall dates, class over-budget step, the UNEP claim, prices kept with "Ate this", report wording, parser slips, crafted class codes, future spend dates, these doc counts, map links, start-today breakfast, print date wording, receipt drafts) and a **property test over the real-week money flows**: 400 seeded random weeks mixing check-in ticks, receipt links, second receipts for one meal, deletes, the shop from a week before the start, hand-ticked groceries and price changes; after every step (> 3,000 states) My real week equals an independent ledger, Today's cash out equals My real week minus the receipt lines that are no check-in meal, the earlier week plus the plan's week count each receipt once, a price change moves no logged money, Past weeks keep their filed numbers, and no check-in entry points at a deleted receipt |
| E2E v9 (`tests/e2e/v9.test.js`) | **7 tests**, all passing | Two receipts for one meal through the interface (Today, My real week and the Tools hub show the same number after each save, delete and "Change it anyway"); a grocery receipt before a Next Monday start; **no meal name split inside a word** at 360/390/768 px for 3 kitchens (measured per word with `Range.getClientRects`); over-budget banner blames prices with no swaps; print tags inside their cells; a future stall date is an in-sheet error; typed "RM5" / "2.8" and a receipt draft that survives a reload |
| Unit v8 (`tests/v8.test.js`) | **16 tests**, all passing | Round B regressions: random spend ids (identical spends both kept), receipt ↔ check-in links (re-tick never double counts, two lines one meal, delete clears what it logged), additive and shop-day grocery receipts, hub = My real week, total-vs-lines check and payment words, NETT/discount/fees parsing, hostile stall links never throw, future and impossible dates, Unicode names, exact map hosts, empty class summary sentinels, concatenated codes, service-worker reload guard, input widths, deep links through setup |
| E2E v8 (`tests/e2e/v8.test.js`) | **7 tests**, all passing | **Service workers enabled**: no reload on first visit, offline after install, update banner without moving the page, one reload onto the new cache, "Later"; deep links through setup and stall/class links without setup; two-line linked meal, total check, re-tick confirm, hub/real-week agreement, delete clears the check-in; identical spends; shop-day + top-up groceries; class summary guard and meter size; RM 1,234.56 fits every money input at 5 widths. All responsive screens now also fail on **input text overflow** (`scrollWidth > clientWidth`) |
| Unit v7 (`tests/v7.test.js`) | **34 tests**, all passing | Round A regressions (breakfast off, tight week for 18 setups, corrupted saves, cook/shop timing for 7 start days, lunchboxes and freshness for 54 plans, default plan quality, vegetarian recipes, sources, carry-over from skips, plain names, Healthy Plate, empty reminders, real grocery cost); receipt parser on 8 realistic and noisy receipts, amounts with OCR slips, warnings, validation; real-week maths and no double counting; class code round-trip, retyping tolerance, **every single-character error caught**, import with duplicates/tags/rejects, aggregation, challenge, summary and comparison; stall merge (newest wins, idempotent), share codec, tampered and hostile input; global-name collisions; vendored files and service worker |
| Unit (`tests/unit.test.js`) | **48 tests**, all passing | Everything in v5, plus: **budget lock** (locked options, reason, borrow keeps the decision, cap of RM 40, a week always finishes, spending ≤ budget + borrowed in the 900-week fuzz); **meanwhile accounting** (money, CO₂e and fruit & veg change = choice + listed lines, every decision, 9 profiles); **max-plate cap** for the use-it-up dinner; **plan repetition cap** (≤ 3 uses, lunch ≠ dinner, 36 profiles × 2 budgets); **budget use** (fruit snacks within budget; health plan ≥ 75 % of budget and ≥ 5 fruit & veg days); "already have" and carry-over; My prices validation and use; Menu Rahmah gating; Healthy Plate; prep sessions; plan rotation; share stats; ≤ 3 recipe steps; **check-in maths** (like-for-like, cash out, unlogged meals change nothing, food-aid trigger); `.ics` "use first" and if-then lines |
| E2E v7 (`tests/e2e/v7.test.js`) | **8 tests**, all passing | Back after the week, reload on the last result, remake/setup with ticks (confirm, Past weeks), day reset, over-budget swap fix and focus, infeasible budget after reload, receipt paste → confirm → link to check-in → real week, **real on-device OCR of a receipt photo (total RM 17.65 read; no request leaves the origin)**, stall add → share link → friend merge → My prices, class student code → lecturer import (chat noise, duplicate, broken code) → challenge → summary → student comparison. The responsive suite now also sweeps Past weeks, the remake confirm, all Tools screens, sheets and QR codes at 5 widths × 2 themes |
| E2E (`npm run test:e2e`) | **45 tests** in total (20 below + v7 8 + v8 7 + v9 7 + v10 3), all passing | Full phone flow (now through the setup wizard, More menu and print checks); **features**: HUD delta = listed lines on 9 decisions, budget lock + borrow, phone chrome (top bar ≤ 56 px, 4 labelled tabs, Next above the tab bar, sheet locks scroll), **share image text measured to fit**, tight-week preset + Menu Rahmah + My prices (in-page error) + I have it + if-then, apply-to-all swap; **every screen at 360/390/768/1024/1440 px, light and dark** (including each setup step, the comparison list, the More menu and the prices sheet): axe 0 serious/critical, no sideways scroll, no clipped text, **no overflowing table cells, prices or values**, every target ≥ 44 px, no script errors |
| Visual review | 2 rounds | Screens at 390 and 1440, light and dark. Round 1 fixed: two-line phone HUD, empty cell in the result figures, struck-through prices on options locked for missing stock, a sideways scroll from screen-reader text inside the report carousel, a 1024 px plan cell overflow, the More menu clipping on phones. Round 2 fixed: result screens opening scrolled down, the "Watch" row leaving a gap, a stray separator in print. Regenerate with `node tests/screens.js`. |

## 9. Limitations (each one justified)

- **Starting today can cost more than starting on Monday.** Day 1's breakfast and lunch come before the shop, so they are bought (or a kettle meal whose groceries are already at home). The app re-plans the week under the same budget first; in 14 of 2,016 tested setups (vegetarian, RM 60, 14 home-cooked meals, breakfast on) no week started today fits, and the start sheet says so with the exact extra cost (RM 4.80) and recommends Next Monday.

- **Footprints are global averages** (Poore & Nemecek), applied to our portion estimates. No public per-food dataset exists for Malaysia. The app says so on every report and print.
- **Most prices are 2026 Klang Valley estimates.** Nasi lemak, satay and beef use DOSM 2024 averages, and rice uses the controlled price. Live PriceCatcher data couldn't be downloaded here, so students can enter **their own prices** instead.
- **Borrowing is a teaching device.** It's capped at RM 40 and only changes the report; it doesn't carry into the real plan.
- **The Healthy Plate tag is approximate.** It checks for a carb, a protein and ≥ 40 % fruit & veg by weight in our recipe, not exact proportions.
- **The plan is not a nutrition prescription.** It covers fruit and veg, sugary and salty picks, money and footprint; it does not cover calories, protein targets or allergies.
- **Progress lives in one browser.** Syncing would need accounts, which conflicts with the no-tracking design. The `.ics` export covers reminders.
- **OCR is error-prone.** Faded thermal paper, crumpled receipts and handwriting defeat it. That's why nothing is saved without the confirm screen, the sum-vs-total check flags misreads, and typing or pasting works the same. English data only (Malay words are matched by the parser, not by the OCR model); the first scan downloads ~7 MB; photo scanning needs the app served over http(s) (Workers can't load from `file://`).
- **Real-week double counting is avoided only for linked meals.** A meal ticked "Ate this" counts at its planned price; if the student also scans its receipt without linking it, it counts twice. The screen says so.
- **Class codes are anonymous, not authenticated.** The CRC-16 catches typos and edits, not a determined student who reads the source and makes a code; duplicates are dropped but a student can send two different codes. Treat the class view as a discussion tool, not an assessment. Classes under five students can't be kept anonymous; the app warns.
- **Stall notes are not a community map.** Sharing is person to person; there is no central list, moderation or freshness check, because that needs a server. Prices show their age.
- **Behaviour change is not proven.** The check-in measures adherence for one person; no study has been run.

## 10. How to run & test

```bash
npm run serve                      # http://localhost:8080 (needed for offline/install)
npm install
npm run test:unit                  # 125 unit tests (unit 48 + v7 34 + v8 16 + v9 20 + v10 7)
npx playwright install chromium    # first time only, or set CHROMIUM_PATH
npm run test:e2e                   # 45 end-to-end tests (~10 min): flows, real OCR, every screen at 5 widths × 2 themes
node tests/screens.js              # regenerate docs/screens and landing thumbnails
# Save a screenshot of every checked screen: SHOTS_DIR=./shots npm run test:e2e
```
