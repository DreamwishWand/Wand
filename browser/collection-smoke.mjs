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
  // A fabricated local catalog is rejected without replacing the public
  // source, leaking file contents, or changing the IndexedDB user record.
  const badLocalChooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'v1.26.2 データをローカルで開く'}).click();
  const badLocalFile=await badLocalChooser;
  await badLocalFile.setFiles({name:'invalid-steam-db01.json',mimeType:'application/json',
    buffer:Buffer.from('{"schema":"wand.collection.owner-local-db01@1"}')});
  await page.getByRole('status').filter({hasText:'COLLECTION_LOCAL_DB01_UNRECOGNIZED_FILE'}).waitFor();
  assert.match(await page.locator('.source-pill').innerText(),/Nintendo Switch/);
  assert.match(await page.locator('.summary-strip').innerText(),/12,552/);
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
  // Locale changes must re-query Rust, not leave cached cards in the prior locale.
  // Item 40005160 has source-verified Japanese/English names; it is a unique search match.
  const language=page.getByRole('combobox',{name:'アイテム表示言語'});
  await search.fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  await page.waitForFunction(()=>document.querySelector('.item-card-copy strong')?.textContent?.trim()==='ガラスの靴');
  await language.selectOption('en');
  await page.waitForFunction(()=>document.querySelector('.item-card-copy strong')?.textContent?.trim()==='Glass Shoe');
  await language.selectOption('ja');
  await page.waitForFunction(()=>document.querySelector('.item-card-copy strong')?.textContent?.trim()==='ガラスの靴');
  assert.match(await page.locator('.item-card').first().innerText(),/家具|Furniture/);
  // Both tabs opened the same IndexedDB version. A stale writer must fail closed.
  const staleTab=await context.newPage();
  await staleTab.goto(url);
  await staleTab.locator('.summary-strip').waitFor();
  await staleTab.getByRole('searchbox',{name:/8言語/}).fill('40005160');
  await staleTab.locator('.item-state-toggle').first().waitFor();
  await page.locator('.item-state-toggle').first().click();
  await page.waitForFunction(()=>document.querySelector('.item-state-toggle')?.textContent?.trim()==='＋');
  await staleTab.locator('.item-state-toggle').first().click();
  await staleTab.getByRole('alert').filter({hasText:'COLLECTION_STORAGE_CONFLICT'}).waitFor();
  // User-initiated reload must rebase the stale tab on the winning IndexedDB
  // version, then permit a fresh CAS write without a full page reload.
  await staleTab.getByRole('button',{name:'最新の記録を読み直す'}).click();
  await staleTab.getByRole('alert').filter({hasText:'COLLECTION_STORAGE_CONFLICT'}).waitFor({state:'detached'});
  await staleTab.waitForFunction(()=>document.querySelector('.item-state-toggle')?.textContent?.trim()==='＋');
  await staleTab.locator('.item-state-toggle').first().click();
  await staleTab.waitForFunction(()=>document.querySelector('.item-state-toggle')?.textContent?.trim()==='✓');
  // The formerly winning tab is now stale: it must fail closed and recover too.
  await page.locator('.item-state-toggle').first().click();
  await page.getByRole('alert').filter({hasText:'COLLECTION_STORAGE_CONFLICT'}).waitFor();
  await page.getByRole('button',{name:'最新の記録を読み直す'}).click();
  await page.getByRole('alert').filter({hasText:'COLLECTION_STORAGE_CONFLICT'}).waitFor({state:'detached'});
  await page.waitForFunction(()=>document.querySelector('.item-state-toggle')?.textContent?.trim()==='✓');
  await page.locator('.item-state-toggle').first().click();
  await page.waitForFunction(()=>document.querySelector('.item-state-toggle')?.textContent?.trim()==='＋');
  await staleTab.close();
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
  // Category is the only root navigation. World/Universe are semantic filters.
  await page.locator('.facet-card').first().waitFor();
  assert.match(await page.locator('.facet-card').first().innerText(),/家具|Furniture/);
  assert.equal(await page.locator('.mode-tabs').count(),0);
  await page.getByRole('button',{name:/フィルター/}).click();
  assert.equal(await page.getByRole('combobox',{name:'ワールドで絞り込み'}).count(),1);
  assert.equal(await page.getByRole('combobox',{name:'ユニバースで絞り込み'}).count(),1);
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
  await page.getByRole('button',{name:'複数選択'}).click();
  await page.locator('.item-card-body').first().click();
  await page.getByRole('group',{name:'Collectionの一括記録'}).getByRole('button',{name:'所持 / 解放'}).click();
  await page.waitForFunction(()=>document.querySelector('.summary-strip')?.textContent?.includes('1 / 12,552'));
  const restoreChooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'復元'}).click();
  const chooser=await restoreChooser;
  page.once('dialog',dialog=>void dialog.accept());
  await chooser.setFiles({
    name:'legacy-collection-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))
  });
  await page.waitForFunction(()=>document.querySelector('.summary-strip')?.textContent?.includes('1 / 12,552'));
  const recoveredPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'バックアップ出力'}).click();
  const recovered=JSON.parse(await readFile(await (await recoveredPromise).path(),'utf8'));
  assert.deepEqual(recovered,seed);
  page.once('dialog',dialog=>void dialog.accept('Second'));
  await page.getByRole('button',{name:'＋ 新規'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('select[aria-label="ローカル記録を選択"] option').length===2);
  assert.equal((await page.locator('.summary-strip').innerText()).includes('0 / 12,552'),true);
  await page.getByRole('combobox',{name:'ローカル記録を選択'}).selectOption('local-1');
  await page.waitForFunction(()=>document.querySelector('.summary-strip')?.textContent?.includes('1 / 12,552'));
  await page.setViewportSize({width:390,height:844});
  const byName=page.getByRole('searchbox',{name:/8言語/});
  await byName.fill('Glass Shoe');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  await page.locator('.item-card-body').first().click();
  await page.locator('.item-inspector').getByRole('button',{name:'詳細を閉じる'}).click();
  await page.setViewportSize({width:1280,height:720});
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
  assert.match(await page.locator('.source-pill').innerText(),/Steam\s*·\s*v1\.26\.2/);
  assert.match(await page.locator('.empty-inspector .inspector-hint').innerText(),/Steam\s*·\s*DDV v1\.26\.2/);
  assert.doesNotMatch(await page.locator('.empty-inspector .inspector-hint').innerText(),/Nintendo Switch DDV v1\.25\.0/);
  const releaseSearch=page.getByRole('searchbox',{name:/8言語/});
  await releaseSearch.fill('検証済みの靴');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  assert.match(await page.locator('.item-card').first().innerText(),/検証済みの靴/);
  const releaseBackupPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'バックアップ出力'}).click();
  const releaseBackup=JSON.parse(await readFile(await (await releaseBackupPromise).path(),'utf8'));
  assert.equal(releaseBackup.workspaces[0].entries['99999999'].discovered,true);
  // The explicit backup restore above replaced the edited state with seed (owned).
  assert.equal(releaseBackup.workspaces[0].entries['40005160'].status,'owned');
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
