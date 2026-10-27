const test=require('node:test');
const assert=require('node:assert/strict');
const {setup}=require('./helpers');
const env=setup(test);
const profile=JSON.stringify({budget:120,kitchen:'shared',goal:'money',diet:{halal:true,allergies:[]}});
const selectors=['#pick-now','.pick-card','.today-card','[data-tab="plan"]','.collection-filters','.learn-grid','.tool-list','#replay-tour'];
async function aligned(page,index){
  await page.waitForTimeout(280);
  const result=await page.evaluate(selector=>{
    const el=[...document.querySelectorAll(selector)].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});
    const r=el.getBoundingClientRect(),s=document.querySelector('.tour-spotlight').getBoundingClientRect(),c=document.querySelector('.tour-card').getBoundingClientRect();
    const p=el.closest('#view')?.getBoundingClientRect();
    const expected={left:Math.max(2,p?.left||0,r.left-6),top:Math.max(2,p?.top||0,r.top-6),right:Math.min(innerWidth-2,p?.right??innerWidth,r.right+6),bottom:Math.min(innerHeight-2,p?.bottom??innerHeight,r.bottom+6)};
    const overlap=Math.max(0,Math.min(c.right,r.right)-Math.max(c.left,r.left))*Math.max(0,Math.min(c.bottom,r.bottom)-Math.max(c.top,r.top));
    return {delta:[s.left-expected.left,s.top-expected.top,s.width-(expected.right-expected.left),s.height-(expected.bottom-expected.top)],card:{left:c.left,top:c.top,right:c.right,bottom:c.bottom},width:innerWidth,height:innerHeight,overlap};
  },selectors[index]);
  assert.ok(result.delta.every(x=>Math.abs(x)<1.5),`step ${index+1} highlight drift: ${JSON.stringify(result)}`);
  assert.ok(result.card.left>=10&&result.card.top>=10&&result.card.right<=result.width-10&&result.card.bottom<=result.height-10,`step ${index+1} tooltip outside viewport`);
  if(index===0||index===3)assert.ok(result.overlap<1,`step ${index+1} tooltip covers its control`);
}
test('tour borders follow exact target geometry, including first step, Plan navigation, scroll and resize',async()=>{
  for(const colorScheme of ['light','dark'])for(const width of [360,390,768,1440]){
    const {page,ctx,errors}=await env.newPage({width,height:900,colorScheme,storage:{'eft2-profile':profile,'ma-tour-v1':'null'}});
    await page.goto(env.url('app.html#home'));await page.waitForSelector('.tour-count');
    for(let i=0;i<8;i++){await page.waitForFunction(n=>document.querySelector('.tour-count')?.textContent===`${n} / 8`,i+1);await aligned(page,i);await page.locator('[data-tour-next]').click();}
    assert.deepEqual(errors,[]);await ctx.close();
  }
  const {page,ctx}=await env.newPage({width:1440,height:900,storage:{'eft2-profile':profile,'ma-tour-v1':'null'}});
  await page.goto(env.url('app.html#home'));await page.waitForSelector('.tour-count');
  for(const width of [390,1024,360,1440]){await page.setViewportSize({width,height:900});await aligned(page,0);await page.evaluate(()=>document.getElementById('view').scrollBy(0,20));await aligned(page,0);}
  await ctx.close();
});
test('header stays fixed, app content alone scrolls, route changes reset content, and landing header stays fixed',async()=>{
  for(const width of [390,1440]){
    const {page,ctx,errors}=await env.newPage({width,height:844,storage:{'eft2-profile':profile}});
    for(const route of ['home','collection','plan','learn','tools','pick?slot=L']){
      await page.goto(env.url('app.html#'+route));await page.waitForSelector('main h1',{state:'attached'});
      await page.evaluate(()=>document.getElementById('view').scrollTo(0,300));
      const state=await page.evaluate(()=>{const m=document.getElementById('view'),h=document.querySelector('.topbar').getBoundingClientRect();return {page:scrollY,scroll:m.scrollTop,possible:m.scrollHeight-m.clientHeight,header:h.top,contentTop:m.getBoundingClientRect().top,headerBottom:h.bottom,horizontal:m.scrollWidth-m.clientWidth}});
      assert.equal(state.page,0,route+' scrolls the document');assert.equal(state.header,0,route+' header moved');assert.ok(Math.abs(state.contentTop-state.headerBottom)<1,route+' content/header mismatch');assert.ok(state.horizontal<=1,route+' horizontal content overflow');
      if(state.possible>0)assert.ok(state.scroll>0,route+' content cannot scroll');
    }
    await page.locator('[data-tab="learn"]:visible').first().click();await page.waitForTimeout(300);assert.equal(await page.locator('#view').evaluate(e=>e.scrollTop),0);
    await page.goto(env.url('index.html'));await page.evaluate(()=>window.scrollTo(0,500));assert.equal(await page.locator('.l-top').evaluate(e=>e.getBoundingClientRect().top),0);
    assert.deepEqual(errors,[]);await ctx.close();
  }
});
