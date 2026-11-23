/**
 * DB-02 user-facing distribution source grouping, not item rarity or
 * entitlement classification. A normal resource may have BOTH gameplay
 * acquisition and historical real-world code distribution routes.
 *
 * Original OnlineCategory/Pet.Source classifications, exact configured
 * ItemOrigin references and public English-name candidates remain disjoint
 * evidence types. No source alone establishes present eligibility, an
 * exclusive time-limited item, or personal ownership.
 */
import {
  ORIGIN_SCHEMA,
  type OriginDatabase,type ItemOrigin,type OriginKind
} from './origins.ts';
import {
  hasPinnedExpandedNativeItemSourceEvidence,
  type ExpandedNativeItemSourceBrowser
} from './item-source-browser.ts';
import {
  hasPinnedNativeOnlineCategoryEvidence,
  type NativeOnlineCategoryIndex,type NativeOnlineCategoryRow
} from './public-online-categories.ts';
import {
  hasPinnedNativePetSourceEvidence,
  type NativePetSourceIndex,type NativePetSourceClassification
} from './public-pet-source-categories.ts';
import {
  DB02_PUBLIC_NAME_CANDIDATE_SCHEMA,
  type PublicOnlineNameCandidateIndex,type PublicOnlineNameCandidate
} from './public-online-name-candidates.ts';

export const DB02_DISTRIBUTION_SCOPE_SCHEMA=
  'wand.db02.item-distribution-scope@1' as const;

const SCOPES=Object.freeze([
  'ordinary_gameplay','gameplay_time_condition','real_world_distribution'
] as const);
export type DistributionScope=typeof SCOPES[number];
export type DistributionEvidenceKind=
  'native_online_category'|'native_pet_source_category'|
  'configured_item_origin'|'campaign_or_shop_name_candidate';
export type DistributionRelation=
  NativeOnlineCategoryRow|NativePetSourceClassification|
  ItemOrigin|PublicOnlineNameCandidate;

export interface DistributionScopeEvidence {
  readonly itemId:string;
  readonly scope:DistributionScope;
  readonly evidenceKind:DistributionEvidenceKind;
  /** Original linked Item IDs only; never an account's actual reward claim. */
  readonly exactConfiguredItemIdLink:boolean;
  /** Source metadata and English-name matches do not verify how to obtain it. */
  readonly acquisitionMethodVerified:boolean;
  /** Individual official/community name matches must remain explicitly weak. */
  readonly nameMatchOnly:boolean;
  readonly relation:DistributionRelation;
  readonly liveAvailabilityVerified:false;
  readonly exclusiveTimeLimitedItemVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface DistributionScopeItem {
  readonly itemId:string;
  /** Multiple route groups may coexist for a single Item ID. */
  readonly scopes:readonly DistributionScope[];
  readonly evidence:readonly DistributionScopeEvidence[];
  readonly unknownBecauseNoEvidence:boolean;
  readonly scopeCoverageComplete:false;
  readonly exclusiveTimeLimitedItemVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface DistributionScopeIndex {
  readonly schema:typeof DB02_DISTRIBUTION_SCOPE_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly scopeCoverageComplete:false;
  readonly coverage:Readonly<{
    nativeOnlineCategoryRows:2198;
    nativePetSourceRows:134;
    existingSourceOriginRoutes:1255;
    nativeRecipeDefinitionRoutes:number;
    nativeActivityResultRoutes:number;
    indexedOriginalSourceRoutes:number;
    expandedNativeSourceEvidenceLoaded:boolean;
    nameOnlyCandidateRelations:number;
    distinctItemsWithSourceEvidence:number;
    ordinaryGameplayItemIds:number;
    gameplayTimeConditionItemIds:number;
    realWorldDistributionItemIds:number;
    currentAvailabilityVerified:false;
    exclusiveTimeLimitedItemVerified:false;
    playerOwnershipVerified:false;
  }>;
  getItem(itemId:string|number):DistributionScopeItem;
  /** Sorted unique IDs; not a complete census of obtainable items. */
  listItemIds(scope?:DistributionScope):readonly string[];
}
const ID=/^[1-9][0-9]{0,15}$/;
const EMPTY=Object.freeze([]) as readonly DistributionScopeEvidence[];
const EMPTY_SCOPES=Object.freeze([]) as readonly DistributionScope[];
const EMPTY_IDS=Object.freeze([]) as readonly string[];
const REAL_WORLD_KINDS:ReadonlySet<OriginKind>=new Set([
  'star_path_free','star_path_premium','star_path_vault',
  'event_reward','twitch_drop','redeem_code','premium_shop',
  'official_campaign','purchase_bonus','gift'
]);
const ORDINARY_KINDS:ReadonlySet<OriginKind>=new Set([
  'crafting','cooking','fishing','mining','timebending','foraging',
  'farming','loot','game_shop','quest_reward','friendship_reward'
]);

function check(ok:unknown,code:string):asserts ok {
  if(!ok)throw new TypeError('DB02_DISTRIBUTION_SCOPE_'+code);
}
function itemId(value:unknown):string{
  const v=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  check(typeof v==='string'&&ID.test(v)&&Number.isSafeInteger(Number(v)),
    'INVALID_ITEM_ID');
  return v;
}
function scopedOrigin(origin:ItemOrigin):DistributionScope|null {
  // These time-of-day fields are native gameplay conditions, NOT fixed real
  // calendar dates. Source acquisition remains unverified until played.
  if(ORDINARY_KINDS.has(origin.kind) &&
    (origin.nativeDetails?.timeOfDays.length??0)>0)
    return 'gameplay_time_condition';
  if(REAL_WORLD_KINDS.has(origin.kind))return 'real_world_distribution';
  if(ORDINARY_KINDS.has(origin.kind))return 'ordinary_gameplay';
  return null; // "other" has no verified distribution semantics
}
function scopedPet(row:NativePetSourceClassification):DistributionScope {
  return row.category==='quest'||row.category==='timebending'?
    'ordinary_gameplay':'real_world_distribution';
}
function sortedIds(ids:Iterable<string>):readonly string[] {
  return Object.freeze([...ids].sort((a,b)=>Number(a)-Number(b)));
}

/**
 * Full evidence crosswalk on demand. All native/online inputs must have
 * passed their original-source integrity checks in the same browser session.
 * The optional expanded browser provides all 1943 recipe and 763 activity
 * result links, without re-deriving them or promoting an actual unlock claim.
 * Does not mutate the baseline OriginDatabase or add artificial ItemOrigins.
 */
export function indexDistributionScopes(
  origins:OriginDatabase,
  online:NativeOnlineCategoryIndex,
  pets:NativePetSourceIndex,
  nameCandidates:PublicOnlineNameCandidateIndex,
  expanded?:ExpandedNativeItemSourceBrowser
):DistributionScopeIndex{
  check(origins?.schema===ORIGIN_SCHEMA&&
    origins.originCoverageComplete===false&&
    origins.getCoverage().linkedRoutes===1255&&
    hasPinnedNativeOnlineCategoryEvidence(online)&&
    online.coverage.explicitNonzeroCategoryRows===2198&&
    hasPinnedNativePetSourceEvidence(pets)&&
    pets.coverage.explicitSourceRows===134&&
    nameCandidates?.schema===DB02_PUBLIC_NAME_CANDIDATE_SCHEMA&&
    nameCandidates.evidence==='name_only_no_grant_or_sale_proof'&&
    nameCandidates.coverage.verifiedOnlineAcquisitionLinks===0&&
    typeof nameCandidates.listCandidateItemIds==='function'&&
    (expanded===undefined||
      hasPinnedExpandedNativeItemSourceEvidence(expanded)&&
      expanded.coverage.baselineLedgerSourceRoutes===1255&&
      expanded.coverage.originalRecipeDefinitionRoutes===1943&&
      expanded.coverage.originalActivityResultRoutes===763&&
      expanded.coverage.combinedSourceRoutes===3961&&
      expanded.coverage.originalSourceCoverageComplete===false),
    'PINNED_SOURCE_REQUIRED');
  // Prevent accidentally joining a valid expanded index built from a
  // different ledger/release: every original source relation must be identical.
  if(expanded!==undefined){
    for(const id of origins.listLinkedItemIds()){
      const expected=origins.getItem(id).origins;
      const actual=expanded.getItem(id).origins;
      check(expected.every(origin=>actual.includes(origin)),
        'EXPANDED_LEDGER_MISMATCH');
    }
  }

  const byItem=new Map<string,DistributionScopeEvidence[]>();
  const byScope=new Map<DistributionScope,Set<string>>(
    SCOPES.map(scope=>[scope,new Set<string>()])
  );
  const add=(id:string,scope:DistributionScope,evidenceKind:DistributionEvidenceKind,
    relation:DistributionRelation,exactConfiguredItemIdLink:boolean,
    acquisitionMethodVerified:boolean,nameMatchOnly:boolean)=>{
    check(relation.itemId===id,'ITEM_ID_MISMATCH');
    const evidence:DistributionScopeEvidence=Object.freeze({
      itemId:id,scope,evidenceKind,relation,exactConfiguredItemIdLink,
      acquisitionMethodVerified,nameMatchOnly,
      liveAvailabilityVerified:false as const,
      exclusiveTimeLimitedItemVerified:false as const,
      playerOwnershipVerified:false as const
    });
    const rows=byItem.get(id);
    if(rows)rows.push(evidence);else byItem.set(id,[evidence]);
    byScope.get(scope)!.add(id);
  };
  for(const row of online.rows){
    check(row.originalCategoryOnly===true&&
      row.specificOfferOrCampaignVerified===false&&
      row.currentAvailabilityVerified===false,'NATIVE_ONLINE_CENSUS');
    add(itemId(row.itemId),'real_world_distribution',
      'native_online_category',row,false,false,false);
  }
  for(const row of pets.classifications){
    check(row.sourceCategoryOnly===true&&
      row.campaignLinkVerified===false&&
      row.playerAcquisitionVerified===false,'NATIVE_PET_CENSUS');
    add(itemId(row.itemId),scopedPet(row),
      'native_pet_source_category',row,false,false,false);
  }
  let sourceRoutes=0;
  const linkedIds=expanded?.knownLinkedItemIds??origins.listLinkedItemIds();
  for(const id of linkedIds){
    const item=expanded===undefined?origins.getItem(id):expanded.getItem(id);
    check(item.itemId===id&&
      (expanded===undefined?item.originCoverageComplete===false:
        item.availabilityVerified===false),
      'ORIGIN_ITEM_MISMATCH');
    for(const row of item.origins){
      const scope=scopedOrigin(row);
      if(scope!==null)add(itemId(id),scope,'configured_item_origin',row,
        row.routeStatus==='confirmed_source_link',
        row.routeStatus==='confirmed_source_link',false);
      sourceRoutes++;
    }
  }
  check(sourceRoutes===(expanded===undefined?1255:3961),'ORIGIN_CENSUS');
  let nameRelations=0;
  const knownNameIds=nameCandidates.listCandidateItemIds();
  check(Object.isFrozen(knownNameIds)&&
    knownNameIds.length===nameCandidates.coverage.distinctCandidateItemIds,
    'NAME_CANDIDATE_CENSUS');
  for(const id of knownNameIds){
    for(const row of nameCandidates.getItemCandidates(id)){
      check(row.itemId===id&&
        row.acquisitionLinkVerified===false&&
        row.actualRewardGrantedVerified===false&&
        row.currentAvailabilityVerified===false,'UNVERIFIED_NAME_CANDIDATE');
      add(itemId(id),'real_world_distribution',
        'campaign_or_shop_name_candidate',row,false,false,true);
      nameRelations++;
    }
  }
  check(nameRelations===nameCandidates.coverage.totalCandidateRelations,
    'NAME_RELATION_CENSUS');
  const itemRows=new Map<string,DistributionScopeItem>();
  for(const [id,evidence] of byItem){
    const scopes=Object.freeze(SCOPES.filter(s=>evidence.some(r=>r.scope===s)));
    itemRows.set(id,Object.freeze({
      itemId:id,scopes,evidence:Object.freeze(evidence),
      unknownBecauseNoEvidence:false as const,
      scopeCoverageComplete:false as const,
      exclusiveTimeLimitedItemVerified:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const
    }));
  }
  const allIds=sortedIds(itemRows.keys());
  const scopeIds=new Map<DistributionScope,readonly string[]>(
    SCOPES.map(scope=>[scope,sortedIds(byScope.get(scope)!)])
  );
  const coverage=Object.freeze({
    nativeOnlineCategoryRows:2198 as const,
    nativePetSourceRows:134 as const,
    existingSourceOriginRoutes:1255 as const,
    nativeRecipeDefinitionRoutes:expanded===undefined?0:1943,
    nativeActivityResultRoutes:expanded===undefined?0:763,
    indexedOriginalSourceRoutes:sourceRoutes,
    expandedNativeSourceEvidenceLoaded:expanded!==undefined,
    nameOnlyCandidateRelations:nameRelations,
    distinctItemsWithSourceEvidence:allIds.length,
    ordinaryGameplayItemIds:scopeIds.get('ordinary_gameplay')!.length,
    gameplayTimeConditionItemIds:scopeIds.get('gameplay_time_condition')!.length,
    realWorldDistributionItemIds:scopeIds.get('real_world_distribution')!.length,
    currentAvailabilityVerified:false as const,
    exclusiveTimeLimitedItemVerified:false as const,
    playerOwnershipVerified:false as const
  });
  return Object.freeze({
    schema:DB02_DISTRIBUTION_SCOPE_SCHEMA,
    gameVersion:'1.26.2' as const,
    scopeCoverageComplete:false as const,
    coverage,
    getItem(raw:string|number){
      const id=itemId(raw);
      return itemRows.get(id)??Object.freeze({
        itemId:id,scopes:EMPTY_SCOPES,evidence:EMPTY,
        unknownBecauseNoEvidence:true as const,
        scopeCoverageComplete:false as const,
        exclusiveTimeLimitedItemVerified:false as const,
        currentAvailabilityVerified:false as const,
        playerOwnershipVerified:false as const
      });
    },
    listItemIds(scope?:DistributionScope){
      if(scope===undefined)return allIds;
      check(SCOPES.includes(scope),'INVALID_SCOPE');
      return scopeIds.get(scope)??EMPTY_IDS;
    }
  });
}
