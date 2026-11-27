import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativePreviewSession} from '../src/lib/media/native-preview-session.ts';
test('private preview selection survives component remount and can be explicitly released',()=>{
 const s=createNativePreviewSession(),other=createNativePreviewSession();
 const pack={maps:[],source:async()=>{throw Error('unexpected image request')}};
 assert.equal(s.get(),null);
 s.set(pack);assert.equal(s.get(),pack);assert.equal(other.get(),null);
 const replacement={...pack,maps:[{id:'MapVillage04'}]};
 s.set(replacement);assert.equal(s.get(),replacement);
 s.clear();assert.equal(s.get(),null);
});
