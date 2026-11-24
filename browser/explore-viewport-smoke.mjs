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
 await page.locator('.site-header .explore-service-toolbar').waitFor();
 assert.equal(await page.locator('[data-scope="outdoor"]').getAttribute('aria-pressed'),'true');
 assert.ok(await page.getByRole('searchbox').isVisible());
 assert.ok(await page.getByRole('button',{name:/所有済みのみ|Owned only/}).isDisabled());
 const cards=page.locator('.catalog-tile'),catalog=page.locator('.catalog');
 await cards.first().waitFor({timeout:30000});
 await page.waitForFunction(()=>{const e=document.querySelector('.catalog');return Number(e?.getAttribute('data-explore-revealed'))>=24;});
 // Wait until the initial viewport has settled, not for the entire catalog.
 await page.waitForTimeout(500);
 const total=Number(await catalog.getAttribute('data-explore-total'));
 const initial=Number(await catalog.getAttribute('data-explore-revealed'));
 const initialCards=await cards.count();
 const ownedId=Number(await cards.first().getAttribute('data-item-id'));
 assert.ok(Number.isSafeInteger(ownedId)&&ownedId>0);
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
 await page.locator('[data-scope="all"]').click();
 // Both special universes use the same one-grid layout as ordinary universes.
 for(const id of ['2000500023','2000500017']){
  await page.getByRole('button',{name:/フィルター|Filters/,exact:true}).click();
  const filter=page.locator('[data-universe-filter="'+id+'"]');
  assert.ok(await filter.isVisible());
  await page.locator('.filter-panel').getByRole('button',{name:/クリア|Clear/,exact:true}).click();
  await filter.click();
  await page.locator('.filter-panel').getByRole('button',{name:/閉じる|Close/,exact:true}).click();
  const section=page.locator('[data-explore-universe="'+id+'"]');
  await section.waitFor();
  assert.equal(await section.locator('[data-explore-grid]').count(),1);
  assert.equal(await section.locator('[data-series-block],[data-series-block-grid],.shelf-row').count(),0);
  assert.equal(await section.locator('h2.universe-heading').count(),1);
 await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>Number(document.querySelector('[data-explore-grid]')?.getAttribute('data-columns'))<=5);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await page.setViewportSize({width:1280,height:720});
 }
 await page.locator('[data-scope="indoor"]').click();
 await page.reload();
 await page.locator('.site-header .explore-service-toolbar').waitFor();
 assert.equal(await page.locator('[data-scope="indoor"]').getAttribute('aria-pressed'),'true');
 await page.evaluate(id=>localStorage.setItem('dreamwishwand.collection.local.v1',JSON.stringify({schema:'wand.collection.local@1',active:'local-1',workspaces:[{id:'local-1',name:'Test',entries:{[id]:{status:'owned'},'99999999':{discovered:true}}}]})),ownedId);
 await page.reload();
 await page.locator('.site-header .explore-service-toolbar').waitFor();
 const ownedButton=page.getByRole('button',{name:/所有済みのみ|Owned only/});
 await page.waitForFunction(()=>{const b=document.querySelector('.explore-service-toolbar button[aria-label="所有済みのみ"],.explore-service-toolbar button[aria-label="Owned only"]');return b&&!b.disabled;});
 await page.locator('[data-scope="all"]').click();
 await ownedButton.click();
 await page.waitForFunction(()=>Number(document.querySelector('.catalog')?.getAttribute('data-explore-total'))>0&&Number(document.querySelector('.catalog')?.getAttribute('data-explore-total'))<10);
 await cards.first().waitFor();
 assert.ok((await cards.evaluateAll(es=>es.map(e=>Number(e.dataset.itemId)))).every(id=>id===ownedId),'only positive ownership is shown');
 assert.deepEqual(errors,[]);
 console.log('EXPLORE_PROGRESSIVE '+JSON.stringify({total,initial,initialCards,initialHeight,after,desktopColumns:firstColumns}));
}finally{await browser?.close();server.kill();}
