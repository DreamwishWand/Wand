/** Compact Collection-only projection of the independently source-pinned DB-00
 * acquisition graph. These are configured ways an Item can be obtained, NOT
 * unlocked recipes, currently active locations or player entitlements. */
import type {Db00NativeAcquisitionEvidence} from '../game-db/public-sources.ts';

export type CollectionAcquisitionKind=
  'crafting'|'cooking'|'fishing'|'mining'|'timebending'|'farming'|'starpath';

export interface CollectionAcquisitionSummary {
  readonly itemId:number;
  readonly kinds:readonly CollectionAcquisitionKind[];
  readonly staticSourceOnly:true;
  readonly availabilityVerified:false;
  readonly ownershipVerified:false;
}

const ORDER:readonly CollectionAcquisitionKind[]=[
  'crafting','cooking','fishing','mining','timebending','farming','starpath'
];

export function summarizeCollectionAcquisition(
  evidence:Readonly<Db00NativeAcquisitionEvidence>
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
     evidence.shared.starpathRewardsOnlyConfigured!==true)
    throw new Error('COLLECTION_ACQUISITION_UNVERIFIED_SOURCE');
  const itemId=Number(evidence.itemId);
  if(!Number.isSafeInteger(itemId)||itemId<=0||
     evidence.recipes.itemId!==evidence.itemId||
     evidence.activities.itemId!==evidence.itemId||
     evidence.shared.itemId!==evidence.itemId)
    throw new Error('COLLECTION_ACQUISITION_ID_MISMATCH');
  const found=new Set<CollectionAcquisitionKind>();
  for(const recipe of evidence.recipes.recipes){
    if(recipe.resultItemId!==evidence.itemId||
      (recipe.kind!=='crafting'&&recipe.kind!=='cooking'))
      throw new Error('COLLECTION_ACQUISITION_RECIPE_MISMATCH');
    found.add(recipe.kind);
  }
  for(const path of evidence.activities.sourcePaths){
    if(path.resultItemId!==evidence.itemId||
       path.occurrenceGuaranteed!==false||
       path.currentAvailabilityVerified!==false||
       !ORDER.includes(path.method))
      throw new Error('COLLECTION_ACQUISITION_PATH_MISMATCH');
    found.add(path.method);
  }
  if(evidence.shared.starpathRelations?.some(relation=>
    relation.itemId===evidence.itemId&&
    relation.role==='configured_reward'&&
    relation.configuredRewardOnly===true&&
    relation.guaranteedGrant===false))
    found.add('starpath');
  return Object.freeze({
    itemId,kinds:Object.freeze(ORDER.filter(kind=>found.has(kind))),
    staticSourceOnly:true as const,
    availabilityVerified:false as const,
    ownershipVerified:false as const
  });
}
