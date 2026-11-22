/** Source-exact Furniture/Clothing CollectionSet universe predicate candidates.
 * Source predicate matches are NOT claims about runtime Collection membership,
 * screen visibility, DLC entitlement or available worlds.
 */
import type {Db01CatalogClient,Db01LoadBytes} from './index.ts';

export const DB01_COLLECTION_UNIVERSE_SCHEMA='wand.db01.collection-set-universe-predicates@1' as const;
export const DB01_COLLECTION_UNIVERSE_RULE=
  'source_item_set_disney_universe_tag_equals_collection_filter' as const;

export interface Db01UniversePredicateMatch{
  readonly setId:number;
  readonly groupIndex:number;
  readonly nativeCategory:'Furniture'|'Clothing';
  readonly sourceSetItemId:number;
  readonly universeTagId:number;
  readonly universeTagKey:string;
  readonly selectorField:3|4;
  readonly rule:typeof DB01_COLLECTION_UNIVERSE_RULE;
  readonly sourcePredicateMatched:true;
  readonly gameUiMembershipVerified:false;
  readonly gameUiVisibilityVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcOwnershipVerified:false;
}
export interface Db01UniversePredicateSelector{
  readonly setId:number;
  readonly groupIndex:number;
  readonly submenuCode:number;
  readonly nativeCategory:'Furniture'|'Clothing';
  readonly universeTagId:number;
  readonly universeTagKey:string;
  readonly matchedCandidateCount:number;
  readonly explicitIgnoredMatches:number;
  readonly rule:typeof DB01_COLLECTION_UNIVERSE_RULE;
  readonly gameRuntimeMembershipVerified:false;
}
export interface Db01UniverseManifest{
  readonly schema:typeof DB01_COLLECTION_UNIVERSE_SCHEMA;
  readonly privateOnly:true;readonly publicationAuthorized:false;
  readonly platform:'Steam';readonly gameVersion:string;
  readonly sourceSqliteSha256:string;
  readonly sourceItemsSha256:string;
  readonly sourceIl2cppDumpSha256:string;
  readonly originalCategorySha256:Readonly<Record<
    'CollectionSet'|'Tag'|'Set'|'Furniture'|'Clothing',string>>;
  readonly sourceDefinitionCount:number;
  readonly collectionSetCount:number;
  readonly dynamicSelectorCount:number;
  readonly resolvedSourcePredicateSelectors:number;
  readonly unresolvedDynamicSelectors:number;
  readonly resolvedByNativeCategory:Readonly<Record<string,number>>;
  readonly explicitIgnoreMatches:number;
  readonly candidateItemIds:number;
  readonly candidateMemberships:number;
  readonly bucketCount:256;
  readonly sourcePredicateMatched:true;
  readonly gameRuntimeMembershipVerified:false;
  readonly gameUiVisibilityComplete:false;
  readonly dlcOwnershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly files:Readonly<Record<string,Readonly<{sha256:string;bytes:number;count:number}>>>;
}
export interface Db01UniversePredicateClient{
  readonly source:Readonly<Pick<Db01UniverseManifest,
    'gameVersion'|'sourceItemsSha256'|'sourceIl2cppDumpSha256'|
    'sourceDefinitionCount'|'collectionSetCount'|'dynamicSelectorCount'|
    'resolvedSourcePredicateSelectors'|'unresolvedDynamicSelectors'|
    'candidateItemIds'|'candidateMemberships'>>;
  getItem(id:number):Promise<readonly Readonly<Db01UniversePredicateMatch>[]>;
  getItems(ids:readonly number[]):Promise<
    readonly (readonly Readonly<Db01UniversePredicateMatch>[])[]
  >;
  getSelectors():Promise<readonly Readonly<Db01UniversePredicateSelector>[]>;
}
const SHA=/^[0-9a-f]{64}$/;
const VERSION=/^\d+\.\d+\.\d+$/;
const asObj=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v);
const safeId=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const integer=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const native=(v:unknown):v is 'Furniture'|'Clothing'=>
  v==='Furniture'||v==='Clothing';
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB01_COLLECTION_UNIVERSE_'+code);
}
const bucket=(id:number)=>'id/'+(id%256).toString(16).padStart(2,'0')+'.json';
const keys=['CollectionSet','Tag','Set','Furniture','Clothing'] as const;
const paths=['selectors.json',
  ...Array.from({length:256},(_,i)=>'id/'+i.toString(16).padStart(2,'0')+'.json')];
export function validateDb01UniverseManifest(value:unknown):
  asserts value is Db01UniverseManifest{
  check(asObj(value)&&value.schema===DB01_COLLECTION_UNIVERSE_SCHEMA&&
    value.privateOnly===true&&value.publicationAuthorized===false&&
    value.platform==='Steam'&&typeof value.gameVersion==='string'&&
    VERSION.test(value.gameVersion)&&value.bucketCount===256&&
    value.sourcePredicateMatched===true&&
    value.gameRuntimeMembershipVerified===false&&
    value.gameUiVisibilityComplete===false&&
    value.worldAvailabilityVerified===false&&value.dlcOwnershipVerified===false,
    'PRIVATE_SOURCE');
  check(typeof value.sourceSqliteSha256==='string'&&SHA.test(value.sourceSqliteSha256)&&
    typeof value.sourceItemsSha256==='string'&&SHA.test(value.sourceItemsSha256)&&
    typeof value.sourceIl2cppDumpSha256==='string'&&SHA.test(value.sourceIl2cppDumpSha256)&&
    asObj(value.originalCategorySha256)&&
    Object.keys(value.originalCategorySha256).length===keys.length&&
    keys.every(k=>typeof value.originalCategorySha256[k]==='string'&&
      SHA.test(value.originalCategorySha256[k] as string)),
    'SOURCE_SHA');
  check([
    value.sourceDefinitionCount,value.collectionSetCount,
    value.dynamicSelectorCount,value.resolvedSourcePredicateSelectors,
    value.unresolvedDynamicSelectors,value.explicitIgnoreMatches,
    value.candidateItemIds,value.candidateMemberships,
  ].every(integer),'COUNT');
  check(Number(value.sourceDefinitionCount)>0&&
    Number(value.collectionSetCount)>0&&
    value.dynamicSelectorCount===Number(value.resolvedSourcePredicateSelectors)+
      Number(value.unresolvedDynamicSelectors)&&
    Number(value.candidateItemIds)<=Number(value.candidateMemberships)&&
    Number(value.candidateItemIds)<=Number(value.sourceDefinitionCount),
    'COUNT_LEDGER');
  check(asObj(value.resolvedByNativeCategory)&&
    Object.keys(value.resolvedByNativeCategory).every(native)&&
    Object.values(value.resolvedByNativeCategory).every(integer)&&
    Object.values(value.resolvedByNativeCategory).reduce<number>(
      (total,n)=>total+Number(n),0)===value.resolvedSourcePredicateSelectors,
    'SELECTOR_TYPES');
  check(asObj(value.files)&&Object.keys(value.files).length===paths.length&&
    paths.every(p=>Object.prototype.hasOwnProperty.call(value.files,p)),
    'FILE_SET');
  let count=0;
  for(const path of paths){
    const file=value.files[path];
    check(asObj(file)&&typeof file.sha256==='string'&&SHA.test(file.sha256)&&
      integer(file.bytes)&&Number(file.bytes)>=3&&Number(file.bytes)<12_000_000&&
      integer(file.count),'FILE_META');
    if(path!=='selectors.json')count+=Number(file.count);
  }
  check(value.files['selectors.json'].count===value.resolvedSourcePredicateSelectors&&
    count===value.candidateItemIds,'FILE_LEDGER');
}
function checkMatch(value:unknown,manifest:Db01UniverseManifest){
  check(asObj(value)&&safeId(value.setId)&&integer(value.groupIndex)&&
    native(value.nativeCategory)&&safeId(value.sourceSetItemId)&&
    safeId(value.universeTagId)&&
    typeof value.universeTagKey==='string'&&
    /^[A-Za-z][A-Za-z0-9_]*$/.test(value.universeTagKey)&&
    value.selectorField===(value.nativeCategory==='Furniture'?3:4)&&
    value.rule===DB01_COLLECTION_UNIVERSE_RULE&&
    value.sourcePredicateMatched===true&&
    value.gameUiMembershipVerified===false&&
    value.gameUiVisibilityVerified===false&&
    value.worldAvailabilityVerified===false&&value.dlcOwnershipVerified===false&&
    value.setId!==value.sourceSetItemId,'MEMBERSHIP_SHAPE');
  check(manifest.collectionSetCount>0,'MISSING_COLLECTION_SETS');
}
export function createDb01UniversePredicateClient(
  raw:unknown,loadBytes:Db01LoadBytes,catalog:Db01CatalogClient
):Db01UniversePredicateClient{
  validateDb01UniverseManifest(raw);
  check(typeof loadBytes==='function'&&catalog?.source?.privateOnly===true&&
    catalog.source.platform===raw.platform&&catalog.source.gameVersion===raw.gameVersion&&
    catalog.source.sourceItemsSha256===raw.sourceItemsSha256&&
    catalog.source.definitions===raw.sourceDefinitionCount&&
    typeof catalog.getItems==='function'&&typeof catalog.getItem==='function',
    'CATALOG_SOURCE');
  const manifest:Db01UniverseManifest=Object.freeze({
    ...raw,
    originalCategorySha256:Object.freeze({...raw.originalCategorySha256}),
    resolvedByNativeCategory:Object.freeze({...raw.resolvedByNativeCategory}),
    files:Object.freeze(Object.fromEntries(Object.entries(raw.files).map(([k,v])=>
      [k,Object.freeze({...v})]))),
  });
  type BucketRow={itemId:number;memberships:readonly Db01UniversePredicateMatch[]};
  const cache=new Map<string,Promise<readonly BucketRow[]>>();
  async function read(path:string):Promise<readonly BucketRow[]>{
    const cached=cache.get(path);if(cached)return cached;
    const promise=(async()=>{
      const file=manifest.files[path];check(file,'UNKNOWN_FILE');
      const data=await loadBytes(path);
      const rawData=data instanceof ArrayBuffer?new Uint8Array(data):data;
      check(rawData instanceof Uint8Array&&rawData.byteLength===file.bytes,'FILE_SIZE');
      const bytes=new Uint8Array(rawData);
      check(globalThis.crypto?.subtle,'SHA_UNAVAILABLE');
      const hash=await crypto.subtle.digest('SHA-256',bytes);
      const actual=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      check(actual===file.sha256,'FILE_SHA');
      const records:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      check(Array.isArray(records)&&records.length===file.count,'FILE_COUNT');
      const ids=new Set<number>();
      for(const record of records){
        if(path==='selectors.json'){
          check(asObj(record)&&safeId(record.setId)&&integer(record.groupIndex)&&
            integer(record.submenuCode)&&native(record.nativeCategory)&&
            safeId(record.universeTagId)&&
            typeof record.universeTagKey==='string'&&
            /^[A-Za-z][A-Za-z0-9_]*$/.test(record.universeTagKey)&&
            integer(record.matchedCandidateCount)&&
            integer(record.explicitIgnoredMatches)&&
            record.rule===DB01_COLLECTION_UNIVERSE_RULE&&
            record.gameRuntimeMembershipVerified===false,'SELECTOR_ROW');
        }else{
          check(asObj(record)&&safeId(record.itemId)&&
            bucket(record.itemId)===path&&Array.isArray(record.memberships)&&
            record.memberships.length>0&&!ids.has(record.itemId),'ITEM_ROW');
          ids.add(record.itemId);
          for(const match of record.memberships)checkMatch(match,manifest);
          check(new Set(record.memberships.map((m:Db01UniversePredicateMatch)=>
            m.nativeCategory)).size===1,'MIXED_NATIVE_CLASSES');
          Object.freeze(record.memberships);
        }
        Object.freeze(record);
      }
      return Object.freeze(records) as readonly BucketRow[];
    })();
    cache.set(path,promise);
    try{return await promise;}catch(e){cache.delete(path);throw e;}
  }
  function asMatches(row:BucketRow|undefined){
    return row?.memberships??Object.freeze([] as Db01UniversePredicateMatch[]);
  }
  async function getItems(ids:readonly number[]):Promise<
    readonly (readonly Readonly<Db01UniversePredicateMatch>[])[]
  >{
    check(Array.isArray(ids)&&ids.length<=4096&&ids.every(safeId),'INVALID_BATCH');
    if(!ids.length)return Object.freeze([]);
    const requested=[...new Set(ids.map(bucket))],found=new Map<number,BucketRow>();
    let next=0;
    await Promise.all(Array.from({length:Math.min(8,requested.length)},async()=>{
      while(next<requested.length){
        const path=requested[next++];
        for(const row of await read(path))found.set(row.itemId,row);
      }
    }));
    const originals=await catalog.getItems(ids);
    check(originals.length===ids.length,'CATALOG_BATCH');
    return Object.freeze(ids.map((id,i)=>{
      const row=found.get(id);
      const original=originals[i];
      check(!row||(original?.itemId===id&&
        original.sourceSha256===manifest.originalCategorySha256[original.nativeCategory as
          keyof Db01UniverseManifest['originalCategorySha256']]&&
        row.memberships.every(link=>link.nativeCategory===original.nativeCategory)),
        'SOURCE_IDENTITY');
      return original?.itemId===id?asMatches(row):Object.freeze([]);
    }));
  }
  async function getItem(id:number){
    const found=await getItems([id]);return found[0];
  }
  async function getSelectors(){
    const rows=await read('selectors.json');
    return rows as unknown as readonly Readonly<Db01UniversePredicateSelector>[];
  }
  return Object.freeze({
    source:Object.freeze({
      gameVersion:manifest.gameVersion,
      sourceItemsSha256:manifest.sourceItemsSha256,
      sourceIl2cppDumpSha256:manifest.sourceIl2cppDumpSha256,
      sourceDefinitionCount:manifest.sourceDefinitionCount,
      collectionSetCount:manifest.collectionSetCount,
      dynamicSelectorCount:manifest.dynamicSelectorCount,
      resolvedSourcePredicateSelectors:manifest.resolvedSourcePredicateSelectors,
      unresolvedDynamicSelectors:manifest.unresolvedDynamicSelectors,
      candidateItemIds:manifest.candidateItemIds,
      candidateMemberships:manifest.candidateMemberships,
    }),
    getItem,getItems,getSelectors,
  });
}
