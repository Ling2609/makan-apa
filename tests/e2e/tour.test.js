const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, finishSetup, checkScreen } = require('./helpers');
const env = setup(test);
const profile = JSON.stringify({ budget:120, kitchen:'shared', goal:'money', diet:{halal:true,allergies:[]} });
const fresh = { 'ma-tour-v1': 'null' };
test('first visit requires welcome and eight steps, remembers completion, then stays hidden', async () => {
  const {page,ctx,errors} = await env.newPage({width:390, storage:fresh});
  await page.goto(env.url('app.html#home'));
  await page.waitForSelector('#app-tour[open]');
  assert.match(await page.textContent('#tour-title'), /Pull up a chair/);
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#app-tour').evaluate(d=>d.open));
  assert.equal(await page.locator('[data-tour-close]').count(),0);
  await checkScreen(page,'tour welcome 390');
  await page.locator('[data-tour-next]').click();
  await page.evaluate(() => { location.hash = 'learn'; });
  await page.waitForSelector('#setup-form');
  assert.equal(await page.locator('.learn').count(),0,'first setup cannot be bypassed through another route');
  await finishSetup(page);
  await page.waitForSelector('.tour-count');
  for(let i=1;i<=8;i++) {
    await page.waitForFunction(n=>document.querySelector('.tour-count')?.textContent===`${n} / 8`,i);
    if(i===1||i===4||i===8)await checkScreen(page,`tour step ${i} phone`);
    await page.locator('[data-tour-next]').click();
  }
  await page.waitForFunction(()=>!document.querySelector('#app-tour')?.open);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ma-tour-v1')).completed),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ma-ate')),null,'tour does not log meals');
  assert.equal(await page.evaluate(()=>localStorage.getItem('eft2-plan')),null,'tour does not make a plan');
  await page.reload();await page.waitForSelector('#pick-now');
  assert.equal(await page.locator('#app-tour[open]').count(),0);
  assert.deepEqual(errors,[]);await ctx.close();
});
test('an unfinished tour resumes after reload and supports Back without an escape shortcut', async () => {
  const {page,ctx,errors} = await env.newPage({width:1440,storage:{...fresh,'eft2-profile':profile}});
  await page.goto(env.url('app.html#home'));await page.waitForSelector('.tour-count');
  await page.locator('[data-tour-next]').click();
  await page.waitForFunction(()=>document.querySelector('.tour-count')?.textContent==='2 / 8');
  await page.reload();await page.waitForFunction(()=>document.querySelector('.tour-count')?.textContent==='2 / 8');
  await page.locator('[data-tour-back]').click();
  await page.waitForFunction(()=>document.querySelector('.tour-count')?.textContent==='1 / 8');
  await page.keyboard.press('Escape');assert.ok(await page.locator('#app-tour').evaluate(d=>d.open));
  await checkScreen(page,'tour desktop');assert.deepEqual(errors,[]);await ctx.close();
});
test('completed users can replay from More or Setup, close with Escape, and keep completion', async () => {
  const {page,ctx,errors} = await env.newPage({width:390,storage:{'eft2-profile':profile}});
  await page.goto(env.url('app.html#tools'));await page.locator('#replay-tour').click();
  await page.waitForSelector('[data-tour-close]');await page.keyboard.press('Escape');
  assert.equal(await page.locator('#app-tour[open]').count(),0);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ma-tour-v1')).completed),true);
  await page.locator('[data-open-settings]:visible').first().click();
  await page.waitForSelector('#settings-form');await page.locator('#sheet [data-replay-tour]').click();
  await page.waitForSelector('[data-tour-close]');await page.locator('[data-tour-close]').click();
  assert.equal(await page.locator('#app-tour[open]').count(),0);
  assert.deepEqual(errors,[]);await ctx.close();
});
