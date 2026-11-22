/** Read-only current-original Character/Memory/BoardGame/Pet/Sidekick
 * Collection predicate candidates. Does NOT claim runtime visibility or DLC.
 */
import type {Db01CatalogClient,Db01LoadBytes} from './index.ts';

export const DB01_SPECIAL_SCHEMA='wand.db01.collection-special-predicates@1' as const;
export const DB01_SPECIAL_EVIDENCE='current_original_collection_static_predicate' as const;
export type Db01SpecialKind=2|7|9|10|11;
export type Db01SpecialNative='Character'|'MemoryShard'|'BoardGame'|'Companion';
export interface Db01SpecialMembership {
  readonly setId:number; readonly submenuCode:number;
  readonly groupIndex:number; readonly selectorIndex:number;
  readonly selectorKind:Db01SpecialKind; readonly family:string;
  readonly nativeCategory:Db01SpecialNative;
  readonly originalField:string; readonly criterion:number;
  readonly tagKey:string|null; readonly evidence:typeof DB01_SPECIAL_EVIDENCE;
  readonly sourcePredicateMatched:true;
  readonly gameUiMembershipVerified:false; readonly gameUiVisibilityVerified:false;
  readonly worldAvailabilityVerified:false; readonly dlcOwnershipVerified:false;
}
export interface Db01SpecialSelector {
  readonly setId:number; readonly submenuCode:number;
  readonly groupIndex:number; readonly selectorIndex:number;
  readonly selectorKind:Db01SpecialKind; readonly family:string;
  readonly field:string; readonly criterion:number;
  readonly tagKey:string|null; readonly negative:boolean;
  readonly sourceMatchedItemCount:number; readonly candidateIncludedCount:number;
  readonly explicitOrNegativeExcludedCount?:number;
  readonly gameUiMembershipVerified:false;
}
export interface Db01SpecialManifest {
  readonly schema:typeof DB01_SPECIAL_SCHEMA;
  readonly platform:'Steam'; readonly gameVersion:string;
  readonly privateOnly:true; readonly publicationAuthorized:false;
  readonly sourceSqliteSha256:string; readonly sourceItemsSha256:string;
  readonly sourceIl2cppDumpSha256:string;
  readonly originalCategorySha256:Readonly<Record<string,string>>;
  readonly definitionCount:number; readonly collectionSetCount:number;
  readonly totalDynamicSelectors:number; readonly handledSourceSelectors:number;
  readonly unresolvedDynamicSelectors:number; readonly negativeSelectorsHandled:number;
  readonly selectorsBySourceKind:Readonly<Record<string,number>>;
  readonly explicitOrNegativeExcludedCount:number;
  readonly candidateItemIds:number; readonly candidateMemberships:number;
  readonly bucketCount:256;
  readonly gameRuntimeMembershipVerified:false; readonly gameUiVisibilityComplete:false;
  readonly worldAvailabilityVerified:false; readonly dlcOwnershipVerified:false;
  readonly files:Readonly<Record<string,Readonly<{sha256:string;bytes:number;count:number}>>>;
}
export interface Db01SpecialClient {
  readonly source:Readonly<Pick<Db01SpecialManifest,
    'gameVersion'|'sourceSqliteSha256'|'sourceItemsSha256'|
    'sourceIl2cppDumpSha256'|'definitionCount'|'collectionSetCount'|
    'totalDynamicSelectors'|'handledSourceSelectors'|
    'unresolvedDynamicSelectors'|'candidateItemIds'|'candidateMemberships'>>;
  getItem(id:number):Promise<readonly Readonly<Db01SpecialMembership>[]>;
  getItems(ids:readonly number[]):Promise<readonly (readonly Readonly<Db01SpecialMembership>[])[]>;
  getSelectors():Promise<readonly Readonly<Db01SpecialSelector>[]>;
}
const FAMILIES={
  2:{family:'CharacterUniverse',native:'Character'},
  7:{family:'MemoryShard',native:'MemoryShard'},
  9:{family:'BoardGameFigurine',native:'BoardGame'},
  10:{family:'Pet',native:'Companion'},
  11:{family:'SidekickUniverse',native:'Character'},
} as const;
const ORIGINAL=['CollectionSet','Tag','Character','MemoryShard','BoardGame','Companion'];
const SHA=/^[0-9a-f]{64}$/;
const obj=(x:unknown):x is Record<string,unknown> =>
  !!x && typeof x==='object' && !Array.isArray(x);
const nonneg=(x:unknown):x is number =>
  typeof x==='number' && Number.isSafeInteger(x) && x>=0;
const id=(x:unknown):x is number=>nonneg(x)&&x>0;
const text=(x:unknown):x is string=>
  typeof x==='string' && x.length>0 && x.length<=256 && x.trim()===x &&
  !/[\x00-\x1f]/.test(x);
const kind=(x:unknown):x is Db01SpecialKind =>
  x===2||x===7||x===9||x===10||x===11;
const bucket=(n:number)=>'id/'+(n%256).toString(16).padStart(2,'0')+'.json';
const PATHS=['selectors.json',...Array.from({length:256},(_,n)=>
  'id/'+n.toString(16).padStart(2,'0')+'.json')];
function require(ok:unknown,why:string):asserts ok {
  if(!ok)throw new TypeError('DB01_SPECIAL_'+why);
}
export function validateDb01SpecialManifest(v:unknown):asserts v is Db01SpecialManifest {
  require(obj(v)&&v.schema===DB01_SPECIAL_SCHEMA&&v.platform==='Steam'&&
    typeof v.gameVersion==='string'&&/^\d+\.\d+\.\d+$/.test(v.gameVersion)&&
    v.privateOnly===true&&v.publicationAuthorized===false&&v.bucketCount===256&&
    v.gameRuntimeMembershipVerified===false&&v.gameUiVisibilityComplete===false&&
    v.worldAvailabilityVerified===false&&v.dlcOwnershipVerified===false,
    'SOURCE_CONTRACT');
  require([v.sourceSqliteSha256,v.sourceItemsSha256,
    v.sourceIl2cppDumpSha256].every(x=>typeof x==='string'&&SHA.test(x)),
    'SOURCE_SHA');
  const original=obj(v.originalCategorySha256)?v.originalCategorySha256:{};
  require(Object.keys(original).length===ORIGINAL.length&&
    ORIGINAL.every(cat=>typeof original[cat]==='string'&&
      SHA.test(original[cat] as string)),'ORIGINAL_LEDGER');
  require([v.definitionCount,v.collectionSetCount,v.totalDynamicSelectors,
    v.handledSourceSelectors,v.unresolvedDynamicSelectors,v.negativeSelectorsHandled,
    v.explicitOrNegativeExcludedCount,v.candidateItemIds,v.candidateMemberships]
    .every(nonneg)&&Number(v.definitionCount)>0&&
    v.totalDynamicSelectors===Number(v.handledSourceSelectors)+
      Number(v.unresolvedDynamicSelectors)&&
    Number(v.negativeSelectorsHandled)<=Number(v.handledSourceSelectors)&&
    Number(v.candidateItemIds)<=Number(v.candidateMemberships)&&
    Number(v.candidateItemIds)<=Number(v.definitionCount),'COUNTS');
  require(obj(v.selectorsBySourceKind)&&
    Object.entries(v.selectorsBySourceKind).every(([caseCode,count])=>
      kind(Number(caseCode))&&nonneg(count))&&
    Object.values(v.selectorsBySourceKind).reduce<number>((n,x)=>n+Number(x),0)===
      v.handledSourceSelectors,'SELECTOR_LEDGER');
  require(obj(v.files)&&Object.keys(v.files).length===257&&
    PATHS.every(p=>Object.prototype.hasOwnProperty.call(v.files,p)),'FILE_SET');
  let total=0;
  for(const name of PATHS){
    const f=v.files[name];
    require(obj(f)&&typeof f.sha256==='string'&&SHA.test(f.sha256)&&
      nonneg(f.bytes)&&f.bytes>=3&&f.bytes<12_000_000&&nonneg(f.count),
      'FILE_META');
    if(name==='selectors.json')
      require(f.count===v.handledSourceSelectors,'SELECTOR_COUNT');
    else total+=f.count;
  }
  require(total===v.candidateItemIds,'ITEM_COUNT');
}
function validSelector(v:unknown):asserts v is Db01SpecialSelector {
  require(obj(v)&&id(v.setId)&&nonneg(v.submenuCode)&&
    nonneg(v.groupIndex)&&nonneg(v.selectorIndex)&&kind(v.selectorKind)&&
    v.family===FAMILIES[v.selectorKind].family&&text(v.field)&&
    nonneg(v.criterion)&&(v.tagKey===null||text(v.tagKey))&&
    typeof v.negative==='boolean'&&nonneg(v.sourceMatchedItemCount)&&
    nonneg(v.candidateIncludedCount)&&v.gameUiMembershipVerified===false,
    'SELECTOR');
  require(!v.negative||v.candidateIncludedCount===0,'NEGATIVE_AS_POSITIVE');
}
function validMembership(v:unknown):asserts v is Db01SpecialMembership {
  require(obj(v)&&id(v.setId)&&nonneg(v.submenuCode)&&
    nonneg(v.groupIndex)&&nonneg(v.selectorIndex)&&kind(v.selectorKind)&&
    v.family===FAMILIES[v.selectorKind].family&&
    v.nativeCategory===FAMILIES[v.selectorKind].native&&
    text(v.originalField)&&nonneg(v.criterion)&&
    (v.tagKey===null||text(v.tagKey))&&v.evidence===DB01_SPECIAL_EVIDENCE&&
    v.sourcePredicateMatched===true&&v.gameUiMembershipVerified===false&&
    v.gameUiVisibilityVerified===false&&v.worldAvailabilityVerified===false&&
    v.dlcOwnershipVerified===false,'MEMBERSHIP');
  require((v.selectorKind===10&&v.originalField==='PetIsNotable'&&
    v.criterion<=1&&v.tagKey===null)||
    (v.selectorKind!==10&&v.tagKey!==null&&
     ['Tags','UniverseTagItemID','MemoryShardTagItemID'].includes(v.originalField)),
    'MEMBERSHIP_WIRE_FIELD');
}
/** No public asset paths or original game data are embedded in the client. */
export function createDb01SpecialClient(
  raw:unknown,loadBytes:Db01LoadBytes,catalog:Db01CatalogClient
):Db01SpecialClient {
  validateDb01SpecialManifest(raw);
  require(typeof loadBytes==='function'&&catalog?.source?.privateOnly===true&&
    catalog.source.platform===raw.platform&&
    catalog.source.gameVersion===raw.gameVersion&&
    catalog.source.sourceItemsSha256===raw.sourceItemsSha256&&
    catalog.source.definitions===raw.definitionCount&&
    typeof catalog.getItem==='function'&&typeof catalog.getItems==='function',
    'CATALOG_SOURCE');
  const manifest:Db01SpecialManifest=Object.freeze({
    ...raw,
    originalCategorySha256:Object.freeze({...raw.originalCategorySha256}),
    selectorsBySourceKind:Object.freeze({...raw.selectorsBySourceKind}),
    files:Object.freeze(Object.fromEntries(Object.entries(raw.files).map(([k,v])=>
      [k,Object.freeze({...v})]))),
  });
  type ItemRow={itemId:number;nativeCategory:Db01SpecialNative;
    sourceSha256:string;memberships:readonly Db01SpecialMembership[]};
  const cache=new Map<string,Promise<readonly unknown[]>>();
  async function read(path:string):Promise<readonly unknown[]> {
    const existing=cache.get(path);if(existing)return existing;
    const promise=(async()=>{
      const entry=manifest.files[path];require(entry,'UNKNOWN_FILE');
      const payload=await loadBytes(path);
      const rawBytes=payload instanceof ArrayBuffer?new Uint8Array(payload):payload;
      require(rawBytes instanceof Uint8Array&&rawBytes.byteLength===entry.bytes,
        'BYTES_MISMATCH');
      const bytes=new Uint8Array(rawBytes);
      require(globalThis.crypto?.subtle,'SHA_UNAVAILABLE');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const actual=Array.from(new Uint8Array(digest),x=>
        x.toString(16).padStart(2,'0')).join('');
      require(actual===entry.sha256,'FILE_SHA_MISMATCH');
      const decoded:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      require(Array.isArray(decoded)&&decoded.length===entry.count,
        'FILE_COUNT_MISMATCH');
      const seen=new Set<number>();
      for(const value of decoded){
        if(path==='selectors.json'){
          validSelector(value);
        }else{
          require(obj(value)&&id(value.itemId)&&
            bucket(value.itemId)===path&&!seen.has(value.itemId)&&
            typeof value.nativeCategory==='string'&&
            ORIGINAL.includes(value.nativeCategory)&&
            value.sourceSha256===manifest.originalCategorySha256[value.nativeCategory]&&
            Array.isArray(value.memberships)&&value.memberships.length>0,
            'ITEM_SHAPE');
          seen.add(value.itemId);
          const refs=new Set<string>();
          for(const membership of value.memberships){
            validMembership(membership);
            require(membership.nativeCategory===value.nativeCategory,'NATIVE_CLASS');
            const identity=String(membership.setId)+':'+String(membership.groupIndex)+
              ':'+String(membership.selectorIndex);
            require(!refs.has(identity),'DUPLICATE_SELECTOR');
            refs.add(identity);
            Object.freeze(membership);
          }
          Object.freeze(value.memberships);
        }
        Object.freeze(value);
      }
      return Object.freeze(decoded) as readonly unknown[];
    })();
    cache.set(path,promise);
    try{return await promise;}catch(e){cache.delete(path);throw e;}
  }
  async function getItems(ids:readonly number[]):Promise<
    readonly (readonly Readonly<Db01SpecialMembership>[])[]
  > {
    require(Array.isArray(ids)&&ids.length<=4096&&ids.every(id),'BATCH');
    if(!ids.length)return Object.freeze([]);
    const buckets=[...new Set(ids.map(bucket))];
    const found=new Map<number,ItemRow>();let next=0;
    await Promise.all(Array.from({length:Math.min(8,buckets.length)},async()=>{
      while(next<buckets.length){
        for(const row of await read(buckets[next++])) {
          const entry=row as ItemRow;found.set(entry.itemId,entry);
        }
      }
    }));
    const original=await catalog.getItems(ids);
    require(original.length===ids.length,'CATALOG_LENGTH');
    return Object.freeze(ids.map((itemId,i)=>{
      const entry=found.get(itemId),base=original[i];
      if(!entry)return Object.freeze([] as readonly Db01SpecialMembership[]);
      require(base?.itemId===itemId&&base.nativeCategory===entry.nativeCategory&&
        base.sourceSha256===entry.sourceSha256,'ORIGINAL_ITEM_IDENTITY');
      return entry.memberships;
    }));
  }
  async function getItem(itemId:number){
    require(id(itemId),'ITEM_ID');
    return (await getItems([itemId]))[0];
  }
  async function getSelectors(){
    return await read('selectors.json') as readonly Db01SpecialSelector[];
  }
  return Object.freeze({
    source:Object.freeze({
      gameVersion:manifest.gameVersion,
      sourceSqliteSha256:manifest.sourceSqliteSha256,
      sourceItemsSha256:manifest.sourceItemsSha256,
      sourceIl2cppDumpSha256:manifest.sourceIl2cppDumpSha256,
      definitionCount:manifest.definitionCount,
      collectionSetCount:manifest.collectionSetCount,
      totalDynamicSelectors:manifest.totalDynamicSelectors,
      handledSourceSelectors:manifest.handledSourceSelectors,
      unresolvedDynamicSelectors:manifest.unresolvedDynamicSelectors,
      candidateItemIds:manifest.candidateItemIds,
      candidateMemberships:manifest.candidateMemberships,
    }),
    getItem,getItems,getSelectors,
  });
}
