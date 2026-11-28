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
