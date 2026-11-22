/**
 * DB-02 raw native LootTable source-name index.
 *
 * The SRC-02 r5 original LootTable.nameKey uses native families such as
 * "Chest!", "Mission!", "Critters!", "PoolingStall!" and "Greenhouse!".
 * This is SOURCE NOMENCLATURE, NOT PROOF of where a player can acquire items:
 * LootTable paths have contextVerified:false in the original extraction.
 *
 * Reuses the normal per-Item ID acquisition ledger; never reparses an original
 * game file, makes a request, publishes private rows, or changes live stock.
 */
import type {OriginDatabase,OriginProvenance,ItemOrigin} from './origins.ts';

export const DB02_NATIVE_LOOT_SOURCE_SCHEMA='wand.db02.native-loot-source-families@1' as const;
const ID=/^[1-9][0-9]{0,15}$/;
const FAMILY=/^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const SAFE_NAME=/^[A-Za-z0-9_ .:!\/-]{1,180}$/;
const EMPTY=Object.freeze([]) as readonly NativeLootSourceCandidate[];

export interface NativeLootSourceCandidate {
  readonly originId:string;
  readonly itemId:string;
  readonly lootTableId:string;
  readonly groupIndex:number;
  /** Exact game-native LootTable.nameKey, not a translated UI label. */
  readonly nativeNameKey:string;
  /** Exact native prefix before the first '!', not a gameplay category. */
  readonly sourceFamily:string;
  readonly source:OriginProvenance;
  readonly routeStatus:'static_candidate_only';
  readonly acquisitionContextVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface NativeLootFamilySummary {
  readonly sourceFamily:string;
  readonly candidateRoutes:number;
  readonly itemIds:number;
  readonly lootTableIds:number;
  readonly acquisitionContextVerified:false;
}
export interface NativeLootFamilyCoverage {
  readonly indexedItemIds:number;
  readonly distinctCandidateItemIds:number;
  readonly candidateRoutes:number;
  readonly sourceFamilies:number;
  readonly nativeLootTableIds:number;
  readonly inputCatalogScope:'caller_supplied_item_ids';
  readonly acquisitionContextVerified:false;
  readonly liveStockVerified:false;
  readonly completeAllGameItemScopes:false;
}
export interface NativeLootSourceIndex {
  readonly schema:typeof DB02_NATIVE_LOOT_SOURCE_SCHEMA;
  readonly coverage:NativeLootFamilyCoverage;
  listFamilies():readonly NativeLootFamilySummary[];
  getFamilyCandidates(sourceFamily:string):readonly NativeLootSourceCandidate[];
  getLootTableCandidates(lootTableId:number|string):readonly NativeLootSourceCandidate[];
  getItemCandidates(itemId:number|string):readonly NativeLootSourceCandidate[];
  getNativeNameCandidates(nameKey:string):readonly NativeLootSourceCandidate[];
}

function canonicalId(raw:unknown):string{
  const value=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  if(typeof value!=='string'||!ID.test(value)||!Number.isSafeInteger(Number(value)))
    throw new TypeError('DB02_NATIVE_LOOT_INVALID_ID');
  return value;
}
function sourceName(raw:string):{name:string;family:string}{
  if(typeof raw!=='string'||!SAFE_NAME.test(raw))
    throw new TypeError('DB02_NATIVE_LOOT_INVALID_SOURCE_NAME');
  const family=raw.split('!',1)[0];
  if(!FAMILY.test(family))
    throw new TypeError('DB02_NATIVE_LOOT_INVALID_SOURCE_FAMILY');
  return {name:raw,family};
}
function push<K>(into:Map<K,NativeLootSourceCandidate[]>,key:K,
  candidate:NativeLootSourceCandidate):void {
  const list=into.get(key);
  if(list)list.push(candidate);
  else into.set(key,[candidate]);
}
function freezeGroups<K>(groups:Map<K,NativeLootSourceCandidate[]>):void {
  for(const rows of groups.values())Object.freeze(rows);
}
function isLootRoute(route:ItemOrigin):boolean {
  return route.kind==='loot'&&
    route.nativeDetails?.family==='loot_table_candidate';
}
/**
 * Accepts an already version-validated OriginDatabase and its Item ID scope.
 * All 3,804 original SRC-02 LootTable entries are static candidate-only.
 * The index does not invent a loot location or classify Mission rewards as
 * guaranteed. Its names and families are those in the original native keys.
 */
export function indexNativeLootSourceFamilies(
  origins:OriginDatabase,
  itemIds:readonly (string|number)[]
):NativeLootSourceIndex {
  if(origins?.schema!=='wand.db02.item-origins@1' ||
     !Array.isArray(itemIds)||itemIds.length>20000)
    throw new TypeError('DB02_NATIVE_LOOT_ORIGIN_DATABASE_REQUIRED');
  const ids=[...new Set(itemIds.map(canonicalId))];
  const byFamily=new Map<string,NativeLootSourceCandidate[]>();
  const byTable=new Map<string,NativeLootSourceCandidate[]>();
  const byItem=new Map<string,NativeLootSourceCandidate[]>();
  const byName=new Map<string,NativeLootSourceCandidate[]>();
  const tableName=new Map<string,string>();
  const distinctRoutes=new Set<string>();
  let candidateRoutes=0;
  for(const itemId of ids) {
    const found=origins.getItem(itemId);
    if(found.itemId!==itemId||!Array.isArray(found.origins))
      throw new TypeError('DB02_NATIVE_LOOT_ITEM_SCOPE_MISMATCH');
    for(const route of found.origins) {
      if(!isLootRoute(route))continue;
      const details=route.nativeDetails!;
      const tableId=canonicalId(details.lootTableId);
      const groupIndex=details.lootGroupIndex;
      if(route.itemId!==itemId || route.routeStatus!=='static_candidate_only' ||
        details.lootContextVerified!==false ||
        !Number.isSafeInteger(groupIndex)||groupIndex===null||groupIndex<0 ||
        details.definitionId!==tableId ||
        details.sourceFile!=='itemlist/LootTable.json' ||
        details.pathId!==route.originId.replace(/^native:path:/,'') ||
        !details.pathId.startsWith('loot:'+tableId+':'+groupIndex+':')) {
        throw new TypeError('DB02_NATIVE_LOOT_UNVERIFIED_OR_INVALID_PATH');
      }
      const native=sourceName(route.name);
      const previous=tableName.get(tableId);
      if(previous!==undefined && previous!==native.name)
        throw new TypeError('DB02_NATIVE_LOOT_TABLE_NAME_CONFLICT');
      tableName.set(tableId,native.name);
      const routeId=route.originId+'\0'+itemId;
      if(distinctRoutes.has(routeId))
        throw new TypeError('DB02_NATIVE_LOOT_DUPLICATE_ROUTE');
      distinctRoutes.add(routeId);
      const candidate:NativeLootSourceCandidate=Object.freeze({
        originId:route.originId,itemId,
        lootTableId:tableId,groupIndex,
        nativeNameKey:native.name,sourceFamily:native.family,
        source:route.source,routeStatus:'static_candidate_only' as const,
        acquisitionContextVerified:false as const,
        currentAvailabilityVerified:false as const
      });
      candidateRoutes++;
      push(byFamily,native.family,candidate);
      push(byTable,tableId,candidate);
      push(byItem,itemId,candidate);
      push(byName,native.name,candidate);
    }
  }
  freezeGroups(byFamily);
  freezeGroups(byTable);
  freezeGroups(byItem);
  freezeGroups(byName);
  const summaries=Object.freeze([...byFamily].map(([family,rows])=>Object.freeze({
    sourceFamily:family,candidateRoutes:rows.length,
    itemIds:new Set(rows.map(x=>x.itemId)).size,
    lootTableIds:new Set(rows.map(x=>x.lootTableId)).size,
    acquisitionContextVerified:false as const
  })).sort((a,b)=>b.candidateRoutes-a.candidateRoutes||
    a.sourceFamily.localeCompare(b.sourceFamily,'en')));
  const coverage=Object.freeze({
    indexedItemIds:ids.length,
    distinctCandidateItemIds:byItem.size,
    candidateRoutes,sourceFamilies:byFamily.size,nativeLootTableIds:byTable.size,
    inputCatalogScope:'caller_supplied_item_ids' as const,
    acquisitionContextVerified:false as const,
    liveStockVerified:false as const,
    completeAllGameItemScopes:false as const
  });
  return Object.freeze({
    schema:DB02_NATIVE_LOOT_SOURCE_SCHEMA,
    coverage,
    listFamilies(){return summaries;},
    getFamilyCandidates(family:string) {
      if(typeof family!=='string'||!FAMILY.test(family))
        throw new TypeError('DB02_NATIVE_LOOT_FAMILY_QUERY');
      return byFamily.get(family)??EMPTY;
    },
    getLootTableCandidates(raw:string|number) {
      return byTable.get(canonicalId(raw))??EMPTY;
    },
    getItemCandidates(raw:string|number) {
      return byItem.get(canonicalId(raw))??EMPTY;
    },
    getNativeNameCandidates(nameKey:string){
      const key=sourceName(nameKey).name;
      return byName.get(key)??EMPTY;
    }
  });
}
