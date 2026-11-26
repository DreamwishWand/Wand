import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSavedMemoryFlags,memoryCandidateFlags} from '../src/lib/media/saved-memory-flags.ts';
const base={contract:'wand.memory.raw-flags@1',saveSchema:643,status:'observed',pieceBitMappingVerified:false,saveFileModified:false};
test('whitelist raw map and distinguish missing, negative and extra bits',()=>{
  const p=sanitizeSavedMemoryFlags({...base,entries:{130000001:0,130000002:3,130000003:1024,130000004:-1},private:'not returned'});
  assert.equal(memoryCandidateFlags(p,130000001,10),0);
  assert.equal(memoryCandidateFlags(p,130000002,2),3);
  for(const id of [130000003,130000004,130000005])assert.equal(memoryCandidateFlags(p,id,10),null);
  assert.equal(memoryCandidateFlags(p,130000002,1),null);
  assert.equal('private' in p,false);
});
test('reject malformed rows, unsupported evidence and contradictory empty status',()=>{
  for(const entries of [{'01':1},{'1':'2'},{'1':2147483648},{'1':true},{'0':0},{}])
    assert.throws(()=>sanitizeSavedMemoryFlags({...base,entries}));
  assert.throws(()=>sanitizeSavedMemoryFlags({...base,saveSchema:644,entries:{1:0}}));
  assert.throws(()=>sanitizeSavedMemoryFlags({...base,status:'not_observed',entries:{1:0}}));
  const p=sanitizeSavedMemoryFlags({...base,status:'observed_empty',entries:{}});
  assert.equal(memoryCandidateFlags(p,1,10),null);
});

test('actual combined WASM response retains raw Memory flags and independent discovery',async()=>{
  const {projectRustReadProjectionsText}=await import('./helpers/rust-collection-discovery.mjs');
  const result=await projectRustReadProjectionsText(JSON.stringify({GameInfo:{Version:643},Player:{
    PrivateName:'never-export',MemoryShards:{130000001:3,130000002:0},
    CollectionSets:[{GroupData:[{GroupsCollectionItems:{40005160:true}}]}]
  }}));
  const flags=sanitizeSavedMemoryFlags(result.memoryFlags);
  assert.equal(memoryCandidateFlags(flags,130000001,10),3);
  assert.equal(memoryCandidateFlags(flags,130000002,10),0);
  assert.deepEqual(result.entries,[{itemId:40005160,discovered:true}]);
  assert.equal(JSON.stringify(result).includes('never-export'),false);
});
