// All raster brand marks come from the same SVG used by the headers and tour.
// Run with node tools/render-brand-icons.js; set CHROMIUM_PATH for a local browser.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
 try {
  const page=await browser.newPage({deviceScaleFactor:1});
  const svg=fs.readFileSync(path.join(root,'assets/favicon/favicon.svg'),'utf8');
  for(const [size,file] of [[32,'assets/favicon/favicon.png'],[192,'assets/icons/app-192.png'],[512,'assets/icons/app-512.png']]){
   await page.setViewportSize({width:size,height:size});
   await page.setContent(`<style>html,body{margin:0;background:${size===32?'transparent':'#254f3a'}}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
   await page.screenshot({path:path.join(root,file),omitBackground:true});
   console.log(`Generated ${file} (${size} × ${size})`);
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
