import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceMapLayer,sourceSurfaceCapable,matchesSelectionLayer,mapPainterOrder,prioritizeMapHits} from '../src/lib/world/source-map-layers.ts';
import {worldObjectName,searchSavedObjects,objectFocus} from '../src/lib/world/world-object-search.ts';
import {defaultMapCamera,maxMapZoom,zoomMapCamera,panMapCamera,mapCameraViewBox,mapViewportBounds} from '../src/lib/world/map-camera.ts';
import {emptyWorldTimeline,currentWorldEdits,projectWorldEdits,stageWorldEdit,travelWorldTimeline} from '../src/lib/world/saved-map-batch.ts';
import {savedDraftOverlap} from '../src/lib/world/saved-draft-overlap.ts';
import {draftSavedMapTransform,worldTransformEligible,exclusiveAnchorClass,exclusiveAnchorConflict} from '../src/lib/world/saved-map-transform.ts';
import {buildSavedShapeMap,savedGridObjects,savedShapesAt,visibleSavedObjects} from '../src/lib/world/saved-shape-map.ts';
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

test('saved viewport retains partially visible footprints, overscan and selection without filtering search',()=>{
  const p=(localOrdinal,x,y,itemId='100')=>({localOrdinal,localGridOrdinal:1,x,y,orientation:'GridOrientation_Down',itemId});
  const m=buildSavedShapeMap(fixture(),L,7,[p(1,8,10),p(2,12,12),p(3,35,35),p(4,40,40,'999'),p(5,14,13,'999')]);
  const view=mapViewportBounds({zoom:4,x:.375,y:.375},{x:0,y:0,w:40,h:40});
  assert.deepEqual(view,{x:10,y:10,w:10,h:10});
  assert.deepEqual(visibleSavedObjects(m.objects,m.shapes,view,4).map(o=>o.localOrdinal),[1,2,4,5]);
  assert.deepEqual(visibleSavedObjects(m.objects,m.shapes,view,null).map(o=>o.localOrdinal),[1,2,5]);
  assert.equal(searchSavedObjects(m.objects,new Map(),'','all').length,5);
  assert.equal(savedShapesAt(m,1,35,35)[0].localOrdinal,3);
});

import {stageWorldGroupMove} from '../src/lib/world/saved-map-batch.ts';
test('group translation applies final exclusive anchors atomically and one undo restores every member',()=>{
 const p=(id,x,grid=1)=>({localOrdinal:id,localGridOrdinal:grid,x,y:0,itemId:'40100001',orientation:null,shapeKey:null,layer:'ground',surfaceCapable:false,name:'Road'});
 const map={objects:[p(1,0),p(2,1),p(3,4),p(4,2,2)],shapes:{}};
 const t=emptyWorldTimeline(),a=stageWorldGroupMove(map,t,[1,2],1,0,'');
 assert.ok(a);
 assert.equal(a.snapshots.length,2);
 assert.deepEqual(projectWorldEdits(map,currentWorldEdits(a)).objects.map(o=>o.x),[1,2,4,2]);
 assert.equal(currentWorldEdits(travelWorldTimeline(a,-1)).length,0);
 assert.equal(stageWorldGroupMove(map,a,[1,2],2,0,''),null);
 assert.equal(stageWorldGroupMove(map,t,[1,4],1,0,''),null);
 assert.equal(stageWorldGroupMove(map,t,[1,1],1,0,''),null);
 assert.equal(stageWorldGroupMove(map,t,[1,2],2147483648,0,''),null);
 const locked={...map,objects:map.objects.map(o=>o.localOrdinal===2?{...o,editRestrictions:{move:'denied'}}:o)};
 assert.equal(stageWorldGroupMove(locked,t,[1,2],1,0,''),null);
 const back=stageWorldGroupMove(map,a,[1,2],-1,0,'');
 assert.ok(back);assert.equal(currentWorldEdits(back).length,0);
});

import {groupTargets} from '../src/lib/world/saved-map-batch.ts';
test('group rotation uses native cardinal direction and rotated bounding dimensions, preserves atomic undo',()=>{
 const p=(localOrdinal,x,y)=>({localOrdinal,localGridOrdinal:1,x,y,orientation:'GridOrientation_Down',itemId:'100'});
 const m=buildSavedShapeMap(fixture(),L,7,[p(1,2,3),p(2,8,6)]);
 const a=m.objects[0],b=m.objects[1],s=m.shapes[a.shapeKey];
 const targets=groupTargets(m,[a,b],0,0,1);
 assert.ok(targets);
 assert.deepEqual(targets.map(o=>o.orientation),['GridOrientation_Right','GridOrientation_Right']);
 assert.deepEqual(targets.map(o=>[o.x,o.y]),[[5,3],[2,9]]);
 assert.equal(m.shapes[targets[0].shapeKey].width,s.height);
 const t=stageWorldGroupMove(m,emptyWorldTimeline(),[1,2],0,0,'',1);
 assert.ok(t);assert.equal(currentWorldEdits(t).length,2);
 assert.equal(currentWorldEdits(travelWorldTimeline(t,-1)).length,0);
 const rotated=projectWorldEdits(m,currentWorldEdits(t));
 const back=groupTargets(rotated,rotated.objects,0,0,3);
 assert.deepEqual(back.map(o=>[o.x,o.y,o.orientation]),[[2,3,'GridOrientation_Down'],[8,6,'GridOrientation_Down']]);
 assert.equal(groupTargets(m,[a,{...b,editRestrictions:{rotate:'denied'}}],0,0,1),null);
});

import {emptyDesign,currentDesign,placeDesign,transformDesign,removeDesign,travelDesign,designShapeMap} from '../src/lib/world/design-layout.ts';
test('independent decoration design retains unique local IDs and reversible changes',()=>{
 const shape={width:2,height:1,runs:[{x:0,y:0,width:2}],cellCount:2,path:'M0 0h2v1h-2Z'};
 const g={itemId:40000001,name:'Furniture',layer:'furniture',surfaceCapable:false,shapes:{'40000001:8':shape,'40000001:4':{...shape,width:1,height:2}}};
 let t=emptyDesign();
 t=placeDesign(t,g,1,2,2,10,10);assert.ok(t);
 t=placeDesign(t,g,4,2,2,10,10);assert.ok(t);
 assert.deepEqual(currentDesign(t).map(o=>o.id),[1,2]);
 const moved=transformDesign(t,1,g,3,3,1,10,10);assert.ok(moved);
 assert.deepEqual(currentDesign(moved)[0],{id:1,itemId:40000001,x:3,y:3,orientation:1});
 assert.deepEqual(currentDesign(travelDesign(moved,-1)),currentDesign(t));
 const removed=removeDesign(moved,1,g);assert.equal(currentDesign(removed).length,1);
 const again=placeDesign(removed,g,2,2,2,10,10);assert.equal(currentDesign(again).at(-1).id,3);
 assert.equal(placeDesign(t,g,9,0,2,10,10),null);
 assert.equal(transformDesign(t,1,{...g,editRestrictions:{move:'denied'}},2,3,2,10,10),null);
 const map=designShapeMap(currentDesign(t),new Map([[g.itemId,g]]),{layoutId:'L',gridIdNative:1,gridDataPath:'D',factor:1});
 assert.equal(map.objects.length,2);assert.equal(map.objects[0].shapeKey,'40000001:8');
 const road={...g,itemId:40100001,layer:'ground',shapes:{'40100001:8':shape}};
 const r=placeDesign(emptyDesign(),road,0,0,2,10,10);
 assert.equal(placeDesign(r,road,0,0,2,10,10),null);
});

import {serializeDesign,parseDesign,restoreDesign,designItemCounts} from '../src/lib/world/design-layout.ts';
test('local design file round trip, exact grid identity, current geometry, atomic undo and item counts',()=>{
 const grid={key:'Meadow',layoutId:'L',gridDataPath:'D',gridIdNative:1,sizeX:10,sizeY:10,factor:1};
 const shape={width:2,height:1,runs:[{x:0,y:0,width:2}],cellCount:2,path:'M0 0h2v1h-2Z'};
 const g={itemId:40000001,name:'Furniture',layer:'furniture',surfaceCapable:false,shapes:{'40000001:8':shape}};
 const defs=new Map([[g.itemId,g]]);
 let original=placeDesign(emptyDesign(),g,1,2,2,10,10);
 original=placeDesign(original,g,4,2,2,10,10);
 const doc=serializeDesign(original,grid);
 const parsed=parseDesign(doc,grid);
 assert.deepEqual(parsed,currentDesign(original));
 assert.deepEqual([...designItemCounts(parsed)],[[40000001,2]]);
 assert.throws(()=>parseDesign(doc,{...grid,factor:2}),/MISMATCH/);
 assert.throws(()=>parseDesign(doc,{...grid,key:'Other'}),/MISMATCH/);
 assert.throws(()=>parseDesign(JSON.stringify({...JSON.parse(doc),placements:[parsed[0],parsed[0]]}),grid),/INVALID/);
 assert.equal(restoreDesign(emptyDesign(),parsed,new Map(),10,10),null);
 assert.equal(restoreDesign(emptyDesign(),[{...parsed[0],x:9}],defs,10,10),null);
 const previous=placeDesign(emptyDesign(),g,0,0,2,10,10);
 const restored=restoreDesign(previous,parsed,defs,10,10);
 assert.deepEqual(currentDesign(restored),parsed);
 assert.deepEqual(currentDesign(travelDesign(restored,-1)),currentDesign(previous));
 assert.equal(currentDesign(placeDesign(restored,g,6,2,2,10,10)).at(-1).id,3);
 const road={...g,itemId:40100001,layer:'ground',shapes:{'40100001:8':shape}};
 assert.equal(restoreDesign(emptyDesign(),parsed.map(p=>({...p,itemId:road.itemId,x:0,y:0})),new Map([[road.itemId,road]]),10,10),null);
});

import {designClipboard,pasteDesign,removeDesignGroup,transformDesignGroup} from '../src/lib/world/design-layout.ts';
import {worldShortcut} from '../src/lib/world/world-shortcuts.ts';
test('desktop shortcut mapping accepts Control and Command without swallowing unrelated modifiers or IME',()=>{
 const key=(key,more={})=>worldShortcut({key,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,isComposing:false,repeat:false,...more});
 for(const modifier of ['ctrlKey','metaKey']){
  for(const [k,a] of [['c','copy'],['x','cut'],['v','paste'],['d','duplicate'],['a','select-all'],['z','undo'],['y','redo']])assert.equal(key(k,{[modifier]:true}),a);
  assert.equal(key('Z',{[modifier]:true,shiftKey:true}),'redo');
 }
 assert.equal(key('Backspace'),'delete');assert.equal(key('ArrowLeft'),'left');assert.equal(key('+',{shiftKey:true}),'zoom-in');
 assert.equal(key('c',{ctrlKey:true,isComposing:true}),null);assert.equal(key('c',{ctrlKey:true,altKey:true}),null);assert.equal(key('w',{metaKey:true}),null);
 assert.equal(key('z',{ctrlKey:true,repeat:true}),null);assert.equal(key('r',{ctrlKey:true}),null);
});
test('copy/paste and cut preserve relative coordinates and orientations with atomic group history',()=>{
 const shape={width:2,height:1,runs:[{x:0,y:0,width:2}],cellCount:2,path:'M0 0h2v1h-2Z'};
 const g={itemId:40000001,name:'Furniture',layer:'furniture',surfaceCapable:false,shapes:{'40000001:8':shape,'40000001:4':{...shape,width:1,height:2}}};
 const defs=new Map([[g.itemId,g]]);let t=placeDesign(emptyDesign(),g,1,2,2,20,20);t=placeDesign(t,g,4,3,1,20,20);
 const clip=designClipboard(t,[1,2]);assert.deepEqual(clip.map(p=>[p.dx,p.dy,p.orientation]),[[0,0,2],[3,1,1]]);
 const pasted=pasteDesign(t,clip,defs,10,10,20,20);assert.ok(pasted);
 assert.deepEqual(currentDesign(pasted).slice(2).map(p=>[p.id,p.x,p.y,p.orientation]),[[3,10,10,2],[4,13,11,1]]);
 assert.deepEqual(currentDesign(travelDesign(pasted,-1)),currentDesign(t));assert.equal(pasteDesign(t,clip,defs,19,19,20,20),null);
 const cut=removeDesignGroup(pasted,[3,4],defs);assert.deepEqual(currentDesign(cut),currentDesign(t));
 assert.equal(removeDesignGroup(t,[1,2],new Map([[g.itemId,{...g,editRestrictions:{remove:'denied'}}]])),null);
 const moved=transformDesignGroup(t,[1,2],defs,1,1,0,20,20);assert.deepEqual(currentDesign(moved).map(p=>[p.x,p.y]),[[2,3],[5,4]]);
 assert.deepEqual(currentDesign(travelDesign(moved,-1)),currentDesign(t));
});

import {savedShapesInRect} from '../src/lib/world/saved-shape-map.ts';
test('marquee selects occupied runs even if the anchor is outside and excludes holes',()=>{
 const shape={runs:[{x:0,y:0,width:2},{x:2,y:1,width:1}],width:3,height:2};
 const o={localOrdinal:1,localGridOrdinal:1,x:4,y:5,shapeKey:'s'};
 const map={objects:[o,{...o,localOrdinal:2,localGridOrdinal:2}],shapes:{s:shape}};
 assert.deepEqual(savedShapesInRect(map,1,{x:6,y:6},{x:6,y:6}).map(o=>o.localOrdinal),[1]);
 assert.deepEqual(savedShapesInRect(map,1,{x:4,y:6},{x:5,y:6}),[]);
});

import {createWorldArtworkLookup,mapCellPixels,showWorldArtwork,visibleWorldArtworkIds} from '../src/lib/world/world-artwork.ts';
test('world map artwork reuses public image identity and existing historical collection mapping; no guessed URLs',async()=>{
 let reads=0,lookups=0;
 const path='ddv/game-thumbnails/r39/ab/'+'ab'.repeat(32)+'.webp';
 const lookup=createWorldArtworkLookup('/Wand',async url=>{reads++;assert.equal(url,'/Wand/ddv/collection/item-images-r39.json');return new Response(JSON.stringify({schema:'wand.collection.item-images.r39@1',items:{'40000002':path,'40000003':'https://example.com/unverified.webp'}}));},async id=>{lookups++;return id===40000001?{url:'https://images.example.test/verified.webp'}:null;});
 assert.equal(await lookup(40000001),'https://images.example.test/verified.webp');
 assert.match(await lookup(40005160),/461f6484256c69e5a528adc3af7054301841fc324c237d8bc0d4534830345bec\.webp$/);
 assert.equal(reads,0);
 assert.deepEqual(await Promise.all([lookup(40000002),lookup(40000002),lookup(40000003)]),['/Wand/'+path,'/Wand/'+path,null]);
 assert.equal(reads,1);assert.equal(lookups,4);
 assert.equal(await lookup(-1),null);
});
test('world thumbnails depend on on-screen footprint size and do not hide infrastructure',()=>{
 const shape={width:2,height:3},o={layer:'furniture',shapeKey:'a',itemId:'40000001'};
 assert.equal(mapCellPixels({x:0,y:0,w:100,h:50},800,300),6);
 assert.equal(showWorldArtwork(o,shape,6),false);assert.equal(showWorldArtwork(o,shape,7),true);
 assert.equal(showWorldArtwork({...o,layer:'ground'},shape,100),false);
 assert.equal(showWorldArtwork({...o,layer:'fence'},shape,100),false);
 assert.deepEqual(visibleWorldArtworkIds([o,o,{...o,itemId:'40000002',layer:'fence'}],{a:shape},7),[40000001]);
});

import {alignmentTargets} from '../src/lib/world/map-alignment.ts';
import {alignDesign} from '../src/lib/world/design-layout.ts';
import {stageWorldAlignment} from '../src/lib/world/saved-map-batch.ts';
test('alignment/distribution uses occupied-cell edges, preserves orientations and commits atomically',()=>{
 const narrow={width:3,height:2,runs:[{x:1,y:0,width:1},{x:1,y:1,width:2}],cellCount:3,path:'M1 0h1v1h-1ZM1 1h2v1h-2Z'};
 const wide={width:4,height:2,runs:[{x:0,y:0,width:4},{x:0,y:1,width:4}],cellCount:8,path:'M0 0h4v2h-4Z'};
 const a={itemId:40000001,name:'A',layer:'furniture',surfaceCapable:false,shapes:{'40000001:8':narrow}};
 const b={itemId:40000002,name:'B',layer:'furniture',surfaceCapable:false,shapes:{'40000002:8':wide}};
 const defs=new Map([[a.itemId,a],[b.itemId,b]]);
 let t=placeDesign(emptyDesign(),a,1,1,2,40,40);t=placeDesign(t,b,8,6,2,40,40);t=placeDesign(t,a,17,10,2,40,40);
 const m=designShapeMap(currentDesign(t),defs,{layoutId:'L',gridIdNative:1,gridDataPath:'D',factor:1});
 const left=alignmentTargets(m,m.objects,'left');assert.deepEqual(left.map(o=>o.x),[1,2,1]);
 const next=alignDesign(t,m,[1,2,3],defs,'left',40,40);assert.ok(next);assert.deepEqual(currentDesign(next).map(p=>p.x),[1,2,1]);
 assert.deepEqual(currentDesign(travelDesign(next,-1)),currentDesign(t));
 // First occupied edge is 2, last right edge 20, total width 8; gap 5.
 const even=alignmentTargets(m,m.objects,'distribute-x');assert.deepEqual(even.map(o=>o.x),[1,9,17]);
 const staged=stageWorldAlignment(m,emptyWorldTimeline(),[1,2,3],'left','');assert.ok(staged);
 assert.equal(currentWorldEdits(staged).length,2);
 assert.deepEqual(projectWorldEdits(m,currentWorldEdits(staged)).objects.map(o=>o.x),[1,2,1]);
 assert.equal(currentWorldEdits(travelWorldTimeline(staged,-1)).length,0);
 assert.equal(alignmentTargets(m,[m.objects[0],{...m.objects[1],subgrid:{}}],'left'),null);
 assert.equal(alignmentTargets(m,[m.objects[0],{...m.objects[1],localGridOrdinal:2}],'left'),null);
 assert.equal(alignmentTargets(m,m.objects.slice(0,2),'distribute-x'),null);
 const odd={...m,objects:m.objects.map(o=>o.localOrdinal===3?{...o,x:o.x+1}:o)};
 assert.equal(alignmentTargets(odd,odd.objects,'distribute-x'),null);
});

import {defaultWorldLayers,toggleWorldLayer,worldLayer,layerVisible,layerSelectable} from '../src/lib/world/world-layer-state.ts';
test('map layer visibility and edit lock remain independent and buildings use native identity',()=>{
 const road={layer:'ground'},furniture={layer:'furniture'},building={layer:'other',nativeType:'Building'},fixed={layer:'furniture',editRestrictions:{select:'denied'}};
 let state=toggleWorldLayer(defaultWorldLayers(),'ground','locked');
 assert.equal(layerVisible(state,road),true);assert.equal(layerSelectable(state,road),false);
 state=toggleWorldLayer(state,'ground','hidden');assert.equal(layerVisible(state,road),false);
 state=toggleWorldLayer(state,'ground','hidden');assert.equal(layerVisible(state,road),true);assert.equal(layerSelectable(state,road),false);
 assert.equal(layerSelectable(state,furniture),true);assert.equal(worldLayer(building),'building');assert.equal(worldLayer(fixed),'fixed');
 assert.equal(worldLayer({layer:'other'}),'other');
});
