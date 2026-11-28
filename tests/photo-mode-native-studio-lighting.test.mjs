import test from 'node:test';import assert from 'node:assert/strict';
import {nativeStudioProfiles,packStudioProbe,evaluateStudioProbe,studioLightDirection,nativeLightLinear} from '../src/lib/photo-mode/native-studio-lighting.ts';
const near=(a,b)=>{assert.equal(a.length,b.length);assert.ok(a.every((v,i)=>Math.abs(v-b[i])<1e-7),JSON.stringify({a,b}))};
test('stored DayTimeLighting SH matches original 7-vector packing and directional irradiance',()=>{
 const p=packStudioProbe(nativeStudioProfiles.day.probe);assert.equal(p.length,7);
 near(evaluateStudioProbe(p,[0,1,0]),[0.25040993839502335,0.42099596187472343,0.5962131964042783]);
 near(evaluateStudioProbe(p,[0,-1,0]),[0.09667497128248215,0.210391815751791,0.32771385181695223]);
 near(evaluateStudioProbe(p,[0,0,1]),[0.40224742889404297,0.42593933641910553,0.45031761191785336]);
 for(const l of Object.values(nativeStudioProfiles))assert.ok(l.probe.length===27&&evaluateStudioProbe(packStudioProbe(l.probe),[0,1,0]).every(Number.isFinite));
 assert.throws(()=>packStudioProbe([1,2,3]));
});
test('native studio direct light follows the orbit while retaining source HDR magnitude',()=>{
 const l=nativeStudioProfiles.day.lightDirection;
 near(studioLightDirection(l,0,0),[l[0],l[1],-l[2]]);
 near(studioLightDirection(l,Math.PI/2,0),[-l[2],l[1],-l[0]]);
 assert.ok(Math.abs(Math.hypot(...studioLightDirection(l,2,.7))-Math.hypot(...l))<1e-12);
 assert.equal(nativeLightLinear(0),0);assert.equal(nativeLightLinear(1),1);assert.ok(nativeLightLinear(1.14)>1.14);
});
