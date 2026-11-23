import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.ts';
import {verifyPublicQuestRewards} from '../src/lib/guide/public-quest-rewards.ts';
import {verifyPublicQuestOverrideLoot} from '../src/lib/guide/public-quest-override-loot.ts';
import {verifyPublicQuestRewardItemLabels} from '../src/lib/guide/public-quest-reward-item-labels.ts';
import {resolveQuestRewardNameMatches} from '../src/lib/guide/quest-reward-name-search.ts';
import {resolveQuestRewardItemDestination} from '../src/lib/guide/quest-reward-navigation.ts';

const root=new URL('../static/guide/public/',import.meta.url);
const read=async filename=>JSON.parse(await readFile(new URL(filename,root),'utf8'));
async function fixture(){
  const index=verifyPublicQuestIndex(await read('quest-index.json'));
  const rewards=verifyPublicQuestRewards(await read('quest-rewards-1.26.2.json'),index);
  const overrides=verifyPublicQuestOverrideLoot(
    await read('quest-override-loot-candidates-1.26.2.json'),rewards);
  const labels=verifyPublicQuestRewardItemLabels(
    await read('quest-reward-item-labels-1.26.2.json'),rewards,overrides);
  return {rewards,overrides,labels};
}
test('Japanese and English reward name searches resolve the exact original Quest candidates',async()=>{
  const {rewards,overrides,labels}=await fixture();
  const search=(text,language='ja')=>
    resolveQuestRewardNameMatches(rewards,overrides,labels,text,language);
  for(const query of ['リンゴ','apple','  APPLE  ','Ａｐｐｌｅ']){
    const hit=search(query);
    assert.deepEqual(hit?.itemIds,['30200002'],query);
    assert.deepEqual(hit?.questIds,['2070001383'],query);
    assert.equal(hit?.staticSourceOnly,true);
    assert.equal(hit?.grantedVerified,false);
    assert.equal(hit?.ownershipVerified,false);
    assert(Object.isFrozen(hit));
    assert(Object.isFrozen(hit.itemIds));
    assert(Object.isFrozen(hit.questIds));
  }
  const mine=search('Mine Cart Popcorn');
  assert.deepEqual(mine?.itemIds,['40004032']);
  assert.deepEqual(mine?.questIds,['2070001245']);
  assert.equal(mine?.relationCount,1);
  const bucket=search('ポップコーンバケット');
  assert.equal(bucket?.itemIds.length,4);
  assert.deepEqual(new Set(bucket?.questIds),new Set([
    '2070001534','2070001245','2070001248'
  ]));
  assert(bucket?.itemIds.includes('40004032'),
    'the historically distinct override Loot Table candidate remains independently discoverable');
  assert.deepEqual(search('apple','xx')?.questIds,['2070001383'],
    'unknown locale safely falls back to the published English label');
});
test('all localized name hits are validated through the original 399 reward relations',async()=>{
  const {rewards,overrides,labels}=await fixture();
  const sources=new Set();
  let checked=0;
  for(const id of labels.publishedItemIds){
    const name=labels.getDisplayName(id,'ja');
    const result=resolveQuestRewardNameMatches(rewards,overrides,labels,name,'ja');
    assert(result?.itemIds.includes(id),id);
    const relation=resolveQuestRewardItemDestination(rewards,id,overrides);
    assert(relation?.questIds.length>0,id);
    for(const questId of relation.questIds){
      assert(result.questIds.includes(questId),name+' / '+questId);
    }
    sources.add(id);checked++;
  }
  assert.equal(checked,281);
  assert.equal(sources.size,281);
});
test('reject invalid, numeric-only and unverified names without fabricated Quest rewards',async()=>{
  const {rewards,overrides,labels}=await fixture();
  const search=(q)=>resolveQuestRewardNameMatches(rewards,overrides,labels,q,'ja');
  for(const q of ['',' ','a','卵','80000000','40004032','00040004032',
    'unpublished fake item name','\u0000',null,{},'A'.repeat(121)]){
    assert.equal(search(q),null,String(q));
  }
  assert.equal(search('ポップコーンバケット').ownershipVerified,false);
  assert.throws(()=>resolveQuestRewardNameMatches(
    {...rewards,schema:'forged'},overrides,labels,'リンゴ','ja'),
    /VERIFIED_SOURCES_REQUIRED/);
  assert.throws(()=>resolveQuestRewardNameMatches(
    rewards,{...overrides,gameVersion:'1.26.1'},labels,'リンゴ','ja'),
    /VERIFIED_SOURCES_REQUIRED/);
  assert.throws(()=>resolveQuestRewardNameMatches(
    rewards,overrides,{...labels,publishedItemIds:['30200002']},'リンゴ','ja'),
    /VERIFIED_SOURCES_REQUIRED/);
});
