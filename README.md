# Makan Apa?

**Can't decide what to eat? One pick, with the reasons.**

Makan Apa? picks one meal that fits your budget, allergies, halal or vegetarian rules, kitchen, the time you have, what's at home and what you've already eaten today. You get one pick, why it fits, and two backups, not a list of fifty options. Along the way it teaches you about food, and every fact shows its evidence level and source.

Built for students aged 18–24 in Malaysia. No sign-up, works offline, and everything stays on your device.

## v1.5 — aligned layouts and a fixed app shell

Fixed first-step and Plan tour highlights, live positioning during scrolling/resizing, one scrollable content pane under the fixed header, and consistent Plan cards/day controls. Includes narrow-form and print layout fixes. See [layout notes and sources](docs/LAYOUT_V1.5.md).

## v1.4 — Makan Mate walkthrough

A required first-use welcome and eight-step guide, with progress saved on this device. Once completed, it stays hidden; replay it from **More → Show me around** or **Setup**. Replays can be closed. Includes a more expressive Home and food-mood shortcuts. See [experience notes](docs/EXPERIENCE_V1.4.md).

```bash
npm run test:tour-design  # guide layouts and accessibility in both themes
```

## v1.3 — modern kopitiam redesign

A food-led landing page, custom nasi lemak imagery, illustrated meal tickets and collection cards, pandan/butter/sambal colours, bold editorial typography, matching learning and toolkit pages, and purposeful motion. Includes light/dark layouts and reduced-motion support. See [design notes](docs/DESIGN_V1.3.md). Existing screenshots are from v1.1.

```bash
npm run serve          # open http://localhost:8080
npm run test:design    # 70 responsive/theme/accessibility combinations; needs Chromium
```

## v1.2 refinement

New searchable meal collection, device-local favourites, quick filters and recipe details, plus a shared visual refresh. See [refinement notes](docs/REFINEMENT_NOTES.md) for changes and validation limits. Run `npm run serve` to try it. Historical v1.1 screenshots remain in `docs/screens`.

## What you can do

- **Pick for me:** one meal for breakfast, lunch, dinner or a snack, from about 60 everyday Malaysian meals. You see the price, the time, up to three reasons and the usual allergens.
- **Not this:** tell it why (too pricey, not in the mood, don't have the stuff, never again) and the next pick listens.
- **I'll eat this:** logs it. Home shows today's meals, money left this week and fruit and veg so far.
- **Eating with friends:** everyone's allergies, rules and price limit together, one place for all of you.
- **Learn:** "I want…" goals with cheaper fallbacks, smart swaps (kale → kailan, blueberries → guava), myth or real (食物相克), cook it better, unsung local heroes (冷知识), a "Which has more?" quiz and a Plate check. Every fact is labelled *Strong*, *Some evidence*, *Lab only* or *Myth*, with a link.
- **Plan my week:** a weekly plan inside your budget, a cook-ahead plan, a shopping list by aisle, a plan for weak moments, print and calendar reminders.
- **More:** a daily plan check-in, receipt scanning on the phone, My real week, stall price notes, class mode and a practice-week game.

Allergies are strict. Ten groups are covered (Malaysia's allergen list plus sesame, with shellfish split into prawn/crab and squid/cockles). Any meal that contains your allergen, or often does (sambal belacan, oyster sauce, ghee), is never suggested. Stall food has no label, so always ask the seller.

## Run it

```bash
npm run serve                      # http://localhost:8080 (needs only Node.js)
```

Or open `index.html` directly. Offline mode and installing as an app need the server or HTTPS.

## Tests

```bash
npm install
npx playwright install chromium    # first time only, or set CHROMIUM_PATH
npm run test:unit                  # 146 unit tests: pick engine incl. an allergen sweep, practice week with every allergy set, money and variety, group picks, quiz and knowledge data, planner, check-in, receipts, class codes, stalls, collection filters and favourites
npm run test:e2e                   # 59 end-to-end tests: first run, pick → eat → Home, allergies on screen, friends, Learn, phone layouts and primary actions, every screen at 5 widths × light/dark (axe, overflow, 44px targets)
npm run data                       # rebuild js/knowledge.js from js/knowledge.json and js/swapsdata.json
```

## Docs

- Project report (problem, users, solution, research with sources, wow features, testing, limits): [`docs/PROJECT_REPORT.md`](docs/PROJECT_REPORT.md)
- Change list: [`CHANGES.md`](CHANGES.md)
- Design research: [`docs/DESIGN_RESEARCH.md`](docs/DESIGN_RESEARCH.md)

## Credits

Makan Apa? by [Ling2609](https://github.com/Ling2609). It started from [Eat For Tomorrow](https://github.com/sevenpluseight/eat-for-tomorrow), a hackathon game by team Keluar (Ling2609 and sevenpluseight). Eat For Tomorrow v2–v10 and all of Makan Apa? were built independently, without the other contributor. MIT licence.
