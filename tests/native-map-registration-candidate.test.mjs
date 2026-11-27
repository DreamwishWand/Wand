import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeRegistrationCandidate} from '../src/lib/media/native-map-registration-candidate.ts';
import {projectGridEdge} from '../src/lib/world/media-map-calibration.ts';
const basis={cameraXZ:[-2.65,6.5],orthographicSize:98,holderScale:[Math.fround(.39),Math.fround(.39)],holderAnchor:[0,12],rootAnchor:[0,0],rootToCanvas:[1,0,0,-1,2739,2912]};
test('native registration combines camera, holder and root, not extent padding',()=>{
 for(const rootAnchor of [[0,0],[0,-50]]){
  const m=nativeRegistrationCandidate({...basis,rootAnchor});
  assert.equal(m.worldPlacementVerified,false);
  for(const [x,z] of [[0,0],[-167,39],[35,-9],[49,51]])for(const zoom of [.5,1,2,4]){
   const p=projectGridEdge(m.worldXZToCanvas,x,z);
   const q=projectGridEdge(m.halfWorldTicksToCanvas,2*x,-2*z);
   assert.deepEqual(q,p);
   const rx=p.x-basis.rootToCanvas[4],ry=basis.rootToCanvas[5]-p.y;
   const bg=[zoom*(basis.holderScale[0]*(rx+rootAnchor[0])+12*0),zoom*(basis.holderScale[1]*(ry+rootAnchor[1])+12)];
   const marker=[zoom*540/98*(x-basis.cameraXZ[0]),zoom*540/98*(z-basis.cameraXZ[1])];
   assert.ok(bg.every((v,j)=>Math.abs(v-marker[j])<1e-9));
  }
 }
});
test('candidate rejects unsupported or singular source basis',()=>{
 for(const changed of [{orthographicSize:0},{holderScale:[0,1]},{rootToCanvas:[0,1,1,0,0,0]},{cameraXZ:[NaN,0]}])assert.throws(()=>nativeRegistrationCandidate({...basis,...changed}));
});
