import test from 'node:test';
import assert from 'node:assert/strict';
import {
  probeOriginalSourceDefaultCandidate,DB04_SOURCE_DEFAULT_CANDIDATE_PROBE
} from '../src/lib/world/native-default-candidate-probe.ts';
import {getOriginalDefaultGridLayersWindow}
  from '../src/lib/world/native-default-gridlayers-window.ts';

const L='SceneLayouts/Village04/Candidate.json';
const P='GridData/Village04/Candidate.json';
const gridObject=(id,itemId,x,y,orientationCode=8)=>({
  layoutId:L,gridIdNative:3,gridObjectIdNative:id,
  layoutObjectId:L+'#grid=3#object='+id,
  itemId,x,y,orientationCode
});
const area=(sizeX,sizeY,layerValues)=>({
  sizeX,sizeY,layerValues,
  acceptedFloorTypesFlag:4,cellIndexToXYVerified:false,
  layerMaskSemanticsVerified:false,
  nativeWireFields:{sizeX:'6.1',sizeY:'6.2',
    layerValues:'6.3',acceptedFloorTypesFlag:'6.4'}
});
function fixture({factor=1,version='1.26.2',platform='Steam',
  width=12,height=12,rows=[
    gridObject(5,100,2,2),gridObject(6,101,4,2),
    gridObject(7,999,5,2),gridObject(8,102,9,9)
  ]}={}){
  return {
    manifest:{platform,gameVersion:version},
    layouts:new Map([[L,{layoutId:L,layoutKind:'nativeGridCollection',
      nativeGridEntries:[{gridIdNative:3,gridDataPath:P,
        tessellationFactor:factor,defaultObjectCount:rows.length}]}]]),
    grids:new Map([[P,{sizeX:width,sizeY:height}]]),
    layoutObjectsByGrid:new Map([[L,new Map([[3,rows]])]]),
    objects:new Map([
      ['100',{itemId:100,nativeType:'Furniture',
        footprint:area(2,2,[1,2,4,8])}],
      ['101',{itemId:101,nativeType:'Furniture',
        footprint:area(2,2,[1,16,64,128])}],
      ['102',{itemId:102,nativeType:'Building',footprint:null}],
      ['103',{itemId:103,nativeType:'Furniture',
        footprint:area(24,1,Array.from({length:24},(_,i)=>i+1))}]
    ])
  };
}
const probe=(source,x=4,y=2,orient=8)=>
  probeOriginalSourceDefaultCandidate(source,L,3,5,100,x,y,orient);

test('candidate source-default mask overlaps count raw shared bits, not collisions',()=>{
  const r=probe(fixture());
  assert.equal(r.contract,DB04_SOURCE_DEFAULT_CANDIDATE_PROBE);
  assert.equal(r.status,'source_default_candidate_layers_observed');
  assert.equal(r.originalAnchorX,2);
  assert.equal(r.originalAnchorY,2);
  assert.equal(r.originalOrientationCode,8);
  assert.equal(r.sourceGridFactor,1);
  assert.equal(r.sourceGridDataPath,P);
  assert.equal(r.candidateDefaultWidth,2);
  assert.equal(r.candidateDefaultHeight,2);
  assert.equal(r.mappedCandidateCellCount,4);
  assert.equal(r.rawSharedBitCellCount,1);
  assert.equal(r.potentiallyUnknownOtherSourceCellCount,2);
  assert.equal(r.backgroundMissingItemCount,1);
  assert.equal(r.backgroundItemWithoutGridAreaCount,1);
  assert.deepEqual(r.rows.map(row=>row.map(cell=>[
    cell.candidateSourceLayer,cell.otherOriginalDefaultLayerOr,
    cell.rawSharedBits,cell.potentiallyUnknownOtherSourceCount
  ])),[
    [[1,1,1,0],[4,64,0,1]],
    [[2,16,0,0],[8,128,0,1]]
  ]);
  assert.equal(r.sourceOriginalObjectExcludedFromBackground,true);
  for(const name of ['currentSaveObjectIdentityVerified',
    'nativeRuntimeGridCellsIndexVerified','runtimeAreaOverrideExcluded',
    'actualOccupancyVerified','collisionRulesVerified',
    'placementLegalityVerified','saveWritingAuthorized',
    'originalSourceAuthenticationVerified'])
    assert.equal(r[name],false,name);
  assert.equal(r.rawSharedBitsNotNativeConflict,true);
  assert.equal(r.nativeDefaultBoundsOnly,true);
  assert.throws(()=>{r.rows[0][0].rawSharedBits=9},TypeError);
  assert.throws(()=>r.rows[0].push({}),TypeError);
});

test('excluding original GridObject removes native source self-overlap at its original anchor',()=>{
  const f=fixture();
  const asSource=getOriginalDefaultGridLayersWindow(f,L,3,
    {x:2,y:2,width:2,height:2});
  const excluded=getOriginalDefaultGridLayersWindow(f,L,3,
    {x:2,y:2,width:2,height:2},5);
  assert.equal(asSource.rawLayerOrRows[0][0],1);
  assert.equal(excluded.rawLayerOrRows[0][0],0);
  assert.equal(excluded.excludedOriginalGridObjectId,5);
  assert.equal(excluded.sourceDefaultGridObjectCount,4);
  const result=probe(f,2,2);
  assert.equal(result.status,'source_default_candidate_layers_observed');
  assert.equal(result.rawSharedBitCellCount,0);
  assert.equal(result.mappedCandidateCellCount,4);
  assert.equal(result.rows[0][0].otherOriginalDefaultLayerOr,0);
  assert.throws(()=>getOriginalDefaultGridLayersWindow(f,L,3,
    {x:0,y:0,width:1,height:1},999),/EXCLUSION_NOT_IN_ORIGINAL_GRID/);
  assert.throws(()=>getOriginalDefaultGridLayersWindow(f,L,3,
    {x:0,y:0,width:1,height:1},-1),/INVALID_QUERY/);
});

test('rotation 4 and tessellation factor 2 are reflected in source-default candidate cells',()=>{
  const r=probe(fixture({factor:2}),4,2,4);
  assert.equal(r.status,'source_default_candidate_layers_observed');
  assert.equal(r.sourceGridFactor,2);
  assert.equal(r.candidateDefaultWidth,4);
  assert.equal(r.candidateDefaultHeight,4);
  assert.equal(r.rows.length,4);
  assert.equal(r.rows[0].length,4);
  assert.equal(r.mappedCandidateCellCount,16);
  assert.deepEqual(r.rows[0].slice(0,2).map(x=>x.candidateSourceLayer),[2,2]);
  assert.equal(r.rawSharedBitCellCount,0);
});

test('source shape is unverified when outside grid, too large or original definition absent',()=>{
  const f=fixture({width:6,height:6});
  const outside=probe(f,5,5);
  assert.equal(outside.status,
    'source_default_candidate_outside_original_grid_extent');
  assert.equal(outside.candidateDefaultWidth,2);
  assert.equal(outside.candidateDefaultHeight,2);
  assert.equal(outside.rows,null);
  assert.equal(outside.placementLegalityVerified,false);
  const large=fixture({width:80,height:80,rows:[gridObject(5,103,2,2)]});
  const tooLarge=probeOriginalSourceDefaultCandidate(large,L,3,5,103,4,4,8);
  assert.equal(tooLarge.status,'source_default_candidate_layers_observed');
  assert.equal(tooLarge.candidateDefaultWidth,24);
  const factorTwo=fixture({width:80,height:80,factor:2,
    rows:[gridObject(5,103,2,2)]});
  const blocked=probeOriginalSourceDefaultCandidate(
    factorTwo,L,3,5,103,4,4,8);
  assert.equal(blocked.status,'source_default_candidate_exceeds_probe_limit');
  assert.equal(blocked.candidateDefaultWidth,48);
  assert.equal(blocked.rows,null);
  const missing=probeOriginalSourceDefaultCandidate(fixture(),L,3,
    7,999,5,2,8);
  assert.equal(missing.status,'original_source_not_available');
  assert.equal(missing.rows,null);
  assert.equal(missing.saveWritingAuthorized,false);
  for(const opts of [{version:'1.26.3'},{platform:'Switch'}]){
    const r=probe(fixture(opts));
    assert.equal(r.status,'original_source_not_available');
    assert.equal(r.rows,null);
  }
});

test('strict original tuple, dimensions and candidate requests fail closed',()=>{
  const f=fixture();
  assert.throws(()=>probeOriginalSourceDefaultCandidate(f,
    L,3,5,101,4,2,8),/INCONSISTENT_ORIGINAL/);
  assert.throws(()=>probeOriginalSourceDefaultCandidate(f,
    'SceneLayouts/../Bad.json',3,5,100,4,2,8),/QUERY_INVALID/);
  assert.equal(probeOriginalSourceDefaultCandidate(f,
    L,4,5,100,4,2,8).status,'original_source_not_available');
  for(const q of [[-1,2,8],[3,-1,8],[2,2,16],
    [1.3,1,8],[0,0,-1]]){
    assert.throws(()=>probe(f,...q),/QUERY_INVALID/);
  }
});
