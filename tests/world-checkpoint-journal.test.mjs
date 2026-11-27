import test from 'node:test';import assert from 'node:assert/strict';
import {parseReplayStep,parseCheckpointJournal,rememberReplayStep,MAX_REPLAY_STEPS} from '../src/lib/world/checkpoint-journal.ts';
import {appendWorldCheckpoint,commitWorldCheckpoint,travelWorldCheckpoint,restoreWorldCheckpoint,localSaveSession,selectLocalSaveFile,closeLocalSaveFile,registerLocalSaveChangeGuard,WORLD_CHECKPOINT_MAX_STEPS} from '../src/lib/ui/local-save-session.ts';
import {makeSaveSessionDraft,makeCheckpointSaveDraft,parseCheckpointSaveDraft,saveDraftIdentity} from '../src/lib/world/save-session-draft.ts';
import {emptyWorldTimeline} from '../src/lib/world/saved-map-batch.ts';
const f=n=>new File([String(n)],'profile.json');
const step={command:'group-paste-export',plan:[{itemId:'40000001',x:1,y:2,orientation:'GridOrientation_Down'}]};
const tag=file=>rememberReplayStep(file,step.command,step.plan);
test('journal contains only semantic commands and rejects raw data and unsupported commands',()=>{
 assert.deepEqual(parseReplayStep(step),step);
 for(const v of [{...step,file:f(0)},{...step,plan:new Uint8Array(2)},{...step,plan:{data:f(0)}},{...step,command:'inspect-subgrid'},{...step,plan:{constructor:'x'}}])assert.throws(()=>parseReplayStep(v));
 assert.throws(()=>parseCheckpointJournal({steps:[step],cursor:2,firstStep:0}));
 assert.throws(()=>parseCheckpointJournal({steps:[step],cursor:0,firstStep:1}));
 assert.throws(()=>parseCheckpointJournal({steps:Array(MAX_REPLAY_STEPS+1).fill(step),cursor:0,firstStep:0}));
});
test('journal retains evicted prefix and truncates redo on branch',()=>{
 const a=f(0);let h,source=a;
 for(let i=0;i<WORLD_CHECKPOINT_MAX_STEPS+3;i++){const next=f(i+1);tag(next);h=appendWorldCheckpoint(h,source,next);source=next;assert.ok(h.journal);}
 assert.equal(h.journal.steps.length,WORLD_CHECKPOINT_MAX_STEPS+3);
 assert.equal(h.journal.firstStep,3);
 assert.equal(h.journal.cursor,WORLD_CHECKPOINT_MAX_STEPS+3);
 const missing=f('missing');assert.equal(appendWorldCheckpoint(h,source,missing).journal,undefined);
 const release=registerLocalSaveChangeGuard(()=>true);let state;const off=localSaveSession.subscribe(s=>state=s);
 try{assert.ok(selectLocalSaveFile(a));assert.ok(restoreWorldCheckpoint(a,h));assert.ok(travelWorldCheckpoint(source,-1));const branch=f('branch');tag(branch);assert.ok(commitWorldCheckpoint(state.file,branch));assert.equal(state.worldCheckpoint.journal.steps.length,WORLD_CHECKPOINT_MAX_STEPS+3);assert.equal(state.worldCheckpoint.journal.cursor,WORLD_CHECKPOINT_MAX_STEPS+3);assert.equal(travelWorldCheckpoint(branch,1),false);assert.ok(closeLocalSaveFile());}finally{release();off();}
});
test('checkpoint envelope requires exact original fingerprint and source version',()=>{
 const id=saveDraftIdentity('a'.repeat(64),'json'),other=saveDraftIdentity('b'.repeat(64),'json');
 const draft=makeSaveSessionDraft(id,emptyWorldTimeline(),{area:'Urban',overview:true});
 const doc=makeCheckpointSaveDraft(draft,{steps:[step],cursor:1,firstStep:0});
 assert.deepEqual(parseCheckpointSaveDraft(doc,id).journal,doc.journal);
 assert.throws(()=>parseCheckpointSaveDraft(doc,other));
 assert.throws(()=>parseCheckpointSaveDraft(doc,{...id,source:'other'}));
});

test('new house layout is retained in local recovery, with the exception limited to its constructor',()=>{
 const buildingInitial={itemId:'20500002',destination:{localGridOrdinal:1},x:2,y:3,orientation:'GridOrientation_Down',nativeHouseTemplate:'ab'.repeat(8192)};
 const house={command:'group-paste-export',plan:{buildingInitial}};
 assert.deepEqual(parseReplayStep(house),house);
 const a=f(0),b=f(1),c=f(2);rememberReplayStep(b,house.command,house.plan);tag(c);
 const first=appendWorldCheckpoint(undefined,a,b);assert.deepEqual(first.journal.steps,[house]);
 const second=appendWorldCheckpoint(first,b,c);assert.deepEqual(second.journal.steps,[house,step]);
 const id=saveDraftIdentity('a'.repeat(64),'json');
 const draft=makeSaveSessionDraft(id,emptyWorldTimeline(),{area:'Urban',overview:true});
 const doc=makeCheckpointSaveDraft(draft,second.journal);
 assert.deepEqual(parseCheckpointSaveDraft(JSON.parse(JSON.stringify(doc)),id).journal.steps,[house,step]);
 for(const bad of [
  {...house,command:'landscape-export'},
  {...house,plan:{nativeHouseTemplate:'ab'}},
  {...house,plan:{buildingInitial:{...buildingInitial,nativeHouseTemplate:'ab'.repeat(8193)}}},
  {...house,plan:{buildingInitial:{...buildingInitial,nativeHouseTemplate:'abc'}}},
  {...house,plan:{buildingInitial:{...buildingInitial,nativeHouseTemplate:'zz'}}},
  {...house,plan:{buildingInitial:{...buildingInitial,itemId:'40000001'}}},
  {...house,plan:{buildingInitial:{...buildingInitial,extra:true}}},
  {...house,plan:{buildingInitial:{...buildingInitial,destination:{nativeHouseTemplate:'ab'}}}},
  {...house,plan:{buildingInitial:{...buildingInitial,orientation:'x'.repeat(1025)}}},
  {...house,plan:{buildingInitial,other:true}},
  {...house,plan:{other:'ab'.repeat(513)}},
 ])assert.throws(()=>parseReplayStep(bad));
});
