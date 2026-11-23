/**
 * Steam v1.26.2 native LootTable *static candidates* for DB-02.
 *
 * A source-linked LootTable entry is not a verified acquisition route:
 * no game event/spawn/quest/shop context is attached to these tables.
 * Dynamic filters and condition gates are retained as flags, NOT evaluated.
 * Never infer a drop chance, live eligibility, player grant or availability.
 */
import type {ItemOrigin,OriginProvenance} from './origins.ts';
export const DB02_NATIVE_LOOT_SCHEMA='wand.db02.public-native-loot-candidates@1' as const;
export const DB02_NATIVE_LOOT_FILE='native-loot-candidates-1.26.2.json' as const;
export const DB02_NATIVE_LOOT_BYTES=77385 as const;
export const DB02_NATIVE_LOOT_SHA256=
  'fba1d8163c30156941b108ce2ba37544f32e9c7d419f4c2b1f126b017c470a00' as const;
const ORIGINAL_SHA='580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c';
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const ID=/^[1-9][0-9]{0,15}$/;
const PINNED=new WeakSet<object>();
const EMPTY_CANDIDATES=Object.freeze([]) as readonly NativeLootCandidate[];
const EMPTY_ORIGINS=Object.freeze([]) as readonly ItemOrigin[];
const EMPTY_IDS=Object.freeze([]) as readonly string[];
const WINDOW=Object.freeze({start:null,endExclusive:null});
const SALE_PERIODS=Object.freeze([]);
const CONDITIONS=Object.freeze([
  'Original static LootTable candidate only; actual context, eligibility and drop are not verified'
]);
const SOURCE:OriginProvenance=Object.freeze({
  sourceId:'src02:steam1262:loot-table',
  kind:'verified_game_native',sourceUrl:'/acquisition/public/'+DB02_NATIVE_LOOT_FILE,
  checkedOn:'2026-11-23',gameVersion:'1.26.2',sha256:ORIGINAL_SHA
});
export interface NativeLootCandidate{
  readonly pathId:string;
  readonly itemId:string;
  readonly tableId:string;
  readonly groupIndex:number;
  readonly candidateOrdinal:number;
  readonly conditionalEntry:boolean;
  readonly groupHasDynamicFilters:boolean;
  readonly groupHasEligibilityGate:boolean;
  readonly originSourceSha256:typeof ORIGINAL_SHA;
  readonly routeStatus:'static_candidate_only';
  readonly gameplayContextVerified:false;
  readonly itemGrantVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface NativeLootGroup {
  readonly groupIndex:number;
  readonly hasDynamicFilters:boolean;
  readonly hasEligibilityGate:boolean;
  readonly candidates:readonly NativeLootCandidate[];
  readonly guaranteedLoot:false;
}
export interface NativeLootTable {
  readonly tableId:string;
  readonly groups:readonly NativeLootGroup[];
  /** Distinct explicit candidate Item IDs, NOT source-guaranteed drops. */
  readonly candidateItemIds:readonly string[];
  readonly gameplayContextVerified:false;
}
export interface NativeLootCandidateIndex{
  readonly schema:typeof DB02_NATIVE_LOOT_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly source:OriginProvenance;
  readonly coverage:Readonly<{
    nativeTables:960;
    nativeGroups:2087;
    groupsWithoutExplicitItems:198;
    candidateRelations:3804;
    distinctCandidateItemIds:1100;
    unconditionalEntryReferences:3744;
    conditionalEntryReferences:60;
    dynamicFilterGroups:163;
    eligibilityGateGroups:11;
    actualAcquisitionContextsVerified:0;
    guaranteedDropsVerified:0;
    liveAvailabilityVerified:false;
    playerOwnershipVerified:false;
    sourceCoverageComplete:false;
  }>;
  readonly tables:readonly NativeLootTable[];
  readonly candidates:readonly NativeLootCandidate[];
  /** Not included in the default published DB-02 1255 confirmed-origin set. */
  readonly staticCandidateOrigins:readonly ItemOrigin[];
  getTable(tableId:number|string):NativeLootTable|null;
  getGroup(tableId:number|string,groupIndex:number):NativeLootGroup|null;
  getItemCandidates(itemId:number|string):readonly NativeLootCandidate[];
  getItemStaticOrigins(itemId:number|string):readonly ItemOrigin[];
  listTableIds():readonly string[];
  listCandidateItemIds():readonly string[];
}
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB02_NATIVE_LOOT_'+reason);
}
function object(raw:unknown):raw is Record<string,unknown>{
  return raw!==null&&typeof raw==='object'&&!Array.isArray(raw);
}
function numberId(raw:unknown):number{
  const number=typeof raw==='number'&&Number.isSafeInteger(raw)?raw:
    typeof raw==='string'&&ID.test(raw)?Number(raw):NaN;
  check(Number.isSafeInteger(number)&&number>0&&String(number)===String(raw),
    'INVALID_ITEM_ID');
  return number;
}
function itemId(raw:unknown):string{return String(numberId(raw));}
function add<T>(map:Map<string,T[]>,key:string,row:T):void{
  const previous=map.get(key);
  if(previous)previous.push(row);else map.set(key,[row]);
}
function sortedIds(raw:Iterable<string>):readonly string[]{
  return Object.freeze([...new Set(raw)].sort((a,b)=>Number(a)-Number(b)));
}
function freezeValues<T>(map:Map<string,T[]>):void {
  for(const rows of map.values())Object.freeze(rows);
}
function parse(raw:unknown):NativeLootCandidateIndex{
  check(object(raw)&&raw.schema===DB02_NATIVE_LOOT_SCHEMA&&
    object(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&object(raw.source)&&
    raw.source.file==='ddv_Data/StreamingAssets/itemlist/LootTable.json'&&
    raw.source.sha256===ORIGINAL_SHA&&raw.source.bytes===110133&&
    object(raw.coverage)&&Array.isArray(raw.tables)&&
    raw.tables.length===960,'SOURCE_SCHEMA');
  const c=raw.coverage;
  check(c.nativeTables===960&&c.nativeGroups===2087&&
    c.groupsWithoutExplicitItems===198&&c.candidateRelations===3804&&
    c.distinctCandidateItemIds===1100&&
    c.unconditionalEntryReferences===3744&&
    c.conditionalEntryReferences===60&&
    c.dynamicFilterGroups===163&&c.eligibilityGateGroups===11&&
    c.actualAcquisitionContextsVerified===0&&
    c.guaranteedDropsVerified===0&&c.liveAvailabilityVerified===false&&
    c.playerOwnershipVerified===false&&c.sourceCoverageComplete===false,
    'SOURCE_CENSUS');
  const byTable=new Map<string,NativeLootTable>();
  const byItem=new Map<string,NativeLootCandidate[]>();
  const originsByItem=new Map<string,ItemOrigin[]>();
  const allCandidates:NativeLootCandidate[]=[];
  const allOrigins:ItemOrigin[]=[];
  const candidateIds=new Set<string>();
  let tableCount=0,groupCount=0,empty=0,direct=0,conditional=0,
    dynamic=0,eligibility=0,lastTable=0;
  for(const row of raw.tables){
    check(Array.isArray(row)&&row.length===2&&
      typeof row[0]==='number'&&Number.isSafeInteger(row[0])&&
      row[0]>lastTable&&row[0]>=2090000000&&row[0]<2090100000&&
      Array.isArray(row[1])&&row[1].length<=128,
      'NATIVE_TABLE_TUPLE');
    lastTable=row[0];
    const tableId=itemId(row[0]),groups:NativeLootGroup[]=[];
    const tableItems=new Set<string>();
    for(let groupIndex=0;groupIndex<row[1].length;groupIndex++){
      const g=row[1][groupIndex];
      check(Array.isArray(g)&&g.length===2&&
        typeof g[0]==='number'&&Number.isInteger(g[0])&&
        g[0]>=0&&g[0]<=3&&Array.isArray(g[1])&&
        g[1].length<=512,'NATIVE_GROUP_TUPLE');
      const flags=g[0],hasDynamicFilters=(flags&1)!==0,
        hasEligibilityGate=(flags&2)!==0;
      if(hasDynamicFilters)dynamic++;
      if(hasEligibilityGate)eligibility++;
      if(!g[1].length)empty++;
      const groupCandidates:NativeLootCandidate[]=[];
      for(let ordinal=0;ordinal<g[1].length;ordinal++){
        const entry=g[1][ordinal];
        check(Array.isArray(entry)&&entry.length===2&&
          typeof entry[0]==='number'&&Number.isSafeInteger(entry[0])&&
          (entry[1]===0||entry[1]===1),'NATIVE_CANDIDATE_TUPLE');
        const candidateItemId=itemId(entry[0]);
        const pathId='loot:'+tableId+':'+groupIndex+':'+ordinal;
        const conditionalEntry=entry[1]===1;
        if(conditionalEntry)conditional++;else direct++;
        const candidate:NativeLootCandidate=Object.freeze({
          pathId,itemId:candidateItemId,tableId,groupIndex,
          candidateOrdinal:ordinal,conditionalEntry,
          groupHasDynamicFilters:hasDynamicFilters,
          groupHasEligibilityGate:hasEligibilityGate,
          originSourceSha256:ORIGINAL_SHA,
          routeStatus:'static_candidate_only' as const,
          gameplayContextVerified:false as const,itemGrantVerified:false as const,
          playerOwnershipVerified:false as const
        });
        groupCandidates.push(candidate);
        allCandidates.push(candidate);
        candidateIds.add(candidateItemId);
        tableItems.add(candidateItemId);
        add(byItem,candidateItemId,candidate);
        const origin:ItemOrigin=Object.freeze({
          originId:'native:path:'+pathId,itemId:candidateItemId,
          kind:'loot',routeStatus:'static_candidate_only',
          campaignId:null,name:'Native LootTable candidate',productId:null,
          quantity:null,price:null,accessTier:'not_applicable',
          window:WINDOW,salePeriods:SALE_PERIODS,conditions:CONDITIONS,
          source:SOURCE,availability:'not_live_verified'
        });
        allOrigins.push(origin);
        add(originsByItem,candidateItemId,origin);
      }
      groups.push(Object.freeze({
        groupIndex,hasDynamicFilters,hasEligibilityGate,
        candidates:Object.freeze(groupCandidates),guaranteedLoot:false as const
      }));
      groupCount++;
    }
    byTable.set(tableId,Object.freeze({
      tableId,groups:Object.freeze(groups),candidateItemIds:sortedIds(tableItems),
      gameplayContextVerified:false as const
    }));
    tableCount++;
  }
  check(tableCount===960&&groupCount===2087&&empty===198&&
    allCandidates.length===3804&&allOrigins.length===3804&&
    direct===3744&&conditional===60&&
    dynamic===163&&eligibility===11&&candidateIds.size===1100,
    'ORIGINAL_GROUP_AND_ITEM_TOTALS');
  freezeValues(byItem);
  freezeValues(originsByItem);
  const allTables=Object.freeze([...byTable.values()]);
  const tableIds=Object.freeze([...byTable.keys()]);
  const allItemIds=sortedIds(candidateIds);
  const index:NativeLootCandidateIndex=Object.freeze({
    schema:DB02_NATIVE_LOOT_SCHEMA,gameVersion:'1.26.2' as const,
    source:SOURCE,coverage:Object.freeze({
      nativeTables:960 as const,nativeGroups:2087 as const,
      groupsWithoutExplicitItems:198 as const,candidateRelations:3804 as const,
      distinctCandidateItemIds:1100 as const,
      unconditionalEntryReferences:3744 as const,
      conditionalEntryReferences:60 as const,
      dynamicFilterGroups:163 as const,eligibilityGateGroups:11 as const,
      actualAcquisitionContextsVerified:0 as const,
      guaranteedDropsVerified:0 as const,liveAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,sourceCoverageComplete:false as const
    }),
    tables:allTables,candidates:Object.freeze(allCandidates),
    staticCandidateOrigins:Object.freeze(allOrigins),
    getTable(rawId:number|string){
      return byTable.get(itemId(rawId))??null;
    },
    getGroup(rawId:number|string,groupIndex:number){
      check(Number.isInteger(groupIndex)&&groupIndex>=0&&groupIndex<=127,
        'INVALID_GROUP_INDEX');
      return byTable.get(itemId(rawId))?.groups[groupIndex]??null;
    },
    getItemCandidates(rawId:number|string){
      return byItem.get(itemId(rawId))??EMPTY_CANDIDATES;
    },
    getItemStaticOrigins(rawId:number|string){
      return originsByItem.get(itemId(rawId))??EMPTY_ORIGINS;
    },
    listTableIds(){return tableIds;},
    listCandidateItemIds(){return allItemIds;}
  });
  PINNED.add(index);
  return index;
}
export function hasPinnedNativeLootCandidateEvidence(
  value:unknown
):value is NativeLootCandidateIndex{
  return value!==null&&typeof value==='object'&&PINNED.has(value);
}
/** SHA-pinned public projection. No private source file or Save is fetched. */
export async function loadPinnedNativeLootCandidates(
  basePath='',fetcher:typeof fetch=fetch
):Promise<NativeLootCandidateIndex>{
  check(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  check(typeof fetcher==='function','FETCH_REQUIRED');
  const response=await fetcher(basePath+'/acquisition/public/'+DB02_NATIVE_LOOT_FILE);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB02_NATIVE_LOOT_BYTES,'BYTES');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(sha===DB02_NATIVE_LOOT_SHA256,'SHA');
  return parse(JSON.parse(new TextDecoder().decode(bytes)));
}
