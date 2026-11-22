import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash, createCipheriv } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { chromium } from 'playwright';
import {TEST_DB04_LAYOUT} from '../tests/helpers/collection-db04-zip-fixture.mjs';

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
async function readLocalState(page){
  return page.evaluate(async()=>{
    const req=indexedDB.open('dreamwishwand-collection',1);
    const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    const value=await new Promise((resolve,reject)=>{
      const get=db.transaction('state','readonly').objectStore('state').get('current');
      get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);
    });
    db.close();
    return value?JSON.parse(value):null;
  });
}
async function waitForLocalState(page,expected){
  await page.waitForFunction(async expected=>{
    const request=indexedDB.open('dreamwishwand-collection',1);
    const db=await new Promise((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const value=await new Promise((resolve,reject)=>{
      const get=db.transaction('state','readonly').objectStore('state').get('current');
      get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);
    });
    db.close();
    if(!value)return false;
    const snapshot=JSON.parse(value);
    const work=snapshot.workspaces.find(x=>x.id===(expected.workspace??snapshot.active));
    if(!work||expected.active&&snapshot.active!==expected.active)return false;
    if(expected.item&&(work.entries[expected.item]?.status??null)!==(expected.status??null))return false;
    if(expected.missing!==undefined&&
      Object.values(work.entries).filter(x=>x.status==='missing').length!==expected.missing)return false;
    if(expected.owned!==undefined&&
      Object.values(work.entries).filter(x=>x.status==='owned').length!==expected.owned)return false;
    return true;
  },expected,{timeout:25000});
}
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
  const saveWasmAssets=[];
  page.on('response',response=>{
    if(response.url().includes('ddv_p1g_codec_bg')&&response.url().endsWith('.wasm'))
      saveWasmAssets.push({url:response.url(),status:response.status()});
  });
  page.on('pageerror',error=>browserErrors.push(String(error)));
  // The landing screen is a visual portal, with unavailable services clearly
  // noninteractive and every page exposing a contextual tutorial.
  const portal=await context.newPage();
  portal.on('pageerror',error=>browserErrors.push(String(error)));
  await portal.goto('http://127.0.0.1:4173/Wand/');
  await portal.locator('.portal-card').filter({hasText:'Collection'}).first().waitFor();
  const faviconHref=await portal.locator('link[rel="icon"]').getAttribute('href');
  assert.match(faviconHref,/DreamwishWand_Large\.svg$/);
  const brand=portal.locator('.shell-brand-mark');
  assert.equal(await brand.count(),1);
  assert.equal(await brand.getAttribute('aria-hidden'),'true');
  assert.match(await brand.locator('img').getAttribute('src'),/DreamwishWand\.svg$/);
  assert.equal(await brand.locator('a,button').count(),0,'the logo is decoration, not navigation');
  assert.equal(await portal.getByRole('link',{name:'ホームへ戻る'}).count(),1);
  for(const src of [faviconHref,await brand.locator('img').getAttribute('src')]){
    const fetched=await portal.request.get(new URL(src,portal.url()).href);
    assert.equal(fetched.status(),200,'the actual supplied brand SVG must be available');
  }

  assert.equal(await portal.locator('.portal-grid .portal-card').count(),7);
  assert.deepEqual(await portal.locator('.portal-grid .portal-card-label strong').allTextContents(),
    ['Decorate','Presets','Gallery','DreamSnaps','Collection','Guide','Community Help Center']);
  assert.equal(await portal.locator('a.portal-card').count(),2);
  assert.equal(await portal.locator('.portal-card.planned').count(),5);
  assert.equal(await portal.locator('.portal-card-community').count(),1);
  assert.match(await portal.locator('.portal-card-community').innerText(),/Community Help Center/);
  assert.equal(await portal.locator('header.site-header .site-nav').count(),0);
  assert.equal(await portal.locator('header.site-header .brand').count(),0);
  assert.equal(await portal.locator('.portal-intro').count(),0);
  assert.equal(await portal.locator('.portal-page h1:not(.visually-hidden)').count(),0);
  // A desktop opening viewport must be a true edge-to-edge application launcher
  // with a substantial Help Center tile, not a narrow footer-like strip.
  await portal.setViewportSize({width:1696,height:900});
  const layout=await portal.evaluate(()=>{
    const page=document.querySelector('.portal-page')?.getBoundingClientRect();
    const support=document.querySelector('.portal-card-community')?.getBoundingClientRect();
    const cards=Array.from(document.querySelectorAll('.portal-card')).map(x=>x.getBoundingClientRect());
    const headerOrder=Array.from(document.querySelectorAll('.site-actions > :is(.header-save-root,.header-account-tools,.header-support-tools,.header-preference-tools)'))
      .map(x=>x.className);
    return {
      fits:Boolean(page&&support&&cards.length===7&&
        support.bottom<=window.innerHeight+1&&
        cards.every(r=>r.top>=0&&r.bottom<=window.innerHeight+1)&&
        document.documentElement.scrollHeight<=window.innerHeight+1),
      fullBleed:Boolean(page&&Math.abs(page.left)<1&&Math.abs(page.right-window.innerWidth)<1),
      communityHeight:support?.height,
      gap:cards[1]?cards[1].left-cards[0].right:null,
      radius:getComputedStyle(document.querySelector('.portal-card')).borderTopLeftRadius,
      headerOrder,
      titleSize:parseFloat(getComputedStyle(document.querySelector('.portal-card-label strong')).fontSize),
      statusSize:parseFloat(getComputedStyle(document.querySelector('.portal-planned-status')).fontSize),
      headerButtonSize:document.querySelector('.header-home-button')?.getBoundingClientRect().width,
      iconToLabelGap:(()=>{
        const icon=document.querySelector('.portal-card-decorate .portal-card-visual')?.getBoundingClientRect();
        const label=document.querySelector('.portal-card-decorate .portal-card-label')?.getBoundingClientRect();
        return icon&&label?label.top-icon.bottom:null;
      })(),
      positions:Object.fromEntries(['decorate','presets','gallery','dreamsnaps','collection','guide','community']
        .map(key=>[key,(()=>{const r=document.querySelector('.portal-card-'+key)?.getBoundingClientRect();return r?{x:r.left,y:r.top,w:r.width,h:r.height}:null;})()]))
    };
  });
  assert.equal(layout.fits,true,'all seven launcher tiles must fit the first desktop viewport');
  assert.equal(layout.fullBleed,true,'home launcher should reach the viewport edges');
  assert.ok(layout.communityHeight>=160,'Community Help Center must be a prominent destination');
  assert.ok(layout.gap>=0&&layout.gap<=3,'service tiles should have only a thin divider');
  assert.equal(layout.radius,'0px','rectangular tiles, not isolated cards');
  assert.deepEqual(layout.headerOrder,['header-save-root','header-account-tools','header-support-tools','header-preference-tools']);
  assert.ok(layout.headerButtonSize>=44,'desktop header controls need 44px targets');
  assert.ok(layout.titleSize>=26,'launcher title typography must be easy to read');
  assert.ok(layout.statusSize>=14,'planned badges must not use tiny text');
  assert.ok(layout.iconToLabelGap>=0&&layout.iconToLabelGap<=38,'icon and label must read as one group');
  const p=layout.positions;
  assert.ok(p.decorate.x<p.presets.x&&p.presets.x<p.collection.x&&p.collection.x<p.guide.x);
  assert.ok(p.gallery.y>p.decorate.y&&p.gallery.x===p.decorate.x);
  assert.ok(p.dreamsnaps.y>p.presets.y&&p.dreamsnaps.x===p.presets.x);
  assert.ok(p.community.x===p.collection.x&&p.community.w>p.collection.w);
  assert.equal(await portal.locator('.portal-planned-status svg').count(),5,'planned badges show a lock next to legible text');
  assert.equal(await portal.locator('.shell-nav-trigger,.shell-shortcuts').count(),0,
    'Home provides the service list; redundant global service switching is absent');
  await portal.setViewportSize({width:390,height:844});
  const mobileLayout=await portal.evaluate(()=>{
    const help=document.querySelector('.portal-card-community')?.getBoundingClientRect();
    const gallery=document.querySelector('.portal-card-gallery')?.getBoundingClientRect();
    const collection=document.querySelector('.portal-card-collection')?.getBoundingClientRect();
    const header=document.querySelector('.header-home-button')?.getBoundingClientRect();
    return Boolean(help&&gallery&&collection&&header&&help.height>=120&&
      gallery.top<collection.top&&header.width>=40&&
      document.documentElement.scrollWidth<=innerWidth+1);
  });
  assert.equal(mobileLayout,true,'mobile launcher needs readable services, creative-first order and no horizontal overflow');
  // Text-only zoom may need vertical scrolling, but must never clip labels horizontally.
  await portal.evaluate(()=>document.documentElement.style.fontSize='200%');
  const textZoomLayout=await portal.evaluate(()=>({
    horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
    smallestStatus:Math.min(...Array.from(document.querySelectorAll('.portal-planned-status'))
      .map(el=>parseFloat(getComputedStyle(el).fontSize))),
    missingLabels:Array.from(document.querySelectorAll('.portal-card-label strong'))
      .filter(el=>!el.getBoundingClientRect().width).length
  }));
  assert.ok(textZoomLayout.horizontalOverflow<=1,'200% text zoom must not create horizontal overflow');
  assert.ok(textZoomLayout.smallestStatus>=28,'200% text zoom should scale planned status text');
  assert.equal(textZoomLayout.missingLabels,0);
  await portal.evaluate(()=>document.documentElement.style.fontSize='');
  // All three themes must be visible and independently actionable, without a popover.
  const themeChoices=portal.locator('.shell-theme-option');
  assert.equal(await themeChoices.count(),3);
  const languageMenu=portal.locator('.language-popover');
  await portal.locator('.header-language-button').click();
  const compactLanguage=await languageMenu.evaluate(el=>{
    const style=getComputedStyle(el);
    const buttons=Array.from(el.querySelectorAll('button'));
    const longest=buttons.reduce((a,b)=>Math.max(a,b.getBoundingClientRect().width),0);
    return {width:el.getBoundingClientRect().width,cols:style.gridTemplateColumns.split(' ').length,
      longest};
  });
  assert.equal(compactLanguage.cols,2,'language picker is two content-sized columns');
  assert.ok(compactLanguage.width<300,'language picker must have no huge blank right edge');
  await portal.locator('.header-language-button').click();

  await portal.setViewportSize({width:320,height:720});
  assert.equal(await portal.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,
    'all three theme icons must fit the narrowest supported viewport');
  assert.equal(await themeChoices.filter({visible:true}).count(),3);
  await portal.locator('.shell-more-root > button').click();
  assert.equal(await portal.locator('.shell-more-menu').getByRole('button',{name:'ヘルプ'}).isVisible(),true,
    'Help stays accessible through compact actions at 320px');
  assert.equal(await portal.locator('.shell-more-menu').getByRole('button',{name:'アカウント'}).isVisible(),true);
  await portal.locator('.shell-more-root > button').click();
  await portal.setViewportSize({width:1696,height:900});

  // Every officially supported DDV interface language must update shell copy and the DOM language.
  const supportedLocales=[
    {code:'ja',label:'日本語',planned:'準備中'},
    {code:'en',label:'English',planned:'Coming soon'},
    {code:'fr',label:'Français',planned:'Bientôt'},
    {code:'it',label:'Italiano',planned:'In arrivo'},
    {code:'de',label:'Deutsch',planned:'In Vorbereitung'},
    {code:'es-ES',label:'Español',planned:'Próximamente'},
    {code:'zh-CN',label:'简体中文',planned:'开发中'},
    {code:'pt-BR',label:'Português',planned:'Em breve'}
  ];
  for(const entry of supportedLocales){
    await portal.locator('.header-language-button').click();
    await portal.locator('.language-popover').getByRole('button',{name:entry.label}).click();
    assert.equal(await portal.evaluate(()=>document.documentElement.lang),entry.code);
    assert.match(await portal.locator('.portal-card.planned').first().innerText(),
      new RegExp(entry.planned));
    assert.equal(await portal.locator('.shell-theme-option').count(),3);
  }
  await portal.reload();
  assert.equal(await portal.evaluate(()=>document.documentElement.lang),'pt-BR',
    'last selected language must persist across reloads');
  await portal.locator('.header-language-button').click();
  await portal.locator('.language-popover').getByRole('button',{name:'日本語'}).click();

  await portal.getByRole('button',{name:'黄昏の日の出'}).click();
  assert.equal(await portal.evaluate(()=>document.documentElement.dataset.wandTheme),'dawn');
  assert.equal(await portal.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light');
  assert.equal(await portal.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--wand-bg').trim()),'#EDE8F8');
  assert.deepEqual(await themeChoices.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-pressed'))),
    ['true','false','false']);
  await portal.getByRole('button',{name:'太陽に照らされた透き通るサンゴ礁'}).click();
  assert.equal(await portal.evaluate(()=>document.documentElement.dataset.wandTheme),'coral');
  assert.equal(await portal.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--wand-bg').trim()),'#E5F8FD');
  await portal.getByRole('button',{name:'魔法の夜空'}).click();
  assert.equal(await portal.evaluate(()=>document.documentElement.dataset.wandTheme),'night');
  assert.equal(await portal.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'dark');
  assert.equal(await portal.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--wand-bg').trim()),'#04143B');
  assert.deepEqual(await themeChoices.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-pressed'))),
    ['false','false','true']);
  await portal.reload();
  await portal.waitForFunction(()=>document.documentElement.dataset.wandTheme==='night');
  await portal.evaluate(()=>localStorage.setItem('dreamwishwand.ui.theme.v1','light'));
  await portal.reload();
  await portal.waitForFunction(()=>document.documentElement.dataset.wandTheme==='coral');
  await portal.evaluate(()=>localStorage.setItem('dreamwishwand.ui.theme.v1','dark'));
  await portal.reload();
  await portal.waitForFunction(()=>document.documentElement.dataset.wandTheme==='night');
  await portal.getByRole('button',{name:'このページのチュートリアル'}).click();
  assert.match(await portal.getByRole('dialog').innerText(),/利用するサービスのタイル/);
  await portal.getByRole('button',{name:'チュートリアルを閉じる'}).click();
  assert.equal(await portal.getByRole('dialog').count(),0);
  // Shared file selection works from Home without pretending the file was parsed.
  const saveInput=portal.locator('input[aria-label="セーブファイルを読み込む"]');
  await saveInput.setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from('{"test":true}')});
  const saveButton=portal.getByRole('button',{name:'セーブファイル管理'});
  assert.equal(await saveButton.count(),1);
  await saveButton.click();
  assert.match(await portal.locator('.shell-save-menu').innerText(),/profile\.json/);
  assert.match(await portal.locator('.shell-save-menu').innerText(),/未解析/);
  assert.equal(await portal.getByRole('button',{name:'編集済みセーブを出力'}).isDisabled(),true);
  const [rawDownload]=await Promise.all([
    portal.waitForEvent('download'),
    portal.getByRole('button',{name:'原本をバックアップ'}).click()
  ]);
  assert.equal(rawDownload.suggestedFilename(),'backup_profile.json');
  await saveButton.click();
  await portal.getByRole('button',{name:'ファイルを閉じる'}).click();
  assert.equal(await portal.getByRole('button',{name:'セーブファイルを読み込む'}).count(),1);
  // Entire-viewport drop loads only a local File reference.
  await portal.evaluate(()=>{
    const dt=new DataTransfer();
    dt.items.add(new File(['sample'],'sample.profile',{type:'application/octet-stream'}));
    window.dispatchEvent(new DragEvent('dragenter',{dataTransfer:dt,bubbles:true,cancelable:true}));
    window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));
  });
  await portal.getByRole('button',{name:'セーブファイル管理'}).click();
  assert.match(await portal.locator('.shell-save-filename').innerText(),/sample\.profile/);
  await portal.getByRole('button',{name:'ファイルを閉じる'}).click();
  await portal.close();
  await page.goto(url);
  await page.getByRole('button',{name:'このページのチュートリアル'}).click();
  assert.match(await page.getByRole('dialog').innerText(),/Collection|セーブ/);
  await page.getByRole('button',{name:'チュートリアルを閉じる'}).click();
  assert.equal(await page.getByRole('button',{name:'セーブファイルを読み込む'}).count(),1);

  try {await page.locator('.facet-card').first().waitFor({timeout:18000});}
  catch(error){console.error('COLLECTION_FIRST_VIEW',await page.locator('body').innerText());throw error;}
  assert.equal(await page.locator('.summary-strip,.source-pill,.collection-head,.personal-bar,.collection-source-details,.saved-store-preview,.empty-inspector').count(),0);
  assert.equal(await page.getByRole('button',{name:'Collectionバックアップ出力'}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Collectionバックアップ復元'}).count(),1);
  const firstCategory=await page.locator('.facet-card').first().boundingBox();
  assert.ok(firstCategory&&firstCategory.y<240,'categories must begin in the first viewport');
  assert.ok(await page.locator('.facet-card').count()>10);
  await page.getByRole('button',{name:/フィルター/}).click();
  assert.equal(await page.getByRole('group',{name:'正式名称の確認状況'}).count(),0);
  await page.getByRole('button',{name:/フィルター/}).click();
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
  const setItemLanguage=async (label)=>{
    // Accessible control names change with locale; stable selectors must work in every language.
    await page.locator('.header-language-button').click();
    await page.locator('.language-popover').getByRole('button',{name:label,exact:true}).click();
  };
  await search.fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  await page.waitForFunction(()=>document.querySelector('.item-card-copy strong')?.textContent?.trim()==='ガラスの靴');
  await setItemLanguage('English');
  await page.waitForFunction(()=>document.querySelector('.item-card-copy strong')?.textContent?.trim()==='Glass Shoe');
  await setItemLanguage('日本語');
  await page.waitForFunction(()=>document.querySelector('.item-card-copy strong')?.textContent?.trim()==='ガラスの靴');
  assert.match(await page.locator('.item-card').first().innerText(),/家具|Furniture/);
  // Both tabs opened the same IndexedDB version. A stale writer must fail closed.
  const staleTab=await context.newPage();
  await staleTab.goto(url);
  await staleTab.locator('.facet-card').first().waitFor();
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
  await page.locator('.facet-card').first().waitFor({timeout:60000});
  const persisted=await readLocalState(page);
  assert.equal(persisted.workspaces[0].entries['40005160'].status,'missing');
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
  await waitForLocalState(page,{missing:matchingCount});
  assert.equal(await page.getByRole('button',{name:'複数選択'}).count(),1);
  await page.getByRole('button',{name:'複数選択'}).click();
  await page.locator('.item-card-body').first().click();
  await page.getByRole('group',{name:'Collectionの一括記録'}).getByRole('button',{name:'所持 / 解放',exact:true}).click();
  await waitForLocalState(page,{owned:1});
  const restoreChooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Collectionバックアップ復元'}).click();
  const chooser=await restoreChooser;
  page.once('dialog',dialog=>void dialog.accept());
  await chooser.setFiles({
    name:'legacy-collection-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))
  });
  await waitForLocalState(page,{item:'40005160',status:'owned'});
  const recoveredPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'バックアップ出力'}).click();
  const recovered=JSON.parse(await readFile(await (await recoveredPromise).path(),'utf8'));
  assert.deepEqual(recovered,seed);
  page.once('dialog',dialog=>void dialog.accept('Second'));
  await page.locator('.collection-record-menu summary').click();
  await page.getByRole('group',{name:'ローカル記録の管理'}).getByRole('button',{name:'新規'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('select[aria-label="ローカル記録を選択"] option').length===2);
  await waitForLocalState(page,{item:'40005160',status:null});
  await page.getByRole('combobox',{name:'ローカル記録を選択'}).selectOption('local-1');
  await waitForLocalState(page,{active:'local-1',item:'40005160',status:'owned'});
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
  await page.locator('.facet-card').first().waitFor({timeout:20000});
  assert.equal(await page.locator('.empty-inspector,.summary-strip,.source-pill').count(),0);
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
  assert.equal(await page.locator('.facet-card').count(),0);
  await page.unrouteAll();
  await page.reload();
  await page.locator('.facet-card').first().waitFor({timeout:20000});

  // First manually mark a known Furniture item missing. Its positive
  // ListInventory amount in the synthetic save must override that manual
  // status, while leaving quantity/favorite and discovery independent.
  const ownershipSearch=page.getByRole('searchbox',{name:/8言語/});
  await ownershipSearch.fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  await page.getByRole('button',{name:/を未所持にする/}).first().click();
  await page.getByRole('button',{name:/を所持済みにする/}).first().waitFor();
  await ownershipSearch.fill('');
  const saveRoot={
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
  };
  const fixture=makeSyntheticP1g(saveRoot);
  await page.locator('input[aria-label="DDVのセーブファイルを選択"]')
    .setInputFiles({name:'synthetic.profile',
      mimeType:'application/octet-stream',buffer:fixture});
  await page.getByRole('status').filter({hasText:'セーブの発見履歴'}).first().waitFor({timeout:25000});
  assert.ok(saveWasmAssets.some(asset=>asset.status===200),
    'Collection real P1G Worker must load native Rust ddv_p1g_codec WASM');
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
  // Headless reader imports native state without visible diagnostics.
  assert.equal(await page.locator('.saved-store-preview,.empty-inspector').count(),0);
  await ownershipSearch.fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  await page.locator('.item-card-body').first().click();
  assert.doesNotMatch(await page.locator('.item-inspector').innerText(),/全体グリッド|DB-04原本/);
  // A world grid reference never increments the manual quantity, or replaces
  // an unobserved owned/missing status in the local Collection backup.
  assert.equal(stateAfter['40005160'].quantity,7);
  assert.equal(stateAfter['40006110'].status,undefined);
  // DB-04 diagnostics remain unit-tested, but are absent from the Collection UI.
  assert.equal(await page.locator('input[aria-label="DB-04 原本ZIPで初期配置との差分を照合"]').count(),0);
  const postSaveBackup=page.waitForEvent('download');
  await page.getByRole('button',{name:'Collectionバックアップ出力'}).click();
  const afterBrowse=JSON.parse(await readFile(await (await postSaveBackup).path(),'utf8'));
  assert.deepEqual(afterBrowse.workspaces.find(x=>x.id==='local-1').entries,stateAfter);
  // Steam v643 can store the same source as raw UTF-8 JSON in a .profile.
  // Rust/WASM must accept both formats without treating the filename as P1G.
  await page.locator('input[aria-label="DDVのセーブファイルを選択"]')
    .setInputFiles({name:'steam-plaintext.profile',
      mimeType:'application/octet-stream',
      buffer:Buffer.from(JSON.stringify(saveRoot),'utf8')});
  await page.waitForFunction(()=>
    !document.querySelector('button[aria-label="セーブファイルを読み込む"]')?.disabled,
    null,{timeout:30000});
  const plainBackupDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Collectionバックアップ出力'}).click();
  const plainBackup=JSON.parse(await readFile(await (await plainBackupDownload).path(),'utf8'));
  assert.deepEqual(plainBackup.workspaces.find(x=>x.id==='local-1').entries,stateAfter,
    'Collection plaintext Steam profile must import exactly as encrypted P1G');
  assert.equal(await page.getByRole('alert').filter({hasText:'読み込めません'}).count(),0);

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
  assert.equal(await page.getByRole('button',{name:'Collectionバックアップ復元'}).isDisabled(),true);
  await page.locator('.collection-record-menu summary').click();
  assert.equal(await page.getByRole('group',{name:'ローカル記録の管理'}).getByRole('button',{name:'名前変更'}).isDisabled(),true);
  await page.locator('.collection-record-menu summary').click();
  await page.evaluate(()=>window.__releaseCollectionSaveRead());
  await page.waitForFunction(()=>
    !document.querySelector('select[aria-label="ローカル記録を選択"]').disabled,
    null,{timeout:30000});
  const lockedReadBackup=page.waitForEvent('download');
  await page.getByRole('button',{name:'バックアップ出力'}).click();
  const lockedReadState=JSON.parse(await readFile(await (await lockedReadBackup).path(),'utf8'));
  assert.equal(lockedReadState.active,'local-1');
  assert.deepEqual(lockedReadState.workspaces.find(x=>x.id==='local-1').entries,stateAfter);

  // Global history remains actionable after leaving Collection.
  const searchHistory=page.locator('.search-box input[type="search"]');
  await searchHistory.fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-state-toggle').length===1);
  const beforeHistory=await readLocalState(page);
  const previousStatus=beforeHistory.workspaces.find(x=>x.id==='local-1').entries['40005160']?.status??null;
  const changedStatus=previousStatus==='owned'?'missing':'owned';
  await page.locator('.item-state-toggle').first().click();
  await waitForLocalState(page,{item:'40005160',status:changedStatus});
  await page.getByRole('button',{name:'編集履歴'}).click();
  assert.match(await page.locator('.shell-history-panel').innerText(),/所持状態:|所持状態：/);
  assert.equal(await page.getByRole('button',{name:'やり直す'}).isDisabled(),true);
  await page.locator('.shell-history-head button').click();
  await page.getByRole('link',{name:'ホームへ戻る'}).click();
  await page.locator('.portal-grid').waitFor();
  await page.getByRole('button',{name:'編集履歴'}).click();
  await page.getByRole('button',{name:'元に戻す'}).click();
  await waitForLocalState(page,{item:'40005160',status:previousStatus});
  // Wait for the CAS write and runtime disposal to finish before Redo.
  await page.getByRole('button',{name:'やり直す'}).click();
  await waitForLocalState(page,{item:'40005160',status:changedStatus});
  // Jump to another point in the Collection timeline without leaving Home.
  assert.ok(await page.locator('.shell-history-entry').count()>1);
  await page.getByRole('button',{name:'World Editor',exact:true}).click();
  assert.match(await page.locator('.shell-history-panel').innerText(),/編集機能の実装後/);
  await page.getByRole('button',{name:'Collection',exact:true}).click();
  await page.locator('.shell-history-head button').click();
  // A save selected on Home must reach the established Collection Rust/WASM
  // Worker, not merely change the toolbar icon.
  assert.equal(changedStatus,'missing','fixture must start without owned state');
  await page.locator('input[aria-hidden="true"][accept*=".profile"]').setInputFiles({
    name:'from-home.profile',mimeType:'application/octet-stream',buffer:fixture
  });
  await page.getByRole('button',{name:'セーブファイル管理'}).waitFor();
  await page.locator('.portal-card').filter({hasText:'Collection'}).first().click();
  await waitForLocalState(page,{item:'40005160',status:'owned'});
  await page.getByRole('status').filter({hasText:'セーブの発見履歴'}).first().waitFor({timeout:30000});
  await page.getByRole('button',{name:'セーブファイル管理'}).click();
  await page.locator('.shell-save-status').getByText(/解析済み/).waitFor({timeout:15000});
  await page.getByRole('button',{name:'ファイルを閉じる'}).click();
  assert.equal(await page.getByRole('button',{name:'セーブファイルを読み込む'}).count(),1);
  await context.close();
  console.log('Collection browser WASM/IndexedDB/migration/search/paging/history/shared-save smoke passed');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  server.stdout.destroy();
  server.stderr.destroy();
}
