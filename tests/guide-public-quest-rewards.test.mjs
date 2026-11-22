import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.mjs';
import {verifyPublicQuestRewards,loadPublicQuestRewards,DB03_QUEST_REWARDS_FILE,
  DB03_QUEST_REWARDS_SHA,DB03_QUEST_REWARDS_BYTES} from '../src/lib/guide/public-quest-rewards.ts';

const local=new URL('../static/guide/public/',import.meta.url);
async function original(){
  const bytes=await readFile(new URL(DB03_QUEST_REWARDS_FILE,local));
  const doc=JSON.parse(bytes.toString('utf8'));
  const index=verifyPublicQuestIndex(JSON.parse(await readFile(new URL('quest-index.json',local),'utf8')));
  return {bytes,doc,index};
}
test('733 source-authenticated Quest definitions yield 247 reward-bearing evidence rows and 395 exact Item-ID references',async()=>{
  const {bytes,doc,index}=await original();
  assert.equal(bytes.length,DB03_QUEST_REWARDS_BYTES);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),DB03_QUEST_REWARDS_SHA);
  const r=verifyPublicQuestRewards(doc,index);
  assert.equal(r.coverage.quests,733);
  assert.equal(r.coverage.questRowsWithAnyRewardEvidence,247);
  assert.equal(r.coverage.additionalItemOccurrences,330);
  assert.equal(r.coverage.currencyOccurrences,65);
  assert.equal(r.coverage.distinctAdditionalItemIds,291);
  assert.equal(r.coverage.questsWithAdditionalItemCandidates,195);
  assert.equal(r.coverage.questsWithCurrencyReward,65);
  assert.equal(r.coverage.questsWithOpaqueOverrides,4);
  assert.equal(r.questIdsWithEvidence.length,247);
  assert(Object.isFrozen(r.coverage));
  assert.equal(r.coverage.runtimeGrantsVerified,false);
  assert.equal(r.coverage.allRewardsKnown,false);
  for(const questId of r.questIdsWithEvidence){
    const row=r.getQuest(questId);
    assert(row);assert.equal(row.guaranteedGrant,false);assert(Object.isFrozen(row));
    for(const cur of row.currencies){
      assert(r.getItemCandidates(cur.itemId).some(x=>x.questId===questId&&
        x.kind==='currency_configuration'&&x.currency===cur));
    }
    for(const item of row.lootCandidates){
      assert(r.getItemCandidates(item.itemId).some(x=>x.questId===questId&&
        x.kind==='additional_loot_candidate'&&x.loot===item));
    }
  }
  assert.equal(r.getItemCandidates('80000003').every(x=>x.guaranteedGrant===false),true);
  assert.deepEqual(r.getItemCandidates('999999999999999'),[]);
  assert.equal(r.getQuest('100000000'),null);
  assert.equal(r.getQuest('__proto__'),null);
});
test('original multi-slot Loot Table positions and opaque overrides remain different evidence',async()=>{
  const {doc,index}=await original();const r=verifyPublicQuestRewards(doc,index);
  const mystery=r.getQuest('2070000620');
  assert(mystery);assert.equal(mystery.opaqueOverrideUnresolved,true);
  assert.equal(mystery.lootCandidates.length,0);assert.equal(mystery.currencies.length,0);
  const multi=r.getQuest('2070000628');
  assert(multi);assert.deepEqual(multi.lootCandidates.map(x=>x.tableIndex),[0,1,2]);
  assert.deepEqual(multi.lootCandidates.map(x=>x.minimumRolls),[2,2,2]);
  assert(multi.lootCandidates.every(x=>x.maximumRolls===2));
  const one=r.getQuest('2070000672');
  assert(one);assert(one.currencies.some(x=>x.itemId==='80000000'&&x.amountMin===500));
});
test('public loader verifies SHA and bytes, rejects tamper without changing Guide',async()=>{
  const {bytes,index}=await original();
  const fetcher=async payload=>new Response(payload,{status:200});
  const read=await loadPublicQuestRewards(index,'/Wand/guide/public/'+DB03_QUEST_REWARDS_FILE,
    ()=>fetcher(bytes));
  assert.equal(read.questIdsWithEvidence.length,247);
  const modified=Buffer.from(bytes);modified[160]^=1;
  await assert.rejects(loadPublicQuestRewards(index,'/',()=>fetcher(modified)),/PUBLISHED_SHA_MISMATCH/);
  await assert.rejects(loadPublicQuestRewards(index,'/',()=>fetcher('bad')),/PUBLISHED_BYTES_MISMATCH/);
  await assert.rejects(loadPublicQuestRewards(index,'/',()=>new Response('',{status:404})),/DOWNLOAD_FAILED/);
});
test('projection rejects source versions, foreign Quest IDs, malformed Loot and fabricated currency amounts',async()=>{
  const {doc,index}=await original();
  const clone=()=>structuredClone(doc);
  let x=clone();x.target.gameVersion='1.26.3';
  assert.throws(()=>verifyPublicQuestRewards(x,index),/SCHEMA_OR_GAME_VERSION/);
  x=clone();x.provenance.staticCandidatesOnly=false;
  assert.throws(()=>verifyPublicQuestRewards(x,index),/SOURCE_PROVENANCE/);
  x=clone();x.rows['99999999']={currency:[['80000003',1,1]]};
  assert.throws(()=>verifyPublicQuestRewards(x,index),/ROW_CENSUS/);
  x=clone();x.rows['2070000628'].additionalLoot[0][3]=9999;
  assert.throws(()=>verifyPublicQuestRewards(x,index),/INVALID_LOOT_ROW/);
  x=clone();x.rows['2070000672'].currency[0][1]=600;
  assert.throws(()=>verifyPublicQuestRewards(x,index),/INVALID_CURRENCY_ROW/);
  x=clone();x.rows['2070000620'].opaqueOverrideUnresolved=false;
  assert.throws(()=>verifyPublicQuestRewards(x,index),/INVALID_OVERRIDE_FLAG/);
});
test('public Guide renders factual Quest reward candidates and avoids save mutation',async()=>{
  const route=await readFile(new URL('../src/routes/guide/quests/+page.svelte',import.meta.url),'utf8');
  assert.match(route,/loadPublicQuestRewards\(/);
  assert.match(route,/questRewardInfo/);
  assert.match(route,/報酬候補/);
  assert.match(route,/原本の設定上の候補/);
});