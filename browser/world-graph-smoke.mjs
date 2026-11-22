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
function syntheticTerrainZip(){
  const gridPaths=['GridData/Village04/Beach.json',
    'GridData/OffGridBuildings/Detached.json'];
  const layouts=[
    [LAYOUT,1,gridPaths[0]],
    [LOOSE,0,gridPaths[1]]
  ];
  const sources={
    objects:[{itemId:100,nativeType:'Furniture',
      nativeName:'SyntheticSourceObject',footprint:null}],
    scenes:[],worlds:[],areas:[],
    grids:gridPaths.map(gridId=>({
      gridId,sizeX:16,sizeY:16,
      terrainDecoding:{decoded:false,
        status:'native_packing_not_verified_for_game_version'}
    })),
    layouts:layouts.map(([layoutId,gridIdNative,gridDataPath])=>({
      layoutId,layoutKind:'nativeGridCollection',defaultObjectCount:1,
      nativeGridEntries:[{gridIdNative,gridDataPath,tessellationFactor:1,
        defaultObjectCount:1}]
    })),
    layoutObjects:layouts.map(([layoutId,gridIdNative],i)=>({
      layoutObjectId:layoutId+'#grid='+gridIdNative+'#object=1',
      layoutId,gridIdNative,gridObjectIdNative:1,
      itemId:100,x:4+i,y:5,
      orientationCode:0,worldCoordinatesVerified:false,
      fixedImmovableVerified:false
    }))
  };
  const entries=new Map(Object.entries(sources).map(([key,value])=>
    [key+'.json',Buffer.from(JSON.stringify(value))]));
  entries.set('report.json',Buffer.from(
    '{"status":"native_partial_world_extraction"}'));
  const hashes=Object.fromEntries([...entries].map(([name,buf])=>[
    name,createHash('sha256').update(buf).digest('hex')]));
  entries.set('manifest.json',Buffer.from(JSON.stringify({
    schema:'wand.db04.world@1',status:'partial_game_native_evidence',
    platform:'Steam',gameVersion:'1.26.2',
    sourceScopeVerified:false,outputSha256:hashes
  })));
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
  return Buffer.concat([...locals,...centrals,end]);
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
    buffer:syntheticTerrainZip()
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
  await openTerrain.click();
  const terrainSelectors=page.locator('.world-panel .selector-row select');
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
  assert.match(await terrainSelectors.nth(1).locator('option:checked').innerText(),
    /Village04\/Beach.json/);
  assert.equal(await terrainSelectors.nth(2).inputValue(),'1');
  await page.waitForFunction(()=>document.querySelector(
    '.grid-view button.current')?.getAttribute('aria-label')
      ==='座標4,5：アンカー1件');
  await page.getByRole('button',{name:'次の候補'}).click();
  await page.getByRole('status')
    .filter({hasText:'原本初期配置 2 / 2件'}).waitFor();
  assert.match(await terrainSelectors.nth(1).locator('option:checked').innerText(),
    /OffGridBuildings\/Detached.json/);
  assert.equal(await terrainSelectors.nth(2).inputValue(),'0');
  await page.waitForFunction(()=>document.querySelector(
    '.grid-view button.current')?.getAttribute('aria-label')
      ==='座標5,5：アンカー1件');
  await page.getByRole('button',{name:'前の候補'}).click();
  await page.getByRole('status')
    .filter({hasText:'原本初期配置 1 / 2件'}).waitFor();
  assert.equal(await terrainSelectors.nth(2).inputValue(),'1');
  await globalItemQuery.fill('999');
  await globalItemQuery.press('Enter');
  await page.getByRole('status')
    .filter({hasText:'この部分的な原本ZIPに指定Item IDの初期配置はありません'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'次の候補'}).count(),0);
  assert.match(await page.getByRole('status')
    .filter({hasText:'この部分的な原本ZIPに指定Item IDの初期配置はありません'})
    .innerText(),/セーブの位置や配置可否は判定しません/);

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
