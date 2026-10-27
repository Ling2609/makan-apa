// Verify the shared brand and that every reorganized hub retains its destinations.
const assert=require('node:assert/strict');
const {setup}=require('../tests/e2e/helpers');
let start,stop;const env=setup({before:f=>start=f,after:f=>stop=f});
(async()=>{await start();try{
 const {page,ctx,errors}=await env.newPage({width:1440,height:900,storage:{'eft2-profile':JSON.stringify({budget:120,kitchen:'shared',goal:'money',diet:{halal:true,allergies:[]}})}});
 try {
  let logo;
  for(const route of ['index.html','app.html#home','app.html#learn','app.html#tools']){
   await page.goto(env.url(route));await page.waitForSelector('h1');
   const sources=await page.evaluate(()=>({header:document.querySelector('.brand-mark').getAttribute('src'),tab:document.querySelector('link[rel=icon]').getAttribute('href')}));
   assert.equal(sources.header,sources.tab,route+' header and tab differ');
   if(logo)assert.equal(sources.header,logo);logo=sources.header;
   assert.equal(await page.locator('.brand-mark').evaluate(e=>e.complete&&e.naturalWidth>0),true);
  }
  const hrefs=selector=>page.locator(selector).evaluateAll(a=>a.map(x=>x.getAttribute('href')).sort());
  assert.deepEqual(await hrefs('.tool-list a'),['#class','#realweek','#receipt','#stalls','#today','#week'].sort());
  assert.equal(await page.locator('#replay-tour').count(),1);
  await page.goto(env.url('app.html#learn'));await page.waitForSelector('.learn-grid');
  assert.deepEqual(await hrefs('.learn-grid a'),['#goals','#swaps','#pairs','#cook','#heroes','#quiz','#plate'].sort());
  assert.equal(await page.locator('#badges-help').count(),1);
  await page.goto(env.url('app.html#home'));await page.waitForSelector('#pick-now');
  for(const link of ['#friends','#plan','#collection','#collection?saved=1'])assert.ok(await page.locator(`main a[href="${link}"]`).count(),link+' missing');
  assert.equal(await page.locator('[data-quick-mood]').count(),3);
  assert.equal(await page.locator('.today-card [data-slot-pill]').count(),4);
  await page.evaluate(()=>localStorage.removeItem('ma-tour-v1'));await page.reload();await page.waitForSelector('.tour-count');
  // Existing profile enters the guided steps; fresh setup's welcome uses the same canonical source.
  await page.evaluate(()=>{localStorage.removeItem('eft2-profile');localStorage.removeItem('ma-tour-v1')});await page.reload();await page.waitForSelector('.tour-welcome');
  assert.equal(await page.locator('.tour-mascot').getAttribute('src'),logo);
  assert.deepEqual(errors,[]);console.log('PASS: shared brand, all hub destinations, Home actions, and first-visit tour brand');
 } finally {await ctx.close();}
}finally{await stop();}})().catch(error=>{console.error(error);process.exitCode=1});
