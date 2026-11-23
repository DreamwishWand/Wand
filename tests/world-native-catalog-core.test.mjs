import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorldCatalog,WORLD_SCHEMA,
  getNativeDefaultLayoutViewport,getNativeVillageAreaViewport,
  getNativeFootprintCandidateCells,assessPlacement,
  getNativeFloorPalette,getDefaultLayoutObjects,
  checkNativeEditRestriction
} from '../src/lib/world/catalog.ts';
import * as compatibility from '../src/lib/world/catalog.mjs';
const layout='SceneLayouts/Village01/Test.json';
const village='SceneLayouts/Village01/Default.json';
const grid='GridData/Rooms/Original.json';
function fixture() {
  return {
    manifest:{schema:WORLD_SCHEMA,status:'partial_game_native_evidence',
      platform:'Steam',gameVersion:'1.26.1',sourceScopeVerified:false},
    objects:[{itemId:7,nativeType:'Furniture',footprint:{
      sizeX:2,sizeY:2,layerValues:[1,2,4,8],
      cellIndexToXYVerified:false,layerMaskSemanticsVerified:false
    },gridEditRestrictions:{canMove:{value:false,nativeWireField:'25.1.1'}}}],
    scenes:[],worlds:[],areas:[],
    grids:[{
      gridId:grid,sizeX:2,sizeY:2,nativeFloorTypePalette:[0,4,1024],
      nativePaletteIndexCellCounts:[1,2,1],
      compactedFloorTypesBase64:Buffer.from([0x19]).toString('base64'),
      nativeCompactedByteCount:1,
      terrainDecoding:{
        status:'cross_validated_native_samples',decoded:true,
        packing:'x_major_msb_first',cellBits:2,nativeCodeBodyVerified:false,
        placementLegalityVerified:false
      }
    }],
    layouts:[
      {layoutId:layout,layoutKind:'nativeGridCollection',
        nativeGridEntries:[{gridIdNative:2,gridDataPath:grid,
          defaultObjectCount:1,tessellationFactor:2}]},
      {layoutId:village,layoutKind:'nativeDefaultVillageData',
        areaLayoutReferences:[{nativeAreaTypeCode:1,
          nativeAreaTypeName:'Beach',gridLayoutPath:layout}]}
    ],
    layoutObjects:[{layoutObjectId:layout+'#grid=2#object=17',layoutId:layout,
      gridIdNative:2,gridObjectIdNative:17,itemId:7,
      x:1,y:1,orientationCode:8,
      worldCoordinatesVerified:false,fixedImmovableVerified:false}]
  };
}
test('typed World catalog is canonical; legacy name is a compatibility-only path',()=>{
  assert.equal(compatibility.createWorldCatalog,createWorldCatalog);
  const catalog=createWorldCatalog(fixture());
  assert.equal(catalog.objects.size,1);
  assert.equal(catalog.layoutObjectsByGrid.get(layout).get(2).length,1);
  assert.equal(getDefaultLayoutObjects(catalog,layout).length,1);
  assert.equal(checkNativeEditRestriction(catalog,7,'canMove').status,
    'denied_by_native_flag');
  assert.deepEqual(getNativeFloorPalette(catalog,grid).map(x=>x.nativeValue),
    [0,4,1024]);
});
test('source-local default and village 2D views include only raw anchors',()=>{
  const catalog=createWorldCatalog(fixture());
  const view=getNativeDefaultLayoutViewport(catalog,layout,2,
    {x:0,y:0,width:2,height:2});
  assert.equal(view.status,'source_corroborated_grid_local_preview');
  assert.equal(view.placementLegalityVerified,false);
  assert.equal(view.worldCoordinatesVerified,false);
  assert.deepEqual(view.defaultObjectAnchors.map(o=>[o.x,o.y]),[[1,1]]);
  const viaVillage=getNativeVillageAreaViewport(catalog,village,1,2,
    {x:0,y:0,width:2,height:2});
  assert.equal(viaVillage.status,view.status);
  assert.equal(viaVillage.gridLayoutPath,layout);
});
test('explicit candidate projection remains hypothetical, placement always unresolved',()=>{
  const catalog=createWorldCatalog(fixture());
  const candidate=getNativeFootprintCandidateCells(catalog,7,{x:3,y:4},{
    cellOrder:'x_major',anchorModel:'top_left',orientationCode:8
  });
  assert.equal(candidate.status,'explicit_unverified_footprint_projection');
  assert.equal(candidate.placementLegalityVerified,false);
  assert.equal(assessPlacement(catalog,7,{x:3,y:4}).status,'unresolved');
  assert.equal(assessPlacement(catalog,999,{x:3,y:4}).status,'unresolved');
});
test('invalid fake composites and duplicate raw source IDs are rejected',()=>{
  const altered=fixture();
  altered.layoutObjects[0].layoutObjectId='forged';
  assert.throws(()=>createWorldCatalog(altered),
    /Invalid native default object evidence/);
  const duplicate=fixture();
  duplicate.objects.push(duplicate.objects[0]);
  assert.throws(()=>createWorldCatalog(duplicate),
    /Duplicate\/empty DB-04 entity identifier/);
});
