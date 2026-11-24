import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSourceObjectMap,sourceObjectsAt,sourceOrientationAngle} from '../src/lib/world/source-object-map.ts';
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
test('do not map incompatible factor or newer unverified version onto raw terrain',()=>{
  assert.equal(buildSourceObjectMap(fixture(2),L,7).status,'incompatible_grid_factor');
  assert.equal(buildSourceObjectMap(fixture(1,'1.27.0'),L,7).status,'unavailable');
});
