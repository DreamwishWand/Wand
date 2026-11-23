import test from 'node:test';
import assert from 'node:assert/strict';
import {getOriginalGridObjectItemAreaLink,DB04_ORIGINAL_GRIDOBJECT_ITEM_AREA_LINK}
  from '../src/lib/world/native-gridobject-item-area-link.ts';

const L='SceneLayouts/Village04/Meadow.json';
const P='GridData/Village04/Meadow.json';
const L2='SceneLayouts/OffGridBuildings/Another.json';
const P2='GridData/OffGridBuildings/Another.json';
const originalFootprint={
  sizeX:3,sizeY:2,layerValues:[11,12,21,22,31,32],
  acceptedFloorTypesFlag:4,
  cellIndexToXYVerified:false,
  layerMaskSemanticsVerified:false,
  nativeWireFields:{
    sizeX:'6.1',sizeY:'6.2',layerValues:'6.3',
    acceptedFloorTypesFlag:'6.4'
  }
};
function object(layoutId,grid,id,item,orientation,x,y){
  return {
    layoutId,gridIdNative:grid,gridObjectIdNative:id,
    layoutObjectId:layoutId+'#grid='+grid+'#object='+id,
    itemId:item,orientationCode:orientation,x,y
  };
}
function fixture(options={}){
  const {
    platform='Steam',gameVersion='1.26.2',factor=2,
    rows=[
      object(L,7,0,100,2,5,6),
      object(L,7,1,200,8,250,259),
      object(L,7,2,999,4,1,2)
    ]
  }=options;
  return {
    manifest:{platform,gameVersion},
    layouts:new Map([
      [L,{layoutId:L,layoutKind:'nativeGridCollection',
        nativeGridEntries:[{gridIdNative:7,gridDataPath:P,
          tessellationFactor:factor,defaultObjectCount:rows.length}]}],
      [L2,{layoutId:L2,layoutKind:'nativeGridCollection',
        nativeGridEntries:[{gridIdNative:7,gridDataPath:P2,
          tessellationFactor:1,defaultObjectCount:1}]}]
    ]),
    grids:new Map([[P,{sizeX:130,sizeY:130}],[P2,{sizeX:130,sizeY:130}]]),
    layoutObjectsByGrid:new Map([
      [L,new Map([[7,rows]])],
      [L2,new Map([[7,[object(L2,7,0,100,8,4,5)]]])]
    ]),
    objects:new Map([
      ['100',{itemId:100,nativeType:'Furniture',footprint:originalFootprint}],
      ['200',{itemId:200,nativeType:'Building',footprint:null}]
    ])
  };
}

test('exact source layout+Grid+GridObject join resolves native orientation and independent Item area',()=>{
  const f=fixture();
  const r=getOriginalGridObjectItemAreaLink(f,L,7,0,100);
  assert.equal(r.contract,DB04_ORIGINAL_GRIDOBJECT_ITEM_AREA_LINK);
  assert.equal(r.status,'original_item_default_gridarea_linked');
  assert.equal(r.sourceLayoutId,L);
  assert.equal(r.nativeGridId,7);
  assert.equal(r.gridDataPath,P);
  assert.equal(r.nativeGridObjectId,0);
  assert.deepEqual([r.originalAnchorX,r.originalAnchorY],[5,6]);
  assert.equal(r.originalOrientationCode,2);
  assert.equal(r.originalGridTessellationFactor,2);
  assert.deepEqual([r.itemGridAreaSizeX,r.itemGridAreaSizeY],[3,2]);
  assert.deepEqual([r.intrinsicOrientedLocalSizeX,r.intrinsicOrientedLocalSizeY],[6,6]);
  assert.equal(r.originalGridObjectNativeGetGridAreaFallbackCorroborated,true);
  assert.equal(r.originalItemFactoryFactorOneCorroborated,true);
  for(const k of ['runtimeAreaOverrideExcluded','actualPlacedGridAreaVerified',
    'nativeAnchorToAreaPivotVerified','terrainCellProjectionVerified',
    'occupancyPredicateVerified','collisionRulesVerified',
    'placementLegalityVerified','savedGridIdentityVerified',
    'saveWritingAuthorized','originalSourceAuthenticationVerified'])
    assert.equal(r[k],false,k);
  assert.throws(()=>{r.originalAnchorX=999;},TypeError);
});

test('source Grid.ID and GridObject.ID may repeat in other SceneLayouts without collision',()=>{
  const f=fixture();
  const other=getOriginalGridObjectItemAreaLink(f,L2,7,0,100);
  assert.equal(other.status,'original_item_default_gridarea_linked');
  assert.equal(other.gridDataPath,P2);
  assert.deepEqual([other.originalAnchorX,other.originalAnchorY],[4,5]);
  assert.equal(other.originalOrientationCode,8);
  assert.equal(other.originalGridTessellationFactor,1);
  assert.deepEqual([other.intrinsicOrientedLocalSizeX,
    other.intrinsicOrientedLocalSizeY],[3,2]);
});

test('source subset missing item, no-GridArea item, missing object and Grid remain distinct unknowns',()=>{
  const f=fixture();
  const unknown=getOriginalGridObjectItemAreaLink(f,L,7,2,999);
  assert.equal(unknown.status,'item_not_in_partial_original_source');
  assert.equal(unknown.originalOrientationCode,4);
  assert.equal(unknown.originalGridTessellationFactor,2);
  assert.equal(unknown.itemGridAreaSizeX,null);
  assert.equal(unknown.actualPlacedGridAreaVerified,false);
  const noArea=getOriginalGridObjectItemAreaLink(f,L,7,1,200);
  assert.equal(noArea.status,'item_has_no_source_gridarea');
  assert.equal(noArea.originalOrientationCode,8);
  const missing=getOriginalGridObjectItemAreaLink(f,L,7,100,100);
  assert.equal(missing.status,'original_object_not_in_grid');
  assert.equal(missing.originalAnchorX,null);
  assert.equal(getOriginalGridObjectItemAreaLink(f,L,123,0,100).status,
    'original_grid_not_in_source');
  assert.equal(getOriginalGridObjectItemAreaLink(f,L,7,0,100).placementLegalityVerified,false);
});

test('never infer provenance from later releases, unknown factors or another platform',()=>{
  for(const opts of [
    {gameVersion:'1.26.3'}, {gameVersion:'1.26.1'},
    {platform:'Switch'}
  ]) {
    const r=getOriginalGridObjectItemAreaLink(fixture(opts),L,7,0,100);
    assert.equal(r.status,'source_game_version_unverified');
    assert.equal(r.itemGridAreaSizeX,null);
    assert.equal(r.originalGridObjectNativeGetGridAreaFallbackCorroborated,false);
  }
  const r=getOriginalGridObjectItemAreaLink(fixture({factor:3}),L,7,0,100);
  assert.equal(r.status,'original_anchor_domain_unverified');
  assert.equal(r.originalGridTessellationFactor,null);
});

test('exact native identity, coordinates, orientation and source cardinality fail closed',()=>{
  for(const args of [
    ['SceneLayouts/../oops.json',7,0,100],[L,-1,0,100],
    [L,7,-1,100],[L,7,0,0],[L,7,0,1.2],[L,7,0,4294967296]
  ])assert.throws(()=>getOriginalGridObjectItemAreaLink(fixture(),...args),
    /INVALID_EXACT_SOURCE_KEY/);
  const wrong=fixture();
  assert.throws(()=>getOriginalGridObjectItemAreaLink(wrong,L,7,0,200),
    /INCONSISTENT_ORIGINAL/);
  const wrongId=fixture();
  wrongId.layoutObjectsByGrid.get(L).get(7)[0].layoutObjectId='not-exact';
  assert.throws(()=>getOriginalGridObjectItemAreaLink(wrongId,L,7,0,100),
    /INCONSISTENT_ORIGINAL/);
  const duplicated=fixture();
  duplicated.layoutObjectsByGrid.get(L).get(7)[1].gridObjectIdNative=0;
  assert.throws(()=>getOriginalGridObjectItemAreaLink(duplicated,L,7,0,100),
    /DUPLICATE_NATIVE_ID/);
  const outOfRange=fixture();
  outOfRange.layoutObjectsByGrid.get(L).get(7)[0].x=260;
  assert.throws(()=>getOriginalGridObjectItemAreaLink(outOfRange,L,7,0,100),
    /INCONSISTENT_ORIGINAL/);
  const badOrientation=fixture();
  badOrientation.layoutObjectsByGrid.get(L).get(7)[0].orientationCode=16;
  assert.throws(()=>getOriginalGridObjectItemAreaLink(badOrientation,L,7,0,100),
    /INCONSISTENT_ORIGINAL/);
  const count=fixture();
  count.layouts.get(L).nativeGridEntries[0].defaultObjectCount=100;
  assert.throws(()=>getOriginalGridObjectItemAreaLink(count,L,7,0,100),
    /GRID_COUNT_MISMATCH/);
});
