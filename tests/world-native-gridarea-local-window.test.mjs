import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOriginalGridAreaLocalWindow,DB04_SOURCE_LOCAL_GRIDAREA_WINDOW
} from '../src/lib/world/native-gridarea-local-window.ts';

const original={
  sizeX:2,sizeY:3,layerValues:[0,68,76,68,0,0],
  acceptedFloorTypesFlag:4,
  cellIndexToXYVerified:false,layerMaskSemanticsVerified:false,
  nativeWireFields:{sizeX:'6.1',sizeY:'6.2',layerValues:'6.3',
    acceptedFloorTypesFlag:'6.4'}
};
function fixture(footprint=original,version='1.26.2',platform='Steam'){
  return {
    manifest:{gameVersion:version,platform},
    objects:new Map([
      ['100',{itemId:100,nativeType:'Furniture',footprint}],
      ['200',{itemId:200,nativeType:'Building',footprint:null}]
    ])
  };
}

test('Steam 1.26.2 unrotated raw GridArea lookup is source X-major (x*sizeY+y)',()=>{
  const r=getOriginalGridAreaLocalWindow(fixture(),100,8,0,0,2,3);
  assert.equal(r.contract,DB04_SOURCE_LOCAL_GRIDAREA_WINDOW);
  assert.equal(r.status,'source_native_local_layers');
  assert.deepEqual([r.orientedSizeX,r.orientedSizeY],[2,3]);
  assert.deepEqual(r.rows,[[0,68],[68,0],[76,0]]);
  assert.deepEqual(r.rect,{x:0,y:0,width:2,height:3});
  assert.equal(r.steam1262GetterReadPathCorroborated,true);
  assert.equal(r.steam1262CardinalIntrinsicMappingCorroborated,true);
  assert.equal(r.coordinateBasis,'isolated_original_gridarea_local_1_to_1_only');
  for(const key of ['actualGridToAreaTessellationRatioVerified',
    'nativeGridObjectAnchorTransformVerified','occupancyPredicateVerified',
    'collisionRulesVerified','placementLegalityVerified',
    'saveWritingAuthorized','originalSourceAuthenticationVerified'])
    assert.equal(r[key],false,key);
  assert.throws(()=>{r.rows[0][0]=999;},TypeError);
  assert.throws(()=>{r.rect.x=99;},TypeError);
  assert.throws(()=>{r.rows.push([0]);},TypeError);
});
test('original intrinsic cardinal raw layers are not a placed-object footprint',()=>{
  const f=fixture();
  const rows=[
    [0,[[0,76],[0,68],[68,0]]],
    [4,[[76,68,0],[0,0,68]]],
    [8,[[0,68],[68,0],[76,0]]],
    [12,[[68,0,0],[0,68,76]]]
  ];
  for(const [orientation,expected] of rows){
    const sx=(orientation===4||orientation===12)?3:2;
    const sy=(orientation===4||orientation===12)?2:3;
    const r=getOriginalGridAreaLocalWindow(f,100,orientation,0,0,sx,sy);
    assert.equal(r.status,'source_native_local_layers');
    assert.deepEqual(r.rows,expected);
    assert.equal(r.occupancyPredicateVerified,false);
  }
  const rect=getOriginalGridAreaLocalWindow(f,100,4,1,0,2,2);
  assert.deepEqual(rect.rows,[[68,0],[0,68]]);
  assert.deepEqual(rect.rect,{x:1,y:0,width:2,height:2});
});
test('noncardinal orientations and unknown originals are source-only unsupported',()=>{
  const unsupported=getOriginalGridAreaLocalWindow(fixture(),100,3,0,0,2,3);
  assert.equal(unsupported.status,'unsupported_intrinsic_orientation');
  assert.equal(unsupported.rows,null);
  assert.equal(unsupported.steam1262CardinalIntrinsicMappingCorroborated,false);
  assert.equal(getOriginalGridAreaLocalWindow(fixture(),999,8,0,0,1,1).status,
    'item_not_in_partial_original_source');
  assert.equal(getOriginalGridAreaLocalWindow(fixture(),200,8,0,0,1,1).status,
    'item_has_no_source_gridarea');
  assert.equal(getOriginalGridAreaLocalWindow(fixture(original,'1.26.3'),100,8,
    0,0,1,1).status,'source_version_not_verified');
  assert.equal(getOriginalGridAreaLocalWindow(fixture(original,'1.26.2','Switch'),
    100,8,0,0,1,1).status,'source_version_not_verified');
});
test('out-of-bound or oversized local requests fail closed without projecting',()=>{
  const f=fixture();
  for(const args of [
    [8,2,0,1,1],[8,0,3,1,1],[4,0,2,1,1],
    [8,0,0,3,1],[8,0,0,1,4],
  ])assert.throws(()=>getOriginalGridAreaLocalWindow(f,100,...args),
    /OUT_OF_RANGE/);
  for(const args of [
    [8,-1,0,1,1],[8,0,-1,1,1],[8,0,0,0,1],[8,0,0,17,1],
    [8,0,0,1,17],[16,0,0,1,1],[8,0,0,0.5,1]
  ])assert.throws(()=>getOriginalGridAreaLocalWindow(f,100,...args),
    /INVALID_REQUEST/);
  const wrong=fixture({...original,layerValues:[1,2]});
  assert.throws(()=>getOriginalGridAreaLocalWindow(wrong,100,8,0,0,1,1),
    /ORIGINAL_WIRE_FIELDS_INVALID/);
});
