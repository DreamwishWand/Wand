import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeLandmarkMeasurement,nativeLandmarkReport} from '../src/lib/media/native-map-landmark.ts';
const map={id:'MapVillage04',width:100,height:100,ticksToCanvas:[4,0,0,4,40,40],locked:[],unlocked:[]};
test('precise click retains fractional ticks and correct world Z sign',()=>{
 const p={x:1.25,y:-2.5};
 assert.deepEqual(nativeLandmarkMeasurement(map,p),{editorTicks:[1.25,-2.5],canvasPixels:[45,30],candidateWorldXZ:[.625,1.25]});
 const m=nativeLandmarkMeasurement(map,{...p,worldXZ:[.5,1],reference:'fixture'});
 assert.deepEqual(m.residualPixels,[1,-2]);assert.deepEqual(m.residualHalfWorldTicks,[.25,-.5]);
 assert.throws(()=>nativeLandmarkMeasurement(map,{...p,worldXZ:[0,0]}));
 assert.throws(()=>nativeLandmarkMeasurement(map,{x:100,y:0}));
});
test('private report fingerprints plan and never promotes a measurement to verification',async()=>{
 const r=await nativeLandmarkReport(map,false,[{x:0,y:0,worldXZ:[0,0],reference:'fixture'}]);
 assert.equal(r.worldPlacementVerified,false);assert.equal(r.publicationAuthorized,false);assert.equal(r.runtimeMarkerAnchorVerified,false);
 assert.match(r.mapPlanSha256,/^[a-f0-9]{64}$/);assert.equal(r.measurements[0].distanceHalfWorldTicks,0);
});
