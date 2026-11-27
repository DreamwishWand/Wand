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
