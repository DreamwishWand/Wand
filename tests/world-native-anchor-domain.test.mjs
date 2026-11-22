import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSourceAnchorDomain,
  getTessellatedSourceAnchorWindow,
} from '../src/lib/world/native-anchor-domain.ts';

// Fully synthetic native records, NOT a copy of any original game asset.
const layoutId='SceneLayouts/OffGridBuildings/Example/Source.json';
const gridId='GridData/OffGridBuildings/Example/SourceGrid.json';

function object(id,x,y) {
  return {
    layoutId,gridIdNative:0,gridObjectIdNative:id,
    layoutObjectId:layoutId+'#grid=0#object='+id,
    itemId:40000000+id,x,y,orientationCode:8,orientationName:'Down'
  };
}
function fixture({factor=2,platform='Steam',version='1.26.2',
                  rows=[object(0,5,5),object(1,230,240),
                        object(2,230,240),object(3,259,259)]}={}) {
  return {
    manifest:{platform,gameVersion:version},
    layouts:new Map([[layoutId,{
      layoutId,layoutKind:'nativeGridCollection',
      nativeGridEntries:[{
        gridIdNative:0,gridDataPath:gridId,tessellationFactor:factor,
        defaultObjectCount:rows.length
      }]
    }]]),
    grids:new Map([[gridId,{gridId,sizeX:130,sizeY:130}]]),
    layoutObjectsByGrid:new Map([[layoutId,new Map([[0,rows]])]])
  };
}

test('Steam 1.26.2 factor-2 source anchors have own read-only extent',()=>{
  const source=fixture();
  const domain=getSourceAnchorDomain(source,layoutId,0);
  assert.equal(domain?.status,'steam1262_original_factor_two_anchor_envelope');
  assert.equal(domain?.rawSizeX,130);
  assert.equal(domain?.anchorSizeX,260);
  assert.equal(domain?.anchorSizeY,260);
  assert.equal(domain?.tessellationFactor,2);
  assert.equal(domain?.terrainCellProjectionVerified,false);
  assert.equal(domain?.placementLegalityVerified,false);
  assert.equal(domain?.worldCoordinatesVerified,false);
  const {page,markers}=getTessellatedSourceAnchorWindow(
    source,layoutId,0,{x:224,y:238,width:32,height:16},0,1);
  assert.equal(page.status,'source_native_default_layout_anchors_only');
  assert.equal(page.matchingNativeDefaultAnchorCount,2);
  assert.equal(page.viewAnchorCount,1);
  assert.equal(page.defaultObjectAnchors[0].gridObjectIdNative,1);
  assert.equal(page.hasNextPage,true);
  assert.equal(page.nextOffset,1);
  assert.deepEqual(markers,[{x:230,y:240,count:2}]);
  assert.equal(page.terrainCellProjectionVerified,false);
  assert.equal(page.fullFootprintOccupancyVerified,false);
  assert.equal(page.anchorCoordinateDomain,
    'source_native_tessellation_integer_envelope');
  const second=getTessellatedSourceAnchorWindow(
    source,layoutId,0,{x:224,y:238,width:32,height:16},1,1);
  assert.equal(second.page.defaultObjectAnchors[0].gridObjectIdNative,2);
  assert.equal(second.page.hasNextPage,false);
  assert.equal(second.page.nextOffset,null);
});

test('factor-2 anchors at the last original integer coordinate remain reachable',()=>{
  const source=fixture();
  const {page,markers}=getTessellatedSourceAnchorWindow(
    source,layoutId,0,{x:259,y:259,width:1,height:1});
  assert.equal(page.matchingNativeDefaultAnchorCount,1);
  assert.equal(page.defaultObjectAnchors[0].gridObjectIdNative,3);
  assert.deepEqual(markers,[{x:259,y:259,count:1}]);
  assert.throws(()=>getTessellatedSourceAnchorWindow(source,layoutId,0,
    {x:260,y:259,width:1,height:1}),/WINDOW_INVALID/);
});

test('factor-1 stays raw and later builds are not inferred',()=>{
  const raw=fixture({factor:1});
  const domain=getSourceAnchorDomain(raw,layoutId,0);
  assert.equal(domain?.anchorSizeX,130);
  assert.equal(domain?.status,'raw_grid_dimensions_only');
  assert.throws(()=>getTessellatedSourceAnchorWindow(raw,layoutId,0,
    {x:0,y:0,width:16,height:16}),/NOT_CORROBORATED/);
  for(const [version,platform] of [['1.26.3','Steam'],['1.26.2','Switch']]){
    const unknown=fixture({version,platform});
    assert.equal(getSourceAnchorDomain(unknown,layoutId,0)?.anchorSizeX,130);
    assert.equal(getSourceAnchorDomain(unknown,layoutId,0)?.status,
      'tessellation_coordinate_relation_unverified');
  }
});

test('the native Grid.ID is scoped to its layout and exact GridData path',()=>{
  const source=fixture();
  assert.equal(getSourceAnchorDomain(source,layoutId,1),null);
  const otherLayout='SceneLayouts/OffGridBuildings/Example/Other.json';
  source.layouts.set(otherLayout,{
    layoutId:otherLayout,layoutKind:'nativeGridCollection',
    nativeGridEntries:[{gridIdNative:0,gridDataPath:gridId,
      tessellationFactor:1,defaultObjectCount:0}]
  });
  assert.equal(getSourceAnchorDomain(source,otherLayout,0)?.anchorSizeX,130);
  assert.equal(getSourceAnchorDomain(source,layoutId,0)?.anchorSizeX,260);
  source.layouts.get(layoutId).nativeGridEntries.push(
    {...source.layouts.get(layoutId).nativeGridEntries[0]});
  assert.throws(()=>getSourceAnchorDomain(source,layoutId,0),/GRID_ID_AMBIGUOUS/);
});

test('incomplete, malformed and out-of-envelope source data fail closed',()=>{
  const source=fixture();
  source.layouts.get(layoutId).nativeGridEntries[0].defaultObjectCount=10;
  assert.throws(()=>getTessellatedSourceAnchorWindow(source,layoutId,0,
    {x:0,y:0,width:16,height:16}),/OBJECT_COUNT_MISMATCH/);
  const outside=fixture({rows:[object(4,260,0)]});
  assert.throws(()=>getTessellatedSourceAnchorWindow(outside,layoutId,0,
    {x:0,y:0,width:16,height:16}),/OUTSIDE_CORROBORATED_ENVELOPE/);
  const bad=fixture({rows:[{...object(5,0,0),layoutObjectId:'wrong'}]});
  assert.throws(()=>getTessellatedSourceAnchorWindow(bad,layoutId,0,
    {x:0,y:0,width:16,height:16}),/NATIVE_OBJECT_INVALID/);
});
