// Reproducible checks of the seven main surfaces at five widths in both themes.
// npm run test:design (after installing Playwright's Chromium, or set CHROMIUM_PATH).
const assert = require('node:assert/strict');
const { setup, checkScreen } = require('../tests/e2e/helpers');
let start, stop;
const env = setup({ before: fn => { start = fn; }, after: fn => { stop = fn; } });
(async () => {
  let passed = 0;
  const failures = [];
  try {
    await start();
    for (const colorScheme of ['light', 'dark']) for (const width of [360, 390, 768, 1024, 1440]) {
      const { page, ctx, errors } = await env.newPage({ width, height: width < 700 ? 844 : 900, colorScheme,
        storage: { 'eft2-profile': JSON.stringify({ budget: 120, kitchen: 'shared', goal: 'money', diet: { halal: true, allergies: [] } }), 'ma-picks': JSON.stringify({ guideDone: true }) } });
      try {
        for (const route of ['index.html', 'app.html#home', 'app.html#pick?slot=L', 'app.html#collection', 'app.html#plan', 'app.html#learn', 'app.html#tools']) {
          const label = `${colorScheme} ${width} ${route}`;
          try {
            await page.goto(env.url(route));
            await page.waitForSelector('h1', { state: 'attached' });
            await checkScreen(page, label);
            assert.deepEqual(errors, []);
            console.log(`PASS ${label}`); passed++;
          } catch (error) { failures.push(label); console.error(`FAIL ${label}\n${error.message}`); }
        }
      } finally { await ctx.close(); }
    }
    console.log(`${passed}/70 design combinations passed.`);
    assert.equal(failures.length, 0, failures.join('\n'));
  } finally { await stop(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
