import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldCatalog, WORLD_SCHEMA} from '../src/lib/world/catalog.mjs';
import {
  listWorldPreviewViews, summarizeWorldPreviewSourceCoverage,
  getWorldPreviewAnchorWindow,
} from '../src/lib/world/preview-views.mjs';

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
