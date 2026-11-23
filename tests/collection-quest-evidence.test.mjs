import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeCollectionQuests}
  from '../src/lib/collection/quest-evidence.ts';
import {collectionQuestCopy}
  from '../src/lib/collection/quest-copy.ts';
import {UI_LANGUAGES} from '../src/lib/ui/preferences.ts';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';

const ID='40005160';
const QUEST='2070000620';
const baseFlags={
  staticSourceOnly:true,mandatoryRequirementVerified:false,
  guaranteedRewardVerified:false,currentAvailabilityVerified:false,
  playerOwnershipVerified:false
};
function target(role='direct',overrides={}){
  return {
    reference:{itemId:ID,questId:QUEST,role,sourceCandidateOnly:true,
      mandatoryRequirementVerified:false,playerProgressVerified:false,...overrides},
    sourceCandidateOnly:true,mandatoryRequirementVerified:false,
    playerProgressVerified:false
  };
}
function reward(kind='additional_loot_candidate',overrides={}){
  return {
    reference:{itemId:ID,questId:QUEST,kind,configuredOnly:true,
      guaranteedGrant:false,playerOwnershipVerified:false,...overrides},
    configuredSourceOnly:true,guaranteedGrant:false,playerOwnershipVerified:false
  };
}
function fixture(targets=[],rewards=[]){
  return {
    itemId:ID,shared:{itemId:ID},...baseFlags,
    targetQuestReferences:targets,rewardQuestReferences:rewards,
    targetQuestIds:[...new Set(targets.map(x=>x.reference.questId))],
    rewardQuestIds:[...new Set(rewards.map(x=>x.reference.questId))]
  };
}
function reader(overrides={}){
  return {
    contract:'wand.game-db.native-quest-evidence@1',
    snapshotId:'steam-1.26.2-native-itemlist-v1',
    originalQuests:733,sourceTargetOccurrences:4897,
    sourceAdditionalRewardCandidates:330,
    sourceCurrencyRewardOccurrences:65,
    sourceGameDefinitionsOnly:true,playerProgressVerified:false,
    runtimePrerequisitesVerified:false,guaranteedRewardVerified:false,
    getQuest(questId){
      return {
        questId,sourceQuest:{id:questId,
          names:{ja:'検証済みクエスト',en:'Verified Quest'},internalName:'OriginalName'},
        staticGameDefinitionOnly:true,runtimePrerequisitesVerified:false,
        questUnlockedVerified:false,playerProgressVerified:false,
        guaranteedRewardVerified:false
      };
    },
    ...overrides
  };
}

test('repeated source positions map to one Quest with separate objective/reward roles',()=>{
  const value=summarizeCollectionQuests(
    fixture([target(),target('alternative')],[reward(),reward('currency_configuration')]),
    reader()
  );
  assert.deepEqual(value,{
    itemId:Number(ID),
    targets:[{
      questId:QUEST,names:{ja:'検証済みクエスト',en:'Verified Quest'},
      internalName:'OriginalName'
    }],
    rewards:[{
      questId:QUEST,names:{ja:'検証済みクエスト',en:'Verified Quest'},
      internalName:'OriginalName'
    }],
    staticSourceOnly:true,mandatoryRequirementVerified:false,
    guaranteedRewardVerified:false,playerProgressVerified:false
  });
  assert(Object.isFrozen(value));
  assert(Object.isFrozen(value.targets));
  assert(Object.isFrozen(value.rewards));
});

test('unlinked Item is unknown, never a claim that the item has no Quest usage',()=>{
  const result=summarizeCollectionQuests(fixture(),reader());
  assert.deepEqual(result.targets,[]);
  assert.deepEqual(result.rewards,[]);
  assert.equal(result.playerProgressVerified,false);
});

test('fake progress, guaranteed grants, mismatched IDs or forged Quest evidence fail closed',()=>{
  const a=fixture([target()]);a.playerOwnershipVerified=true;
  assert.throws(()=>summarizeCollectionQuests(a,reader()),/SOURCE_ONLY_ITEM_REQUIRED/);
  const b=fixture([target('direct',{mandatoryRequirementVerified:true})]);
  assert.throws(()=>summarizeCollectionQuests(b,reader()),/TARGET_CANDIDATE_MISMATCH/);
  const c=fixture([],[reward('additional_loot_candidate',{guaranteedGrant:true})]);
  assert.throws(()=>summarizeCollectionQuests(c,reader()),/REWARD_CANDIDATE_MISMATCH/);
  const d=fixture([target('other')]);
  assert.throws(()=>summarizeCollectionQuests(d,reader()),/TARGET_CANDIDATE_MISMATCH/);
  const e=fixture([target()]);e.targetQuestIds=['999999'];
  assert.throws(()=>summarizeCollectionQuests(e,reader()),/REVERSE_QUEST_ID_MISMATCH/);
  const f=fixture([target()]);
  assert.throws(()=>summarizeCollectionQuests(f,reader({
    getQuest:()=>null
  })),/SOURCE_QUEST_ID_MISMATCH/);
  assert.throws(()=>summarizeCollectionQuests(f,reader({
    sourceGameDefinitionsOnly:false
  })),/PINNED_QUEST_READER_REQUIRED/);
  const g=fixture([],[reward()]);
  assert.throws(()=>summarizeCollectionQuests(g,reader({
    getQuest:(id)=>({...reader().getQuest(id),guaranteedRewardVerified:true})
  })),/SOURCE_QUEST_ID_MISMATCH/);
});

test('all eight locales provide the compact candidate and navigation messages',()=>{
  assert.equal(UI_LANGUAGES.length,8);
  for(const {code} of UI_LANGUAGES){
    const copy=collectionQuestCopy(code);
    for(const label of Object.values(copy))
      assert(typeof label==='string'&&label.trim().length>0,code);
    assert.notEqual(copy.targetHeading,copy.rewardHeading,code);
    assert.notEqual(copy.empty,copy.caution,code);
  }
  assert.equal(collectionQuestCopy('en').title,'Related quests');
  assert.equal(collectionQuestCopy('__proto__'),collectionQuestCopy('ja'));
});

test('real Steam v1.26.2 Quest Item backlinks link to verified original Quest IDs only on demand',async()=>{
  const seen=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    seen.push(url);
    try{
      const bytes=readFileSync(new URL(url.slice(6),new URL('../static/',import.meta.url)));
      return new Response(bytes,{status:200});
    }catch{return new Response('missing',{status:404});}
  };
  const shared=await openPublicSharedGameSources('/Wand',fetcher);
  assert.equal(shared.database.target.gameVersion,'1.26.2');
  const before=seen.length;
  assert(!seen.some(url=>url.endsWith('quest-conditions-1.26.2-v2.json.gz.b64')),
    'native Quest condition data must stay lazy');
  const quests=await shared.loadNativeQuestSources();
  assert.equal(quests.originalQuests,733);
  const chosen=quests.searchQuests({questWithTargetCandidatesOnly:true,limit:1}).quests[0];
  assert(chosen?.targetItemCandidates.length>0);
  const id=chosen.targetItemCandidates[0].item.itemId;
  const evidence=await shared.getNativeQuestItemEvidence(id);
  const result=summarizeCollectionQuests(evidence,quests);
  assert.equal(result.itemId,Number(id));
  assert(result.targets.some(q=>q.questId===chosen.questId));
  assert(result.targets.every(q=>q.names&&q.internalName));
  assert.equal(result.guaranteedRewardVerified,false);
  assert.equal(result.playerProgressVerified,false);
  assert.equal(seen.length,before+1);
  const second=summarizeCollectionQuests(
    await shared.getNativeQuestItemEvidence(id),quests);
  assert.deepEqual(second,result);
  assert.equal(seen.length,before+1,'verified Quest source fetches are deduplicated');
});
