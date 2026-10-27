# Makan Apa? — v1.2 refinement

## What changed

- Shared warm cream, terracotta and botanical dark palette across the landing page, app and practice week; local fonts remain bundled.
- Clearer navigation selection, larger hero typography, consistent cards, visible keyboard focus and roomier meal explanations.
- New meal collection: search by meal name, sort by estimated cost/time/name, quick-meal and saved-only filters, recipe/allergen details and recoverable empty states.
- Save directly from a meal recommendation or from the collection. Saved IDs are validated and deduplicated; storage errors are announced.
- Every collection query applies current diet, allergy, kitchen and Menu Rahmah rules. Saved meals that no longer fit are hidden from results, not deleted.
- No account or new external service. Favourites remain on the current device. No live restaurant availability or verified halal certification is implied.
- Offline cache updated for the new assets, with a version bump. Existing app data keys are preserved.
- Local development server rejects malformed URL escapes, traversal and hidden paths. Package and lockfile identity/version now agree.

## Run

Use Node.js, run `npm run serve` in the project folder, and open http://localhost:8080. No build step is required. The collection is at `app.html#collection`.

## Verification

The 146 unit tests pass, including the collection allergy/kitchen sweep, saved-ID validation, search, quick filter and sorting. All JavaScript passed syntax checks, offline asset paths were checked, and seven HTTP smoke/server boundary checks passed.

Browser end-to-end and visual verification could not run in the editing environment: Chromium was absent and its download failed. A new browser regression test covers search, save, reload, saved-only filtering, details and empty-state recovery. It is supplied for local execution, not claimed as passing. Existing first-run height assertions may need adjustment because Home now deliberately exposes discovery instead of hiding it below navigation.

Run `npm install`, `npx playwright install chromium`, then `npm run test:e2e`. Check phone and desktop layouts in both themes before release. New screenshots have not been generated; older screenshots in docs show the previous UI.

## Deliberate scope

The meal recommendation, nutrition knowledge and weekly planning engines are retained. This refinement adds discovery and improves the shared UI; it does not claim to re-audit all original nutrition evidence or implement a backend.
