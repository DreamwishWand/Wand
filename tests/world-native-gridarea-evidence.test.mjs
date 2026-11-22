import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOriginalGridAreaEvidence,DB04_ORIGINAL_GRIDAREA_EVIDENCE
} from '../src/lib/world/native-gridarea-evidence.ts';

const rawShape={
  sizeX:2,sizeY:3,layerValues:[0,68,76,68,0,0],
  acceptedFloorTypesFlag:1070326015,
  cellIndexToXYVerified:false,layerMaskSemanticsVerified:false,
  nativeWireFields:{
    sizeX:'6.1',sizeY:'6.2',layerValues:'6.3',
    acceptedFloorTypesFlag:'6.4'
  }
};
function fixture({
  version='1.26.2',platform='Steam',footprint=rawShape
}={}){
  return {
    manifest:{gameVersion:version,platform},
    objects:new Map([
      ['101',{itemId:101,nativeType:'Furniture',footprint}],
      ['102',{itemId:102,nativeType:'Building',footprint:null}]
    ])
  };
}
test('read original fixed32 source counts without guessing occupancy or 2D indexing',()=>{
  const r=getOriginalGridAreaEvidence(fixture(),101);
  assert.equal(r.contract,DB04_ORIGINAL_GRIDAREA_EVIDENCE);
  assert.equal(r.status,'source_raw_gridarea_available');
  assert.deepEqual([r.rawSizeX,r.rawSizeY,r.rawLayerSlotCount],[2,3,6]);
  assert.equal(r.nonzeroRawLayerSlotCount,3);
  assert.equal(r.distinctRawLayerValueCount,3);
  assert.deepEqual(r.mostFrequentRawValues,[
    {value:0,count:3},{value:68,count:2},{value:76,count:1}
  ]);
  assert.equal(r.acceptedFloorTypesFlag,1070326015);
  assert.equal(r.strideOverride,null);
  assert.equal(r.strideOverrideWireFieldPresent,false);
  assert.equal(r.sourceCoordinateBasis,
    'unprojected_original_gridarea_fixed32_array');
  for(const key of ['rawGridAreaCellMappingVerified',
    'rawNonzeroMeansOccupiedVerified','nativeFloorTypePermissionVerified',
    'rotationMappingVerified','placementLegalityVerified',
    'saveWriterAuthorized','originalSourceAuthenticationVerified']){
    assert.equal(r[key],false,key);
  }
  assert.equal('layerValues' in r,false);
  assert.throws(()=>{r.rawSizeX=500;},TypeError);
  assert.throws(()=>{r.mostFrequentRawValues[0].value=100;},TypeError);
});
test('missing source Item is unknown, missing GridArea never means not placeable',()=>{
  const absent=getOriginalGridAreaEvidence(fixture(),999);
  assert.equal(absent.status,'item_not_in_partial_original_source');
  assert.equal(absent.rawLayerSlotCount,0);
  assert.equal(absent.nativeType,null);
  const without=getOriginalGridAreaEvidence(fixture(),102);
  assert.equal(without.status,'item_has_no_source_gridarea');
  assert.equal(without.nativeType,'Building');
  assert.equal(without.placementLegalityVerified,false);
  for(const [version,platform] of [['1.26.3','Steam'],['1.26.2','Switch']]){
    const unverified=getOriginalGridAreaEvidence(fixture({version,platform}),101);
    assert.equal(unverified.status,'source_version_not_verified');
    assert.equal(unverified.rawSizeX,null);
  }
});
test('nullable source-verified StrideOverride is preserved but not interpreted',()=>{
  const f=fixture({footprint:{
    ...rawShape,strideOverride:-2,strideOverrideSourceVerified:true,
    nativeWireFields:{...rawShape.nativeWireFields,strideOverride:'6.5'}
  }});
  const result=getOriginalGridAreaEvidence(f,101);
  assert.equal(result.strideOverride,-2);
  assert.equal(result.strideOverrideWireFieldPresent,true);
  assert.equal(result.placementLegalityVerified,false);
});
test('forged source wire tags, invalid raw layers and unsafe source IDs fail closed',()=>{
  for(const item of [0,-1,1.5,4294967296]){
    assert.throws(()=>getOriginalGridAreaEvidence(fixture(),item),
      /SOURCE_ITEM_ID_INVALID/);
  }
  const variants=[
    {...rawShape,layerValues:[1,2]},
    {...rawShape,layerValues:[0,1,2,3,4,4294967296]},
    {...rawShape,layerValues:[0,1,2,3,4,-1]},
    {...rawShape,cellIndexToXYVerified:true},
    {...rawShape,nativeWireFields:{...rawShape.nativeWireFields,layerValues:'6.4'}},
    {...rawShape,acceptedFloorTypesFlag:NaN},
    {...rawShape,sizeX:0},
    {...rawShape,strideOverride:2},
    {...rawShape,strideOverride:2,strideOverrideSourceVerified:true},
  ];
  for(const footprint of variants){
    assert.throws(()=>getOriginalGridAreaEvidence(fixture({footprint}),101),
      /GRIDAREA_/);
  }
  const bad=fixture();
  bad.objects.set('101',{itemId:999,nativeType:'Furniture',
    footprint:rawShape});
  assert.throws(()=>getOriginalGridAreaEvidence(bad,101),
    /SOURCE_ITEM_DEFINITION_INVALID/);
});
