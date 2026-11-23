/** Collection projection of DB-00/02 original Item distribution ROUTES.
 * Three route groups are NOT mutually exclusive item rarity classes:
 * a regular resource may also have a historical campaign distribution.
 * Missing routes do not prove ordinary or permanent availability.
 */
import type {Db00DistributionSourceItem} from '../game-db/distribution-sources.ts';
import type {CollectionAcquisitionSummary} from './acquisition-summary.ts';

export type CollectionDistributionGroup=
  'ordinary_gameplay'|'gameplay_time_condition'|'real_world_distribution';
export type CollectionDistributionProof=
  'configured_item_id_link'|'native_source_category'|
  'configured_route_unverified'|'name_only_candidate';
export interface CollectionDistributionRow{
  readonly group:CollectionDistributionGroup;
  readonly proofs:readonly CollectionDistributionProof[];
}
export interface CollectionDistributionEvidence{
  readonly itemId:number;
  readonly groups:readonly CollectionDistributionRow[];
  readonly sourceCoverageComplete:false;
  readonly exclusiveLimitedItemVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface CollectionAcquisitionWithDistribution
  extends CollectionAcquisitionSummary {
  readonly distribution:CollectionDistributionEvidence;
}
const GROUPS:readonly CollectionDistributionGroup[]=[
  'ordinary_gameplay','gameplay_time_condition','real_world_distribution'
];
const PROOFS:readonly CollectionDistributionProof[]=[
  'configured_item_id_link','native_source_category',
  'configured_route_unverified','name_only_candidate'
];
const ID=/^[1-9][0-9]{0,15}$/;
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('COLLECTION_DISTRIBUTION_'+code);
}
function validId(raw:unknown):raw is string{
  return typeof raw==='string'&&ID.test(raw)&&Number.isSafeInteger(Number(raw));
}

export function summarizeCollectionDistribution(
  item:Readonly<Db00DistributionSourceItem>
):CollectionDistributionEvidence{
  const distribution=item?.distribution;
  const id=item?.itemId;
  check(validId(id)&&item.shared?.itemId===id&&
    distribution?.itemId===id&&
    item.canHaveMultipleScopes===true&&
    item.sourceCoverageComplete===false&&
    item.exclusiveTimeLimitedItemVerified===false&&
    item.currentAvailabilityVerified===false&&
    item.playerOwnershipVerified===false&&
    item.gameCollectionUiMembershipVerified===false&&
    distribution.scopeCoverageComplete===false&&
    distribution.exclusiveTimeLimitedItemVerified===false&&
    distribution.currentAvailabilityVerified===false&&
    distribution.playerOwnershipVerified===false&&
    Array.isArray(distribution.scopes)&&Array.isArray(distribution.evidence)&&
    typeof distribution.unknownBecauseNoEvidence==='boolean'&&
    distribution.scopes.every(scope=>GROUPS.includes(scope))&&
    distribution.scopes.length===new Set(distribution.scopes).size,
    'SOURCE_CONTRACT');
  check(distribution.unknownBecauseNoEvidence===
    (distribution.evidence.length===0&&distribution.scopes.length===0),
    'MISSING_EVIDENCE');
  const found=new Map<CollectionDistributionGroup,Set<CollectionDistributionProof>>();
  for(const evidence of distribution.evidence){
    check(evidence?.itemId===id&&
      evidence.relation?.itemId===id&&
      GROUPS.includes(evidence.scope)&&
      distribution.scopes.includes(evidence.scope)&&
      evidence.liveAvailabilityVerified===false&&
      evidence.exclusiveTimeLimitedItemVerified===false&&
      evidence.playerOwnershipVerified===false&&
      typeof evidence.exactConfiguredItemIdLink==='boolean'&&
      typeof evidence.acquisitionMethodVerified==='boolean'&&
      typeof evidence.nameMatchOnly==='boolean',
      'EVIDENCE_PROVENANCE');
    let proof:CollectionDistributionProof;
    if(evidence.evidenceKind==='configured_item_origin'){
      check(evidence.nameMatchOnly===false&&
        evidence.exactConfiguredItemIdLink===evidence.acquisitionMethodVerified,
        'CONFIGURED_ROUTE_NOT_PROVEN');
      proof=evidence.exactConfiguredItemIdLink?
        'configured_item_id_link':'configured_route_unverified';
    }else if(evidence.evidenceKind==='native_online_category'||
             evidence.evidenceKind==='native_pet_source_category'){
      check(evidence.exactConfiguredItemIdLink===false&&
        evidence.acquisitionMethodVerified===false&&
        evidence.nameMatchOnly===false,'NATIVE_CATEGORY_NOT_ROUTE');
      proof='native_source_category';
    }else if(evidence.evidenceKind==='campaign_or_shop_name_candidate'){
      check(evidence.exactConfiguredItemIdLink===false&&
        evidence.acquisitionMethodVerified===false&&
        evidence.nameMatchOnly===true,'NAME_CANDIDATE_NOT_ROUTE');
      proof='name_only_candidate';
    }else{
      throw new TypeError('COLLECTION_DISTRIBUTION_UNKNOWN_EVIDENCE');
    }
    if(!found.has(evidence.scope))found.set(evidence.scope,new Set());
    found.get(evidence.scope)!.add(proof);
  }
  check(found.size===distribution.scopes.length&&
    distribution.scopes.every(scope=>found.has(scope))&&
    distribution.scopes.every((scope,i)=>scope===GROUPS.filter(x=>found.has(x))[i]),
    'GROUPS_NOT_SUPPORTED_BY_EVIDENCE');
  const groups=GROUPS.filter(group=>found.has(group)).map(group=>
    Object.freeze({group,proofs:Object.freeze(
      PROOFS.filter(proof=>found.get(group)!.has(proof))
    )})
  );
  return Object.freeze({
    itemId:Number(id),groups:Object.freeze(groups),
    sourceCoverageComplete:false as const,
    exclusiveLimitedItemVerified:false as const,
    currentAvailabilityVerified:false as const,
    playerOwnershipVerified:false as const,
    collectionUiMembershipVerified:false as const
  });
}
