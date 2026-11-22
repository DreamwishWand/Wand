import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findOriginalItemAnchor,DB04_NATIVE_ITEM_ANCHOR_FINDER
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
