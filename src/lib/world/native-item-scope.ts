/**
 * DB-04 shared, source-attested Item ID -> original World/Universe Tag evidence.
 * Reuses the existing tools/collection/extract_scope_evidence.py PRIVATE output.
 *
 * An original Tag reference proves only that this Item record has that Tag.
 * It does NOT establish game UI grouping, acquisition location, native
 * WorldIdentity, DLC entitlement, current availability, or player ownership.
 * Set-name matches are kept as candidates, not promoted to direct tags.
 *
 * This module never fetches files or uploads game/source/Save data. The caller
 * supplies locally held bytes and independently trusted SHA-256 pins.
 */
export const DB04_NATIVE_ITEM_SCOPE_SCHEMA =
  'wand.collection.scope-evidence.private@1' as const;
export const DB04_NATIVE_SCOPE_CLIENT = 'wand.db04.native-item-scope@1' as const;
export const DB04_WORLD_TAGS = Object.freeze([
  'IsDreamlightValley','IsEternityIsle','IsStorybookVale',
  'IsWishBlossomMountains','isSeaOfSecrets','isHoneywood'
] as const);
export type Db04WorldTag = typeof DB04_WORLD_TAGS[number];
export type Db04NativeCategory = 'Furniture'|'Clothing'|'Trimming'|'ActivityItem';
export type Db04ScopeEvidenceKind = 'world_tag_direct'|'universe_tag_direct'|'universe_set_candidate';

export interface Db04NativeItemScopeRow {
  readonly itemId:number;
  readonly nativeCategory:Db04NativeCategory;
  readonly worldsDirect:readonly Db04WorldTag[];
  readonly universeTagsDirect:readonly string[];
  readonly universeSetCandidates:readonly string[];
  readonly setDefinitionIds:readonly number[];
}
export interface Db04NativeScopePage {
  readonly evidenceKind:Db04ScopeEvidenceKind;
  readonly tag:string;
  readonly status:'source_native_tag_present'|'source_name_candidate_present'|'unverified';
  readonly itemIds:readonly number[];
  readonly matchingItemIdsInSourceSubset:number;
  readonly offset:number;
  readonly limit:number;
  readonly hasNextPage:boolean;
  readonly nextOffset:number|null;
  readonly sourceCoverageComplete:false;
  readonly gameUiMembershipVerified:false;
  readonly acquisitionWorldVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db04NativeItemScopeClient {
  readonly contract:typeof DB04_NATIVE_SCOPE_CLIENT;
  readonly source:Readonly<{
    platform:'Steam';
    gameVersion:'1.26.2';
    auditSha256:string;
    rowsSha256:string;
    sourceSha256ByCategory:Readonly<Record<Db04NativeCategory,string>>;
    originalItemDefinitions:13202;
    privateOnly:true;
    publicationAuthorized:false;
  }>;
  getItem(itemId:number):Readonly<Db04NativeItemScopeRow>|null;
  byWorldTag(tag:Db04WorldTag,page?:Readonly<{offset:number;limit:number}>):Db04NativeScopePage;
  byUniverseTag(tag:string,evidence:'direct'|'set_candidate',
    page?:Readonly<{offset:number;limit:number}>):Db04NativeScopePage;
}
interface NormalizedScopeAudit {
  readonly rowsSha256:string;
  readonly sourceSha256:Readonly<Record<string,string>>;
  readonly counts:Readonly<Record<'items'|'world_direct'|'universe_direct'|
    'universe_set_candidate'|'universe_any_evidence',number>>;
  readonly byWorldTag:Readonly<Record<string,number>>;
}
const SHA=/^[0-9a-f]{64}$/;
const NATIVE_NAME=/^[A-Za-z0-9_]{1,128}$/;
const CATEGORY_COUNTS=Object.freeze({
  Furniture:6746,Clothing:2041,Trimming:365,ActivityItem:4050
} as const);
const CATEGORIES=Object.freeze(Object.keys(CATEGORY_COUNTS) as Db04NativeCategory[]);
const ORIGINAL_FILES=Object.freeze([...CATEGORIES.map(c=>c+'.json'),'Tag.json','Set.json']);
const WORLD_SET=new Set<string>(DB04_WORLD_TAGS);
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const goodId=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonnegative=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const goodHash=(v:unknown):v is string=>typeof v==='string'&&SHA.test(v);
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB04_NATIVE_ITEM_SCOPE_'+code);
}
function sortedUnique<T extends string|number>(v:unknown,p:(v:unknown)=>v is T):v is T[]{
  if(!Array.isArray(v)||v.length>32)return false;
  let previous:T|undefined;
  for(const value of v){
    if(!p(value)||(previous!==undefined&&previous>=value))return false;
    previous=value;
  }
  return true;
}
/**
 * The archived 2026-11-22 source ZIP uses originalSourceSha256/camelCase
 * ledgers. The current offline extraction command emits sourceSha256 and
 * snake_case. Both are the same explicit six SHA-pinned original files and
 * exactly the same row schema; no other unrecognized audit variant is allowed.
 */
function normalizeAudit(v:unknown):NormalizedScopeAudit{
  check(obj(v)&&v.schema===DB04_NATIVE_ITEM_SCOPE_SCHEMA&&
    v.sourcePlatform==='Steam'&&v.gameVersion==='1.26.2'&&
    v.privateOnly===true&&v.publicationAuthorized===false&&
    goodHash(v.rowsSha256)&&obj(v.counts)&&obj(v.byWorldTag),
    'PRIVATE_CURRENT_SOURCE_REQUIRED');
  const archived=obj(v.originalSourceSha256);
  const current=obj(v.sourceSha256);
  check(archived!==current,'AMBIGUOUS_AUDIT_VARIANT');
  const original=archived?v.originalSourceSha256:v.sourceSha256;
  check(obj(original)&&Object.keys(original).length===ORIGINAL_FILES.length&&
    ORIGINAL_FILES.every(p=>goodHash(original[p])),
    'SOURCE_ORIGINAL_SHA_SET');
  const sourceSha256=Object.freeze({...original}) as Record<string,string>;
  const rawCounts=v.counts;
  const keys=archived?
    ['items','worldDirect','universeDirect','universeSetCandidate','universeAnyEvidence']:
    ['items','world_direct','universe_direct','universe_set_candidate','universe_any_evidence'];
  check(obj(rawCounts)&&Object.keys(rawCounts).length===keys.length&&
    keys.every(k=>nonnegative(rawCounts[k]))&&rawCounts.items===13202,
    'AUDIT_COUNTS');
  const counts=Object.freeze({
    items:rawCounts.items as number,
    world_direct:rawCounts[keys[1]] as number,
    universe_direct:rawCounts[keys[2]] as number,
    universe_set_candidate:rawCounts[keys[3]] as number,
    universe_any_evidence:rawCounts[keys[4]] as number
  });
  const rawWorldCounts=v.byWorldTag;
  check(obj(rawWorldCounts)&&Object.entries(rawWorldCounts).every(([k,count])=>
    WORLD_SET.has(k)&&nonnegative(count)&&count>0),'AUDIT_WORLD_TAGS');
  if(v.worlds!==undefined)check(Array.isArray(v.worlds)&&
    JSON.stringify(v.worlds)===JSON.stringify(DB04_WORLD_TAGS),
    'ARCHIVED_WORLD_TAG_DEFINITIONS');
  if(v.importStatus!==undefined)check(
    v.importStatus==='private_candidate_only_not_merged_into_public_catalog',
    'ARCHIVED_PRIVATE_STATUS');
  if(v.byNativeCategory!==undefined){
    check(obj(v.byNativeCategory)&&
      Object.keys(v.byNativeCategory).length===CATEGORIES.length,
      'ARCHIVED_CATEGORY_LEDGER');
    for(const category of CATEGORIES){
      const stats=v.byNativeCategory[category];
      check(obj(stats)&&stats.items===CATEGORY_COUNTS[category],
        'ARCHIVED_CATEGORY_COUNT');
    }
  }
  return Object.freeze({
    rowsSha256:v.rowsSha256 as string,
    sourceSha256,
    counts,
    byWorldTag:Object.freeze({...rawWorldCounts}) as Record<string,number>
  });
}
function checkRow(v:unknown):asserts v is Db04NativeItemScopeRow{
  check(obj(v)&&Object.keys(v).length===6&&goodId(v.itemId)&&
    CATEGORIES.includes(v.nativeCategory as Db04NativeCategory)&&
    sortedUnique(v.worldsDirect,(k):k is Db04WorldTag=>
      typeof k==='string'&&WORLD_SET.has(k))&&
    v.worldsDirect.length<=1&&
    sortedUnique(v.universeTagsDirect,(k):k is string=>
      typeof k==='string'&&NATIVE_NAME.test(k))&&
    sortedUnique(v.universeSetCandidates,(k):k is string=>
      typeof k==='string'&&NATIVE_NAME.test(k))&&
    sortedUnique(v.setDefinitionIds,goodId),
    'ROW_SOURCE_SHAPE');
  const candidates=v.universeSetCandidates;
  const direct=v.universeTagsDirect;
  check((candidates.length===0)===(v.setDefinitionIds.length===0)&&
    (direct.length===0||candidates.length===0||
     direct.every(k=>candidates.includes(k))),
    'ROW_SET_CANDIDATE_CONFLICT');
}
function stableBytes(input:Uint8Array,max:number,label:string):Uint8Array{
  check(input instanceof Uint8Array&&input.byteLength>0&&input.byteLength<=max,
    label+'_SIZE');
  return new Uint8Array(input);
}
async function digest(bytes:Uint8Array):Promise<string>{
  check(globalThis.crypto?.subtle,'CRYPTO_UNAVAILABLE');
  const owned=new Uint8Array(bytes);
  const raw=await crypto.subtle.digest('SHA-256',owned);
  return Array.from(new Uint8Array(raw),v=>v.toString(16).padStart(2,'0')).join('');
}
function pageOf(kind:Db04ScopeEvidenceKind,tag:string,ids:readonly number[],
  config:Readonly<{offset:number;limit:number}>={offset:0,limit:128}
):Db04NativeScopePage{
  check(obj(config)&&nonnegative(config.offset)&&nonnegative(config.limit)&&
    config.limit>=1&&config.limit<=512,'INVALID_PAGE');
  const {offset,limit}=config;
  const end=Math.min(ids.length,offset+limit);
  const itemIds=Object.freeze(ids.slice(offset,end));
  const hasNextPage=end<ids.length;
  return Object.freeze({
    evidenceKind:kind,tag,
    status:ids.length===0?'unverified' as const:
      kind==='universe_set_candidate'?'source_name_candidate_present' as const:
        'source_native_tag_present' as const,
    itemIds,matchingItemIdsInSourceSubset:ids.length,
    offset,limit,hasNextPage,nextOffset:hasNextPage?end:null,
    sourceCoverageComplete:false as const,
    gameUiMembershipVerified:false as const,
    acquisitionWorldVerified:false as const,
    dlcEntitlementVerified:false as const
  });
}

/**
 * Consume owner-private audit and JSONL already produced by the collection
 * source extractor. Both independent expected digests are mandatory.
 * No copy of the original itemlist or private derived rows is published.
 */
export async function createDb04NativeItemScopeClient(args:{
  auditBytes:Uint8Array;
  rowsBytes:Uint8Array;
  expectedAuditSha256:string;
  expectedRowsSha256:string;
}):Promise<Db04NativeItemScopeClient>{
  check(obj(args)&&goodHash(args.expectedAuditSha256)&&
    goodHash(args.expectedRowsSha256),'TRUSTED_SHA_REQUIRED');
  const auditRaw=stableBytes(args.auditBytes,131072,'AUDIT');
  const rowsRaw=stableBytes(args.rowsBytes,16*1024*1024,'ROWS');
  const [auditDigest,rowsDigest]=await Promise.all([digest(auditRaw),digest(rowsRaw)]);
  check(auditDigest===args.expectedAuditSha256&&
    rowsDigest===args.expectedRowsSha256,'TRUSTED_SHA_MISMATCH');
  const auditUnknown:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(auditRaw));
  const audit=normalizeAudit(auditUnknown);
  check(audit.rowsSha256===rowsDigest,'AUDIT_ROWS_HASH_MISMATCH');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(rowsRaw);
  check(text.endsWith('\n'),'INCOMPLETE_JSONL');
  const lines=text.slice(0,-1).split('\n');
  check(lines.length===13202,'SOURCE_ITEM_COUNT');
  const byId=new Map<number,Readonly<Db04NativeItemScopeRow>>();
  const worlds=new Map<string,number[]>();
  const directUniverses=new Map<string,number[]>();
  const setUniverses=new Map<string,number[]>();
  const counts={items:0,world_direct:0,universe_direct:0,
    universe_set_candidate:0,universe_any_evidence:0};
  const categoryCounts=new Map<Db04NativeCategory,number>();
  let prev=0;
  for(const line of lines){
    const unknown:unknown=JSON.parse(line);
    checkRow(unknown);
    const record=unknown;
    check(record.itemId>prev,'DUPLICATE_OR_UNSORTED_ITEM_ID');
    prev=record.itemId;
    const row=Object.freeze({
      ...record,
      worldsDirect:Object.freeze([...record.worldsDirect]),
      universeTagsDirect:Object.freeze([...record.universeTagsDirect]),
      universeSetCandidates:Object.freeze([...record.universeSetCandidates]),
      setDefinitionIds:Object.freeze([...record.setDefinitionIds])
    });
    byId.set(row.itemId,row);
    categoryCounts.set(row.nativeCategory,(categoryCounts.get(row.nativeCategory)??0)+1);
    counts.items++;
    counts.world_direct+=Number(row.worldsDirect.length>0);
    counts.universe_direct+=Number(row.universeTagsDirect.length>0);
    counts.universe_set_candidate+=Number(row.universeSetCandidates.length>0);
    counts.universe_any_evidence+=Number(
      row.universeTagsDirect.length>0||row.universeSetCandidates.length>0);
    for(const tag of row.worldsDirect){
      const list=worlds.get(tag)??[];list.push(row.itemId);worlds.set(tag,list);
    }
    for(const tag of row.universeTagsDirect){
      const list=directUniverses.get(tag)??[];
      list.push(row.itemId);directUniverses.set(tag,list);
    }
    for(const tag of row.universeSetCandidates){
      const list=setUniverses.get(tag)??[];
      list.push(row.itemId);setUniverses.set(tag,list);
    }
  }
  check(CATEGORIES.every(c=>categoryCounts.get(c)===CATEGORY_COUNTS[c]),
    'NATIVE_CATEGORY_COUNT_MISMATCH');
  check((Object.keys(counts) as (keyof typeof counts)[])
    .every(c=>counts[c]===audit.counts[c]),'AUDIT_COUNT_MISMATCH');
  const worldCounts=Object.fromEntries([...worlds].map(([k,v])=>[k,v.length]));
  check(Object.keys(audit.byWorldTag).length===Object.keys(worldCounts).length&&
    Object.entries(worldCounts).every(([k,v])=>audit.byWorldTag[k]===v),
    'AUDIT_WORLD_COUNT_MISMATCH');
  const source=Object.freeze({
    platform:'Steam' as const,gameVersion:'1.26.2' as const,
    auditSha256:auditDigest,rowsSha256:rowsDigest,
    sourceSha256ByCategory:Object.freeze(Object.fromEntries(CATEGORIES.map(c=>
      [c,audit.sourceSha256[c+'.json']])) as Record<Db04NativeCategory,string>),
    originalItemDefinitions:13202 as const,
    privateOnly:true as const,publicationAuthorized:false as const
  });
  const freezeIndexes=(map:Map<string,number[]>)=>
    new Map([...map].map(([k,v])=>[k,Object.freeze(v)]));
  const byWorld=freezeIndexes(worlds),byDirect=freezeIndexes(directUniverses),
    bySet=freezeIndexes(setUniverses);
  return Object.freeze({
    contract:DB04_NATIVE_SCOPE_CLIENT,
    source,
    getItem(itemId:number):Readonly<Db04NativeItemScopeRow>|null{
      check(goodId(itemId),'INVALID_ITEM_ID');
      return byId.get(itemId)??null;
    },
    byWorldTag(tag:Db04WorldTag,config?:Readonly<{offset:number;limit:number}>):
      Db04NativeScopePage{
      check(typeof tag==='string'&&WORLD_SET.has(tag),'UNKNOWN_WORLD_TAG');
      return pageOf('world_tag_direct',tag,byWorld.get(tag)??[],config);
    },
    byUniverseTag(tag:string,evidence:'direct'|'set_candidate',
      config?:Readonly<{offset:number;limit:number}>):Db04NativeScopePage{
      check(typeof tag==='string'&&NATIVE_NAME.test(tag)&&
        (evidence==='direct'||evidence==='set_candidate'),
        'INVALID_UNIVERSE_QUERY');
      return pageOf(evidence==='direct'?'universe_tag_direct':
        'universe_set_candidate',tag,
      (evidence==='direct'?byDirect:bySet).get(tag)??[],config);
    }
  });
}
