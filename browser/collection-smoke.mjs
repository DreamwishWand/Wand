import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash, createCipheriv } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { chromium } from 'playwright';
import {loadCompleteCollection} from '../src/lib/collection/db01-complete-catalog.ts';
import {COLLECTION_TOP_CATEGORIES} from '../src/lib/collection/category-hierarchy.ts';
import {parseCollectionDb01Facets} from '../src/lib/collection/db01-native-facets.ts';
import {buildWorldBrowseIndex,countOwnedInWorldScope} from '../src/lib/collection/world-browse-index.ts';
import {collectionTopCategoryCards} from '../src/lib/collection/category-hierarchy.ts';
import {COLLECTION_WORLD_NAVIGATION} from '../src/lib/collection/scope-options.ts';
import {collectionInterfaceCopy} from '../src/lib/collection/interface-copy.ts';
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
    if(expected.item&&expected.favorite!==undefined&&work.entries[expected.item]?.favorite!==expected.favorite)return false;
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
  const acquisitionAssets=[];
  const questAssets=[];
  const sharedCatalogAssets=[];
  page.on('response',response=>{
    if(response.url().includes('ddv_p1g_codec_bg')&&response.url().endsWith('.wasm'))
      saveWasmAssets.push({url:response.url(),status:response.status()});
    if(/(?:recipe-results|activity-result-paths|native-loot-candidates|native-stall-slots)-1\.26\.2\.json/.test(response.url()))
      acquisitionAssets.push({url:response.url(),status:response.status()});
    if(response.url().endsWith('/quest-conditions-1.26.2-v2.json.gz.b64'))
      questAssets.push({url:response.url(),status:response.status()});
    if(/\/ddv\/game-db\/releases\//.test(response.url()) &&
       /\/(?:index|items-\d+)\.json$/.test(response.url()))
      sharedCatalogAssets.push({url:response.url(),status:response.status()});
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
  assert.equal(await portal.locator('a.portal-card').count(),3);
  assert.equal(await portal.locator('.portal-card.planned').count(),4);
  assert.equal(await portal.locator('a.portal-card-decorate').getAttribute('href'),'/Wand/decorate/');
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
  assert.equal(await portal.locator('.portal-planned-status svg').count(),4,'planned badges show a lock next to legible text');
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

  assert.equal(await themeChoices.evaluateAll(nodes=>nodes.every(node=>!node.hasAttribute('title')&&!node.textContent.trim())),true,
    'theme choices are icon-only; accessible names remain available');
  const assertInactiveThemesBorderless=async()=>{
    await portal.locator('.header-language-button').hover();
    await portal.waitForFunction(()=>{
      const inactive=[...document.querySelectorAll('.shell-theme-option[aria-pressed="false"]')];
      return inactive.length===2&&inactive.every(node=>{
        const style=getComputedStyle(node);
        return style.borderTopColor==='rgba(0, 0, 0, 0)'&&
          style.backgroundColor==='rgba(0, 0, 0, 0)'&&style.boxShadow==='none';
      });
    });
  };
  const assertLightThemeSelection=async (name,expectedBackground)=>{
    const button=portal.getByRole('button',{name,exact:true});
    await button.hover();
    await portal.waitForFunction(({name,bg})=>{
      const selected=document.querySelector('.shell-theme-option[aria-pressed="true"]');
      if(!selected||selected.getAttribute('aria-label')!==name)return false;
      const style=getComputedStyle(selected);
      return style.backgroundColor===bg&&style.color==='rgb(255, 255, 255)';
    },{name,bg:expectedBackground});
    assert.equal(await portal.locator('.shell-theme-option.active').count(),1);
    await portal.locator('.header-language-button').hover();
    assert.equal(await button.evaluate(node=>getComputedStyle(node).backgroundColor),expectedBackground);
  };
  await portal.getByRole('button',{name:'夜明け'}).click();
  assert.equal(await portal.evaluate(()=>document.documentElement.dataset.wandTheme),'dawn');
  assert.equal(await portal.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light');
  assert.equal(await portal.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--wand-bg').trim()),'#EDE8F8');
  assert.deepEqual(await themeChoices.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-pressed'))),
    ['true','false','false']);
  await assertLightThemeSelection('夜明け','rgb(103, 80, 153)');
  await assertInactiveThemesBorderless();
  await portal.getByRole('button',{name:'真昼'}).click();
  assert.equal(await portal.evaluate(()=>document.documentElement.dataset.wandTheme),'coral');
  assert.equal(await portal.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--wand-bg').trim()),'#E5F8FD');
  assert.deepEqual(await themeChoices.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-pressed'))),
    ['false','true','false']);
  await assertLightThemeSelection('真昼','rgb(8, 109, 145)');
  await assertInactiveThemesBorderless();
  await portal.getByRole('button',{name:'真夜中'}).click();
  assert.equal(await portal.evaluate(()=>document.documentElement.dataset.wandTheme),'night');
  assert.equal(await portal.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'dark');
  assert.equal(await portal.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--wand-bg').trim()),'#04143B');
  assert.deepEqual(await themeChoices.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-pressed'))),
    ['false','false','true']);
  await assertInactiveThemesBorderless();
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
  assert.equal(await portal.getByRole('button',{
    name:'編集済みセーブを出力'
  }).count(),0,'no permanently disabled Save export entry');
  assert.equal(await portal.getByRole('button',{
    name:'Save Editor（テスト版）'
  }).count(),1);
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
  // Verify the *service content*, not merely the root attribute or theme icon.
  const assertCollectionThemes=async(target,checks)=>{
    const savedTheme=await target.evaluate(()=>document.documentElement.dataset.wandTheme);
    const buttons=target.locator('.shell-theme-option');
    for(const [i,theme] of ['dawn','coral','night'].entries()){
      await buttons.nth(i).click();
      await target.waitForFunction(theme=>document.documentElement.dataset.wandTheme===theme,theme);
      for(const [selector,property,token] of checks){
        const element=target.locator(selector).first();
        await element.waitFor({state:'attached'});
        const colors=await element.evaluate((node,{property,token})=>{
          const probe=document.createElement('div');
          probe.style.setProperty(property,'var('+token+')');
          document.body.append(probe);
          const expected=getComputedStyle(probe).getPropertyValue(property);
          const actual=getComputedStyle(node).getPropertyValue(property);
          probe.remove();
          return {actual,expected};
        },{property,token});
        assert.equal(colors.actual,colors.expected,theme+' '+selector+' '+property+' follows '+token);
      }
    }
    const restore=['dawn','coral','night'].indexOf(savedTheme);
    if(restore>=0)await buttons.nth(restore).click();
  };
  await assertCollectionThemes(page,[
    ['.collection-workspace','background-color','--wand-bg'],
    ['.workspace-top','background-color','--wand-header'],
    ['.collection-scope-toolbar','background-color','--wand-header'],
    ['.search-box','background-color','--wand-control'],
    ['.search-box input','color','--wand-text'],
    ['.facet-card','background-color','--wand-surface'],
    ['.facet-card strong','color','--wand-text'],
    ['.collection-axis-switch button.chosen','background-color','--wand-selected'],
  ]);
  const firstCategory=await page.locator('.facet-card').first().boundingBox();
  assert.ok(firstCategory&&firstCategory.y<240,'categories must begin in the first viewport');
  const parents=page.locator('.collection-top-category');
  await parents.first().waitFor({timeout:30000});
  assert.equal(await parents.count(),30);
  assert.equal(await page.locator('.collection-native-activity,.collection-native-subtype').count(),0,
    'leaf categories never appear at root');
  assert.equal(await page.locator('.collection-original-category-grid').count(),0);
  assert.equal(await parents.filter({hasText:/口ひげ|あごひげ/}).count(),0);
  const completeIndex=(await loadCompleteCollection('/Wand',async url=>
    new Response(await readFile('static/'+url.replace(/^\/Wand\//,'')),{status:200}))).index;
  const totalText=completeIndex.sourceItemCount.toLocaleString('ja');
  const browseAll=page.locator('.collection-categories-heading button');
  assert.ok((await browseAll.innerText()).includes(totalText));
  await browseAll.click();
  await page.locator('.item-card').first().waitFor({timeout:12000});
  assert.ok((await page.locator('.result-count').innerText()).includes(totalText));
  const returnRoot=async()=>{
    await page.locator('.breadcrumbs').getByRole('button',{name:'カテゴリ',exact:true}).click();
    await parents.first().waitFor();
  };
  await returnRoot();
  assert.deepEqual(await parents.evaluateAll(cards=>cards.map(card=>card.getAttribute('data-top-category'))),[
    'furniture','landscaping','roads-fences','interior','buildings','environment',
    'clothing','appearance','touch-of-magic','photo-mode','tools','upgrades',
    'characters','companions','adventure-companions','critters','mounts','crafting','meals','ingredients',
    'foraging','fish','gems','timebending','memories','board-game','snippets',
    'lorekeeper-tales','quest-puzzles','exhibition'
  ]);
  const allScope=buildWorldBrowseIndex(completeIndex).get('');
  const initialOwned=countOwnedInWorldScope(completeIndex,allScope,seed.workspaces[0].entries).root;
  for(const parent of ['furniture','clothing','appearance','meals','ingredients','fish','roads-fences','interior','mounts','characters','crafting']){
    const root=page.locator(`[data-top-category="${parent}"]`);
    const progress=root.locator('.collection-category-progress');
    assert.equal(Number(await progress.getAttribute('data-progress-total')),allScope.progressTotals.get(parent));
    assert.equal(Number(await progress.getAttribute('data-progress-owned')),initialOwned.get(parent)??0,parent+' seeded collection progress');
    await root.click();
    await page.locator('.item-card').first().waitFor({timeout:12000});
    assert.equal(await page.locator('.collection-native-subtype').count(),0,'one click opens actual items');
    const rootIds=completeIndex.itemsByRoot.get(parent)??[];
    assert.ok((await page.locator('.result-count').innerText()).includes(rootIds.length.toLocaleString('ja')));
    const id=Number(await page.locator('.item-card').first().getAttribute('data-item-id'));
    assert.ok(rootIds.includes(id));
    if(['furniture','clothing','ingredients','crafting','mounts','meals'].includes(parent))
      assert.ok(await page.locator('.collection-item-universe-heading').count()>0,'inline category-specific group headings');
    if(parent==='meals')assert.equal(await page.locator('.collection-item-world-heading').count(),0,'world sorting must not introduce headings or grid breaks');
    await returnRoot();
  }
  // Toggle the existing seeded owned item and restore it, preserving the
  // fixture for subsequent save-import and history checks.
  const furnitureCard=page.locator('[data-top-category="furniture"]');
  const initialFurniture=initialOwned.get('furniture')??0;
  const testProgressSearch=page.getByRole('searchbox',{name:/8言語/});
  const seedToggle=page.locator('.item-card[data-item-id="40005160"] .item-state-toggle');
  await furnitureCard.click();
  await testProgressSearch.fill('40005160');
  await seedToggle.waitFor();
  await seedToggle.click();
  await page.waitForFunction(()=>!document.querySelector('.item-card[data-item-id="40005160"] .item-state-toggle')?.classList.contains('owned'));
  await waitForLocalState(page,{item:'40005160',status:'missing'});
  await returnRoot();
  assert.equal(Number(await furnitureCard.locator('.collection-category-progress').getAttribute('data-progress-owned')),initialFurniture-1);
  await furnitureCard.click();
  await testProgressSearch.fill('40005160');
  await seedToggle.waitFor();
  await seedToggle.click();
  await waitForLocalState(page,{item:'40005160',status:'owned'});
  await returnRoot();
  assert.equal(Number(await furnitureCard.locator('.collection-category-progress').getAttribute('data-progress-owned')),initialFurniture);
  assert.equal(await page.locator('[data-top-category="buildings"]').isDisabled(),
    !(completeIndex.itemsByRoot.get('buildings')?.length));
  // A failed v3 source asset must fail closed; reloading retries verified data.
  const retryContext=await browser.newContext();
  const retryPage=await retryContext.newPage();
  let failedCategoryFetch=false;
  await retryPage.route('**/ddv/item-master/steam-1.26.2-complete/collection-facets.json',route=>{
    if(!failedCategoryFetch){failedCategoryFetch=true;return route.abort('failed');}
    return route.continue();
  });
  await retryPage.goto(url);
  await retryPage.getByRole('alert').filter({hasText:/データの検証または読み込みに失敗/}).waitFor({timeout:30000});
  assert.equal(failedCategoryFetch,true);
  await retryPage.reload();
  await retryPage.locator('.collection-top-category').first().waitFor({timeout:30000});
  assert.equal(await retryPage.locator('.collection-top-category').count(),30);
  await retryContext.close();
  // DB-01's original Disney universe tags are now a working, cross-category
  // browser axis; they remain distinct from unverified Collection membership.
  assert.equal(await page.getByRole('button',{name:'ワールド表示'}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'ユニバース表示'}).click();
  assert.equal(await page.getByRole('button',{name:'ユニバース表示'}).getAttribute('aria-pressed'),'true');
  await page.locator('.collection-universe-card').first().waitFor({timeout:18000});
  assert.equal(await page.locator('.collection-universe-card').count(),69,
    'all 67 original universe definitions plus untagged must be visible');
  assert.match(await page.locator('.collection-axis-notice').innerText(),/原本の作品タグ/);
  assert.match(await page.locator('.collection-universe-card').first().innerText(),/その他/);
  assert.match(await page.locator('.collection-universe-card').nth(1).innerText(),
    /ドリームライトバレー/);
  // A source-defined universe with no linked published Item IDs is a real
  // empty category, not a missing tag nor a fabricated Item relationship.
  const rayaCard=page.locator('.collection-universe-card').filter({
    hasText:'ラーヤと龍の王国'
  });
  assert.equal(await rayaCard.count(),1);
  await rayaCard.click();
  if(await page.locator('.collection-universe-section .item-card').count()===0){
    await page.waitForFunction(()=>document.querySelector('.empty-panel,.collection-universe-section .item-card'));
  }
  await page.getByRole('button',{name:'ユニバース一覧'}).first().click();
  await page.locator('.collection-universe-card').nth(1).click();
  await page.locator('.collection-universe-section .item-card').first().waitFor({timeout:15000});
  assert.ok(await page.locator('.collection-universe-section').count()>0,
    'choosing a universe must directly display category-grouped items');
  const sourceUniverseIds=await page.locator('.collection-universe-section .item-card').evaluateAll(cards=>
    cards.map(card=>Number(card.getAttribute('data-item-id'))));
  assert.ok(sourceUniverseIds.every(Number.isSafeInteger));
  await page.getByRole('button',{name:'ワールド表示'}).click();
  // DB-02's six original acquisition categories are connected to the same
  // complete Item-ID result set, not just the first infinite-scroll page.
  await page.getByRole('button',{name:/フィルター/}).click();
  const acquisitionFilter=page.getByRole('combobox',{name:'入手元'});
  await acquisitionFilter.waitFor({timeout:15000});
  await acquisitionFilter.selectOption('star_path');
  await page.locator('.item-card').first().waitFor({timeout:12000});
  const starPathIds=await page.evaluate(async()=>{
    const response=await fetch('/Wand/acquisition/public/db01-item-acquisition-1.26.2.json');
    if(!response.ok)throw Error('DB01_ACQUISITION_FETCH_FAILED');
    const doc=await response.json();
    return doc.items.filter(row=>row[1].some(group=>group[0]==='star_path'))
      .map(row=>String(row[0]));
  });
  const starPathSet=new Set(starPathIds);
  const displayedIds=await page.locator('.item-card').evaluateAll(cards=>
    cards.map(card=>card.getAttribute('data-item-id')));
  assert.ok(displayedIds.length>0,'source-linked Star Path must return Item IDs');
  assert.ok(displayedIds.every(id=>starPathSet.has(id)),
    'acquisition filtering must use exact DB-02 → DB-01 Item ID crosswalk');
  await acquisitionFilter.selectOption('');
  await page.getByRole('button',{name:/フィルター/}).click();
  assert.ok(await page.locator('.facet-card').count()>=10);
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
  // Source-authenticated public Item IDs open directly without Category,
  // World or Universe membership and without mutating the user's records.
  const deep=await context.newPage();
  await deep.goto(url+'?item=40005160');
  await deep.locator('.item-inspector h2').waitFor({timeout:30000});
  assert.match(await deep.locator('.item-inspector h2').innerText(),/ガラスの靴|Glass Shoe/);
  // Source-native DB-01 Item master is joined only when an item is opened.
  // The pinned 1.26.2 master resolves exact original Tags and 8-language
  // names by Item ID without treating source Tags as Collection membership.
  const db01Details=deep.locator('.collection-item-master[data-item-id="40005160"]');
  await db01Details.waitFor({timeout:30000});
  assert.match(await db01Details.innerText(),/White/);
  await db01Details.locator('summary').click();
  assert.match(await db01Details.innerText(),/Bedroom/);
  assert.match(await db01Details.innerText(),/Glass Shoe/);
  await assertCollectionThemes(deep,[
    ['.item-inspector','background-color','--wand-header'],
    ['.item-inspector h2','color','--wand-text'],
    ['.inspector-meta','color','--wand-muted'],
    ['.ownership-actions button','color','--wand-text'],
    ['.collection-item-master','color','--wand-text'],
    ['.inspector-art','background-color','--wand-surface-raised'],
  ]);

  assert.equal(await deep.getByRole('searchbox',{name:/8言語/}).inputValue(),'40005160');
  assert.equal(await deep.getByRole('button',{name:'アイテムへのリンクをコピー'}).count(),1);
  assert.equal(new URL(deep.url()).searchParams.get('item'),'40005160');
  const initialDeepStore=await readLocalState(deep);
  await deep.getByRole('button',{name:'詳細を閉じる'}).click();
  assert.equal(new URL(deep.url()).searchParams.has('item'),false);
  await deep.goBack();
  await deep.locator('.item-inspector h2').waitFor();
  assert.equal(new URL(deep.url()).searchParams.get('item'),'40005160');
  await deep.goForward();
  await deep.waitForFunction(()=>!document.querySelector('.item-inspector'));
  assert.equal(new URL(deep.url()).searchParams.has('item'),false);
  await deep.goto(url+'?item=99999999');
  await deep.locator('.facet-card').first().waitFor();
  assert.equal(await deep.locator('.item-inspector').count(),0,
    'an Item ID absent from the verified Rust catalog cannot open details');
  assert.equal(new URL(deep.url()).searchParams.has('item'),false);
  await deep.goto(url+'?item=40005160&item=40005160');
  await deep.locator('.facet-card').first().waitFor();
  assert.equal(await deep.locator('.item-inspector').count(),0,
    'ambiguous repeated Item IDs must not open an inspector');
  assert.equal(new URL(deep.url()).searchParams.has('item'),false);
  assert.deepEqual(await readLocalState(deep),initialDeepStore,
    'navigating Item links must never write the manual Collection record');
  // Original Steam v1.26.2 Item 40001569 has an exact native OnlineCategory
  // time_limited source label. It is a distribution CATEGORY, never proof of
  // a current sale, exclusive event reward or intrinsically limited Item.
  await deep.goto(url+'?item=40001569');
  await deep.locator('.item-inspector h2').waitFor({timeout:30000});
  const distributionPanel=deep.locator('.collection-acquisition');
  await distributionPanel.locator('summary').click();
  await distributionPanel.locator('.distribution-groups li').first()
    .waitFor({timeout:60000});
  const rows=await distributionPanel.locator('.distribution-groups li').allTextContents();
  assert(rows.some(row=>row.includes('現実時間・オンラインに連動する配布元')
    &&row.includes('原本のカテゴリ分類')),
    'the original 1.26.2 OnlineCategory must remain source category evidence');
  assert(!rows.join(' ').includes('期間限定アイテム'),
    'a source distribution route never makes the Item intrinsically time limited');
  await deep.locator('.header-language-button').click();
  await deep.locator('.language-popover').getByRole('button',{name:'English',exact:true}).click();
  await deep.waitForFunction(()=>document.querySelector('.distribution-groups')?.textContent
    ?.includes('Real-world and online distribution sources'));
  assert.equal(await distributionPanel.getAttribute('open'),'',
    'switching language must not close the source evidence');
  await deep.locator('.header-language-button').click();
  await deep.locator('.language-popover').getByRole('button',{name:'日本語',exact:true}).click();
  assert.deepEqual(await readLocalState(deep),initialDeepStore,
    'source distribution viewing cannot modify a personal Collection record');
  await deep.close();
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
  assert.equal(await page.locator('.item-card-copy strong').first().innerText(),'ガラスの靴');
  // A local favorite must be searchable independently of ownership and persist
  // through Rust/WASM -> IndexedDB. Unstarring the only match removes it.
  const starFilter=page.getByRole('button',{name:'お気に入りのみ表示'});
  assert.equal(await starFilter.getAttribute('aria-pressed'),'false');
  await starFilter.click();
  assert.equal(await starFilter.getAttribute('aria-pressed'),'true');
  await search.fill('');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  assert.match(await page.locator('.item-card-copy strong').first().innerText(),/ガラスの靴/);
  await page.locator('.item-card-body').first().click();
  // DB-00 native acquisition evidence is opt-in, SHA-verified and read in a
  // TypeScript Worker. Opening one published Item must never claim live stock.
  const acquisitionPanel=page.locator('.collection-acquisition');
  assert.equal(await acquisitionPanel.count(),1);
  assert.equal(acquisitionAssets.length,0,
    'source-only acquisition files must remain lazy until the panel opens');
  await acquisitionPanel.locator('summary').click();
  await acquisitionPanel.locator('.evidence-status').filter({
    hasText:/原本上の経路・候補です|現在の販売・入手可否は未確認です|経路は重複します|登録済みの入手元情報はありません/
  }).waitFor({timeout:60000});
  assert.equal(await acquisitionPanel.getByRole('alert').count(),0);
  for(const file of [
    'recipe-results-1.26.2.json','activity-result-paths-1.26.2.json',
    'native-loot-candidates-1.26.2.json','native-stall-slots-1.26.2.json'
  ]){
    const loaded=acquisitionAssets.filter(entry=>entry.url.endsWith('/'+file));
    assert.equal(loaded.length,1,file+' must be loaded only on demand');
    assert.equal(loaded[0].status,200,'source asset must be published');
  }
  // Acquisition initializes a single SHA-verified public DB-00 reader.
  // The Quest accordion must reuse that Worker, not re-download 13k Items.
  const sharedCatalogAfterAcquisition=sharedCatalogAssets.length;
  assert(sharedCatalogAfterAcquisition>0,
    'the public DB-00 source is actually loaded during Collection browsing');
  // Source classification lives in the Worker and must remain stable while
  // the eight localized panel labels update without another download.
  const relatedQuests=page.locator('.collection-related-quests');
  assert.equal(await relatedQuests.count(),1);
  assert.equal(questAssets.length,0,
    'Quest evidence must not fetch optional conditions before opening');
  await relatedQuests.locator('summary').click();
  await relatedQuests.locator('.quest-evidence-status').filter({
    hasText:/原本の静的な参照です|原本に関連クエストの記録はありません/
  }).waitFor({timeout:60000});
  assert.equal(await relatedQuests.getByRole('alert').count(),0);
  assert.equal(questAssets.length,1);
  assert.equal(questAssets[0].status,200);
  assert.equal(sharedCatalogAssets.length,sharedCatalogAfterAcquisition,
    'related Quests must reuse the existing DB-00 source Worker and Item shards');
  for(const anchor of await relatedQuests.locator('.quest-evidence-section a').all()){
    const href=await anchor.getAttribute('href');
    assert(/^\/Wand\/guide\/quests\/\?quest=[1-9][0-9]*&(target|item)=40005160$/.test(href),
      'only exact native Quest IDs and the selected Item ID may be linked');
  }
  const acquisitionFetchCount=acquisitionAssets.length;
  const questFetchCount=questAssets.length;
  for(const {language,title,questTitle} of [
    {language:'English',title:'How to obtain',questTitle:'Related quests'},
    {language:'Français',title:'Comment obtenir',questTitle:'Quêtes associées'},
    {language:'Italiano',title:'Come ottenerlo',questTitle:'Missioni collegate'},
    {language:'Deutsch',title:'Bezugsquellen',questTitle:'Zugehörige Quests'},
    {language:'Español',title:'Cómo conseguirlo',questTitle:'Misiones relacionadas'},
    {language:'简体中文',title:'获取方式',questTitle:'相关任务'},
    {language:'Português',title:'Como obter',questTitle:'Missões relacionadas'},
    {language:'日本語',title:'入手元',questTitle:'関連クエスト'}
  ]){
    await setItemLanguage(language);
    await page.waitForFunction(expected=>
      document.querySelector('.collection-acquisition summary')?.textContent?.trim()===expected,title);
    await page.waitForFunction(expected=>
      document.querySelector('.collection-related-quests summary')?.textContent?.trim()===expected,questTitle);
    const copy=collectionInterfaceCopy(({
      'English':'en','Français':'fr','Italiano':'it','Deutsch':'de',
      'Español':'es-ES','简体中文':'zh-CN','Português':'pt-BR','日本語':'ja'
    })[language]);
    assert.equal(await page.locator('.toolbar input[type=search]').getAttribute('aria-label'),
      copy.searchLabel,'search accessibility must match the active language');
    assert.equal(await page.locator('.toolbar input[type=search]').getAttribute('placeholder'),
      copy.searchPlaceholder,'search placeholder must match the active language');
    assert.equal(await page.locator('.collection-favorites-filter').getAttribute('aria-label'),
      copy.favoritesOnly,'favorites filter must match the active language');
    assert.equal(await page.locator('.item-inspector button[title]').first().getAttribute('title'),
      copy.copyLink,'item permalink action must match the active language');
    assert.deepEqual(await page.locator('.ownership-actions button').allTextContents(),
      [copy.owned,copy.missing,copy.unrecorded],
      'manual status actions must preserve their meaning in all 8 languages');
    assert.equal(await page.locator('.toolbar .subtle-button').innerText(),
      copy.filters+' ▾','filter control must update without resetting the Item');
    assert.equal(await acquisitionPanel.getAttribute('open'),'',
      'locale switch must not close the acquisition panel');
    assert.equal(await relatedQuests.getAttribute('open'),'',
      'locale switch must not close the related Quest panel');
    assert.equal(acquisitionAssets.length,acquisitionFetchCount,
      'locale change must never refetch immutable acquisition evidence');
    assert.equal(questAssets.length,questFetchCount,
      'locale change must never refetch immutable Quest evidence');
  }
  await page.getByRole('checkbox',{name:'お気に入り'}).uncheck();
  await waitForLocalState(page,{item:'40005160',status:'owned',favorite:false});
  await page.locator('.empty-panel').waitFor();
  assert.equal(await starFilter.getAttribute('aria-pressed'),'true');
  await starFilter.click();
  assert.equal(await starFilter.getAttribute('aria-pressed'),'false');
  await search.fill('40005160');
  await page.locator('.item-card-body').first().click();
  await page.getByRole('checkbox',{name:'お気に入り'}).check();
  await waitForLocalState(page,{item:'40005160',status:'owned',favorite:true});
  await page.getByRole('button',{name:'詳細を閉じる'}).click();
  // Searching across categories uses a single stable Rust-sorted grid.
  // New pages must append at the bottom without moving the initial 72 cards.
  await search.fill('a');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===72);
  assert.equal(await page.locator('.result-group-title').count(),0);
  const initialOrder=await page.locator('.item-card').evaluateAll(cards=>
    cards.map(card=>card.getAttribute('data-item-id')));
  assert.equal(initialOrder.length,72);
  assert.equal(new Set(initialOrder).size,72);
  await page.locator('.more-button').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length>=144);
  const afterAppend=await page.locator('.item-card').evaluateAll(cards=>
    cards.map(card=>card.getAttribute('data-item-id')));
  assert.deepEqual(afterAppend.slice(0,72),initialOrder,
    'cross-category pagination must not reorder or displace previous results');
  assert.equal(new Set(afterAppend).size,afterAppend.length);
  await search.fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
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
  // Unknown/unrecorded must be distinct from an explicitly marked missing item.
  // Clear directly from an empty search result, with no technical explanation.
  await page.getByRole('button',{name:/フィルター/}).click();
  const statusControls=page.getByRole('group',{name:'収集状況（手動記録）'});
  await statusControls.getByRole('button',{name:'未記録'}).click();
  await search.fill('40005160');
  await page.locator('.empty-panel').waitFor();
  assert.match(await page.locator('.empty-panel').innerText(),/該当するアイテムはありません/);
  assert.doesNotMatch(await page.locator('.empty-panel').innerText(),/未記録のアイテムは/);
  assert.equal(await statusControls.getByRole('button',{name:'未記録'}).getAttribute('aria-pressed'),'true');
  await page.locator('.empty-panel').getByRole('button',{name:'条件を解除'}).click();
  await page.locator('.facet-card').first().waitFor();
  await search.fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  assert.equal(await page.locator('.breadcrumbs').getByRole('button',{name:'カテゴリ'}).count(),1);
  assert.doesNotMatch(await page.locator('.result-count').innerText(),/所持記録/);
  await page.locator('.breadcrumbs').getByRole('button',{name:'カテゴリ'}).click();
  await page.locator('.facet-card').first().waitFor();
  await page.getByRole('button',{name:/フィルター/}).click();
  await search.fill('');
  // The current published 1.26.2 snapshot lacks reviewed per-item
  // CollectionArea/Universe membership. Never expose dead-end filters or
  // incorrectly treat source Tag associations as game-screen membership.
  await page.locator('.facet-card').first().waitFor();
  assert.ok(await page.locator('.collection-detail-category-grid .facet-card').count()>=10);
  assert.equal(await page.locator('.mode-tabs').count(),0);
  assert.equal(await page.locator('.collection-scope-toolbar').count(),1);
  // Measure the actual click-to-frame path after the index has loaded.
  // This is a diagnostic, not a hardware-dependent timing assertion.
  const worldSwitchSamples=await page.evaluate(async()=>{
    const buttons=[...document.querySelectorAll('.collection-scope-scroll button:not([disabled])')];
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    const samples=[];
    for(const button of [...buttons.slice(1),buttons[0],buttons[1],buttons[0]]){
      const start=performance.now();
      button.click();
      const handlerMs=performance.now()-start;
      await frame();await frame();
      samples.push({world:button.textContent?.trim(),handlerMs,
        frameMs:performance.now()-start,
        categories:[...document.querySelectorAll('.collection-top-category')].map(card=>card.getAttribute('data-top-category')),
        disabled:document.querySelectorAll('.collection-top-category[disabled]').length,
        items:document.querySelectorAll('.item-card').length});
    }
    return samples;
  });
  console.log('COLLECTION_WORLD_SWITCH_MS',JSON.stringify(worldSwitchSamples));
  assert.ok(worldSwitchSamples.length>1);
  const source=completeIndex;
  const scopes=buildWorldBrowseIndex(source);
  for(const sample of worldSwitchSamples){
    assert.equal(sample.items,0,'world navigation must not render hidden item results');
    const world=COLLECTION_WORLD_NAVIGATION.find(row=>row.label===sample.world);
    if(!world){
      assert.equal(sample.categories.length,30,'All retains the canonical category list');
      continue;
    }
    const scope=scopes.get(world.id);
    assert.ok(scope,'enabled world has a source scope');
    const expected=COLLECTION_TOP_CATEGORIES.filter(card=>(scope.rootCounts.get(card.id)??0)>0).map(card=>card.id);
    assert.deepEqual(sample.categories,expected,'world displays exactly the nonempty categories in canonical order');
    assert.equal(sample.disabled,0,'no unavailable category cards in a selected world');
  }
  assert.deepEqual(worldSwitchSamples[0].categories,worldSwitchSamples.at(-2).categories,
    'returning to Dreamlight Valley preserves the same nonempty categories');
  const nativeWorld=page.locator('.collection-scope-scroll button').filter({hasText:'Dreamlight Valley'});
  assert.equal(await nativeWorld.isDisabled(),false,
    'DB-01 original World-context tag must enable world source browsing');
  await nativeWorld.click();
  await page.locator('.collection-detail-category-grid .facet-card').first().waitFor({timeout:15000});
  assert.equal(await page.locator('.item-card').count(),0,
    'world tabs open scoped category cards, not an immediate flat item grid');
  const scopedFamily=page.locator('.collection-detail-category-grid .facet-card:not([disabled])').first();
  await scopedFamily.click();
  await page.locator('.item-card').first().waitFor({timeout:15000});
  await page.locator('.breadcrumbs').getByRole('button',{name:'カテゴリ'}).click();
  await page.locator('.collection-detail-category-grid .facet-card').first().waitFor();
  assert.equal(await nativeWorld.getAttribute('aria-pressed'),'true',
    'return to category navigation preserves selected world');
  await page.locator('.collection-scope-scroll').getByRole('button',{name:'すべて'}).click();
  await page.getByRole('button',{name:/フィルター/}).click();
  assert.equal(await page.getByRole('combobox',{name:'ワールドで絞り込み'}).count(),0);
  assert.equal(await page.getByRole('combobox',{name:'ユニバースで絞り込み'}).count(),0);
  const facet=page.locator('.facet-card').filter({hasText:/家具|Furniture/}).first();
  try {
    await facet.click({timeout:10000});
    } catch (error) {
    console.error('COLLECTION_FACET_DEBUG',await page.locator('body').innerText());
    console.error('COLLECTION_FACET_ERRORS',browserErrors);
    throw error;
  }
  await page.locator('.item-card').first().waitFor();
  // DB-01 source-only filters must affect the complete Rust Collection
  // category, not only the first visible page; Tags do not enable unverified
  // game-world scope or change the user's saved collection state.
  const nativeFilterButton=page.getByRole('button',{name:/フィルター/});
  if(await nativeFilterButton.getAttribute('aria-expanded')==='false')
    await nativeFilterButton.click();
  const nativeTags=page.getByRole('group',{name:'ゲーム原本のタグ'});
  try{await nativeTags.waitFor({timeout:8000});}
  catch(error){
    const probe=await page.evaluate(async()=>{
      const r=await fetch('/Wand/ddv/collection/db01-facets-1262.json');
      const t=await r.text();
      return {status:r.status,length:t.length,head:t.slice(0,160)};
    });
    console.error('COLLECTION_NATIVE_TAG_DEBUG',JSON.stringify({
      probe,filterExpanded:await nativeFilterButton.getAttribute('aria-expanded'),
      panelCount:await page.locator('.filter-panel').count(),
      tagPanels:await page.locator('.collection-native-tag-panel').count(),
      body:(await page.locator('body').innerText()).slice(0,3000),
      browserErrors
    }));
    throw error;
  }
  const colorTags=nativeTags.locator('fieldset').filter({hasText:'色'}).first();
  assert.equal(await colorTags.count(),1,'native Color facet must be present');
  if(await colorTags.getByRole('button',{name:'白',exact:true}).count()){
    await colorTags.getByRole('button',{name:'白',exact:true}).click();
  }else{
    await colorTags.getByRole('combobox',{name:'色'}).selectOption('White');
  }
  assert.match(await page.locator('.result-count').innerText(),/件/);
  await search.fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  assert.match(await page.locator('.item-card').innerText(),/ガラスの靴/);
  await search.fill('');
  if(await colorTags.getByRole('button',{name:'すべて'}).count())
    await colorTags.getByRole('button',{name:'すべて'}).click();
  else await colorTags.getByRole('combobox',{name:'色'}).selectOption('');
  await page.getByRole('button',{name:/フィルター/}).click();
  await page.locator('.item-card').first().waitFor();
  const before=await page.locator('.item-card').count();
  assert.equal(before,72);
  const firstCardText=await page.locator('.item-card-body').first().innerText();
  await page.locator('.more-button').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length>=144,{timeout:20000});
  // A second intersection appends page 3; the first batch is not discarded.
  await page.locator('.more-button').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length>=216,{timeout:20000});
  assert.equal(await page.locator('.item-card-body').first().innerText(),firstCardText);
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
    // Exact verified per-Item membership in this synthetic 1-item release.
    collectionScopeEvidence:{schema:'wand.collection.scope-membership@1',
      world:'verified_game_collection_area_item_membership',
      universe:'verified_game_collection_universe_item_membership',
      worldLabels:{IsDreamlightValley:['Dreamlight Valley','Dreamlight Valley','Dreamlight Valley',
        'Dreamlight Valley','Dreamlight Valley','ドリームライトバレー','Dreamlight Valley','Dreamlight Valley']},
      universeLabels:{Cinderella:['Cinderella','Cinderella','Cinderella','Cinderella',
        'Cinderella','シンデレラ','Cinderella','Cinderella']}},
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
  const worldChoices=page.getByRole('group',{name:'ワールド',exact:true});
  await worldChoices.getByRole('button',{name:'ドリームライトバレー'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===1);
  assert.equal(await worldChoices.getByRole('button',{name:'ドリームライトバレー'}).getAttribute('aria-pressed'),'true');
  // World and Universe are separate browse modes: the selected universe
  // presents item previews grouped by category, not another nested picker.
  await page.getByRole('button',{name:'ユニバース表示'}).click();
  assert.equal(await page.locator('.collection-universe-card').count(),1);
  await page.locator('.collection-universe-card').first().click();
  await page.locator('.collection-universe-section .item-card').first().waitFor();
  assert.match(await page.locator('.collection-universe-section').innerText(),/検証済みの靴/);
  assert.equal(await page.locator('.collection-universe-section-head button').count(),0,
    'universe view displays Items directly under category headings');
  await page.getByRole('button',{name:'ワールド表示'}).click();
  await page.locator('.facet-card').first().waitFor();
  assert.equal(await page.getByRole('button',{name:'ワールド表示'}).getAttribute('aria-pressed'),'true');
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
        }},
        '2':{ID:2,CompatibleItemType:'ActivityItem',Inventory:{
          '30200000':{Amount:2},  // Source Crop: Carrot
          '30300001':{Amount:1},  // Source Meal: Apple Pie
          '30400010':{Amount:9}   // Source Seed: Carrot Seed
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
  // Source subtype facets must not block verified native ActivityItem stock.
  assert.equal(stateAfter['30200000'].status,'owned');
  assert.equal(stateAfter['30300001'].status,'owned');
  assert.equal(stateAfter['30400010'].status,'owned');
  assert.equal(stateAfter['40003256'],undefined);
  assert.equal(stateAfter['99999999'].discovered,true);
  assert.equal(await page.getByRole('alert').filter({hasText:'do-not-leak'}).count(),0);
  assert.match(await page.getByRole('status').filter({hasText:'セーブの発見履歴'}).first().innerText(),/所持 5件/);
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
  // The header Save chooser can be enabled while Collection is still
  // parsing and committing this new local profile. Backup correctly refuses
  // to export during either phase: wait for the actual Collection lock.
  await page.evaluate(()=>{
    window.__plainCollectionReadStarted=false;
    const onBusy=event=>{
      if(event.detail!==true)return;
      window.__plainCollectionReadStarted=true;
      window.removeEventListener('wand:collection-busy',onBusy);
    };
    window.addEventListener('wand:collection-busy',onBusy);
  });
  await page.locator('input[aria-label="DDVのセーブファイルを選択"]')
    .setInputFiles({name:'steam-plaintext.profile',
      mimeType:'application/octet-stream',
      buffer:Buffer.from(JSON.stringify(saveRoot),'utf8')});
  await page.waitForFunction(()=>{
    const select=document.querySelector('select[aria-label="ローカル記録を選択"]');
    return window.__plainCollectionReadStarted&&select&&select.disabled===false;
  },null,{timeout:60000});
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

  // A slow old File.arrayBuffer() must not apply its evidence after the user
  // chooses a different file or closes the session. The new file's validity
  // and current Collection records must win, not a late old Worker reply.
  await page.locator('.search-box input[type="search"]').fill('40005160');
  await page.waitForFunction(()=>document.querySelectorAll('.item-state-toggle').length===1);
  const raceBefore=await readLocalState(page);
  assert.equal(raceBefore.workspaces.find(x=>x.id==='local-1').entries['40005160'].status,'owned');
  await page.locator('.item-state-toggle').first().click();
  await waitForLocalState(page,{item:'40005160',status:'missing'});
  await page.evaluate(()=>{
    window.__saveBusySignals=[];
    window.addEventListener('wand:collection-busy',event=>
      window.__saveBusySignals.push(event.detail));
    const native=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=function(...args){
      if(this.name.startsWith('stale-pending-')){
        return new Promise((resolve,reject)=>{
          window.__releaseStaleSave=()=>native.apply(this,args).then(resolve,reject);
        });
      }
      return native.apply(this,args);
    };
  });
  const globalSaveInput=page.locator('input[aria-hidden="true"][accept*=".profile"]');
  await globalSaveInput.setInputFiles({
    name:'stale-pending-replaced.profile',mimeType:'application/octet-stream',buffer:fixture
  });
  await page.waitForFunction(()=>typeof window.__releaseStaleSave==='function');
  assert.deepEqual(await page.evaluate(()=>window.__saveBusySignals),[true],
    'the save read must not announce Finished before the Worker even starts');
  assert.equal(await page.getByRole('combobox',{name:'ローカル記録を選択'}).isDisabled(),true);
  await globalSaveInput.setInputFiles({
    name:'replacement-invalid.profile',mimeType:'application/octet-stream',
    buffer:Buffer.from('{"invalid":','utf8')
  });
  await page.getByRole('button',{name:'セーブファイル管理'}).click();
  await page.locator('.shell-save-status').getByText(/対応するセーブファイル/).waitFor({timeout:30000});
  await page.evaluate(async()=>{await window.__releaseStaleSave();await Promise.resolve();});
  await waitForLocalState(page,{item:'40005160',status:'missing'});
  assert.match(await page.locator('.shell-save-filename').innerText(),/replacement-invalid\.profile/);
  assert.deepEqual(await page.evaluate(()=>window.__saveBusySignals),[true,false,true,false],
    'a replacement must close the prior read exactly once and open/finish the next');
  await page.getByRole('button',{name:'ファイルを閉じる'}).click();

  // A second delayed read gets its own release callback; the first callback
  // must not accidentally satisfy the second wait.
  await page.evaluate(()=>{window.__releaseStaleSave=undefined;});
  await globalSaveInput.setInputFiles({
    name:'stale-pending-closed.profile',mimeType:'application/octet-stream',buffer:fixture
  });
  await page.waitForFunction(()=>typeof window.__releaseStaleSave==='function');
  await page.getByRole('button',{name:'セーブファイル管理'}).click();
  await page.getByRole('button',{name:'ファイルを閉じる'}).click();
  await page.evaluate(async()=>{await window.__releaseStaleSave();await Promise.resolve();});
  await waitForLocalState(page,{item:'40005160',status:'missing'});
  assert.equal(await page.getByRole('button',{name:'セーブファイルを読み込む'}).count(),1);
  // Help is opt-in and follows actual service controls instead of opening
  // the former all-at-once modal. Movement and focus stay in this browser.
  assert.equal(await page.locator('.wand-tour-layer').count(),0);
  await page.getByRole('button',{name:'このページのチュートリアル'}).click();
  await page.locator('.wand-tour-spotlight').waitFor();
  assert.equal(await page.locator('.tutorial-steps').count(),0);
  const firstSpot=await page.locator('.wand-tour-spotlight').boundingBox();
  const searchSpot=await page.locator('.collection-workspace .search-box').boundingBox();
  assert.ok(firstSpot&&searchSpot);
  assert.ok(Math.abs(firstSpot.y-searchSpot.y)<18,'first Collection step highlights its search control');
  await page.locator('.wand-tour-primary').click();
  // The spotlight animates for 180ms; check final alignment with the actual
  // selected item, not an intermediate frame immediately after click.
  await page.waitForFunction(()=>{
    const marker=document.querySelector('.wand-tour-count')?.textContent??'';
    const spotlight=document.querySelector('.wand-tour-spotlight');
    const item=document.querySelector('.collection-results .item-card-body') ??
      document.querySelector('.facet-grid .facet-card') ??
      document.querySelector('.collection-results');
    if(!marker.includes('2 / 4')||!spotlight||!item)return false;
    const rect=spotlight.getBoundingClientRect(),target=item.getBoundingClientRect();
    return Math.abs(rect.top-Math.max(5,target.top-5))<12 &&
      Math.abs(rect.left-Math.max(5,target.left-5))<12 &&
      Math.abs(rect.width-(target.width+10))<18;
  },null,{timeout:10000});
  await page.locator('.wand-tour-close').click();
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='このページのチュートリアル');
  assert.equal(await page.locator('.wand-tour-layer').count(),0);

  // Compact More is the keyboard focus return target on phones.
  await page.setViewportSize({width:360,height:740});
  await page.locator('.shell-more-root>.header-icon-button').click();
  await page.locator('.shell-more-menu').getByRole('button',{name:'ヘルプ'}).click();
  await page.locator('.wand-tour-spotlight').waitFor();
  await page.locator('.wand-tour-close').click();
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='その他の操作');
  await page.setViewportSize({width:1280,height:800});

  await page.goto('http://127.0.0.1:4173/Wand/guide/');
  await page.locator('.guide-app .guide-sections').waitFor();
  assert.equal(await page.locator('.wand-tour-layer').count(),0,'tour must not auto-start on navigation');
  await page.getByRole('button',{name:'このページのチュートリアル'}).click();
  await page.locator('.wand-tour-spotlight').waitFor();
  assert.match(await page.locator('.wand-tour-description').innerText(),/タイムライン/);
  await page.locator('.wand-tour-primary').click();
  assert.match(await page.locator('.wand-tour-description').innerText(),/期間移動/);
  await page.locator('.wand-tour-primary').click();
  assert.match(await page.locator('.wand-tour-description').innerText(),/システム・クエスト/);
  await page.keyboard.press('Escape');
  await page.locator('.wand-tour-layer').waitFor({state:'detached'});

  // A fresh tab has no incidental warning. Rejected save selection produces
  // a single incident in the Save Editor tab, not an Undo/Redo operation.
  const incidentPage=await context.newPage();
  await incidentPage.goto(url);
  await incidentPage.locator('.collection-workspace').waitFor();
  assert.equal(await incidentPage.locator('.shell-issue-button').count(),0);
  await incidentPage.getByRole('button',{name:'編集履歴'}).click();
  const historyRect=await incidentPage.locator('.shell-history-panel').boundingBox();
  const viewport=incidentPage.viewportSize();
  assert.ok(historyRect&&viewport);
  assert.ok(Math.abs(historyRect.x+historyRect.width/2-viewport.width/2)<4,
    'history dialog must be centered, not docked at the trigger');
  assert.equal(await incidentPage.locator('.shell-history-tabs button.active').innerText(),'Collection');
  await incidentPage.locator('.shell-history-head button').click();
  await incidentPage.locator('input[aria-hidden="true"][accept*=".profile"]').setInputFiles({
    name:'empty.profile',mimeType:'application/octet-stream',buffer:Buffer.alloc(0)
  });
  await incidentPage.locator('.shell-issue-button').waitFor();
  await incidentPage.getByRole('button',{name:'エラーを確認'}).click();
  assert.equal(await incidentPage.locator('.shell-history-tabs button.active').innerText(),'Save Editor');
  assert.match(await incidentPage.locator('.shell-history-issue').innerText(),/セーブファイルを選択できませんでした/);
  assert.equal(await incidentPage.locator('.shell-history-timeline .shell-history-entry').count(),0,
    'diagnostic incidents must never become editable history entries');
  await incidentPage.getByRole('button',{name:'確認済みにする'}).click();
  await incidentPage.locator('.shell-issue-button').waitFor({state:'detached'});
  assert.match(await incidentPage.locator('.shell-history-issue').innerText(),/確認済み/);
  await incidentPage.locator('.shell-history-head button').click();
  await incidentPage.close();

  await context.close();
  console.log('Collection browser WASM/IndexedDB/migration/search/paging/history/shared-save smoke passed');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  server.stdout.destroy();
  server.stderr.destroy();
}
