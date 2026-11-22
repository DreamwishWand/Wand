import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash, createCipheriv } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { chromium } from 'playwright';
import {
  makeCollectionDb04ZipFixture,TEST_DB04_LAYOUT,TEST_DB04_GRID
} from '../tests/helpers/collection-db04-zip-fixture.mjs';

// One synthetic P1G, never a real user's save. Browser e2e verifies that
// decoded native discovery booleans flow through Worker -> Rust/WASM -> IDB.
function makeSyntheticP1g(root) {
  const key=Buffer.from('62357168683873614A38556C444A557A545A5864325467366D626F3857386e35','hex');
  const name=Buffer.from('profile');
  const body=Buffer.from(JSON.stringify(root));
  const compressed=deflateRawSync(body);
  let crc=0xffffffff;
  for(const b of body) {
    crc^=b;
    for(let i=0;i<8;i++)crc=(crc&1)?(0xedb88320^(crc>>>1)):(crc>>>1);
  }
  crc=(crc^0xffffffff)>>>0;
  const local=Buffer.alloc(30+name.length+compressed.length);
  local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);
  local.writeUInt16LE(8,8);
  local.writeUInt32LE(crc,14);
  local.writeUInt32LE(compressed.length,18);
  local.writeUInt32LE(body.length,22);
  local.writeUInt16LE(name.length,26);
  name.copy(local,30);
  compressed.copy(local,30+name.length);
  const central=Buffer.alloc(46+name.length);
  central.writeUInt32LE(0x02014b50,0);
  central.writeUInt16LE(20,4);
  central.writeUInt16LE(20,6);
  central.writeUInt16LE(8,10);
  central.writeUInt32LE(crc,16);
  central.writeUInt32LE(compressed.length,20);
  central.writeUInt32LE(body.length,24);
  central.writeUInt16LE(name.length,28);
  name.copy(central,46);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(1,8);
  end.writeUInt16LE(1,10);
  end.writeUInt32LE(central.length,12);
  end.writeUInt32LE(local.length,16);
  const cipher=createCipheriv('aes-256-ecb',key,null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(Buffer.concat([local,central,end])),cipher.final()]);
}

const url = 'http://127.0.0.1:4173/Wand/collection/';
const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173'],{
  env:{...process.env,BASE_PATH:'/Wand'},stdio:'pipe'
});
let output='';
server.stderr.on('data',data=>{output+=String(data);});
server.stdout.on('data',data=>{output+=String(data);});
async function chooseWandLocale(page,code) {
  const names={ja:'日本語',en:'English',fr:'Français',it:'Italiano',de:'Deutsch','es-ES':'Español','zh-CN':'简体中文','pt-BR':'Português'};
  if(!names[code]) throw Error('Unsupported locale '+code);
  await page.getByRole('button',{name:'表示言語を切り替える'}).click();
  await page.locator('#wand-language-menu').getByRole('button',{name:names[code],exact:true}).click();
}

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
  // The landing screen is a visual portal, with unavailable services clearly
  // noninteractive and every page exposing a contextual tutorial.
  const portal=await context.newPage();
  portal.on('pageerror',error=>browserErrors.push(String(error)));
  await portal.goto('http://127.0.0.1:4173/Wand/');
  await portal.locator('.portal-card').filter({hasText:'Collection'}).first().waitFor();
  assert.equal(await portal.locator('.portal-grid .portal-card').count(),6);
  assert.deepEqual(await portal.locator('.portal-grid .portal-card-label strong').allTextContents(),
    ['Decorate','Collection','Guide','Presets','Gallery','DreamSnaps']);
  assert.equal(await portal.locator('a.portal-card').count(),2);
  assert.equal(await portal.locator('.portal-card.planned').count(),4);
  assert.equal(await portal.locator('.portal-community').count(),1);
  assert.match(await portal.locator('.portal-community').innerText(),/Community Help Center/);
  assert.equal(await portal.locator('header.site-header .nav-link.unavailable').count(),4);
  assert.equal(await portal.locator('header.site-header a[href$="/guide/"]').count(),1);
  await portal.getByRole('button',{name:'このページのチュートリアル'}).click();
  assert.match(await portal.getByRole('dialog').innerText(),/6つの主要サービス|カードを選択/);
  await portal.getByRole('button',{name:'チュートリアルを閉じる'}).click();
  assert.equal(await portal.getByRole('dialog').count(),0);
  await portal.close();
  await page.goto(url);
  await page.getByRole('button',{name:'このページのチュートリアル'}).click();
  assert.match(await page.getByRole('dialog').innerText(),/Collection|セーブ/);
  await page.getByRole('button',{name:'チュートリアルを閉じる'}).click();
  assert.equal(await page.getByRole('button',{name:'セーブファイルを読み込む'}).count(),1);

  try {
    await page.locator('.summary-strip').waitFor({timeout:18000});
  } catch(error) {
    console.error('BROWSER_PAGE_CONTENT',await page.locator('body').innerText());
    console.error('BROWSER_PAGE_ERRORS',browserErrors);
    console.error('BROWSER_PAGE_URL',page.url());
    throw error;
  }
  assert.match(await page.locator('.summary-strip').innerText(),/13,202/);
  assert.match(await page.locator('.summary-strip').innerText(),/1 \/ 13,202/);
  assert.match(await page.locator('.source-pill').innerText(),/Steam\s*·\s*v1\.26\.2/);
  assert.equal(await page.getByRole('button',{name:'v1.26.2 データをローカルで開く'}).count(),0);
  assert.match(await page.locator('.collection-source-details').textContent(),/11,492/);
  // All 13,202 native IDs are available. The 1,710 that lack exact
  // source names must remain explicitly unnamed, not invented.
  await page.getByRole('button',{name:/フィルター/}).click();
  await page.getByRole('group',{name:'正式名称の確認状況'})
    .getByRole('button',{name:'名称未確認'}).click();
  await page.waitForFunction(()=>document.querySelector('.result-count')?.textContent?.includes('1,710'));
  assert.match(await page.locator('.item-card-copy').first().innerText(),/名称未確認/);
  await page.getByRole('group',{name:'正式名称の確認状況'})
    .getByRole('button',{name:'すべて'}).click();
  await page.getByRole('button',{name:/フィルター/}).click();
  assert.match(await page.locator('.summary-strip').innerText(),/13,202/);
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
  const language={selectOption:(code)=>chooseWandLocale(page,code)};
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
  await page.waitForFunction(()=>document.querySelector('.item-state-toggle')?.getAttribute('aria-label')?.includes('を所持済みにする'));
  await staleTab.locator('.item-state-toggle').first().click();
  await staleTab.getByRole('alert').filter({hasText:'COLLECTION_STORAGE_CONFLICT'}).waitFor();
  // User-initiated reload must rebase the stale tab on the winning IndexedDB
  // version, then permit a fresh CAS write without a full page reload.
  await staleTab.getByRole('button',{name:'最新の記録を読み直す'}).click();
  await staleTab.getByRole('alert').filter({hasText:'COLLECTION_STORAGE_CONFLICT'}).waitFor({state:'detached'});
  await staleTab.waitForFunction(()=>document.querySelector('.item-state-toggle')?.getAttribute('aria-label')?.includes('を所持済みにする'));
  await staleTab.locator('.item-state-toggle').first().click();
  await staleTab.waitForFunction(()=>document.querySelector('.item-state-toggle')?.getAttribute('aria-label')?.includes('を未所持にする'));
  // The formerly winning tab is now stale: it must fail closed and recover too.
  await page.locator('.item-state-toggle').first().click();
  await page.getByRole('alert').filter({hasText:'COLLECTION_STORAGE_CONFLICT'}).waitFor();
  await page.getByRole('button',{name:'最新の記録を読み直す'}).click();
  await page.getByRole('alert').filter({hasText:'COLLECTION_STORAGE_CONFLICT'}).waitFor({state:'detached'});
  await page.waitForFunction(()=>document.querySelector('.item-state-toggle')?.getAttribute('aria-label')?.includes('を未所持にする'));
  await page.locator('.item-state-toggle').first().click();
  await page.waitForFunction(()=>document.querySelector('.item-state-toggle')?.getAttribute('aria-label')?.includes('を所持済みにする'));
  await staleTab.close();
  await page.reload();
  await page.locator('.summary-strip').waitFor({timeout:60000});
  const now=await page.locator('.summary-strip').innerText();
  assert.match(now,/1/);
  assert.match(now,/13,202/);
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
  // A filtered batch applies to the entire category, not just the 72 or
  // 144 cards currently rendered. Confirm the write and exact owned/missing
  // totals through the real Rust/WASM → IndexedDB → Svelte round-trip.
  const countLabel=await page.locator('.result-count').innerText();
  const matchingCount=Number(countLabel.match(/[0-9][0-9,]*/)?.[0].replaceAll(',',''));
  assert.ok(Number.isSafeInteger(matchingCount)&&matchingCount>72,
    'fixture should have more than the initial 72 results: '+JSON.stringify(countLabel));
  await page.getByRole('button',{name:'複数選択'}).click();
  page.once('dialog',dialog=>void dialog.accept());
  await page.getByRole('group',{name:'Collectionの一括記録'})
    .getByRole('button',{name:'全件を未所持'}).click();
  await page.waitForFunction(count=>{
    const text=document.querySelector('.summary-strip')?.querySelectorAll('strong')[2]?.textContent?.replaceAll(',','').trim();
    return text===String(count);
  },matchingCount,{timeout:20000});
  assert.equal(await page.getByRole('button',{name:'複数選択'}).count(),1);
  await page.getByRole('button',{name:'複数選択'}).click();
  await page.locator('.item-card-body').first().click();
  await page.getByRole('group',{name:'Collectionの一括記録'}).getByRole('button',{name:'所持 / 解放',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.summary-strip')?.textContent?.includes('1 / 13,202'));
  const restoreChooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'復元'}).click();
  const chooser=await restoreChooser;
  page.once('dialog',dialog=>void dialog.accept());
  await chooser.setFiles({
    name:'legacy-collection-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))
  });
  await page.waitForFunction(()=>document.querySelector('.summary-strip')?.textContent?.includes('1 / 13,202'));
  const recoveredPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'バックアップ出力'}).click();
  const recovered=JSON.parse(await readFile(await (await recoveredPromise).path(),'utf8'));
  assert.deepEqual(recovered,seed);
  page.once('dialog',dialog=>void dialog.accept('Second'));
  await page.getByRole('button',{name:'＋ 新規'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('select[aria-label="ローカル記録を選択"] option').length===2);
  assert.equal((await page.locator('.summary-strip').innerText()).includes('0 / 13,202'),true);
  await page.getByRole('combobox',{name:'ローカル記録を選択'}).selectOption('local-1');
  await page.waitForFunction(()=>document.querySelector('.summary-strip')?.textContent?.includes('1 / 13,202'));
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
  assert.match(await page.locator('.summary-strip').innerText(),/13,202/);

  // First manually mark a known Furniture item missing. Its positive
  // ListInventory amount in the synthetic save must override that manual
  // status, while leaving quantity/favorite and discovery independent.
  const ownershipSearch=page.getByRole('searchbox',{name:/8言語/});
  await ownershipSearch.fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  await page.getByRole('button',{name:/を未所持にする/}).first().click();
  await page.getByRole('button',{name:/を所持済みにする/}).first().waitFor();
  await ownershipSearch.fill('');
  const fixture=makeSyntheticP1g({
    GameInfo:{Version:643},
    Player:{
      PrivateName:'must-not-leak',
      ListInventories:{
        '0':{ID:0,CompatibleItemType:'Furniture',Inventory:{
          '40005160':{Amount:2,Marker:'Favorite'},
          '40006110':{Amount:0,Marker:'Hidden'}
        }},
        '4':{ID:4,CompatibleItemType:'Trimming',Inventory:{
          '160000165':{Amount:1,Marker:'Favorite'}
        }}
      },
      CollectionSets:[{GroupData:[
        {State:'secret',GroupsCollectionItems:{
          '40005160':true,'40006110':false,'40003256':true
        }},
        {State:'secret',GroupsCollectionItems:{'40003256':false}}
      ]}]
    },
    World:{Stores:[],GridCollection:{
      Grids:{'1':{ID:1,Objects:{
        '2':{ID:2,ItemID:40005160,X:1},
        '3':{ID:3,ItemID:40005160,X:2}
      }}},
      DiffGrids:{'6':{ID:6,
        GridDefaultLayoutPath:TEST_DB04_LAYOUT,
        GridDefaultLayoutType:'Meta.GridCollection, Meta',
        DefaultLayoutGridID:0,DefaultGridHashCode:-816650372,
        DefaultGridDataHashCode:-410688507,
        RemovedObjects:[5],ModifiedObjects:{
        '5':{ID:5,ItemID:40003256},
        '7':{ID:7,ItemID:40006110}
      }}}
    }}
  });
  await page.locator('input[aria-label="DDVのセーブファイルを選択"]')
    .setInputFiles({name:'synthetic.profile',
      mimeType:'application/octet-stream',buffer:fixture});
  await page.getByRole('status').filter({hasText:'セーブの発見履歴'}).first().waitFor({timeout:25000});
  const afterSaveDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'バックアップ出力'}).click();
  const afterSave=JSON.parse(await readFile(await (await afterSaveDownload).path(),'utf8'));
  const stateAfter=afterSave.workspaces.find(x=>x.id==='local-1').entries;
  assert.equal(stateAfter['40005160'].discovered,true);
  assert.equal(stateAfter['40005160'].status,'owned'); // save positive stock wins over manually marked missing
  assert.equal(stateAfter['40005160'].quantity,7);
  assert.equal(stateAfter['40005160'].favorite,true);
  assert.equal(stateAfter['40006110'].discovered,false);
  assert.equal(stateAfter['40006110'].status,undefined); // zero is not proof of missing
  // Steam 1.26.2 DB-00 calls native Trimming "Wallpaper & Flooring".
  // Verify actual catalog ItemID 160000165 is imported despite that alias.
  assert.equal(stateAfter['160000165'].status,'owned');
  assert.equal(stateAfter['40003256'],undefined);
  assert.equal(stateAfter['99999999'].discovered,true);
  assert.equal(await page.getByRole('alert').filter({hasText:'do-not-leak'}).count(),0);
  assert.match(await page.getByRole('status').filter({hasText:'セーブの発見履歴'}).first().innerText(),/所持 2件/);
  const placedPreview=page.getByRole('region',{name:'セーブ内の家具配置参照'});
  assert.match(await placedPreview.innerText(),/家具の保存参照\s*3/);
  assert.match(await placedPreview.innerText(),/全体グリッド 2件/);
  assert.doesNotMatch(await placedPreview.innerText(),/40003256/);
  await ownershipSearch.fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  await page.locator('.item-card-body').first().click();
  assert.match(await page.locator('.item-inspector').innerText(),/セーブ内の家具配置参照：全体グリッド 2件、差分参照 0件/);
  // A world grid reference never increments the manual quantity, or replaces
  // an unobserved owned/missing status in the local Collection backup.
  assert.equal(stateAfter['40005160'].quantity,7);
  assert.equal(stateAfter['40006110'].status,undefined);
  // Exact-path join uses an independently selected local native DB-04 ZIP.
  // It re-opens the selected synthetic P1G in a second isolated Worker:
  // neither source nor save is uploaded or written to Collection state.
  const worldZip=makeCollectionDb04ZipFixture();
  await page.locator('input[aria-label="DB-04 原本ZIPで初期配置との差分を照合"]')
    .setInputFiles({name:'synthetic-db04.zip',mimeType:'application/zip',buffer:worldZip});
  const joinStatus=page.getByRole('status').filter({hasText:'原本パスによる照合'});
  await joinStatus.first().waitFor({timeout:25000});
  const joinText=await joinStatus.first().innerText();
  assert.match(joinText,/1\s*\/\s*2保存グリッド/);
  assert.match(joinText,/原本オブジェクト参照 3件/);
  assert.match(joinText,/差分適用後の参照 3件/);
  assert.match(await page.getByRole('region',{name:'セーブ内の家具配置参照'}).innerText(),
    /原本の初期参照 1件/);
  assert.match(await page.locator('.item-inspector').innerText(),
    /DB-04の完全一致パスで照合したグリッドの参照/);
  const postJoinBackup=page.waitForEvent('download');
  await page.getByRole('button',{name:'バックアップ出力'}).click();
  const joinSavedState=JSON.parse(await readFile(await (await postJoinBackup).path(),'utf8'));
  assert.deepEqual(joinSavedState.workspaces.find(x=>x.id==='local-1').entries,stateAfter);

  // Hold the next local file read before its Worker starts. During this
  // asynchronous gap the user must not switch, delete, restore or replace
  // the target workspace/catalog that will receive verified save evidence.
  await page.evaluate(()=>{
    const original=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=function(...args){
      if(this.name==='delayed-collection.profile'){
        return new Promise((resolve,reject)=>{
          window.__releaseCollectionSaveRead=()=>original.apply(this,args).then(resolve,reject);
        });
      }
      return original.apply(this,args);
    };
  });
  await page.locator('input[aria-label="DDVのセーブファイルを選択"]')
    .setInputFiles({name:'delayed-collection.profile',
      mimeType:'application/octet-stream',buffer:fixture});
  await page.waitForFunction(()=>typeof window.__releaseCollectionSaveRead==='function');
  const localWorkspaceSelect=page.getByRole('combobox',{name:'ローカル記録を選択'});
  assert.equal(await localWorkspaceSelect.isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'復元'}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'名前変更'}).isDisabled(),true);
  await page.evaluate(()=>window.__releaseCollectionSaveRead());
  await page.waitForFunction(()=>
    !document.querySelector('select[aria-label="ローカル記録を選択"]').disabled,
    null,{timeout:30000});
  const lockedReadBackup=page.waitForEvent('download');
  await page.getByRole('button',{name:'バックアップ出力'}).click();
  const lockedReadState=JSON.parse(await readFile(await (await lockedReadBackup).path(),'utf8'));
  assert.equal(lockedReadState.active,'local-1');
  assert.deepEqual(lockedReadState.workspaces.find(x=>x.id==='local-1').entries,stateAfter);

  await context.close();
  console.log('Collection browser WASM/IndexedDB/migration/search/paging smoke passed');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  server.stdout.destroy();
  server.stderr.destroy();
}
