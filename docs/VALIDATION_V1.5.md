# Validation — v1.5

| Check | Result |
| --- | --- |
| Unit suite | 146 passed, 0 failed |
| Full browser suite | 59 passed, 0 failed in one final full run |
| Main-page audit, including Plan | 70/70 combinations passed |
| Welcome/eight-step tour audit | 72/72 checks passed |
| Focused final geometry and scroll-shell rerun | 2 passed |
| JavaScript parsing, offline asset paths and patch whitespace | Passed |

The full browser suite includes every screen at five widths (360, 390, 768, 1024 and 1440 px) in light and dark themes, meal and group flows, forms, settings, receipt OCR, local data, offline service-worker updates, calendar/image downloads and print layouts.

New geometry tests measure the target and highlight rectangles rather than relying on visual appearance or accessibility checks alone. They cover all eight tour steps in eight width/theme combinations, the first-step and Plan-control tooltip overlap, content scrolling, and repeated live resizing of an open guide. Highlight clipping is compared against actual viewport/content-pane edges.

Shell tests verify that the window does not scroll in the app, the content pane can scroll, the header stays at the top, the content pane begins below the header, route changes reset the pane, and the landing header also remains fixed. Modal-lock tests inspect the real content scroller. Service-worker fixtures represent users who completed the tour, while separate fresh-state tests verify required first-use behaviour.

The broader checks found and verified fixes for the narrow game counter, check-in day buttons, quick-spend money values and menus remaining open behind sheets. These were corrected alongside the originally reported tour and Plan alignment issues.

Manual visual inspection used actual desktop and phone renders of first-step/Plan highlights and normal/scrolled Plan pages. No physical-device testing is claimed. Browser validation used Chromium 150.

```bash
npm run test:unit
npm run test:e2e
npm run test:design
npm run test:tour-design
```

See LAYOUT_V1.5.md for implementation notes and primary documentation sources.
