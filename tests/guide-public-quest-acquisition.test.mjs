import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  DB03_QUEST_ACQUISITION_SCHEMA,loadPinnedPublicQuestAcquisition,
  hasPinnedPublicQuestAcquisitionEvidence
} from '../src/lib/guide/public-quest-acquisition.ts';
import {DB03_QUEST_REWARDS_SHA} from '../src/lib/guide/public-quest-rewards.ts';
import {loadUnifiedAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';
const DIR=new URL('../static/guide/public/',import.meta.url);
async function source(name){
  return readFile(new URL(name,DIR));
}
function response(bytes){
  return new Response(bytes,{status:200});
}
function testFetcher(files,requests=[]){
  return async url=>{
    requests.push(url);
    const path=String(url).split('/').at(-1);
    return files.has(path)?response(files.get(path)):new Response('',{status:404});
  };
}
async function fixture(){
  return new Map(await Promise.all([
    'quest-index.json','quest-rewards-1.26.2.json',
    'starpath-cache-2026-11-22.json'
  ].map(async name=>[name,await source(name)])));
}
test('public DB-03 Quest origins are pinned, unique, reversible and configured candidates only',async()=>{
  const files=await fixture(),requests=[];
  const index=await loadPinnedPublicQuestAcquisition('/Wand',testFetcher(files,requests));
  assert.equal(index.schema,DB03_QUEST_ACQUISITION_SCHEMA);
  assert(hasPinnedPublicQuestAcquisitionEvidence(index));
  assert.equal(index.origins.length,395);
  assert.equal(index.coverage.totalItemOriginCandidates,395);
  assert.equal(index.coverage.currencyCandidates,65);
  assert.equal(index.coverage.additionalLootCandidates,330);
  assert.equal(index.coverage.questsWithRewardEvidence,247);
  assert.equal(index.coverage.guaranteedGrantVerified,false);
  assert.equal(index.coverage.allQuestRewardsKnown,false);
  assert.deepEqual(requests,[
    '/Wand/guide/public/quest-index.json',
    '/Wand/guide/public/quest-rewards-1.26.2.json'
  ]);
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.origins));
  assert(Object.isFrozen(index.coverage));
  const ids=new Set();
  let currencies=0,loot=0;
  for(const row of index.origins){
    assert(!ids.has(row.originId),'each native quest slot must keep its own identity');
    ids.add(row.originId);
    assert.equal(row.kind,'quest_reward');
    assert.equal(row.routeStatus,'static_candidate_only');
    assert.equal(row.quantity,null,'roll counts are NOT item amounts');
    assert.equal(row.availability,'not_live_verified');
    assert.equal(row.source.kind,'verified_game_native');
    assert.equal(row.source.sha256,DB03_QUEST_REWARDS_SHA);
    assert.equal(row.source.gameVersion,'1.26.2');
    assert.equal(row.campaignId,null);
    assert(row.name.startsWith('Quest reward candidate: '));
    assert(row.conditions.some(c=>c.includes('not a guaranteed grant')));
    assert(Object.isFrozen(row));
    assert(Object.isFrozen(row.conditions));
    assert(index.getItemCandidates(row.itemId).includes(row));
    const questId=row.originId.split(':')[3];
    assert(index.getQuestCandidates(questId).includes(row));
    if(row.originId.includes(':currency:')){
      currencies++;
      assert(row.conditions.some(c=>c.includes('Configured currency amount range')));
    }else{
      loot++;
      assert(row.conditions.some(c=>c.includes('Additional Loot Table')));
    }
  }
  assert.equal(currencies,65);
  assert.equal(loot,330);
  assert.deepEqual(index.getItemCandidates('999999999999999'),[]);
  assert.deepEqual(index.getQuestCandidates('__proto__'),[]);
  assert.deepEqual(index.getQuestCandidates('2070000620'),[],
    'opaque override is not an invented Item ID origin');
  assert.equal(index.coverage.distinctItemIds,
    new Set(index.origins.map(r=>r.itemId)).size);
});
test('unified DB-02 ledger exposes all 395 configured Quest candidates alongside Star Paths',async()=>{
  const files=await fixture(),fetcher=testFetcher(files);
  const pinned=await loadPinnedPublicQuestAcquisition('/Wand',fetcher);
  const db=await loadUnifiedAcquisitionOriginDatabase(
    fetcher,null,'/Wand',[],null,pinned
  );
  assert.equal(db.getCoverage().linkedRoutes,462);
  assert.equal(db.getCoverage().originCoverageComplete,false);
  assert.equal(db.getCoverage().routesBySourceKind.verified_game_native,395);
  assert.equal(db.getCoverage().routesBySourceKind.verified_liveops_cache,67);
  assert(db.getItem('80000000').origins.some(r=>
    r.kind==='quest_reward'&&r.originId.includes(':currency:')));
  assert(db.getItem('170000115').origins.some(r=>
    r.kind.startsWith('star_path_')&&r.source.kind==='verified_liveops_cache'));
  for(const relation of pinned.origins){
    assert(db.getItem(relation.itemId).origins.includes(relation),
      'DB-02 must preserve exact DB-03 original relation object');
    assert(db.getOrigin(relation.originId).includes(relation));
  }
});
test('unverified structural objects can never claim authenticated public Quest origins',async()=>{
  const files=await fixture(),fetcher=testFetcher(files);
  const pinned=await loadPinnedPublicQuestAcquisition('',fetcher);
  assert.equal(hasPinnedPublicQuestAcquisitionEvidence({...pinned}),false);
  await assert.rejects(
    loadUnifiedAcquisitionOriginDatabase(fetcher,null,'',[],null,{...pinned}),
    /DB03_PINNED_PUBLIC_QUEST_REWARDS_REQUIRED/
  );
  assert.throws(()=>pinned.origins.push(pinned.origins[0]),TypeError);
});
test('tampered reward bytes, mismatched public Quest index and missing files reject source identity',async()=>{
  const files=await fixture();
  const modified=new Map(files);
  const corrupted=Buffer.from(modified.get('quest-rewards-1.26.2.json'));
  corrupted[180]^=1;
  modified.set('quest-rewards-1.26.2.json',corrupted);
  await assert.rejects(loadPinnedPublicQuestAcquisition('',testFetcher(modified)),
    /PUBLISHED_SHA_MISMATCH/);
  modified.set('quest-rewards-1.26.2.json',files.get('quest-rewards-1.26.2.json'));
  modified.set('quest-index.json',Buffer.from(JSON.stringify({schema:'evil'})));
  await assert.rejects(loadPinnedPublicQuestAcquisition('',testFetcher(modified)),
    /unsupported original-source quest catalogue/);
  const absent=new Map(files);absent.delete('quest-rewards-1.26.2.json');
  await assert.rejects(loadPinnedPublicQuestAcquisition('',testFetcher(absent)),
    /DOWNLOAD_FAILED/);
  await assert.rejects(loadPinnedPublicQuestAcquisition('/Wand/../private',testFetcher(files)),
    /INVALID_BASE_PATH/);
});
test('current DB-02 full catalog calls the verified public Quest loader before unified origin join',async()=>{
  const reader=await readFile(
    new URL('../src/lib/acquisition/current-catalog.ts',import.meta.url),'utf8'
  );
  assert.match(reader,/loadPinnedPublicQuestAcquisition\(basePath,fetcher\)/);
  assert.match(reader,/basePath,ids,db03NativeRewards,publicQuestRewards/);
});
