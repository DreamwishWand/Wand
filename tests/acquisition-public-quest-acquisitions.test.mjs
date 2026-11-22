import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB03_QUEST_REWARDS_FILE,DB03_QUEST_REWARDS_BYTES,DB03_QUEST_REWARDS_SHA
} from '../src/lib/guide/public-quest-rewards.ts';
import {
  DB02_QUEST_ACQUISITION_SCHEMA,loadPublicQuestAcquisitionIndex
} from '../src/lib/acquisition/public-quest-acquisitions.ts';

const root=new URL('../static/guide/public/',import.meta.url);
const originalQuest=readFileSync(new URL('quest-index.json',root));
const originalRewards=readFileSync(new URL(DB03_QUEST_REWARDS_FILE,root));

function fetchLocal(overrides={}){
  const seen=[];
  const stub=async url=>{
    seen.push(url);
    if(url.endsWith('/quest-index.json'))
      return new Response(overrides.quest??originalQuest,{status:200});
    if(url.endsWith('/'+DB03_QUEST_REWARDS_FILE))
      return new Response(overrides.rewards??originalRewards,{status:200});
    return new Response('not found',{status:404});
  };
  return {seen,stub};
}
test('Source-pinned 395 native quest reward backlinks are item-ID and quest-ID reversible, no private ZIP',async()=>{
  assert.equal(originalRewards.length,DB03_QUEST_REWARDS_BYTES);
  assert.equal(createHash('sha256').update(originalRewards).digest('hex'),DB03_QUEST_REWARDS_SHA);
  const {seen,stub}=fetchLocal();
  const index=await loadPublicQuestAcquisitionIndex('/Wand',stub);
  assert.equal(index.schema,DB02_QUEST_ACQUISITION_SCHEMA);
  assert.deepEqual(seen,[
    '/Wand/guide/public/quest-index.json',
    '/Wand/guide/public/quest-rewards-1.26.2.json'
  ]);
  assert.equal(index.coverage.rewardEvidenceQuestRows,247);
  assert.equal(index.coverage.definedQuests,733);
  assert.equal(index.coverage.currencySourceReferences,65);
  assert.equal(index.coverage.additionalLootSourceReferences,330);
  assert.equal(index.coverage.allSourceItemReferences,395);
  assert.equal(index.coverage.opaqueOverrideQuestRows,4);
  assert.equal(index.coverage.indexedQuestsWithItemIds,index.indexedQuestIds.length);
  assert(index.coverage.indexedQuestsWithItemIds<=247);
  assert.equal(index.coverage.distinctReferencedItemIds,index.indexedItemIds.length);
  let sources=0, currencyCount=0, lootCount=0;
  for(const itemId of index.indexedItemIds){
    const rows=index.getItemCandidates(itemId);
    for(const row of rows){
      sources++;
      assert.equal(row.itemId,itemId);
      assert.equal(index.getSourceOrigin(row.originId),row);
      assert(index.getQuestCandidates(row.questId).includes(row));
      assert.equal(row.originalMissionSha256,
        'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24');
      assert.equal(row.publishedProjectionSha256,DB03_QUEST_REWARDS_SHA);
      assert.equal(row.sourceExplicitQuestItemReferenceVerified,true);
      assert.equal(row.staticSourceOnly,true);
      assert.equal(row.guaranteedGrantVerified,false);
      assert.equal(row.currentAvailabilityVerified,false);
      assert.equal(row.playerOwnershipVerified,false);
      assert(Object.isFrozen(row));
      if(row.kind==='configured_currency_reward'){
        currencyCount++;
        assert(row.currency);assert.equal(row.loot,null);
        assert(row.currency.amountMin<=row.currency.amountMax);
      }else{
        lootCount++;
        assert(row.loot);assert.equal(row.currency,null);
        // Count of loot-table rolls is not an awarded item quantity.
        assert(row.loot.minimumRolls===null||
          row.loot.minimumRolls<=row.loot.maximumRolls);
      }
    }
  }
  assert.equal(sources,395);
  assert.equal(currencyCount,65);
  assert.equal(lootCount,330);
  assert.equal(index.coverage.originalFileIdentityVerified,true);
  assert.equal(index.coverage.completeAllQuestRewards,false);
  assert(Object.isFrozen(index.coverage));
  assert(Object.isFrozen(index.indexedItemIds));
});
test('Native currency ranges and 3 independent loot positions retain exact original semantics',async()=>{
  const {stub}=fetchLocal();
  const idx=await loadPublicQuestAcquisitionIndex('',stub);
  const known=idx.getQuestCandidates('2070000672');
  assert(known.some(x=>x.itemId==='80000000'&&
    x.kind==='configured_currency_reward'&&
    x.currency.amountMin===500&&x.currency.amountMax===500));
  assert(idx.getItemCandidates('80000000').length>0); // may lie outside DB-00 ItemList
  const multi=idx.getQuestCandidates(2070000628);
  assert.deepEqual(multi.map(x=>x.itemId),['30400064','30400059','30400010']);
  assert.deepEqual(multi.map(x=>x.loot.tableIndex),[0,1,2]);
  assert.deepEqual(multi.map(x=>x.loot.minimumRolls),[2,2,2]);
  assert(multi.every(x=>x.guaranteedGrantVerified===false));
  assert.deepEqual(idx.getQuestCandidates('2070000620'),[]); // opaque override, unresolved
  assert.equal(idx.getSourceOrigin('db03:quest:2070000620:loot:0:0'),null);
  assert.equal(idx.getSourceOrigin('db03:quest:2070000628:loot:1:0'),multi[1]);
  assert.deepEqual(idx.getItemCandidates('999999999999999'),[]);
  assert.throws(()=>idx.getItemCandidates('00080000000'),/INVALID_ID/);
});
test('Public loader fails closed on altered reward bytes, invalid source version and unsafe base',async()=>{
  const tampered=Buffer.from(originalRewards);
  tampered[160]^=1;
  await assert.rejects(
    loadPublicQuestAcquisitionIndex('/Wand',fetchLocal({rewards:tampered}).stub),
    /PUBLISHED_SHA_MISMATCH/
  );
  const doc=JSON.parse(originalQuest.toString('utf8'));
  doc.target.gameVersion='1.26.3';
  await assert.rejects(
    loadPublicQuestAcquisitionIndex('',fetchLocal({quest:Buffer.from(JSON.stringify(doc))}).stub),
    /INVALID_PUBLIC_QUEST_INDEX/
  );
  await assert.rejects(
    loadPublicQuestAcquisitionIndex('/Wand/../root',fetchLocal().stub),
    /INVALID_BASE_PATH/
  );
  await assert.rejects(
    loadPublicQuestAcquisitionIndex('/Wand//root',fetchLocal().stub),
    /INVALID_BASE_PATH/
  );
  await assert.rejects(
    loadPublicQuestAcquisitionIndex('',async()=>new Response('',{status:404})),
    /QUEST_INDEX_FETCH_FAILED/
  );
});
test('Shared current catalog retains a lazy Quest acquisition loader without importing owner-private data',()=>{
  const source=readFileSync(new URL('../src/lib/acquisition/current-catalog.ts',import.meta.url),'utf8');
  assert.match(source,/loadQuestAcquisitionIndex\(/);
  assert.match(source,/loadPublicQuestAcquisitionIndex\(/);
  assert.match(source,/publicOnlineNameCandidates/);
});
