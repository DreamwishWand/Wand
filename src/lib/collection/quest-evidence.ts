/** Collection's compact source-only Quest backlinks.
 * DB-00 and DB-03 own actual source validation; Collection never infers
 * mandatory requirements, quest progress or guaranteed reward grants. */
import type {
  Db00QuestItemEvidence,Db00QuestReader
} from '../game-db/native-quests.ts';
import type {PublicGuideNames} from '../guide/public-guide.ts';

export interface CollectionRelatedQuest {
  readonly questId:string;
  readonly names:PublicGuideNames;
  readonly internalName:string;
}
export interface CollectionQuestSummary {
  readonly itemId:number;
  /** Candidate objectives, including original direct AND alternative roles. */
  readonly targets:readonly CollectionRelatedQuest[];
  /** Configured currencies and additional loot candidates, never grants. */
  readonly rewards:readonly CollectionRelatedQuest[];
  readonly staticSourceOnly:true;
  readonly mandatoryRequirementVerified:false;
  readonly guaranteedRewardVerified:false;
  readonly playerProgressVerified:false;
}

const ID=/^[1-9][0-9]{0,15}$/;
function ensure(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('COLLECTION_QUEST_'+reason);
}
function validId(raw:unknown):raw is string{
  return typeof raw==='string'&&ID.test(raw)&&
    Number.isSafeInteger(Number(raw));
}

export function summarizeCollectionQuests(
  item:Readonly<Db00QuestItemEvidence>,
  reader:Readonly<Db00QuestReader>
):CollectionQuestSummary {
  ensure(reader?.contract==='wand.game-db.native-quest-evidence@1'&&
    reader.snapshotId==='steam-1.26.2-native-itemlist-v1'&&
    reader.originalQuests===733&&
    reader.sourceTargetOccurrences===4897&&
    reader.sourceAdditionalRewardCandidates===330&&
    reader.sourceCurrencyRewardOccurrences===65&&
    reader.sourceGameDefinitionsOnly===true&&
    reader.playerProgressVerified===false&&
    reader.runtimePrerequisitesVerified===false&&
    reader.guaranteedRewardVerified===false,
    'PINNED_QUEST_READER_REQUIRED');
  ensure(validId(item?.itemId)&&
    item.shared?.itemId===item.itemId&&
    item.staticSourceOnly===true&&
    item.mandatoryRequirementVerified===false&&
    item.guaranteedRewardVerified===false&&
    item.currentAvailabilityVerified===false&&
    item.playerOwnershipVerified===false,
    'SOURCE_ONLY_ITEM_REQUIRED');

  const targetIds: string[]=[];
  const rewardIds: string[]=[];
  for(const entry of item.targetQuestReferences){
    const ref=entry?.reference;
    ensure(validId(ref?.questId)&&ref.itemId===item.itemId&&
      ref.sourceCandidateOnly===true&&
      ref.mandatoryRequirementVerified===false&&
      ref.playerProgressVerified===false&&
      (ref.role==='direct'||ref.role==='alternative')&&
      entry.sourceCandidateOnly===true&&
      entry.mandatoryRequirementVerified===false&&
      entry.playerProgressVerified===false,
      'TARGET_CANDIDATE_MISMATCH');
    targetIds.push(ref.questId);
  }
  for(const entry of item.rewardQuestReferences){
    const ref=entry?.reference;
    ensure(validId(ref?.questId)&&ref.itemId===item.itemId&&
      (ref.kind==='currency_configuration'||
       ref.kind==='additional_loot_candidate')&&
      ref.configuredOnly===true&&
      ref.guaranteedGrant===false&&
      ref.playerOwnershipVerified===false&&
      entry.configuredSourceOnly===true&&
      entry.guaranteedGrant===false&&
      entry.playerOwnershipVerified===false,
      'REWARD_CANDIDATE_MISMATCH');
    rewardIds.push(ref.questId);
  }
  const uniqueTargets=[...new Set(targetIds)];
  const uniqueRewards=[...new Set(rewardIds)];
  ensure(item.targetQuestIds.length===uniqueTargets.length&&
    item.targetQuestIds.every((id,i)=>id===uniqueTargets[i])&&
    item.rewardQuestIds.length===uniqueRewards.length&&
    item.rewardQuestIds.every((id,i)=>id===uniqueRewards[i]),
    'REVERSE_QUEST_ID_MISMATCH');

  function named(questId:string):CollectionRelatedQuest{
    const quest=reader.getQuest(questId);
    ensure(quest!==null&&quest.questId===questId&&
      quest.sourceQuest.id===questId&&
      quest.staticGameDefinitionOnly===true&&
      quest.runtimePrerequisitesVerified===false&&
      quest.questUnlockedVerified===false&&
      quest.playerProgressVerified===false&&
      quest.guaranteedRewardVerified===false,
      'SOURCE_QUEST_ID_MISMATCH');
    return Object.freeze({
      questId,names:quest.sourceQuest.names,
      internalName:quest.sourceQuest.internalName
    });
  }
  return Object.freeze({
    itemId:Number(item.itemId),
    targets:Object.freeze(uniqueTargets.map(named)),
    rewards:Object.freeze(uniqueRewards.map(named)),
    staticSourceOnly:true as const,
    mandatoryRequirementVerified:false as const,
    guaranteedRewardVerified:false as const,
    playerProgressVerified:false as const
  });
}
