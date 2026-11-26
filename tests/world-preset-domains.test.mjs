import test from 'node:test';
import assert from 'node:assert/strict';
import {presetHeader} from '../src/lib/presets/preset-session-format.ts';
import {presetItems} from '../src/lib/presets/preset-items.ts';
test('native backups remain private and codes are unverified',()=>{
 const native={schema:'wand.preset.native-backup@1',gameSchema:643,kind:'tom-furniture',storage:'furniture',baseItemId:40000001,payload:{Id:2,Item:40000001,PlatformAccountId:'PRIVATE'}};
 assert.equal(presetHeader(JSON.stringify(native)).domain,'tom');assert.equal(presetHeader(JSON.stringify(native)).privateBackup,true);
 assert.deepEqual([...presetItems(JSON.stringify(native))],[[40000001,1]]);
 assert.throws(()=>presetHeader(JSON.stringify({...native,storage:'female'})));
 const code={schema:'wand.preset.game-code@1',purpose:'shop',code:'sample',status:'unverified'};
 assert.equal(presetHeader(JSON.stringify(code)).kind,'shop-code');assert.throws(()=>presetHeader(JSON.stringify({...code,status:'verified'})));
});
test('structured counts include known nested surfaces and finishes',()=>{
 const d={schema:'wand.room-design@1',surfaces:[{id:1,design:{schema:'wand.world-design@1',placements:[{itemId:40000001},{itemId:40000001}],roomFinish:160100001}}],selected:1};
 assert.deepEqual([...presetItems(JSON.stringify(d))],[[40000001,2],[160100001,1]]);
});
