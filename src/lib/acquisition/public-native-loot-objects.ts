/**
 * DB-02 original object -> LootTable -> possible Item ID crosswalk.
 *
 * Combines two existing public-only, independent verified sources:
 * - Steam 1.26.2 original ActivityItem/Furniture object reference table;
 * - the SHA-pinned original LootTable candidate reader.
 *
 * An object references a LootTable definition in game data. This does NOT
 * prove destroying, harvesting, opening or otherwise using that object gives
 * any specific Item. No runtime probabilities, unlocks or live state inferred.
 *
 * This is a TypeScript-only join, NOT an independent parser of game binaries.
 */
import {
  nativeLootObjectReferenceIndex,
  DB02_LOOT_OBJECT_REFERENCES_SCHEMA,DB02_LOOT_OBJECT_ORIGINAL_SHA256,
  type NativeLootObjectReference
} from './native-loot-object-references.ts';
import {
  hasPinnedNativeLootCandidateEvidence,DB02_NATIVE_LOOT_SCHEMA,
  type NativeLootCandidateIndex,type NativeLootCandidate
} from './public-native-loot.ts';

export const DB02_PUBLIC_NATIVE_OBJECT_LOOT_SCHEMA=
  'wand.db02.public-native-object-loot-join@1' as const;
const ID=/^[1-9][0-9]{0,15}$/;
const NO_CANDIDATES=Object.freeze([]) as readonly NativeObjectLootCandidate[];
const NO_REFERENCES=Object.freeze([]) as readonly NativeLootObjectReference[];
const NO_IDS=Object.freeze([]) as readonly string[];

export interface NativeObjectLootCandidate {
  readonly itemId:string;
  readonly sourceObjectItemId:string;
  readonly sourceFamily:'ActivityItem'|'Furniture';
  readonly sourceWirePath:NativeLootObjectReference['sourceWirePath'];
  readonly lootTableId:string;
  readonly lootGroupIndex:number;
  readonly lootCandidateOrdinal:number;
  readonly lootPathId:string;
  readonly nativeObjectReference:NativeLootObjectReference;
  readonly nativeLootCandidate:NativeLootCandidate;
  /** Explicit ID reference in original ActivityItem/Furniture definition. */
  readonly objectTableReferenceVerified:true;
  /** Original LootTable includes this candidate Item ID. */
  readonly candidateTableMembershipVerified:true;
  readonly routeStatus:'static_candidate_only';
  readonly gameplayAcquisitionContextVerified:false;
  readonly actualDropVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface PublicNativeObjectLootCoverage {
  readonly originalGameVersion:'1.26.2';
  readonly originalLootTables:960;
  readonly originalLootItemReferences:3804;
  readonly originalActivityItemObjectReferences:203;
  readonly originalFurnitureObjectReferences:172;
  readonly directObjectTableReferences:375;
  readonly distinctSourceObjectItemIds:375;
  readonly distinctReferencedLootTableIds:295;
  /** Source-linked table candidates; no claim that gameplay grants them. */
  readonly expandedStaticCandidateRelations:698;
  readonly distinctCandidateItemIds:356;
  readonly distinctObjectItemPairs:642;
  readonly objectReferencesWithoutExplicitItemCandidates:9;
  readonly conditionalCandidateRelations:0;
  readonly dynamicFilteredCandidateRelations:0;
  readonly eligibilityGatedCandidateRelations:5;
  readonly sourceObjectTableIdsVerified:true;
  readonly sourceLootTableMembershipVerified:true;
  readonly actualDropVerified:false;
  readonly playerUnlockVerified:false;
  readonly sourceFamiliesComplete:false;
}
export interface PublicNativeObjectLootIndex {
  readonly schema:typeof DB02_PUBLIC_NATIVE_OBJECT_LOOT_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly loot:NativeLootCandidateIndex;
  readonly coverage:PublicNativeObjectLootCoverage;
  readonly candidateRelations:readonly NativeObjectLootCandidate[];
  /** Returns reference-only objects even when a table has no explicit Item. */
  getObjectTableReferences(
    sourceObjectItemId:string|number
  ):readonly NativeLootObjectReference[];
  /** Source object -> each possible LootTable Item entry; does not imply drop. */
  getObjectCandidateItems(
    sourceObjectItemId:string|number
  ):readonly NativeObjectLootCandidate[];
  /** Item ID -> object definitions referring to its LootTable. */
  getItemObjectCandidates(itemId:string|number):readonly NativeObjectLootCandidate[];
  getTableObjectReferences(
    lootTableId:string|number
  ):readonly NativeLootObjectReference[];
  getTableObjectCandidates(
    lootTableId:string|number
  ):readonly NativeObjectLootCandidate[];
  listSourceObjectItemIds():readonly string[];
  listCandidateItemIds():readonly string[];
  listReferencedLootTableIds():readonly string[];
}
function check(value:unknown,code:string):asserts value {
  if(!value)throw new TypeError('DB02_PUBLIC_OBJECT_LOOT_'+code);
}
function canonicalId(raw:unknown):string {
  const id=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof id==='string'&&ID.test(id)&&
    Number.isSafeInteger(Number(id)),'INVALID_ITEM_ID');
  return id;
}
function add<T>(index:Map<string,T[]>,key:string,value:T):void{
  const rows=index.get(key);
  if(rows)rows.push(value);
  else index.set(key,[value]);
}
function freezeMap<T>(index:Map<string,T[]>):void{
  for(const rows of index.values())Object.freeze(rows);
}
function sortedIds(values:Iterable<string>):readonly string[]{
  return Object.freeze([...new Set(values)].sort((a,b)=>Number(a)-Number(b)));
}

/** Accepts *only* the SHA-pinned public LootTable index and existing source references. */
export function joinPinnedNativeObjectLoot(
  loot:NativeLootCandidateIndex
):PublicNativeObjectLootIndex {
  const refs=nativeLootObjectReferenceIndex;
  check(hasPinnedNativeLootCandidateEvidence(loot)&&
    loot.schema===DB02_NATIVE_LOOT_SCHEMA&&
    loot.gameVersion==='1.26.2'&&
    loot.source.sha256===DB02_LOOT_OBJECT_ORIGINAL_SHA256.lootTable&&
    loot.coverage.nativeTables===960&&
    loot.coverage.candidateRelations===3804&&
    loot.coverage.actualAcquisitionContextsVerified===0&&
    refs.schema===DB02_LOOT_OBJECT_REFERENCES_SCHEMA&&
    refs.coverage.originalGameVersion==='1.26.2'&&
    refs.coverage.originalPlatform==='Steam'&&
    refs.coverage.allDefinitionReferences===375&&
    refs.coverage.activityItemReferences===203&&
    refs.coverage.furnitureReferences===172&&
    refs.coverage.distinctReferencedLootTableIds===295&&
    refs.coverage.directObjectTableReferencesVerified===true&&
    refs.coverage.gameplayDropSemanticsVerified===false,
    'PINNED_ORIGINAL_SOURCE_REQUIRED');

  const byObjectRefs=new Map<string,NativeLootObjectReference[]>();
  const byObject=new Map<string,NativeObjectLootCandidate[]>();
  const byItem=new Map<string,NativeObjectLootCandidate[]>();
  const byTableRefs=new Map<string,NativeLootObjectReference[]>();
  const byTableCandidates=new Map<string,NativeObjectLootCandidate[]>();
  const candidateRows:NativeObjectLootCandidate[]=[];
  const pairIds=new Set<string>();
  const tableIds=new Set<string>();
  let activity=0,furniture=0,empty=0,conditional=0,dynamic=0,eligible=0;

  for(const table of loot.tables){
    const references=refs.getLootTableReferrers(table.tableId);
    if(!references.length)continue;
    tableIds.add(table.tableId);
    for(const reference of references){
      check(reference.lootTableId===table.tableId&&
        reference.lootTableOriginalSha256===
          DB02_LOOT_OBJECT_ORIGINAL_SHA256.lootTable&&
        reference.sourceDefinitionRefVerified===true&&
        reference.lootContextVerified===false&&
        reference.actualDropVerified===false&&
        reference.playerUnlockVerified===false,
        'UNVERIFIED_OBJECT_REFERENCE');
      const expectedSha=reference.sourceFamily==='ActivityItem'?
        DB02_LOOT_OBJECT_ORIGINAL_SHA256.activityItem:
        DB02_LOOT_OBJECT_ORIGINAL_SHA256.furniture;
      const expectedFile=reference.sourceFamily==='ActivityItem'?
        'itemlist/ActivityItem.json':'itemlist/Furniture.json';
      check(reference.sourceOriginalSha256===expectedSha&&
        reference.sourceFile===expectedFile&&
        (reference.sourceFamily==='Furniture'?
          reference.sourceWirePath==='protobuf.12':
          reference.sourceWirePath==='protobuf.8'||
          reference.sourceWirePath==='protobuf.9'||
          reference.sourceWirePath==='protobuf.11.1'),
        'NATIVE_OBJECT_FIELD_MISMATCH');
      if(reference.sourceFamily==='ActivityItem')activity++;
      else furniture++;
      add(byTableRefs,table.tableId,reference);
      add(byObjectRefs,reference.sourceObjectItemId,reference);
      let entryCount=0;
      for(const group of table.groups){
        for(const candidate of group.candidates){
          check(candidate.tableId===table.tableId&&
            candidate.itemGrantVerified===false&&
            candidate.gameplayContextVerified===false&&
            candidate.routeStatus==='static_candidate_only',
            'UNVERIFIED_NATIVE_LOOT_ENTRY');
          const itemId=candidate.itemId;
          const row:NativeObjectLootCandidate=Object.freeze({
            itemId,sourceObjectItemId:reference.sourceObjectItemId,
            sourceFamily:reference.sourceFamily,
            sourceWirePath:reference.sourceWirePath,
            lootTableId:table.tableId,lootGroupIndex:group.groupIndex,
            lootCandidateOrdinal:candidate.candidateOrdinal,
            lootPathId:candidate.pathId,
            nativeObjectReference:reference,nativeLootCandidate:candidate,
            objectTableReferenceVerified:true as const,
            candidateTableMembershipVerified:true as const,
            routeStatus:'static_candidate_only' as const,
            gameplayAcquisitionContextVerified:false as const,
            actualDropVerified:false as const,
            currentAvailabilityVerified:false as const,
            playerOwnershipVerified:false as const
          });
          candidateRows.push(row);
          add(byItem,itemId,row);
          add(byObject,reference.sourceObjectItemId,row);
          add(byTableCandidates,table.tableId,row);
          pairIds.add(reference.sourceObjectItemId+':'+itemId);
          if(candidate.conditionalEntry)conditional++;
          if(candidate.groupHasDynamicFilters)dynamic++;
          if(candidate.groupHasEligibilityGate)eligible++;
          entryCount++;
        }
      }
      if(!entryCount)empty++;
    }
  }
  check(activity===203&&furniture===172&&
    byObjectRefs.size===375&&tableIds.size===295&&
    candidateRows.length===698&&byItem.size===356&&
    pairIds.size===642&&empty===9&&
    conditional===0&&dynamic===0&&eligible===5,
    'ORIGINAL_DEFINITION_LINK_CENSUS');
  // Every original reference must be represented exactly once in the public join.
  for(const refTable of tableIds){
    check(refs.getLootTableReferrers(refTable).length===
      byTableRefs.get(refTable)?.length,'REFERENCE_MISMATCH');
  }
  freezeMap(byObjectRefs);freezeMap(byObject);freezeMap(byItem);
  freezeMap(byTableRefs);freezeMap(byTableCandidates);
  const objectIds=sortedIds(byObjectRefs.keys());
  const itemIds=sortedIds(byItem.keys());
  const referencedTableIds=sortedIds(tableIds);
  const coverage:PublicNativeObjectLootCoverage=Object.freeze({
    originalGameVersion:'1.26.2' as const,
    originalLootTables:960 as const,
    originalLootItemReferences:3804 as const,
    originalActivityItemObjectReferences:203 as const,
    originalFurnitureObjectReferences:172 as const,
    directObjectTableReferences:375 as const,
    distinctSourceObjectItemIds:375 as const,
    distinctReferencedLootTableIds:295 as const,
    expandedStaticCandidateRelations:698 as const,
    distinctCandidateItemIds:356 as const,
    distinctObjectItemPairs:642 as const,
    objectReferencesWithoutExplicitItemCandidates:9 as const,
    conditionalCandidateRelations:0 as const,
    dynamicFilteredCandidateRelations:0 as const,
    eligibilityGatedCandidateRelations:5 as const,
    sourceObjectTableIdsVerified:true as const,
    sourceLootTableMembershipVerified:true as const,
    actualDropVerified:false as const,
    playerUnlockVerified:false as const,
    sourceFamiliesComplete:false as const
  });
  return Object.freeze({
    schema:DB02_PUBLIC_NATIVE_OBJECT_LOOT_SCHEMA,
    gameVersion:'1.26.2' as const,loot,coverage,
    candidateRelations:Object.freeze(candidateRows),
    getObjectTableReferences(rawId:string|number){
      return byObjectRefs.get(canonicalId(rawId))??NO_REFERENCES;
    },
    getObjectCandidateItems(rawId:string|number){
      return byObject.get(canonicalId(rawId))??NO_CANDIDATES;
    },
    getItemObjectCandidates(rawId:string|number){
      return byItem.get(canonicalId(rawId))??NO_CANDIDATES;
    },
    getTableObjectReferences(rawId:string|number){
      return byTableRefs.get(canonicalId(rawId))??NO_REFERENCES;
    },
    getTableObjectCandidates(rawId:string|number){
      return byTableCandidates.get(canonicalId(rawId))??NO_CANDIDATES;
    },
    listSourceObjectItemIds(){return objectIds;},
    listCandidateItemIds(){return itemIds;},
    listReferencedLootTableIds(){return referencedTableIds;}
  });
}
