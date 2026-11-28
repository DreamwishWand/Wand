import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTransitionWitnesses,witnessesForMap} from '../src/lib/media/native-transition-witness.ts';
import {nativeLandmarkMeasurement} from '../src/lib/media/native-map-landmark.ts';
const point={component:'-123',gameObject:'456',name:'Transition',worldXYZ:[2,9,-3],candidateCanvasXY:[56,64],identityAncestors:['1','2']};
const fixture=()=>({schema:'wand.src04.native-map-transition-witnesses@1',privateOnly:true,publicationAuthorized:false,worldPlacementVerified:false,runtimeMarkerAnchorVerified:false,maps:Array.from({length:10},(_,i)=>({prefab:i===0?'MapVillage04':'MapVillageTest'+i,sceneSha256:'a'.repeat(64),sceneCab:'CAB-'+'b'.repeat(32),points:i===0?[structuredClone(point)]:[]}))});
const map={id:'MapVillage04',width:100,height:100,ticksToCanvas:[4,0,0,4,40,40],locked:[],unlocked:[]};
test('source witness imports X/Z and records independent click residual with provenance',()=>{
 const [w]=witnessesForMap(map,parseTransitionWitnesses(fixture()));
 assert.deepEqual(w.worldXZ,[2,-3]);
 assert.match(w.reference,/VillageAreaTransition .* -123$/);
 const m=nativeLandmarkMeasurement(map,{x:4.5,y:5.5,worldXZ:w.worldXZ,reference:w.reference});
 assert.deepEqual(m.residualHalfWorldTicks,[.5,-.5]);
 assert.deepEqual(m.expectedCanvasPixels,[56,64]);
});
test('rejects mismatched candidate basis and out-of-map coordinates',()=>{
 const doc=parseTransitionWitnesses(fixture());
 assert.throws(()=>witnessesForMap({...map,ticksToCanvas:[4,0,0,4,41,40]},doc),/candidate mismatch/);
 assert.throws(()=>witnessesForMap({...map,width:50},doc),/candidate mismatch/);
 assert.deepEqual(witnessesForMap({...map,id:'MapVillageUnknown'},doc),[]);
});
test('rejects duplicate IDs, incomplete coverage, malformed vectors and promoted evidence',()=>{
 for(const mutate of [
  d=>d.maps.pop(),d=>d.maps[1].prefab=d.maps[0].prefab,
  d=>d.maps[0].points.push(structuredClone(point)),
  d=>d.maps[0].points[0].worldXYZ=[0,0,NaN],
  d=>d.maps[0].points[0].component='not-id',
  d=>d.worldPlacementVerified=true,d=>d.publicationAuthorized=true,
 ]){const doc=fixture();mutate(doc);assert.throws(()=>parseTransitionWitnesses(doc));}
});
