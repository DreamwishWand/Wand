import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNativeAreaRules,selectNativeAreaLayers} from '../src/lib/media/native-map-area-rules.ts';
const base={kind:'fill',unitQuadToCanvas:[1,0,0,1,0,0],rgba:[1,1,1,.3]};
const overlay={...base,rgba:[0,0,0,1]};
const locked=[base,overlay],unlocked=[{...base,rgba:[1,1,1,1]}];
const raw={areaTypes:[1,2],areaRules:[{areas:[1],alpha:[1,.3]},{areas:[2],alpha:[null,1]}]};
test('mixed states preserve order and require explicit state',()=>{
 const p=parseNativeAreaRules(raw,locked,unlocked);
 assert.deepEqual(selectNativeAreaLayers(locked,p,new Map([[1,false],[2,true]])),[unlocked[0],overlay]);
 assert.deepEqual(selectNativeAreaLayers(locked,p,new Map([[1,true],[2,false]])),[base]);
 assert.throws(()=>selectNativeAreaLayers(locked,p,new Map([[1,true]])));
 assert.throws(()=>parseNativeAreaRules({...raw,areaRules:[{areas:[1],alpha:[.5,.3]},raw.areaRules[1]]},locked,unlocked));
 assert.throws(()=>parseNativeAreaRules({...raw,areaRules:[{areas:[99],alpha:[1,.3]},raw.areaRules[1]]},locked,unlocked));
});

test('four source grid lock keys have independent overlay states',()=>{
 const locked=[base,...[1,2,3,4].map(()=>overlay)],unlocked=[base];
 const raw={id:'MapVillageExpansion4Underwater02',areaTypes:[1,2,3,4],gridStateLabels:['Pirate1','Pirate2','Pirate3','Pirate4'],areaRules:[{areas:[],alpha:[base.rgba[3]]},...[1,2,3,4].map(id=>({areas:[id],alpha:[null,overlay.rgba[3]]}))]};
 const plan=parseNativeAreaRules(raw,locked,unlocked);
 assert.deepEqual(plan.gridStateLabels,raw.gridStateLabels);
 for(let bits=0;bits<16;bits++){
  const states=new Map(raw.areaTypes.map((id,i)=>[id,Boolean(bits&(1<<i))]));
  assert.equal(selectNativeAreaLayers(locked,plan,states).length,1+[...states.values()].filter(Boolean).length);
 }
 assert.throws(()=>parseNativeAreaRules({...raw,id:'MapVillage04'},locked,unlocked));
 assert.throws(()=>parseNativeAreaRules({...raw,gridStateLabels:['Pirate1','Pirate1','Pirate3','Pirate4']},locked,unlocked));
});
