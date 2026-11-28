import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSavedAvatarAppearance,savedBodyPreference,selectAppearanceOption} from '../src/lib/photo-mode/saved-avatar-appearance.ts';
const value={contract:'wand.avatar.raw-appearance@1',saveSchema:643,status:'observed',activeIsMale:false,avatars:{female:{BodyType:0,Clothes:{'0':0,'19':50000001},Eyeball:{EyeballItemID:70000010,ColorIndex2:-1},Name:'PRIVATE'},femaleMermaid:{Form:1}},saveFileModified:false,renderVerified:false};
test('bounded appearance reads explicit values and ignores unrelated fields',()=>{
 const r=sanitizeSavedAvatarAppearance(value);assert.equal(savedBodyPreference(r),'female');assert.equal(r.avatars.female.BodyType,0);assert.equal(r.avatars.female.Clothes['19'],50000001);assert.equal(r.avatars.female.Eyeball.ColorIndex2,-1);assert.equal(r.avatars.female.Name,undefined);assert.equal(r.avatars.female.HairColorIndex,undefined);assert.ok(Object.isFrozen(r.avatars.female.Clothes));assert.equal(r.renderVerified,false);
});
test('missing body flag is never inferred and malformed fields fail closed',()=>{
 assert.equal(savedBodyPreference(sanitizeSavedAvatarAppearance({...value,activeIsMale:null})),undefined);
 assert.throws(()=>sanitizeSavedAvatarAppearance({...value,avatars:{female:{Clothes:{'01':4}}}}));
 assert.throws(()=>sanitizeSavedAvatarAppearance({...value,saveSchema:644}));
 assert.throws(()=>sanitizeSavedAvatarAppearance({...value,renderVerified:true}));
 assert.equal(savedBodyPreference(undefined),undefined);
});

test('appearance refresh selects a new explicit body but retains a manual comparison for same-body material updates',()=>{
 const male={id:'male'},female={id:'female'},options=[male,female];
 assert.equal(selectAppearanceOption(options,'',undefined,'female'),female);
 assert.equal(selectAppearanceOption(options,'male','female','female'),male);
 assert.equal(selectAppearanceOption(options,'male',undefined,'female'),female);
 assert.equal(selectAppearanceOption(options,'female','female',undefined),female);
 assert.equal(selectAppearanceOption([male],'female','female','female'),male);
 assert.equal(selectAppearanceOption([], 'female',undefined,'female'),undefined);
});
import {validEyePalette,selectEyeMaterial,eyeMaterialKey,projectEyeMask} from '../src/lib/photo-mode/eye-palette.ts';
test('eye mask selection uses the exact item ID and matching form; invalid colors use reference defaults',()=>{
 const colors=Array.from({length:75},(_,i)=>[i/74,0,0,1]);
 const items=Object.fromEntries(Array.from({length:12},(_,i)=>[70000001+i,{texture:{sha256:(i+1).toString(16).padStart(64,'0'),bytes:12},defaults:[4,42,45]}]));
 const p={colors,items,shaderParityVerified:false};
 assert.equal(validEyePalette(p),true);assert.equal(validEyePalette({...p,shaderParityVerified:true}),false);
 const appearance=sanitizeSavedAvatarAppearance({...value,avatars:{female:{Eyeball:{EyeballItemID:70000010,ColorIndex1:0,ColorIndex2:-1,ColorIndex3:74}},femaleMermaid:{Eyeball:{EyeballItemID:70000012,ColorIndex1:1,ColorIndex2:2,ColorIndex3:3}}}});
 const land=selectEyeMaterial(p,appearance,'female',false),water=selectEyeMaterial(p,appearance,'female',true);
 assert.deepEqual(land.indices,[0,42,74]);assert.deepEqual(water.indices,[1,2,3]);assert.equal(land.texture,items[70000010].texture);assert.equal(water.texture,items[70000012].texture);
 assert.equal(selectEyeMaterial(p,appearance,'male',false).texture,items[70000001].texture);assert.notEqual(eyeMaterialKey(land),eyeMaterialKey(water));
 const mask=new Uint8ClampedArray([255,0,0,255,0,128,0,255,0,0,255,255,0,0,0,255]);projectEyeMask(mask,[[.5,0,0,1],[0,1,0,1],[0,0,.25,1]]);assert.deepEqual([...mask],[128,0,0,255,0,128,0,255,0,0,64,255,0,0,0,255]);
});
import {savedFaceChoices,hasFaceMorph,applyFaceMorphs,validFaceMorphs} from '../src/lib/photo-mode/face-morph.ts';
test('face choices select independent native parts for the same saved form',()=>{
 const a=sanitizeSavedAvatarAppearance({...value,avatars:{female:{FaceType:{'0':7,'1':2,'2':3,'3':-1}},femaleMermaid:{FaceType:{'1':4,'3':7}}}});
 assert.deepEqual(savedFaceChoices(a,'female',false),[2,3,0]);assert.deepEqual(savedFaceChoices(a,'female',true),[4,0,7]);assert.deepEqual(savedFaceChoices(a,'male',false),[0,0,0]);
 assert.equal(hasFaceMorph(savedFaceChoices(a,'male',true)),false);
 const row={vertices:2,asset:{sha256:'a'.repeat(64),bytes:140}};assert.equal(validFaceMorphs({male:row,female:row}),true);assert.equal(validFaceMorphs({male:row}),false);
});
test('independent position morphs combine without mutating cached geometry',()=>{
 const bytes=new ArrayBuffer(8+21*4+3*16),v=new DataView(bytes);v.setUint32(0,0x314d4657,true);v.setUint32(4,2,true);let off=8;
 for(let i=0;i<21;i++){const active=[1,9,20].includes(i);v.setUint32(off,Number(active),true);off+=4;if(active){v.setUint32(off,i===20?1:0,true);v.setFloat32(off+4,i===1?.25:i===9?.5:1,true);off+=16}}
 const base=new Float32Array([0,0,0,1,0,0]);assert.deepEqual([...applyFaceMorphs(bytes,base,[2,3,7])],[.75,0,0,2,0,0]);assert.deepEqual([...base],[0,0,0,1,0,0]);assert.throws(()=>applyFaceMorphs(bytes.slice(0,-1),base,[2,3,7]));assert.throws(()=>applyFaceMorphs(bytes,base,[8,0,0]));
});
import {savedHeadIndex,decodeHeadPart,selectHead} from '../src/lib/photo-mode/head-geometry.ts';
test('saved head is selected independently per form and exact model',()=>{
 const a=sanitizeSavedAvatarAppearance({...value,avatars:{female:{FaceType:{'0':7}},femaleMermaid:{FaceType:{'0':0}},male:{FaceType:{'0':8}}}});
 assert.equal(savedHeadIndex(a,'female',false),7);assert.equal(savedHeadIndex(a,'female',true),0);assert.equal(savedHeadIndex(a,'male',false),undefined);
 const head={heads:{female:Array.from({length:8},(_,i)=>({i}))},targets:{abc:{body:'female',index:0,slots:{}}}};
 assert.equal(selectHead(head,'abc','female',7).row.i,7);assert.equal(selectHead(head,'abc','female',0),undefined);assert.equal(selectHead(head,'abc','male',7),undefined);
});
test('head geometry parser preserves independent skin and vertex arrays',()=>{
 const n=1,ic=3,jc=1,b=new ArrayBuffer(16+56*n+2*ic+64*jc),v=new DataView(b);[0x31474857,n,ic,jc].forEach((x,i)=>v.setUint32(4*i,x,true));v.setFloat32(16,1.25,true);v.setFloat32(16+40,1,true);
 const p={vertices:n,indices:ic,jointPaths:['root/x'],asset:{bytes:b.byteLength,sha256:'a'.repeat(64)}};
 const slot={mesh:1,primitive:2},r=decodeHeadPart(b,p,slot);assert.equal(r.positions[0],1.25);assert.deepEqual([...r.indices],[0,0,0]);assert.deepEqual([...r.weights],[1,0,0,0]);assert.equal(r.inverseBind.length,16);r.positions[0]=99;assert.equal(v.getFloat32(16,true),1.25);v.setUint16(16+32,1,true);assert.throws(()=>decodeHeadPart(b,p,slot));
});
import {savedBodyType,applyBodyMorph,validBodyMorphs} from '../src/lib/photo-mode/body-morph.ts';
test('native land body choice is bounded and independent of mermaid shape',()=>{
 const a=sanitizeSavedAvatarAppearance({...value,avatars:{female:{BodyType:5},male:{BodyType:0},femaleMermaid:{BodyType:2}}});
 assert.equal(savedBodyType(a,'female',false),5);assert.equal(savedBodyType(a,'male',false),0);assert.equal(savedBodyType(a,'female',true),undefined);
 const entry={vertices:2,asset:{sha256:'a'.repeat(64),bytes:108}};assert.equal(validBodyMorphs({male:entry,female:entry}),true);assert.equal(validBodyMorphs({male:entry}),false);
 const bytes=new ArrayBuffer(8+5*20),v=new DataView(bytes);v.setUint32(0,0x314d4257,true);v.setUint32(4,2,true);for(let i=0;i<5;i++){const o=8+20*i;v.setUint32(o,1,true);v.setUint32(o+4,0,true);v.setFloat32(o+8,i+1,true)}
 const base=new Float32Array([0,0,0,1,0,0]);assert.deepEqual([...applyBodyMorph(bytes,base,5)],[5,0,0,1,0,0]);assert.deepEqual([...applyBodyMorph(bytes,base,0)],[0,0,0,1,0,0]);assert.deepEqual([...base],[0,0,0,1,0,0]);assert.throws(()=>applyBodyMorph(bytes.slice(0,-1),base,1));
});
