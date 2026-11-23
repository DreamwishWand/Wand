import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOriginalDefaultGridLayersWindow,DB04_ORIGINAL_DEFAULT_GRID_LAYERS_WINDOW
} from '../src/lib/world/native-default-gridlayers-window.ts';
import {getOriginalDefaultGridLayersAtCell}
  from '../src/lib/world/native-default-gridlayers-cell.ts';

const L='SceneLayouts/Village04/SourceWindow.json';
const P='GridData/Village04/SourceWindow.json';
const footprint=(sizeX,sizeY,layerValues)=>({
  sizeX,sizeY,layerValues,acceptedFloorTypesFlag:4,
  cellIndexToXYVerified:false,layerMaskSemanticsVerified:false,
  nativeWireFields:{
    sizeX:'6.1',sizeY:'6.2',layerValues:'6.3',
    acceptedFloorTypesFlag:'6.4'
  }
});
const row=(id,itemId,x,y,orientationCode=8)=>({
  layoutId:L,gridIdNative:9,gridObjectIdNative:id,
  layoutObjectId:L+'#grid=9#object='+id,
  itemId,x,y,orientationCode
});
function fixture({version='1.26.2',platform='Steam',factor=1,
  sx=40,sy=40,rows=[
    row(0,100,1,2,8),row(1,101,2,2,8),row(2,102,8,4,2),
    row(3,103,6,6,4)
  ]}={}){
  return {
    manifest:{gameVersion:version,platform},
    layouts:new Map([[L,{layoutId:L,layoutKind:'nativeGridCollection',
      nativeGridEntries:[{gridIdNative:9,gridDataPath:P,
        tessellationFactor:factor,defaultObjectCount:rows.length}]}]]),
    grids:new Map([[P,{sizeX:sx,sizeY:sy}]]),
    layoutObjectsByGrid:new Map([[L,new Map([[9,rows]])]]),
    objects:new Map([
      ['100',{itemId:100,nativeType:'Furniture',
        footprint:footprint(2,2,[1,4,2,8])}],
      ['101',{itemId:101,nativeType:'Furniture',
        footprint:footprint(2,2,[16,0,32,64])}],
      ['102',{itemId:102,nativeType:'Furniture',
        footprint:footprint(3,2,[11,12,21,22,31,32])}],
      ['103',{itemId:103,nativeType:'Furniture',
        footprint:footprint(1,1,[0x80000000])}],
      ['104',{itemId:104,nativeType:'Furniture',
        footprint:footprint(24,1,Array.from({length:24},(_,i)=>i+1))}],
      ['106',{itemId:106,nativeType:'Building',footprint:null}]
    ])
  };
}

test('bounded source window matches independent native source point reads for cardinal and oblique cells',()=>{
  for(const factor of [1,2]){
    const src=fixture({factor});
    const rect={x:0,y:0,width:20,height:14};
    const w=getOriginalDefaultGridLayersWindow(src,L,9,rect);
    assert.equal(w.contract,DB04_ORIGINAL_DEFAULT_GRID_LAYERS_WINDOW);
    assert.equal(w.status,'source_item_default_layer_window');
    assert.equal(w.sourceGridTessellationFactor,factor);
    assert.equal(w.sourceDefaultGridObjectCount,4);
    assert.equal(w.gridDataPath,P);
    assert.equal(w.rawLayerOrRows.length,14);
    assert.equal(w.rawLayerOrRows[0].length,20);
    for(let iy=0;iy<rect.height;iy++){
      for(let ix=0;ix<rect.width;ix++){
        const point=getOriginalDefaultGridLayersAtCell(src,L,9,ix,iy);
        assert.equal(w.rawLayerOrRows[iy][ix],point.rawDefaultItemLayerOr,
          'factor '+factor+' '+ix+','+iy);
        assert.equal(w.knownDefaultContributorCountRows[iy][ix],
          point.sourceDefaultContributorCount);
        assert.equal(w.potentiallyUnresolvedContributorCountRows[iy][ix],0);
      }
    }
    assert.equal(w.rawLayerOrRows[6][6]>>>0,0x80000000);
    for(const key of [
      'nativeGridCellsRuntimeIndexVerified','runtimeAreaOverrideExcluded',
      'zeroMaskMeansFree','unknownCellIsFree','actualOccupancyVerified',
      'collisionRulesVerified','placementLegalityVerified','saveWritingAuthorized',
      'originalSourceAuthenticationVerified'
    ])assert.equal(w[key],false,key);
    assert.equal(w.sourceItemDefaultFallbackOnly,true);
    assert.equal(w.nativeGridCellsLayerLookupCorroborated,true);
    assert.throws(()=>w.rawLayerOrRows[0][0]=99,TypeError);
    assert.throws(()=>w.potentiallyUnresolvedContributorCountRows.push([]),TypeError);
  }
});
test('tile the exact source-local helper at 16-cell cap without omitting a 24-wide footprint',()=>{
  const source=fixture({rows:[row(0,104,5,1)]});
  const w=getOriginalDefaultGridLayersWindow(source,L,9,
    {x:0,y:0,width:32,height:4});
  assert.equal(w.rawLayerOrRows[1][4],0);
  assert.equal(w.rawLayerOrRows[1][5],1);
  assert.equal(w.rawLayerOrRows[1][20],16);
  assert.equal(w.rawLayerOrRows[1][28],24);
  assert.equal(w.rawLayerOrRows[1][29],0);
  assert.equal(w.knownDefaultContributorCountRows[1][28],1);
  assert.equal(w.rawLayerOrRows[3][28],0);
  assert.equal(w.rect.width,32);
});
test('missing original Items and no default GridArea are POSSIBLE unknowns, not free-cell verdicts',()=>{
  const source=fixture({rows:[
    row(0,100,1,2),row(1,999,5,3),row(2,106,7,5)
  ]});
  const w=getOriginalDefaultGridLayersWindow(source,L,9,
    {x:4,y:2,width:6,height:6});
  assert.equal(w.missingItemDefinitionCount,1);
  assert.equal(w.sourceItemWithoutGridAreaCount,1);
  assert.equal(w.rawLayerOrRows[0][0],0);
  assert.equal(w.knownDefaultContributorCountRows[1][1],0);
  // A source anchor to the right/below cannot contribute to an earlier cell
  // under the native GridObject X/Y subtraction + local-index path.
  assert.equal(w.potentiallyUnresolvedContributorCountRows[0][0],0);
  assert.equal(w.potentiallyUnresolvedContributorCountRows[1][1],1);
  assert.equal(w.potentiallyUnresolvedContributorCountRows[3][3],2);
  assert.equal(w.potentiallyUnresolvedContributorCountRows[5][5],2);
  assert.equal(w.unknownCellIsFree,false);
  assert.equal(w.zeroMaskMeansFree,false);
  assert.equal(w.runtimeAreaOverrideExcluded,false);
});
test('source item default area exceeding original Grid extent stays unverified, not clipped into known mask',()=>{
  const source=fixture({sx:8,sy:8,rows:[row(0,100,7,7)]});
  const w=getOriginalDefaultGridLayersWindow(source,L,9,
    {x:5,y:5,width:3,height:3});
  assert.equal(w.invalidDefaultAreaExtentCount,1);
  assert.equal(w.rawLayerOrRows[2][2],0);
  assert.equal(w.knownDefaultContributorCountRows[2][2],0);
  assert.equal(w.potentiallyUnresolvedContributorCountRows[2][2],1);
  assert.equal(w.placementLegalityVerified,false);
});
test('fail closed for malformed sources, versions, window boundaries and wrong original references',()=>{
  const source=fixture();
  assert.equal(getOriginalDefaultGridLayersWindow(fixture({version:'1.26.3'}),
    L,9,{x:0,y:0,width:1,height:1}).status,
    'source_game_version_unverified');
  assert.equal(getOriginalDefaultGridLayersWindow(fixture({platform:'Switch'}),
    L,9,{x:0,y:0,width:1,height:1}).rawLayerOrRows,null);
  assert.equal(getOriginalDefaultGridLayersWindow(source,L,19,
    {x:0,y:0,width:1,height:1}).status,
    'original_grid_not_in_partial_source');
  assert.equal(getOriginalDefaultGridLayersWindow(fixture({factor:3}),L,9,
    {x:0,y:0,width:1,height:1}).status,'source_grid_factor_unverified');
  for(const [layout,grid,rect] of [
    ['SceneLayouts/../Unsafe.json',9,{x:0,y:0,width:1,height:1}],
    [L,-1,{x:0,y:0,width:1,height:1}],
    [L,9,{x:0,y:0,width:0,height:1}],
    [L,9,{x:0,y:0,width:33,height:1}],
    [L,9,{x:-1,y:0,width:1,height:1}]
  ])assert.throws(()=>getOriginalDefaultGridLayersWindow(
    source,layout,grid,rect),/INVALID_QUERY/);
  assert.throws(()=>getOriginalDefaultGridLayersWindow(source,L,9,
    {x:39,y:39,width:2,height:2}),/OUT_OF_RANGE/);
  const bad=fixture();
  bad.layoutObjectsByGrid.get(L).get(9)[0].layoutObjectId='forged';
  assert.throws(()=>getOriginalDefaultGridLayersWindow(bad,L,9,
    {x:0,y:0,width:5,height:5}),/ORIGINAL_OBJECT_INVALID/);
  const count=fixture();
  count.layouts.get(L).nativeGridEntries[0].defaultObjectCount=0;
  assert.throws(()=>getOriginalDefaultGridLayersWindow(count,L,9,
    {x:0,y:0,width:5,height:5}),/COUNT_MISMATCH/);
});
