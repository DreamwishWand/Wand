import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldCatalog,WORLD_SCHEMA} from '../src/lib/world/catalog.mjs';
import {listWorldPreviewViews} from '../src/lib/world/preview-views.ts';
import {
  fullRectangleFloorWindowMap,getNativeFloorWindowResult,
  NATIVE_FLOOR_WINDOW_CONTRACT,
} from '../src/lib/world/native-floor-rectangle-window.ts';

const LAYOUT='SceneLayouts/Village04/Meadow.json';
const DEFAULT='SceneLayouts/Village04/Default.json';
const FLOOR='GridData/Village04/Meadow-GridData.json';
const FLOOR_2='GridData/Village04/Water-GridData.json';
const terrain=(id,sizeX,sizeY,values,version)=>({
  gridId:id,sizeX,sizeY,
  nativeSourceFormat:'original_json_direct_floor_values',
  nativeFloorTypes:values,nativeFloorTypePalette:[],
  compactedFloorTypesBase64:null,
  terrainDecoding:{
    decoded:true,status:'source_correlated_original_json_direct_floor_values',
    packing:'x_major_direct_floor_values',
    cellIndexFormula:'x*sizeY+y',sourceGameVersion:version,
    nativeCodeBodyVerified:false,placementLegalityVerified:false,
  }
});
function fixture({version='1.26.2',scale=1,anchorX=1,anchorY=2}={}){
  const objects=[{
    itemId:42,nativeName:'Synthetic Source Furniture',
    nativeType:'Furniture',
    footprint:{
      sizeX:2,sizeY:1,
      layerValues:[16,16],
      acceptedFloorTypesFlag:4,
      cellIndexToXYVerified:false,layerMaskSemanticsVerified:false,
      nativeWireFields:{sizeX:'6.1',sizeY:'6.2',
        layerValues:'6.3',acceptedFloorTypesFlag:'6.4'},
    },
  }];
  const layoutObjects=[{
    layoutId:LAYOUT,layoutObjectId:LAYOUT+'#grid=1#object=7',
    gridIdNative:1,gridObjectIdNative:7,itemId:42,
    x:anchorX,y:anchorY,orientationCode:8,
    worldCoordinatesVerified:false,fixedImmovableVerified:false,
  }];
  return createWorldCatalog({
    manifest:{schema:WORLD_SCHEMA,status:'partial_game_native_evidence',
      gameVersion:version,platform:'Steam'},
    objects,scenes:[],worlds:[],areas:[],
    grids:[
      // Raw floor X-major, one incompatible hole at (2,1).
      terrain(FLOOR,4,3,[4,4,4,4,4,4,4,0,4,4,4,4],version),
      terrain(FLOOR_2,2,3,[4,4,4,4,4,4],version),
    ],
    layouts:[
      {layoutId:LAYOUT,layoutKind:'nativeGridCollection',
        nativeGridEntries:[
          {gridIdNative:1,gridDataPath:FLOOR,
            tessellationFactor:scale,defaultObjectCount:1},
          {gridIdNative:2,gridDataPath:FLOOR_2,
            tessellationFactor:1,defaultObjectCount:0},
        ]},
      {layoutId:DEFAULT,layoutKind:'nativeDefaultVillageData',
        areaLayoutReferences:[{
          nativeAreaTypeCode:4,nativeAreaTypeName:'Meadow',
          gridLayoutPath:LAYOUT,
        }]},
    ],layoutObjects,
  });
}
const resolve=(catalog,orientation=8,gridId=1)=>{
  const views=listWorldPreviewViews(catalog);
  const view=views.find(row=>row.kind==='villageArea');
  assert.ok(view);
  return getNativeFloorWindowResult(catalog,views,'Village04',
    view.viewKey,gridId,42,orientation);
};

test('one mismatch in the rectangular floor makes 4 overlapping starts unavailable',()=>{
  const floor=new Uint32Array([
    4,4,4,4,
    4,4,0,4,
    4,4,4,4,
  ]);
  const out=fullRectangleFloorWindowMap(
    {sizeX:4,sizeY:3,nativeFloorValues:floor},4,2,2);
  assert.equal(out.originCount,2);
  assert.deepEqual([...out.originBitmap],[
    1,0,0,0,
    1,0,0,0,
    0,0,0,0,
  ]);
  assert.deepEqual(fullRectangleFloorWindowMap(
    {sizeX:4,sizeY:3,nativeFloorValues:floor},4,2,1).originCount,7);
  assert.deepEqual(fullRectangleFloorWindowMap(
    {sizeX:4,sizeY:3,nativeFloorValues:floor},4,1,2).originCount,6);
  assert.equal(fullRectangleFloorWindowMap(
    {sizeX:4,sizeY:3,nativeFloorValues:floor},4,5,2).originCount,0);
  assert.deepEqual(fullRectangleFloorWindowMap(
    {sizeX:1,sizeY:1,nativeFloorValues:new Uint32Array([4])},4,1,1),
    {originBitmap:new Uint8Array([1]),originCount:1});
});

test('reliable source floor-rectangle candidates shift with original cardinal rotation',()=>{
  const catalog=fixture();
  const unrotated=resolve(catalog,8);
  assert.equal(unrotated.contract,NATIVE_FLOOR_WINDOW_CONTRACT);
  assert.equal(unrotated.status,'source_rectangle_floor_windows_only');
  assert.equal(unrotated.boundingWidth,2);
  assert.equal(unrotated.boundingHeight,1);
  assert.equal(unrotated.selectedGridOriginCount,7);
  // The second GridData (2x3, all matching) contributes 3 starts.
  assert.equal(unrotated.regionOriginCount,10);
  assert.equal(unrotated.sourceFloorCellCount,18);
  assert.equal(unrotated.verifiedGridCount,2);
  assert.equal(unrotated.unresolvedGridCount,0);
  assert.deepEqual([...unrotated.originBitmap],[
    1,1,1,0,
    1,0,0,0,
    1,1,1,0,
  ]);
  assert.equal(unrotated.originalDefaultAnchorStatus,'factor_one_source_anchors');
  assert.equal(unrotated.originalDefaultAnchorCounts[2*4+1],1);
  assert.equal([...unrotated.originalDefaultAnchorCounts].reduce((a,b)=>a+b),1);
  for(const key of [
    'nativeGridLayersOccupancyVerified','defaultObjectFootprintsVerified',
    'actualGamePlacementVerified','worldCoordinatesVerified',
    'saveOccupancyVerified','saveWritingAuthorized'
  ])assert.equal(unrotated[key],false,key);
  const rotated=resolve(catalog,4);
  assert.deepEqual([rotated.boundingWidth,rotated.boundingHeight],[1,2]);
  assert.equal(rotated.selectedGridOriginCount,6);
  assert.equal(rotated.regionOriginCount,10);
  assert.notDeepEqual([...rotated.originBitmap],[...unrotated.originBitmap]);
  assert.equal(rotated.orientationCode,4);
});

test('factor-two original GridObject anchors are NOT overlaid on raw terrain cells',()=>{
  const sample=fixture({scale:2,anchorX:5,anchorY:4});
  const result=resolve(sample,8);
  assert.equal(result.status,'source_rectangle_floor_windows_only');
  assert.equal(result.originalDefaultAnchorStatus,'anchor_coordinates_not_compatible');
  assert.equal(result.originalDefaultAnchorCounts,null);
  assert.equal(result.saveWritingAuthorized,false);
});

test('out-of-range default anchors do not masquerade as raw-floor blocked cells',()=>{
  const sample=fixture({scale:1,anchorX:5,anchorY:4});
  const result=resolve(sample,8);
  assert.equal(result.selectedGridOriginCount,7);
  assert.equal(result.originalDefaultAnchorStatus,'anchor_coordinates_not_compatible');
  assert.equal(result.originalDefaultAnchorCounts,null);
});

test('unknown item or newer game version never produce a false possible-placement map',()=>{
  const sample=fixture({version:'1.27.0'});
  const unsupported=resolve(sample,8);
  assert.equal(unsupported.status,'source_game_version_unverified');
  assert.equal(unsupported.originBitmap,null);
  assert.equal(unsupported.regionOriginCount,null);
  assert.equal(unsupported.unresolvedGridCount,2);
  const v=fixture(),views=listWorldPreviewViews(v);
  const unknown=getNativeFloorWindowResult(v,views,'Village04',
    views[0].viewKey,1,123456,8);
  assert.equal(unknown.status,'source_item_gridarea_unverified');
  assert.equal(unknown.regionOriginCount,null);
  assert.equal(unknown.originBitmap,null);
});

test('invalid area, orientation, dimensions and source identities fail closed',()=>{
  const sample=fixture(),views=listWorldPreviewViews(sample);
  for(const o of [-1,16,1.5]){
    assert.throws(()=>getNativeFloorWindowResult(sample,views,'Village04',
      views[0].viewKey,1,42,o),/DB04_FLOOR_RECT_REQUEST_INVALID/);
  }
  assert.throws(()=>getNativeFloorWindowResult(sample,views,'Other',
    views[0].viewKey,1,42,8),/DB04_FLOOR_RECT_GRID_NOT_IN_REGION/);
  for(const invalid of [
    {sizeX:4,sizeY:3,nativeFloorValues:new Uint32Array(11)},
    {sizeX:4,sizeY:3,nativeFloorValues:new Uint32Array(12)},
  ]){
    assert.throws(()=>fullRectangleFloorWindowMap(invalid,4,0,2),
      /DB04_FLOOR_RECT_SOURCE_INVALID/);
  }
});
