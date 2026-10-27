# Validation — v1.3

Validation performed with Node.js and Chromium 150 in the editing environment.

| Check | Result |
| --- | --- |
| Unit suite | 146 passed, 0 failed |
| Dedicated design audit | 60/60 combinations passed |
| Browser scenario coverage | All 53 scenarios passed across the full run and final focused reruns |
| Reduced-motion preference | Verified: Home entrance animation is disabled |
| JavaScript parsing | All app JavaScript files passed |
| Offline assets | Every service-worker precache path exists, including the new image and SVG renderer |
| Visual inspection | Actual desktop and phone renders of the landing, Home, Pick, Collection and Learn pages inspected; dark Home inspected |

## Browser regression details

The last full run completed 51 of 53 scenarios successfully. The two failures were the 360 px light and dark plan-menu checks, which caught the expanded menu partially covering a day selector. The mobile menu was changed to expand in normal document flow. Both complete 360 px responsive scenarios then passed on focused reruns; the light 1024 px responsive scenario also passed again. No failing scenario remains unresolved. This is combined validation across runs, not a claim that a single final full run was all green.

During development, checks also caught and verified fixes for low-contrast text on tinted surfaces, the old sidebar conflicting with the new header, and a page transform changing the containing block of the game's fixed Next control. Phone header and editorial-page height assertions were updated for the intended new design, while retaining checks for readable layouts and usable primary actions.

## Reproduce

```bash
npm install
npx playwright install chromium
npm run test:unit
npm run test:e2e
npm run test:design
```

An installed compatible browser may be supplied through `CHROMIUM_PATH`. Design checks cover six surfaces at five widths (360, 390, 768, 1024, 1440 px), in both themes, using axe serious/critical checks, page overflow, target dimensions and script errors.

These checks do not replace testing on a physical iPhone/Android phone, nor do they re-audit the source nutrition research. Existing screenshots under `docs/screens` show the original v1.1 design.
