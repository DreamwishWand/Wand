import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOriginalDefaultGridLayersAtCell,DB04_ORIGINAL_DEFAULT_GRID_LAYERS_CELL
} from '../src/lib/world/native-default-gridlayers-cell.ts';

const L='SceneLayouts/Village04/SourceExample.json';
const P='GridData/Village04/SourceExample.json';
const A=(sizeX,sizeY,layerValues)=>({
  sizeX,sizeY,layerValues,
  acceptedFloorTypesFlag:4,
  cellIndexToXYVerified:false,
  layerMaskSemanticsVerified:false,
  nativeWireFields:{sizeX:'6.1',sizeY:'6.2',
    layerValues:'6.3',acceptedFloorTypesFlag:'6.4'}
});
const obj=(id,itemId,x,y,orientationCode=8)=>({
  layoutId:L,gridIdNative:7,gridObjectIdNative:id,
  layoutObjectId:L+'#grid=7#object='+id,
  itemId,x,y,orientationCode
});
function fixture({factor=1,version='1.26.2',platform='Steam',
  rows=[
    obj(1,100,3,4),obj(2,101,2,4),
    obj(3,999,6,6),obj(4,200,7,7)
  ]}={}){
  return {
    manifest:{platform,gameVersion:version},
    layouts:new Map([[L,{
      layoutId:L,layoutKind:'nativeGridCollection',
      nativeGridEntries:[{gridIdNative:7,gridDataPath:P,
        tessellationFactor:factor,defaultObjectCount:rows.length}]
    }]]),
    grids:new Map([[P,{sizeX:8,sizeY:8}]]),
    layoutObjectsByGrid:new Map([[L,new Map([[7,rows]])]]),
    objects:new Map([
      ['100',{itemId:100,nativeType:'Furniture',
        footprint:A(2,2,[1,4,2,8])}],
      ['101',{itemId:101,nativeType:'Furniture',
        footprint:A(2,2,[2,0,8,64])}],
      ['200',{itemId:200,nativeType:'Building',footprint:null}],
      ['300',{itemId:300,nativeType:'Furniture',
        footprint:A(3,2,[11,12,21,22,31,32])}],
      ['400',{itemId:400,nativeType:'Furniture',
        footprint:A(1,1,[0x80000000])}],
      ['401',{itemId:401,nativeType:'Furniture',
        footprint:A(1,1,[0x40000000])}]
    ])
  };
}

test('native original default Item GridLayers overlap uses x*SizeY+y and bitwise OR',()=>{
  const f=fixture();
  const result=getOriginalDefaultGridLayersAtCell(f,L,7,3,4);
  assert.equal(result.contract,DB04_ORIGINAL_DEFAULT_GRID_LAYERS_CELL);
  assert.equal(result.status,'source_item_default_layer_or_only');
  assert.equal(result.sourceGridTessellationFactor,1);
  assert.equal(result.gridDataPath,P);
  assert.equal(result.rawDefaultItemLayerOr,9);
  assert.equal(result.sourceDefaultContributorCount,2);
  assert.equal(result.unresolvedSourceItemCount,1);
  assert.equal(result.unresolvedSourceGridAreaCount,1);
  assert.deepEqual(result.contributors.map(x=>[
    x.nativeGridObjectId,x.itemId,x.callerGridLocalX,x.callerGridLocalY,
    x.rawGridLayerValue
  ]),[[1,100,0,0,1],[2,101,1,0,8]]);
  assert.equal(result.nativeGridCellsLayerLookupCorroborated,true);
  for(const f of ['defaultItemFallbackOnly','zeroMaskDoesNotMeanUnoccupied',
    'missingDefinitionsNotEquivalentToFree'])assert.equal(result[f],true);
  for(const f of ['runtimeAreaOverridesExcluded','actualRuntimeGridLayersVerified',
    'placementLegalityVerified','occupancyPredicateVerified',
    'collisionRulesVerified','savedGridIdentityVerified',
    'saveWritingAuthorized','originalSourceAuthenticationVerified'])
    assert.equal(result[f],false,f);
  assert.throws(()=>result.contributors.push({}),TypeError);
  assert.throws(()=>{result.contributors[0].rawGridLayerValue=10},TypeError);
});
test('zero source layer and zero contributors must not imply an empty or free Grid cell',()=>{
  const f=fixture();
  const zero=getOriginalDefaultGridLayersAtCell(f,L,7,2,5);
  assert.equal(zero.rawDefaultItemLayerOr,0);
  assert.equal(zero.sourceDefaultContributorCount,1);
  assert.equal(zero.contributors[0].rawGridLayerValue,0);
  assert.equal(zero.zeroMaskDoesNotMeanUnoccupied,true);
  const noObservedDefault=getOriginalDefaultGridLayersAtCell(f,L,7,0,0);
  assert.equal(noObservedDefault.rawDefaultItemLayerOr,0);
  assert.equal(noObservedDefault.sourceDefaultContributorCount,0);
  assert.equal(noObservedDefault.unresolvedSourceItemCount,1);
  assert.equal(noObservedDefault.unresolvedSourceGridAreaCount,1);
  assert.equal(noObservedDefault.placementLegalityVerified,false);
});
test('factor two repeats original source raw cells, preserving exact caller-grid coordinate',()=>{
  const f=fixture({factor:2,rows:[obj(1,100,3,4)]});
  const a=getOriginalDefaultGridLayersAtCell(f,L,7,3,4);
  const b=getOriginalDefaultGridLayersAtCell(f,L,7,4,5);
  const c=getOriginalDefaultGridLayersAtCell(f,L,7,5,6);
  assert.deepEqual([a.rawDefaultItemLayerOr,b.rawDefaultItemLayerOr,
    c.rawDefaultItemLayerOr],[1,1,4]);
  assert.deepEqual([b.contributors[0].callerGridLocalX,
    b.contributors[0].callerGridLocalY],[1,1]);
  assert.equal(b.sourceGridTessellationFactor,2);
});
test('native oblique cells omit unmapped corners instead of converting them into free cells',()=>{
  const f=fixture({rows:[obj(4,300,2,2,2)]});
  const corner=getOriginalDefaultGridLayersAtCell(f,L,7,2,2);
  const inside=getOriginalDefaultGridLayersAtCell(f,L,7,3,2);
  const far=getOriginalDefaultGridLayersAtCell(f,L,7,4,4);
  assert.equal(corner.rawDefaultItemLayerOr,0);
  assert.equal(corner.sourceDefaultContributorCount,0);
  assert.equal(corner.zeroMaskDoesNotMeanUnoccupied,true);
  assert.equal(inside.rawDefaultItemLayerOr,12);
  assert.equal(inside.sourceDefaultContributorCount,1);
  assert.equal(far.rawDefaultItemLayerOr,0);
  const factorTwo=fixture({factor:2,rows:[obj(4,300,2,2,2)]});
  const t=getOriginalDefaultGridLayersAtCell(factorTwo,L,7,4,2);
  assert.equal(t.rawDefaultItemLayerOr,12);
  assert.equal(t.sourceGridTessellationFactor,2);
});
test('native source OR of uint32s uses unsigned results not signed JavaScript bit values',()=>{
  const f=fixture({rows:[obj(1,400,1,1),obj(2,401,1,1)]});
  const r=getOriginalDefaultGridLayersAtCell(f,L,7,1,1);
  assert.equal(r.rawDefaultItemLayerOr,0xc0000000);
  assert.equal(r.contributors.length,2);
});
test('bounded contributor receipts retain complete OR and total without leaking source arrays',()=>{
  const f=fixture({rows:[
    obj(1,100,3,4),obj(2,100,3,4),obj(3,100,3,4)]});
  const r=getOriginalDefaultGridLayersAtCell(f,L,7,3,4,1);
  assert.equal(r.rawDefaultItemLayerOr,1);
  assert.equal(r.sourceDefaultContributorCount,3);
  assert.equal(r.contributors.length,1);
  assert.equal(r.contributorListTruncated,true);
  assert.equal(r.contributors[0].nativeGridObjectId,1);
});
test('fail closed on other game versions, unknown factor, exact grid mismatch and malformed objects',()=>{
  for(const opts of [{version:'1.26.3'},{platform:'Switch'}]){
    const r=getOriginalDefaultGridLayersAtCell(fixture(opts),L,7,3,4);
    assert.equal(r.status,'source_game_version_unverified');
    assert.equal(r.rawDefaultItemLayerOr,null);
    assert.equal(r.nativeGridCellsLayerLookupCorroborated,false);
  }
  assert.equal(getOriginalDefaultGridLayersAtCell(fixture({factor:3}),L,7,3,4)
    .status,'source_grid_factor_unverified');
  assert.equal(getOriginalDefaultGridLayersAtCell(fixture(),L,9,3,4)
    .status,'original_grid_not_in_partial_source');
  for(const args of [
    ['SceneLayouts/../malicious.json',7,0,0],
    [L,-1,1,1],[L,7,-1,1],[L,7,1.2,1]
  ])assert.throws(()=>getOriginalDefaultGridLayersAtCell(fixture(),...args),
    /INVALID_QUERY/);
  assert.throws(()=>getOriginalDefaultGridLayersAtCell(fixture(),L,7,8,0),
    /OUT_OF_RANGE/);
  assert.throws(()=>getOriginalDefaultGridLayersAtCell(fixture(),L,7,3,4,0),
    /INVALID_QUERY/);
  const broken=fixture();
  broken.layoutObjectsByGrid.get(L).get(7)[0].layoutObjectId='different';
  assert.throws(()=>getOriginalDefaultGridLayersAtCell(broken,L,7,3,4),
    /INVALID_OBJECT/);
  const count=fixture();
  count.layouts.get(L).nativeGridEntries[0].defaultObjectCount=0;
  assert.throws(()=>getOriginalDefaultGridLayersAtCell(count,L,7,3,4),
    /COUNT_MISMATCH/);
});
