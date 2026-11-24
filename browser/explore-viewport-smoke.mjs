import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const url='http://127.0.0.1:4177/Wand/decorate/explore/';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4177','--strictPort'],{env:{...process.env,BASE_PATH:'/Wand'},stdio:'pipe'});
let output='',browser;
server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error(output);await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url);
 const cards=page.locator('.catalog-tile'),catalog=page.locator('.catalog');
 await cards.first().waitFor({timeout:30000});
 await page.waitForFunction(()=>{const e=document.querySelector('.catalog');return Number(e?.getAttribute('data-explore-revealed'))>=24;});
 // Wait until the initial viewport has settled, not for the entire catalog.
 await page.waitForTimeout(500);
 const total=Number(await catalog.getAttribute('data-explore-total'));
 const initial=Number(await catalog.getAttribute('data-explore-revealed'));
 const initialCards=await cards.count();
 const initialHeight=await catalog.evaluate(e=>e.getBoundingClientRect().height);
 assert.ok(total>500);
 assert.ok(initial>0&&initial<200,'initial revealed count '+initial+'/'+total);
 assert.ok(initialCards<=initial);
 assert.ok(initialHeight<3*720,'initial catalog height '+initialHeight);
 assert.equal(await page.locator('[data-explore-universe="2000500017"]').count(),0,'Non IP must not mount initially');
 assert.equal(await page.locator('[data-explore-universe="2000500023"]').count(),0,'DDV must not mount initially');
 const displayed=()=>catalog.getAttribute('data-explore-revealed').then(Number);
 for(let i=0;i<5;i++){
  const before=await displayed();
  await page.evaluate(()=>document.querySelector('[data-explore-frontier]')?.scrollIntoView({block:'end'}));
  await page.waitForFunction(n=>Number(document.querySelector('.catalog')?.getAttribute('data-explore-revealed'))>n,before);
 }
 const after=await displayed();
 assert.ok(after>initial&&after<total);
 assert.ok(await cards.count()<300,'old rows unmount');
 await page.locator('[data-explore-chunk]').first().scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('[data-explore-chunk]')?.getAttribute('data-mounted')==='true');
 const firstColumns=Number(await page.locator('[data-explore-grid]').first().getAttribute('data-columns'));
 await page.getByRole('button',{name:/ムードボード|Moodboards/,exact:true}).click();
 await page.waitForFunction(n=>Number(document.querySelector('[data-explore-grid]')?.getAttribute('data-columns'))<n,firstColumns);
 await page.getByRole('button',{name:/閉じる|Close/,exact:true}).last().click();
 // Both special universes use the same one-grid layout as ordinary universes.
 for(const id of ['2000500023','2000500017']){
  await page.getByRole('button',{name:/フィルター|Filters/,exact:true}).click();
  const filter=page.locator('[data-universe-filter="'+id+'"]');
  if(!await filter.isVisible())await page.locator('.filter-panel details').nth(1).locator('summary').click();
  await page.locator('.filter-panel').getByRole('button',{name:/クリア|Clear/,exact:true}).click();
  await filter.click();
  await page.locator('.filter-panel').getByRole('button',{name:/閉じる|Close/,exact:true}).click();
  const section=page.locator('[data-explore-universe="'+id+'"]');
  await section.waitFor();
  assert.equal(await section.locator('[data-explore-grid]').count(),1);
  assert.equal(await section.locator('[data-series-block],[data-series-block-grid],.shelf-row').count(),0);
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>Number(document.querySelector('[data-explore-grid]')?.getAttribute('data-columns'))<=5);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await page.setViewportSize({width:1280,height:720});
 }
 assert.deepEqual(errors,[]);
 console.log('EXPLORE_PROGRESSIVE '+JSON.stringify({total,initial,initialCards,initialHeight,after,desktopColumns:firstColumns}));
}finally{await browser?.close();server.kill();}
