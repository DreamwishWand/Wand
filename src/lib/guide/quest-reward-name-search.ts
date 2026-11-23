/** Localized reward-name -> original Quest candidates, using only pinned
 * public DB-00 Item names and independently validated native reward relations.
 * A match means configured source evidence, never an awarded/owned Item.
 */
import type {PublicQuestRewardItemLabels} from './public-quest-reward-item-labels.ts';
import type {PublicQuestRewardsReader} from './public-quest-rewards.ts';
import type {QuestOverrideLootIndex} from './public-quest-override-loot.ts';
import {resolveQuestRewardItemDestination} from './quest-reward-navigation.ts';

const LANGUAGES=new Set(['ja','en','fr','it','de','es-ES','zh-CN','pt-BR']);

export interface QuestRewardNameMatches {
  readonly itemIds:readonly string[];
  readonly questIds:readonly string[];
  readonly relationCount:number;
  readonly staticSourceOnly:true;
  readonly grantedVerified:false;
  readonly ownershipVerified:false;
}
function normalize(value:string):string{
  return value.normalize('NFKC').trim().toLocaleLowerCase('en');
}
/** Returns null for no matches or a query outside a usable text-search range.
 * Numeric Item-ID search is handled separately by the existing native links.
 */
export function resolveQuestRewardNameMatches(
  reader:PublicQuestRewardsReader,overrides:QuestOverrideLootIndex,
  labels:PublicQuestRewardItemLabels,rawQuery:unknown,locale:string
):QuestRewardNameMatches|null{
  if(reader?.schema!=='wand.db03.public-quest-rewards@1'||
    reader.coverage?.quests!==733||
    reader.coverage?.currencyOccurrences!==65||
    reader.coverage?.additionalItemOccurrences!==330||
    reader.coverage?.runtimeGrantsVerified!==false||
    typeof reader.getItemCandidates!=='function'||
    overrides?.schema!=='wand.db03.quest-override-loot-candidates@1'||
    overrides.gameVersion!=='1.26.2'||
    overrides.coverage?.candidateOccurrences!==4||
    overrides.coverage?.runtimeGrantVerified!==false||
    typeof overrides.getItemCandidates!=='function'||
    labels?.schema!=='wand.db03.public-quest-reward-item-labels@1'||
    labels.gameVersion!=='1.26.2'||
    labels.coverage?.publishedVerifiedNames!==281||
    labels.coverage?.unresolvedSourceItemIds!==15||
    labels.coverage?.staticSourceOnly!==true||
    labels.coverage?.playerOwnershipVerified!==false||
    !Array.isArray(labels.publishedItemIds)||
    labels.publishedItemIds.length!==281||
    typeof labels.getDisplayName!=='function')
    throw new TypeError('DB03_REWARD_NAME_SEARCH_VERIFIED_SOURCES_REQUIRED');

  if(typeof rawQuery!=='string'||rawQuery.length>120)return null;
  const query=normalize(rawQuery);
  if(query.length<2||query.length>120||/^\d+$/.test(query))return null;
  const lang=LANGUAGES.has(locale)?locale:'en';
  const languages=lang==='en'?['en']:[lang,'en'];
  const matchedItems:string[]=[];
  const questIds=new Set<string>();
  let relationCount=0;
  for(const itemId of labels.publishedItemIds){
    const hasName=languages.some(language=>{
      const name=labels.getDisplayName(itemId,language);
      return typeof name==='string'&&normalize(name).includes(query);
    });
    if(!hasName)continue;
    const destination=resolveQuestRewardItemDestination(reader,itemId,overrides);
    if(!destination||destination.staticSourceOnly!==true||
      destination.guaranteedGrant!==false||destination.playerOwnershipVerified!==false)
      throw new TypeError('DB03_REWARD_NAME_SEARCH_SOURCE_RELATION_MISSING');
    matchedItems.push(itemId);
    relationCount+=destination.relationCount;
    for(const questId of destination.questIds)questIds.add(questId);
  }
  if(!matchedItems.length)return null;
  return Object.freeze({
    itemIds:Object.freeze(matchedItems),
    questIds:Object.freeze([...questIds]),
    relationCount,
    staticSourceOnly:true as const,
    grantedVerified:false as const,
    ownershipVerified:false as const
  });
}
