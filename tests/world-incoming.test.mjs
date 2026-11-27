import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogHandoff,catalogPlacementCandidate,catalogPlacementFile,presetHandoff,incomingMatches} from '../src/lib/world/world-incoming.ts';
import {parseSceneAnyFactor} from '../src/lib/world/scene-preset.ts';
test('moodboard is a candidate list, not an invented layout',async()=>{
 const q=catalogHandoff([{itemId:40000001,name:'A'},{itemId:40000002,name:'B'},{itemId:40000001,name:'duplicate'},{itemId:-1,name:'invalid'}]);
 assert.equal(q.type,'catalog');assert.equal(q.items.length,2);
 const scene=parseSceneAnyFactor(await catalogPlacementFile(q.items[1]).text());
 assert.deepEqual(scene.items,[{itemId:40000002,dx:0,dy:0,orientation:2}]);
 assert.equal(incomingMatches(q,['wand.preset.scene@1']),true);
 assert.equal(incomingMatches(q,['wand.preset.scene@1'],['room']),false);
 assert.equal(catalogPlacementCandidate({itemId:40000001,nativeCategory:'Furniture',subtype:0}),true);
 assert.equal(catalogPlacementCandidate({itemId:40000001,nativeCategory:'Furniture',subtype:7}),false);
});
test('private native backups do not enter the world editor handoff',()=>{
 const entry={id:1,name:'example',schema:'wand.preset.indoor-decoration@1',kind:'floor',domain:'wand',privateBackup:false};
 const pending=presetHandoff(entry);assert.ok(pending);assert.equal(incomingMatches(pending,[entry.schema],['floor']),true);assert.equal(incomingMatches(pending,[entry.schema],['room']),false);
 assert.equal(presetHandoff({...entry,privateBackup:true}),null);
 assert.equal(presetHandoff({...entry,domain:'game'}),null);
});
