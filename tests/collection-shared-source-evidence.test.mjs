import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollectionEvidencePool}
  from '../src/lib/collection/source-evidence-client.ts';

const distribution=id=>Object.freeze({
  itemId:id,groups:[],
  sourceCoverageComplete:false,exclusiveLimitedItemVerified:false,
  currentAvailabilityVerified:false,playerOwnershipVerified:false,
  collectionUiMembershipVerified:false
});
const acquisition=id=>Object.freeze({
  itemId:id,kinds:['fishing'],candidates:['loot_table'],
  staticSourceOnly:true,availabilityVerified:false,ownershipVerified:false,
  distribution:distribution(id)
});
const quests=id=>Object.freeze({
  itemId:id,targets:[],rewards:[],
  staticSourceOnly:true,mandatoryRequirementVerified:false,
  guaranteedRewardVerified:false,playerProgressVerified:false
});
class FakeWorker {
  onmessage=null;
  onerror=null;
  sent=[];
  terminated=0;
  postMessage(data){this.sent.push(data);}
  emit(data){this.onmessage?.({data});}
  fail(){this.onerror?.(new Error('worker failed'));}
  terminate(){this.terminated++;}
}
function fixture(){
  const workers=[];
  const pool=createCollectionEvidencePool(()=>{
    const worker=new FakeWorker();workers.push(worker);return worker;
  });
  return {pool,workers};
}
test('one lazy Worker serves both panels and deduplicates concurrent requests and cached results',async()=>{
  const f=fixture();
  const a=f.pool.acquire(),q=f.pool.acquire();
  assert.equal(f.workers.length,0,'opening an inspector never starts source fetch');
  const first=a.loadAcquisition(40005160,'/Wand');
  assert.equal(f.workers.length,1);
  assert.equal(f.workers[0].sent.length,1);
  const duplicate=a.loadAcquisition(40005160,'/Wand');
  assert.equal(first,duplicate,'in-flight Item method request must be shared');
  const related=q.loadQuests(40005160,'/Wand');
  assert.equal(f.workers.length,1,'Quest request reuses the same Worker');
  assert.equal(f.workers[0].sent.length,2);
  const [aReq,qReq]=f.workers[0].sent;
  assert.deepEqual([aReq.kind,qReq.kind],['acquisition','quests']);
  assert.notEqual(aReq.requestId,qReq.requestId);
  // Replies may arrive in either order without category or Item contamination.
  f.workers[0].emit({...qReq,ok:true,summary:quests(40005160)});
  f.workers[0].emit({...aReq,ok:true,summary:acquisition(40005160)});
  assert.deepEqual(await first,acquisition(40005160));
  assert.deepEqual(await duplicate,acquisition(40005160));
  assert.deepEqual(await related,quests(40005160));
  assert.deepEqual(await a.loadAcquisition(40005160,'/Wand'),acquisition(40005160));
  assert.deepEqual(await q.loadQuests(40005160,'/Wand'),quests(40005160));
  assert.equal(f.workers[0].sent.length,2,'resolved source evidence must be cached');
  a.release();
  assert.equal(f.workers[0].terminated,0,'one inspector still uses shared source');
  q.release();
  q.release();
  assert.equal(f.workers[0].terminated,1,'last inspector releases Worker exactly once');
  await assert.rejects(a.loadAcquisition(40005160,'/Wand'),/HANDLE_RELEASED/);
  const reopened=f.pool.acquire();
  const again=reopened.loadQuests(40005160,'/Wand');
  assert.equal(f.workers.length,2,'fresh inspector recreates lazy source Worker');
  f.workers[1].emit({...f.workers[1].sent[0],ok:true,summary:quests(40005160)});
  await again;
  reopened.release();
});
test('source kind, exact Item ID and provenance flags are checked before caching',async()=>{
  const f=fixture();const h=f.pool.acquire();
  for(const corrupt of [
    {kind:'quests',summary:quests(40005160)},
    {summary:acquisition(40005161)},
    {summary:{...acquisition(40005160),availabilityVerified:true}},
    {summary:{...acquisition(40005160),distribution:{
      ...distribution(40005160),exclusiveLimitedItemVerified:true
    }}}
  ]){
    const work=h.loadAcquisition(40005160,'/Wand');
    const last=f.workers[0].sent.at(-1);
    f.workers[0].emit({...last,ok:true,...corrupt});
    await assert.rejects(work,/EVIDENCE_MISMATCH/);
  }
  assert.equal(f.workers[0].sent.length,4,
    'tampered messages must never enter the cache');
  const good=h.loadAcquisition(40005160,'/Wand');
  f.workers[0].emit({...f.workers[0].sent.at(-1),
    ok:true,summary:acquisition(40005160)});
  await good;
  h.release();
});
test('invalid IDs or paths fail without Worker creation or unsafe fetch',async()=>{
  const f=fixture();const h=f.pool.acquire();
  for(const [id,path] of [[-1,'/Wand'],[0,'/Wand'],
    [Number.MAX_SAFE_INTEGER+1,'/Wand'],[7,'../private'],[7,'/Wand/../private']]){
    await assert.rejects(h.loadQuests(id,path),/REQUEST_INVALID/);
  }
  assert.equal(f.workers.length,0);
  h.release();
});
test('worker failure rejects all pending panels; retry makes one fresh Worker',async()=>{
  const f=fixture();
  const a=f.pool.acquire(),q=f.pool.acquire();
  const first=a.loadAcquisition(40005160,'/Wand');
  const second=q.loadQuests(40005160,'/Wand');
  assert.equal(f.workers.length,1);
  f.workers[0].fail();
  await assert.rejects(first,/WORKER_FAILED/);
  await assert.rejects(second,/WORKER_FAILED/);
  assert.equal(f.workers[0].terminated,1);
  const retried=q.loadQuests(40005160,'/Wand');
  assert.equal(f.workers.length,2);
  f.workers[1].emit({...f.workers[1].sent[0],ok:true,summary:quests(40005160)});
  assert.deepEqual(await retried,quests(40005160));
  a.release();q.release();
  assert.equal(f.workers[1].terminated,1);
});
test('last inspector unmount cancels in-flight work without caching stale source',async()=>{
  const f=fixture();
  const handle=f.pool.acquire();
  const pending=handle.loadQuests(40005160,'/Wand');
  const worker=f.workers[0],message=worker.sent[0];
  handle.release();
  await assert.rejects(pending,/INSPECTOR_DESTROYED/);
  worker.emit({...message,ok:true,summary:quests(40005160)});
  const next=f.pool.acquire();
  const current=next.loadQuests(40005160,'/Wand');
  assert.equal(f.workers.length,2);
  assert.equal(f.workers[1].sent.length,1,'old reply cannot poison the new panel');
  f.workers[1].emit({...f.workers[1].sent[0],ok:true,summary:quests(40005160)});
  await current;next.release();
});

test('concrete source requests reuse the worker but isolate item and locale cache keys',async()=>{
  const f=fixture(),h=f.pool.acquire();
  const ja=h.loadConcreteAcquisition(30200009,'/Wand','ja');
  const en=h.loadConcreteAcquisition(30200009,'/Wand','en');
  assert.equal(f.workers.length,1);
  assert.equal(ja,h.loadConcreteAcquisition(30200009,'/Wand','ja'));
  const [jaReq,enReq]=f.workers[0].sent;
  assert.deepEqual([jaReq.locale,enReq.locale],['ja','en']);
  const reply=(locale,name)=>({itemId:30200009,locale,configuredNames:[],candidateNames:[name]});
  f.workers[0].emit({...enReq,ok:true,summary:reply('en','Stall')});
  f.workers[0].emit({...jaReq,ok:true,summary:reply('en','Wrong locale')});
  assert.deepEqual(await en,reply('en','Stall'));
  await assert.rejects(ja,/EVIDENCE_MISMATCH/);
  const retry=h.loadConcreteAcquisition(30200009,'/Wand','ja');
  f.workers[0].emit({...f.workers[0].sent.at(-1),ok:true,summary:reply('ja','売店')});
  assert.deepEqual(await retry,reply('ja','売店'));
  await assert.rejects(h.loadConcreteAcquisition(30200009,'/Wand','invalid'),/REQUEST_INVALID/);
  assert.equal(f.workers[0].sent.length,3);
  h.release();
});
