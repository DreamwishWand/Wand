import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldCatalog} from '../src/lib/world/catalog.mjs';
import {
  getDefaultLayoutObjects,getDefaultVillageAreaLayoutRefs,
  getDefaultLayoutGridEntries,getNativeDefaultLayoutAnchorWindow,
  getNativeVillageAreaAnchorWindow,registerSourceAnchorIndex
} from '../src/lib/world/native-source-anchor-index.ts';

const layout='SceneLayouts/Village04/Grid.json';
const village='SceneLayouts/Village04/Root.json';
const grid='GridData/Village04/World.json';
function fixture(){
  const rows=[
    [70,31,31,0],[3,64,32,0],[50,33,33,0],
    [28,31,32,0],[19,32,31,0],[100,32,32,0]
  ];
  return {
    manifest:{schema:'wand.db04.world@1',status:'partial_game_native_evidence',
      platform:'Steam',gameVersion:'1.26.2',sourceScopeVerified:false},
    objects:[],scenes:[],worlds:[],areas:[],
    grids:[{gridId:grid,sizeX:128,sizeY:128}],
    layouts:[{layoutId:layout,layoutKind:'nativeGridCollection',
      nativeGridEntries:[{gridIdNative:0,gridDataPath:grid,
        defaultObjectCount:rows.length,tessellationFactor:1}]},
      {layoutId:village,layoutKind:'nativeDefaultVillageData',
        areaLayoutReferences:[{nativeAreaTypeCode:1,nativeAreaTypeName:'Beach',
          gridLayoutPath:layout}]}],
    layoutObjects:rows.map(([id,x,y,g])=>({
      layoutObjectId:layout+'#grid='+g+'#object='+id,layoutId:layout,
      gridIdNative:g,gridObjectIdNative:id,itemId:1000+id,
      x,y,orientationCode:8,orientationName:'Down',
      worldCoordinatesVerified:false,fixedImmovableVerified:false
    }))
  };
}
test('source-only bucket lookup preserves imported GridObject order across four 32-cell buckets',()=>{
  const source=createWorldCatalog(fixture());
  const request={x:31,y:31,width:34,height:3};
  const page=getNativeDefaultLayoutAnchorWindow(source,layout,0,request);
  assert.equal(page.status,'source_native_default_layout_anchors_only');
  assert.equal(page.viewAnchorCount,6);
  assert.deepEqual(page.defaultObjectAnchors.map(a=>a.gridObjectIdNative),
    [70,3,50,28,19,100]);
  assert.deepEqual(page.defaultObjectAnchors.map(a=>[a.x,a.y]),
    [[31,31],[64,32],[33,33],[31,32],[32,31],[32,32]]);
  assert.equal(page.currentSaveObjectVerified,false);
  assert.equal(page.fullFootprintOccupancyVerified,false);
  assert.equal(page.placementLegalityVerified,false);
  const pages=[0,2,4,6].map(offset=>
    getNativeDefaultLayoutAnchorWindow(source,layout,0,request,
      {offset,limit:2}));
  assert.deepEqual(pages.map(p=>p.viewAnchorCount),[2,2,2,0]);
  assert.deepEqual(pages.map(p=>p.nextOffset),[2,4,null,null]);
  assert.deepEqual(pages.map(p=>p.matchingNativeDefaultAnchorCount),[6,6,6,6]);
  const villagePage=getNativeVillageAreaAnchorWindow(source,village,1,0,
    request,{offset:2,limit:2});
  assert.equal(villagePage.gridLayoutPath,layout);
  assert.deepEqual(villagePage.defaultObjectAnchors.map(a=>a.gridObjectIdNative),
    [50,28]);
});
test('exact Grid ID, AreaType and literal source paths remain navigable',()=>{
  const source=createWorldCatalog(fixture());
  assert.equal(getDefaultLayoutObjects(source,layout).length,6);
  assert.equal(getDefaultLayoutObjects(source,layout,0).length,6);
  assert.deepEqual(getDefaultLayoutGridEntries(source,layout),[{
    gridIdNative:0,gridDataPath:grid,tessellationFactor:1,
    defaultObjectCount:6,knownGridData:true
  }]);
  assert.deepEqual(getDefaultVillageAreaLayoutRefs(source,village),[{
    nativeAreaTypeCode:1,nativeAreaTypeName:'Beach',
    gridLayoutPath:layout,knownLayout:true
  }]);
  const absent=getNativeDefaultLayoutAnchorWindow(source,layout,1,
    {x:0,y:0,width:2,height:2});
  assert.equal(absent.status,'unknown_native_grid_in_layout');
  const unsupported=getNativeVillageAreaAnchorWindow(source,village,2,0,
    {x:0,y:0,width:2,height:2});
  assert.equal(unsupported.status,'unknown_native_village_area');
});
test('source index rejects fabricated catalogs, invalid pagination and out-of-bounds rectangles',()=>{
  assert.throws(()=>registerSourceAnchorIndex({}),
    /INVALID_CATALOG/);
  const source=createWorldCatalog(fixture());
  assert.throws(()=>getNativeDefaultLayoutAnchorWindow(
    source,layout,0,{x:0,y:0,width:2,height:2},{offset:-1,limit:1}),
    /pagination/);
  assert.equal(getNativeDefaultLayoutAnchorWindow(
    source,layout,0,{x:127,y:127,width:2,height:1}).status,
    'outside_native_grid_or_preview_limit');
});
