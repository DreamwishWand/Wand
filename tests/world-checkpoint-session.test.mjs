import test from 'node:test';import assert from 'node:assert/strict';
import {appendWorldCheckpoint,commitWorldCheckpoint,travelWorldCheckpoint,localSaveSession,selectLocalSaveFile,closeLocalSaveFile,registerLocalSaveChangeGuard,WORLD_CHECKPOINT_MAX_STEPS} from '../src/lib/ui/local-save-session.ts';
const file=n=>new File([String(n)],'profile.json');
test('checkpoint history maintains original and truncates redo when branching',()=>{
 const a=file(0),b=file(1),c=file(2),d=file(3);
 let h=appendWorldCheckpoint(undefined,a,b);
 h=appendWorldCheckpoint(h,b,c);
 assert.deepEqual(h.files,[a,b,c]);
 assert.equal(appendWorldCheckpoint(h,b,d),null);
 const next=appendWorldCheckpoint({...h,cursor:1},b,d);
 assert.deepEqual(next.files,[a,b,d]);assert.equal(next.cursor,2);
 assert.equal(appendWorldCheckpoint(h,c,c),null);
 let many=undefined,source=a;
 for(let i=0;i<WORLD_CHECKPOINT_MAX_STEPS;i++){const n=file(i);many=appendWorldCheckpoint(many,source,n);assert.ok(many);source=n;}
 const rolled=appendWorldCheckpoint(many,source,d);assert.ok(rolled);assert.equal(rolled.original,a);assert.equal(rolled.firstStep,1);assert.equal(rolled.files.length,WORLD_CHECKPOINT_MAX_STEPS+1);assert.equal(rolled.files.at(-1),d);
});
test('working copy updates the shared Save revision and preserves original',async()=>{
 const a=file(0),b=file(1),c=file(2);
 let state;const unsubscribe=localSaveSession.subscribe(s=>state=s);
 const release=registerLocalSaveChangeGuard(()=>true);
 try{
 assert.ok(selectLocalSaveFile(a));let revision=state.revision;
 assert.equal(commitWorldCheckpoint(b,c),false);
 assert.ok(commitWorldCheckpoint(a,b));assert.ok(state.revision>revision);assert.equal(state.file,b);assert.equal(state.collectionStatus,'selected');
 assert.ok(travelWorldCheckpoint(b,-1));assert.equal(state.file,a);assert.ok(travelWorldCheckpoint(a,1));assert.equal(state.file,b);
 assert.ok(commitWorldCheckpoint(b,c));assert.equal(state.worldCheckpoint.original,a);assert.equal(await a.text(),'0');
 assert.ok(closeLocalSaveFile());assert.equal(state.worldCheckpoint,undefined);
 }finally{release();unsubscribe();}
});
