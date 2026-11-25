/** Compact Collection presentation of the current common Item DB. Only
 * official localized names, never raw IDs, internal keys or guessed labels.
 * Reference paths remain available in DB-01; this is not a second database.
 */
import type {ItemMasterLocale,PublicCompleteItemMaster} from '../items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../items/public-item-acquisition-details.ts';
import {createLootSourceReader} from '../items/public-loot-sources.ts';
import type {Db01SourceRole} from '../acquisition/db01-item-source-relations.ts';
import type {NativeAcquisitionRole} from '../items/public-item-master.ts';
import type {LootReferrerRole} from '../items/public-loot-sources.ts';

export interface CollectionConcreteAcquisition {
  readonly itemId:number;
  readonly locale:ItemMasterLocale;
  readonly configuredNames:readonly string[];
  readonly candidateNames:readonly string[];
}
const configuredIndexed=new Set<Db01SourceRole>(['quest_currency_reward','cooking_result','crafting_result','fishing_result','mining_result','timebending_result','farming_result']);
const candidateIndexed=new Set<Db01SourceRole>(['quest_additional_loot_candidate','mini_event_reward_candidate','floating_festival_reward_candidate','friendship_default_reward_candidate','stall_loot_pool_candidate']);
const configuredNative=new Set<NativeAcquisitionRole>(['activity_result','produced_item','story_reward','board_game_reward','duty_reward','conditional_grant','quest_currency_reward','machine_produced_item']);
const candidateNative=new Set<NativeAcquisitionRole>(['quest_additional_loot_candidate','blocker_default_reward']);
const candidateReferrers=new Set<LootReferrerRole>(['stall_slot','loot_present','ephemeral_treasure','blocker_reward','critter_like_reward','critter_favorite_reward','snippet_reward','quest_override_reward','recurring_weed_override']);
export async function readCollectionConcreteAcquisition(db:PublicCompleteItemMaster,itemId:number,locale:ItemMasterLocale):Promise<Readonly<CollectionConcreteAcquisition>>{
  const [[sources],[loot]]=await Promise.all([
    readItemAcquisitionSourceDetails(db,[itemId],locale),
    createLootSourceReader(db).getForItems([itemId],locale)
  ]);
  if(!sources||!loot)throw new Error('COLLECTION_CONCRETE_ITEM_MISSING');
  const configured=new Set<string>(),candidates=new Set<string>();
  const add=(set:Set<string>,name:string|null|undefined)=>{
    if(typeof name==='string'&&name.trim())set.add(name);
  };
  for(const {evidence,identity} of sources.indexed){
    if(configuredIndexed.has(evidence.role))add(configured,identity?.name);
    if(candidateIndexed.has(evidence.role))add(candidates,identity?.name);
  }
  for(const {evidence,identity} of sources.native){
    if(configuredNative.has(evidence[1]))add(configured,identity?.name);
    if(candidateNative.has(evidence[1]))add(candidates,identity?.name);
  }
  for(const {evidence,identity} of sources.additional){
    if(evidence.kind==='character_friendship_reward'||evidence.kind==='pet_friendship_reward')add(configured,identity?.name);
  }
  for(const source of loot.sources)for(const ref of source.tableReferrers?.referrers??[]){
    if(candidateReferrers.has(ref.role))add(candidates,ref.name);
  }
  // A named candidate must not be upgraded into a configured grant or live
  // offer, even if another independent source has the same display name.
  const sort=(set:Set<string>)=>Object.freeze([...set].sort((a,b)=>a.localeCompare(b,locale)));
  return Object.freeze({itemId,locale,configuredNames:sort(configured),candidateNames:sort(candidates)});
}
