/**
 * DB-04 browser regression: actual Svelte/Worker controls with only a
 * GENERATED synthetic reference graph. No real game files or private Save.
 *
 * Runs against the same built /Wand route shape as GitHub Pages, using
 * Playwright Chromium and the existing Vite preview in Collection CI.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const ROOT='SceneLayouts/Village04/DefaultVillageLayout01.json';
const WORLD='village-layout:'+ROOT;
const AREA=ROOT+'#areaType=0';
const LAYOUT='SceneLayouts/Village04/Beach.json';
const LOOSE='SceneLayouts/OffGridBuildings/Detached.json';
const GRID=LAYOUT+'#grid=1';
const EMPTY=LAYOUT+'#grid=2';
const EMPTY_PATH='GridData/Village04/EmptyOriginalGrid.json';
const UNLINKED=LOOSE+'#grid=0';
const UNLINKED_EMPTY_LAYOUT='SceneLayouts/Houses/EmptyOriginalRoom.json';
const UNLINKED_EMPTY_PATH='GridData/Houses/EmptyOriginalRoom.json';
const UNLINKED_EMPTY=UNLINKED_EMPTY_LAYOUT+'#grid=0';
const GRAPH_URL='http://127.0.0.1:4178/Wand/world/preview/';

/** Entirely synthetic original-world ZIP, created in this test only. */
function syntheticTerrainZip(decodedFloor=false,factor=1,exclusive=false){
  const gridPaths=['GridData/Village04/Beach.json',
    'GridData/OffGridBuildings/Detached.json'];
  const layouts=[
    [LAYOUT,1,gridPaths[0]],
    [LOOSE,0,gridPaths[1]]
  ];
  const sources={
    objects:[{itemId:100,nativeType:'Furniture',
      nativeName:'SyntheticSourceObject',
      footprint:{sizeX:2,sizeY:2,layerValues:[0,68,68,76],
        acceptedFloorTypesFlag:4,
        cellIndexToXYVerified:false,layerMaskSemanticsVerified:false,
        nativeWireFields:{sizeX:'6.1',sizeY:'6.2',layerValues:'6.3',
          acceptedFloorTypesFlag:'6.4'}
      }},{itemId:200,nativeType:'Building',footprint:null}],
    scenes:[],worlds:[],areas:[],
    grids:gridPaths.map(gridId=>decodedFloor?({
      gridId,sizeX:16,sizeY:16,
      nativeSourceFormat:'original_json_direct_floor_values',
      nativeFloorTypes:Array.from({length:256},(_,i)=>i===85?0:4),
      nativeFloorTypePalette:[],compactedFloorTypesBase64:null,
      terrainDecoding:{
        decoded:true,status:'source_correlated_original_json_direct_floor_values',
        packing:'x_major_direct_floor_values',
        cellIndexFormula:'x*sizeY+y',sourceGameVersion:'1.26.2',
        nativeCodeBodyVerified:false,placementLegalityVerified:false
      }
    }):({
      gridId,sizeX:16,sizeY:16,
      terrainDecoding:{decoded:false,
        status:'native_packing_not_verified_for_game_version'}
    })),
    layouts:layouts.map(([layoutId,gridIdNative,gridDataPath])=>({
      layoutId,layoutKind:'nativeGridCollection',defaultObjectCount:1,
      nativeGridEntries:[{gridIdNative,gridDataPath,tessellationFactor:factor,
        defaultObjectCount:1}]
    })),
    layoutObjects:layouts.map(([layoutId,gridIdNative],i)=>({
      layoutObjectId:layoutId+'#grid='+gridIdNative+'#object=1',
      layoutId,gridIdNative,gridObjectIdNative:1,
      itemId:100,x:factor===2?18+i:4+i,y:5,
      orientationCode:i===0?8:4,worldCoordinatesVerified:false,
      fixedImmovableVerified:false
    }))
  };
  if(exclusive)sources.objects.push({itemId:40100001,nativeType:'Furniture',nativeName:'SyntheticRoad',footprint:{...sources.objects[0].footprint}});
  const entries=new Map(Object.entries(sources).map(([key,value])=>
    [key+'.json',Buffer.from(JSON.stringify(value))]));
  entries.set('report.json',Buffer.from(
    '{"status":"native_partial_world_extraction"}'));
  const hashes=Object.fromEntries([...entries].map(([name,buf])=>[
    name,createHash('sha256').update(buf).digest('hex')]));
  const rawManifest=Buffer.from(JSON.stringify({
    schema:'wand.db04.world@1',status:'partial_game_native_evidence',
    platform:'Steam',gameVersion:'1.26.2',
    sourceScopeVerified:false,outputSha256:hashes
  }));
  const manifestRawSha256=createHash('sha256')
    .update(rawManifest).digest('hex');
  entries.set('manifest.json',rawManifest);
  const locals=[],centrals=[];
  let current=0;
  for(const [name,content] of entries){
    const nameBytes=Buffer.from(name);
    const head=Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50,0);
    head.writeUInt16LE(20,4);
    head.writeUInt32LE(content.length,18);
    head.writeUInt32LE(content.length,22);
    head.writeUInt16LE(nameBytes.length,26);
    locals.push(head,nameBytes,content);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);
    central.writeUInt16LE(20,4);
    central.writeUInt16LE(20,6);
    central.writeUInt32LE(content.length,20);
    central.writeUInt32LE(content.length,24);
    central.writeUInt16LE(nameBytes.length,28);
    central.writeUInt32LE(current,42);
    centrals.push(central,nameBytes);
    current+=head.length+nameBytes.length+content.length;
  }
  const centralSize=centrals.reduce((sum,part)=>sum+part.length,0);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(entries.size,8);
  end.writeUInt16LE(entries.size,10);
  end.writeUInt32LE(centralSize,12);
  end.writeUInt32LE(current,16);
  return {archive:Buffer.concat([...locals,...centrals,end]),manifestRawSha256};
}

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
      makeLayout(LOOSE,2,null,null),
      makeLayout(UNLINKED_EMPTY_LAYOUT,0,null,null)
    ],
    gridData:[linkedGridPath,unlinkedGridPath,EMPTY_PATH,
      UNLINKED_EMPTY_PATH].map(gridDataPath=>({
      gridDataPath,nativeSizeX:12,nativeSizeY:10,
      nativeSourceFormat:'original_json_direct_floor_values',
      gridLocalToWorldTransformVerified:false,placementLegalityVerified:false
    })),
    gridRefs:[
      makeGrid(LAYOUT,1,linkedGridPath,WORLD,AREA,105),
      // Exact source Grid with no original default GridObject row.
      // Distinct exact source path: no synthetic Save-path ambiguity.
      makeGrid(LAYOUT,2,EMPTY_PATH,WORLD,AREA,0),
      makeGrid(LOOSE,0,unlinkedGridPath,null,null,2),
      makeGrid(UNLINKED_EMPTY_LAYOUT,0,UNLINKED_EMPTY_PATH,null,null,0)
    ],
    initialItemRefs:refs,
    worldCoverage:[{
      worldId:WORLD,sourceAreaRefCount:1,sourceGridRefCount:2,
      initialSourceGridObjectCount:105,
      allGameAreasCovered:false,allSourceLayoutsCovered:false
    }],
    coverage:{
      sourceInitialGridObjects:107,
      sourceInitialGridObjectsWithoutVerifiedWorldLink:2,
      worldDefinitionsInSubset:1,nativeAreaLayoutReferences:1,
      gridReferencesInSubset:4,
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
  const sourceZip=syntheticTerrainZip();
  const source=syntheticSource();
  // The synthetic graph and ZIP intentionally share one literal manifest,
  // while their initial GridObject counts differ. Hash equality is a
  // snapshot-consistency check; it is not a publisher signature.
  source.target.nativeWorldManifestSha256=sourceZip.manifestRawSha256;
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
  // Source-exact World → Grid navigation includes EMPTY original Grids
  // that cannot appear in any default-object results table.
  const sourceRelatedGrid=panel.getByRole('combobox',{name:'原本関連Grid'});
  assert.equal(await sourceRelatedGrid.locator('option').count(),2);
  await sourceRelatedGrid.selectOption(EMPTY);
  await panel.getByRole('button',{name:'Gridを開く'}).click();
  await page.waitForFunction((ref)=>{
    const controls=document.querySelectorAll('.graph-panel .graph-controls select');
    return controls[0]?.value==='grid'&&controls[1]?.value===ref;
  },EMPTY);
  await page.waitForFunction(()=>
    document.querySelector('.graph-panel .graph-result-head strong')
      ?.textContent?.includes('0件'));
  assert.match(await panel.getByText(/この条件の初期配置レコードはありません/).innerText(),
    /初期配置レコードはありません/);
  await panel.getByRole('combobox',{name:'参照対象'}).selectOption('world');
  await page.waitForFunction(()=>document.querySelectorAll(
    '.graph-panel tbody tr').length===100);
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
  // Source-only initial placement row -> exact original GridRef drilldown.
  // This must not use a numeric Save ID or assume a gameplay World transform.
  await panel.locator('tbody tr').first()
    .getByRole('button',{name:`原本Grid ${GRID}を表示`}).click();
  await page.waitForFunction((ref)=>{
    const controls=document.querySelectorAll('.graph-panel .graph-controls select');
    return controls[0]?.value==='grid'&&controls[1]?.value===ref;
  },GRID);
  assert.equal(await panel.locator('input[placeholder="GridDataPath・Layoutパス・Grid ID"]')
    .inputValue(),GRID);
  await panel.getByRole('button',{name:'地形ビューに表示'}).waitFor();
  await sourceScope.selectOption('area');
  await result.waitFor();
  await page.waitForFunction(()=>document.querySelector('.graph-panel .graph-result-head strong')
    ?.textContent?.includes('105件'));
  assert.match(await panel.locator('.source-link').innerText(),/Area:/);
  // Area → Grid uses the original AreaRef, not a folder/biome guess.
  assert.equal(await panel.getByRole('combobox',{name:'原本関連Grid'})
    .locator('option').count(),2);

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
  // The 0-object unlinked original Grid cannot be discovered from any
  // GridObject row. It must remain navigable through its exact source ID.
  const unlinkedSelector=panel.getByRole('combobox',{name:'原本関連Grid'});
  const unlinkedSearch=panel.locator(
    'input[placeholder="原本Layout・GridDataPath・Grid ID"]');
  assert.equal(await unlinkedSelector.locator('option').count(),2);
  await unlinkedSearch.fill('Houses/EmptyOriginalRoom');
  await page.waitForFunction(()=>document.querySelectorAll(
    '.graph-panel .graph-related-grids option').length===1);
  await unlinkedSelector.selectOption(UNLINKED_EMPTY);
  await panel.getByRole('button',{name:'Gridを開く'}).click();
  await page.waitForFunction((ref)=>{
    const controls=document.querySelectorAll('.graph-panel .graph-controls select');
    return controls[0]?.value==='grid'&&controls[1]?.value===ref;
  },UNLINKED_EMPTY);
  await page.waitForFunction(()=>
    document.querySelector('.graph-panel .graph-result-head strong')
      ?.textContent?.includes('0件'));
  await sourceScope.selectOption('unlinked_world');
  await unlinkedSearch.fill('');
  await page.waitForFunction(()=>document.querySelector('.graph-panel .graph-result-head strong')
    ?.textContent?.includes('2個'));
  assert.equal(await unlinkedSelector.locator('option').count(),2);
  assert.match(await panel.locator('tbody tr').first().innerText(),/未特定/);
  await panel.locator('tbody tr').first()
    .getByRole('button',{name:`原本Grid ${UNLINKED}を表示`}).click();
  await page.waitForFunction((ref)=>{
    const controls=document.querySelectorAll('.graph-panel .graph-controls select');
    return controls[0]?.value==='grid'&&controls[1]?.value===ref;
  },UNLINKED);
  assert.equal(await panel.locator('input[placeholder="GridDataPath・Layoutパス・Grid ID"]')
    .inputValue(),UNLINKED);
  assert.match(await panel.locator('.source-link').innerText(),
    /OffGridBuildings\/Detached.json/);

  await panel.locator('input[placeholder="すべて"]').fill('');
  await sourceScope.selectOption('grid');
  const gridSearch=panel.locator('input[placeholder="GridDataPath・Layoutパス・Grid ID"]');
  await gridSearch.fill('OffGridBuildings');
  await page.waitForFunction(()=>document.querySelectorAll(
    '.graph-panel .graph-select option').length===1);
  assert.match(await panel.locator('.graph-select option').first().innerText(),
    /OffGridBuildings/);
  await panel.getByRole('button',{name:'検索'}).click();
  await page.waitForFunction(()=>document.querySelector('.graph-panel .graph-result-head strong')
    ?.textContent?.includes('2個'));
  assert.equal(await panel.locator('tbody tr').count(),1);

  // Exact saved GridDataPath is a candidate lookup, never numeric Save Grid ID.
  // The source file is synthetic and stays in this local Chromium test.
  await gridSearch.fill('GridData/OffGridBuildings/Detached.json');
  await page.waitForFunction(()=>
    document.querySelector('.graph-panel [role="status"]')
      ?.textContent?.includes('GridDataPath完全一致'));
  assert.match(await panel.getByText(/GridDataPath完全一致/).innerText(),
    /1件の原本Grid参照候補/);
  assert.equal(await panel.locator('.graph-select option').count(),1);
  await gridSearch.fill('GridData/OffGridBuildings/NoMatchingSource.json');
  await page.waitForFunction(()=>
    document.querySelector('.graph-panel').textContent
      ?.includes('完全一致するGridDataPathはありません'));
  assert.match(await panel.getByText(/完全一致するGridDataPathはありません/).innerText(),
    /セーブファイルが不正という意味ではありません/);
  await gridSearch.fill('GridData/OffGridBuildings/Detached.json');

  // Source GridRef navigation must NOT invent a saved-grid identity.
  // Without the independently opened original terrain ZIP, show guidance.
  const openTerrain=panel.getByRole('button',{name:'地形ビューに表示'});
  await openTerrain.click();
  assert.match(await page.getByRole('status')
    .filter({hasText:'先に下の'}).innerText(),/非公開DB-04 ZIP/);
  await page.locator('.world-toolbar input[type=file]').setInputFiles({
    name:'synthetic-native-terrain.zip',mimeType:'application/zip',
    buffer:sourceZip.archive
  });
  await page.waitForFunction(()=>{
    const text=document.querySelector('.world-toolbar')?.parentElement
      ?.textContent??'';
    return text.includes('ローカルZIP内のマニフェスト整合性を確認しました')||
      Boolean(document.querySelector('.world-toolbar ~ [role="alert"]'));
  },null,{timeout:20000});
  const localZipPanel=await page.locator('.world-toolbar').locator('..').innerText();
  if(!localZipPanel.includes('ローカルZIP内のマニフェスト整合性を確認しました'))
    console.error('DB04_SYNTHETIC_ZIP_LOAD_DIAGNOSTICS '+localZipPanel.slice(0,1200));
  assert.match(localZipPanel,/ローカルZIP内のマニフェスト整合性を確認しました/);
  // This intentionally synthetic graph declares 2 original instances,
  // while the separately constructed terrain ZIP contains only 1.
  // The exact source path matches, but auto-navigation MUST fail closed.
  await openTerrain.click();
  await page.getByRole('status').filter({
    hasText:'初期GridObject件数が一致しません'
  }).waitFor();
  // Manual independent source browsing remains available after a rejected
  // cross-archive shortcut; it does not assert the archives are identical.
  const terrainSelectors=page.locator('.world-panel .selector-row select');
  await terrainSelectors.nth(0).selectOption('OffGridBuildings');
  await terrainSelectors.nth(1).selectOption(JSON.stringify(['grid',LOOSE]));
  await page.waitForFunction(({layout,grid})=>{
    const selects=[...document.querySelectorAll('.world-panel .selector-row select')];
    return selects.length===3&&selects[1].selectedOptions[0]?.textContent
      ?.includes(layout)&&selects[2].value===grid;
  },{layout:'OffGridBuildings/Detached.json',grid:'0'});
  assert.equal(await terrainSelectors.nth(2).inputValue(),'0');
  assert.match(await terrainSelectors.nth(1).locator('option:checked').innerText(),
    /OffGridBuildings\/Detached.json/);
  // Exact native layout, native Grid.ID and source GridDataPath are needed.
  // No Save coordinates are projected onto this terrain display.
  await page.getByText(/ローカルZIP内のマニフェスト整合性を確認しました/).waitFor();

  // Worker scans only the selected ORIGINAL layout and native Grid ID.
  // It pans to a real source-local anchor, never a Save-world coordinate.
  const nativeItemQuery=page.getByRole('searchbox',{name:'原本Item ID'});
  await nativeItemQuery.fill('100');
  await page.getByRole('button',{name:'原本初期配置を探す'}).click();
  await page.getByRole('status')
    .filter({hasText:'原本初期配置 1 / 1件'}).waitFor();
  await page.waitForFunction(()=>document.querySelector(
    '.grid-view button.current')?.getAttribute('aria-label')
      ==='座標5,5：アンカー1件');
  assert.equal(await page.locator('.grid-view button.current')
    .getAttribute('aria-label'),'座標5,5：アンカー1件');
  assert.match(await page.getByRole('status')
    .filter({hasText:'原本初期配置 1 / 1件'}).innerText(),
    /セーブの座標・配置可否を意味しません/);
  const localLink=page.getByLabel('原本初期配置のItem参照');
  await localLink.waitFor();
  assert.match(await localLink.innerText(),
    /GridObject 1 · 向き 4 · Grid倍率 ×1 · 原本アンカー \(5, 5\)/);
  assert.equal(await page.getByRole('combobox',{name:'原本GridAreaの向き'})
    .inputValue(),'4');
  const defaultLayers=page.getByLabel('原本既定GridLayers照会');
  await defaultLayers.waitFor();
  assert.match(await defaultLayers.innerText(),/Item既定レイヤー OR：\s*0x00000044/);
  assert.match(await defaultLayers.innerText(),/参照1件/);
  assert.match(await defaultLayers.innerText(),/0でも空きマスとは判定できません/);
  await nativeItemQuery.fill('999');
  await page.getByRole('button',{name:'原本初期配置を探す'}).click();
  await page.getByRole('status')
    .filter({hasText:'指定Item IDの初期配置はありません'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'次の一致'}).count(),0);

  // Search the entire local partial ORIGINAL source by Item ID without
  // knowing any original layout or grid in advance. Two layouts reuse
  // item 100 but own distinct Grid IDs and source-local X/Y positions.
  const globalItemQuery=page.getByRole('searchbox',{
    name:'すべての原本GridからItem IDを探す'
  });
  await globalItemQuery.fill('100');
  await page.getByRole('button',{name:'原本全Gridを検索'}).click();
  await page.getByRole('status')
    .filter({hasText:'原本初期配置 1 / 2件'}).waitFor();
  const gridareaPanel=page.getByLabel('原本Item GridArea情報');
  await gridareaPanel.waitFor();
  assert.match(await gridareaPanel.innerText(),/Item 100 · 原本GridArea/);
  assert.match(await gridareaPanel.innerText(),/原本GridAreaのサイズ：\s*2 × 2/);
  assert.match(await gridareaPanel.innerText(),/非ゼロ 3値/);
  assert.match(await gridareaPanel.getByLabel('原本初期配置のItem参照').innerText(),
    /GridObject 1 · 向き 8 · Grid倍率 ×1 · 原本アンカー \(4, 5\)/);
  assert.equal(await gridareaPanel.getByRole('combobox',{name:'原本GridAreaの向き'})
    .inputValue(),'8');
  await page.waitForFunction(()=>document.querySelector(
    '[aria-label="原本既定GridLayers照会"]')?.textContent
    ?.includes('0x00000000'));
  assert.match(await defaultLayers.innerText(),/参照1件/);
  assert.match(await gridareaPanel.innerText(),
    /原本既定GridAreaの外接枠：\s*\(4,\s*5\) ·\s*2 ×\s*2/);
  const originalDefaultOutline=page.getByLabel('原本Item既定GridArea外接枠');
  await originalDefaultOutline.waitFor();
  assert.equal(await originalDefaultOutline.evaluate(el=>getComputedStyle(el).width),
    '50px');
  assert.match(await page.getByText(/点線は原本Item既定GridAreaの外接枠/).innerText(),
    /占有セル・衝突判定ではありません/);
  assert.match(await gridareaPanel.innerText(),/68 × 2 · 0 × 1 · 76 × 1/);
  assert.match(await gridareaPanel.innerText(),/占有セル数ではありません/);
  assert.match(await gridareaPanel.innerText(),/全16方向の原本ローカル値を参照できます/);
  // A source-default candidate pose excludes its own original GridObject.
  // Raw common bits are not native collision or Save-edit authorization.
  const candidatePanel=gridareaPanel.locator('details.candidate-probe');
  await candidatePanel.locator('summary').click();
  assert.equal(await candidatePanel.getByRole('spinbutton',{name:'候補 X'}).inputValue(),'4');
  assert.equal(await candidatePanel.getByRole('spinbutton',{name:'候補 Y'}).inputValue(),'5');
  const probeButton=candidatePanel.getByRole('button',{
    name:'原本レイヤーの重なりを確認'
  });
  await probeButton.click();
  const candidateReceipt=gridareaPanel.getByLabel('原本候補レイヤー照合結果');
  await candidateReceipt.waitFor();
  assert.match(await candidateReceipt.innerText(),/原本レイヤー共通ビット 0セル/);
  assert.match(await candidateReceipt.innerText(),/元のGridObject自身は比較対象から除外/);
  assert.match(await candidatePanel.innerText(),/セーブファイルを変更しません/);
  const candidateBounds=page.getByLabel('仮置きの原本既定GridArea外接枠');
  await candidateBounds.waitFor();
  assert.equal(await candidateBounds.evaluate(el=>getComputedStyle(el).width),'50px');
  assert.match(await page.getByRole('button',{name:'座標4,6：アンカー0件'})
    .getAttribute('title'),/candidate raw shared bits: 0x0/);
  await candidatePanel.getByRole('spinbutton',{name:'候補 X'}).fill('999');
  await probeButton.click();
  await candidatePanel.getByRole('status')
    .filter({hasText:'原本Grid範囲外'}).waitFor();
  assert.equal(await candidateBounds.count(),0);
  await candidatePanel.getByRole('spinbutton',{name:'候補 X'}).fill('4');
  await candidatePanel.getByRole('combobox',{name:'候補の向き'}).selectOption('4');
  await probeButton.click();
  await candidateReceipt.waitFor();
  await candidateBounds.waitFor();
  assert.equal(await candidateBounds.evaluate(el=>getComputedStyle(el).width),'50px');

  // The optional 16×16 source-default GridLayers overlay never overwrites
  // anchor counts, terrain source values or placement-permission semantics.
  const layerToggle=page.getByRole('checkbox',{name:'原本Itemの既定レイヤー'});
  await layerToggle.check();
  await page.getByLabel('原本既定レイヤー凡例').waitFor();
  const layerNonzero=page.getByRole('button',{name:'座標4,6：アンカー0件'});
  await page.waitForFunction(()=>document.querySelector(
    '[aria-label="座標4,6：アンカー0件"]')
    ?.classList.contains('has-source-default-layer'));
  assert.match(await layerNonzero.getAttribute('title'),/source Item DEFAULT GridLayers: 0x44/);
  assert.equal(await page.getByRole('button',{name:'座標4,5：アンカー1件'})
    .evaluate(el=>el.classList.contains('has-source-default-layer')),false);
  assert.match(await page.getByLabel('原本既定レイヤー凡例').innerText(),
    /空きマスや配置許可を示しません/);
  const rawAreaButton=gridareaPanel.getByRole('button',{name:'原本レイヤー値を表示'});
  await rawAreaButton.click();
  const rawGridArea=gridareaPanel.getByLabel('原本GridAreaセル一覧');
  await rawGridArea.waitFor();
  assert.deepEqual(await rawGridArea.locator('.gridarea-raw-cell').allTextContents(),
    ['0','68','68','76']);
  assert.match(await gridareaPanel.innerText(),/GridObjectの設置位置や占有セルではありません/);
  await gridareaPanel.getByRole('combobox',{name:'原本GridAreaの向き'})
    .selectOption('4');
  await rawAreaButton.click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll(
    '[aria-label="原本GridAreaセル一覧"] .gridarea-raw-cell')).map(
      el=>el.textContent?.trim()).join(',')==='68,0,76,68');
  assert.deepEqual(await rawGridArea.locator('.gridarea-raw-cell').allTextContents(),
    ['68','0','76','68']);
  const orientationControl=gridareaPanel.getByRole('combobox',{
    name:'原本GridAreaの向き'
  });
  assert.equal(await orientationControl.locator('option').count(),16);
  await orientationControl.selectOption('2');
  await rawAreaButton.click();
  await page.waitForFunction(()=>document.querySelector(
    '[aria-label="原本GridAreaセル一覧"]')?.querySelectorAll(
      '.gridarea-raw-cell').length===4);
  assert.equal(await rawGridArea.locator('.gridarea-raw-cell').count(),4);
  await gridareaPanel.getByRole('combobox',{name:'原本Grid参照倍率'})
    .selectOption('2');
  await rawAreaButton.click();
  await page.waitForFunction(()=>document.querySelector(
    '[aria-label="原本GridAreaセル一覧"]')?.querySelectorAll(
      '.gridarea-raw-cell').length===16);
  assert.match(await gridareaPanel.innerText(),/入力倍率 ×2/);
  assert.match(await gridareaPanel.innerText(),/GridObjectの設置位置や占有セルではありません/);
  assert.doesNotMatch(await gridareaPanel.innerText(),/編集可能/);
  assert.match(await terrainSelectors.nth(1).locator('option:checked').innerText(),
    /Village04\/Beach.json/);
  assert.equal(await terrainSelectors.nth(2).inputValue(),'1');
  await page.waitForFunction(()=>document.querySelector(
    '.grid-view button.current')?.getAttribute('aria-label')
      ==='座標4,5：アンカー1件');
  await page.getByRole('button',{name:'次の候補'}).click();
  // A different exact original GridObject must invalidate the old candidate.
  assert.equal(await page.getByLabel('仮置きの原本既定GridArea外接枠').count(),0);
  await page.getByRole('status')
    .filter({hasText:'原本初期配置 2 / 2件'}).waitFor();
  await page.waitForFunction(()=>document.querySelector(
    '[aria-label="座標5,5：アンカー1件"]')
    ?.classList.contains('has-source-default-layer'));
  assert.match(await page.getByRole('button',{name:'座標5,5：アンカー1件'})
    .getAttribute('title'),/source Item DEFAULT GridLayers: 0x44/);
  assert.equal(await page.getByRole('button',{name:'座標6,5：アンカー0件'})
    .evaluate(el=>el.classList.contains('has-source-default-layer')),false);
  await page.waitForFunction(()=>document.querySelector(
    '[aria-label="原本既定GridLayers照会"]')?.textContent
    ?.includes('0x00000044'));
  assert.match(await gridareaPanel.getByLabel('原本初期配置のItem参照').innerText(),
    /GridObject 1 · 向き 4 · Grid倍率 ×1 · 原本アンカー \(5, 5\)/);
  assert.equal(await gridareaPanel.getByRole('combobox',{name:'原本GridAreaの向き'})
    .inputValue(),'4');
  assert.match(await gridareaPanel.innerText(),
    /原本既定GridAreaの外接枠：\s*\(5,\s*5\) ·\s*2 ×\s*2/);
  await originalDefaultOutline.waitFor();
  assert.match(await terrainSelectors.nth(1).locator('option:checked').innerText(),
    /OffGridBuildings\/Detached.json/);
  assert.equal(await terrainSelectors.nth(2).inputValue(),'0');
  await page.waitForFunction(()=>document.querySelector(
    '.grid-view button.current')?.getAttribute('aria-label')
      ==='座標5,5：アンカー1件');
  await page.getByRole('button',{name:'前の候補'}).click();
  await page.getByRole('status')
    .filter({hasText:'原本初期配置 1 / 2件'}).waitFor();
  await page.waitForFunction(()=>document.querySelector(
    '[aria-label="座標4,6：アンカー0件"]')
    ?.classList.contains('has-source-default-layer'));
  await layerToggle.uncheck();
  await page.waitForFunction(()=>!document.querySelector(
    '[aria-label="座標4,6：アンカー0件"]')
    ?.classList.contains('has-source-default-layer'));
  assert.equal(await page.getByLabel('原本既定レイヤー凡例').count(),0);
  assert.equal(await terrainSelectors.nth(2).inputValue(),'1');
  // A query returning zero from ORIGINAL default Item masks does not imply
  // that the real player grid or runtime cell is empty.
  await page.getByRole('button',{name:'座標0,0：アンカー0件'}).click();
  await page.waitForFunction(()=>document.querySelector(
    '[aria-label="原本既定GridLayers照会"]')?.textContent
    ?.includes('0x00000000'));
  assert.match(await defaultLayers.innerText(),/参照0件/);
  assert.match(await defaultLayers.innerText(),/0でも空きマスとは判定できません/);
  await globalItemQuery.fill('999');
  await globalItemQuery.press('Enter');
  await page.waitForFunction(()=>!document.querySelector(
    '[aria-label="原本Item既定GridArea外接枠"]'));
  await page.getByRole('status')
    .filter({hasText:'この部分的な原本ZIPに指定Item IDの初期配置はありません'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'次の候補'}).count(),0);
  assert.match(await page.getByRole('status')
    .filter({hasText:'この部分的な原本ZIPに指定Item IDの初期配置はありません'})
    .innerText(),/セーブの位置や配置可否は判定しません/);
  assert.match(await gridareaPanel.innerText(),/この部分的な原本ZIPにItem定義がありません/);
  await globalItemQuery.fill('200');
  await globalItemQuery.press('Enter');
  await page.getByRole('status')
    .filter({hasText:'この部分的な原本ZIPに指定Item IDの初期配置はありません'}).waitFor();
  await page.waitForFunction(()=>document.querySelector(
    '[aria-label="原本Item GridArea情報"]')?.textContent
      ?.includes('このItem定義に原本GridAreaは記録されていません'));
  assert.match(await gridareaPanel.innerText(),
    /このItem定義に原本GridAreaは記録されていません。配置不可とは判定しません/);

  // The DB-04 UI reuses DB-05's existing Rust/WASM grid-path matcher.
  // Synthetic Save map IDs 19/20/21 are intentionally NOT native Grid.IDs.
  // All private fields remain in the isolated Worker; only count receipts
  // may cross into the World Svelte view.
  const save={
    GameInfo:{Version:643},
    Player:{PrivateSyntheticName:'NEVER_RENDER_THIS_SAVE_FIELD'},
    World:{GridCollection:{
      Grids:{
        '19':{ID:19,GridDefaultLayoutPath:LAYOUT,
          GridDataPath:'GridData/Village04/Beach.json',Objects:{}},
        '20':{ID:20,GridDefaultLayoutPath:LOOSE,
          GridDataPath:'GridData/OffGridBuildings/Detached.json',Objects:{}},
        '21':{ID:21,GridDefaultLayoutPath:'SceneLayouts/Missing/Grid.json',
          GridDataPath:'GridData/NotInPartialSource/Grid.json',Objects:{}}
      },
      DiffGrids:{
        '31':{ID:31,GridDefaultLayoutPath:LAYOUT,
          GridDefaultLayoutType:'Meta.GridCollection, Meta',
          DefaultLayoutGridID:1,DefaultGridHashCode:17,
          DefaultGridDataHashCode:-9,ModifiedObjects:{}}
      }
    }}
  };
  const saveInput=panel.getByLabel('照合用セーブファイル');
  await saveInput.setInputFiles({
    name:'synthetic-save-grid-paths.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(save))
  });
  const auditResult=panel.locator('[aria-label="セーブGridDataPath照合結果"]');
  await auditResult.waitFor({timeout:40000});
  const cells=auditResult.locator(':scope > div');
  assert.equal(await cells.nth(0).locator('strong').innerText(),'3');
  assert.equal(await cells.nth(1).locator('strong').innerText(),'2');
  assert.equal(await cells.nth(2).locator('strong').innerText(),'0');
  assert.equal(await cells.nth(3).locator('strong').innerText(),'1');
  assert.equal(await cells.nth(4).locator('strong').innerText(),'1');
  assert.equal(await cells.nth(5).locator('strong').innerText(),'1');
  assert.doesNotMatch(await page.locator('body').innerText(),
    /NEVER_RENDER_THIS_SAVE_FIELD/);
  assert.doesNotMatch(await auditResult.innerText(),/GridData\/|SceneLayouts\//);
  await panel.getByRole('button',{name:'セーブ照合結果を破棄'}).click();
  assert.equal(await auditResult.count(),0);
  await saveInput.setInputFiles({
    name:'invalid-save.json',mimeType:'application/json',
    buffer:Buffer.from('{"World":INVALID_PRIVATE_CONTENT', 'utf8')
  });
  await panel.locator('.save-grid-audit [role="alert"]')
    .waitFor({timeout:40000});
  assert.equal(await auditResult.count(),0);
  assert.doesNotMatch(await page.locator('body').innerText(),
    /INVALID_PRIVATE_CONTENT/);

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

  // User-visible oriented full-rectangle floor match: intentionally generated
  // Steam 1.26.2 floor data with one incompatible cell (5,5).
  // No private game assets or actual Save editing are involved.
  const originalFloorZip=syntheticTerrainZip(true);
  await page.locator('.world-toolbar input[type=file]').setInputFiles({
    name:'synthetic-verified-floor-masks.zip',mimeType:'application/zip',
    buffer:originalFloorZip.archive
  });
  const terrainViewer=page.locator('.world-panel')
    .filter({has:page.locator('.floor-evidence')});
  await terrainViewer.locator('.floor-evidence').waitFor({timeout:20000});
  const floorPanel=terrainViewer.locator('.floor-evidence');
  await floorPanel.getByRole('searchbox',{name:'家具名で検索'})
    .fill('SyntheticSource');
  const sourceChair=floorPanel.getByRole('button',{
    name:/SyntheticSourceObject/
  });
  await sourceChair.waitFor({timeout:20000});
  await sourceChair.click();
  await floorPanel.getByText(/221地点/).first().waitFor({timeout:20000});
  assert.match(await floorPanel.innerText(),/設置可能マス数ではありません/);
  assert.equal(await floorPanel.locator('canvas').count(),1);
  const beforeDimensions=await floorPanel.locator('canvas').evaluate(
    canvas=>({width:canvas.width,height:canvas.height})
  );
  assert.deepEqual(beforeDimensions,{width:16,height:16});
  assert.match(await floorPanel.innerText(),/原本初期配置のアンカーを表示/);
  await floorPanel.getByLabel('家具の向き').selectOption('4');
  await floorPanel.getByText(/221地点/).first().waitFor({timeout:20000});
  await floorPanel.getByRole('button',{name:'床属性だけ'}).click();
  assert.equal(await floorPanel.locator('canvas').count(),1);
  await floorPanel.getByRole('button',{name:'回転形状の条件'}).click();
  assert.equal(await floorPanel.locator('canvas').count(),1);
  // The floor map now supports source-local inspection of original default
  // object raw GridLayers; these bits NEVER represent valid placement.
  const inspectMap=floorPanel.getByRole('button',{
    name:'地形マップから原本初期配置のマスを調べる'
  });
  const mapGeometry=await inspectMap.evaluate(button=>{
    const rect=button.getBoundingClientRect();
    const canvas=button.querySelector('canvas')?.getBoundingClientRect();
    return {width:rect.width,height:rect.height,
      canvasWidth:canvas?.width??0,canvasHeight:canvas?.height??0};
  });
  assert.equal(mapGeometry.width>=150,true,
    'DB04_MAP_INTERACTIVE_WIDTH '+JSON.stringify(mapGeometry));
  assert.equal(mapGeometry.height>=150,true,
    'DB04_MAP_INTERACTIVE_HEIGHT '+JSON.stringify(mapGeometry));
  await inspectMap.click();
  const originalLayers=floorPanel.locator('.local-inspection');
  await originalLayers.waitFor({timeout:20000});
  assert.match(await originalLayers.innerText(),/原本の初期オブジェクト/);
  assert.match(await originalLayers.innerText(),/定義上の寄与セル/);
  assert.match(await originalLayers.innerText(),/配置可能・不可能は示しません/);
  assert.equal(await originalLayers.locator('canvas').count(),1);
  const areaSummary=floorPanel.locator('.area-breakdown');
  await areaSummary.locator('summary').click();
  assert.match(await areaSummary.innerText(),/原本エリア/);
  assert.match(await areaSummary.innerText(),/形状一致地点/);
  // All World source components must stay within a 320px phone viewport.
  await page.setViewportSize({width:320,height:720});
  assert.equal(await page.evaluate(()=>
    document.documentElement.scrollWidth<=window.innerWidth+2),true,
    'DB04_INSPECT_FLOOR_320PX_OVERFLOW');
  await page.setViewportSize({width:1280,height:800});

  // Original-size synthetic WebP plus explicit source-cell/image registration.
  const webpData=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=80;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#598ab1';ctx.fillRect(0,0,96,80);
    return canvas.toDataURL('image/webp');
  });
  assert.match(webpData,/^data:image\/webp;base64,/);
  const mapBytes=Buffer.from(webpData.split(',')[1],'base64');
  const mapCalibration={schema:'wand.db04.media-map-calibration@1',platform:'Steam',
    gameVersion:'1.26.2',regionKey:'Village04',
    image:{filename:'synthetic-map.webp',width:96,height:80,
      sha256:createHash('sha256').update(mapBytes).digest('hex')},
    grids:[{layoutId:LAYOUT,nativeGridId:1,gridDataPath:'GridData/Village04/Beach.json',
      sizeX:16,sizeY:16,gridToImage:[3,0,0,-3,10,60]}]};
  const mapPanel=terrainViewer.locator('.media-map-overlay');
  await mapPanel.getByLabel('MEDIAマップと座標対応JSON').setInputFiles([
    {name:'synthetic-map.webp',mimeType:'image/webp',buffer:mapBytes},
    {name:'synthetic-map.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(mapCalibration))}
  ]);
  await mapPanel.locator('svg .cell-mask').waitFor({timeout:20000});
  assert.equal(await mapPanel.locator('svg .cell-mask').getAttribute('transform'),
    'matrix(3 0 0 -3 10 60)');
  assert.match(await mapPanel.innerText(),/家具形状と床属性の一致候補/);
  assert.equal(await mapPanel.locator('.grid-lines').count(),1);
  assert.equal(await mapPanel.locator('.source-map-object').count(),1);
  assert.equal(await mapPanel.locator('.source-map-object .object-shape').count(),1);
  await mapPanel.getByRole('group',{name:'選択対象レイヤー'}).getByRole('button',{name:'家具',exact:true}).click();
  assert.equal(await mapPanel.locator('.source-map-object').count(),1);
  assert.equal(await mapPanel.locator('.source-map-object').getAttribute('data-layer'),'furniture');
  await mapPanel.getByRole('group',{name:'選択対象レイヤー'}).getByRole('button',{name:'すべて',exact:true}).click();
  const clickCell=async(x,y)=>{
    await mapPanel.locator('.map > svg').scrollIntoViewIfNeeded();
    const p=await mapPanel.locator('.map > svg').evaluate((svg,[x,y])=>{
      const point=new DOMPoint(10+3*(x+.5),60-3*(y+.5)).matrixTransform(svg.getScreenCTM());
      return {x:point.x,y:point.y};
    },[x,y]);
    await page.mouse.move(p.x,p.y);
    await page.mouse.click(p.x,p.y);
  };
  await clickCell(4,4);
  await mapPanel.locator('.placement-cell').first().waitFor();
  assert.equal(await mapPanel.locator('.placement-cell[data-evidence="floor-mismatch"]').count(),1);
  assert.equal(await mapPanel.locator('.placement-cell[data-evidence="unknown"]').count(),3);
  await clickCell(15,15);
  assert.equal(await mapPanel.locator('.placement-cell[data-evidence="outside-source-grid"]').count(),3);
  assert.equal(await mapPanel.locator('.placement-cell[data-evidence="unknown"]').count(),1);
  await floorPanel.getByLabel('家具の向き').selectOption('8');
  await mapPanel.locator('.placement-cell').first().waitFor();
  assert.equal(await mapPanel.locator('.placement-cell[data-evidence="outside-source-grid"]').count(),3);
  await mapPanel.getByLabel('マス表示').uncheck();
  await mapPanel.locator('svg .cell-mask').waitFor({state:'detached'});
  assert.equal(await mapPanel.locator('.grid-lines').count(),1);
  assert.equal(await mapPanel.locator('.placement-cell').count(),4);
  await floorPanel.getByRole('button',{name:'家具の選択を解除'}).click();
  await clickCell(4,5);
  await mapPanel.locator('.selected-object').waitFor();
  assert.match(await mapPanel.locator('.selected-object').innerText(),/SyntheticSourceObject/);
  const originalViewBox=await mapPanel.locator('.map > svg').getAttribute('viewBox');
  await mapPanel.getByRole('button',{name:'拡大',exact:true}).click();
  assert.notEqual(await mapPanel.locator('.map > svg').getAttribute('viewBox'),originalViewBox);
  await mapPanel.getByRole('button',{name:'全体表示',exact:true}).click();
  assert.equal(await mapPanel.locator('.map > svg').getAttribute('viewBox'),originalViewBox);
  await mapPanel.locator('.map > svg').scrollIntoViewIfNeeded();
  await mapPanel.locator('.map > svg').hover();
  await page.mouse.wheel(0,-120);
  await page.waitForFunction(({initial})=>document.querySelector('.media-map-overlay svg')?.getAttribute('viewBox')!==initial,{initial:originalViewBox});
  const beforePan=await mapPanel.locator('.map > svg').getAttribute('viewBox');
  const rect=await mapPanel.locator('.map > svg').boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+20,rect.y+rect.height/2,{steps:4});await page.mouse.up();
  assert.notEqual(await mapPanel.locator('.map > svg').getAttribute('viewBox'),beforePan);
  assert.match(await mapPanel.locator('.selected-object').innerText(),/SyntheticSourceObject/);
  await mapPanel.getByRole('button',{name:'全体表示',exact:true}).click();
  await mapPanel.getByRole('button',{name:'解除'}).click();
  await mapPanel.locator('.map > svg').waitFor({state:'detached'});
  await mapPanel.getByRole('button',{name:'簡略マップ',exact:true}).click();
  await mapPanel.locator('.source-map-object').waitFor();
  assert.match(await mapPanel.innerText(),/原本Gridの簡略図/);
  await mapPanel.getByRole('button',{name:'簡略マップを閉じる'}).click();

  // Source/GridData path match with a generated local Save remains a
  // SEPARATE numeric plot; it is never painted as original terrain occupancy.
  const syntheticSave={GameInfo:{Version:1262},Player:{},World:{GridCollection:{Grids:{
    "777":{ID:777,GridDefaultLayoutPath:LAYOUT,
      GridDataPath:'GridData/Village04/Beach.json',
      Objects:{
        "1":{ID:1,ItemID:100,X:4,Y:5,Orientation:'GridOrientation_Up'},
        "2":{ID:2,ItemID:100,X:17,Y:3,Orientation:'GridOrientation_Right'},
      }},
  },DiffGrids:{}}}};
  const saveChooser=page.locator(
    'input[type=file][aria-hidden="true"][accept*=".profile"]');
  await saveChooser.setInputFiles({
    name:'synthetic-world-save.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(syntheticSave)),
  });
  const candidates=terrainViewer.locator('.saved-candidate-view');
  await candidates.getByRole('button',{name:'選択Gridと照合'})
    .click({timeout:20000});
  try{
    await candidates.locator('.saved-object-shape').first().waitFor({timeout:20000});
    assert.equal(await candidates.locator('.saved-object-shape').count(),2);
    assert.equal(await candidates.locator('.saved-object').first().getAttribute('transform'),'translate(4 5)');
    const savedPlot=candidates.locator('.saved-shape-plot');
    await savedPlot.getByLabel('配置済み家具を検索').fill('SyntheticSourceObject');
    await savedPlot.locator('.object-results button').first().click();
    await savedPlot.locator('.selected-saved-object').waitFor();
    await savedPlot.getByLabel('検索を解除').click();
    await savedPlot.getByRole('button',{name:'閉じる',exact:true}).click();
    await savedPlot.getByRole('button',{name:'全体表示',exact:true}).click();
    await savedPlot.locator('.plot > svg').scrollIntoViewIfNeeded();
    const position=await savedPlot.locator('.plot > svg').evaluate(svg=>{
      const p=new DOMPoint(4.5,5.5).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};});
    await page.mouse.click(position.x,position.y);
    await savedPlot.getByLabel('移動先X').fill('17');
    await savedPlot.getByLabel('移動先Y').fill('3');
    await savedPlot.locator('.saved-overlap-cell[data-evidence="shape-overlap"]').first().waitFor();
    await savedPlot.getByLabel('移動先Y').fill('5');
    await savedPlot.getByLabel('移動先X').fill('6');
    await savedPlot.locator('.saved-overlap-cell').first().waitFor({state:'detached'});
    await savedPlot.getByLabel('編集後の向き').selectOption('GridOrientation_Right');
    await savedPlot.locator('.saved-draft-shape').waitFor();
    await savedPlot.getByRole('button',{name:'変更を検証'}).click();
    await savedPlot.getByRole('button',{name:'実験的な編集コピーを作成'}).click({timeout:20000});
    await savedPlot.getByRole('link',{name:'編集済みコピーを保存'}).waitFor({timeout:20000});
    await savedPlot.getByRole('button',{name:'配置変更を追加'}).click();
    await savedPlot.locator('.staged-edit').waitFor();
    assert.equal(await savedPlot.locator('.saved-object[data-local-ordinal="1"]').getAttribute('transform'),'translate(6 5)');
    await savedPlot.getByRole('button',{name:'配置変更を取り消す'}).click();
    assert.equal(await savedPlot.locator('.saved-object[data-local-ordinal="1"]').getAttribute('transform'),'translate(4 5)');
    await savedPlot.getByRole('button',{name:'配置変更をやり直す'}).click();
    assert.equal(await savedPlot.locator('.saved-object[data-local-ordinal="1"]').getAttribute('transform'),'translate(6 5)');
    // Undo/redo buttons may scroll the map out of view. Select the second
    // object through the new placed-object picker instead of stale screen coordinates.
    await savedPlot.getByLabel('配置済み家具を検索').fill('SyntheticSourceObject');
    await savedPlot.locator('.object-results button').filter({hasText:'17, 3'}).click();
    await savedPlot.locator('.selected-saved-object').filter({hasText:'(17, 3)'}).waitFor();
    await savedPlot.getByLabel('移動先X').fill('14');
    await savedPlot.getByRole('button',{name:'配置変更を追加'}).click();
    assert.equal(await savedPlot.locator('.staged-edit').count(),2);
    await savedPlot.getByRole('button',{name:'一括変更を検証'}).click();
    await savedPlot.getByRole('button',{name:'実験的な編集コピーを作成'}).click({timeout:20000});
    await savedPlot.getByRole('link',{name:'編集済みコピーを保存'}).waitFor({timeout:20000});
  }catch(error){
    console.error('DB04_SAVE_SOURCE_DIAGNOSTIC',JSON.stringify({
      candidateText:await candidates.innerText(),
      plottedObjects:await candidates.locator('.saved-object').count(),
      shapePaths:await candidates.locator('.saved-object-shape').count(),
      pageErrors,pageUrl:page.url(),
      sourceSelection:await terrainViewer.locator('.world-toolbar').innerText().catch(()=>'no-toolbar')
    }));
    throw error;
  }
  assert.match(await candidates.innerText(),/原本参照パス一致候補/);
  assert.match(await candidates.innerText(),/2件/);
  assert.match(await candidates.innerText(),/原本数値範囲外/);
  assert.match(await candidates.innerText(),/原本地形の座標には投影していません/);
  assert.match(await candidates.innerText(),/設置許可は/);
  // The header's single local Save selection invalidates earlier Save
  // coordinates. A replacement never leaves stale plotted player data.
  await saveChooser.setInputFiles({
    name:'replacement-save.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({
      GameInfo:{Version:1262},Player:{},
      World:{GridCollection:{Grids:{},DiffGrids:{}}}
    })),
  });
  await candidates.locator('.saved-shape-plot').waitFor({state:'detached',timeout:20000});

  // Road anchor duplication is visible and blocked; a distinct coordinate
  // still reaches the Rust-backed copy path.
  await page.locator('.world-toolbar input[type=file]').setInputFiles({
    name:'synthetic-exclusive.zip',mimeType:'application/zip',
    buffer:syntheticTerrainZip(true,1,true).archive
  });
  const roadSave=structuredClone(syntheticSave);
  roadSave.World.GridCollection.Grids['777'].Objects={
    '1':{ID:1,ItemID:40100001,X:4,Y:5,Orientation:'GridOrientation_Up'},
    '2':{ID:2,ItemID:40100001,X:8,Y:5,Orientation:'GridOrientation_Up'}
  };
  await saveChooser.setInputFiles({name:'synthetic-road-save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(roadSave))});
  await candidates.getByRole('button',{name:'選択Gridと照合'}).click({timeout:20000});
  const roadPlot=candidates.locator('.saved-shape-plot');
  await roadPlot.locator('.saved-object').first().waitFor({timeout:20000});
  await roadPlot.locator('.plot > svg').scrollIntoViewIfNeeded();
  const roadPosition=await roadPlot.locator('.plot > svg').evaluate(svg=>{
    const p=new DOMPoint(4.5,5.5).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};});
  await page.mouse.click(roadPosition.x,roadPosition.y);
  await roadPlot.getByLabel('移動先X').fill('8');
  await roadPlot.locator('.exclusive-anchor-conflict').waitFor();
  assert.equal(await roadPlot.getByRole('button',{name:'変更を検証'}).isDisabled(),true);
  assert.equal(await roadPlot.getByLabel('編集後の向き').count(),0);
  await roadPlot.getByLabel('移動先X').fill('6');
  await roadPlot.locator('.exclusive-anchor-conflict').waitFor({state:'detached'});
  await roadPlot.getByRole('button',{name:'変更を検証'}).click();
  await roadPlot.getByRole('button',{name:'実験的な編集コピーを作成'}).click({timeout:20000});
  await roadPlot.getByRole('link',{name:'編集済みコピーを保存'}).waitFor({timeout:20000});

  // Factor two source anchors are visible at their own integer coordinates,
  // without a fabricated terrain projection or placement preview.
  await page.locator('.world-toolbar input[type=file]').setInputFiles({
    name:'synthetic-factor-two.zip',mimeType:'application/zip',
    buffer:syntheticTerrainZip(true,2).archive
  });
  await mapPanel.getByRole('button',{name:'簡略マップ',exact:true}).click({timeout:20000});
  await mapPanel.locator('.source-map-object').waitFor({timeout:20000});
  assert.match(await mapPanel.innerText(),/原本の配置座標専用図/);
  assert.equal(await mapPanel.locator('.map > svg').getAttribute('viewBox'),'0 0 32 32');
  assert.equal(await mapPanel.locator('.source-map-object').getAttribute('transform'),'translate(18 5)');
  assert.equal(await mapPanel.locator('.cell-mask').count(),0);
  assert.equal(await mapPanel.locator('.placement-cell').count(),0);
  assert.equal(await mapPanel.locator('.object-shape').count(),1);
  await mapPanel.getByRole('button',{name:'簡略マップを閉じる'}).click();

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

  // Public editor uses the actual published mainland terrain, no private ZIP.
  await page.goto('http://127.0.0.1:4178/Wand/world/');
  const publicWorld=page.locator('.world-workspace');
  await publicWorld.getByLabel('エリア',{exact:true}).waitFor({timeout:20000});
  await publicWorld.locator('.media-map-overlay .cell-mask').waitFor({timeout:20000});
  // No Save is needed to create a source-shaped design and retain it when
  // switching areas or returning to the Save editor.
  await publicWorld.getByRole('button',{name:'装飾設計',exact:true}).click();
  await publicWorld.getByRole('button',{name:'本島全体マップ',exact:true}).click();
  const overview=publicWorld.locator('.mainland-overview');
  await overview.locator('.mainland-terrain').nth(7).waitFor({timeout:30000});
  assert.equal(await overview.locator('.mainland-terrain').count(),8);
  assert.equal(await overview.locator('.mainland-terrain[data-area="Meadow"]').getAttribute('transform'),'translate(-122 98) scale(1 -1)');
  await overview.getByRole('button',{name:'閉じる',exact:true}).click();
  await publicWorld.getByRole('button',{name:'本島全体編集',exact:true}).click();
  const mainland=publicWorld.locator('.design-workspace.mainland-design');
  await mainland.locator('.design-coordinate-space > image').waitFor({timeout:30000});
  assert.equal(await publicWorld.getByLabel('エリア',{exact:true}).count(),0);
  const mainlandView=await mainland.locator('.design-plot > svg').getAttribute('viewBox');
  assert.ok(Number(mainlandView.split(' ')[2])>400);
  await mainland.getByRole('button',{name:'拡大',exact:true}).click();
  assert.notEqual(await mainland.locator('.design-plot > svg').getAttribute('viewBox'),mainlandView);
  await mainland.getByRole('button',{name:'全体表示',exact:true}).click();
  assert.equal(await mainland.locator('.design-plot > svg').getAttribute('viewBox'),mainlandView);
  // Use rendered original terrain to choose two unambiguous floor patches,
  // in the source-projected Plaza and Meadow interiors. The editor itself
  // must resolve each click and keep both objects in one Undo timeline.
  await mainland.getByLabel('配置カテゴリ').selectOption('furniture');
  await mainland.locator('.design-item').first().waitFor({timeout:30000});
  await mainland.locator('.design-item').first().click();
  await mainland.getByRole('button',{name:'配置終了'}).waitFor({timeout:30000});
  await mainland.getByRole('button',{name:'家具パレット'}).click();
  const spots=await mainland.locator('.design-coordinate-space').evaluate(async group=>{
    const image=group.querySelector(':scope > image'),bitmap=new Image();
    bitmap.src=image.getAttribute('href');await bitmap.decode();
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
    const ok=(x,y)=>{const i=(y*canvas.width+x)*4;return data[i]!==47||data[i+1]!==45||data[i+2]!==55;};
    const regions=[[272,316,396,416],[228,220,396,290]],out=[];
    for(const [x1,y1,x2,y2] of regions){
      const candidates=[];
      for(let y=y1;y<y2-12;y+=4)for(let x=x1;x<x2-12;x+=4){
        let good=true;for(let dy=0;dy<12&&good;dy++)for(let dx=0;dx<12;dx++)if(!ok(x+dx,y+dy)){good=false;break;}
        if(!good)continue;
        const p=new DOMPoint(x+2.5,y+2.5).matrixTransform(group.getScreenCTM());
        if(document.elementFromPoint(p.x,p.y)?.closest('.design-plot'))candidates.push({x:p.x,y:p.y});
      }
      out.push(candidates.slice(0,30));
    }
    return out;
  });
  for(const choices of spots){
    let placed=false;
    for(const point of choices){
      await page.mouse.move(point.x,point.y);
      if(await mainland.locator('.design-ghost').getAttribute('fill')!=='#b9c7d6')continue;
      const before=await mainland.locator('.design-object').count();
      await page.mouse.click(point.x,point.y);
      if(await mainland.locator('.design-object').count()===before+1){placed=true;break;}
    }
    assert.ok(placed,'source-resolved placement in each mainland area');
  }
  await mainland.getByRole('button',{name:'配置終了'}).click();
  assert.equal(await mainland.locator('.design-object').count(),2);
  await mainland.getByLabel('設計を取り消す').click();assert.equal(await mainland.locator('.design-object').count(),1);
  await mainland.getByLabel('設計をやり直す').click();assert.equal(await mainland.locator('.design-object').count(),2);
  // Keep the world design when temporarily returning to local-area tools.
  await publicWorld.getByRole('button',{name:'本島全体編集',exact:true}).click();
  await publicWorld.getByRole('button',{name:'本島全体編集',exact:true}).click();
  assert.equal(await mainland.locator('.design-object').count(),2);
  await publicWorld.getByRole('button',{name:'本島全体編集',exact:true}).click();
  const design=publicWorld.locator('.design-workspace');
  await design.getByRole('button',{name:'家具パレット'}).click();
  await design.locator('.design-item').first().waitFor({timeout:30000});
  const frame=design.locator('.design-map-frame');
  const frameBox=await frame.boundingBox(),workspaceBox=await publicWorld.boundingBox();
  assert.ok(Math.abs(frameBox.height-workspaceBox.height)<2,'map must fill workspace height');
  assert.ok(Math.abs(frameBox.width-workspaceBox.width)<2,'map must fill workspace width');
  const initialView=await design.locator('.design-plot > svg').getAttribute('viewBox');
  await frame.getByRole('button',{name:'拡大',exact:true}).click();
  assert.notEqual(await design.locator('.design-plot > svg').getAttribute('viewBox'),initialView);
  await frame.getByRole('button',{name:'全体表示',exact:true}).click();
  assert.equal(await design.locator('.design-plot > svg').getAttribute('viewBox'),initialView);
  await design.getByRole('button',{name:'家具パレット'}).click();
  assert.equal((await frame.boundingBox()).width,frameBox.width);
  assert.equal(await design.locator('aside').isVisible(),false);
  await design.getByRole('button',{name:'家具パレット'}).click();
  await design.getByLabel('配置カテゴリ').selectOption('furniture');
  await design.locator('.design-item').first().click();
  await design.getByRole('button',{name:'配置終了'}).waitFor({timeout:30000});
  await design.getByRole('button',{name:'家具パレット'}).click();
  const designSvg=design.locator('.design-plot > svg');
  async function designClick(x,y){
    const p=await designSvg.evaluate((svg,xy)=>{const pt=new DOMPoint(xy[0],xy[1]).matrixTransform(svg.getScreenCTM());return {x:pt.x,y:pt.y};},[x,y]);
    await page.mouse.click(p.x,p.y);
  }
  await designClick(10.5,10.5);
  await design.locator('.design-object').first().waitFor();
  await design.getByRole('button',{name:'配置終了'}).click();
  await design.getByLabel('設計を取り消す').click();
  assert.equal(await design.locator('.design-object').count(),0);
  await design.getByLabel('設計をやり直す').click();
  assert.equal(await design.locator('.design-object').count(),1);
  await designClick(10.5,10.5);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Meta+v');
  await designClick(20.5,20.5);
  assert.equal(await design.locator('.design-object').count(),2);
  await page.keyboard.press('Meta+z');
  assert.equal(await design.locator('.design-object').count(),1);
  await page.keyboard.press('Control+y');
  assert.equal(await design.locator('.design-object').count(),2);
  await page.keyboard.press('Control+a');
  await design.getByRole('button',{name:'整列・均等配置',exact:true}).click();
  await design.getByRole('button',{name:'左揃え',exact:true}).click();
  assert.equal(await design.locator('.alignment-ghost').count(),2);
  await design.getByRole('button',{name:'確定',exact:true}).click();
  assert.deepEqual(await design.locator('.design-object').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('transform')).sort()),['translate(10 10)','translate(10 20)']);
  await design.getByLabel('設計を取り消す').click();
  assert.deepEqual(await design.locator('.design-object').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('transform')).sort()),['translate(10 10)','translate(20 20)']);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Meta+x');
  assert.equal(await design.locator('.design-object').count(),0);
  await page.keyboard.press('Meta+z');
  assert.equal(await design.locator('.design-object').count(),2);
  await page.keyboard.press('Control+Shift+z');
  assert.equal(await design.locator('.design-object').count(),0);
  await page.keyboard.press('Meta+z');
  assert.equal(await design.locator('.design-object').count(),2);
  await page.keyboard.press('Control+z');
  assert.equal(await design.locator('.design-object').count(),1);
  const designScreen=async(x,y)=>designSvg.evaluate((svg,xy)=>{const p=new DOMPoint(...xy).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};},[x,y]);
  const from=await designScreen(10.5,10.5),to=await designScreen(14.5,13.5);
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:5});await page.mouse.up();
  assert.equal(await design.locator('.design-object').first().getAttribute('transform'),'translate(14 13)');
  await page.keyboard.press('Control+z');
  assert.equal(await design.locator('.design-object').first().getAttribute('transform'),'translate(10 10)');
  await design.getByRole('button',{name:'レイヤー',exact:true}).click();
  await design.getByRole('button',{name:'ロック 家具',exact:true}).click();
  await page.keyboard.press('Control+a');await page.keyboard.press('Delete');
  assert.equal(await design.locator('.design-object').count(),1);
  await design.getByRole('button',{name:'非表示 家具',exact:true}).click();
  assert.equal(await design.locator('.design-object').count(),0);
  await design.getByRole('button',{name:'表示 家具',exact:true}).click();
  assert.equal(await design.locator('.design-object').count(),1);
  await design.getByRole('button',{name:'ロック解除 家具',exact:true}).click();
  await design.getByRole('button',{name:'レイヤー',exact:true}).click();
  await design.getByRole('button',{name:'対称編集',exact:true}).click();
  await design.getByRole('button',{name:'垂直軸',exact:true}).click();
  assert.equal(await design.locator('.symmetry-axis').count(),1);
  await design.getByRole('button',{name:'水平軸',exact:true}).click();
  assert.equal(await design.locator('.symmetry-axis').count(),1);
  await design.getByRole('button',{name:'点対称',exact:true}).click();
  assert.equal(await design.locator('.symmetry-center').count(),1);
  await design.getByRole('button',{name:'無効',exact:true}).click();
  assert.equal(await design.locator('.symmetry-center').count(),0);
  await design.getByRole('button',{name:'対称編集',exact:true}).click();
  // Real DB-backed path and fence styles, not synthetic geometry fixtures.
  await design.getByRole('button',{name:'家具パレット'}).click();
  await design.getByLabel('配置カテゴリ').selectOption('ground');
  await design.locator('.design-item[data-item-id="40100068"]').waitFor({timeout:30000});
  await design.locator('.design-item[data-item-id="40100068"]').click();
  await design.getByRole('group',{name:'道の描画',exact:true}).waitFor({timeout:30000});
  await design.getByRole('button',{name:'家具パレット'}).click();
  await design.getByRole('button',{name:'直線',exact:true}).click();
  const dragDesign=async(x1,y1,x2,y2)=>{
    const a=await designScreen(x1,y1),b=await designScreen(x2,y2);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();
  };
  await dragDesign(20.5,20.5,28.5,20.5);
  assert.equal(await design.locator('.design-object[data-item-id="40100068"]').count(),5);
  await design.getByRole('button',{name:'配置終了'}).click();
  await designClick(20.5,20.5);
  await design.getByRole('button',{name:'スタイル置換',exact:true}).click();
  await design.getByLabel('変更先',{exact:true}).selectOption('40100035');
  await design.locator('.network-style-ghost').first().waitFor({timeout:30000});
  assert.equal(await design.locator('.network-style-ghost').count(),5);
  await design.locator('.network-style-controls').getByRole('button',{name:'確定',exact:true}).click();
  assert.equal(await design.locator('.design-object[data-item-id="40100035"]').count(),5);
  await design.getByLabel('設計を取り消す').click();
  assert.equal(await design.locator('.design-object[data-item-id="40100068"]').count(),5);
  await design.getByLabel('設計を取り消す').click();
  assert.equal(await design.locator('.design-object').count(),1);
  await design.getByRole('button',{name:'家具パレット'}).click();
  await design.getByLabel('配置カテゴリ').selectOption('fence');
  await design.locator('.design-item').first().waitFor({timeout:30000});
  await design.locator('.design-item').first().click();
  await design.getByRole('group',{name:'フェンスの描画',exact:true}).waitFor({timeout:30000});
  await design.getByRole('button',{name:'家具パレット'}).click();
  await design.getByRole('button',{name:'直線',exact:true}).click();
  await dragDesign(20.5,20.5,28.5,20.5);
  assert.equal(await design.locator('.design-object').count(),10);
  assert.equal(await design.locator('.design-fence-edge').count(),8);
  await design.getByRole('button',{name:'配置終了'}).click();
  await design.getByLabel('設計を取り消す').click();
  assert.equal(await design.locator('.design-object').count(),1);
  assert.equal(await design.locator('.design-fence-edge').count(),0);
  await publicWorld.getByLabel('エリア',{exact:true}).selectOption({label:'Plaza'});
  await design.locator('.design-plot').waitFor({timeout:20000});
  assert.equal(await design.locator('.design-object').count(),0);
  await publicWorld.getByLabel('エリア',{exact:true}).selectOption({label:'Peaceful Meadow'});
  await design.locator('.design-object').first().waitFor({timeout:20000});
  await publicWorld.getByRole('button',{name:'セーブ編集',exact:true}).click();
  await publicWorld.locator('.media-map-overlay .cell-mask').waitFor({timeout:20000});
  const worldSave={GameInfo:{Version:1262},Player:{},World:{GridCollection:{Grids:{
    "101":{ID:101,GridDefaultLayoutPath:'SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json',
      GridDataPath:'GridData/Villages/Village04-MeadowLevel-GridData.json',NextGridObjectID:10,
      Objects:{"1":{ID:1,ItemID:40005160,X:4,Y:5,Orientation:'GridOrientation_Down'},
        "4":{ID:4,ItemID:40005160,X:9,Y:5,Orientation:'GridOrientation_Down'}}},
    "102":{ID:102,GridDefaultLayoutPath:'SceneLayouts/Village04/DefaultVillageLayout01-UrbanGrids.json',
      GridDataPath:'GridData/Villages/Village04-UrbanLevel-GridData.json',TessellationFactor:2,
      Objects:{"2":{ID:2,ItemID:40005160,X:7,Y:6,Orientation:'GridOrientation_Down'}}}
  },DiffGrids:{}}}};
  await page.locator('input[type=file][aria-hidden="true"][accept*=".profile"]').setInputFiles({
    name:'synthetic-public-world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(worldSave))});
  await publicWorld.locator('.saved-terrain-background').waitFor({timeout:30000});
  await publicWorld.locator('.saved-object').first().waitFor({timeout:30000});
  assert.equal(await publicWorld.locator('.saved-object').first().getAttribute('transform'),'translate(4 5)');
  await publicWorld.locator('.media-map-overlay').waitFor({state:'detached'});
  // Choose a source-backed furniture record through the normal picker and
  // compute the full terrain-origin raster with the real WASM Worker.
  const publicPlot=publicWorld.locator('.saved-shape-plot');
  await publicPlot.getByLabel('配置済み家具を検索').focus();
  await publicPlot.locator('.object-results button').first().click();
  await publicPlot.getByRole('button',{name:'配置候補マス',exact:true}).click();
  const worldThumb=publicPlot.locator('.world-object-artwork').first();
  await worldThumb.waitFor({timeout:20000});
  assert.match(await worldThumb.getAttribute('href'),/461f6484256c69e5a528adc3af7054301841fc324c237d8bc0d4534830345bec\.webp$/);
  assert.equal((await page.request.get(new URL(await worldThumb.getAttribute('href'),page.url()).href)).ok(),true);
  const originOverlay=publicPlot.locator('.placement-origin-overlay');
  await originOverlay.waitFor({timeout:30000});
  assert.equal(await originOverlay.getAttribute('width'),'196');
  assert.equal(await originOverlay.getAttribute('height'),'100');
  assert.ok((await originOverlay.getAttribute('href')).startsWith('data:image/png;base64,'));
  await publicPlot.getByRole('button',{name:'右回転',exact:true}).click();
  await publicPlot.locator('.placement-origin-overlay').waitFor({timeout:30000});
  await publicPlot.getByRole('button',{name:'配置候補マス',exact:true}).click();
  await originOverlay.waitFor({state:'detached'});
  // Real public map: select two objects, translate both, undo/redo as one
  // transaction and validate the batch through the existing Rust writer.
  await publicPlot.getByRole('button',{name:'複数選択',exact:true}).click();
  await publicPlot.getByLabel('配置済み家具を検索').focus();
  await publicPlot.locator('.object-results button').nth(0).click();
  await publicPlot.locator('.object-results button').nth(1).click();
  assert.equal(await publicPlot.locator('.group-selected').count(),2);
  await publicPlot.getByLabel('一括移動X').fill('2');
  await publicPlot.locator('.group-draft-shape').first().waitFor();
  assert.equal(await publicPlot.locator('.group-draft-shape').count(),2);
  await publicPlot.getByRole('button',{name:'一括移動を追加',exact:true}).click();
  assert.deepEqual(await publicPlot.locator('.group-selected').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('transform')).sort()),['translate(11 5)','translate(6 5)']);
  await publicPlot.getByLabel('配置変更を取り消す').click();
  assert.deepEqual(await publicPlot.locator('.group-selected').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('transform')).sort()),['translate(4 5)','translate(9 5)']);
  await publicPlot.getByLabel('配置変更をやり直す').click();
  await publicPlot.getByRole('button',{name:'一括変更を検証',exact:true}).click();
  await publicPlot.getByRole('button',{name:'実験的な編集コピーを作成'}).waitFor({timeout:20000});
  await publicPlot.getByRole('button',{name:'全変更を取り消す'}).click();
  await publicPlot.getByRole('button',{name:'グループ右回転',exact:true}).click();
  await publicPlot.locator('.group-draft-shape').first().waitFor();
  assert.equal(await publicPlot.locator('.group-draft-shape').count(),2);
  await publicPlot.getByRole('button',{name:'一括移動を追加',exact:true}).click();
  assert.equal(await publicPlot.locator('.staged-edit').count(),2);
  await publicPlot.getByRole('button',{name:'一括変更を検証',exact:true}).click();
  await publicPlot.getByRole('button',{name:'実験的な編集コピーを作成'}).waitFor({timeout:20000});
  await publicPlot.getByRole('button',{name:'全変更を取り消す'}).click();
  await publicPlot.getByRole('button',{name:'選択解除',exact:true}).click();
  await publicPlot.getByRole('button',{name:'範囲選択',exact:true}).click();
  const plotSvg=publicPlot.locator('.plot > svg');
  async function groupClick(x,y){
    const p=await plotSvg.evaluate((svg,xy)=>{const pt=new DOMPoint(xy[0],xy[1]).matrixTransform(svg.getScreenCTM());return {x:pt.x,y:pt.y};},[x,y]);
    assert.ok(await plotSvg.evaluate((svg,p)=>svg.parentElement.contains(document.elementFromPoint(p.x,p.y)),p),'range selection point must be reachable on map');
    await page.mouse.click(p.x,p.y);
  }
  await publicPlot.getByRole('button',{name:'検索・レイヤー'}).click();
  await publicPlot.getByRole('button',{name:'編集パネル'}).click();
  await publicWorld.getByRole('button',{name:'ワールド選択',exact:true}).click();
  await publicPlot.getByRole('button',{name:'全体表示',exact:true}).click();
  await publicPlot.getByRole('button',{name:'拡大',exact:true}).click();
  await publicPlot.getByRole('button',{name:'拡大',exact:true}).click();
  for(let i=0;i<4;i++){await publicPlot.getByRole('button',{name:'左へ移動',exact:true}).click();await publicPlot.getByRole('button',{name:'上へ移動',exact:true}).click();}
  await groupClick(3.5,4.5);
  await groupClick(10.5,6.5);
  await publicWorld.getByRole('button',{name:'ワールド選択',exact:true}).click();
  await publicPlot.getByRole('button',{name:'検索・レイヤー'}).click();
  await publicPlot.getByRole('button',{name:'編集パネル'}).click();
  assert.equal(await publicPlot.locator('.group-selected').count(),2);
  await publicPlot.getByRole('button',{name:'複数選択',exact:true}).click();
  await publicPlot.getByRole('button',{name:'閉じる',exact:true}).click();
  // Structural rehearsal must validate the local candidate without making
  // any downloadable Save or modifying the current placement.
  await publicPlot.getByLabel('配置済み家具を検索').focus();
  await publicPlot.locator('.object-results button').first().click();
  await publicPlot.getByLabel('移動先X').fill('12');
  await publicPlot.getByRole('button',{name:'複製を検証',exact:true}).click();
  await publicPlot.locator('.structure-result').waitFor({timeout:20000});
  assert.match(await publicPlot.locator('.structure-result').innerText(),/複製の構造検証に成功/);
  assert.equal(await publicPlot.getByRole('link',{name:'編集済みコピーを保存'}).count(),0);
  assert.equal(await publicPlot.getByRole('button',{name:'変更を検証',exact:true}).isDisabled(),true);
  await publicPlot.getByRole('button',{name:'プレビュー解除'}).click();
  await publicPlot.getByRole('button',{name:'元に戻す'}).click();
  await publicPlot.getByRole('button',{name:'削除を検証',exact:true}).click();
  await publicPlot.locator('.structure-remove-ghost').waitFor({timeout:20000});
  assert.equal(await publicPlot.locator('.saved-object').count(),2);
  await publicPlot.getByRole('button',{name:'プレビュー解除'}).click();
  // All three root themes recolor service chrome without recoloring the map.
  const themeResults=await page.evaluate(()=>{
    const root=document.documentElement,original=root.getAttribute('data-wand-theme');
    const area=document.querySelector('.world-workspace nav button[aria-pressed=true]');
    const layer=document.querySelector('.saved-shape-plot button[aria-pressed=true]');
    const probe=document.createElement('div');probe.style.backgroundColor='var(--wand-header-hover)';document.body.append(probe);
    const results=['dawn','coral','night'].map(theme=>{
      root.setAttribute('data-wand-theme',theme);
      const expected=getComputedStyle(probe).backgroundColor;
      return {expected,area:getComputedStyle(area).backgroundColor,layer:getComputedStyle(layer).backgroundColor,
        raster:document.querySelector('.saved-terrain-background').getAttribute('href')};
    });
    probe.remove();if(original===null)root.removeAttribute('data-wand-theme');else root.setAttribute('data-wand-theme',original);
    return results.map(({raster,...r})=>({...r,rasterUnchanged:raster===results[0].raster}));
  });
  assert.equal(new Set(themeResults.map(r=>r.expected)).size,3);
  for(const r of themeResults){assert.equal(r.area,r.expected);assert.equal(r.layer,r.expected);assert.equal(r.rasterUnchanged,true);}
  await publicWorld.getByLabel('エリア',{exact:true}).selectOption({label:'Plaza'});
  await publicWorld.locator('.saved-object').first().waitFor({timeout:20000});
  assert.equal(await publicWorld.locator('.saved-terrain-background').count(),0);
  await publicWorld.getByRole('button',{name:'地形図',exact:true}).click();
  await publicWorld.locator('.media-map-overlay .cell-mask').waitFor({timeout:20000});
  await publicWorld.getByLabel('エリア',{exact:true}).selectOption({label:'Peaceful Meadow'});
  await publicWorld.locator('.saved-terrain-background').waitFor({timeout:20000});
  await publicWorld.getByLabel('ワールド',{exact:true}).selectOption('VillageExpansion01');
  await publicWorld.locator('.media-map-overlay .cell-mask').waitFor({timeout:20000});
  await publicWorld.getByRole('button',{name:'ワールド全体マップ',exact:true}).click();
  const dlcOverview=publicWorld.locator('.mainland-overview');
  await dlcOverview.locator('.mainland-terrain').nth(33).waitFor({timeout:60000});
  assert.equal(await dlcOverview.locator('.mainland-terrain').count(),34);
  await dlcOverview.getByRole('button',{name:'閉じる',exact:true}).click();
  await publicWorld.getByLabel('ワールド',{exact:true}).selectOption('Village04');
  await publicWorld.getByLabel('エリア',{exact:true}).selectOption({label:'Peaceful Meadow'});
  await publicWorld.locator('.saved-terrain-background').waitFor({timeout:20000});

  // A matched source path may occur in more than one saved Grid. A factor
  // mismatch must never hide the standalone original terrain on selection.
  const mixed=structuredClone(worldSave);
  mixed.World.GridCollection.Grids['103']={...structuredClone(mixed.World.GridCollection.Grids['101']),ID:103,TessellationFactor:2,
    Objects:{'3':{ID:3,ItemID:40005160,X:10,Y:12,Orientation:'GridOrientation_Down'}}};
  await page.locator('input[type=file][aria-hidden="true"][accept*=".profile"]').setInputFiles({
    name:'synthetic-mixed-factor.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(mixed))});
  const gridSelect=publicWorld.locator('.saved-shape-plot').getByLabel('セーブ内Grid');
  await gridSelect.waitFor({timeout:30000});
  await publicWorld.locator('.saved-terrain-background').waitFor({timeout:20000});
  const firstGrid=await gridSelect.inputValue();
  await gridSelect.selectOption({index:1});
  assert.notEqual(await gridSelect.inputValue(),firstGrid);
  await publicWorld.locator('.saved-terrain-background').waitFor({state:'detached'});
  await publicWorld.getByRole('button',{name:'地形図',exact:true}).click();
  await publicWorld.locator('.media-map-overlay .cell-mask').waitFor({timeout:20000});
  await publicWorld.getByRole('button',{name:'配置図',exact:true}).click();
  await gridSelect.selectOption(firstGrid);
  await publicWorld.locator('.saved-terrain-background').waitFor({timeout:20000});
  await publicWorld.locator('.media-map-overlay').waitFor({state:'detached'});

  assert.deepEqual(pageErrors,[],pageErrors.join('\n'));
  assert.deepEqual(unexpectedWrites,[],unexpectedWrites.join('\n'));
  await page.close();
  console.log('DB04_WORLD_GRAPH_BROWSER_SMOKE_OK');
}finally{
  await browser?.close();
  server.kill();
}
