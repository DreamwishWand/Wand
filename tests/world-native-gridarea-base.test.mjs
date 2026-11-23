import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorldCatalog,
  getNativeFootprintLayerAt as legacyLayer,
  getNativeFootprintOrientationBaseDimensions as legacySize,
  getNativeFootprintCardinalOrientedWindow as legacyWindow
} from '../src/lib/world/catalog.mjs';
import {
  getNativeFootprint,getNativeFootprintLayerAt,getNativeFootprintLayerWindow,
  getNativeGridAreaRotatedVector,getNativeGridAreaUnrotatedVector,
  getNativeFootprintCardinalDimensions,getNativeFootprintOrientationBaseDimensions,
  getNativeFootprintCardinalOrientedLayerAt,getNativeFootprintCardinalOrientedWindow
} from '../src/lib/world/native-gridarea-base.ts';
function source(version='1.26.1') {
  return createWorldCatalog({
    manifest:{schema:'wand.db04.world@1',status:'partial_game_native_evidence',
      platform:'Steam',gameVersion:version},
    objects:[{itemId:1701,nativeType:'Furniture',footprint:{
      sizeX:3,sizeY:2,layerValues:[11,12,21,22,31,32],
      cellIndexToXYVerified:false,layerMaskSemanticsVerified:false
    }}],scenes:[],grids:[],layouts:[],worlds:[],areas:[],layoutObjects:[]
  });
}
test('typed original base getter preserves X-major layer values and copied evidence',()=>{
  const c=source();
  assert.deepEqual(getNativeFootprint(c,1701).layerValues,[11,12,21,22,31,32]);
  const cell=getNativeFootprintLayerAt(c,1701,1,0);
  assert.equal(cell.originalFlatIndex,2);
  assert.equal(cell.nativeValue,21);
  assert.deepEqual(cell,legacyLayer(c,1701,1,0));
  const win=getNativeFootprintLayerWindow(c,1701,
    {x:0,y:0,width:3,height:2});
  assert.deepEqual(win.rows,[[11,21,31],[12,22,32]]);
  win.rows[0][0]=99;
  assert.equal(getNativeFootprintLayerAt(c,1701,0,0).nativeValue,11);
  assert.equal(cell.placementLegalityVerified,false);
});
test('typed original GridArea all-16 sizes, signed vectors and cardinal readbacks',()=>{
  const c=source();
  for(let orientation=0;orientation<16;orientation++){
    const size=getNativeFootprintOrientationBaseDimensions(c,1701,orientation);
    assert.deepEqual(size,legacySize(c,1701,orientation));
    assert.equal(size.placementLegalityVerified,false);
    const vec=getNativeGridAreaRotatedVector(c,-2,3,orientation);
    const inv=getNativeGridAreaUnrotatedVector(c,-2,3,orientation);
    assert.equal(vec.nativeVectorRotationVerified,true);
    assert.equal(inv.nativeVectorRotationVerified,true);
  }
  const expected={
    0:[[32,22,12],[31,21,11]],
    4:[[12,11],[22,21],[32,31]],
    8:[[11,21,31],[12,22,32]],
    12:[[31,32],[21,22],[11,12]],
  };
  for(const [key,rows] of Object.entries(expected)){
    const orientation=Number(key);
    const win=getNativeFootprintCardinalOrientedWindow(c,1701,orientation,{
      x:0,y:0,width:rows[0].length,height:rows.length
    });
    assert.deepEqual(win.rows,rows);
    assert.deepEqual(win,legacyWindow(c,1701,orientation,{
      x:0,y:0,width:rows[0].length,height:rows.length
    }));
    assert.equal(getNativeFootprintCardinalOrientedLayerAt(c,1701,0,0,orientation)
      .nativeValue,rows[0][0]);
    assert.equal(getNativeFootprintCardinalDimensions(c,1701,orientation)
      .nativeCardinalSizeVerified,true);
  }
});
test('unverified game revisions fail closed while exposing raw original source only',()=>{
  for(const version of ['1.26.2','1.27.0']){
    const c=source(version);
    assert.equal(getNativeFootprintLayerAt(c,1701,0,0)
      .status,'native_gridarea_base_index_not_verified_for_game_version');
    assert.equal(getNativeFootprintLayerWindow(c,1701,{x:0,y:0,width:1,height:1})
      .rows,undefined);
    assert.equal(getNativeFootprintCardinalOrientedLayerAt(c,1701,0,0,8)
      .nativeValue,undefined);
    assert.equal(getNativeFootprintOrientationBaseDimensions(c,1701,8)
      .nativeOrientationBaseSizeVerified,false);
    assert.equal(getNativeGridAreaUnrotatedVector(c,10,20,4)
      .nativeVectorRotationVerified,false);
    assert.deepEqual(getNativeFootprint(c,1701).layerValues,
      [11,12,21,22,31,32]);
  }
});
test('invalid source and bounds never grant a native cell or guessed permission',()=>{
  const c=source();
  assert.throws(()=>getNativeFootprintLayerAt(c,1701,3,0),/position/);
  assert.throws(()=>getNativeFootprintLayerWindow(c,1701,
    {x:0,y:0,width:4,height:1}),/window/);
  assert.throws(()=>getNativeFootprintCardinalOrientedWindow(c,1701,4,
    {x:0,y:0,width:3,height:1}),/outside bounds/);
  assert.throws(()=>getNativeGridAreaRotatedVector(c,2147483648,0,8),
    /signed vector/);
  assert.equal(getNativeFootprintCardinalOrientedWindow(c,9999,8,
    {x:0,y:0,width:1,height:1}),null);
});
