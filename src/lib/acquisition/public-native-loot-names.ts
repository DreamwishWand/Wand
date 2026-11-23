/**
 * Original Steam 1.26.2 LootTable.nameKey, as opaque native source labels.
 *
 * A key such as "Mission!..." or "Chest!..." is ONLY a game asset name.
 * Prefixes are native source families, not independently verified acquisition
 * methods, playable locations, guaranteed rewards or localized UI text.
 * Both original name bytes and candidate Item link evidence are SHA pinned.
 */
import {
  hasPinnedNativeLootCandidateEvidence,DB02_NATIVE_LOOT_SCHEMA,
  type NativeLootCandidateIndex,type NativeLootCandidate
} from './public-native-loot.ts';

export const DB02_NATIVE_LOOT_NAME_SCHEMA=
  'wand.db02.public-native-loot-name-keys@1' as const;
export const DB02_NATIVE_LOOT_NAME_FILE=
  'native-loot-name-keys-1.26.2.json' as const;
export const DB02_NATIVE_LOOT_NAME_BYTES=51378 as const;
export const DB02_NATIVE_LOOT_NAME_SHA256=
  '77c44c7fa40fb153e9fcbcc7ec8ba6d123069d9ef7090330d05b4d235e8bfc54' as const;
const SOURCE_SHA='580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c';
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const ID=/^[1-9][0-9]{0,15}$/;
const NATIVE_NAME=/^[A-Za-z0-9_ .:!\/-]{1,180}$/;
const FAMILY=/^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const PINNED=new WeakSet<object>();
const EMPTY_NAMES=Object.freeze([]) as readonly NativeLootNameEntry[];
const EMPTY_CANDIDATES=Object.freeze([]) as readonly NamedNativeLootCandidate[];

export interface NativeLootNameEntry {
  readonly tableId:string;
  readonly nativeNameKey:string;
  readonly sourceFamily:string;
  readonly originalSourceSha256:typeof SOURCE_SHA;
  readonly originalKeyVerified:true;
  readonly localizedDisplayNameVerified:false;
  readonly gameplayAcquisitionContextVerified:false;
}
export interface NativeLootNameIndex {
  readonly schema:typeof DB02_NATIVE_LOOT_NAME_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly originalSourceSha256:typeof SOURCE_SHA;
  readonly coverage:Readonly<{
    nativeLootTables:960;
    uniqueNativeNameKeys:960;
    nativeSourceFamilies:28;
    nativeNameOnlyNotGameplayContext:true;
    localizedDisplayNamesVerified:false;
    actualAcquisitionContextVerified:false;
    guaranteedDropsVerified:false;
  }>;
  readonly tableNames:readonly NativeLootNameEntry[];
  getTableName(tableId:string|number):NativeLootNameEntry|null;
  getFamilyTables(nativeSourceFamily:string):readonly NativeLootNameEntry[];
  listNativeFamilies():readonly string[];
}
export interface NamedNativeLootCandidate {
  readonly itemId:string;
  readonly lootCandidate:NativeLootCandidate;
  readonly name:NativeLootNameEntry;
  readonly tableId:string;
  readonly nativeNameKey:string;
  readonly nativeSourceFamily:string;
  readonly routeStatus:'static_candidate_only';
  readonly originalNameVerified:true;
  readonly nativeNameOnlyNotGameplayContext:true;
  readonly localizedNameVerified:false;
  readonly actualDropVerified:false;
  readonly availabilityVerified:false;
}
export interface NativeLootNameFamilySummary {
  readonly family:string;
  readonly tables:readonly NativeLootNameEntry[];
  readonly candidateRelations:number;
  readonly distinctCandidateItemIds:number;
  readonly acquisitionContextVerified:false;
}
export interface NativeNamedLootIndex{
  readonly schema:'wand.db02.public-native-named-loot-join@1';
  readonly gameVersion:'1.26.2';
  readonly loot:NativeLootCandidateIndex;
  readonly names:NativeLootNameIndex;
  readonly candidateRelations:readonly NamedNativeLootCandidate[];
  readonly familySummaries:readonly NativeLootNameFamilySummary[];
  readonly sourceNativeNamesOnly:true;
  readonly guaranteedDropsVerified:false;
  getTableName(tableId:string|number):NativeLootNameEntry|null;
  getItemNamedCandidates(itemId:string|number):readonly NamedNativeLootCandidate[];
  getFamilyCandidates(family:string):readonly NamedNativeLootCandidate[];
  getTableNamedCandidates(tableId:string|number):readonly NamedNativeLootCandidate[];
  getFamilySummary(family:string):NativeLootNameFamilySummary|null;
  listCandidateItemIds():readonly string[];
}
function check(x:unknown,code:string):asserts x{
  if(!x)throw new TypeError('DB02_NATIVE_LOOT_NAME_'+code);
}
function object(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function id(raw:unknown):string{
  const text=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof text==='string'&&ID.test(text)&&
    Number.isSafeInteger(Number(text)),'INVALID_ITEM_ID');
  return text;
}
function family(raw:unknown):string{
  check(typeof raw==='string'&&FAMILY.test(raw),'INVALID_FAMILY');
  return raw;
}
function add<T>(map:Map<string,T[]>,key:string,value:T):void{
  const rows=map.get(key);
  if(rows)rows.push(value);
  else map.set(key,[value]);
}
function freezeMap<T>(map:Map<string,T[]>):void{
  for(const rows of map.values())Object.freeze(rows);
}
function sortedIds(vals:Iterable<string>):readonly string[]{
  return Object.freeze([...new Set(vals)].sort((a,b)=>Number(a)-Number(b)));
}
function parse(raw:unknown):NativeLootNameIndex{
  check(object(raw)&&raw.schema===DB02_NATIVE_LOOT_NAME_SCHEMA&&
    object(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&object(raw.source)&&
    raw.source.file==='ddv_Data/StreamingAssets/itemlist/LootTable.json'&&
    raw.source.sha256===SOURCE_SHA&&raw.source.bytes===110133&&
    object(raw.coverage)&&Array.isArray(raw.tableNames)&&
    raw.tableNames.length===960,'SOURCE_SCHEMA');
  const c=raw.coverage;
  check(c.nativeLootTables===960&&c.uniqueNativeNameKeys===960&&
    c.nativeSourceFamilies===28&&
    c.nativeNameOnlyNotGameplayContext===true&&
    c.localizedDisplayNamesVerified===false&&
    c.actualAcquisitionContextVerified===false&&
    c.guaranteedDropsVerified===false,'SOURCE_CENSUS');
  const tableNames:NativeLootNameEntry[]=[];
  const byTable=new Map<string,NativeLootNameEntry>();
  const byFamily=new Map<string,NativeLootNameEntry[]>();
  const uniqueNames=new Set<string>();
  let last=0;
  for(const tuple of raw.tableNames){
    check(Array.isArray(tuple)&&tuple.length===2&&
      typeof tuple[0]==='number'&&Number.isSafeInteger(tuple[0])&&
      tuple[0]>=2090000000&&tuple[0]<2090100000&&
      tuple[0]>last&&typeof tuple[1]==='string'&&
      NATIVE_NAME.test(tuple[1]),'SOURCE_TABLE_KEY');
    last=tuple[0];
    const tableId=id(tuple[0]),nativeNameKey=tuple[1];
    check(!uniqueNames.has(nativeNameKey),'DUPLICATE_NATIVE_KEY');
    uniqueNames.add(nativeNameKey);
    const sourceFamily=family(nativeNameKey.split('!',1)[0]);
    const row:NativeLootNameEntry=Object.freeze({
      tableId,nativeNameKey,sourceFamily,
      originalSourceSha256:SOURCE_SHA,
      originalKeyVerified:true as const,
      localizedDisplayNameVerified:false as const,
      gameplayAcquisitionContextVerified:false as const
    });
    tableNames.push(row);
    byTable.set(tableId,row);
    add(byFamily,sourceFamily,row);
  }
  check(byTable.size===960&&uniqueNames.size===960&&byFamily.size===28,
    'NATIVE_TABLE_CENSUS');
  freezeMap(byFamily);
  const families=Object.freeze([...byFamily.keys()].sort());
  const result:NativeLootNameIndex=Object.freeze({
    schema:DB02_NATIVE_LOOT_NAME_SCHEMA,gameVersion:'1.26.2' as const,
    originalSourceSha256:SOURCE_SHA,
    coverage:Object.freeze({
      nativeLootTables:960 as const,uniqueNativeNameKeys:960 as const,
      nativeSourceFamilies:28 as const,
      nativeNameOnlyNotGameplayContext:true as const,
      localizedDisplayNamesVerified:false as const,
      actualAcquisitionContextVerified:false as const,
      guaranteedDropsVerified:false as const
    }),
    tableNames:Object.freeze(tableNames),
    getTableName(rawId:string|number){
      return byTable.get(id(rawId))??null;
    },
    getFamilyTables(rawFamily:string){
      return byFamily.get(family(rawFamily))??EMPTY_NAMES;
    },
    listNativeFamilies(){return families;}
  });
  PINNED.add(result);
  return result;
}
export function hasPinnedNativeLootNameEvidence(value:unknown):value is NativeLootNameIndex{
  return value!==null&&typeof value==='object'&&PINNED.has(value);
}
export async function loadPinnedNativeLootNames(
  basePath='',fetcher:typeof fetch=fetch
):Promise<NativeLootNameIndex>{
  check(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  check(typeof fetcher==='function','FETCH_REQUIRED');
  const response=await fetcher(basePath+'/acquisition/public/'+DB02_NATIVE_LOOT_NAME_FILE);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB02_NATIVE_LOOT_NAME_BYTES,'BYTES');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  check(digest===DB02_NATIVE_LOOT_NAME_SHA256,'SHA');
  return parse(JSON.parse(new TextDecoder().decode(bytes)));
}
/** Only joins original source names and static candidates; does NOT add gameplay semantics. */
export function joinPinnedNativeLootNames(
  loot:NativeLootCandidateIndex,names:NativeLootNameIndex
):NativeNamedLootIndex{
  check(hasPinnedNativeLootCandidateEvidence(loot)&&
    hasPinnedNativeLootNameEvidence(names)&&
    loot.schema===DB02_NATIVE_LOOT_SCHEMA&&
    loot.gameVersion==='1.26.2'&&names.gameVersion==='1.26.2'&&
    loot.source.sha256===names.originalSourceSha256&&
    loot.coverage.nativeTables===960&&
    loot.coverage.candidateRelations===3804&&
    loot.coverage.guaranteedDropsVerified===0&&
    names.coverage.nativeLootTables===960&&
    names.coverage.nativeNameOnlyNotGameplayContext===true,
    'PINNED_NATIVE_SOURCES_REQUIRED');
  const byItem=new Map<string,NamedNativeLootCandidate[]>();
  const byTable=new Map<string,NamedNativeLootCandidate[]>();
  const byFamily=new Map<string,NamedNativeLootCandidate[]>();
  const summaries=new Map<string,NativeLootNameFamilySummary>();
  const candidates:NamedNativeLootCandidate[]=[];
  const byFamilyIds=new Map<string,Set<string>>();
  const candidateIds=new Set<string>();
  for(const table of loot.tables){
    const name=names.getTableName(table.tableId);
    check(name!==null&&name.tableId===table.tableId&&
      name.originalKeyVerified===true&&
      name.gameplayAcquisitionContextVerified===false,
      'SOURCE_NAME_TABLE_MISMATCH');
    for(const group of table.groups){
      for(const candidate of group.candidates){
        check(candidate.tableId===table.tableId&&
          candidate.routeStatus==='static_candidate_only'&&
          candidate.gameplayContextVerified===false&&
          candidate.itemGrantVerified===false,
          'SOURCE_LOOT_NOT_STATIC');
        const row:NamedNativeLootCandidate=Object.freeze({
          itemId:candidate.itemId,lootCandidate:candidate,name,
          tableId:table.tableId,nativeNameKey:name.nativeNameKey,
          nativeSourceFamily:name.sourceFamily,
          routeStatus:'static_candidate_only' as const,
          originalNameVerified:true as const,
          nativeNameOnlyNotGameplayContext:true as const,
          localizedNameVerified:false as const,
          actualDropVerified:false as const,
          availabilityVerified:false as const
        });
        candidates.push(row);
        add(byItem,row.itemId,row);
        add(byTable,row.tableId,row);
        add(byFamily,row.nativeSourceFamily,row);
        candidateIds.add(row.itemId);
        const ids=byFamilyIds.get(row.nativeSourceFamily)??new Set<string>();
        ids.add(row.itemId);
        byFamilyIds.set(row.nativeSourceFamily,ids);
      }
    }
  }
  check(candidates.length===3804&&candidateIds.size===1100&&
    names.listNativeFamilies().length===28,'NATIVE_CANDIDATE_CENSUS');
  freezeMap(byItem);freezeMap(byTable);freezeMap(byFamily);
  for(const fam of names.listNativeFamilies()){
    summaries.set(fam,Object.freeze({
      family:fam,tables:names.getFamilyTables(fam),
      candidateRelations:byFamily.get(fam)?.length??0,
      distinctCandidateItemIds:byFamilyIds.get(fam)?.size??0,
      acquisitionContextVerified:false as const
    }));
  }
  const familySummaries=Object.freeze([...summaries.values()].sort((a,b)=>
    b.candidateRelations-a.candidateRelations||a.family.localeCompare(b.family)));
  const allIds=sortedIds(candidateIds);
  return Object.freeze({
    schema:'wand.db02.public-native-named-loot-join@1' as const,
    gameVersion:'1.26.2' as const,loot,names,
    candidateRelations:Object.freeze(candidates),familySummaries,
    sourceNativeNamesOnly:true as const,guaranteedDropsVerified:false as const,
    getTableName(tableId:string|number){return names.getTableName(tableId);},
    getItemNamedCandidates(rawId:string|number){
      return byItem.get(id(rawId))??EMPTY_CANDIDATES;
    },
    getFamilyCandidates(rawFamily:string){
      return byFamily.get(family(rawFamily))??EMPTY_CANDIDATES;
    },
    getTableNamedCandidates(rawId:string|number){
      return byTable.get(id(rawId))??EMPTY_CANDIDATES;
    },
    getFamilySummary(rawFamily:string){
      return summaries.get(family(rawFamily))??null;
    },
    listCandidateItemIds(){return allIds;}
  });
}
