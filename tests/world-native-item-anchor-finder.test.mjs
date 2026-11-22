import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findOriginalItemAnchor,DB04_NATIVE_ITEM_ANCHOR_FINDER,
  findOriginalItemAnchorAcrossGrids,DB04_GLOBAL_ORIGINAL_ITEM_ANCHOR_FINDER
} from '../src/lib/world/native-item-anchor-finder.ts';

const layoutId='SceneLayouts/Village04/OriginalExample.json';
const path='GridData/Village04/OriginalExample.json';
function point(id,itemId,x,y) {
  return {
    layoutId,gridIdNative:7,gridObjectIdNative:id,
    layoutObjectId:layoutId+'#grid=7#object='+id,
    itemId,x,y,orientationCode:8
  };
}
function fixture({factor=2,version='1.26.2',platform='Steam',
  rows=[point(0,100,3,4),point(1,200,250,259),
    point(2,100,250,259)]}={}) {
  return {
    manifest:{platform,gameVersion:version},
    layouts:new Map([[layoutId,{
      layoutId,layoutKind:'nativeGridCollection',
      nativeGridEntries:[{
        gridIdNative:7,gridDataPath:path,
        defaultObjectCount:rows.length,tessellationFactor:factor
      }]
    }]]),
    grids:new Map([[path,{sizeX:130,sizeY:130}]]),
    layoutObjectsByGrid:new Map([[layoutId,new Map([[7,rows]])]])
  };
}
test('source-only item lookup finds both matching original anchors by ordinal',()=>{
  const f=fixture();
  const first=findOriginalItemAnchor(f,layoutId,7,100);
  assert.equal(first.contract,DB04_NATIVE_ITEM_ANCHOR_FINDER);
  assert.equal(first.status,'found');
  assert.equal(first.matchingOriginalDefaultObjectCount,2);
  assert.deepEqual([first.sourceAnchorX,first.sourceAnchorY],[3,4]);
  assert.equal(first.gridObjectIdNative,0);
  const second=findOriginalItemAnchor(f,layoutId,7,100,1);
  assert.equal(second.status,'found');
  assert.deepEqual([second.sourceAnchorX,second.sourceAnchorY],[250,259]);
  assert.equal(second.gridObjectIdNative,2);
  assert.equal(second.matchedIndex,1);
  for(const key of ['savedGridIdentityVerified','worldCoordinatesVerified',
    'terrainCellProjectionVerified','footprintOccupancyVerified',
    'placementLegalityVerified'])assert.equal(second[key],false);
  assert.equal(second.partialSourceOnly,true);
  assert.throws(()=>{second.sourceAnchorX=100;},TypeError);
});
test('missing item, out-of-range ordinal, empty Grid and missing native Grid fail closed',()=>{
  const f=fixture();
  assert.equal(findOriginalItemAnchor(f,layoutId,7,999).status,
    'not_in_source_grid');
  const missed=findOriginalItemAnchor(f,layoutId,7,100,2);
  assert.equal(missed.status,'match_index_out_of_range');
  assert.equal(missed.sourceAnchorX,null);
  assert.equal(missed.matchingOriginalDefaultObjectCount,2);
  assert.equal(findOriginalItemAnchor(f,layoutId,8,100).status,
    'original_grid_not_in_source');
  const zero=fixture({rows:[]});
  assert.equal(findOriginalItemAnchor(zero,layoutId,7,100).status,
    'not_in_source_grid');
});
test('factor-one sources can be centered on their original integer coordinates',()=>{
  const f=fixture({factor:1,rows:[point(0,100,129,129)]});
  const found=findOriginalItemAnchor(f,layoutId,7,100);
  assert.equal(found.status,'found');
  assert.deepEqual([found.sourceAnchorX,found.sourceAnchorY],[129,129]);
});
test('later versions and other platforms do not inherit source coordinate proof',()=>{
  for(const source of [fixture({version:'1.26.3'}),
                       fixture({platform:'Switch'})]) {
    assert.equal(findOriginalItemAnchor(source,layoutId,7,100).status,
      'source_game_version_unverified');
  }
  assert.equal(findOriginalItemAnchor(fixture({factor:3}),
    layoutId,7,100).status,'original_anchor_domain_unverified');
});
test('reject forged Grid refs and structurally invalid source anchors',()=>{
  const f=fixture();
  for(const [layout,grid,id,offset] of [
    ['7',7,100,0],['SceneLayouts/../OriginalExample.json',7,100,0],
    [layoutId,-1,100,0],[layoutId,4294967296,100,0],
    [layoutId,7,0,0],[layoutId,7,1.2,0],
    [layoutId,7,100,-1],[layoutId,7,100,1000001]
  ])assert.throws(()=>findOriginalItemAnchor(f,layout,grid,id,offset),
    /INVALID_EXACT_SOURCE_QUERY/);
  f.layoutObjectsByGrid.get(layoutId).get(7)[0].x=260;
  assert.throws(()=>findOriginalItemAnchor(f,layoutId,7,100),
    /INVALID_ORIGINAL_OBJECT/);
  const other=fixture();
  other.layouts.get(layoutId).nativeGridEntries[0].defaultObjectCount=6;
  assert.throws(()=>findOriginalItemAnchor(other,layoutId,7,100),
    /SOURCE_COUNT_MISMATCH/);
});


test('global lookup crosses two original layouts without merging native Grid IDs',()=>{
  const f=fixture();
  const secondLayout='SceneLayouts/OffGridBuildings/Other.json';
  const secondPath='GridData/OffGridBuildings/Other.json';
  f.layouts.set(secondLayout,{
    layoutId:secondLayout,layoutKind:'nativeGridCollection',
    nativeGridEntries:[{gridIdNative:7,gridDataPath:secondPath,
      tessellationFactor:1,defaultObjectCount:1}]
  });
  f.grids.set(secondPath,{sizeX:130,sizeY:130});
  f.layoutObjectsByGrid.set(secondLayout,new Map([[7,[{
    layoutId:secondLayout,gridIdNative:7,gridObjectIdNative:0,
    layoutObjectId:secondLayout+'#grid=7#object=0',
    itemId:100,x:129,y:129
  }]]]));
  const a=findOriginalItemAnchorAcrossGrids(f,100,0);
  assert.equal(a.contract,DB04_GLOBAL_ORIGINAL_ITEM_ANCHOR_FINDER);
  assert.equal(a.status,'found');
  assert.equal(a.matchingOriginalDefaultObjectCount,3);
  assert.equal(a.sourceLayoutId,layoutId);
  assert.equal(a.gridDataPath,path);
  assert.equal(a.nativeGridId,7);
  assert.deepEqual([a.sourceAnchorX,a.sourceAnchorY],[3,4]);
  const b=findOriginalItemAnchorAcrossGrids(f,100,1);
  assert.equal(b.sourceLayoutId,layoutId);
  assert.deepEqual([b.sourceAnchorX,b.sourceAnchorY],[250,259]);
  const c=findOriginalItemAnchorAcrossGrids(f,100,2);
  assert.equal(c.sourceLayoutId,secondLayout);
  assert.equal(c.gridDataPath,secondPath);
  assert.equal(c.nativeGridId,7);
  assert.deepEqual([c.sourceAnchorX,c.sourceAnchorY],[129,129]);
  assert.equal(c.matchedIndex,2);
  assert.equal(c.unverifiedOriginalDefaultObjectCount,0);
  for(const flag of ['savedGridIdentityVerified','worldCoordinatesVerified',
    'terrainCellProjectionVerified','footprintOccupancyVerified',
    'placementLegalityVerified'])assert.equal(c[flag],false);
  assert.throws(()=>{c.nativeGridId=17;},TypeError);
  assert.equal(findOriginalItemAnchorAcrossGrids(f,100,3).status,
    'match_index_out_of_range');
  assert.equal(findOriginalItemAnchorAcrossGrids(f,999).status,
    'not_in_partial_original_source');
});

test('global query keeps unverified matching original Grid cases explicitly unknown',()=>{
  const f=fixture({factor:3});
  const unknown=findOriginalItemAnchorAcrossGrids(f,100);
  assert.equal(unknown.status,'source_anchor_domain_unverified');
  assert.equal(unknown.matchingOriginalDefaultObjectCount,0);
  assert.equal(unknown.unverifiedOriginalDefaultObjectCount,2);
  assert.equal(unknown.sourceAnchorX,null);
  const mixed=fixture();
  const unknownLayout='SceneLayouts/House/Unknown.json';
  mixed.layoutObjectsByGrid.set(unknownLayout,new Map([[1,[{
    layoutId:unknownLayout,gridIdNative:1,gridObjectIdNative:0,
    layoutObjectId:unknownLayout+'#grid=1#object=0',
    itemId:100,x:1,y:1
  }]]));
  const partial=findOriginalItemAnchorAcrossGrids(mixed,100,0);
  assert.equal(partial.status,'found');
  assert.equal(partial.matchingOriginalDefaultObjectCount,2);
  assert.equal(partial.unverifiedOriginalDefaultObjectCount,1);
  assert.equal(partial.partialSourceOnly,true);
  const noOriginal=fixture({version:'1.26.3'});
  assert.equal(findOriginalItemAnchorAcrossGrids(noOriginal,100).status,
    'source_game_version_unverified');
});

test('global query refuses invalid IDs, malformed Grid data or forged coordinates',()=>{
  const f=fixture();
  for(const id of [0,-1,1.25,Number.NaN]){
    assert.throws(()=>findOriginalItemAnchorAcrossGrids(f,id),
      /GLOBAL_ITEM_ANCHOR_QUERY_INVALID/);
  }
  assert.throws(()=>findOriginalItemAnchorAcrossGrids(f,100,-1),
    /GLOBAL_ITEM_ANCHOR_QUERY_INVALID/);
  assert.throws(()=>findOriginalItemAnchorAcrossGrids(f,100,1000001),
    /GLOBAL_ITEM_ANCHOR_QUERY_INVALID/);
  f.layoutObjectsByGrid.get(layoutId).get(7)[0].x=260;
  assert.throws(()=>findOriginalItemAnchorAcrossGrids(f,100),
    /GLOBAL_ITEM_ANCHOR_INVALID_OBJECT/);
  const mismatch=fixture();
  mismatch.layouts.get(layoutId).nativeGridEntries[0].defaultObjectCount=0;
  assert.throws(()=>findOriginalItemAnchorAcrossGrids(mismatch,100),
    /GLOBAL_ITEM_ANCHOR_COUNT_MISMATCH/);
});
