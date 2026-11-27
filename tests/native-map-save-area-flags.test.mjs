import test from 'node:test';
import assert from 'node:assert/strict';
import {savedNativeAreaFlags,explicitSavedPreviewStates} from '../src/lib/media/native-map-save-area-flags.ts';
const d={schema:'wand.db05.saved-area-flags@1',runtimeLockPredicateVerified:false,scenes:{1540000000:{0:true,1:false,2:null,3:'false'},1540000209:{48:true,60:false}}};
test('source scene binding never borrows a different world or interprets missing flags',()=>{
 assert.deepEqual(savedNativeAreaFlags('MapVillage04',[0,1,2,3,4],d).map(r=>r.unlocked),[true,false,null,null,null]);
 assert.deepEqual(savedNativeAreaFlags('MapVillageExpansion4',[48,60],d).map(r=>r.unlocked),[true,false]);
 assert.deepEqual(savedNativeAreaFlags('MapVillageExpansion1',[0,1],d).map(r=>r.unlocked),[null,null]);
 assert.equal(explicitSavedPreviewStates(savedNativeAreaFlags('MapVillage04',[0,1,2],d)),null);
 assert.deepEqual([...explicitSavedPreviewStates(savedNativeAreaFlags('MapVillage04',[0,1],d))],[[0,false],[1,true]]);
 assert.equal(explicitSavedPreviewStates(savedNativeAreaFlags('MapVillage04',[0,0],d)),null);
});
