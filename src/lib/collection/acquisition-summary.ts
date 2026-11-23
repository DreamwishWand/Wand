/** Collection-only, compact rendering of source-pinned DB-00/02/03 evidence.
 * An ItemOrigin's exact Item ID is not current stock, player ownership or a
 * proven Collection tab. Source candidates MUST remain separate from methods. */
import type {Db00AllNativeAcquisitionEvidence} from '../game-db/public-sources.ts';
import type {NativeStallSourceIndex} from '../acquisition/public-native-stalls.ts';
import type {OriginKind} from '../acquisition/origins.ts';

export type CollectionAcquisitionKind=
  | 'crafting'|'cooking'|'fishing'|'mining'|'timebending'|'farming'
  | 'foraging'|'game_shop'|'quest_reward'|'event_reward'
  | 'friendship_reward'|'starpath'|'twitch_drop'|'redeem_code'
  | 'premium_shop'|'official_campaign'|'purchase_bonus'|'gift';
export type CollectionAcquisitionCandidate='loot_table'|'stall_slot';

export interface CollectionAcquisitionSummary {
  readonly itemId:number;
  /** Explicit original recipe, activity, campaign or reward ID links. */
  readonly kinds:readonly CollectionAcquisitionKind[];
  /** Original table/slot *candidates*, with no verified loot or sale. */
  readonly candidates:readonly CollectionAcquisitionCandidate[];
  readonly staticSourceOnly:true;
  readonly availabilityVerified:false;
  readonly ownershipVerified:false;
}

const ORDER:readonly CollectionAcquisitionKind[]=[
  'crafting','cooking','fishing','mining','timebending','farming',
  'foraging','game_shop','quest_reward','event_reward','friendship_reward',
  'starpath','twitch_drop','redeem_code','premium_shop',
  'official_campaign','purchase_bonus','gift'
];

/** Only exact, independently verified ItemOrigin ID links are eligible.
 * Original Premium/TimeLimited enums or campaign name-only matches are NOT. */
const SOURCE_ORIGINS:Readonly<Partial<Record<OriginKind,CollectionAcquisitionKind>>>={
  crafting:'crafting',cooking:'cooking',fishing:'fishing',
  mining:'mining',timebending:'timebending',farming:'farming',
  foraging:'foraging',game_shop:'game_shop',quest_reward:'quest_reward',
  event_reward:'event_reward',friendship_reward:'friendship_reward',
  star_path_free:'starpath',star_path_premium:'starpath',
  star_path_vault:'starpath',twitch_drop:'twitch_drop',
  redeem_code:'redeem_code',premium_shop:'premium_shop',
  official_campaign:'official_campaign',purchase_bonus:'purchase_bonus',
  gift:'gift'
};
const TRUSTED_SOURCE=new Set<string>([
  'verified_game_native','verified_liveops_cache',
  'verified_sale_snapshot','official_publication'
]);

export function summarizeCollectionAcquisition(
  evidence:Readonly<Db00AllNativeAcquisitionEvidence>,
  stalls:Readonly<NativeStallSourceIndex>
):CollectionAcquisitionSummary {
  if(evidence.staticSourceOnly!==true||
     evidence.currentAvailabilityVerified!==false||
     evidence.playerOwnershipVerified!==false||
     evidence.collectionUiMembershipVerified!==false||
     evidence.recipes.sourceRecipeResultOnly!==true||
     evidence.recipes.recipeUnlockedVerified!==false||
     evidence.activities.staticSourceOnly!==true||
     evidence.activities.actualOccurrenceGuaranteed!==false||
     evidence.activities.currentAvailabilityVerified!==false||
     evidence.loot.sourceCandidateOnly!==true||
     evidence.loot.actualGameplayContextVerified!==false||
     evidence.loot.guaranteedDropVerified!==false||
     evidence.loot.currentAvailabilityVerified!==false||
     evidence.loot.playerOwnershipVerified!==false||
     evidence.actualLootContextVerified!==false||
     evidence.guaranteedLootDropVerified!==false||
     evidence.shared.starpathRewardsOnlyConfigured!==true)
    throw new Error('COLLECTION_ACQUISITION_UNVERIFIED_SOURCE');
  const itemId=Number(evidence.itemId);
  if(!Number.isSafeInteger(itemId)||itemId<=0||
     evidence.recipes.itemId!==evidence.itemId||
     evidence.activities.itemId!==evidence.itemId||
     evidence.loot.itemId!==evidence.itemId||
     evidence.shared.itemId!==evidence.itemId||
     evidence.staticLootCandidateCount!==evidence.loot.candidates.length||
     evidence.loot.staticCandidateOrigins.length!==evidence.loot.candidates.length)
    throw new Error('COLLECTION_ACQUISITION_ID_MISMATCH');
  if(stalls.schema!=='wand.db02.native-stall-loot-join@1'||
     stalls.gameVersion!=='1.26.2'||
     stalls.coverage.staticStorePoolOnly!==true||
     stalls.coverage.liveShopStockVerified!==false||
     stalls.coverage.livePurchasePriceVerified!==false||
     stalls.coverage.purchasabilityVerified!==false||
     stalls.coverage.playerUnlockVerified!==false)
    throw new Error('COLLECTION_ACQUISITION_STALL_SOURCE_UNVERIFIED');

  const found=new Set<CollectionAcquisitionKind>();
  for(const recipe of evidence.recipes.recipes){
    if(recipe.resultItemId!==evidence.itemId||
      (recipe.kind!=='crafting'&&recipe.kind!=='cooking')||
      recipe.recipeUnlockedVerified!==false)
      throw new Error('COLLECTION_ACQUISITION_RECIPE_MISMATCH');
    found.add(recipe.kind);
  }
  for(const path of evidence.activities.sourcePaths){
    if(path.resultItemId!==evidence.itemId||
       path.occurrenceGuaranteed!==false||
       path.currentAvailabilityVerified!==false||
       !['fishing','mining','timebending','farming'].includes(path.method))
      throw new Error('COLLECTION_ACQUISITION_PATH_MISMATCH');
    found.add(path.method);
  }
  for(const origin of evidence.shared.origins??[]){
    if(origin.itemId!==evidence.itemId||
       origin.availability!=='not_live_verified')
      throw new Error('COLLECTION_ACQUISITION_ORIGIN_MISMATCH');
    if(origin.routeStatus!=='confirmed_source_link'||
       !TRUSTED_SOURCE.has(origin.source.kind))continue;
    const kind=SOURCE_ORIGINS[origin.kind];
    if(kind)found.add(kind);
  }
  if(evidence.shared.starpathRelations?.some(relation=>
    relation.itemId===evidence.itemId&&
    relation.role==='configured_reward'&&
    relation.configuredRewardOnly===true&&
    relation.guaranteedGrant===false))
    found.add('starpath');

  for(const candidate of evidence.loot.candidates){
    if(candidate.itemId!==evidence.itemId||
       candidate.routeStatus!=='static_candidate_only'||
       candidate.gameplayContextVerified!==false||
       candidate.itemGrantVerified!==false||
       candidate.playerOwnershipVerified!==false)
      throw new Error('COLLECTION_ACQUISITION_LOOT_MISMATCH');
  }
  const stallCandidates=stalls.getItemCandidates(evidence.itemId);
  for(const candidate of stallCandidates){
    if(candidate.itemId!==evidence.itemId||
       candidate.routeStatus!=='static_candidate_only'||
       candidate.stallSlotReferenceVerified!==true||
       candidate.itemInReferencedLootTableVerified!==true||
       candidate.staticStorePoolOnly!==true||
       candidate.liveStockVerified!==false||
       candidate.livePriceVerified!==false||
       candidate.purchaseEligibilityVerified!==false||
       candidate.playerOwnershipVerified!==false)
      throw new Error('COLLECTION_ACQUISITION_STALL_MISMATCH');
  }
  const candidates:CollectionAcquisitionCandidate[]=[];
  if(evidence.loot.candidates.length)candidates.push('loot_table');
  if(stallCandidates.length)candidates.push('stall_slot');

  return Object.freeze({
    itemId,kinds:Object.freeze(ORDER.filter(kind=>found.has(kind))),
    candidates:Object.freeze(candidates),
    staticSourceOnly:true as const,
    availabilityVerified:false as const,
    ownershipVerified:false as const
  });
}
