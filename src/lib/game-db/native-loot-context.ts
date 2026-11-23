/**
 * DB-00 source-only reverse graph:
 *   Item ID <-> LootTable/nameKey/family <-> ActivityItem/Furniture objects.
 *
 * DB-02 owns SHA verification of original source files and all native joins.
 * Name-key prefixes are NOT gameplay acquisition methods, and an object
 * pointing at a LootTable does not prove a drop, reward or spawn.
 */
import {canonicalId} from './model.ts';
import type {DbLocale,SharedGameDatabase} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem}
  from './source-join.ts';
import {
  hasPinnedNativeLootCandidateEvidence,
  type NativeLootTable,
} from '../acquisition/public-native-loot.ts';
import {
  hasPinnedNativeLootNameEvidence,
  type NativeNamedLootIndex,type NativeLootNameEntry,
  type NamedNativeLootCandidate,type NativeLootNameFamilySummary
} from '../acquisition/public-native-loot-names.ts';
import {
  DB02_PUBLIC_NATIVE_OBJECT_LOOT_SCHEMA,
  type PublicNativeObjectLootIndex,type NativeObjectLootCandidate
} from '../acquisition/public-native-loot-objects.ts';
import type {NativeLootObjectReference}
  from '../acquisition/native-loot-object-references.ts';

export const DB00_NATIVE_LOOT_CONTEXT_CONTRACT=
  'wand.game-db.native-loot-context@1' as const;
const LOCALES=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
function assert(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB00_LOOT_CONTEXT_'+reason);
}
export interface Db00NativeLootObjectCandidate{
  readonly source:NativeObjectLootCandidate;
  readonly object:Db00SourceJoinedItem;
  readonly candidateItem:Db00SourceJoinedItem;
  readonly originalSourceLinkOnly:true;
  readonly actualGameplayDropVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00NativeLootCandidate{
  readonly source:NamedNativeLootCandidate;
  readonly item:Db00SourceJoinedItem;
  readonly originalNativeNameOnly:true;
  readonly gameplayAcquisitionContextVerified:false;
  readonly guaranteedDropVerified:false;
}
export interface Db00NativeLootContextItem{
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly namedTableCandidates:readonly Db00NativeLootCandidate[];
  readonly referencedByObjects:readonly Db00NativeLootObjectCandidate[];
  readonly originalSourceCandidatesOnly:true;
  readonly actualGameplayDropVerified:false;
  readonly liveAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00NativeLootContextTable{
  readonly table:NativeLootTable;
  readonly nativeName:NativeLootNameEntry;
  readonly candidates:readonly Db00NativeLootCandidate[];
  readonly objectReferrers:readonly Db00NativeLootObjectCandidate[];
  /** Can include source references to a table with no explicit Item entries. */
  readonly referenceOnlyObjects:readonly NativeLootObjectReference[];
  readonly originalNativeNameOnly:true;
  readonly gameplayAcquisitionContextVerified:false;
  readonly guaranteedDropVerified:false;
}
export interface Db00NativeLootContextObject{
  readonly objectId:string;
  readonly object:Db00SourceJoinedItem;
  readonly tableReferences:readonly NativeLootObjectReference[];
  readonly candidateItems:readonly Db00NativeLootObjectCandidate[];
  readonly staticSourceReferenceOnly:true;
  readonly actualGameplayDropVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00NativeLootFamily{
  readonly summary:NativeLootNameFamilySummary;
  readonly namedTableCandidates:readonly Db00NativeLootCandidate[];
  readonly sourceNativeFamilyOnly:true;
  readonly gameplayAcquisitionContextVerified:false;
}
export interface Db00NativeLootContextSearch{
  readonly family?:string;
  readonly sourceObjectReferencedOnly?:true;
  readonly text?:string;
  readonly locale?:DbLocale;
  readonly publishedOnly?:true;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00NativeLootContextPage{
  readonly scope:'source_native_loot_name_and_object_references_only';
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00NativeLootContextItem[];
  readonly actualGameplayDropVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00NativeLootContextReader{
  readonly contract:typeof DB00_NATIVE_LOOT_CONTEXT_CONTRACT;
  readonly snapshotId:string;
  readonly namedOriginalTables:960;
  readonly originalNameFamilies:28;
  readonly sourceObjectReferences:375;
  readonly sourceObjectCandidateRelations:698;
  readonly sourceObjectDistinctCandidateIds:356;
  readonly originalSourceCandidatesOnly:true;
  readonly actualGameplayDropVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  getItem(itemId:string|number):Db00NativeLootContextItem;
  getTable(tableId:string|number):Db00NativeLootContextTable|null;
  getObject(sourceObjectItemId:string|number):Db00NativeLootContextObject;
  getFamily(nativeSourceFamily:string):Db00NativeLootFamily|null;
  listFamilies():readonly string[];
  listSourceObjectIds():readonly string[];
  searchItems(request?:Db00NativeLootContextSearch):Db00NativeLootContextPage;
}

/** Both DB-02 readers must share one SHA-pinned original LootTable instance. */
export function createDb00NativeLootContextReader(
  database:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  named:NativeNamedLootIndex,
  objects:PublicNativeObjectLootIndex,
):Db00NativeLootContextReader {
  assert(database?.contract==='wand.game-db.shared@1' &&
    database.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    database.itemCount===13202 &&
    database.target.platform==='Steam' &&
    database.target.gameVersion==='1.26.2' &&
    joined?.contract==='wand.game-db.source-join@1' &&
    joined.snapshotId===database.snapshotId,'CURRENT_ITEMLIST_REQUIRED');
  assert(named?.schema==='wand.db02.public-native-named-loot-join@1' &&
    objects?.schema===DB02_PUBLIC_NATIVE_OBJECT_LOOT_SCHEMA &&
    named.gameVersion==='1.26.2' &&
    objects.gameVersion==='1.26.2' &&
    named.loot===objects.loot &&
    hasPinnedNativeLootCandidateEvidence(named.loot) &&
    hasPinnedNativeLootNameEvidence(named.names) &&
    named.loot.source.sha256===named.names.originalSourceSha256 &&
    named.names.coverage.nativeLootTables===960 &&
    named.names.coverage.uniqueNativeNameKeys===960 &&
    named.names.coverage.nativeSourceFamilies===28 &&
    named.names.coverage.nativeNameOnlyNotGameplayContext===true &&
    named.names.coverage.localizedDisplayNamesVerified===false &&
    named.names.coverage.actualAcquisitionContextVerified===false &&
    named.names.coverage.guaranteedDropsVerified===false &&
    named.candidateRelations.length===3804 &&
    named.familySummaries.length===28 &&
    named.sourceNativeNamesOnly===true &&
    named.guaranteedDropsVerified===false &&
    objects.coverage.directObjectTableReferences===375 &&
    objects.coverage.originalActivityItemObjectReferences===203 &&
    objects.coverage.originalFurnitureObjectReferences===172 &&
    objects.coverage.distinctReferencedLootTableIds===295 &&
    objects.coverage.expandedStaticCandidateRelations===698 &&
    objects.coverage.distinctCandidateItemIds===356 &&
    objects.coverage.distinctObjectItemPairs===642 &&
    objects.coverage.objectReferencesWithoutExplicitItemCandidates===9 &&
    objects.coverage.sourceObjectTableIdsVerified===true &&
    objects.coverage.sourceLootTableMembershipVerified===true &&
    objects.coverage.actualDropVerified===false &&
    objects.coverage.sourceFamiliesComplete===false &&
    objects.candidateRelations.length===698 &&
    objects.listSourceObjectItemIds().length===375 &&
    objects.listCandidateItemIds().length===356 &&
    named.listCandidateItemIds().length===1100,
    'PINNED_DB02_NAME_OBJECT_LOOT_SOURCES_REQUIRED');

  function wrapNamed(row:NamedNativeLootCandidate):Db00NativeLootCandidate{
    const item=joined.getItem(row.itemId);
    assert(row.itemId===item.itemId &&
      row.name.tableId===row.tableId &&
      row.nativeNameKey===row.name.nativeNameKey &&
      row.nativeSourceFamily===row.name.sourceFamily &&
      row.lootCandidate.tableId===row.tableId &&
      row.lootCandidate.itemId===row.itemId &&
      row.lootCandidate.routeStatus==='static_candidate_only' &&
      row.originalNameVerified===true &&
      row.nativeNameOnlyNotGameplayContext===true &&
      row.actualDropVerified===false &&
      row.availabilityVerified===false &&
      item.currentlyAvailableVerified===false &&
      item.playerOwnershipVerified===false,
      'NAMED_LOOT_ITEM_JOIN_MISMATCH');
    return Object.freeze({
      source:row,item,
      originalNativeNameOnly:true as const,
      gameplayAcquisitionContextVerified:false as const,
      guaranteedDropVerified:false as const
    });
  }
  function wrapObject(row:NativeObjectLootCandidate):
    Db00NativeLootObjectCandidate{
    const object=joined.getItem(row.sourceObjectItemId);
    const candidateItem=joined.getItem(row.itemId);
    assert(object.itemId===row.sourceObjectItemId &&
      candidateItem.itemId===row.itemId &&
      row.nativeObjectReference.sourceObjectItemId===row.sourceObjectItemId &&
      row.nativeObjectReference.lootTableId===row.lootTableId &&
      row.nativeLootCandidate.tableId===row.lootTableId &&
      row.nativeLootCandidate.itemId===row.itemId &&
      row.nativeLootCandidate.pathId===row.lootPathId &&
      row.routeStatus==='static_candidate_only' &&
      row.objectTableReferenceVerified===true &&
      row.candidateTableMembershipVerified===true &&
      row.gameplayAcquisitionContextVerified===false &&
      row.actualDropVerified===false &&
      row.currentAvailabilityVerified===false &&
      row.playerOwnershipVerified===false,
      'OBJECT_LOOT_ITEM_JOIN_MISMATCH');
    return Object.freeze({
      source:row,object,candidateItem,
      originalSourceLinkOnly:true as const,
      actualGameplayDropVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  }
  function getItem(raw:string|number):Db00NativeLootContextItem{
    const itemId=canonicalId(raw);
    const shared=joined.getItem(itemId);
    const namedTableCandidates=Object.freeze(
      named.getItemNamedCandidates(itemId).map(wrapNamed)
    );
    const referencedByObjects=Object.freeze(
      objects.getItemObjectCandidates(itemId).map(wrapObject)
    );
    assert(shared.itemId===itemId &&
      shared.currentlyAvailableVerified===false &&
      shared.playerOwnershipVerified===false &&
      referencedByObjects.every(row=>
        namedTableCandidates.some(n=>
          n.source.lootCandidate===row.source.nativeLootCandidate)),
      'ITEM_REVERSE_LOOT_GRAPH_MISMATCH');
    return Object.freeze({
      itemId,shared,namedTableCandidates,referencedByObjects,
      originalSourceCandidatesOnly:true as const,
      actualGameplayDropVerified:false as const,
      liveAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const,
    });
  }
  function getTable(raw:string|number):Db00NativeLootContextTable|null{
    const tableId=canonicalId(raw);
    const table=named.loot.getTable(tableId);
    if(!table)return null;
    const nativeName=named.getTableName(tableId);
    assert(nativeName?.tableId===tableId &&
      nativeName.originalKeyVerified===true &&
      nativeName.localizedDisplayNameVerified===false &&
      nativeName.gameplayAcquisitionContextVerified===false,
      'TABLE_NAME_IDENTITY_MISMATCH');
    const candidates=Object.freeze(
      named.getTableNamedCandidates(tableId).map(wrapNamed)
    );
    const referrers=objects.getTableObjectCandidates(tableId);
    const objectReferrers=Object.freeze(referrers.map(wrapObject));
    const referenceOnlyObjects=objects.getTableObjectReferences(tableId);
    assert(candidates.length===table.groups.reduce(
      (sum,group)=>sum+group.candidates.length,0) &&
      objectReferrers.every(row=>row.source.lootTableId===tableId) &&
      referenceOnlyObjects.every(ref=>ref.lootTableId===tableId),
      'TABLE_CANDIDATE_IDENTITY_MISMATCH');
    return Object.freeze({
      table,nativeName,candidates,objectReferrers,referenceOnlyObjects,
      originalNativeNameOnly:true as const,
      gameplayAcquisitionContextVerified:false as const,
      guaranteedDropVerified:false as const
    });
  }
  function getObject(raw:string|number):Db00NativeLootContextObject{
    const objectId=canonicalId(raw);
    const object=joined.getItem(objectId);
    const tableReferences=objects.getObjectTableReferences(objectId);
    const candidateItems=Object.freeze(
      objects.getObjectCandidateItems(objectId).map(wrapObject)
    );
    assert(object.itemId===objectId &&
      candidateItems.every(row=>
        row.source.sourceObjectItemId===objectId &&
        tableReferences.includes(row.source.nativeObjectReference)),
      'OBJECT_TABLE_REFERENCE_MISMATCH');
    return Object.freeze({
      objectId,object,tableReferences,candidateItems,
      staticSourceReferenceOnly:true as const,
      actualGameplayDropVerified:false as const,
      playerOwnershipVerified:false as const
    });
  }
  function getFamily(name:string):Db00NativeLootFamily|null{
    const summary=named.getFamilySummary(name);
    if(!summary)return null;
    const rows=named.getFamilyCandidates(name);
    const namedTableCandidates=Object.freeze(rows.map(wrapNamed));
    assert(summary.family===name &&
      summary.candidateRelations===namedTableCandidates.length &&
      summary.acquisitionContextVerified===false,
      'FAMILY_SOURCE_COUNTS_MISMATCH');
    return Object.freeze({
      summary,namedTableCandidates,
      sourceNativeFamilyOnly:true as const,
      gameplayAcquisitionContextVerified:false as const
    });
  }
  function searchItems(request:Db00NativeLootContextSearch={}):
    Db00NativeLootContextPage{
    assert(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const locale=request.locale??'en';
    assert(LOCALES.has(locale),'INVALID_LOCALE');
    const value=request.text??'';
    assert(typeof value==='string'&&value.length<=120&&
      !/[\x00-\x1f]/.test(value),'INVALID_TEXT');
    assert(request.publishedOnly===undefined||request.publishedOnly===true,
      'INVALID_PUBLISHED_FILTER');
    assert(request.sourceObjectReferencedOnly===undefined||
      request.sourceObjectReferencedOnly===true,'INVALID_OBJECT_FILTER');
    const family=request.family;
    assert(family===undefined||
      (typeof family==='string' &&
        named.names.listNativeFamilies().includes(family)),
      'INVALID_FAMILY_FILTER');
    const offset=request.offset??0,limit=request.limit??100;
    assert(Number.isSafeInteger(offset)&&offset>=0&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,
      'INVALID_PAGE');
    const needle=value.normalize('NFKC').toLocaleLowerCase().trim();
    const ids=named.listCandidateItemIds().filter(id=>{
      const published=database.getItem(id);
      if(request.publishedOnly&&!published)return false;
      if(request.sourceObjectReferencedOnly &&
        !objects.getItemObjectCandidates(id).length)return false;
      if(family!==undefined&&!named.getItemNamedCandidates(id)
        .some(row=>row.nativeSourceFamily===family))return false;
      return !needle||id.startsWith(needle)||
        !!published?.names[locale]?.normalize('NFKC')
          .toLocaleLowerCase().includes(needle)||
        named.getItemNamedCandidates(id).some(row=>
          row.nativeNameKey.normalize('NFKC')
            .toLocaleLowerCase().includes(needle));
    });
    const items=Object.freeze(ids.slice(offset,offset+limit).map(getItem));
    const next=offset+items.length;
    return Object.freeze({
      scope:'source_native_loot_name_and_object_references_only' as const,
      snapshotId:database.snapshotId,total:ids.length,offset,
      nextOffset:next<ids.length?next:null,items,
      actualGameplayDropVerified:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
    });
  }
  return Object.freeze({
    contract:DB00_NATIVE_LOOT_CONTEXT_CONTRACT,
    snapshotId:database.snapshotId,
    namedOriginalTables:960 as const,
    originalNameFamilies:28 as const,
    sourceObjectReferences:375 as const,
    sourceObjectCandidateRelations:698 as const,
    sourceObjectDistinctCandidateIds:356 as const,
    originalSourceCandidatesOnly:true as const,
    actualGameplayDropVerified:false as const,
    currentAvailabilityVerified:false as const,
    playerOwnershipVerified:false as const,
    getItem,getTable,getObject,getFamily,
    listFamilies:()=>named.names.listNativeFamilies(),
    listSourceObjectIds:()=>objects.listSourceObjectItemIds(),
    searchItems,
  });
}
