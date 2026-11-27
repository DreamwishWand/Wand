import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSavedAvatarAppearance,savedBodyPreference} from '../src/lib/photo-mode/saved-avatar-appearance.ts';
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
