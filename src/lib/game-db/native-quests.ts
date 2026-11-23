/**
 * DB-00 source-only Quest / Item ID crosswalk for public Steam v1.26.2.
 *
 * The original 733-Quest index, objective Item references, availability
 * clauses and reward candidates are independently checked by DB-03.
 * These are GAME DEFINITIONS: not resolved save progress, current unlock,
 * obtainable Items, guaranteed rewards or player entitlements.
 */
import {canonicalId} from './model.ts';
import type {DbLocale,SharedGameDatabase} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem}
  from './source-join.ts';
import {
  verifyPublicQuestIndex,PUBLIC_GUIDE_INDEX_SCHEMA,
  PUBLIC_GUIDE_SOURCE_SHA,type PublicQuestIndex,type PublicQuestIndexRow,
  type PublicGuideNames
} from '../guide/public-guide.ts';
import {
  PUBLIC_QUEST_CONDITIONS_SCHEMA,
  type PublicQuestConditionReader,type PublicQuestConditionRecord
} from '../guide/public-quest-conditions.ts';
import {
  DB03_QUEST_REWARDS_SCHEMA,
  type PublicQuestRewardsReader,type QuestRewardInfo,
  type QuestItemRewardRelation
} from '../guide/public-quest-rewards.ts';
import {
  DB03_QUEST_TARGET_REVERSE_SCHEMA,
  type PublicQuestTargetReverseReader,type QuestTargetItemReference
} from '../guide/public-quest-target-reverse.ts';

export const DB00_NATIVE_QUEST_CONTRACT=
  'wand.game-db.native-quest-evidence@1' as const;
const LOCALES=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
function assert(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB00_NATIVE_QUEST_'+reason);
}
export interface Db00QuestItemTarget{
  readonly reference:QuestTargetItemReference;
  readonly item:Db00SourceJoinedItem;
  readonly sourceCandidateOnly:true;
  readonly mandatoryRequirementVerified:false;
  readonly playerProgressVerified:false;
}
export interface Db00QuestItemReward{
  readonly reference:QuestItemRewardRelation;
  readonly item:Db00SourceJoinedItem;
  readonly configuredSourceOnly:true;
  readonly guaranteedGrant:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00QuestDefinition{
  readonly questId:string;
  readonly sourceQuest:PublicQuestIndexRow;
  readonly sourceCharacterNames:PublicGuideNames;
  readonly sourceGroupNames:PublicGuideNames;
  readonly originalConditions:PublicQuestConditionRecord;
  /** null = no verified explicit reward record, not no rewards in game. */
  readonly originalRewards:QuestRewardInfo|null;
  readonly targetItemCandidates:readonly Db00QuestItemTarget[];
  readonly rewardItemCandidates:readonly Db00QuestItemReward[];
  readonly staticGameDefinitionOnly:true;
  readonly runtimePrerequisitesVerified:false;
  readonly questUnlockedVerified:false;
  readonly playerProgressVerified:false;
  readonly guaranteedRewardVerified:false;
}
export interface Db00QuestItemEvidence{
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly targetQuestReferences:readonly Db00QuestItemTarget[];
  readonly rewardQuestReferences:readonly Db00QuestItemReward[];
  readonly targetQuestIds:readonly string[];
  readonly rewardQuestIds:readonly string[];
  readonly staticSourceOnly:true;
  readonly mandatoryRequirementVerified:false;
  readonly guaranteedRewardVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00QuestSearchRequest{
  readonly text?:string;
  readonly locale?:DbLocale;
  readonly questWithRewardEvidenceOnly?:true;
  readonly questWithTargetCandidatesOnly?:true;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00QuestPage{
  readonly scope:'steam_1262_original_quest_definitions_only';
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly quests:readonly Db00QuestDefinition[];
  readonly playerProgressVerified:false;
  readonly runtimePrerequisitesVerified:false;
  readonly guaranteedRewardVerified:false;
}
export interface Db00QuestReader{
  readonly contract:typeof DB00_NATIVE_QUEST_CONTRACT;
  readonly snapshotId:string;
  readonly originalQuests:733;
  readonly sourceTargetOccurrences:4897;
  readonly distinctTargetItemIds:2551;
  readonly sourceAdditionalRewardCandidates:330;
  readonly sourceCurrencyRewardOccurrences:65;
  readonly sourceConditionLeaves:2515;
  readonly sourceGameDefinitionsOnly:true;
  readonly playerProgressVerified:false;
  readonly runtimePrerequisitesVerified:false;
  readonly guaranteedRewardVerified:false;
  getQuest(questId:string|number):Db00QuestDefinition|null;
  getItem(itemId:string|number):Db00QuestItemEvidence;
  searchQuests(request?:Db00QuestSearchRequest):Db00QuestPage;
}

export function createDb00QuestReader(
  database:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  catalogue:PublicQuestIndex,
  conditions:PublicQuestConditionReader,
  rewards:PublicQuestRewardsReader,
  targets:PublicQuestTargetReverseReader
):Db00QuestReader {
  assert(database?.contract==='wand.game-db.shared@1' &&
    database.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    database.itemCount===13202 &&
    database.target.platform==='Steam' &&
    database.target.gameVersion==='1.26.2' &&
    joined?.contract==='wand.game-db.source-join@1' &&
    joined.snapshotId===database.snapshotId,
    'CURRENT_ITEMLIST_REQUIRED');
  const index=verifyPublicQuestIndex(catalogue);
  assert(index.schema===PUBLIC_GUIDE_INDEX_SCHEMA &&
    index.provenance.missionFullFileSha256===PUBLIC_GUIDE_SOURCE_SHA &&
    index.provenance.sourceIsStaticNotPlayerProgress===true &&
    index.counts.quests===733 &&
    index.counts.steps===7878 &&
    index.counts.objectives===11782 &&
    index.quests.length===733 &&
    conditions?.schema===PUBLIC_QUEST_CONDITIONS_SCHEMA &&
    conditions.targetVersion==='1.26.2' &&
    conditions.sourceProjectionVersion==='1.26.1' &&
    conditions.coverage.quests===733 &&
    conditions.coverage.leaves===2515 &&
    conditions.coverage.runtimePrerequisitesVerified===false &&
    conditions.coverage.sourceIsStaticNotPlayerProgress===true &&
    targets?.schema===DB03_QUEST_TARGET_REVERSE_SCHEMA &&
    targets.coverage.knownQuests===733 &&
    targets.coverage.sourceTargetObjectives===4869 &&
    targets.coverage.sourceCandidateOccurrences===4897 &&
    targets.coverage.distinctItemIds===2551 &&
    targets.coverage.directOccurrences===4641 &&
    targets.coverage.alternativeOccurrences===256 &&
    targets.coverage.mandatoryRequirementVerified===false &&
    targets.coverage.playerProgressVerified===false &&
    rewards?.schema===DB03_QUEST_REWARDS_SCHEMA &&
    rewards.coverage.quests===733 &&
    rewards.coverage.questRowsWithAnyRewardEvidence===247 &&
    rewards.coverage.additionalItemOccurrences===330 &&
    rewards.coverage.currencyOccurrences===65 &&
    rewards.coverage.runtimeGrantsVerified===false &&
    rewards.coverage.allRewardsKnown===false,
    'PINNED_DB03_QUEST_SOURCE_FAMILIES_REQUIRED');
  const questById=new Map(index.quests.map(q=>[q.id,q]));
  assert(questById.size===733,'ORIGINAL_QUEST_ID_CENSUS');

  function getQuest(raw:string|number):Db00QuestDefinition|null{
    const questId=canonicalId(raw);
    const sourceQuest=questById.get(questId);
    if(!sourceQuest)return null;
    const originalConditions=conditions.getQuest(questId);
    const originalRewards=rewards.getQuest(questId);
    assert(originalConditions?.id===questId &&
      sourceQuest.characterId in index.characters &&
      sourceQuest.groupId in index.groups &&
      (originalRewards===null||(
        originalRewards.questId===questId &&
        originalRewards.staticSourceOnly===true &&
        originalRewards.guaranteedGrant===false)),
      'ORIGINAL_QUEST_ID_OR_CONDITION_MISMATCH');
    const targetItemCandidates=Object.freeze(
      targets.getQuestCandidates(questId).map(ref=>{
        const item=joined.getItem(ref.itemId);
        assert(ref.questId===questId && item.itemId===ref.itemId &&
          ref.sourceCandidateOnly===true &&
          ref.mandatoryRequirementVerified===false &&
          ref.playerProgressVerified===false,
          'QUEST_TARGET_ID_MISMATCH');
        return Object.freeze({
          reference:ref,item,sourceCandidateOnly:true as const,
          mandatoryRequirementVerified:false as const,
          playerProgressVerified:false as const
        });
      })
    );
    const rewardItemIds=new Set([
      ...(originalRewards?.currencies??[]).map(x=>x.itemId),
      ...(originalRewards?.lootCandidates??[]).map(x=>x.itemId)
    ]);
    const rewardItemCandidates=Object.freeze([...rewardItemIds].flatMap(id=>
      rewards.getItemCandidates(id).filter(
        relation=>relation.questId===questId
      )).map(ref=>{
      const item=joined.getItem(ref.itemId);
      assert(ref.questId===questId && item.itemId===ref.itemId &&
        ref.configuredOnly===true && ref.guaranteedGrant===false &&
        ref.playerOwnershipVerified===false,
        'QUEST_REWARD_ID_MISMATCH');
      return Object.freeze({
        reference:ref,item,configuredSourceOnly:true as const,
        guaranteedGrant:false as const,
        playerOwnershipVerified:false as const
      });
    }));
    return Object.freeze({
      questId,sourceQuest,
      sourceCharacterNames:index.characters[sourceQuest.characterId],
      sourceGroupNames:index.groups[sourceQuest.groupId].names,
      originalConditions,originalRewards,
      targetItemCandidates,rewardItemCandidates,
      staticGameDefinitionOnly:true as const,
      runtimePrerequisitesVerified:false as const,
      questUnlockedVerified:false as const,
      playerProgressVerified:false as const,
      guaranteedRewardVerified:false as const
    });
  }
  function getItem(raw:string|number):Db00QuestItemEvidence {
    const itemId=canonicalId(raw);
    const shared=joined.getItem(itemId);
    const targetRefs=targets.getItemCandidates(itemId);
    const rewardRefs=rewards.getItemCandidates(itemId);
    const targetQuestReferences=Object.freeze(targetRefs.map(ref=>{
      const item=joined.getItem(ref.itemId);
      assert(item.itemId===itemId && questById.has(ref.questId) &&
        ref.sourceCandidateOnly===true &&
        ref.mandatoryRequirementVerified===false,
        'ITEM_TARGET_REVERSE_MISMATCH');
      return Object.freeze({
        reference:ref,item,sourceCandidateOnly:true as const,
        mandatoryRequirementVerified:false as const,
        playerProgressVerified:false as const
      });
    }));
    const rewardQuestReferences=Object.freeze(rewardRefs.map(ref=>{
      const item=joined.getItem(ref.itemId);
      assert(item.itemId===itemId && questById.has(ref.questId) &&
        ref.configuredOnly===true && ref.guaranteedGrant===false,
        'ITEM_REWARD_REVERSE_MISMATCH');
      return Object.freeze({
        reference:ref,item,configuredSourceOnly:true as const,
        guaranteedGrant:false as const,
        playerOwnershipVerified:false as const
      });
    }));
    assert(shared.itemId===itemId &&
      shared.currentlyAvailableVerified===false &&
      shared.playerOwnershipVerified===false,
      'ITEM_SHARED_STATUS_MISMATCH');
    return Object.freeze({
      itemId,shared,targetQuestReferences,rewardQuestReferences,
      targetQuestIds:Object.freeze([...new Set(
        targetQuestReferences.map(x=>x.reference.questId))]),
      rewardQuestIds:Object.freeze([...new Set(
        rewardQuestReferences.map(x=>x.reference.questId))]),
      staticSourceOnly:true as const,
      mandatoryRequirementVerified:false as const,
      guaranteedRewardVerified:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const
    });
  }
  function searchQuests(request:Db00QuestSearchRequest={}):Db00QuestPage {
    assert(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const locale=request.locale??'en';
    assert(LOCALES.has(locale),'INVALID_LOCALE');
    const raw=request.text??'';
    assert(typeof raw==='string'&&raw.length<=120 &&
      !/[\x00-\x1f]/.test(raw),'INVALID_TEXT');
    assert(request.questWithRewardEvidenceOnly===undefined ||
      request.questWithRewardEvidenceOnly===true,
      'INVALID_REWARD_FILTER');
    assert(request.questWithTargetCandidatesOnly===undefined ||
      request.questWithTargetCandidatesOnly===true,
      'INVALID_TARGET_FILTER');
    const offset=request.offset??0,limit=request.limit??60;
    assert(Number.isSafeInteger(offset)&&offset>=0 &&
      Number.isSafeInteger(limit)&&limit>0&&limit<=250,
      'INVALID_PAGE');
    const needle=raw.normalize('NFKC').toLocaleLowerCase().trim();
    const qs=index.quests.filter(row=>{
      if(request.questWithRewardEvidenceOnly&&!rewards.getQuest(row.id))
        return false;
      if(request.questWithTargetCandidatesOnly &&
        targets.getQuestCandidates(row.id).length===0)return false;
      if(!needle)return true;
      return row.id.startsWith(needle) ||
        row.internalName.normalize('NFKC').toLocaleLowerCase().includes(needle) ||
        !!row.names[locale]?.normalize('NFKC').toLocaleLowerCase()
          .includes(needle) ||
        !!index.characters[row.characterId]?.[locale]?.normalize('NFKC')
          .toLocaleLowerCase().includes(needle);
    });
    const quests=Object.freeze(qs.slice(offset,offset+limit).map(
      row=>getQuest(row.id)!
    ));
    const next=offset+quests.length;
    return Object.freeze({
      scope:'steam_1262_original_quest_definitions_only' as const,
      snapshotId:database.snapshotId,total:qs.length,offset,
      nextOffset:next<qs.length?next:null,quests,
      playerProgressVerified:false as const,
      runtimePrerequisitesVerified:false as const,
      guaranteedRewardVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_NATIVE_QUEST_CONTRACT,
    snapshotId:database.snapshotId,
    originalQuests:733 as const,
    sourceTargetOccurrences:4897 as const,
    distinctTargetItemIds:2551 as const,
    sourceAdditionalRewardCandidates:330 as const,
    sourceCurrencyRewardOccurrences:65 as const,
    sourceConditionLeaves:2515 as const,
    sourceGameDefinitionsOnly:true as const,
    playerProgressVerified:false as const,
    runtimePrerequisitesVerified:false as const,
    guaranteedRewardVerified:false as const,
    getQuest,getItem,searchQuests
  });
}
