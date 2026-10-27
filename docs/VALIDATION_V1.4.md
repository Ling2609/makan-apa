# Validation — v1.4

| Check run for this release | Result |
| --- | --- |
| Unit suite | 146 passed |
| Focused browser suite (tour, meals, collection and new mood shortcuts) | 12 passed |
| Main-page design audit | 60/60 passed |
| Welcome and walkthrough design audit | 72/72 passed |
| JavaScript parsing and offline asset paths | Passed |
| Visual inspection | Actual welcome, desktop spotlight, phone spotlight and redesigned Home renders inspected |

The tour audit covers the welcome plus all eight steps at 360×640, 390×844, 768×900 and 1440×1000 in light and dark themes. Checks include axe serious/critical issues, layout overflow, target dimensions and script errors. The main-page audit covers six screens at five widths in both themes.

Functional checks verify that the first welcome and tour cannot be skipped with Escape, setup cannot be bypassed through another in-app route, progress resumes after reload, Back works, completion persists, later visits stay unobstructed, and optional replays open from More and Setup and can be closed. The walkthrough leaves meal logs and weekly plans untouched. New Home mood shortcuts produce valid picks under the saved dietary and kitchen rules.

The complete browser suite now contains 57 scenarios. This release reran the 12 directly affected browser scenarios rather than the entire suite. Prior full-suite coverage is recorded separately in VALIDATION_V1.3.md; those historical results are not presented as a new full-suite run.

Existing non-tour browser fixtures represent users who already completed the guide. New tour tests explicitly start with fresh guide state, so production does not contain a test-only bypass.

Run:

```bash
npm run test:unit
npm run test:e2e
npm run test:design
npm run test:tour-design
```

No physical-device testing is claimed. The browser checks used Chromium 150.
