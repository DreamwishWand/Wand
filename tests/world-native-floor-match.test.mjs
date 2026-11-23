import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldCatalog,WORLD_SCHEMA} from '../src/lib/world/catalog.mjs';
import {listWorldPreviewViews} from '../src/lib/world/preview-views.ts';
import {
  searchNativeFloorItems,getNativeFloorMatchResult,nativeFloorOverlap,
  FLOOR_MASK_MATCH_CONTRACT,
} from '../src/lib/world/native-floor-match.ts';

const land='GridData/Village04/Meadow-GridData.json';
const water='GridData/Village04/Water-GridData.json';
const gridLayout='SceneLayouts/Village04/Meadow.json';
const village='SceneLayouts/Village04/Default.json';
const def=(name,sizeX,sizeY,values,version)=>({
  gridId:name,sizeX,sizeY,nativeSourceFormat:'original_json_direct_floor_values',
  nativeFloorTypes:values,nativeFloorTypePalette:[],
  compactedFloorTypesBase64:null,
  terrainDecoding:{status:'source_correlated_original_json_direct_floor_values',
    decoded:true,packing:'x_major_direct_floor_values',
    cellIndexFormula:'x*sizeY+y',sourceGameVersion:version,
    nativeCodeBodyVerified:false,placementLegalityVerified:false}
});
function fixture(version='1.26.2'){
  return createWorldCatalog({
    manifest:{schema:WORLD_SCHEMA,status:'partial_game_native_evidence',
      gameVersion:version,platform:'Steam'},
    objects:[{
      itemId:40000049,nativeName:'01_Mickey!Set03!Chair01',
      nativeType:'Furniture',localizationKey:'Furniture.Test',
      footprint:{
        sizeX:1,sizeY:1,layerValues:[16],acceptedFloorTypesFlag:4,
        cellIndexToXYVerified:false,layerMaskSemanticsVerified:false,
        nativeWireFields:{sizeX:'6.1',sizeY:'6.2',
          layerValues:'6.3',acceptedFloorTypesFlag:'6.4'}
      }
    },{
      itemId:40000050,nativeName:'01_Mickey!Set03!NoFootprint',
      nativeType:'Furniture',footprint:null
    }],
    scenes:[],worlds:[],areas:[],
    grids:[
      def(land,3,2,[0,4,512,4,262148,4],version),
      def(water,2,2,[512,0,4,0],version),
    ],
    layouts:[
      {layoutId:gridLayout,layoutKind:'nativeGridCollection',
        nativeGridEntries:[
          {gridIdNative:0,gridDataPath:land,defaultObjectCount:0,
            tessellationFactor:1},
          {gridIdNative:1,gridDataPath:water,defaultObjectCount:0,
            tessellationFactor:1},
        ]},
      {layoutId:village,layoutKind:'nativeDefaultVillageData',
        areaLayoutReferences:[
          {nativeAreaTypeCode:3,nativeAreaTypeName:'Meadow',
            gridLayoutPath:gridLayout},
        ]},
    ],
    layoutObjects:[],
  });
}
test('raw floor mask overlap is exact unsigned 32-bit arithmetic, not edit permission',()=>{
  assert.equal(nativeFloorOverlap(0,4),false);
  assert.equal(nativeFloorOverlap(512,4),false);
  assert.equal(nativeFloorOverlap(4,4),true);
  assert.equal(nativeFloorOverlap(262148,4),true);
  assert.equal(nativeFloorOverlap(0x80000000,0x80000000),true);
  assert.equal(nativeFloorOverlap(0xffffffff,0x80000000),true);
  assert.throws(()=>nativeFloorOverlap(-1,4),/DB04_NATIVE_FLOOR_FLAGS_INVALID/);
  assert.throws(()=>nativeFloorOverlap(4,0x1_0000_0000),
    /DB04_NATIVE_FLOOR_FLAGS_INVALID/);
});
test('source furniture name search never includes objects without original floor flag',()=>{
  const c=fixture();
  assert.deepEqual(searchNativeFloorItems(c,'ch').map(x=>x.itemId),[40000049]);
  assert.deepEqual(searchNativeFloorItems(c,'Chair').map(x=>x.sizeX),[1]);
  assert.deepEqual(searchNativeFloorItems(c,'NoFootprint'),[]);
  assert.deepEqual(searchNativeFloorItems(c,'M'),[]);
});
test('per-item floor overlap map counts exact source-local GridData without double counting AreaType',()=>{
  const c=fixture(),views=listWorldPreviewViews(c);
  const origin=views.find(x=>x.kind==='villageArea');
  assert.ok(origin);
  const result=getNativeFloorMatchResult(
    c,views,'Village04',origin.viewKey,0,40000049);
  assert.equal(result.contract,FLOOR_MASK_MATCH_CONTRACT);
  assert.equal(result.status,'source_floor_mask_overlap_only');
  assert.equal(result.item.nativeName,'01_Mickey!Set03!Chair01');
  assert.equal(result.regionSourceCellCount,10);
  assert.equal(result.regionSourceOverlapCount,5);
  assert.equal(result.selectedGridOverlapCount,4);
  assert.equal(result.matchingGridDataCount,2);
  assert.equal(result.unresolvedGridDataCount,0);
  assert.deepEqual([...result.raster],[0,0,1,1,1,1]);
  assert.equal(result.rasterSizeX,3);
  assert.equal(result.rasterSizeY,2);
  assert.equal(result.nativePlacementPredicateVerified,false);
  assert.equal(result.furnitureFootprintTested,false);
  assert.equal(result.originalObjectOccupancyTested,false);
  assert.equal(result.worldCoordinatesVerified,false);
  assert.equal(result.placementLegalityVerified,false);
});
test('future source version and absent footprint never invent floor overlap counts',()=>{
  for(const version of ['1.26.2','1.27.0']){
    const c=fixture(version),views=listWorldPreviewViews(c);
    const selected=views[0];
    const id=version==='1.26.2'?40000050:40000049;
    const r=getNativeFloorMatchResult(c,views,'Village04',
      selected.viewKey,0,id);
    assert.equal(r.status,version==='1.26.2'
      ?'item_has_no_source_footprint':'source_version_not_verified');
    assert.equal(r.regionSourceOverlapCount,null);
    assert.equal(r.raster,null);
    assert.equal(r.unresolvedGridDataCount,2);
  }
});
test('exact view/grid required; no cross-world unverified grid joins',()=>{
  const c=fixture(),views=listWorldPreviewViews(c);
  assert.throws(()=>getNativeFloorMatchResult(
    c,views,'Village04',views[0].viewKey,99,40000049),
    /DB04_NATIVE_FLOOR_MATCH_VIEW_INVALID/);
  assert.throws(()=>getNativeFloorMatchResult(
    c,views,'Wrong',views[0].viewKey,0,40000049),
    /DB04_NATIVE_FLOOR_MATCH_VIEW_INVALID/);
  assert.throws(()=>getNativeFloorMatchResult(
    c,views,'Village04',views[0].viewKey,0,-10),
    /DB04_NATIVE_FLOOR_MATCH_REQUEST_INVALID/);
});
