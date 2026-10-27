# v1.5 — alignment and scrolling corrections

## Fixed layout

The app now has one bounded content pane below a fixed header and above the mobile navigation. The document itself does not scroll. Page navigation and game decisions reset the content pane, rather than scrolling the window. Sheets lock that pane while open. The landing header is also fixed, with space reserved above its scrolling content and anchor sections.

Sticky counters, side panels and pager controls use offsets relative to the content pane, avoiding a second header/navigation offset. Print mode restores normal document flow so long plans are not clipped to a viewport.

## Tour alignment

The previous tour forced every highlight below 72 px. That moved the Plan navigation highlight away from the actual header control. It also measured some controls during page entrance movement and did not keep all layout changes in sync.

Highlights now use the control's actual viewport rectangle, with a uniform 6 px outside gap and a radius derived from the control. Header targets are not moved down or turned into square boxes. Highlights are clipped only at the actual content-pane or screen edges, keeping bottom navigation outlines visible and preventing a large panel highlight from spilling behind fixed navigation. The guide chooses a nearby tooltip placement that fits the screen and avoids the highlighted control when space permits.

While a step is open, scrolling, resizing, target/page/card size changes, image loads and font readiness refresh positioning. Observers/listeners are removed between steps and on close. Page entrance transforms are disabled while measuring the tour. Content scrolling uses the actual app pane.

## Other alignment fixes

- Plan summary cards share grid tracks and spacing; all five summaries remain available on small screens.
- Meal-grid rows grow to fit complete meal names and align prices/tags within the shared row.
- Narrow Plan and check-in day controls use two rows where seven usable targets cannot fit.
- The narrow game counter stacks its metrics without squeezing their text.
- Quick-spend fields stack on narrow screens so full money values remain visible.
- Opening a sheet closes the Plan action menu and returns focus to its summary, avoiding hidden/partially covered menu controls.

## Sources consulted

Primary documentation informed the implementation. No positioning dependency was added.

- MDN, position: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position
- MDN, getBoundingClientRect: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
- MDN, overflow: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Overflow
- Floating UI, autoUpdate: https://floating-ui.com/docs/autoupdate
- Driver.js, refresh API: https://driverjs.com/docs/api

## Verification

See VALIDATION_V1.5.md. New browser tests compare actual highlight/target geometry, check first-step and Plan-control overlap, resize a running guide, and scroll the content pane. They also verify fixed header position, page scroll remaining zero, route scroll reset and the landing header.

Existing modal-lock and compact-screen tests now inspect the actual content pane. The service-worker test explicitly starts as a user who completed the guide, matching the other returning-user fixtures; fresh mandatory-guide behaviour remains covered independently.
