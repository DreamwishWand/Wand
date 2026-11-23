import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldCatalog, WORLD_SCHEMA} from '../src/lib/world/catalog.mjs';
import {
  listWorldPreviewViews, summarizeWorldPreviewSourceCoverage,
  getWorldPreviewAnchorWindow,requireWorldPreviewCatalog,
} from '../src/lib/world/preview-views.ts';

test('legacy source boundary refuses incomplete catalogs and native response shells',()=>{
  for(const invalid of [null,{},{
    layouts:new Map(),grids:new Map()
  }])assert.throws(()=>requireWorldPreviewCatalog(invalid),
    /DB04_WORLD_PREVIEW_CATALOG_INVALID/);
  const valid=source();
  assert.equal(requireWorldPreviewCatalog(valid),valid);
});

function source() {
  const gridLayout = 'SceneLayouts/Village04/Area.json';
  const villageLayout = 'SceneLayouts/Village04/Default.json';
  const gridPath = 'GridData/Villages/Area.json';
  return createWorldCatalog({
    manifest: {schema: WORLD_SCHEMA, status:'partial_game_native_evidence',
      platform:'Steam', gameVersion:'1.26.2', sourceScopeVerified:false},
    objects: [{itemId:100, nativeType:'Furniture', nativeName:'Bench', footprint:null}],
    scenes: [], worlds: [], areas: [],
    grids: [{gridId:gridPath, sizeX:8, sizeY:8,
      terrainDecoding:{decoded:false,
        status:'native_packing_not_verified_for_game_version'}}],
    layouts: [
      {layoutId:gridLayout, layoutKind:'nativeGridCollection',
        nativeGridEntries:[{gridIdNative:3, gridDataPath:gridPath,
          defaultObjectCount:1}]},
      {layoutId:villageLayout, layoutKind:'nativeDefaultVillageData',
        areaLayoutReferences:[
          {nativeAreaTypeCode:9, nativeAreaTypeName:'Meadow',
            gridLayoutPath:gridLayout},
          {nativeAreaTypeCode:10, nativeAreaTypeName:'Missing',
            gridLayoutPath:'SceneLayouts/Village04/Absent.json'},
        ]},
    ],
    layoutObjects: [{
      layoutObjectId:gridLayout+'#grid=3#object=7', layoutId:gridLayout,
      gridIdNative:3, gridObjectIdNative:7, itemId:100,
      x:4, y:5, orientationCode:0,
      worldCoordinatesVerified:false, fixedImmovableVerified:false,
    }],
  });
}

test('preview enumerates direct GridCollections and exact Village AreaType links', () => {
  const catalog = source();
  const views = listWorldPreviewViews(catalog);
  assert.equal(views.length, 3);
  assert.equal(new Set(views.map(x=>x.viewKey)).size, 3);
  assert.deepEqual(views.map(x=>x.kind),
    ['gridCollection','villageArea','villageArea']);
  assert.equal(views[0].grids[0].gridIdNative, 3);
  assert.equal(views[1].nativeAreaTypeCode, 9);
  assert.equal(views[1].grids[0].gridDataPath, 'GridData/Villages/Area.json');
  assert.equal(views[1].missingReferencedLayout, false);
  assert.equal(views[2].missingReferencedLayout, true);
  assert.deepEqual(views[2].grids, []);
});

test('village view preserves original AreaType provenance, native IDs and paging', () => {
  const catalog = source();
  const [direct, village, missing] = listWorldPreviewViews(catalog);
  const rect = {x:3,y:4,width:3,height:3};
  const page = {offset:0,limit:64};
  const result = getWorldPreviewAnchorWindow(catalog,village,3,rect,page);
  assert.equal(result.status,'source_native_default_layout_anchors_only');
  assert.equal(result.villageLayoutId,'SceneLayouts/Village04/Default.json');
  assert.equal(result.nativeAreaTypeCode,9);
  assert.equal(result.gridLayoutPath,'SceneLayouts/Village04/Area.json');
  assert.equal(result.viewAnchorCount,1);
  assert.equal(result.defaultObjectAnchors[0].gridObjectIdNative,7);
  assert.equal(result.terrainDecoded,false);
  assert.equal(result.worldCoordinatesVerified,false);
  assert.equal(result.placementLegalityVerified,false);
  assert.equal(getWorldPreviewAnchorWindow(catalog,direct,3,rect,page).viewAnchorCount,1);
  const absent = getWorldPreviewAnchorWindow(catalog,missing,3,rect,page);
  assert.equal(absent.status,'missing_referenced_area_layout_in_source_subset');
  assert.equal(getWorldPreviewAnchorWindow(catalog,null,3,rect,page).status,
    'unknown_world_preview_source');
});

test('source region coverage counts present native anchors, not guessed missing areas', () => {
  const catalog = source();
  const [village] = summarizeWorldPreviewSourceCoverage(catalog);
  assert.equal(village.regionKey, 'Village04');
  assert.equal(village.villageLayoutCount, 1);
  assert.equal(village.areaReferenceCount, 2);
  assert.equal(village.resolvedAreaReferenceCount, 1);
  assert.equal(village.missingAreaLayoutReferenceCount, 1);
  assert.equal(village.nativeGridReferenceCount, 1);
  assert.equal(village.presentNativeGridReferenceCount, 1);
  assert.equal(village.missingNativeGridReferenceCount, 0);
  assert.equal(village.sourceDefaultAnchorCount, 1);
  assert.equal(village.worldCoordinatesVerified, false);
  assert.equal(village.placementLegalityVerified, false);
  assert.deepEqual(listWorldPreviewViews(catalog).map(v=>v.regionKey),
    ['Village04','Village04','Village04']);
});

test('source paths distinguish Expansion04 and WinnieDLC without inventing biome records', () => {
  const layouts = [], grids = [], anchors = [], areaTypes = [
    ...Array.from({length:13},(_,i)=>({region:'VillageExpansion04',type:48+i})),
    ...Array.from({length:4},(_,i)=>({region:'VillageWinnieDLC',type:44+i})),
  ];
  const grouped = new Map();
  for (const {region,type} of areaTypes) {
    const root = region === 'VillageExpansion04'
      ? 'SceneLayouts/VillageExpansion04/DefaultVillageExpansion04Layout.json'
      : 'SceneLayouts/VillageWinnieDLC/WinnieDLC_DefaultLayout.json';
    const layoutId = `SceneLayouts/${region}/Area${type}.json`;
    const gridId = `GridData/Villages/${region}/Grid${type}.json`;
    const refs = grouped.get(root) ?? [];
    refs.push({nativeAreaTypeCode:type,nativeAreaTypeName:`Area${type}`,
      gridLayoutPath:layoutId});
    grouped.set(root,refs);
    grids.push({gridId,sizeX:4,sizeY:4,
      terrainDecoding:{decoded:false,status:'not_compacted'}});
    layouts.push({layoutId,layoutKind:'nativeGridCollection',
      defaultObjectCount:1,nativeGridEntries:[{gridIdNative:0,
        gridDataPath:gridId,defaultObjectCount:1}]});
    anchors.push({layoutObjectId:layoutId+'#grid=0#object=1',
      layoutId,gridIdNative:0,gridObjectIdNative:1,
      itemId:100,x:1,y:1,orientationCode:0,
      worldCoordinatesVerified:false,fixedImmovableVerified:false});
  }
  for (const [layoutId,areaLayoutReferences] of grouped) {
    layouts.push({layoutId,layoutKind:'nativeDefaultVillageData',
      areaLayoutReferences});
  }
  const catalog = createWorldCatalog({
    manifest:{schema:WORLD_SCHEMA,status:'partial_game_native_evidence',
      platform:'Steam',gameVersion:'1.26.2',sourceScopeVerified:false},
    objects:[{itemId:100,nativeName:'Synthetic',nativeType:'Furniture',
      footprint:null}],scenes:[],worlds:[],areas:[],
    grids,layouts,layoutObjects:anchors,
  });
  const coverage = summarizeWorldPreviewSourceCoverage(catalog);
  const exp = coverage.find(r=>r.regionKey==='VillageExpansion04');
  const winnie = coverage.find(r=>r.regionKey==='VillageWinnieDLC');
  assert.deepEqual(coverage.map(r=>r.regionKey),
    ['VillageExpansion04','VillageWinnieDLC']);
  assert.equal(exp?.areaReferenceCount,13);
  assert.equal(exp?.sourceDefaultAnchorCount,13);
  assert.equal(exp?.nativeGridReferenceCount,13);
  assert.equal(exp?.missingAreaLayoutReferenceCount,0);
  assert.equal(winnie?.areaReferenceCount,4);
  assert.equal(winnie?.sourceDefaultAnchorCount,4);
  assert.equal(winnie?.nativeGridReferenceCount,4);
  const views = listWorldPreviewViews(catalog);
  assert.equal(views.filter(v=>v.kind==='villageArea').length,17);
  assert.equal(views.filter(v=>v.kind==='gridCollection').length,17);
  assert.equal(views.filter(v=>v.regionKey==='VillageExpansion04').length,26);
  assert.equal(views.filter(v=>v.regionKey==='VillageWinnieDLC').length,8);
  assert.equal(new Set(views.map(v=>v.viewKey)).size,34);
  assert.equal(catalog.areas.size,0); // original area links are NOT protoDb rows
});

test('two AreaTypes linking the same GridCollection do not double-count anchors', () => {
  const catalog=source();
  const root=catalog.layouts.get('SceneLayouts/Village04/Default.json');
  root.areaLayoutReferences[1].gridLayoutPath='SceneLayouts/Village04/Area.json';
  const [summary]=summarizeWorldPreviewSourceCoverage(catalog);
  assert.equal(summary.areaReferenceCount,2);
  assert.equal(summary.resolvedAreaReferenceCount,2);
  assert.equal(summary.sourceDefaultAnchorCount,1);
  assert.equal(summary.nativeGridReferenceCount,1);
});

test('original Expansion04 separate-area references resolve three independent underwater roots', () => {
  const underwater = [
    ['UnderwaterPirate',61,'UnderwaterPirates'],
    ['UnderwaterCandy',62,'UnderwaterCandy'],
    ['UnderwaterKingdom',63,'UnderwaterKingdom'],
  ];
  const layoutId = 'SceneLayouts/VillageExpansion04/DefaultVillageExpansion04Layout.json';
  const roots = underwater.map(([region]) =>
    `SceneLayouts/VillageExpansion04UnderwaterAreas/${region}/${region}-DefaultLayout.json`);
  const layouts = [{
    layoutId,layoutKind:'nativeDefaultVillageData',
    areaLayoutReferences:[],separatedAreasRaw:roots,
  }];
  const grids = [];
  for (let i=0;i<underwater.length;i++) {
    const [region,code,nativeAreaTypeName]=underwater[i];
    const root=roots[i];
    const gridLayout=`SceneLayouts/VillageExpansion04UnderwaterAreas/${region}/${region}-DefaultLayout-${nativeAreaTypeName}Grids.json`;
    const gridPath=`GridData/OffGridBuildings/Expansion04/${region}/Grid${code}.json`;
    layouts.push({
      layoutId:root,layoutKind:'nativeDefaultVillageData',
      areaLayoutReferences:[{nativeAreaTypeCode:code,nativeAreaTypeName,
        gridLayoutPath:gridLayout}],
    });
    layouts.push({layoutId:gridLayout,layoutKind:'nativeGridCollection',
      nativeGridEntries:[{gridIdNative:1,gridDataPath:gridPath,
        defaultObjectCount:0}]});
    grids.push({gridId:gridPath,sizeX:2,sizeY:2,
      terrainDecoding:{decoded:false,status:'not_compacted'}});
  }
  const catalog=createWorldCatalog({
    manifest:{schema:WORLD_SCHEMA,status:'partial_game_native_evidence',
      platform:'Steam',gameVersion:'1.26.2',sourceScopeVerified:false},
    objects:[],scenes:[],areas:[],worlds:[],layoutObjects:[],layouts,grids,
  });
  const coverage=summarizeWorldPreviewSourceCoverage(catalog);
  const parent=coverage.find(x=>x.regionKey==='VillageExpansion04');
  assert.equal(parent?.separateAreaReferenceCount,3);
  assert.equal(parent?.resolvedSeparateAreaReferenceCount,3);
  assert.equal(parent?.missingSeparateAreaReferenceCount,0);
  for (const [region,code] of underwater) {
    const name='VillageExpansion04UnderwaterAreas/'+region;
    const row=coverage.find(x=>x.regionKey===name);
    assert.equal(row?.villageLayoutCount,1);
    assert.equal(row?.areaReferenceCount,1);
    assert.equal(row?.presentNativeGridReferenceCount,1);
    assert.equal(row?.sourceDefaultAnchorCount,0);
    assert.equal(row?.worldCoordinatesVerified,false);
    assert.equal(row?.placementLegalityVerified,false);
    const views=listWorldPreviewViews(catalog).filter(x=>x.regionKey===name);
    assert.equal(views.length,2); // native GridCollection and source AreaType
    assert.equal(views.filter(x=>x.kind==='villageArea')[0].nativeAreaTypeCode,code);
  }
  catalog.layouts.delete(roots[1]);
  const degraded=summarizeWorldPreviewSourceCoverage(catalog);
  const parentMissing=degraded.find(x=>x.regionKey==='VillageExpansion04');
  assert.equal(parentMissing?.separateAreaReferenceCount,3);
  assert.equal(parentMissing?.resolvedSeparateAreaReferenceCount,2);
  assert.equal(parentMissing?.missingSeparateAreaReferenceCount,1);
  // No fabricated replacements when the original separated root is missing.
  assert.equal(degraded.find(x=>x.regionKey===
    'VillageExpansion04UnderwaterAreas/UnderwaterCandy')?.villageLayoutCount,0);
});

test('separate layout reference counts deduplicate exact original paths', () => {
  const catalog=source();
  const root=catalog.layouts.get('SceneLayouts/Village04/Default.json');
  root.separatedAreasRaw=[
    'SceneLayouts/Village04/Uncollected.json',
    'SceneLayouts/Village04/Uncollected.json',
    'SceneLayouts/Village04/Default.json',
  ];
  const [group]=summarizeWorldPreviewSourceCoverage(catalog);
  assert.equal(group.separateAreaReferenceCount,2);
  assert.equal(group.resolvedSeparateAreaReferenceCount,1);
  assert.equal(group.missingSeparateAreaReferenceCount,1);
});

test('embedded native Realm GridCollections are region-scoped and never AreaTypes', () => {
  const layouts=[
    {layoutId:'SceneLayouts/Realms/InsideOut/InsideOut/InsideOut-DefaultLayout.json',
     layoutKind:'nativeGridCollection',defaultObjectCount:1,
     embeddedGridCollectionWireField:2,
     nativeGridEntries:[
       {gridIdNative:0,gridDataPath:'GridData/Worlds/InsideOut-A.json',
        defaultObjectCount:1},
       {gridIdNative:1,gridDataPath:'GridData/Rooms/Wall20x9-GridData.json',
        defaultObjectCount:0}]},
    {layoutId:'SceneLayouts/Realms/InsideOut/LongTermMemory/InsideOut_LongTermMemory-DefaultLayout.json',
     layoutKind:'nativeGridCollection',defaultObjectCount:1,
     embeddedGridCollectionWireField:2,
     nativeGridEntries:[
       {gridIdNative:2,gridDataPath:'GridData/Rooms/Wall20x9-GridData.json',
        defaultObjectCount:1}]},
    {layoutId:'SceneLayouts/Realms/WallE/WallERealm.json',
     layoutKind:'nativeGridCollection',defaultObjectCount:0,
     embeddedGridCollectionWireField:2,
     nativeGridEntries:[
       {gridIdNative:0,gridDataPath:'GridData/Worlds/WallE.json',
        defaultObjectCount:0}]},
  ];
  const anchors=[
    {layoutObjectId:layouts[0].layoutId+'#grid=0#object=1',
     layoutId:layouts[0].layoutId,gridIdNative:0,gridObjectIdNative:1,
     itemId:40000001,x:1,y:0,orientationCode:0,
     worldCoordinatesVerified:false,fixedImmovableVerified:false},
    {layoutObjectId:layouts[1].layoutId+'#grid=2#object=0',
     layoutId:layouts[1].layoutId,gridIdNative:2,gridObjectIdNative:0,
     itemId:40000001,x:0,y:1,orientationCode:0,
     worldCoordinatesVerified:false,fixedImmovableVerified:false},
  ];
  const catalog=createWorldCatalog({
    manifest:{schema:WORLD_SCHEMA,status:'partial_game_native_evidence',
      platform:'Steam',gameVersion:'1.26.2',sourceScopeVerified:false},
    objects:[],scenes:[],areas:[],worlds:[],layouts,layoutObjects:anchors,
    grids:[
      {gridId:'GridData/Worlds/InsideOut-A.json',sizeX:3,sizeY:3,
       terrainDecoding:{decoded:false,status:'not_compacted'}},
      {gridId:'GridData/Rooms/Wall20x9-GridData.json',sizeX:3,sizeY:3,
       terrainDecoding:{decoded:false,status:'not_compacted'}},
    ],
  });
  const coverage=summarizeWorldPreviewSourceCoverage(catalog);
  assert.deepEqual(coverage.map(r=>r.regionKey),['Realms/InsideOut','Realms/WallE']);
  const inside=coverage.find(r=>r.regionKey==='Realms/InsideOut');
  assert.equal(inside?.realmLayoutCount,2);
  assert.equal(inside?.villageLayoutCount,0);
  assert.equal(inside?.areaReferenceCount,0);
  assert.equal(inside?.nativeGridReferenceCount,2);
  assert.equal(inside?.presentNativeGridReferenceCount,2);
  assert.equal(inside?.sourceDefaultAnchorCount,2);
  const wall=coverage.find(r=>r.regionKey==='Realms/WallE');
  assert.equal(wall?.realmLayoutCount,1);
  assert.equal(wall?.missingNativeGridReferenceCount,1);
  assert.equal(wall?.worldCoordinatesVerified,false);
  assert.equal(wall?.placementLegalityVerified,false);
  const views=listWorldPreviewViews(catalog);
  assert.equal(views.length,3);
  assert.equal(views.filter(v=>v.regionKey==='Realms/InsideOut').length,2);
  assert.equal(views.filter(v=>v.regionKey==='Realms/WallE').length,1);
  assert.equal(catalog.areas.size,0);
});

test('off-grid native scenes stay separate from Realm and Village AreaType references', () => {
  const a='SceneLayouts/OffGridBuildings/SkullRock/SkullRock_DefaultLayout.json';
  const b='SceneLayouts/OffGridBuildings/Expansion01/SandCavern/CavernLayout.json';
  const c='SceneLayouts/OffGridBuildings/Expansion01/Elsewhere/ElseLayout.json';
  const g1='GridData/OffGridBuildings/SkullRock/Ship.json';
  const g2='GridData/OffGridBuildings/Expansion01/SandCavern/SandCavern.json';
  const catalog=createWorldCatalog({
    manifest:{schema:WORLD_SCHEMA,status:'partial_game_native_evidence',
      platform:'Steam',gameVersion:'1.26.2',sourceScopeVerified:false},
    objects:[],scenes:[],worlds:[],areas:[],
    layouts:[
      {layoutId:a, layoutKind:'nativeGridCollection',
       offGridCustomLocationPath:'SceneLayouts/OffGridBuildings/SkullRock/CustomLocations.json',
       embeddedGridCollectionWireField:2,
       nativeGridEntries:[{gridIdNative:0,gridDataPath:g1,defaultObjectCount:1}]},
      {layoutId:b, layoutKind:'nativeGridCollection',
       offGridCustomLocationPath:'SceneLayouts/OffGridBuildings/Expansion01/SandCavern/CustomLocations.json',
       embeddedGridCollectionWireField:2,
       nativeGridEntries:[{gridIdNative:0,gridDataPath:g2,defaultObjectCount:1}]},
      {layoutId:c, layoutKind:'nativeGridCollection',
       offGridCustomLocationPath:'SceneLayouts/OffGridBuildings/Expansion01/Elsewhere/CustomLocations.json',
       embeddedGridCollectionWireField:2,
       nativeGridEntries:[{gridIdNative:4,gridDataPath:g2,defaultObjectCount:0}]},
    ],
    grids:[{gridId:g1,sizeX:4,sizeY:4,
      terrainDecoding:{decoded:false,status:'not_compacted'}}],
    layoutObjects:[
      {layoutObjectId:a+'#grid=0#object=7',layoutId:a,
       gridIdNative:0,gridObjectIdNative:7,itemId:40000001,
       x:1,y:2,orientationCode:0,
       worldCoordinatesVerified:false,fixedImmovableVerified:false},
      {layoutObjectId:b+'#grid=0#object=3',layoutId:b,
       gridIdNative:0,gridObjectIdNative:3,itemId:40000001,
       x:3,y:2,orientationCode:0,
       worldCoordinatesVerified:false,fixedImmovableVerified:false},
    ],
  });
  const coverage=summarizeWorldPreviewSourceCoverage(catalog);
  assert.deepEqual(coverage.map(group=>group.regionKey),
    ['OffGridBuildings/Expansion01/Elsewhere',
     'OffGridBuildings/Expansion01/SandCavern',
     'OffGridBuildings/SkullRock']);
  const skull=coverage.find(group=>group.regionKey==='OffGridBuildings/SkullRock');
  assert.equal(skull?.offGridLayoutCount,1);
  assert.equal(skull?.realmLayoutCount,0);
  assert.equal(skull?.areaReferenceCount,0);
  assert.equal(skull?.sourceDefaultAnchorCount,1);
  assert.equal(skull?.nativeGridReferenceCount,1);
  assert.equal(skull?.presentNativeGridReferenceCount,1);
  assert.equal(skull?.worldCoordinatesVerified,false);
  assert.equal(skull?.placementLegalityVerified,false);
  const sand=coverage.find(group=>group.regionKey==='OffGridBuildings/Expansion01/SandCavern');
  assert.equal(sand?.offGridLayoutCount,1);
  assert.equal(sand?.missingNativeGridReferenceCount,1);
  assert.equal(sand?.sourceDefaultAnchorCount,1);
  const views=listWorldPreviewViews(catalog);
  assert.equal(views.length,3);
  assert.equal(views.filter(view=>view.kind==='gridCollection').length,3);
  assert.equal(views.filter(view=>view.regionKey==='OffGridBuildings/SkullRock').length,1);
  const viewport=getWorldPreviewAnchorWindow(
    catalog,views.find(view=>view.regionKey==='OffGridBuildings/SkullRock'),
    0,{x:0,y:0,width:4,height:4},{offset:0,limit:20});
  assert.equal(viewport.status,'source_native_default_layout_anchors_only');
  assert.equal(viewport.defaultObjectAnchors.length,1);
  assert.equal(viewport.defaultObjectAnchors[0].gridObjectIdNative,7);
  assert.equal(viewport.worldCoordinatesVerified,false);
  assert.equal(catalog.areas.size,0);
});

test('root OffGridTemplate keeps an independent source region and zero anchors', () => {
  const id='SceneLayouts/OffGridBuildings/OffGridTemplate-DefaultLayout.json';
  const path='GridData/OffGridBuildings/OffGridTemplate-GridData.json';
  const catalog=createWorldCatalog({
    manifest:{schema:WORLD_SCHEMA,status:'partial_game_native_evidence',
      platform:'Steam',gameVersion:'1.26.2',sourceScopeVerified:false},
    objects:[],scenes:[],areas:[],worlds:[],
    layouts:[{layoutId:id,layoutKind:'nativeGridCollection',
      embeddedGridCollectionWireField:2,
      offGridCustomLocationPath:'SceneLayouts/OffGridBuildings/CustomLocations.json',
      nativeGridEntries:[{gridIdNative:0,gridDataPath:path,defaultObjectCount:0}]}],
    layoutObjects:[],
    grids:[{gridId:path,sizeX:6,sizeY:6,
      terrainDecoding:{decoded:false,status:'not_compacted'}}],
  });
  const [group]=summarizeWorldPreviewSourceCoverage(catalog);
  assert.equal(group.regionKey,'OffGridBuildings');
  assert.equal(group.offGridLayoutCount,1);
  assert.equal(group.nativeGridReferenceCount,1);
  assert.equal(group.presentNativeGridReferenceCount,1);
  assert.equal(group.sourceDefaultAnchorCount,0);
  assert.equal(group.areaReferenceCount,0);
  assert.equal(listWorldPreviewViews(catalog).length,1);
});
