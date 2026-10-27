# Design research (v6)

Why the redesign happened: v4 was reviewed as "a kindergarten game", with mini-games, points, oversized type and pop-ups. It was also "not useful for any purpose". The target users are students aged 18 to 24 who are buying their own food for the first time. They are fluent in fintech apps, Spotify Wrapped and swipe-style games, and have no patience for being lectured.

This file lists only sources that were opened and read during the redesign. Three sources could not be fetched from the build environment and were **not** used: Nielsen Norman Group articles, the BBC GEL guidelines and Material Design pages. Claims below do not rely on them.

## 1. Games that make money decisions feel real

| Source | What it does | What we took |
|---|---|---|
| *Spent* (Urban Ministries of Durham / McKinney), critical-play write-up, [Mechanics of Magic](https://mechanicsofmagic.com/2023/10/01/critical-play-spent/) | You get $1,000 and a month. Every choice is a real bill or job, and the costs pile up until there's no good option left. | **Real units, no points.** Every option is priced in ringgit and every result is in kg CO₂e and grams of fruit and veg. Curveballs (rain surcharge, birthday service charge, 1 a.m. mamak) put pressure on the budget the way *Spent*'s bills do. We avoid *Spent*'s guaranteed-failure ending: careful play can stay under budget, and this is unit-tested. |
| *Reigns*, review on [Birth.Movies.Death](https://birthmoviesdeath.com/2016/09/02/reigns-review-swipe-right-to-fight-the-devil.html) | One decision per card, with four meters at the top. You can see which meters a choice touches, but not by how much. | **One scene at a time with a persistent HUD** for money left and footprint. As in *Reigns*, you see the price up front, and the footprint and fruit-and-veg figures are revealed only **after** you choose. That keeps a small moment of surprise without hiding the money. We used labelled meters instead of four bare icons, because the user's own UI rule is that every icon has a text label. |
| *80 Days* (inkle), [IF50 essay](https://if50.substack.com/p/2014-80-days) | Text-led choices, a running transcript, and money and time as visible resources. The text is typeset carefully, "as a visual medium". | **The receipt.** Every choice prints a line on a running receipt (rail on desktop, labelled sheet on phones). The type is editorial and restrained, with mono only for figures. Each scene has a time stamp ("Tuesday, 7:50 p.m."), as in *80 Days*. Habits carry forward: your Monday lunch becomes the default for days you don't decide, much as *80 Days* carries your past route forward. |

## 2. Products that turn a period of behaviour into something you keep

| Source | Finding | What we took |
|---|---|---|
| Spotify Wrapped, [UX Collective analysis](https://uxdesign.cc/why-is-spotify-wrapped-so-popular-5c503e79a3ee) | Personal data told as a story, a shareable artefact, and archetypes that give identity. | **Week Report**: an archetype headline ("Over budget by the weekend", "The meal prepper", "The delivery regular", "The night owl"), panels for money, footprint, fruit & veg, your best call and your costliest habit, and a 1080×1350 **share PNG** drawn locally on a canvas. There is no upload and no tracking. Archetypes are chosen by fixed, tested rules, never at random. |
| YNAB, [method page](https://www.ynab.com/ynab-four-rules-less-stress/) | Money is planned **before** you spend it ("For Now"), and the plan is adjusted as life changes ("For Change"). | **Plan my real week**: a plan built ahead of the week that never exceeds the budget (unit-tested across 36 profiles). Swaps show the exact change in money, CO₂ and fruit/veg. A **daily check-in** compares what you actually spent against the plan, and the shopping list ticks persist. |

## 3. The audience's real constraints

| Source | Finding | What we took |
|---|---|---|
| Cost-of-living study of 454 Malaysian university students, [UUM IJBF 2024](https://e-journal.uum.edu.my/index.php/ijbf/article/view/20396) | Most spend RM 201 to 400 a month. Peer influence goes with higher spending, and financial knowledge with lower spending. | Default budget RM 120 a week, adjustable from RM 40 to 400. Peer-pressure scenes include the group-study order, the birthday dinner and the mamak run. Every result screen gives one concrete comparison ("RM 26.40 cheaper, 2.15 kg less"), not advice. |
| DOSM 2024 prices via [Malay Mail (2025)](https://www.malaymail.com/news/malaysia/2025/04/30/from-roti-canai-to-satay-beloved-malaysian-foods-see-prices-nearly-double-over-13-years-says-dosm/174999) | Nasi lemak averaged RM 3.68 in 2024, up from RM 2.03 in 2011; other hawker staples rose similarly. | Used for nasi lemak, satay and beef prices; other prices are labelled as 2026 Klang Valley estimates (see `SOURCES` in `js/foods.js`). |
| Rice price via [Malay Mail (July 2026)](https://www.malaymail.com/news/malaysia/2026/07/13/malaysia-has-six-months-rice-supply-local-white-rice-price-held-at-rm260kg-says-economy-minister/227456) | Local white rice is held at RM 2.60/kg. | Rice pack price in the planner. |

## 4. Accessibility and touch

| Source | Finding | What we took |
|---|---|---|
| axe rule `target-size` / WCAG 2.2 SC 2.5.8, [Deque University](https://dequeuniversity.com/rules/axe/4.8/target-size) | 24×24 CSS px is the minimum, or enough spacing. | We hold ourselves to **44 px** for every button, link-button, input and choice label, which is stricter than the rule. The e2e suite measures every visible target on every screen at 5 widths in both themes. |
| The user's own UI notes (Xiaohongshu collection) | Icons must have text labels. Use in-page banners with action-named buttons, not pop-ups. | Every navigation and toolbar control has a text label at every width ("Setup", "Dark", "Receipt"). Validation and the "saving resets your week" warning are in-page banners. The only overlay is an accessible `<dialog>` sheet (focus trapped, Escape closes it, focus returns to the opener) used for receipts, swaps, settings and "something else". |

## 5. Visual direction (decisions, not sources)

- **Editorial and fintech, not toy-like.** Inter with tabular figures for every number; mono only on the receipt. Heading weights step down 680 → 620 → 600. Body text is 15 to 17 px, and headings are capped at about 3 rem on the landing page and 2 rem in the app. There are no emoji and no confetti.
- **Kopitiam palette.** Tile green (#0c6a62), kopi brown, kunyit and chili for warnings, on a cool off-white paper. There are matching dark tokens, set by `prefers-color-scheme` or the toggle.
- **One bold object per screen.** The receipt, with its zigzag tear edge, is the only decorative element. Everything else is plain rows and panels.
- **No dead space.** The scene page fills the column below the card with a "Week so far" table. The report uses a 3-column panel grid on desktop and a single column on phones.
- **Motion** is limited to state changes, and switched off under `prefers-reduced-motion`.

## 6. v6: what the critique and the reference products changed

| Reference | Pattern | What we did in v6 |
|---|---|---|
| *Reigns* and *Spent* (above) | Consequences arrive whether or not you're looking; resources run out | Habit meals are listed on every result under **Meanwhile**, with a total change that matches the HUD. Money that runs out **locks** options, with the reason, and borrowing costs you next week, as *Spent*'s loans do. |
| Spotify Wrapped (above) | One statistic per card, swipeable, shareable | The report is a row of **cards with one big number each**: a scroll-snap carousel on phones, a 2–3 column grid on desktop. The share image measures every line before drawing it. |
| YNAB (above) | Plan first, one obvious next action, "fix it" when overspent | One primary button on the plan, everything else under **More**; an over-budget plan gets a banner with three named fixes. Spare money is given a job (fruit) instead of sitting idle. |
| Malaysian Healthy Plate ([IMU](https://imu.edu.my/imunews/eating-healthy-with-the-malaysian-healthy-plate/)) | "Suku-suku separuh": quarter, quarter, half | A **Healthy Plate** tag on qualifying meals and a count in the plan totals, next to WHO's 400 g. |
| Implementation intentions ([2026 meta-analysis](https://link.springer.com/article/10.1186/s12966-026-01915-y)) | If-then plans give a small but real gain in fruit & veg | An **if-then card** in the plan, copied into calendar reminders, with the small effect size stated. |
| Mobile tab-bar convention | Primary sections in a labelled bottom bar; content gets the screen | **56 px top bar + 4 labelled bottom tabs**, a fixed Next bar, and sheets that lock the page behind them. |
