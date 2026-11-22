import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVED_COLLECTION_PRESENCE_CONTRACT,
  createSavedCollectionPresence,
  sanitizeSavedCollectionPresence
} from '../src/lib/collection/saved-collection-presence.mjs';

const payload=(groups)=>({
  GameInfo:{Version:643},
  Player:{CollectionSets:[{GroupData:groups.map(GroupsCollectionItems=>({GroupsCollectionItems}))}]},
  World:{}
});

test('exact CollectionSets map keys are observed, without interpreting false or nested values',()=>{
  const save=payload([
    {'40005160':false,'40006110':{person:'private-secret',Amount:999}},
    {'40005160':{claim:'not owned'}}
  ]);
  const result=createSavedCollectionPresence(save);
  assert.equal(result.contract,SAVED_COLLECTION_PRESENCE_CONTRACT);
  assert.equal(result.status,'observed_ids');
  assert.equal(result.observedSets,1);
  assert.equal(result.observedGroups,2);
  assert.equal(result.observedMaps,2);
  assert.equal(result.referenceCount,3);
  assert.deepEqual(result.items,[
    {itemId:40005160,referenceCount:2},
    {itemId:40006110,referenceCount:1}
  ]);
  assert.equal(result.ownershipVerified,false);
  assert.equal(result.completionVerified,false);
  assert.equal(result.sourceVersionEquivalenceVerified,false);
  assert.equal(result.writerAuthorized,false);
  const raw=JSON.stringify(result);
  assert.ok(!raw.includes('private-secret'));
  assert.ok(!raw.includes('claim'));
  assert.ok(!raw.includes('999'));
  assert.deepEqual(sanitizeSavedCollectionPresence(structuredClone(result)),result);
  assert.ok(Object.isFrozen(result.items));
  assert.ok(Object.isFrozen(result.items[0]));
});

test('missing or empty CollectionSets is not automatically classified as no ownership',()=>{
  const missing=createSavedCollectionPresence({Player:{},World:{}});
  assert.equal(missing.status,'not_observed');
  assert.equal(missing.fieldObserved,false);
  assert.equal(missing.referenceCount,0);
  assert.deepEqual(missing.items,[]);
  const empty=createSavedCollectionPresence({Player:{CollectionSets:[]},World:{}});
  assert.equal(empty.status,'observed_empty');
  assert.equal(empty.fieldObserved,true);
  assert.equal(empty.ownershipVerified,false);
  assert.equal(sanitizeSavedCollectionPresence(missing).status,'not_observed');
  assert.equal(sanitizeSavedCollectionPresence(empty).status,'observed_empty');
});

test('modified saves with absent or inconsistent groups yield partial observation, not corruption claims',()=>{
  const modified={Player:{CollectionSets:[
    {GroupData:[{GroupsCollectionItems:{'123':true,'0123':true,'0':false}},{}]},
    {notGroupData:true}
  ]},World:{}};
  const result=createSavedCollectionPresence(modified);
  assert.equal(result.status,'partial_inconclusive');
  assert.deepEqual(result.items,[{itemId:123,referenceCount:1}]);
  assert.equal(result.invalidEntries,4);
  assert.equal(result.sampled,false);
  assert.equal(sanitizeSavedCollectionPresence(result).status,'partial_inconclusive');
  assert.equal(createSavedCollectionPresence({Player:{CollectionSets:'unexpected'}}).status,'partial_inconclusive');
});

test('bounded scan is explicitly partial and skips unsafe numeric map keys',()=>{
  const group={};
  for(let i=1;i<=20010;i++)group[String(i)]=true;
  group['9007199254740992']=true;
  const result=createSavedCollectionPresence(payload([group]));
  assert.equal(result.status,'partial_inconclusive');
  assert.equal(result.sampled,true);
  assert.ok(result.referenceCount<=20000);
  assert.equal(result.distinctItemCount,result.referenceCount);
  assert.equal(sanitizeSavedCollectionPresence(result).sampled,true);
});

test('sanitizer reconstructs only known fields and rejects forged ownership or count values',()=>{
  const source=createSavedCollectionPresence(payload([{'1':true,'2':false}]));
  const raw=structuredClone(source);
  raw.privateMemo='do-not-forward';
  raw.items[0].playerName='do-not-forward';
  const out=sanitizeSavedCollectionPresence(raw);
  assert.ok(!JSON.stringify(out).includes('do-not-forward'));
  assert.throws(()=>sanitizeSavedCollectionPresence({...raw,ownershipVerified:true}),/INVALID_WORKER_REPLY/);
  assert.throws(()=>sanitizeSavedCollectionPresence({...raw,publishable:true}),/INVALID_WORKER_REPLY/);
  assert.throws(()=>sanitizeSavedCollectionPresence({...raw,referenceCount:5}),/INVALID_WORKER_REPLY/);
  assert.throws(()=>sanitizeSavedCollectionPresence({...raw,items:[raw.items[0],raw.items[0]]}),/INVALID_WORKER_REPLY/);
  assert.throws(()=>sanitizeSavedCollectionPresence({...raw,status:'owned'}),/INVALID_WORKER_REPLY/);
});
