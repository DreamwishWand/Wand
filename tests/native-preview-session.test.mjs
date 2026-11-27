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

test('mounted workspace sees replacement and release without reopening or rebuilding the provider',()=>{
 const s=createNativePreviewSession(),observed=[],other=[];
 const pack={maps:[],source:async()=>{throw Error('not needed')}};
 const stop=s.subscribe(p=>observed.push(p));
 s.set(pack);s.set(pack);
 const unmount=s.subscribe(p=>other.push(p));
 assert.equal(other[0],pack);
 const replacement={...pack,maps:[{id:'MapVillage04'}]};
 s.set(replacement);assert.equal(other[1].source,pack.source);
 unmount();s.clear();s.clear();stop();s.set(pack);
 assert.deepEqual(observed,[null,pack,replacement,null]);
 assert.deepEqual(other,[pack,replacement]);
});
