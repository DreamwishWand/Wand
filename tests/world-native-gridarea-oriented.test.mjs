import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldCatalog} from '../src/lib/world/catalog.mjs';
import {
  getNativeFootprintObliqueOrientedLayerAt,
  getNativeFootprintObliqueOrientedWindow,
  getNativeFootprintOrientedLayerAt,
  getNativeFootprintOrientedWindow,
  getNativeFootprintTessellatedOrientedLayerAt,
  getNativeFootprintTessellatedOrientedWindow
} from '../src/lib/world/native-gridarea-oriented.ts';
import {
  getNativeDefaultLayoutObjectLayerAt,
  getNativeDefaultLayoutObjectLayerWindow,
  getNativeFootprintComputedStride,
  getNativeDefaultLayoutObjectComputedStride
} from '../src/lib/world/native-gridarea-default-object.ts';

const layout='SceneLayouts/Village01/Test.json';
const grid='GridData/Village01/Test.json';
const item=100011;
const objectId=layout+'#grid=7#object=31';
function fixture(version='1.26.1',factor=2){
 return createWorldCatalog({
  manifest:{schema:'wand.db04.world@1',status:'partial_game_native_evidence',
    gameVersion:version,platform:'Steam'},
  objects:[{itemId:item,nativeType:'Furniture',footprint:{
    sizeX:3,sizeY:2,layerValues:[11,12,21,22,31,32],
    strideOverride:2,strideOverrideSourceVerified:true,
    strideOverridePlacementSemanticsVerified:false,
    nativeWireFields:{strideOverride:'6.5'},
    cellIndexToXYVerified:false,layerMaskSemanticsVerified:false
  }}],
  scenes:[],worlds:[],areas:[],
  grids:[{gridId:grid,sizeX:20,sizeY:20}],
  layouts:[{layoutId:layout,layoutKind:'nativeGridCollection',
    nativeGridEntries:[{gridIdNative:7,gridDataPath:grid,
      tessellationFactor:factor,defaultObjectCount:1}]}],
  layoutObjects:[{layoutObjectId:objectId,layoutId:layout,
    gridIdNative:7,gridObjectIdNative:31,itemId:item,x:2,y:3,
    orientationCode:4,orientationName:'Right',
    worldCoordinatesVerified:false,fixedImmovableVerified:false}]
 });
}
test('typed all 16 original GridArea raw views never imply placement permission',()=>{
 const c=fixture();
 for(let direction=0;direction<16;direction++){
   const at=getNativeFootprintOrientedLayerAt(c,item,0,0,direction);
   assert.equal(at.placementLegalityVerified,false);
   const tw=getNativeFootprintTessellatedOrientedWindow(c,item,direction,2,
     {x:0,y:0,width:2,height:2});
   assert.equal(tw.placementLegalityVerified,false);
   assert.equal(tw.gridObjectAnchorVerified,false);
 }
 const matrix=getNativeFootprintOrientedWindow(c,item,4,
   {x:0,y:0,width:2,height:3});
 assert.deepEqual(matrix.rows,[[12,11],[22,21],[32,31]]);
 assert.equal(getNativeFootprintTessellatedOrientedLayerAt(c,item,0,0,4,2)
   .nativeValue,12);
 const oblique=getNativeFootprintObliqueOrientedWindow(c,item,2,
    {x:0,y:0,width:3,height:3});
 assert.equal(oblique.nullMeansOutsideSourceGridArea,true);
 assert.equal(oblique.unmappedOutputCellCount>0,true);
 assert.equal(getNativeFootprintObliqueOrientedLayerAt(c,item,0,0,2)
   .placementLegalityVerified,false);
});
test('original Grid ID source join preserves object-local raw masks and stride',()=>{
 const c=fixture();
 const at=getNativeDefaultLayoutObjectLayerAt(c,objectId,0,0);
 assert.equal(at.callerGridFactorProvenanceVerified,true);
 assert.equal(at.nativeValue,12);
 assert.equal(at.gridIdNative,7);
 assert.equal(at.worldCoordinatesVerified,false);
 assert.equal(at.itemFactoryRoutePerRecordVerified,false);
 const view=getNativeDefaultLayoutObjectLayerWindow(c,objectId,
   {x:0,y:0,width:4,height:6});
 assert.equal(view.status,'source_correlated_item_gridarea_scaled_raw_layers');
 assert.deepEqual(view.rows[0],[12,12,11,11]);
 assert.equal(view.placementLegalityVerified,false);
 const stride=getNativeDefaultLayoutObjectComputedStride(c,objectId);
 assert.equal(stride.nativeComputedStride,4);
 assert.equal(stride.nativeStrideCalculationVerified,true);
 assert.equal(stride.callerGridFactorProvenanceVerified,true);
 assert.equal(stride.currentSaveObjectVerified,false);
});
test('unknown original GridArea version stays unresolved for every branch',()=>{
 const c=fixture('1.26.2');
 assert.equal(getNativeFootprintObliqueOrientedLayerAt(c,item,0,0,2).status,
   'native_oblique_local_position_unverified_for_game_version');
 assert.equal(getNativeFootprintTessellatedOrientedLayerAt(c,item,0,0,4,2).status,
   'native_tessellation_not_verified_for_game_version');
 assert.equal(getNativeDefaultLayoutObjectComputedStride(c,objectId).status,
   'native_stride_not_verified_for_game_version');
 assert.equal(getNativeFootprintComputedStride(c,item,2).nativeComputedStride,undefined);
});
test('no guessed Grid factor or free cell for missing or ambiguous source',()=>{
 const c=fixture();
 assert.equal(getNativeDefaultLayoutObjectLayerWindow(c,'missing',
  {x:0,y:0,width:1,height:1}).status,'unknown_default_layout_object');
 const layoutRecord=c.layouts.get(layout);
 layoutRecord.nativeGridEntries.push({...layoutRecord.nativeGridEntries[0]});
 assert.equal(getNativeDefaultLayoutObjectLayerAt(c,objectId,0,0).status,
   'missing_or_ambiguous_native_grid_reference');
 assert.throws(()=>getNativeFootprintOrientedWindow(c,item,16,
  {x:0,y:0,width:1,height:1}),/orientation/);
 assert.throws(()=>getNativeFootprintTessellatedOrientedWindow(c,item,8,257,
  {x:0,y:0,width:1,height:1}),/factor/);
});
