import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
const hasItemPage=existsSync(new URL('../src/routes/[locale=wandLocale]/[itemId=itemId]/[[slug=entitySlug]]/+page.svelte',import.meta.url));
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
 // Identify the exact current content-addressed decoration projection when present.
 const manifestResponse=await fetch(new URL('/Wand/ddv/item-master/current/index.json',url));
 const manifest=manifestResponse.ok?await manifestResponse.json():null;
 const catalogPin=manifest?.assets?.['explore.json'];
 const pinnedPath=catalogPin?.sha256?'/ddv/item-master/objects/'+catalogPin.sha256+'.json':null;
 let catalogRequests=0;page.on('request',req=>{const path=new URL(req.url()).pathname;if(path.endsWith('/explore.json')||(pinnedPath&&path.endsWith(pinnedPath)))catalogRequests++;});
 await page.goto(url);
 await page.locator('.site-header .explore-service-toolbar').waitFor();
 assert.equal(await page.locator('[data-scope="outdoor"]').getAttribute('aria-pressed'),'true');
 assert.ok(await page.getByRole('searchbox').isVisible());
 assert.ok(await page.getByRole('button',{name:/所有済みのみ|Owned only/}).isDisabled());
 const cards=page.locator('.catalog-tile'),catalog=page.locator('.catalog');
 await cards.first().waitFor({timeout:30000});
 await page.waitForFunction(()=>{const e=document.querySelector('.catalog');const total=Number(e?.getAttribute('data-explore-total'));const slots=[...document.querySelectorAll('[data-explore-chunk]')].reduce((sum,c)=>sum+Number(c.getAttribute('data-chunk-end'))-Number(c.getAttribute('data-explore-chunk')),0);return total>500&&slots===total;});
 const total=Number(await catalog.getAttribute('data-explore-total'));
 const initialCards=await cards.count();
 const ownedId=Number(await cards.first().getAttribute('data-item-id'));
 assert.ok(Number.isSafeInteger(ownedId)&&ownedId>0);
 const initialHeight=await catalog.evaluate(e=>e.getBoundingClientRect().height);
 assert.ok(initialCards>0&&initialCards<200,'initial mounted cards '+initialCards+'/'+total);
 assert.ok(initialHeight>3*720,'full extent reserved before scrolling');
 const first=page.locator('[data-explore-chunk]').first(),last=page.locator('[data-explore-chunk]').last();
 assert.equal(await last.getAttribute('data-mounted'),'false');
 assert.equal(await page.locator('[data-explore-universe="2000500017"] .catalog-tile').count(),0);
 await last.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>{const chunks=document.querySelectorAll('[data-explore-chunk]');return chunks.length>1&&chunks[chunks.length-1].getAttribute('data-mounted')==='true'&&chunks[0].getAttribute('data-mounted')==='false';});
 const after=await cards.count();
 assert.ok(after>0&&after<300,'direct jump keeps mounted cards bounded');
 const endHeight=await catalog.evaluate(e=>e.getBoundingClientRect().height);
 assert.ok(Math.abs(endHeight-initialHeight)<2,'scroll extent unchanged by card mounting');
 await first.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('[data-explore-chunk]')?.getAttribute('data-mounted')==='true');
 // Quick View uses separate art and action rows, and leaves the list present.
 await cards.first().locator('.item').click();
 const quick=page.locator('[data-quick-view]');
 await quick.waitFor();
 assert.equal(await quick.locator('details').count(),0);
 assert.ok(await catalog.isVisible());
 const contained=await quick.locator('.quick-art').evaluate(el=>{const art=el.getBoundingClientRect(),header=el.previousElementSibling.getBoundingClientRect(),actions=el.nextElementSibling.getBoundingClientRect();return art.top>=header.bottom-1&&art.bottom<=actions.top+1;});
 assert.ok(contained);
 await quick.getByRole('button',{name:/閉じる|Close/,exact:true}).click();
 await quick.waitFor({state:'detached'});
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
 // In-app navigation + browser Back restores filters, scope, selection and catalog.
 await page.locator('[data-scope="all"]').click();
 const searchBox=page.getByRole('searchbox');
 const query=await cards.first().locator('.item').getAttribute('aria-label');
 assert.ok(query);
 await searchBox.fill(query);
 await cards.first().waitFor();
 await page.getByRole('button',{name:/ムードボード|Moodboards/,exact:true}).click();
 await cards.first().locator('.item').click();
 await quick.waitFor();
 const selectedId=await quick.getAttribute('data-item-id');
 const requestsBeforeBack=catalogRequests;
 assert.ok(requestsBeforeBack>0,'at least one actual catalog request was observed');
 if(hasItemPage){
   const link=quick.locator('[data-item-page-link]');
   assert.equal(await link.count(),1,'shared route built: actual Item Page link must be available');
   const href=await link.getAttribute('href');
   assert.ok(href&&href.endsWith('/'+selectedId+'/'),'canonical Item ID in link');
   assert.ok(['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'].includes(href.split('/').at(-3)),'explicit locale in link');
   await link.click();
   await page.waitForURL('**/'+selectedId+'/');
   await page.locator('[data-item-page="'+selectedId+'"]').waitFor({timeout:30000});
   await page.locator('.shared-item-page').getByRole('button',{name:/戻る|Back/,exact:true}).click();
 }else{
   assert.ok(await quick.locator('.page-link').isDisabled(),'no broken link before shared route exists');
   await page.locator('.explore-service-toolbar .back').click();
   await page.waitForURL('**/decorate/');
   await page.goBack();
 }
 await page.waitForURL('**/decorate/explore/');
 await quick.waitFor({timeout:30000});
 assert.equal(await searchBox.inputValue(),query);
 assert.equal(catalogRequests,requestsBeforeBack,'catalog is reused on SPA Back');
 assert.equal(await quick.getAttribute('data-item-id'),selectedId);
 assert.equal(await page.locator('.active-filters').count(),1,'restored universe filter remains active');
 assert.equal(await page.locator('[data-scope="all"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.getByRole('button',{name:/ムードボード|Moodboards/,exact:true}).getAttribute('aria-expanded'),'true');
 await quick.getByRole('button',{name:/閉じる|Close/,exact:true}).click();
 await page.locator('.boards').getByRole('button',{name:/閉じる|Close/,exact:true}).click();
 await searchBox.fill('');
 // Back restores the universe filter as intended; clear it explicitly before testing ownership.
 await page.getByRole('button',{name:/フィルター|Filters/,exact:true}).click();
 await page.locator('.filter-panel').getByRole('button',{name:/クリア|Clear/,exact:true}).click();
 await page.locator('.filter-panel').getByRole('button',{name:/閉じる|Close/,exact:true}).click();
 await page.locator('[data-scope="indoor"]').click();
 await page.reload();
 await page.locator('.site-header .explore-service-toolbar').waitFor();
 assert.equal(await page.locator('[data-scope="indoor"]').getAttribute('aria-pressed'),'true');
 // Item Page may already have migrated the legacy storage into IndexedDB.
 // Seed the actual canonical workspace, not an ignored legacy key.
 await page.evaluate(id=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('dreamwishwand-collection',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('state'))request.result.createObjectStore('state');};
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
     const db=request.result,tx=db.transaction('state','readwrite');
     tx.objectStore('state').put(JSON.stringify({schema:'wand.collection.local@1',active:'local-1',workspaces:[{id:'local-1',name:'Test',entries:{[id]:{status:'owned'},'99999999':{discovered:true}}}]}),'current');
     tx.oncomplete=()=>{db.close();resolve();};
     tx.onabort=()=>{db.close();reject(tx.error);};
   };
 }),ownedId);
 await page.reload();
 await page.locator('.site-header .explore-service-toolbar').waitFor();
 const ownedButton=page.getByRole('button',{name:/所有済みのみ|Owned only/});
 await page.waitForFunction(()=>{const b=document.querySelector('.explore-service-toolbar button[aria-label="所有済みのみ"],.explore-service-toolbar button[aria-label="Owned only"]');return b&&!b.disabled;});
 await page.locator('[data-scope="all"]').click();
 await page.waitForFunction(()=>Number(document.querySelector('.catalog')?.getAttribute('data-explore-total'))>500);
 await ownedButton.click();
 assert.equal(await ownedButton.getAttribute('aria-pressed'),'true');
 await page.waitForFunction(()=>Number(document.querySelector('.catalog')?.getAttribute('data-explore-total'))>0&&Number(document.querySelector('.catalog')?.getAttribute('data-explore-total'))<10);
 await cards.first().waitFor();
 assert.ok((await cards.evaluateAll(es=>es.map(e=>Number(e.dataset.itemId)))).every(id=>id===ownedId),'only positive ownership is shown');
 assert.deepEqual(errors,[]);
 console.log('EXPLORE_VIRTUAL '+JSON.stringify({total,initialCards,initialHeight,after,desktopColumns:firstColumns}));
}finally{await browser?.close();server.kill();}
