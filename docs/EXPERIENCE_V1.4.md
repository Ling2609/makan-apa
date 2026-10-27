# Makan Apa? v1.4 — guided first use

## First app visit

1. A required welcome introduces the Makan Mate guide and opens food-rule setup.
2. After setup, an eight-step walkthrough highlights the actual meal button, meal result, daily tracking, Plan navigation, meal collection, Learn, tools and replay entry.
3. Next and Back move through the guide. The first walkthrough has no Skip/Close action and Escape does not dismiss it.
4. Progress is remembered on this device. Reloading an unfinished walkthrough resumes its step.
5. Completion is saved. Future app visits do not automatically open the guide.

The guide belongs to the app (`app.html`), not the public landing page. Returning users from earlier releases see the new walkthrough once, because its completion state is separate from the older inline hint.

## Optional replay

“Show me around” is in More and in the Setup sheet. A replay has a Close button and supports Escape. It keeps the saved completed state. No permanent guide overlays or Home help banners remain after completion.

## What the guide changes

It changes screens and scroll position while explaining features. It does not select or log a meal, create a weekly plan, change dietary rules, or clear existing app data. The Plan step explains its navigation rather than generating a plan as a demonstration. The first guide sends people through their own setup instead of introducing a sample profile.

Native dialog provides focus containment and prevents interaction with the background. Labels and progress are accessible. The mobile callout moves above bottom navigation when highlighting it; short screens can scroll the callout. Reduced-motion support remains in place. If storage is blocked, completion works for the current session but cannot be remembered after the page closes.

## Visual and interaction changes

- Larger food-led Home composition, more expressive typography and photo framing.
- A new “What kind of hungry?” row: quick, lighter and cook/kettle shortcuts pass preferences into the existing meal picker. Dietary and kitchen constraints still apply.
- More editorial contrast and scale on the landing page, menu collection and Learn cards.
- Custom rice-bowl Makan Mate illustration, warm guide cards, spotlight highlighting and a visible step counter.
- The previous inline first-use Home hint is replaced by the dedicated walkthrough.

## Validation

See VALIDATION_V1.4.md for results. Existing browser-flow fixtures explicitly represent completed-tour users, while the new tour tests start with fresh state and verify the mandatory journey, reload recovery, optional replay and untouched meal/plan data.

```bash
npm run serve
npm run test:unit
npm run test:e2e
npm run test:design
npm run test:tour-design
```

All assets are bundled for offline use after caching. The interface still uses the existing vanilla JavaScript stack; no framework or external guide service was added.
