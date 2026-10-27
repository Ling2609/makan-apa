// Run with npm run test:tour-design; requires Playwright Chromium or CHROMIUM_PATH.
const assert = require('node:assert/strict');
const {setup,checkScreen,finishSetup}=require('../tests/e2e/helpers');
let start,stop;const env=setup({before:fn=>{start=fn},after:fn=>{stop=fn}});
(async()=>{let passed=0;try{await start();
  for(const colorScheme of ['light','dark'])for(const [width,height] of [[360,640],[390,844],[768,900],[1440,1000]]){
    const {page,ctx,errors}=await env.newPage({width,height,colorScheme,storage:{'ma-tour-v1':'null'}});
    try{
      await page.goto(env.url('app.html#home'));await page.waitForSelector('#app-tour[open]');
      await checkScreen(page,`${colorScheme} ${width} welcome`);passed++;
      await page.locator('[data-tour-next]').click();await finishSetup(page);
      for(let n=1;n<=8;n++){
        await page.waitForFunction(i=>document.querySelector('.tour-count')?.textContent===`${i} / 8`,n);
        await checkScreen(page,`${colorScheme} ${width} tour ${n}`);passed++;
        await page.locator('[data-tour-next]').click();
      }
      assert.deepEqual(errors,[]);
      console.log(`PASS ${colorScheme} ${width}: welcome + eight steps`);
    }finally{await ctx.close()}
  }
  console.log(`${passed}/72 tour layout and accessibility checks passed.`);
}finally{await stop()}})().catch(e=>{console.error(e);process.exitCode=1});
