# Makan Apa? v1.6 — clearer organization, consistent identity

## What changed

The landing page keeps the Malaysian food photography and pandan/cream palette, with a smaller headline, aligned panels and fewer competing decorative badges. The fixed header and app-only content scrolling remain.

Home is a daily workspace: meal decision and Today together on desktop, then meal-mood shortcuts, meal collection and a daily food fact. On phones these follow the same reading order.

Learn groups the full catalogue under Everyday food knowledge and Try it yourself. More groups daily money tools separately from the practice game/classroom, with tour replay below the tools. Nothing needs to be expanded to discover a feature.

The same SVG at assets/favicon/favicon.svg supplies the landing/app header, browser icon, README and tour welcome. The PNG fallback and installed-app icons are rendered from that source. Navigation icons describe actions and are not alternate logos. Run npm run brand:icons to regenerate raster icons.

## Complete feature map

| Area | Features retained |
| --- | --- |
| Setup | Budget, kitchen, dietary rules/allergies, goal, breakfast, Menu Rahmah, settings and price overrides |
| Home / Pick | Meal selection, reasons, two alternatives, adjustment filters, rejection reasons, ingredients at home, meal logging/undo and progress |
| Home shortcuts | Quick, light and cook moods; group meal picking with each person’s constraints |
| Meal collection | Search, sort, quick/saved filters, favourites, details and eligible meals |
| Plan | Weekly meals, swaps, budget fixes, grocery packs, cook-ahead, shopping list, weak moments, calendar download and printing |
| Today | Started-plan check-ins, alternative meals, groceries, past weeks and recovery options |
| Learn / knowledge | Goals, local swaps, food pairings/myths, cooking, local ingredients and source/evidence labels |
| Learn / activities | Quiz, personal best and Healthy Plate check |
| More / everyday | Plan check-in, local OCR/text receipts with review, spending analysis, stall prices and sharing/QR |
| More / practice | Practice-week game, reports, share image, class codes and class comparison |
| Help / platform | Mandatory first-use setup/tour, progress/resume, optional replay, light/dark, offline cache and local data |

Core food, planner, receipt, spending, stalls, class, check-in, collection, storage and simulation logic are byte-identical to v1.5.2. No storage keys were changed and existing saved data remains compatible.

## Apply this update to an existing repository

Extract the ZIP elsewhere first. Copy the contents of its makanapa folder into your existing repository, replacing matching files. Preserve the existing .git folder; do not run git init again.

```sh
git status
git add .
git commit -m "Unify branding and reorganize the app"
git push
```

The service-worker version and icon URLs are bumped. A returning browser may show an update prompt; reload when requested. GitHub Pages instructions remain in GITHUB_PAGES.md.

## Reproduce checks

```sh
npm run test:unit
npm run test:e2e
npm run test:design
npm run test:tour-design
npm run test:organization
```

Install the Playwright browser first, or set CHROMIUM_PATH to an existing Chromium executable.
