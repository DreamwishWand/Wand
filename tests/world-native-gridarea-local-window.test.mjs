import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOriginalGridAreaLocalWindow, getOriginalGridAreaDisplayDimensions,
  DB04_SOURCE_LOCAL_GRIDAREA_WINDOW
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
test('noncardinal local lookup is supported while missing original items are distinguished',()=>{
  const oblique=getOriginalGridAreaLocalWindow(fixture(),100,3,0,0,3,2);
  assert.equal(oblique.status,'source_native_local_layers');
  assert.equal(oblique.rows.length,2);
  assert.equal(oblique.steam1262ObliqueIntrinsicMappingCorroborated,true);
  assert.equal(oblique.steam1262CardinalIntrinsicMappingCorroborated,false);
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

test('all twelve Steam 1.26.2 source-correlated oblique local projections retain null unmapped cells',()=>{
  const f=fixture({
    ...original,sizeX:3,sizeY:2,
    layerValues:[11,12,21,22,31,32]
  });
  const expected=new Map([
    [1,[[32,22,12],[31,21,11]]],
    [2,[[null,12,12],[32,22,11],[32,31,null]]],
    [3,[[12,11],[22,21],[32,31]]],
    [5,[[12,11],[22,21],[32,31]]],
    [6,[[12,11,null],[12,22,31],[null,32,32]]],
    [7,[[11,21,31],[12,22,32]]],
    [9,[[11,21,31],[12,22,32]]],
    [10,[[null,31,32],[11,22,32],[12,12,null]]],
    [11,[[31,32],[21,22],[11,12]]],
    [13,[[31,32],[21,22],[11,12]]],
    [14,[[32,32,null],[31,22,12],[null,11,12]]],
    [15,[[32,22,12],[31,21,11]]]
  ]);
  for(const [orientation,rows] of expected){
    const rect={x:0,y:0,width:rows[0].length,height:rows.length};
    const result=getOriginalGridAreaLocalWindow(f,100,orientation,...Object.values(rect));
    assert.equal(result.status,'source_native_local_layers');
    assert.equal(result.orientedSizeX,rect.width);
    assert.equal(result.orientedSizeY,rect.height);
    assert.deepEqual(result.rows,rows,'orientation '+orientation);
    assert.equal(result.unmappedOriginalLocalCellCount,
      rows.flat().filter(x=>x===null).length);
    assert.equal(result.nullMeansUnmappedNotFree,true);
    assert.equal(result.steam1262CardinalIntrinsicMappingCorroborated,false);
    assert.equal(result.steam1262ObliqueIntrinsicMappingCorroborated,true);
    assert.equal(result.placementLegalityVerified,false);
  }
});
test('explicit caller Grid factor 2 samples native 1:1 area cells without claiming a placed-object transform',()=>{
  const f=fixture({
    ...original,sizeX:3,sizeY:2,
    layerValues:[11,12,21,22,31,32]
  });
  const r=getOriginalGridAreaLocalWindow(f,100,8,0,0,6,4,2);
  assert.equal(r.callerGridFactor,2);
  assert.equal(r.coordinateBasis,
    'isolated_original_gridarea_local_explicit_factor_only');
  assert.deepEqual(r.rows,[
    [11,11,21,21,31,31],[11,11,21,21,31,31],
    [12,12,22,22,32,32],[12,12,22,22,32,32]
  ]);
  assert.equal(r.steam1262GridAreaDataFactoryFactorOneCorroborated,true);
  assert.equal(r.actualGridToAreaTessellationRatioVerified,false);
  assert.equal(r.nativeGridObjectAnchorTransformVerified,false);
  const oblique=getOriginalGridAreaLocalWindow(f,100,2,0,0,6,6,2);
  assert.deepEqual(oblique.rows,[
    [null,null,12,12,12,12],[null,null,12,12,12,12],
    [32,32,22,22,11,11],[32,32,22,22,11,11],
    [32,32,31,31,null,null],[32,32,31,31,null,null]
  ]);
  assert.equal(oblique.unmappedOriginalLocalCellCount,8);
  assert.equal(oblique.nullMeansUnmappedNotFree,true);
  const smaller=getOriginalGridAreaLocalWindow(f,100,2,2,2,3,3,2);
  assert.deepEqual(smaller.rows,[[22,22,11],[22,22,11],[31,31,null]]);
});
test('intrinsic orientation size protects UI controls from out-of-bounds or ambiguous scaling',()=>{
  const f=fixture();
  for(const code of Array.from({length:16},(_,i)=>i)){
    const dims=getOriginalGridAreaDisplayDimensions(2,3,code);
    assert.ok(dims.width>0&&dims.height>0);
    assert.deepEqual(getOriginalGridAreaDisplayDimensions(2,3,code,2),
      {width:dims.width*2,height:dims.height*2});
    const r=getOriginalGridAreaLocalWindow(f,100,code,0,0,
      Math.min(16,dims.width),Math.min(16,dims.height));
    assert.equal(r.status,'source_native_local_layers');
    assert.equal(r.saveWritingAuthorized,false);
  }
  assert.throws(()=>getOriginalGridAreaLocalWindow(f,100,8,0,0,1,1,3),
    /INVALID_REQUEST/);
  assert.throws(()=>getOriginalGridAreaDisplayDimensions(2,3,16,1),
    /INVALID/);
  assert.throws(()=>getOriginalGridAreaDisplayDimensions(2,3,8,3),
    /INVALID/);
  assert.throws(()=>getOriginalGridAreaDisplayDimensions(257,3,8,1),
    /INVALID/);
  assert.throws(()=>getOriginalGridAreaLocalWindow(f,100,8,4,0,1,1,2),
    /OUT_OF_RANGE/);
});
