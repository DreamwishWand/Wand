import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceMapLayer,sourceSurfaceCapable,matchesSelectionLayer,mapPainterOrder,prioritizeMapHits} from '../src/lib/world/source-map-layers.ts';
import {draftSavedMapTransform,worldTransformEligible} from '../src/lib/world/saved-map-transform.ts';
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

test('map transform creates existing Rust mixed plan; road and fence remain disabled',()=>{
  const o={localOrdinal:3,localGridOrdinal:1,itemId:'40000001',x:2,y:3,orientation:'GridOrientation_Up',shapeKey:'40000001:0',layer:'furniture',surfaceCapable:false};
  assert.deepEqual(draftSavedMapTransform(o,-4,8,'GridOrientation_Right'),{localOrdinal:3,itemId:'40000001',recordKind:'full',expectedX:2,expectedY:3,replacementX:-4,replacementY:8,expectedOrientation:'GridOrientation_Up',replacementOrientation:'GridOrientation_Right'});
  assert.equal(draftSavedMapTransform(o,2,3,o.orientation),null);
  assert.equal(draftSavedMapTransform(o,2147483648,3,o.orientation),null);
  assert.equal(draftSavedMapTransform(o,2,3,'West'),null);
  assert.equal(worldTransformEligible({...o,layer:'ground'}),false);
  assert.equal(worldTransformEligible({...o,layer:'fence'}),false);
  assert.equal(worldTransformEligible({...o,shapeKey:null}),false);
});
