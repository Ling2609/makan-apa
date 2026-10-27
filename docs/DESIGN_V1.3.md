# Makan Apa? — modern kopitiam redesign

## Direction

A contemporary Malaysian cafe menu, built around student food decisions: pandan green, butter yellow, sambal accents and warm paper. Large Bricolage headings meet occasional italic serif words, printed ticket details and local food imagery. The aim is a recognisable food product rather than a generic dashboard.

## Implemented surfaces

- Landing: editorial hero, custom nasi lemak image, floating meal ticket, local-food divider, illustrated feature cards and a bold closing invitation.
- Home: photo-led food moment, clear primary meal action, today's log, budget/fruit-and-vegetable indicators, menu discovery and a food-fact strip.
- Pick: an illustrated meal ticket with reasons, full allergen information, save/log actions and two backups. Recipe-aware SVG artwork is decorative, not an ingredient list or portion guide.
- Collection: an illustrated menu, search, price/time/name sorting, quick and saved filters, recipe details and empty-state recovery. Skip actions, drinks and practice-game occasion options are excluded.
- Learn: a yellow editorial masthead and numbered topic cards.
- More: a matching food-day toolkit. Setup, planner, sheets, navigation, controls, dark mode and the share image use the same visual system.

Existing dietary constraints, budget calculations, planning, receipt OCR, class codes and local storage remain in the original application. The project still has no backend or account requirement.

## Motion and usability

Buttons have short press feedback; pointer hovers lift cards gently. Entrance motion is limited to occasional top-level discovery screens. Repeated game decisions do not animate. This also avoids transformed ancestors affecting fixed controls. All movement honours reduced-motion preferences; keyboard focus remains visible. The mobile plan menu expands in the document rather than covering day selectors.

The mobile Home, Pick and Learn screens intentionally allow vertical scrolling. Their previous single-screen height assertions were replaced with checks for horizontal overflow, a visible primary Home action and a reachable Pick action. Compact learning tools keep their existing height checks. Phone header expectations now reflect the intentional 68 px header.

## Inspiration reviewed

These references informed composition and interaction decisions; no third-party design skill was installed, and no proprietary template was copied.

- Landbook: https://land-book.com/ — food/illustration, large type, visible borders, colour-led composition.
- Elaya design skills: https://github.com/elayadesign/ai-design-skills — design-workflow reference.
- Emil Kowalski animation guidance: https://github.com/emilkowalski/skills — purposeful motion, restrained duration, transform/opacity, pointer gating and reduced-motion support.

## Hero asset

Generated using the built-in image-generation tool. Project asset: `assets/food/kopitiam-hero.png`.

Prompt:

> Use case: photorealistic-natural. Asset type: custom hero photograph for Makan Apa, a Malaysian student meal decision web app. Create a premium editorial food photograph, wide landscape composition 1536x1024. A beautifully arranged authentic Malaysian nasi lemak on a large pale ceramic round plate lined with a banana leaf: dome of coconut rice, half boiled egg, cucumber slices, sambal in a small ramekin, roasted peanuts and crisp anchovies clearly separate; an additional small side bowl of greens and a short glass of iced teh o nearby. Top down with slight angle, full main plate visible in the center, on a warm butter-yellow tabletop. Art direction: contemporary independent Malaysian cafe brand, playful but sophisticated, hard natural afternoon sunlight from upper left and honest food textures, rich pandan greens and chili red against warm cream. One cohesive photograph, not collage. Keep every dish entirely in frame. No text, logos, cutlery across food, people, hands, decorative illustrations, watermarks, or UI elements. Delicious, real, student-friendly food rather than luxury dining.

The hero is illustrative branding, not a meal recommendation. No nutritional or allergen facts are inferred from the image.

## Run and verify

```bash
npm run serve
npm install
npx playwright install chromium
npm run test:unit
npm run test:e2e
npm run test:design
```

`test:design` checks landing, Home, Pick, Collection, Learn and More at 360, 390, 768, 1024 and 1440 px in both themes: 60 combinations, using axe, overflow checks, 44 px target checks and script-error checks. Set `CHROMIUM_PATH` to use an already installed Chromium.

Visual inspection was performed on actual desktop and phone renders. No physical-device testing or new audit of the original nutrition research is claimed. Original screenshots in `docs/screens` predate this redesign.
