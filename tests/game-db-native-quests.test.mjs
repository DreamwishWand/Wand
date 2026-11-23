import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createDb00QuestReader,DB00_NATIVE_QUEST_CONTRACT
} from '../src/lib/game-db/native-quests.ts';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
import {verifyPublicQuestIndex}
  from '../src/lib/guide/public-guide.ts';
import {loadPublicQuestConditions,PUBLIC_QUEST_CONDITIONS_FILE}
  from '../src/lib/guide/public-quest-conditions.ts';
import {loadPublicQuestRewards,DB03_QUEST_REWARDS_FILE}
  from '../src/lib/guide/public-quest-rewards.ts';

const ROOT=new URL('../static/',import.meta.url);
const INDEX='quest-index.json';
function local({corruptRewards=false,missingRewards=false}={}){
  const requests=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    requests.push(url);
    if(missingRewards&&url.endsWith('/'+DB03_QUEST_REWARDS_FILE))
      return new Response('missing',{status:404});
    let bytes;
    try{bytes=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('missing',{status:404});}
    if(corruptRewards&&url.endsWith('/'+DB03_QUEST_REWARDS_FILE)){
      bytes=Buffer.from(bytes);bytes[80]^=1;
    }
    return new Response(bytes,{status:200});
  };
  return {requests,fetcher};
}
let shared;
const open=()=>shared??=openPublicSharedGameSources('/Wand',local().fetcher);

test('DB-00 733-Quest reader loads two optional SHA-pinned files and reuses already fetched Quest index and targets',async()=>{
  const f=local();
  const pub=await openPublicSharedGameSources('/Wand',f.fetcher);
  const start=f.requests.length;
  assert(start>0);
  assert.equal(f.requests.filter(x=>x.endsWith('/'+INDEX)).length,1);
  assert(!f.requests.some(x=>x.endsWith('/'+PUBLIC_QUEST_CONDITIONS_FILE)||
    x.endsWith('/'+DB03_QUEST_REWARDS_FILE)));
  const quests=await pub.loadNativeQuestSources();
  assert.equal(quests,await pub.loadNativeQuestSources());
  assert.equal(quests.contract,DB00_NATIVE_QUEST_CONTRACT);
  assert.equal(quests.snapshotId,pub.snapshotId);
  assert.equal(quests.originalQuests,733);
  assert.equal(quests.sourceTargetOccurrences,4897);
  assert.equal(quests.distinctTargetItemIds,2551);
  assert.equal(quests.sourceAdditionalRewardCandidates,330);
  assert.equal(quests.sourceCurrencyRewardOccurrences,65);
  assert.equal(quests.sourceConditionLeaves,2515);
  assert.equal(quests.sourceGameDefinitionsOnly,true);
  assert.equal(quests.playerProgressVerified,false);
  assert.equal(quests.runtimePrerequisitesVerified,false);
  assert.equal(quests.guaranteedRewardVerified,false);
  assert.equal(f.requests.length,start+2);
  assert.equal(f.requests.filter(x=>x.endsWith('/'+INDEX)).length,1);
  assert.equal(f.requests.filter(x=>x.endsWith('/'+PUBLIC_QUEST_CONDITIONS_FILE)).length,1);
  assert.equal(f.requests.filter(x=>x.endsWith('/'+DB03_QUEST_REWARDS_FILE)).length,1);
  assert.equal(pub.acquisition.coverage.combinedSourceRoutes,1255);
  assert(Object.isFrozen(quests));
});

test('733 Quest definitions preserve 4897 objective candidate positions and exactly 395 configured reward references',async()=>{
  const pub=await open();
  const quests=await pub.loadNativeQuestSources();
  let count=0,targets=0,rewards=0,withRewards=0,withTargets=0;
  for(let offset=0;;){
    const page=quests.searchQuests({offset,limit:37});
    assert.equal(page.scope,'steam_1262_original_quest_definitions_only');
    assert.equal(page.total,733);
    assert.equal(page.playerProgressVerified,false);
    assert.equal(page.runtimePrerequisitesVerified,false);
    assert.equal(page.guaranteedRewardVerified,false);
    for(const q of page.quests){
      count++;
      assert.equal(q.questId,q.sourceQuest.id);
      assert.equal(q.originalConditions.id,q.questId);
      assert.equal(q.staticGameDefinitionOnly,true);
      assert.equal(q.questUnlockedVerified,false);
      assert.equal(q.playerProgressVerified,false);
      assert.equal(q.guaranteedRewardVerified,false);
      assert(q.sourceCharacterNames&&q.sourceGroupNames);
      targets+=q.targetItemCandidates.length;
      rewards+=q.rewardItemCandidates.length;
      if(q.targetItemCandidates.length)withTargets++;
      if(q.originalRewards)withRewards++;
      assert(q.targetItemCandidates.every(x=>
        x.reference.questId===q.questId &&
        x.reference.itemId===x.item.itemId &&
        x.mandatoryRequirementVerified===false &&
        x.playerProgressVerified===false));
      assert(q.rewardItemCandidates.every(x=>
        x.reference.questId===q.questId &&
        x.reference.itemId===x.item.itemId &&
        x.reference.guaranteedGrant===false &&
        x.guaranteedGrant===false &&
        x.playerOwnershipVerified===false));
      assert(Object.isFrozen(q)&&Object.isFrozen(q.targetItemCandidates));
    }
    if(page.nextOffset===null)break;
    offset=page.nextOffset;
  }
  assert.equal(count,733);
  assert.equal(targets,4897);
  assert.equal(rewards,395);
  assert.equal(withRewards,247);
  assert.equal(withTargets,627);
  assert.equal(quests.getQuest(99999999),null);
});

test('Item ID backlinks distinguish Quest targets, alternative Items, configured loot and currency rewards',async()=>{
  const pub=await open();
  const reader=await pub.loadNativeQuestSources();
  const source=pub.guideQuestTargets;
  const targetItem=reader.searchQuests({questWithTargetCandidatesOnly:true})
    .quests.find(q=>q.targetItemCandidates.length>0)?.targetItemCandidates[0].item.itemId;
  assert(targetItem);
  const target=reader.getItem(targetItem);
  assert.equal(target.itemId,targetItem);
  assert.deepEqual(target.shared,pub.getItem(targetItem));
  assert.deepEqual(target.targetQuestReferences.map(x=>x.reference),
    source.getItemCandidates(targetItem));
  assert.equal(target.mandatoryRequirementVerified,false);
  assert.equal(target.guaranteedRewardVerified,false);
  assert.equal(target.playerOwnershipVerified,false);
  assert(target.targetQuestIds.every(id=>reader.getQuest(id)!==null));
  const currency=reader.getItem('80000000');
  assert(currency.rewardQuestReferences.length>0);
  assert(currency.rewardQuestReferences.every(row=>
    row.reference.kind==='currency_configuration'&&
    row.reference.currency!==null&&
    row.reference.configuredOnly===true &&
    row.guaranteedGrant===false));
  const missing=reader.getItem(99999999);
  assert.deepEqual(missing.targetQuestReferences,[]);
  assert.deepEqual(missing.rewardQuestReferences,[]);
  assert.deepEqual(missing.targetQuestIds,[]);
  assert.deepEqual(missing.rewardQuestIds,[]);
});

test('search uses exact 733 Quest identities, optional source-only reward and target filters, localized names',async()=>{
  const pub=await open();
  const reader=await pub.loadNativeQuestSources();
  const withRewards=reader.searchQuests({questWithRewardEvidenceOnly:true});
  assert.equal(withRewards.total,247);
  assert(withRewards.quests.every(q=>q.originalRewards!==null));
  const targets=reader.searchQuests({questWithTargetCandidatesOnly:true});
  assert.equal(targets.total,627);
  assert(targets.quests.every(q=>q.targetItemCandidates.length>0));
  const first=reader.searchQuests({limit:1}).quests[0];
  assert(first);
  assert(reader.searchQuests({text:first.questId}).quests.some(q=>
    q.questId===first.questId));
  assert(reader.searchQuests({text:first.sourceQuest.internalName}).quests.some(q=>
    q.questId===first.questId));
  assert(reader.searchQuests({locale:'ja'}).total===733);
  assert.equal(reader.searchQuests({text:'unknown_unreleased_quest'}).total,0);
  assert.throws(()=>reader.searchQuests({locale:'ko'}),/INVALID_LOCALE/);
  assert.throws(()=>reader.searchQuests({limit:251}),/INVALID_PAGE/);
  assert.throws(()=>reader.searchQuests({offset:-1}),/INVALID_PAGE/);
  assert.throws(()=>reader.searchQuests({questWithRewardEvidenceOnly:false}),
    /INVALID_REWARD_FILTER/);
  assert.throws(()=>reader.searchQuests({questWithTargetCandidatesOnly:false}),
    /INVALID_TARGET_FILTER/);
});

test('per-Item shared Quest evidence is cached, invalid IDs fail early, corrupted/missing optional source is rejected',async()=>{
  const f=local();
  const pub=await openPublicSharedGameSources('/Wand',f.fetcher);
  const count=f.requests.length;
  await assert.rejects(pub.getNativeQuestItemEvidence('01'),
    /invalid numeric Item ID/);
  assert.equal(f.requests.length,count);
  const linked=await pub.getNativeQuestItemEvidence(80000000);
  assert.equal(linked.itemId,'80000000');
  assert(linked.rewardQuestReferences.length>0);
  assert.equal(linked.staticSourceOnly,true);
  assert.equal(linked.guaranteedRewardVerified,false);
  assert.equal(linked.playerOwnershipVerified,false);
  assert.equal(f.requests.length,count+2);
  await pub.getNativeQuestItemEvidence(80000000);
  assert.equal(f.requests.length,count+2);
  const index=verifyPublicQuestIndex(JSON.parse(readFileSync(
    new URL('guide/public/'+INDEX,ROOT),'utf-8')));
  const originalConditions=await loadPublicQuestConditions(
    index,'/Wand/guide/public/'+PUBLIC_QUEST_CONDITIONS_FILE,local().fetcher);
  const originalRewards=await loadPublicQuestRewards(
    index,'/Wand/guide/public/'+DB03_QUEST_REWARDS_FILE,local().fetcher);
  assert.throws(()=>createDb00QuestReader(
    pub.database,pub.joined,index,{...originalConditions},originalRewards,
    pub.guideQuestTargets
  ),/PINNED_DB03_QUEST_SOURCE_FAMILIES_REQUIRED|ORIGINAL_QUEST_ID/);
  const bad=await openPublicSharedGameSources('/Wand',
    local({corruptRewards:true}).fetcher);
  await assert.rejects(bad.loadNativeQuestSources(),
    /DB03_PUBLIC_QUEST_REWARDS_PUBLISHED_SHA_MISMATCH/);
  const missing=await openPublicSharedGameSources('/Wand',
    local({missingRewards:true}).fetcher);
  await assert.rejects(missing.loadNativeQuestSources(),
    /DB03_PUBLIC_QUEST_REWARDS_DOWNLOAD_FAILED/);
  assert.equal(missing.database.itemCount,13202);
});
