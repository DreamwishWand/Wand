/**
 * Steam 1.26.2 original LootTable -> possible Item ID -> reference context.
 *
 * Every original LootTable candidate is represented once. Object definitions
 * and stall slots are independent original references to that LootTable, not
 * extra drops or proof of a playable acquisition method. Native table name
 * keys are metadata; "Chest" and "Stall" in an internal name are not proof
 * of a specific runtime container or sale.
 *
 * All raw sources must pass their existing original-file and public SHA pins.
 * User-private saves, server shop rotations and gameplay state are not read.
 */
import type {ItemOrigin} from './origins.ts';
import {
  hasPinnedAllOriginalItemSourceEvidence,
  type AllOriginalItemSourceBrowser,type ItemSourceBrowserRow
} from './item-source-browser.ts';
import {
  hasPinnedNativeLootCandidateEvidence,
  type NativeLootCandidateIndex,type NativeLootCandidate
} from './public-native-loot.ts';
import {
  hasPinnedNativeLootNameEvidence,joinPinnedNativeLootNames,
  type NativeLootNameIndex,type NativeLootNameEntry
} from './public-native-loot-names.ts';
import {
  joinPinnedNativeObjectLoot,type NativeObjectLootCandidate
} from './public-native-loot-objects.ts';
import {
  hasPinnedNativeStallSlotEvidence,joinPinnedNativeStallLoot,
  type NativeStallSlotIndex,type NativeStallItemCandidate
} from './public-native-stalls.ts';

export const DB02_NATIVE_LOOT_CONTEXT_SEARCH_SCHEMA=
  'wand.db02.native-loot-context-search@1' as const;

const ID=/^[1-9][0-9]{0,15}$/;
const NAME=/^[A-Za-z][A-Za-z0-9_-]{0,95}$/;
const SOURCE_FAMILIES=Object.freeze(['ActivityItem','Furniture'] as const);
const CONTEXT_FILTERS=Object.freeze([
  'any','object','stall','either','unlinked'
] as const);
export type NativeLootContextFilterKind=typeof CONTEXT_FILTERS[number];
export type NativeLootObjectFamily=typeof SOURCE_FAMILIES[number];
const EMPTY_PATHS=Object.freeze([]) as readonly NativeLootContextPath[];
const EMPTY_IDS=Object.freeze([]) as readonly string[];

export interface NativeLootContextPath {
  readonly itemId:string;
  /** Exact original LootTable group/ordinal path; never a grant. */
  readonly nativeLootCandidate:NativeLootCandidate;
  readonly originalCandidateOrigin:ItemOrigin;
  readonly lootPathId:string;
  readonly lootTableId:string;
  readonly nativeTableName:NativeLootNameEntry;
  readonly nativeNameOnlyNotGameplayContext:true;
  readonly objectReferences:readonly NativeObjectLootCandidate[];
  readonly stallReferences:readonly NativeStallItemCandidate[];
  readonly routeStatus:'static_candidate_only';
  readonly linkedObjectDefinitionVerified:boolean;
  readonly linkedStallSlotVerified:boolean;
  readonly actualDropVerified:false;
  readonly liveShopStockVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface NativeLootContextItem {
  readonly itemId:string;
  /** Unfiltered 8,200 total original references for this Item ID. */
  readonly originalSourceEvidence:ItemSourceBrowserRow;
  /** LootTable paths only; other original references remain above. */
  readonly paths:readonly NativeLootContextPath[];
  readonly unknownBecauseNoLootTableReference:boolean;
  readonly actualAcquisitionVerified:false;
  readonly liveAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface NativeLootContextFilter {
  /** All requested dimensions apply to the SAME LootTable candidate path. */
  readonly lootTableId?:string|number;
  readonly nativeSourceFamily?:string;
  readonly sourceObjectItemId?:string|number;
  readonly sourceObjectFamily?:NativeLootObjectFamily;
  readonly stallId?:string|number;
  readonly shopDataKey?:string;
  readonly reference?:NativeLootContextFilterKind;
}
export interface NativeLootContextSearchResult {
  readonly items:readonly NativeLootContextItem[];
  readonly totalItemIds:number;
  readonly totalLootCandidatePaths:number;
  readonly totalObjectReferenceEdges:number;
  readonly totalStallSlotReferenceEdges:number;
  readonly offset:number;
  readonly limit:number;
  readonly hasMore:boolean;
  readonly actualAcquisitionVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface NativeLootContextIndex {
  readonly schema:typeof DB02_NATIVE_LOOT_CONTEXT_SEARCH_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly staticReferenceEvidenceOnly:true;
  readonly coverage:Readonly<{
    originalSourceRelations:8200;
    originalLootTableCandidatePaths:3804;
    nativeLootTableNameRecords:960;
    nativeObjectTableReferences:375;
    nativeStallDefinitions:65;
    originalObjectCandidateEdges:698;
    originalStallSlotCandidateEdges:1385;
    distinctLootCandidateItemIds:1100;
    lootPathsWithObjectReference:number;
    lootPathsWithStallReference:number;
    lootPathsWithAnyKnownReferrer:number;
    lootPathsWithNoKnownReferrer:number;
    verifiedGameplayAcquisitionLinks:0;
    guaranteedDropsVerified:0;
    currentAvailabilityVerified:false;
    liveShopStockVerified:false;
    playerOwnershipVerified:false;
  }>;
  readonly knownLootCandidateItemIds:readonly string[];
  getItem(itemId:string|number):NativeLootContextItem;
  query(
    filter?:NativeLootContextFilter,
    page?:Readonly<{offset?:number;limit?:number}>
  ):NativeLootContextSearchResult;
  listItemIds(reference?:NativeLootContextFilterKind):readonly string[];
}

function check(ok:unknown,why:string):asserts ok{
  if(!ok)throw new TypeError('DB02_LOOT_CONTEXT_'+why);
}
function id(raw:unknown):string{
  const result=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof result==='string'&&ID.test(result)&&
    Number.isSafeInteger(Number(result)),'INVALID_ITEM_ID');
  return result;
}
function sourceName(raw:unknown,why:string):string{
  check(typeof raw==='string'&&NAME.test(raw),why);
  return raw;
}
function sortedIds(ids:Iterable<string>):readonly string[]{
  return Object.freeze([...new Set(ids)].sort((a,b)=>Number(a)-Number(b)));
}
function add<T>(target:Map<string,T[]>,key:string,row:T):void{
  const existing=target.get(key);
  if(existing)existing.push(row);else target.set(key,[row]);
}
function byPath<T extends {lootPathId:string;itemId:string}>(
  rows:readonly T[]
):Map<string,readonly T[]>{
  const values=new Map<string,T[]>();
  for(const row of rows)add(values,row.lootPathId,row);
  return new Map([...values].map(([key,list])=>[key,Object.freeze(list)]));
}
function validateFilter(filter:NativeLootContextFilter){
  check(filter!==null&&typeof filter==='object'&&!Array.isArray(filter),
    'INVALID_FILTER');
  const table=filter.lootTableId===undefined?null:id(filter.lootTableId);
  const obj=filter.sourceObjectItemId===undefined?
    null:id(filter.sourceObjectItemId);
  const stall=filter.stallId===undefined?null:id(filter.stallId);
  const family=filter.nativeSourceFamily===undefined?null:
    sourceName(filter.nativeSourceFamily,'INVALID_NATIVE_FAMILY');
  const shop=filter.shopDataKey===undefined?null:
    sourceName(filter.shopDataKey,'INVALID_SHOP_DATA_KEY');
  const objectFamily=filter.sourceObjectFamily??null;
  check(objectFamily===null||SOURCE_FAMILIES.includes(objectFamily),
    'INVALID_OBJECT_FAMILY');
  const reference=filter.reference??'any';
  check(CONTEXT_FILTERS.includes(reference),'INVALID_REFERENCE_FILTER');
  return (row:NativeLootContextPath)=>{
    const objects=row.objectReferences;
    const stalls=row.stallReferences;
    const objectOK=objects.some(ref=>
      (obj===null||ref.sourceObjectItemId===obj)&&
      (objectFamily===null||ref.sourceFamily===objectFamily));
    const stallOK=stalls.some(ref=>
      (stall===null||ref.stallId===stall)&&
      (shop===null||ref.shopDataKey===shop));
    return (table===null||row.lootTableId===table)&&
      (family===null||row.nativeTableName.sourceFamily===family)&&
      ((obj===null&&objectFamily===null)||objectOK)&&
      ((stall===null&&shop===null)||stallOK)&&
      (reference==='any'||
        reference==='object'&&objects.length>0||
        reference==='stall'&&stalls.length>0||
        reference==='either'&&(objects.length>0||stalls.length>0)||
        reference==='unlinked'&&objects.length===0&&stalls.length===0);
  };
}
function pageArgs(page:Readonly<{offset?:number;limit?:number}>){
  check(page!==null&&typeof page==='object'&&!Array.isArray(page),
    'INVALID_PAGE');
  const offset=page.offset??0,limit=page.limit??100;
  check(Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000&&
    Number.isSafeInteger(limit)&&limit>=1&&limit<=500,'INVALID_PAGE');
  return {offset,limit};
}

/**
 * Links only original data references:
 * - original LootTable entry / Item ID
 * - ActivityItem or Furniture definition -> exact LootTable
 * - Building stall slot -> exact LootTable
 * - original LootTable internal name (not a translated source or actual shop)
 */
export function indexNativeLootContexts(
  original:AllOriginalItemSourceBrowser,
  loot:NativeLootCandidateIndex,
  names:NativeLootNameIndex,
  stalls:NativeStallSlotIndex
):NativeLootContextIndex{
  check(hasPinnedAllOriginalItemSourceEvidence(original)&&
    original.coverage.combinedSourceRelations===8200&&
    hasPinnedNativeLootCandidateEvidence(loot)&&
    loot.coverage.candidateRelations===3804&&
    loot.coverage.actualAcquisitionContextsVerified===0&&
    hasPinnedNativeLootNameEvidence(names)&&
    names.coverage.nativeLootTables===960&&
    names.coverage.nativeNameOnlyNotGameplayContext===true&&
    hasPinnedNativeStallSlotEvidence(stalls)&&
    stalls.coverage.staticStallDefinitions===65&&
    stalls.coverage.slotLootTableReferences===335&&
    stalls.coverage.liveShopStockVerified===false,
    'PINNED_SOURCE_REQUIRED');

  const objects=joinPinnedNativeObjectLoot(loot);
  const shops=joinPinnedNativeStallLoot(stalls,loot);
  const named=joinPinnedNativeLootNames(loot,names);
  check(objects.loot===loot&&shops.lootCandidates===loot&&
    named.loot===loot&&
    objects.candidateRelations.length===698&&
    shops.slotExpandedCandidates.length===1385&&
    named.candidateRelations.length===3804,
    'ORIGINAL_REFERENCE_CENSUS');

  const objectRows=byPath(objects.candidateRelations);
  const stallRows=byPath(shops.slotExpandedCandidates);
  const nativeNames=new Map(
    named.candidateRelations.map(row=>[row.lootCandidate.pathId,row])
  );
  const byItem=new Map<string,NativeLootContextPath[]>();
  const knownPaths=new Set<string>();
  let withObject=0,withStall=0,withEither=0;
  let objectEdgeCount=0,stallEdgeCount=0;

  for(const candidate of loot.candidates){
    const pathId=candidate.pathId;
    check(!knownPaths.has(pathId)&&
      candidate.routeStatus==='static_candidate_only'&&
      candidate.gameplayContextVerified===false&&
      candidate.itemGrantVerified===false,
      'ORIGINAL_LOOT_PATH_DUPLICATE_OR_INVALID');
    knownPaths.add(pathId);
    const sourceOrigin=loot.getItemStaticOrigins(candidate.itemId).find(
      o=>o.originId==='native:path:'+pathId
    );
    check(sourceOrigin!==undefined&&
      original.getItem(candidate.itemId).origins.includes(sourceOrigin)&&
      sourceOrigin.kind==='loot'&&
      sourceOrigin.routeStatus==='static_candidate_only',
      'ORIGINAL_BROWSER_LOOT_PATH_MISMATCH');
    const name=nativeNames.get(pathId);
    check(name!==undefined&&
      name.itemId===candidate.itemId&&
      name.tableId===candidate.tableId&&
      name.originalNameVerified===true&&
      name.nativeNameOnlyNotGameplayContext===true&&
      name.name.tableId===candidate.tableId,
      'ORIGINAL_NATIVE_LOOT_NAME_MISMATCH');
    const objectReferences=objectRows.get(pathId)??Object.freeze([]);
    const stallReferences=stallRows.get(pathId)??Object.freeze([]);
    for(const row of objectReferences)check(
      row.itemId===candidate.itemId&&
      row.lootTableId===candidate.tableId&&
      row.nativeLootCandidate===candidate&&
      row.routeStatus==='static_candidate_only'&&
      row.actualDropVerified===false&&
      row.objectTableReferenceVerified===true,
      'OBJECT_REFERENCE_LOOT_PATH_MISMATCH'
    );
    for(const row of stallReferences)check(
      row.itemId===candidate.itemId&&
      row.lootTableId===candidate.tableId&&
      row.routeStatus==='static_candidate_only'&&
      row.liveStockVerified===false&&
      row.itemInReferencedLootTableVerified===true,
      'STALL_REFERENCE_LOOT_PATH_MISMATCH'
    );
    if(objectReferences.length)withObject++;
    if(stallReferences.length)withStall++;
    if(objectReferences.length||stallReferences.length)withEither++;
    objectEdgeCount+=objectReferences.length;
    stallEdgeCount+=stallReferences.length;
    const route:NativeLootContextPath=Object.freeze({
      itemId:candidate.itemId,nativeLootCandidate:candidate,
      originalCandidateOrigin:sourceOrigin,lootPathId:pathId,
      lootTableId:candidate.tableId,nativeTableName:name.name,
      nativeNameOnlyNotGameplayContext:true as const,
      objectReferences,stallReferences,
      routeStatus:'static_candidate_only' as const,
      linkedObjectDefinitionVerified:objectReferences.length>0,
      linkedStallSlotVerified:stallReferences.length>0,
      actualDropVerified:false as const,
      liveShopStockVerified:false as const,
      playerOwnershipVerified:false as const
    });
    add(byItem,candidate.itemId,route);
  }
  check(knownPaths.size===3804&&nativeNames.size===3804&&
    objectEdgeCount===698&&stallEdgeCount===1385&&
    byItem.size===1100,
    'ORIGINAL_CONTEXT_PATH_CENSUS');

  for(const routes of byItem.values())Object.freeze(routes);
  const all=sortedIds(byItem.keys());
  const referenceIds=new Map<NativeLootContextFilterKind,readonly string[]>();
  for(const type of CONTEXT_FILTERS){
    const predicate=validateFilter({reference:type});
    referenceIds.set(type,sortedIds(all.filter(itemId=>
      byItem.get(itemId)!.some(predicate))));
  }
  function makeItem(itemId:string,paths:readonly NativeLootContextPath[]){
    const originalSourceEvidence=original.getItem(itemId);
    return Object.freeze({
      itemId,originalSourceEvidence,paths,
      unknownBecauseNoLootTableReference:paths.length===0,
      actualAcquisitionVerified:false as const,
      liveAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const
    });
  }
  return Object.freeze({
    schema:DB02_NATIVE_LOOT_CONTEXT_SEARCH_SCHEMA,
    gameVersion:'1.26.2' as const,
    staticReferenceEvidenceOnly:true as const,
    coverage:Object.freeze({
      originalSourceRelations:8200 as const,
      originalLootTableCandidatePaths:3804 as const,
      nativeLootTableNameRecords:960 as const,
      nativeObjectTableReferences:375 as const,
      nativeStallDefinitions:65 as const,
      originalObjectCandidateEdges:698 as const,
      originalStallSlotCandidateEdges:1385 as const,
      distinctLootCandidateItemIds:1100 as const,
      lootPathsWithObjectReference:withObject,
      lootPathsWithStallReference:withStall,
      lootPathsWithAnyKnownReferrer:withEither,
      lootPathsWithNoKnownReferrer:3804-withEither,
      verifiedGameplayAcquisitionLinks:0 as const,
      guaranteedDropsVerified:0 as const,
      currentAvailabilityVerified:false as const,
      liveShopStockVerified:false as const,
      playerOwnershipVerified:false as const
    }),
    knownLootCandidateItemIds:all,
    getItem(raw:string|number):NativeLootContextItem{
      const itemId=id(raw);
      return makeItem(itemId,byItem.get(itemId)??EMPTY_PATHS);
    },
    listItemIds(reference:NativeLootContextFilterKind='any'){
      check(CONTEXT_FILTERS.includes(reference),'INVALID_REFERENCE_FILTER');
      return referenceIds.get(reference)??EMPTY_IDS;
    },
    query(
      filter:NativeLootContextFilter={},
      page:Readonly<{offset?:number;limit?:number}>={}
    ):NativeLootContextSearchResult{
      const matches=validateFilter(filter);
      const {offset,limit}=pageArgs(page);
      const filtered:NativeLootContextItem[]=[];
      let paths=0,objectEdges=0,stallEdges=0;
      for(const itemId of all){
        const selected=byItem.get(itemId)!.filter(matches);
        if(selected.length===0)continue;
        paths+=selected.length;
        for(const row of selected){
          objectEdges+=row.objectReferences.length;
          stallEdges+=row.stallReferences.length;
        }
        filtered.push(makeItem(itemId,Object.freeze(selected)));
      }
      const items=Object.freeze(filtered.slice(offset,offset+limit));
      return Object.freeze({
        items,totalItemIds:filtered.length,
        totalLootCandidatePaths:paths,
        totalObjectReferenceEdges:objectEdges,
        totalStallSlotReferenceEdges:stallEdges,
        offset,limit,hasMore:offset+items.length<filtered.length,
        actualAcquisitionVerified:false as const,
        currentAvailabilityVerified:false as const
      });
    }
  });
}
