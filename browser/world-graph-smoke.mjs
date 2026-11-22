/**
 * DB-04 browser regression: actual Svelte/Worker controls with only a
 * GENERATED synthetic reference graph. No real game files or private Save.
 *
 * Runs against the same built /Wand route shape as GitHub Pages, using
 * Playwright Chromium and the existing Vite preview in Collection CI.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const ROOT='SceneLayouts/Village04/DefaultVillageLayout01.json';
const WORLD='village-layout:'+ROOT;
const AREA=ROOT+'#areaType=0';
const LAYOUT='SceneLayouts/Village04/Beach.json';
const LOOSE='SceneLayouts/OffGridBuildings/Detached.json';
const GRID=LAYOUT+'#grid=1';
const UNLINKED=LOOSE+'#grid=0';
const GRAPH_URL='http://127.0.0.1:4178/Wand/world/preview/';
function syntheticSource(version='1.26.2'){
  const makeLayout=(layoutId,nativeDefaultObjectCount,parentWorldId,parentAreaRefId)=>({
    layoutId,layoutKind:parentAreaRefId?'nativeGridCollection':
      (layoutId===ROOT?'nativeDefaultVillageData':'nativeGridCollection'),
    nativeDefaultObjectCount,parentWorldId,parentAreaRefId,
    nativeSourceScopeLabel:parentWorldId?'Village04':'OffGrid',
    sourceWorldMembershipVerified:parentWorldId!==null,
    worldCoordinatesVerified:false,placementLegalityVerified:false
  });
  const makeGrid=(layoutId,nativeGridId,gridDataPath,worldId,areaRefId,count)=>({
    gridRefId:layoutId+'#grid='+nativeGridId,
    gridRefIdKind:'derivedLayoutGridIdComposite',
    layoutId,nativeGridId,gridDataPath,gridDataPresent:true,
    areaRefId,worldId,tessellationFactor:1,
    originalDefaultObjectCount:count,
    nativeWorldCoordinatesVerified:false,placementLegalityVerified:false
  });
  const makeRow=(itemId,gridRefId,layoutId,gridDataPath,worldId,areaRefId,instanceCount)=>({
    itemId,relation:'nativeSourceDefaultGridObject',gridRefId,layoutId,
    gridDataPath,worldId,areaRefId,instanceCount,
    itemOriginWorldId:null,itemAcquisitionWorldId:null,
    playerPlacedWorldId:null,placeableWorldId:null,
    otherFourRelationsVerified:false,
    nativeCoordinatesStoredInOriginalLayoutObjects:true
  });
  const linkedGridPath='GridData/Village04/Beach.json';
  const unlinkedGridPath='GridData/OffGridBuildings/Detached.json';
  const refs=Array.from({length:105},(_,n)=>
    makeRow(String(100+n),GRID,LAYOUT,linkedGridPath,WORLD,AREA,1));
  refs.push(makeRow('100',UNLINKED,LOOSE,unlinkedGridPath,null,null,2));
  return {
    schema:'wand.db04.native-reference-graph@1',
    target:{platform:'Steam',gameVersion:version,
      nativeWorldManifestSha256:'a'.repeat(64)},
    status:'private_partial_exact_source_relations',
    sourceManifestStatus:'synthetic_browser_only',
    privateOnly:true,publicationAuthorized:false,
    provenance:{syntheticTestFixture:true,noInferenceFromPathPrefixes:true},
    worlds:[{
      worldId:WORLD,worldIdKind:'derivedLayoutKey',worldType:'village_layout',
      nativeParentWorldId:null,nativeParentWorldRelationVerified:false,
      nativeSceneId:null,defaultLayoutId:ROOT,sourceRootPresent:true,
      sourceScopeLabel:'Village04',nativeUniverseTagItemId:null,
      contentPackId:null,contentPackRelationVerified:false,
      worldCoverageComplete:false
    }],
    scenes:[],
    areas:[{
      areaRefId:AREA,areaRefIdKind:'derivedRootLayoutAreaTypeComposite',
      nativeAreaId:null,nativeAreaTypeCode:0,nativeAreaTypeName:'Beach',
      parentVillageLayoutId:ROOT,separateAreaParentLayoutId:null,
      nativeSceneId:null,worldId:WORLD,gridLayoutId:LAYOUT,
      gridLayoutPresent:true,
      sourceProof:'Meta.DefaultVillageData.areaLayoutReferences',
      sourceWorldRelationVerified:true,
      gameplayBiomeMembershipVerified:false,placementLegalityVerified:false
    }],
    layouts:[
      makeLayout(ROOT,0,WORLD,null),
      makeLayout(LAYOUT,105,WORLD,AREA),
      makeLayout(LOOSE,2,null,null)
    ],
    gridData:[linkedGridPath,unlinkedGridPath].map(gridDataPath=>({
      gridDataPath,nativeSizeX:12,nativeSizeY:10,
      nativeSourceFormat:'original_json_direct_floor_values',
      gridLocalToWorldTransformVerified:false,placementLegalityVerified:false
    })),
    gridRefs:[
      makeGrid(LAYOUT,1,linkedGridPath,WORLD,AREA,105),
      makeGrid(LOOSE,0,unlinkedGridPath,null,null,2)
    ],
    initialItemRefs:refs,
    worldCoverage:[{
      worldId:WORLD,sourceAreaRefCount:1,sourceGridRefCount:1,
      initialSourceGridObjectCount:105,
      allGameAreasCovered:false,allSourceLayoutsCovered:false
    }],
    coverage:{
      sourceInitialGridObjects:107,
      sourceInitialGridObjectsWithoutVerifiedWorldLink:2,
      worldDefinitionsInSubset:1,nativeAreaLayoutReferences:1,
      gridReferencesInSubset:2,
      completeGameHierarchyVerified:false,
      allDlcAndAdventurePackIdsVerified:false,
      worldPlacementPermissionVerified:false,sourceCoverageComplete:false
    }
  };
}
const server=spawn(process.execPath,
  ['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4178'],
  {env:{...process.env,BASE_PATH:'/Wand'},stdio:'pipe'});
let output='';
server.stdout.on('data',chunk=>output+=String(chunk));
server.stderr.on('data',chunk=>output+=String(chunk));
async function ready(){
  for(let n=0;n<120;n++){
    try{if((await fetch(GRAPH_URL)).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('DB04_BROWSER_PREVIEW_NOT_READY '+output);
}
let browser;
try{
  await ready();
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const pageErrors=[];
  const unexpectedWrites=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('request',request=>{
    if(!['GET','HEAD'].includes(request.method()))
      unexpectedWrites.push(request.method()+' '+request.url());
  });
  await page.goto(GRAPH_URL,{waitUntil:'domcontentloaded'});
  const panel=page.locator('.graph-panel');
  await panel.waitFor({timeout:20000});
  assert.equal(await panel.getByText('原本ワールド参照',{exact:true}).count(),1);
  const pick=panel.locator('input[type="file"]');
  const source=syntheticSource();
  await pick.setInputFiles({
    name:'synthetic-db04-native-reference-graph.json',
    mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(source))
  });
  // Regression for the initial query immediately after the Worker "loaded"
  // reply, before Svelte's reactive canQuery has been updated.
  const result=panel.locator('.graph-result-head strong');
  await result.waitFor({timeout:20000});
  assert.match(await result.innerText(),/105件[\s\S]*105個/);
  await page.waitForFunction(()=>document.querySelectorAll(
    '.graph-panel tbody tr').length===100);
  assert.equal(await panel.locator('tbody tr').count(),100);
  assert.match(await panel.locator('tbody tr').first().innerText(),/^100\s/);
  await panel.getByRole('button',{name:'次へ'}).click();
  await page.waitForFunction(()=>document.querySelectorAll(
    '.graph-panel tbody tr').length===5);
  assert.match(await panel.locator('tbody tr').first().innerText(),/^200\s/);
  assert.match(await panel.locator('tbody tr').last().innerText(),/^204\s/);
  await panel.getByRole('button',{name:'前へ'}).click();
  await page.waitForFunction(()=>document.querySelectorAll(
    '.graph-panel tbody tr').length===100);

  const sourceScope=panel.getByRole('combobox',{name:'参照対象'});
  await sourceScope.selectOption('area');
  await result.waitFor();
  await page.waitForFunction(()=>document.querySelector('.graph-panel .graph-result-head strong')
    ?.textContent?.includes('105件'));
  assert.match(await panel.locator('.source-link').innerText(),/Area:/);

  await panel.locator('input[placeholder="すべて"]').fill('100');
  await panel.getByRole('button',{name:'検索'}).click();
  await page.waitForFunction(()=>document.querySelector('.graph-panel .graph-result-head strong')
    ?.textContent?.includes('1件'));
  assert.match(await result.innerText(),/1件[\s\S]*1個/);
  assert.equal(await panel.locator('tbody tr').count(),1);

  await sourceScope.selectOption('unlinked_world');
  await page.waitForFunction(()=>document.querySelector('.graph-panel .graph-result-head strong')
    ?.textContent?.includes('2個'));
  assert.equal(await panel.locator('tbody tr').count(),1);
  assert.match(await panel.locator('tbody tr').first().innerText(),/未特定/);

  await panel.locator('input[placeholder="すべて"]').fill('');
  await sourceScope.selectOption('grid');
  const gridSearch=panel.locator('input[placeholder="Layoutパス・Grid ID"]');
  await gridSearch.fill('OffGridBuildings');
  await page.waitForFunction(()=>document.querySelectorAll(
    '.graph-panel .graph-select option').length===1);
  assert.match(await panel.locator('.graph-select option').first().innerText(),
    /OffGridBuildings/);
  await panel.getByRole('button',{name:'検索'}).click();
  await page.waitForFunction(()=>document.querySelector('.graph-panel .graph-result-head strong')
    ?.textContent?.includes('2個'));
  assert.equal(await panel.locator('tbody tr').count(),1);

  await page.setViewportSize({width:390,height:844});
  const mobileLayout=await page.evaluate(()=>{
    const screenWidth=window.innerWidth;
    const els=[...document.querySelectorAll('body *')];
    const offenders=els.map(el=>{
      const rect=el.getBoundingClientRect();
      return {tag:el.tagName.toLowerCase(),className:
        typeof el.className==='string'?el.className.slice(0,100):'',
        width:Math.round(rect.width),left:Math.round(rect.left),
        right:Math.round(rect.right)};
    }).filter(x=>x.right>screenWidth+2&&x.width>0)
      .sort((a,b)=>b.right-a.right).slice(0,18);
    return {screenWidth,documentWidth:document.documentElement.scrollWidth,
      bodyWidth:document.body.scrollWidth,offenders};
  });
  if(mobileLayout.documentWidth>mobileLayout.screenWidth+2)
    console.error('DB04_MOBILE_OVERFLOW_DIAGNOSTICS '+JSON.stringify(mobileLayout));
  assert.equal(mobileLayout.documentWidth<=mobileLayout.screenWidth+2,true,
    'DB-04 source graph mobile horizontal overflow');
  await page.setViewportSize({width:320,height:720});
  const narrowLayout=await page.evaluate(()=>{
    const width=window.innerWidth;
    return {width,actual:document.documentElement.scrollWidth,
      offenders:[...document.querySelectorAll('body *')].map(el=>{
        const r=el.getBoundingClientRect();
        return {tag:el.tagName.toLowerCase(),
          className:typeof el.className==='string'?el.className.slice(0,90):'',
          left:Math.round(r.left),right:Math.round(r.right),
          width:Math.round(r.width)};
      }).filter(row=>row.width>0&&row.right>width+2)
        .sort((a,b)=>b.right-a.right).slice(0,12)};
  });
  if(narrowLayout.actual>narrowLayout.width+2)
    console.error('DB04_NARROW_MOBILE_OVERFLOW '+JSON.stringify(narrowLayout));
  assert.equal(narrowLayout.actual<=narrowLayout.width+2,true,
    'DB-04 320px mobile horizontal overflow');
  await panel.getByRole('button',{name:'原本参照グラフを破棄'}).click();
  assert.equal(await panel.locator('.graph-result-head').count(),0);
  assert.equal(await panel.locator('.graph-controls').count(),0);

  // Reject a wrong original game version without showing previously loaded
  // source records. The test fixture is entirely synthetic and local.
  await pick.setInputFiles({
    name:'wrong-version-db04-native-reference-graph.json',
    mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(syntheticSource('1.26.1')))
  });
  await panel.locator('[role="alert"]').waitFor({timeout:20000});
  assert.match(await panel.locator('[role="alert"]').innerText(),
    /PRIVATE_STEAM1262_SOURCE_REQUIRED/);
  assert.equal(await panel.locator('.graph-result-head').count(),0);

  assert.deepEqual(pageErrors,[],pageErrors.join('\n'));
  assert.deepEqual(unexpectedWrites,[],unexpectedWrites.join('\n'));
  await page.close();
  console.log('DB04_WORLD_GRAPH_BROWSER_SMOKE_OK');
}finally{
  await browser?.close();
  server.kill();
}
