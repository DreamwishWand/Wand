import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldCatalog,WORLD_SCHEMA} from '../src/lib/world/catalog.mjs';
import {listWorldPreviewViews} from '../src/lib/world/preview-views.ts';
import {getNativeRegionGridAtlasPage} from '../src/lib/world/native-region-grid-atlas.ts';

const land='GridData/Village04/Meadow.json';
const water='GridData/Village04/Water.json';
const gridCollection='SceneLayouts/Village04/Level.json';
const village='SceneLayouts/Village04/Default.json';
function sample(version='1.26.2'){
  const evidence={
    status:'source_correlated_original_json_direct_floor_values',
    decoded:true,packing:'x_major_direct_floor_values',
    cellIndexFormula:'x*sizeY+y',sourceGameVersion:version,
    nativeCodeBodyVerified:false,placementLegalityVerified:false,
  };
  return createWorldCatalog({
    manifest:{
      schema:WORLD_SCHEMA,status:'partial_game_native_evidence',
      gameVersion:version,platform:'Steam',
    },
    objects:[],scenes:[],worlds:[],areas:[],
    grids:[
      {gridId:land,sizeX:3,sizeY:2,
        nativeSourceFormat:'original_json_direct_floor_values',
        nativeFloorTypes:[0,4,4,0,4,4],
        nativeFloorTypePalette:[],compactedFloorTypesBase64:null,
        terrainDecoding:evidence},
      {gridId:water,sizeX:2,sizeY:2,
        nativeSourceFormat:'original_json_direct_floor_values',
        nativeFloorTypes:[512,0,512,0],
        nativeFloorTypePalette:[],compactedFloorTypesBase64:null,
        terrainDecoding:evidence},
    ],
    layouts:[
      {layoutId:gridCollection,layoutKind:'nativeGridCollection',
        nativeGridEntries:[
          {gridIdNative:0,gridDataPath:land,defaultObjectCount:0,
            tessellationFactor:1},
          {gridIdNative:1,gridDataPath:water,defaultObjectCount:0,
            tessellationFactor:1},
        ]},
      {layoutId:village,layoutKind:'nativeDefaultVillageData',
        areaLayoutReferences:[
          {nativeAreaTypeCode:2,nativeAreaTypeName:'Meadow',
            gridLayoutPath:gridCollection},
        ]},
    ],
    layoutObjects:[],
  });
}

test('region atlas shows each literal GridData once despite direct + village references',()=>{
  const catalog=sample();
  const views=listWorldPreviewViews(catalog);
  const atlas=getNativeRegionGridAtlasPage(catalog,views,'Village04');
  assert.equal(atlas.status,'source_region_grid_atlas');
  assert.equal(atlas.regionKey,'Village04');
  assert.equal(atlas.totalGridDataRecords,2);
  assert.equal(atlas.knownGridDataRecords,2);
  assert.equal(atlas.sourceGridCells,10);
  assert.equal(atlas.missingGridDataRecords,0);
  assert.equal(atlas.nextOffset,null);
  assert.equal(atlas.tiles.length,2);
  assert.equal(atlas.tiles[0].areaName,'Meadow');
  assert.equal(atlas.tiles[0].gridDataPath,land);
  assert.equal(atlas.tiles[0].sourceReferenceCount,2);
  assert.equal(atlas.tiles[0].totalCells,6);
  assert.equal(atlas.tiles[0].nonzeroMaskCells,4);
  assert.equal(atlas.tiles[0].zeroMaskCells,2);
  assert.deepEqual([...atlas.tiles[0].previewValues],[0,4,4,4,0,4]);
  assert.equal(atlas.tiles[0].previewWidth,3);
  assert.equal(atlas.tiles[0].previewHeight,2);
  assert.equal(atlas.tiles[1].nonzeroMaskCells,2);
  assert.equal(atlas.tiles[0].worldCoordinatesVerified,false);
  assert.equal(atlas.tiles[0].placementLegalityVerified,false);
  assert.equal(atlas.sharedWorldCoordinatesVerified,false);
  assert.equal(atlas.furniturePlacementLegalityVerified,false);
  assert.equal(atlas.sourceWorldCoverageComplete,false);
});
test('region atlas pagination preserves source-grid identity without duplicate cell totals',()=>{
  const catalog=sample(),views=listWorldPreviewViews(catalog);
  const first=getNativeRegionGridAtlasPage(catalog,views,'Village04',0,1);
  const next=getNativeRegionGridAtlasPage(catalog,views,'Village04',1,1);
  assert.equal(first.nextOffset,1);
  assert.equal(next.nextOffset,null);
  assert.equal(first.sourceGridCells,10);
  assert.equal(next.sourceGridCells,10);
  assert.deepEqual(
    [first.tiles[0].gridDataPath,next.tiles[0].gridDataPath],
    [land,water],
  );
});
test('a future game version cannot masquerade as verified placeable terrain',()=>{
  const catalog=sample('1.27.0'),views=listWorldPreviewViews(catalog);
  const atlas=getNativeRegionGridAtlasPage(catalog,views,'Village04');
  assert.equal(atlas.knownGridDataRecords,2);
  assert.equal(atlas.sourceGridCells,10);
  assert.equal(atlas.tiles[0].status,
    'native_terrain_packing_not_verified_for_game_version');
  assert.equal(atlas.tiles[0].previewValues,null);
  assert.equal(atlas.tiles[0].nonzeroMaskCells,null);
});
test('region atlas rejects unknown, invalid, non-canonical or oversized requests',()=>{
  const catalog=sample(),views=listWorldPreviewViews(catalog);
  for(const [name,offset,limit] of [
    ['',0,24],['Village04',-1,24],['Village04',0,25],
  ]){
    assert.throws(()=>getNativeRegionGridAtlasPage(catalog,views,name,offset,limit),
      /DB04_ATLAS_REQUEST_INVALID/);
  }
  assert.throws(()=>getNativeRegionGridAtlasPage(catalog,views,'Nonexistent'),
    /DB04_ATLAS_UNKNOWN_SOURCE_REGION/);
});
