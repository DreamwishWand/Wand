/**
 * Browser-ready inverse Item ID acquisition search for Collection, Gallery,
 * Guide and Save Editor. No save bytes or private source files are loaded here.
 *
 * Only known ItemOrigin rows are indexed. Lack of a row means "unknown",
 * NEVER "unobtainable". Official Twitch / redeem name-only candidates belong
 * to the separate public-online-name-candidates reader.
 *
 * Filters are applied to the SAME origin relation, avoiding false positives
 * from different sources on the same Item ID. Route status is preserved.
 */
import type {
  OriginDatabase,ItemOrigin,OriginKind,RouteStatus,
  SourceKind,AccessTier
} from './origins.ts';
import {ORIGIN_SCHEMA} from './origins.ts';
import {
  hasPinnedNativeRecipeEvidence,type NativeRecipeIndex
} from './public-native-recipes.ts';
import {
  hasPinnedNativeActivityEvidence,type NativeActivityResultIndex
} from './public-native-activities.ts';
import {
  hasPinnedNativeLootCandidateEvidence,type NativeLootCandidateIndex
} from './public-native-loot.ts';
import {
  hasPinnedStaticContainerEvidence,type PinnedStaticContainerContents
} from './public-static-container.ts';
import {
  hasPinnedDefaultInventoryEvidence,type PinnedDefaultInventorySource
} from './public-default-inventories.ts';

export const DB02_ITEM_SOURCE_BROWSER_SCHEMA='wand.db02.item-source-browser@1' as const;
export const DB02_NATIVE_EXPANDED_SOURCE_BROWSER_SCHEMA=
  'wand.db02.native-expanded-item-source-browser@1' as const;
export const DB02_STATIC_CANDIDATE_SOURCE_BROWSER_SCHEMA=
  'wand.db02.static-candidate-item-source-browser@1' as const;
export const DB02_ALL_ORIGINAL_SOURCE_BROWSER_SCHEMA=
  'wand.db02.all-original-item-source-browser@1' as const;
const PINNED_EXPANDED_BROWSER=new WeakSet<object>();
const PINNED_STATIC_BROWSER=new WeakSet<object>();
const PINNED_ALL_ORIGINAL_BROWSER=new WeakSet<object>();
const ID=/^[1-9][0-9]{0,15}$/;
const SAFE_KEY=/^[a-zA-Z0-9][a-zA-Z0-9:._\/-]{0,127}$/;
const KINDS:readonly OriginKind[]=Object.freeze([
  'crafting','cooking','fishing','mining','timebending','foraging','farming',
  'loot','game_shop','quest_reward','event_reward','friendship_reward',
  'star_path_free','star_path_premium','star_path_vault','twitch_drop',
  'redeem_code','premium_shop','official_campaign','purchase_bonus','gift','other'
]);
const STATUSES:readonly RouteStatus[]=Object.freeze([
  'confirmed_source_link','static_candidate_only'
]);
const SOURCE_KINDS:readonly SourceKind[]=Object.freeze([
  'verified_liveops_cache','verified_game_native','official_publication',
  'verified_sale_snapshot','unhashed_structural_candidate'
]);
const TIERS:readonly AccessTier[]=Object.freeze(['free','premium','not_applicable']);
const EMPTY_ORIGINS=Object.freeze([]) as readonly ItemOrigin[];
const EMPTY_IDS=Object.freeze([]) as readonly string[];

export interface ItemSourceFilter{
  /** OR within a dimension, AND across dimensions, all against one row. */
  readonly kinds?:readonly OriginKind[];
  readonly routeStatuses?:readonly RouteStatus[];
  readonly sourceKinds?:readonly SourceKind[];
  readonly sourceIds?:readonly string[];
  readonly campaignIds?:readonly string[];
  readonly accessTiers?:readonly AccessTier[];
  /** Null selects unknown source build (e.g. July Shop); absence means any. */
  readonly gameVersion?:string|null;
}
export interface ItemSourceBrowserRow{
  readonly itemId:string;
  /** Only relations matching every supplied filter. */
  readonly origins:readonly ItemOrigin[];
  readonly confirmedSourceLinks:readonly ItemOrigin[];
  readonly staticCandidates:readonly ItemOrigin[];
  readonly availabilityVerified:false;
}
export interface ItemSourceBrowserResult{
  readonly items:readonly ItemSourceBrowserRow[];
  readonly offset:number;
  readonly limit:number;
  readonly totalItemIds:number;
  readonly totalOriginRelations:number;
  readonly hasMore:boolean;
  readonly originCoverageComplete:false;
  readonly liveAvailabilityVerified:false;
  readonly sourceEvidenceOnly:true;
}
export interface ItemSourceKindCount{
  readonly kind:OriginKind;
  readonly distinctItemIds:number;
  readonly sourceRelations:number;
  readonly confirmedSourceLinks:number;
  readonly staticCandidateRelations:number;
}
export interface ItemSourceBrowser {
  readonly schema:typeof DB02_ITEM_SOURCE_BROWSER_SCHEMA;
  readonly sourceEvidenceOnly:true;
  readonly originCoverageComplete:false;
  readonly liveAvailabilityVerified:false;
  /** Sorted Item IDs with >=1 native/published origin (not the full 13,202). */
  readonly knownLinkedItemIds:readonly string[];
  /** Includes all 22 source kinds; zero means no VERIFIED Item ID mapping. */
  readonly originKindCounts:readonly ItemSourceKindCount[];
  query(
    filter?:ItemSourceFilter,
    page?:Readonly<{offset?:number;limit?:number}>
  ):ItemSourceBrowserResult;
  getItem(itemId:string|number):ItemSourceBrowserRow;
  getKindItemIds(kind:OriginKind,status?:RouteStatus):readonly string[];
}

export interface ExpandedNativeItemSourceBrowser extends ItemSourceBrowser {
  readonly nativeExpansionSchema:typeof DB02_NATIVE_EXPANDED_SOURCE_BROWSER_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly coverage:Readonly<{
    baselineLedgerSourceRoutes:1255;
    originalRecipeDefinitionRoutes:1943;
    originalActivityResultRoutes:763;
    combinedSourceRoutes:3961;
    distinctLinkedItemIds:number;
    playerRecipeUnlockVerified:false;
    actualLootOrHarvestVerified:false;
    currentAvailabilityVerified:false;
    originalSourceCoverageComplete:false;
  }>;
}
/** Source-verified *candidate occurrences*, never source-verified grants. */
export interface StaticCandidateItemSourceBrowser extends ItemSourceBrowser {
  readonly candidateSchema:typeof DB02_STATIC_CANDIDATE_SOURCE_BROWSER_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly staticCandidatesOnly:true;
  readonly actualAcquisitionVerified:false;
  readonly gameplayContextVerified:false;
  readonly playerOwnershipVerified:false;
  readonly coverage:Readonly<{
    lootTableCandidateRows:3804;
    staticContainerTemplateRows:146;
    defaultInventoryDefinitionRows:289;
    totalCandidateRelations:4239;
    distinctCandidateItemIds:number;
    guaranteedDropsVerified:0;
    currentAvailabilityVerified:false;
    scopeOrExclusivityVerified:false;
  }>;
}
export interface AllOriginalItemSourceBrowser extends ItemSourceBrowser {
  readonly combinedSchema:typeof DB02_ALL_ORIGINAL_SOURCE_BROWSER_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly coverage:Readonly<{
    baselinePublishedRoutes:1255;
    nativeRecipeAndActivityRoutes:2706;
    originalSourceRelations:3961;
    staticCandidateRelations:4239;
    combinedSourceRelations:8200;
    distinctReferencedItemIds:number;
    actualLootGrantedVerified:false;
    completeAcquisitionCoverage:false;
    currentAvailabilityVerified:false;
    playerOwnershipVerified:false;
  }>;
}
function assert(ok:unknown,why:string):asserts ok{
  if(!ok)throw new TypeError('DB02_ITEM_SOURCE_BROWSER_'+why);
}
function normalizeId(raw:string|number):string{
  const id=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  assert(typeof id==='string'&&ID.test(id)&&
    Number.isSafeInteger(Number(id)),'INVALID_ITEM_ID');
  return id;
}
function checkArray<T extends string>(
  values:readonly T[]|undefined,known:readonly T[]|null,
  code:string
):ReadonlySet<T>|null {
  if(values===undefined)return null;
  assert(Array.isArray(values)&&values.length<=10000,code);
  const seen=new Set<T>();
  for(const v of values){
    assert(typeof v==='string'&&(known!==null?
      known.includes(v as T):
      SAFE_KEY.test(v)),'INVALID_'+code);
    seen.add(v as T);
  }
  return seen;
}
function predicates(filter:ItemSourceFilter){
  assert(filter!==null&&typeof filter==='object'&&!Array.isArray(filter),
    'INVALID_FILTER');
  const kinds=checkArray(filter.kinds,KINDS,'KINDS');
  const statuses=checkArray(filter.routeStatuses,STATUSES,'ROUTE_STATUSES');
  const sources=checkArray(filter.sourceKinds,SOURCE_KINDS,'SOURCE_KINDS');
  const sourceIds=checkArray(filter.sourceIds,null,'SOURCE_IDS');
  const campaigns=checkArray(filter.campaignIds,null,'CAMPAIGN_IDS');
  const tiers=checkArray(filter.accessTiers,TIERS,'ACCESS_TIERS');
  if(filter.gameVersion!==undefined)
    assert(filter.gameVersion===null||
      typeof filter.gameVersion==='string'&&
      /^\d+\.\d+\.\d+$/.test(filter.gameVersion),'GAME_VERSION');
  return (origin:ItemOrigin)=>
    (kinds===null||kinds.has(origin.kind))&&
    (statuses===null||statuses.has(origin.routeStatus))&&
    (sources===null||sources.has(origin.source.kind))&&
    (sourceIds===null||sourceIds.has(origin.source.sourceId))&&
    (campaigns===null||origin.campaignId!==null&&campaigns.has(origin.campaignId))&&
    (tiers===null||tiers.has(origin.accessTier))&&
    (filter.gameVersion===undefined||
      origin.source.gameVersion===filter.gameVersion);
}
function makeRow(itemId:string,origins:readonly ItemOrigin[]):ItemSourceBrowserRow{
  return Object.freeze({
    itemId,origins:Object.freeze([...origins]),
    confirmedSourceLinks:Object.freeze(origins.filter(
      r=>r.routeStatus==='confirmed_source_link')),
    staticCandidates:Object.freeze(origins.filter(
      r=>r.routeStatus==='static_candidate_only')),
    availabilityVerified:false as const
  });
}
function checkPage(page:Readonly<{offset?:number;limit?:number}>):{
  offset:number;limit:number
}{
  assert(page!==null&&typeof page==='object'&&!Array.isArray(page),
    'INVALID_PAGE');
  const offset=page.offset??0,limit=page.limit??100;
  assert(Number.isSafeInteger(offset)&&offset>=0&&
    Number.isSafeInteger(limit)&&limit>=1&&limit<=500,'INVALID_PAGE_RANGE');
  return {offset,limit};
}

/**
 * Reused for the original 1,255-relationship index and its opt-in native
 * 3,961-relationship expansion. Query predicates and pagination semantics
 * cannot drift between the two views.
 */
function indexSourceRows(
  input:readonly Readonly<{itemId:string;origins:readonly ItemOrigin[]}>[],
  expectedRelationCount:number
):ItemSourceBrowser{
  const byId=new Map<string,ItemSourceBrowserRow>();
  const perKind=new Map<OriginKind,{ids:Set<string>;count:number;confirmed:number;candidate:number}>();
  for(const kind of KINDS)perKind.set(kind,{
    ids:new Set(),count:0,confirmed:0,candidate:0
  });
  let relationCount=0,last=0;
  for(const row of input){
    const id=normalizeId(row.itemId);
    assert(!byId.has(id)&&Number(id)>last,'SORTED_UNIQUE_IDS');
    assert(Array.isArray(row.origins)&&row.origins.length>0,'ORIGIN_LEDGER_ROW');
    last=Number(id);
    for(const relation of row.origins){
      assert(relation.itemId===id&&relation.availability==='not_live_verified'&&
        STATUSES.includes(relation.routeStatus)&&KINDS.includes(relation.kind),
        'ORIGIN_LEDGER_RELATION');
      const kind=perKind.get(relation.kind)!;
      kind.ids.add(id);kind.count++;
      if(relation.routeStatus==='confirmed_source_link')kind.confirmed++;
      else kind.candidate++;
    }
    relationCount+=row.origins.length;
    byId.set(id,makeRow(id,row.origins));
  }
  assert(relationCount===expectedRelationCount,'ORIGIN_ROUTE_CENSUS');
  const counts=Object.freeze(KINDS.map(kind=>{
    const row=perKind.get(kind)!;
    return Object.freeze({
      kind,distinctItemIds:row.ids.size,
      sourceRelations:row.count,
      confirmedSourceLinks:row.confirmed,
      staticCandidateRelations:row.candidate
    });
  }));
  const knownLinkedItemIds=Object.freeze(input.map(row=>row.itemId));
  const itemKindCache=new Map<string,readonly string[]>();
  return Object.freeze({
    schema:DB02_ITEM_SOURCE_BROWSER_SCHEMA,
    sourceEvidenceOnly:true as const,
    originCoverageComplete:false as const,
    liveAvailabilityVerified:false as const,
    knownLinkedItemIds,originKindCounts:counts,
    getItem(raw:string|number){
      const id=normalizeId(raw);
      return byId.get(id)??makeRow(id,EMPTY_ORIGINS);
    },
    getKindItemIds(kind:OriginKind,status?:RouteStatus){
      assert(KINDS.includes(kind),'INVALID_KIND');
      assert(status===undefined||STATUSES.includes(status),'INVALID_STATUS');
      const key=kind+':'+(status??'all');
      const prior=itemKindCache.get(key);
      if(prior)return prior;
      const ids=knownLinkedItemIds.filter(id=>
        byId.get(id)!.origins.some(r=>r.kind===kind&&
          (status===undefined||r.routeStatus===status)));
      const result=ids.length?Object.freeze(ids):EMPTY_IDS;
      itemKindCache.set(key,result);
      return result;
    },
    query(filter:ItemSourceFilter={},page:Readonly<{offset?:number;limit?:number}>={}){
      const matches=predicates(filter);
      const {offset,limit}=checkPage(page);
      const matching:ItemSourceBrowserRow[]=[];
      let totalRelations=0;
      for(const id of knownLinkedItemIds){
        const row=byId.get(id)!;
        const selected=row.origins.filter(matches);
        if(selected.length===0)continue;
        totalRelations+=selected.length;
        matching.push(selected.length===row.origins.length?
          row:makeRow(id,selected));
      }
      const items=Object.freeze(matching.slice(offset,offset+limit));
      return Object.freeze({
        items,offset,limit,
        totalItemIds:matching.length,
        totalOriginRelations:totalRelations,
        hasMore:offset+items.length<matching.length,
        originCoverageComplete:false as const,
        liveAvailabilityVerified:false as const,
        sourceEvidenceOnly:true as const
      });
    }
  });
}
function validateLedger(ledger:OriginDatabase){
  assert(ledger?.schema===ORIGIN_SCHEMA&&
    ledger.originCoverageComplete===false&&
    typeof ledger.listLinkedItemIds==='function'&&
    typeof ledger.getItem==='function'&&
    typeof ledger.getCoverage==='function','ORIGIN_LEDGER_REQUIRED');
  const ids=ledger.listLinkedItemIds();
  const coverage=ledger.getCoverage();
  assert(Array.isArray(ids)&&ids.length===coverage.linkedItemIds,
    'ORIGIN_ID_CENSUS');
  const rows=ids.map(id=>{
    const row=ledger.getItem(id);
    assert(row.itemId===id&&row.originCoverageComplete===false,
      'ORIGIN_LEDGER_ROW');
    return {itemId:id,origins:row.origins};
  });
  return {rows,coverage};
}

/** Original source ledger only: never silently imports optional native routes. */
export function indexItemSourceBrowser(ledger:OriginDatabase):ItemSourceBrowser{
  const {rows,coverage}=validateLedger(ledger);
  return indexSourceRows(rows,coverage.linkedRoutes);
}

/**
 * Extend the existing source browse using ORIGINAL recipe-result and
 * activity-result ItemOrigin relations only, never LootTable or Stall
 * candidates. Both inputs must have passed public SHA/original-file checks.
 * This is a separate immutable view, leaving DB-00 and the original index
 * unchanged. A configured recipe result is not a verified player unlock.
 */
export function indexExpandedNativeItemSourceBrowser(
  ledger:OriginDatabase,
  recipes:NativeRecipeIndex,
  activities:NativeActivityResultIndex
):ExpandedNativeItemSourceBrowser{
  const {rows:baseRows,coverage:baseCoverage}=validateLedger(ledger);
  assert(baseCoverage.linkedRoutes===1255&&
    hasPinnedNativeRecipeEvidence(recipes)&&
    recipes.coverage.recipeDefinitions===1943&&
    recipes.origins.length===1943&&
    hasPinnedNativeActivityEvidence(activities)&&
    activities.coverage.nativeResultPaths===763&&
    activities.origins.length===763,'PINNED_NATIVE_SOURCE_REQUIRED');

  const rows=new Map<string,ItemOrigin[]>();
  const seenOrigins=new Set<string>();
  const append=(row:ItemOrigin)=>{
    const id=normalizeId(row.itemId);
    assert(typeof row.originId==='string'&&!seenOrigins.has(row.originId),
      'DUPLICATE_SOURCE_ORIGIN');
    seenOrigins.add(row.originId);
    const previous=rows.get(id);
    if(previous)previous.push(row);else rows.set(id,[row]);
  };
  for(const item of baseRows)for(const origin of item.origins)append(origin);
  for(const origin of recipes.origins){
    assert((origin.kind==='cooking'||origin.kind==='crafting')&&
      origin.routeStatus==='confirmed_source_link'&&
      origin.source.kind==='verified_game_native'&&
      origin.source.gameVersion==='1.26.2'&&
      origin.originId.startsWith('native:recipe:'),
      'NATIVE_RECIPE_SOURCE_SEMANTICS');
    append(origin);
  }
  for(const origin of activities.origins){
    assert((origin.kind==='fishing'||origin.kind==='mining'||
      origin.kind==='timebending'||origin.kind==='farming')&&
      origin.routeStatus==='confirmed_source_link'&&
      origin.source.kind==='verified_game_native'&&
      origin.source.gameVersion==='1.26.2'&&
      origin.originId.startsWith('native:path:'),
      'NATIVE_ACTIVITY_SOURCE_SEMANTICS');
    append(origin);
  }
  assert(seenOrigins.size===3961,'EXPANDED_SOURCE_CENSUS');
  const sorted=Object.freeze([...rows.entries()].sort(
    ([a],[b])=>Number(a)-Number(b)
  ).map(([itemId,origins])=>({itemId,origins})));
  const browser=indexSourceRows(sorted,3961);
  const expanded:ExpandedNativeItemSourceBrowser=Object.freeze({
    ...browser,
    nativeExpansionSchema:DB02_NATIVE_EXPANDED_SOURCE_BROWSER_SCHEMA,
    gameVersion:'1.26.2' as const,
    coverage:Object.freeze({
      baselineLedgerSourceRoutes:1255 as const,
      originalRecipeDefinitionRoutes:1943 as const,
      originalActivityResultRoutes:763 as const,
      combinedSourceRoutes:3961 as const,
      distinctLinkedItemIds:browser.knownLinkedItemIds.length,
      playerRecipeUnlockVerified:false as const,
      actualLootOrHarvestVerified:false as const,
      currentAvailabilityVerified:false as const,
      originalSourceCoverageComplete:false as const
    })
  });
  PINNED_EXPANDED_BROWSER.add(expanded);
  return expanded;
}

/** Admit expanded source joins only from the SHA-checked native index builder. */
export function hasPinnedExpandedNativeItemSourceEvidence(
  value:unknown
):value is ExpandedNativeItemSourceBrowser{
  return value!==null&&typeof value==='object'&&
    PINNED_EXPANDED_BROWSER.has(value);
}


/**
 * Cross-index original LootTable candidate entries, fixed initial container
 * slots, and configured *default* inventory entries. None of these source
 * records establishes a player grant or even a real-world availability scope.
 * Keep this separate from the 3,961 source-definition route index.
 */
export function indexStaticCandidateItemSources(
  loot:NativeLootCandidateIndex,
  containers:PinnedStaticContainerContents,
  defaults:PinnedDefaultInventorySource
):StaticCandidateItemSourceBrowser{
  assert(hasPinnedNativeLootCandidateEvidence(loot)&&
    loot.coverage.candidateRelations===3804&&
    loot.coverage.actualAcquisitionContextsVerified===0&&
    loot.coverage.guaranteedDropsVerified===0&&
    hasPinnedStaticContainerEvidence(containers)&&
    containers.coverage.populatedSourceSlots===146&&
    containers.coverage.containerSpawnVerified===false&&
    containers.coverage.guaranteedLootVerified===false&&
    hasPinnedDefaultInventoryEvidence(defaults)&&
    defaults.coverage.configuredEntries===289&&
    defaults.coverage.newPlayerGrantVerified===false&&
    defaults.coverage.privateSaveIncluded===false,
    'PINNED_CANDIDATE_SOURCE_REQUIRED');

  const byItem=new Map<string,ItemOrigin[]>();
  const identities=new Set<string>();
  const append=(row:ItemOrigin,family:'loot'|'container'|'default')=>{
    const id=normalizeId(row.itemId);
    assert(row.routeStatus==='static_candidate_only'&&
      row.availability==='not_live_verified'&&
      row.source.kind==='verified_game_native'&&
      row.source.gameVersion==='1.26.2'&&
      row.campaignId===null&&
      typeof row.originId==='string'&&!identities.has(row.originId),
      'CANDIDATE_ORIGIN_SEMANTICS');
    assert(family==='loot'?
      row.kind==='loot'&&row.originId.startsWith('native:path:loot:')&&
        loot.getItemStaticOrigins(id).includes(row):
      family==='container'?
        row.kind==='loot'&&row.originId.startsWith('db02:container:')&&
          containers.getItemCandidates(id).includes(row):
        row.kind==='other'&&row.originId.startsWith('db02:default-inventory:')&&
          defaults.getItemCandidates(id).includes(row),
      'ORIGINAL_CANDIDATE_SOURCE_IDENTITY');
    identities.add(row.originId);
    const previous=byItem.get(id);
    if(previous)previous.push(row);else byItem.set(id,[row]);
  };
  for(const origin of loot.staticCandidateOrigins)append(origin,'loot');
  for(const origin of containers.origins)append(origin,'container');
  for(const origin of defaults.origins)append(origin,'default');
  assert(loot.staticCandidateOrigins.length===3804&&
    containers.origins.length===146&&
    defaults.origins.length===289&&identities.size===4239,
    'STATIC_CANDIDATE_CENSUS');

  const ordered=[...byItem].sort(([a],[b])=>Number(a)-Number(b))
    .map(([itemId,origins])=>({itemId,origins}));
  const browser=indexSourceRows(ordered,4239);
  assert(browser.query().totalOriginRelations===4239&&
    browser.query({routeStatuses:['confirmed_source_link']}).totalOriginRelations===0,
    'UNVERIFIED_CANDIDATE_PROMOTION');
  const index:StaticCandidateItemSourceBrowser=Object.freeze({
    ...browser,
    candidateSchema:DB02_STATIC_CANDIDATE_SOURCE_BROWSER_SCHEMA,
    gameVersion:'1.26.2' as const,
    staticCandidatesOnly:true as const,
    actualAcquisitionVerified:false as const,
    gameplayContextVerified:false as const,
    playerOwnershipVerified:false as const,
    coverage:Object.freeze({
      lootTableCandidateRows:3804 as const,
      staticContainerTemplateRows:146 as const,
      defaultInventoryDefinitionRows:289 as const,
      totalCandidateRelations:4239 as const,
      distinctCandidateItemIds:browser.knownLinkedItemIds.length,
      guaranteedDropsVerified:0 as const,
      currentAvailabilityVerified:false as const,
      scopeOrExclusivityVerified:false as const
    })
  });
  PINNED_STATIC_BROWSER.add(index);
  return index;
}
export function hasPinnedStaticCandidateItemSourceEvidence(
  value:unknown
):value is StaticCandidateItemSourceBrowser {
  return value!==null&&typeof value==='object'&&
    PINNED_STATIC_BROWSER.has(value);
}

/**
 * Optional single-source search across the 3,961 original result references
 * and 4,239 *unverified* static candidates. Native record identity and route
 * status are reused directly; search filters are unchanged.
 */
export function indexAllOriginalItemSources(
  original:ExpandedNativeItemSourceBrowser,
  candidates:StaticCandidateItemSourceBrowser
):AllOriginalItemSourceBrowser{
  assert(hasPinnedExpandedNativeItemSourceEvidence(original)&&
    original.coverage.combinedSourceRoutes===3961&&
    hasPinnedStaticCandidateItemSourceEvidence(candidates)&&
    candidates.coverage.totalCandidateRelations===4239,
    'PINNED_COMBINED_SOURCE_REQUIRED');
  const byItem=new Map<string,ItemOrigin[]>();
  const originIds=new Set<string>();
  const append=(row:ItemOrigin)=>{
    assert(!originIds.has(row.originId),'COMBINED_ORIGIN_ID_COLLISION');
    originIds.add(row.originId);
    const old=byItem.get(row.itemId);
    if(old)old.push(row);else byItem.set(row.itemId,[row]);
  };
  for(const id of original.knownLinkedItemIds)
    for(const row of original.getItem(id).origins)append(row);
  for(const id of candidates.knownLinkedItemIds)
    for(const row of candidates.getItem(id).origins)append(row);
  assert(originIds.size===8200,'COMBINED_ORIGINAL_SOURCE_CENSUS');
  const rows=[...byItem].sort(([a],[b])=>Number(a)-Number(b))
    .map(([itemId,origins])=>({itemId,origins}));
  const browser=indexSourceRows(rows,8200);
  const combined:AllOriginalItemSourceBrowser=Object.freeze({
    ...browser,
    combinedSchema:DB02_ALL_ORIGINAL_SOURCE_BROWSER_SCHEMA,
    gameVersion:'1.26.2' as const,
    coverage:Object.freeze({
      baselinePublishedRoutes:1255 as const,
      nativeRecipeAndActivityRoutes:2706 as const,
      originalSourceRelations:3961 as const,
      staticCandidateRelations:4239 as const,
      combinedSourceRelations:8200 as const,
      distinctReferencedItemIds:browser.knownLinkedItemIds.length,
      actualLootGrantedVerified:false as const,
      completeAcquisitionCoverage:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const
    })
  });
  PINNED_ALL_ORIGINAL_BROWSER.add(combined);
  return combined;
}

/** Only a browser built by the SHA-pinned 3,961+4,239 source join is trusted. */
export function hasPinnedAllOriginalItemSourceEvidence(
  value:unknown
):value is AllOriginalItemSourceBrowser{
  return value!==null&&typeof value==='object'&&
    PINNED_ALL_ORIGINAL_BROWSER.has(value);
}

