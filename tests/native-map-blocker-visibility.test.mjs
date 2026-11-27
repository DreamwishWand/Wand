import test from 'node:test';
import assert from 'node:assert/strict';
import {selectNativeBackgroundLayers} from '../src/lib/media/native-map-blocker-visibility.ts';
const normal={blockerAreaTypes:[],name:'normal'};
const divider={blockerAreaTypes:[60],name:'divider'};
test('area blockers require explicit lock state and preserve order',()=>{
 assert.deepEqual(selectNativeBackgroundLayers([normal,divider],new Map([[60,true]])),[normal,divider]);
 assert.deepEqual(selectNativeBackgroundLayers([normal,divider],new Map([[60,false]])),[normal]);
 assert.throws(()=>selectNativeBackgroundLayers([normal,divider],new Map()));
 assert.throws(()=>selectNativeBackgroundLayers([{blockerAreaTypes:[60,61]}],new Map([[60,false]])));
});
