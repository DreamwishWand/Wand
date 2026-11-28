import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeLandmarkMeasurement,nativeLandmarkReport,nativeLandmarkSessionKey,setNativeLandmarks,nativeLandmarkSessionReport} from '../src/lib/media/native-map-landmark.ts';
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

test('private session retains map and lock state separately with original plan hashes',async()=>{
 const second={...map,id:'MapVillageExpansion1',ticksToCanvas:[3,0,0,3,40,40]};
 const p={x:3,y:4,worldXZ:[0,0],reference:'fixture'};
 let state=setNativeLandmarks(new Map(),map,false,[p]);
 state=setNativeLandmarks(state,map,true,[{x:0,y:0}]);
 state=setNativeLandmarks(state,second,false,[{x:0,y:0,worldXZ:[0,0],reference:'fixture'}]);
 const r=await nativeLandmarkSessionReport([map,second],state);
 assert.equal(r.mapCount,2);assert.equal(r.measurementCount,3);assert.equal(r.referencedCount,2);
 assert.equal(r.maxResidualHalfWorldTicks,5);assert.ok(Math.abs(r.rmsResidualHalfWorldTicks-5/Math.sqrt(2))<1e-10);
 assert.equal(r.worldPlacementVerified,false);assert.equal(r.publicationAuthorized,false);
 assert.deepEqual(r.reports.map(r=>r.state),['unlocked','locked','unlocked']);
 assert.notEqual(r.reports[0].mapPlanSha256,r.reports[2].mapPlanSha256);
 const cleared=setNativeLandmarks(state,map,false,[]);
 assert.equal(cleared.has(nativeLandmarkSessionKey(map.id,false)),false);
 assert.equal(cleared.size,2);assert.equal(state.size,3);
 assert.throws(()=>setNativeLandmarks(state,map,false,[{x:1000,y:1000}]));
 await assert.rejects(nativeLandmarkSessionReport([map],new Map()),/No map measurements/);
});
