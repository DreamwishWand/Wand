import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.ts';
import {verifyPublicQuestRewards} from '../src/lib/guide/public-quest-rewards.ts';
import {
  verifyPublicQuestOverrideLoot,loadPublicQuestOverrideLoot,
  DB03_QUEST_OVERRIDE_LOOT_FILE,DB03_QUEST_OVERRIDE_LOOT_SHA,
  DB03_QUEST_OVERRIDE_LOOT_BYTES
} from '../src/lib/guide/public-quest-override-loot.ts';
import {resolveQuestRewardItemDestination} from '../src/lib/guide/quest-reward-navigation.ts';

const folder=new URL('../static/guide/public/',import.meta.url);
async function originals(){
  const [index,rewards,overrides]=await Promise.all([
    readFile(new URL('quest-index.json',folder),'utf8'),
    readFile(new URL('quest-rewards-1.26.2.json',folder),'utf8'),
    readFile(new URL(DB03_QUEST_OVERRIDE_LOOT_FILE,folder))
  ]);
  const source=verifyPublicQuestRewards(JSON.parse(rewards),
    verifyPublicQuestIndex(JSON.parse(index)));
  return {source,overrides,raw:JSON.parse(overrides.toString('utf8'))};
}
test('all four 1.26.2 native override LootTable identities join exact Mission reward references',async()=>{
  const {source,raw,overrides}=await originals();
  assert.equal(overrides.byteLength,DB03_QUEST_OVERRIDE_LOOT_BYTES);
  assert.equal(createHash('sha256').update(overrides).digest('hex'),DB03_QUEST_OVERRIDE_LOOT_SHA);
  const verified=verifyPublicQuestOverrideLoot(raw,source);
  assert.equal(verified.coverage.overrideQuests,4);
  assert.equal(verified.coverage.candidateOccurrences,4);
  assert.equal(verified.coverage.runtimeGrantVerified,false);
  assert.equal(verified.coverage.allRewardsKnown,false);
  const items=[
    ['2070000620','2090000173','31400009','single_draw'],
    ['2070001245','2090000612','40004032','single_draw'],
    ['2070001248','2090000611','40004033','single_draw'],
    ['2070001383','2090000117','30200002','native_unbounded_sentinel']
  ];
  for(const [questId,lootTableId,itemId,rollCount] of items){
    const row=verified.getQuest(questId);
    assert(row);assert.equal(row.lootTableId,lootTableId);
    assert.equal(row.itemId,itemId);assert.equal(row.rollCount,rollCount);
    assert.equal(row.itemQuantityVerified,false);
    assert.equal(row.guaranteedGrant,false);
    assert(Object.isFrozen(row));
    assert.equal(verified.getItemCandidates(itemId)[0],row);
    const link=resolveQuestRewardItemDestination(source,itemId,verified);
    assert(link?.questIds.includes(questId));
    assert(link.overrideLootCandidates>=1);
    assert.equal(link.relationCount,
      link.currencyConfigurations+link.lootCandidates+link.overrideLootCandidates);
  }
  assert(Object.isFrozen(verified.candidates));
  assert.deepEqual(verified.getItemCandidates('1'),[]);
  assert.equal(verified.getQuest('9999999'),null);
});
test('published override bytes, source fingerprints and native relation identity fail closed',async()=>{
  const {source,raw,overrides}=await originals();
  const stub=(bytes)=>async()=>new Response(bytes,{status:200});
  const r=await loadPublicQuestOverrideLoot(source,'/Wand/guide/public/'+
    DB03_QUEST_OVERRIDE_LOOT_FILE,stub(overrides));
  assert.equal(r.candidates.length,4);
  const corrupted=Buffer.from(overrides);corrupted[100]^=1;
  await assert.rejects(loadPublicQuestOverrideLoot(source,'/',stub(corrupted)),/SHA/);
  await assert.rejects(loadPublicQuestOverrideLoot(source,'/',stub('bad')),/BYTES/);
  await assert.rejects(loadPublicQuestOverrideLoot(source,'/',
    async()=>new Response('',{status:404})),/DOWNLOAD_FAILED/);
  const clone=()=>structuredClone(raw);
  let doc=clone();doc.target.gameVersion='1.26.1';
  assert.throws(()=>verifyPublicQuestOverrideLoot(doc,source),/SOURCE_VERSION/);
  doc=clone();doc.source.staticCandidatesOnly=false;
  assert.throws(()=>verifyPublicQuestOverrideLoot(doc,source),/SOURCE_PROVENANCE/);
  doc=clone();doc.rows[0][2]='31400008';
  assert.throws(()=>verifyPublicQuestOverrideLoot(doc,source),/NATIVE_LOOT_IDENTITY/);
  doc=clone();doc.rows[3][3]='1';
  assert.throws(()=>verifyPublicQuestOverrideLoot(doc,source),/NATIVE_LOOT_IDENTITY/);
  assert.throws(()=>resolveQuestRewardItemDestination(source,'31400009',
    {schema:'invalid'}),/OVERRIDE_SOURCE_REQUIRED/);
});
test('Guide public Quest UI uses original override candidate instead of unresolved reference',async()=>{
  const route=await readFile(new URL('../src/routes/guide/quests/+page.svelte',import.meta.url),'utf8');
  assert.match(route,/loadPublicQuestOverrideLoot/);
  assert.match(route,/overrideIndex=verified;restoreAddressSelection\(\)/);
  assert.match(route,/別定義のLoot Table候補/);
  assert.match(route,/native_unbounded_sentinel/);
  assert.match(route,/questOverrideInfo/);
});
