import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const url = 'http://127.0.0.1:4173/Wand/collection/';
const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173'],{
  env:{...process.env,BASE_PATH:'/Wand'},stdio:'pipe'
});
let output='';
server.stderr.on('data',data=>{output+=String(data);});
server.stdout.on('data',data=>{output+=String(data);});
async function ready() {
  for(let i=0;i<80;i++){
    try {const r=await fetch(url);if(r.ok)return;}
    catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('VITE_PREVIEW_NOT_READY '+output);
}
let browser;
try{
  await ready();
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({acceptDownloads:true});
  const seed={schema:'wand.collection.local@1',active:'local-1',workspaces:[
    {id:'local-1',name:'My Collection',entries:{
      '40005160':{status:'owned',quantity:7,favorite:true},
      '99999999':{discovered:true}
    }}
  ]};
  await context.addInitScript(data=>{
    if(!sessionStorage.getItem('__wand_test_seeded')){
      localStorage.setItem('dreamwishwand.collection.local.v1',JSON.stringify(data));
      sessionStorage.setItem('__wand_test_seeded','yes');
    }
  },seed);
  const page=await context.newPage();
  const browserErrors=[];
  page.on('pageerror',error=>browserErrors.push(String(error)));
  await page.goto(url);
  try {
    await page.locator('.summary-strip').waitFor({timeout:18000});
  } catch(error) {
    console.error('BROWSER_PAGE_CONTENT',await page.locator('body').innerText());
    console.error('BROWSER_PAGE_ERRORS',browserErrors);
    console.error('BROWSER_PAGE_URL',page.url());
    throw error;
  }
  assert.match(await page.locator('.summary-strip').innerText(),/12,552/);
  assert.match(await page.locator('.summary-strip').innerText(),/1 \/ 12,552/);
  const stored=await page.evaluate(async()=>{
    const req=indexedDB.open('dreamwishwand-collection',1);
    const db=await new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const result=await new Promise((resolve,reject)=>{
      const read=db.transaction('state','readonly').objectStore('state').get('current');
      read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);
    });
    db.close();
    return {legacy:localStorage.getItem('dreamwishwand.collection.local.v1'),value:result};
  });
  assert.deepEqual(JSON.parse(stored.legacy),seed);
  assert.equal(JSON.parse(stored.value).workspaces[0].entries['99999999'].discovered,true);
  const search=page.getByRole('searchbox',{name:/8言語/});
  await search.fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  assert.match(await page.locator('.item-card').first().innerText(),/家具|Furniture/);
  await page.locator('.item-state-toggle').first().click();
  await page.waitForFunction(()=>document.querySelector('.item-state-toggle')?.textContent?.trim()==='＋');
  await page.reload();
  await page.locator('.summary-strip').waitFor({timeout:60000});
  const now=await page.locator('.summary-strip').innerText();
  assert.match(now,/1/);
  assert.match(now,/12,552/);
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'バックアップ出力'}).click();
  const download=await downloadPromise;
  const backup=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(backup.workspaces[0].entries['99999999'].discovered,true);
  assert.equal(backup.workspaces[0].entries['40005160'].quantity,7);
  assert.equal(backup.workspaces[0].entries['40005160'].status,'missing');
  await search.fill('');
  await page.getByRole('button',{name:'Category',exact:true}).click();
  const facet=page.locator('.facet-card').filter({hasText:/家具|Furniture/}).first();
  try {
    await facet.click({timeout:10000});
  } catch (error) {
    console.error('COLLECTION_FACET_DEBUG',await page.locator('body').innerText());
    console.error('COLLECTION_FACET_ERRORS',browserErrors);
    throw error;
  }
  await page.locator('.item-card').first().waitFor();
  const before=await page.locator('.item-card').count();
  assert.equal(before,72);
  await page.locator('.more-button').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length>72,{timeout:20000});
  assert.equal(browserErrors.length,0,browserErrors.join('\n'));
  const releaseRoot='ddv/game-db/releases/approved-fixture';
  const publishedItem={
    id:'40005160',names:{en:'Verified Glass Shoe',ja:'検証済みの靴'},
    nameStatus:'verified',category:'Furniture',subcategory:null,
    stateClass:'TRACKED',stateSemantic:'OWNERSHIP_AND_DISCOVERY',
    worlds:['IsDreamlightValley'],universes:['Cinderella'],
    contentIds:['Expansion03'],releaseIds:[],relations:[],sourceRefs:['public-source']
  };
  const shardText=JSON.stringify({
    schema:'wand.game-db.snapshot@1',offset:0,count:1,items:[publishedItem]
  })+'\n';
  const sha=value=>createHash('sha256').update(value).digest('hex');
  const releaseIndex={
    schema:'wand.game-db.release@1',id:'approved-fixture',
    count:1,target:{platform:'Steam',gameVersion:'1.26.2',buildId:null,sourceSha256:'a'.repeat(64)},
    coverage:{scope:'fixture',complete:true,categories:['Furniture']},
    sources:[{id:'public-source',sha256:'b'.repeat(64),visibility:'public_reference'}],
    releases:[],search:[],
    shards:[{file:'items-000.json',offset:0,count:1,bytes:Buffer.byteLength(shardText),sha256:sha(shardText)}]
  };
  const indexText=JSON.stringify(releaseIndex)+'\n';
  const activePointer={
    schema:'wand.game-db.active@1',kind:'db_snapshot',snapshot:'approved-fixture',
    path:releaseRoot,indexSha256:sha(indexText),
    target:{platform:'Steam',gameVersion:'1.26.2',buildId:null},
    publication:'validated_public_snapshot'
  };
  await page.route('**/ddv/game-db/active.json',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify(activePointer)
  }));
  await page.route('**/'+releaseRoot+'/index.json',route=>route.fulfill({
    status:200,contentType:'application/json',body:indexText
  }));
  await page.route('**/'+releaseRoot+'/items-000.json',route=>route.fulfill({
    status:200,contentType:'application/json',body:shardText
  }));
  await page.reload();
  await page.locator('.summary-strip').waitFor({timeout:20000});
  assert.match(await page.locator('.summary-strip').innerText(),/1/);
  const releaseSearch=page.getByRole('searchbox',{name:/8言語/});
  await releaseSearch.fill('検証済みの靴');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  assert.match(await page.locator('.item-card').first().innerText(),/検証済みの靴/);
  const releaseBackupPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'バックアップ出力'}).click();
  const releaseBackup=JSON.parse(await readFile(await (await releaseBackupPromise).path(),'utf8'));
  assert.equal(releaseBackup.workspaces[0].entries['99999999'].discovered,true);
  assert.equal(releaseBackup.workspaces[0].entries['40005160'].status,'missing');
  await page.route('**/'+releaseRoot+'/index.json',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({
      ...releaseIndex,sources:[{id:'private-source',visibility:'private',sha256:'b'.repeat(64)}]
    })+'\n'
  }));
  await page.reload();
  await page.getByRole('alert').filter({hasText:'データの検証または読み込みに失敗'}).waitFor({timeout:20000});
  assert.equal(await page.locator('.summary-strip').count(),0);
  await page.unrouteAll();
  await page.reload();
  await page.locator('.summary-strip').waitFor({timeout:20000});
  assert.match(await page.locator('.summary-strip').innerText(),/12,552/);
  await context.close();
  console.log('Collection browser WASM/IndexedDB/migration/search/paging smoke passed');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  server.stdout.destroy();
  server.stderr.destroy();
}
