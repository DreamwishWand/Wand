import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.mjs';
import {verifyPublicQuestRewards} from '../src/lib/guide/public-quest-rewards.ts';
import {resolveQuestRewardItemDestination,guideQuestRewardItemHref}
  from '../src/lib/guide/quest-reward-navigation.ts';

async function source(){
  const base=new URL('../static/guide/public/',import.meta.url);
  const index=JSON.parse(await readFile(new URL('quest-index.json',base),'utf8'));
  const raw=JSON.parse(await readFile(new URL('quest-rewards-1.26.2.json',base),'utf8'));
  return verifyPublicQuestRewards(raw,verifyPublicQuestIndex(index));
}
test('currency and Loot Table Item IDs resolve only source-evidenced quests',async()=>{
  const reader=await source();
  const money=resolveQuestRewardItemDestination(reader,'80000000');
  assert(money);assert(money.questIds.includes('2070000672'));
  assert(money.currencyConfigurations>0);
  assert.equal(money.guaranteedGrant,false);
  assert.equal(money.playerOwnershipVerified,false);
  assert(Object.isFrozen(money.questIds));
  assert(Object.isFrozen(money));
  const loot=reader.questIdsWithEvidence.map(id=>reader.getQuest(id))
    .find(row=>row?.lootCandidates.length);
  assert(loot);
  const id=loot.lootCandidates[0].itemId;
  const match=resolveQuestRewardItemDestination(reader,id);
  assert(match?.questIds.includes(loot.questId));
  assert(match.lootCandidates>0);
  assert.equal(match.relationCount,match.currencyConfigurations+match.lootCandidates);
});
test('unknown, malformed and conflicting IDs do not produce a Quest attribution',async()=>{
  const reader=await source();
  for(const id of ['0','001','-1','not-an-id','__proto__',1.4,Number.MAX_SAFE_INTEGER+1,
    '9999999999999999',null]){
    assert.equal(resolveQuestRewardItemDestination(reader,id),null);
    assert.equal(guideQuestRewardItemHref(id),null);
  }
  assert.equal(guideQuestRewardItemHref('80000000','/Wand'),
    '/Wand/guide/quests/?item=80000000');
  assert.equal(guideQuestRewardItemHref(80000000),
    '/guide/quests/?item=80000000');
  assert.throws(()=>guideQuestRewardItemHref('80000000','https://example.com'),
    /DB03_QUEST_REWARD_NAVIGATION_BASE/);
  assert.throws(()=>resolveQuestRewardItemDestination({schema:'other'},'80000000'),
    /SOURCE_REQUIRED/);
});
test('Quest route handles Item-ID focus only after source reward verification',async()=>{
  const route=await readFile(new URL('../src/routes/guide/quests/+page.svelte',import.meta.url),'utf8');
  assert.match(route,/resolveQuestRewardItemDestination/);
  assert.match(route,/rewardIndex=data;\s*restoreAddressSelection\(\)/);
  assert.match(route,/url\.searchParams\.delete\('item'\)/);
  assert.match(route,/報酬候補に関連するクエスト/);
  assert.match(route,/questRewardInfo/);
});
