/** Source-authenticated Item ID -> public Quest reward candidate deep links.
 * This resolves configured currency and Loot Table candidates, never grants,
 * eligibility, player ownership, or live rewards.
 */
import type {PublicQuestRewardsReader} from './public-quest-rewards.ts';

export const DB03_QUEST_REWARD_NAVIGATION_SCHEMA='wand.db03.quest-reward-navigation@1' as const;
const ITEM_ID=/^[1-9][0-9]{0,15}$/;
function canonical(value:unknown):string|null{
  const id=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  return typeof id==='string'&&ITEM_ID.test(id)&&
    Number.isSafeInteger(Number(id))?id:null;
}
export interface QuestRewardItemDestination {
  readonly itemId:string;
  readonly questIds:readonly string[];
  readonly relationCount:number;
  readonly currencyConfigurations:number;
  readonly lootCandidates:number;
  readonly staticSourceOnly:true;
  readonly guaranteedGrant:false;
  readonly playerOwnershipVerified:false;
}
/** Nonexistent Item IDs return null, not a claim that the game has no reward. */
export function resolveQuestRewardItemDestination(
  reader:PublicQuestRewardsReader,rawId:unknown
):QuestRewardItemDestination|null{
  if(reader?.schema!=='wand.db03.public-quest-rewards@1'||
    reader.coverage?.quests!==733||reader.coverage?.additionalItemOccurrences!==330||
    reader.coverage?.currencyOccurrences!==65||typeof reader.getItemCandidates!=='function')
    throw new TypeError('DB03_QUEST_REWARD_NAVIGATION_SOURCE_REQUIRED');
  const itemId=canonical(rawId);
  if(itemId===null)return null;
  const relations=reader.getItemCandidates(itemId);
  if(!relations.length)return null;
  const ids=new Set<string>();
  let currency=0,loot=0;
  for(const row of relations){
    if(row.itemId!==itemId||row.configuredOnly!==true||row.guaranteedGrant!==false||
      row.playerOwnershipVerified!==false||!/^\d+$/.test(row.questId))
      throw new TypeError('DB03_QUEST_REWARD_NAVIGATION_UNVERIFIED_RELATION');
    if(row.kind==='currency_configuration'&&row.currency?.itemId===itemId)currency++;
    else if(row.kind==='additional_loot_candidate'&&row.loot?.itemId===itemId)loot++;
    else throw new TypeError('DB03_QUEST_REWARD_NAVIGATION_UNKNOWN_RELATION');
    ids.add(row.questId);
  }
  return Object.freeze({itemId,questIds:Object.freeze([...ids]),
    relationCount:relations.length,currencyConfigurations:currency,
    lootCandidates:loot,staticSourceOnly:true as const,
    guaranteedGrant:false as const,playerOwnershipVerified:false as const});
}
/** Consumers should confirm source membership before presenting this as a reward link. */
export function guideQuestRewardItemHref(rawId:unknown,base=''):string|null{
  const itemId=canonical(rawId);
  if(itemId===null)return null;
  if(typeof base!=='string'||!/^\/?(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(base))
    throw new TypeError('DB03_QUEST_REWARD_NAVIGATION_BASE');
  const root=base===''?'':('/'+base.replace(/^\/+|\/+$/g,''));
  return root+'/guide/quests/?item='+itemId;
}
