import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceMapLayer,sourceSurfaceCapable,matchesSelectionLayer,mapPainterOrder,prioritizeMapHits} from '../src/lib/world/source-map-layers.ts';
import {worldObjectName,searchSavedObjects,objectFocus} from '../src/lib/world/world-object-search.ts';
import {defaultMapCamera,maxMapZoom,zoomMapCamera,panMapCamera,mapCameraViewBox} from '../src/lib/world/map-camera.ts';
import {emptyWorldTimeline,currentWorldEdits,projectWorldEdits,stageWorldEdit,travelWorldTimeline} from '../src/lib/world/saved-map-batch.ts';
import {savedDraftOverlap} from '../src/lib/world/saved-draft-overlap.ts';
import {draftSavedMapTransform,worldTransformEligible,exclusiveAnchorClass,exclusiveAnchorConflict} from '../src/lib/world/saved-map-transform.ts';
import {buildSavedShapeMap,savedGridObjects,savedShapesAt} from '../src/lib/world/saved-shape-map.ts';
import {buildSourceObjectMap,sourceObjectsAt,sourceOrientationAngle,sourceShapeIntersections} from '../src/lib/world/source-object-map.ts';
const L='SceneLayouts/Village04/Fixture.json',P='GridData/Village04/Fixture.json';
const row=(id,itemId,x,y,orientationCode)=>({layoutId:L,gridIdNative:7,gridObjectIdNative:id,itemId,x,y,orientationCode});
function fixture(factor=1,version='1.26.2'){
  const rows=[row(0,100,1,2,8),row(1,100,1,2,8),row(2,100,5,4,4),row(3,999,1,2,8)];
  return {manifest:{gameVersion:version,platform:'Steam'},
    layouts:new Map([[L,{layoutKind:'nativeGridCollection',nativeGridEntries:[{gridIdNative:7,gridDataPath:P,tessellationFactor:factor,defaultObjectCount:rows.length}]}]]),
    grids:new Map([[P,{sizeX:10,sizeY:10}]]),layoutObjectsByGrid:new Map([[L,new Map([[7,rows]])]]),
    objects:new Map([['100',{itemId:100,nativeName:'Synthetic',nativeType:'Furniture',
      footprint:{sizeX:2,sizeY:1,layerValues:[0,4],acceptedFloorTypesFlag:4,
        cellIndexToXYVerified:false,layerMaskSemanticsVerified:false,
        nativeWireFields:{sizeX:'6.1',sizeY:'6.2',layerValues:'6.3',acceptedFloorTypesFlag:'6.4'}}}]])};
}
test('deduplicate shapes by item and direction, keep all overlapping instance identities',()=>{
  const map=buildSourceObjectMap(fixture(),L,7);
  assert.equal(map.status,'source_default_geometry');
  assert.equal(map.objects.length,4);
  assert.equal(map.unresolvedCount,1);
  assert.equal(Object.keys(map.shapes).length,2);
  assert.equal(map.shapes['100:8'].cellCount,2);
  assert.equal(map.shapes['100:4'].height,2);
  assert.deepEqual(sourceObjectsAt(map,1,2).map(o=>o.id),[0,1,3]);
  assert.deepEqual(sourceObjectsAt(map,2,2).map(o=>o.id),[0,1]);
  assert.deepEqual(sourceObjectsAt(map,5,5).map(o=>o.id),[2]);
  assert.deepEqual(sourceObjectsAt(map,6,4),[]);
  assert.equal(map.actualOccupancyVerified,false);
  assert.equal(map.supportRelationsVerified,false);
  assert.equal(sourceOrientationAngle(8),0);
  assert.equal(sourceOrientationAngle(12),90);
});
test('factor two keeps a separate scaled anchor domain and mapped geometry',()=>{
  const map=buildSourceObjectMap(fixture(2),L,7);
  assert.equal(map.status,'source_default_geometry');
  assert.equal(map.gridFactor,2);
  assert.deepEqual([map.sizeX,map.sizeY],[20,20]);
  assert.equal(map.shapes['100:8'].cellCount,8);
  assert.deepEqual([map.shapes['100:4'].width,map.shapes['100:4'].height],[2,4]);
  assert.deepEqual(sourceObjectsAt(map,4,3).map(o=>o.id),[0,1]);
  assert.equal(buildSourceObjectMap(fixture(3),L,7).status,'incompatible_grid_factor');
  assert.equal(buildSourceObjectMap(fixture(1,'1.27.0'),L,7).status,'unavailable');
});

test('source-native layers preserve all objects and surface capability is not actual parentage',()=>{
  const objects=[
    {id:1,layer:sourceMapLayer('Furniture',40100001,4),surfaceCapable:false},
    {id:2,layer:sourceMapLayer('Furniture',40700001,4),surfaceCapable:false},
    {id:3,layer:sourceMapLayer('Furniture',40200001,4),surfaceCapable:false},
    {id:4,layer:sourceMapLayer('Furniture',40000001,4096),surfaceCapable:true},
    {id:5,layer:sourceMapLayer('Furniture',40000002,4100),surfaceCapable:sourceSurfaceCapable(4100)}
  ];
  assert.deepEqual(objects.map(o=>o.layer),['ground','fence','landscape','surface','furniture']);
  assert.equal(matchesSelectionLayer(objects[4],'surface'),true);
  assert.equal(matchesSelectionLayer(objects[0],'furniture'),false);
  assert.deepEqual(mapPainterOrder(objects).map(o=>o.id),[1,3,5,2,4]);
  assert.deepEqual(prioritizeMapHits(objects,'fence').map(o=>o.id),[2,1,3,4,5]);
  assert.equal(sourceMapLayer(null,40700001,4096),'other');
  assert.equal(sourceMapLayer('Furniture',40000001,null),'furniture');
  assert.equal(buildSourceObjectMap(fixture(),L,7).supportRelationsVerified,false);
});

test('intersection counts retain overlapping instance identity and exclude unmapped anchors',()=>{
  for(const factor of [1,2]){
    const map=buildSourceObjectMap(fixture(factor),L,7);
    const overlaps=sourceShapeIntersections(map,map.objects[0]);
    assert.deepEqual(overlaps.map(x=>[x.object.id,x.cells]),[[1,2*factor*factor]]);
    assert.deepEqual(sourceShapeIntersections(map,map.objects[3]),[]);
  }
});

test('saved shape candidates use saved anchors and exact cardinal strings, never merge grid ordinals',()=>{
  const point=(localOrdinal,localGridOrdinal,x,y,orientation,itemId='100')=>({localOrdinal,localGridOrdinal,x,y,orientation,itemId});
  const map=buildSavedShapeMap(fixture(),L,7,[
    point(1,1,-2,3,'GridOrientation_Down'),point(2,1,-2,3,'GridOrientation_Right'),
    point(3,2,-2,3,'GridOrientation_Down'),point(4,1,10,10,'West'),
    point(5,1,3,4,'GridOrientation_Down','99999999999999999999')]);
  assert.equal(map.objects.length,5);
  assert.equal(map.objects[0].shapeKey,'100:8');
  assert.equal(map.objects[1].shapeKey,'100:4');
  assert.equal(map.objects[3].shapeKey,null);
  assert.equal(map.objects[4].shapeKey,null);
  assert.deepEqual(savedGridObjects(map,1).map(o=>o.localOrdinal),[1,2,4,5]);
  assert.deepEqual(savedShapesAt(map,1,-2,3).map(o=>o.localOrdinal),[1,2]);
  assert.deepEqual(savedShapesAt(map,2,-2,3).map(o=>o.localOrdinal),[3]);
  assert.equal(map.savedSourceCoordinateEquivalenceVerified,false);
  assert.equal(map.actualOccupancyVerified,false);
});

test('map transform creates existing Rust mixed plan; only recognized exclusive anchors can move',()=>{
  const o={localOrdinal:3,localGridOrdinal:1,itemId:'40000001',x:2,y:3,orientation:'GridOrientation_Up',shapeKey:'40000001:0',layer:'furniture',surfaceCapable:false};
  assert.deepEqual(draftSavedMapTransform(o,-4,8,'GridOrientation_Right'),{localOrdinal:3,itemId:'40000001',recordKind:'full',expectedX:2,expectedY:3,replacementX:-4,replacementY:8,expectedOrientation:'GridOrientation_Up',replacementOrientation:'GridOrientation_Right'});
  assert.equal(draftSavedMapTransform(o,2,3,o.orientation),null);
  assert.equal(draftSavedMapTransform(o,2147483648,3,o.orientation),null);
  assert.equal(draftSavedMapTransform(o,2,3,'West'),null);
  assert.equal(worldTransformEligible({...o,layer:'ground'}),false);
  assert.equal(worldTransformEligible({...o,layer:'fence'}),false);
  const road={...o,itemId:'40100001',layer:'ground',shapeKey:null};
  assert.equal(worldTransformEligible(road),true);
  assert.equal(draftSavedMapTransform(road,4,5,road.orientation).replacementX,4);
  assert.equal(draftSavedMapTransform(road,4,5,'GridOrientation_Right'),null);
  assert.equal(worldTransformEligible({...road,layer:'other'}),false);
  assert.equal(worldTransformEligible({...o,shapeKey:null}),false);
});

test('saved draft colors only intersecting mapped cells, excludes self and other Grids, preserves nonblocking landscape',()=>{
  const p=(localOrdinal,localGridOrdinal,x,y,orientation='GridOrientation_Down')=>({localOrdinal,localGridOrdinal,x,y,orientation,itemId:'100'});
  const m=buildSavedShapeMap(fixture(),L,7,[p(1,1,0,0),p(2,1,1,1),p(3,1,2,1),p(4,2,1,1),p(5,1,20,20,'West')]);
  const map={...m,objects:m.objects.map(o=>o.localOrdinal===2?{...o,layer:'landscape'}:o.localOrdinal===3?{...o,layer:'ground'}:o)};
  const shape=map.shapes['100:8'];
  const result=savedDraftOverlap(map,map.objects[0],shape,0,1);
  assert.deepEqual(result.runs,[{x:1,y:1,width:1,evidence:'landscape-overlap'}]);
  assert.equal(result.counts['landscape-overlap'],1);
  assert.deepEqual(result.relatedOrdinals,[2]);
  assert.equal(result.unresolvedObjects,1);
  const other=savedDraftOverlap(map,map.objects[0],shape,2,1);
  assert.equal(other.counts['landscape-overlap'],1);
  assert.equal(other.counts['ground-overlap'],1);
  assert.equal(savedDraftOverlap(map,map.objects[0],shape,0,0).runs.length,0);
  const surface={...map,objects:map.objects.map(o=>o.localOrdinal===2?{...o,layer:'furniture',surfaceCapable:true}:o)};
  assert.equal(savedDraftOverlap(surface,surface.objects[0],shape,0,1).counts['support-unknown'],1);
  const overlap={...map,objects:map.objects.map(o=>o.localOrdinal===2?{...o,layer:'furniture'}:o)};
  assert.equal(savedDraftOverlap(overlap,overlap.objects[0],shape,0,1).counts['shape-overlap'],1);
});

test('exclusive anchor feedback matches type arithmetic even for unrenderable peers',()=>{
  const road={localOrdinal:1,localGridOrdinal:1,itemId:'40100001',x:0,y:0,orientation:null,layer:'ground',shapeKey:null};
  const peer={...road,localOrdinal:2,itemId:'40100002',x:2,y:1,layer:'other'};
  const fence={...road,localOrdinal:3,itemId:'40700001',x:3,y:1,layer:'fence'};
  const otherGrid={...road,localOrdinal:4,localGridOrdinal:2,x:4,y:1};
  const furniture={...road,localOrdinal:5,itemId:'40000001',x:5,y:1,layer:'furniture'};
  const map={objects:[road,peer,fence,otherGrid,furniture]};
  assert.equal(exclusiveAnchorClass('50100001'),null);
  assert.equal(exclusiveAnchorConflict(map,road,2,1),true);
  assert.equal(exclusiveAnchorConflict(map,road,3,1),false);
  assert.equal(exclusiveAnchorConflict(map,road,4,1),false);
  assert.equal(exclusiveAnchorConflict(map,road,5,1),false);
  assert.equal(exclusiveAnchorConflict(map,furniture,2,1),false);
  assert.equal(exclusiveAnchorConflict(map,road,0,0),false);
});

test('stage multiple moves, re-edit original expected values, undo and redo with warning',()=>{
  const p=(localOrdinal,x,y)=>({localOrdinal,localGridOrdinal:1,x,y,orientation:'GridOrientation_Down',itemId:'100'});
  const m=buildSavedShapeMap(fixture(),L,7,[p(1,0,0),p(2,8,8)]);
  const t1=stageWorldEdit(m,emptyWorldTimeline(),1,1,2,'GridOrientation_Down','景観');
  assert.equal(currentWorldEdits(t1)[0].warning,'景観');
  const t2=stageWorldEdit(m,t1,2,3,4,'GridOrientation_Right','');
  assert.equal(currentWorldEdits(t2).length,2);
  assert.deepEqual(projectWorldEdits(m,currentWorldEdits(t2)).objects.map(o=>[o.x,o.y]),[[1,2],[3,4]]);
  const t3=stageWorldEdit(m,t2,1,5,6,'GridOrientation_Down','重なり');
  assert.equal(currentWorldEdits(t3).length,2);
  const p3=currentWorldEdits(t3).find(e=>e.plan.localOrdinal===1).plan;
  assert.deepEqual([p3.expectedX,p3.expectedY,p3.replacementX,p3.replacementY],[0,0,5,6]);
  assert.equal(currentWorldEdits(travelWorldTimeline(t3,-1))[0].warning,'景観');
  assert.equal(currentWorldEdits(travelWorldTimeline(travelWorldTimeline(t3,-1),1)).find(e=>e.plan.localOrdinal===1).warning,'重なり');
  const reverted=stageWorldEdit(m,t3,1,0,0,'GridOrientation_Down','');
  assert.equal(currentWorldEdits(reverted).length,1);
  assert.equal(m.objects[0].x,0);
});

test('one Save timeline spans multiple Grid receipts, rejects stale local identity, exceeds previous cap',()=>{
  const point=(localOrdinal,localGridOrdinal,x)=>({localOrdinal,localGridOrdinal,x,y:0,orientation:'GridOrientation_Down',itemId:'100'});
  const first=buildSavedShapeMap(fixture(),L,7,Array.from({length:20},(_,i)=>point(i+1,1,i*4)));
  const second=buildSavedShapeMap(fixture(),L,7,[point(21,2,3)]);
  let t=emptyWorldTimeline();
  for(const o of first.objects){t=stageWorldEdit(first,t,o.localOrdinal,o.x+1,0,o.orientation,'');assert.ok(t);}
  t=stageWorldEdit(second,t,21,4,0,'GridOrientation_Down','景観');
  assert.equal(currentWorldEdits(t).length,21);
  assert.equal(projectWorldEdits(first,currentWorldEdits(t)).objects[19].x,77);
  assert.equal(projectWorldEdits(second,currentWorldEdits(t)).objects[0].x,4);
  const stale={...second,objects:[{...second.objects[0],x:99}]};
  assert.equal(projectWorldEdits(stale,currentWorldEdits(t)).objects[0].x,99);
  assert.equal(stageWorldEdit(stale,t,21,100,0,'GridOrientation_Down',''),null);
  assert.equal(currentWorldEdits(travelWorldTimeline(t,-1)).length,20);
});

test('map camera zooms about cursor, clamps pan, and supports large Grid magnification',()=>{
  const full=defaultMapCamera();
  const c=zoomMapCamera(full,2,64,.25,.75);
  assert.deepEqual(c,{zoom:2,x:.375,y:.625});
  const extent={x:-10,y:20,w:100,h:80};
  assert.equal(mapCameraViewBox(c,extent),'2.5 50 50 40');
  assert.deepEqual(panMapCamera(c,-20,20),{zoom:2,x:.25,y:.75});
  assert.deepEqual(zoomMapCamera(c,1,64),full);
  assert.equal(maxMapZoom(8192),1024);
  assert.equal(maxMapZoom(16),64);
});

test('placed-object search uses exact localized names with source fallback and focuses geometry',()=>{
  const p=(localOrdinal,x,y,itemId='100')=>({localOrdinal,localGridOrdinal:1,x,y,orientation:'GridOrientation_Down',itemId});
  const map=buildSavedShapeMap(fixture(),L,7,[p(1,10,20),p(2,30,40,'999')]);
  const names=new Map([[100,'テーブル']]);
  assert.equal(worldObjectName(map.objects[0],names),'テーブル');
  assert.deepEqual(searchSavedObjects(map.objects,names,'ﾃｰﾌﾞﾙ','all').map(o=>o.localOrdinal),[1]);
  assert.deepEqual(searchSavedObjects(map.objects,names,'999','all').map(o=>o.localOrdinal),[2]);
  assert.equal(searchSavedObjects(map.objects,names,'テーブル','fence').length,0);
  const c=objectFocus(map,map.objects[0],{x:0,y:0,w:100,h:100},64);
  assert.equal(c.zoom,12.5);
  assert.equal(c.x,.11);assert.equal(c.y,.205);
});
