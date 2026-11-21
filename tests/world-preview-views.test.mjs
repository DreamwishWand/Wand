import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldCatalog, WORLD_SCHEMA} from '../src/lib/world/catalog.mjs';
import {
  listWorldPreviewViews, getWorldPreviewAnchorWindow,
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
