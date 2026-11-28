import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeMoodboardBackup,readMoodboardBackup,mergeMoodboardBackup} from '../src/lib/explore/board-backup.ts';
const board={id:'a',name:'Garden',note:'local',groups:[{id:'g',name:'Flowers'}],entries:[{itemId:400001,groupId:'g'}]};
const state={schema:'wand.explore.boards@1',active:'a',boards:[board],favorites:[999]};
test('portable backup excludes profile favorites and preserves ordered board content',()=>{
 const backup=readMoodboardBackup(encodeMoodboardBackup(state,'a'));
 assert.deepEqual(backup.boards,[board]);
 assert.equal(backup.active,'a');
 assert.ok(!('favorites' in backup));
 assert.equal(mergeMoodboardBackup(state,backup,()=>{throw Error('not needed');}).boards.length,1);
});
test('divergent imported board is a copy, not an overwrite',()=>{
 const source={...board,note:'different'};
 const backup=readMoodboardBackup(encodeMoodboardBackup({...state,boards:[source]}));
 const next=mergeMoodboardBackup(state,backup,()=> 'copy');
 assert.deepEqual(next.boards,[board,{...source,id:'copy'}]);
 assert.equal(next.active,'copy');
 assert.deepEqual(next.favorites,[999]);
 assert.throws(()=>mergeMoodboardBackup(state,backup,()=> 'a'));
});
test('invalid backup fails before any state mutation',()=>{
 assert.throws(()=>readMoodboardBackup(JSON.stringify(state)));
 assert.throws(()=>readMoodboardBackup(JSON.stringify({schema:'wand.explore.moodboard-backup@1',active:'a',boards:[{...board,entries:[{itemId:0,groupId:'g'}]}]})));
 assert.throws(()=>readMoodboardBackup(JSON.stringify({schema:'wand.explore.moodboard-backup@1',active:'a',boards:[{...board,entries:[{itemId:400001,groupId:'bad'}]}]})));
 assert.throws(()=>encodeMoodboardBackup(state,'missing'));
});
