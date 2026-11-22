/** Original Steam IL2CPP ItemType classification, SHA-pinned private metadata.
 * Native class/subtype are source enums, not in-game Collection menu names.
 */
import type { Db01CatalogClient, Db01LoadBytes } from './index.ts';

export const DB01_ITEM_TYPES_SCHEMA='wand.db01.il2cpp-types@1' as const;
export interface Db01ItemType {
  readonly itemId:number;
  readonly nativeCategory:string;
  readonly sourceSha256:string;
  readonly itemTypeCode:number;
  readonly itemTypeName:string;
  readonly subtypeCode:number;
  readonly subtypeEnumName:string|null;
  readonly subtypeName:string|null;
  readonly subtypeNameVerified:boolean;
  readonly sourceIl2cppDumpSha256:string;
  readonly gameUiCategoryVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcOwnershipVerified:false;
}
export interface Db01ItemTypesManifest {
  readonly schema:typeof DB01_ITEM_TYPES_SCHEMA;
  readonly privateOnly:true;
  readonly publicationAuthorized:false;
  readonly platform:'Steam';
  readonly gameVersion:string;
  readonly sourceSqliteSha256:string;
  readonly sourceItemsSha256:string;
  readonly sourceIl2cppDumpSha256:string;
  readonly itemTypeEnumName:'Definitions.Items.ItemType';
  readonly definitionCount:number;
  readonly sourceItemTypeVerified:number;
  readonly sourceSubtypeNameVerified:number;
  readonly sourceSubtypeNameUnverified:number;
  readonly byNativeCategory:Readonly<Record<string,number>>;
  readonly subtypeVerifiedByCategory:Readonly<Record<string,number>>;
  readonly subtypeUnverifiedByCategory:Readonly<Record<string,number>>;
  readonly bucketCount:256;
  readonly gameUiTaxonomyComplete:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcOwnershipVerified:false;
  readonly files:Readonly<Record<string,Readonly<{sha256:string;bytes:number;count:number}>>>;
}
export interface Db01ItemTypeClient {
  readonly source:Readonly<Pick<Db01ItemTypesManifest,
    'gameVersion'|'sourceItemsSha256'|'sourceIl2cppDumpSha256'|
    'sourceSqliteSha256'|'definitionCount'|'sourceItemTypeVerified'|'sourceSubtypeNameVerified'>>;
  getItem(id:number):Promise<Readonly<Db01ItemType>|null>;
  getItems(ids:readonly number[]):Promise<readonly (Readonly<Db01ItemType>|null)[]>;
}
const SHA=/^[0-9a-f]{64}$/;
const CAT=/^[A-Za-z][A-Za-z0-9]*$/;
const VERSION=/^\d+\.\d+\.\d+$/;
const goodId=(value:unknown):value is number=>
  typeof value==='number' && Number.isSafeInteger(value) && value>0;
const object=(v:unknown):v is Record<string,unknown>=>
  !!v && typeof v==='object' && !Array.isArray(v);
const bucket=(id:number)=>id.toString(16).slice(-2).padStart(2,'0');
function check(ok:unknown,why:string):asserts ok{
  if(!ok)throw new TypeError('DB01_ITEMTYPE_'+why);
}
export function validateDb01ItemTypesManifest(value:unknown):
  asserts value is Db01ItemTypesManifest {
  check(object(value),'MANIFEST_REQUIRED');
  check(value.schema===DB01_ITEM_TYPES_SCHEMA &&
    value.privateOnly===true && value.publicationAuthorized===false &&
    value.platform==='Steam' && typeof value.gameVersion==='string' &&
    VERSION.test(value.gameVersion) &&
    value.itemTypeEnumName==='Definitions.Items.ItemType' &&
    value.bucketCount===256 && value.gameUiTaxonomyComplete===false &&
    value.worldAvailabilityVerified===false && value.dlcOwnershipVerified===false,
    'SOURCE_REQUIRED');
  check([value.sourceSqliteSha256,value.sourceItemsSha256,
    value.sourceIl2cppDumpSha256].every(x=>typeof x==='string'&&SHA.test(x)),
    'SHA_REQUIRED');
  check(Number.isSafeInteger(value.definitionCount)&&Number(value.definitionCount)>0 &&
    Number.isSafeInteger(value.sourceItemTypeVerified)&&
    value.sourceItemTypeVerified===value.definitionCount &&
    Number.isSafeInteger(value.sourceSubtypeNameVerified) &&
    Number.isSafeInteger(value.sourceSubtypeNameUnverified) &&
    Number(value.sourceSubtypeNameVerified)>=0 &&
    Number(value.sourceSubtypeNameUnverified)>=0 &&
    Number(value.sourceSubtypeNameVerified)+
      Number(value.sourceSubtypeNameUnverified)===Number(value.definitionCount),
    'COVERAGE_LEDGER');
  check(object(value.byNativeCategory) && object(value.subtypeVerifiedByCategory) &&
    object(value.subtypeUnverifiedByCategory) && object(value.files),
    'INVALID_FILE_LEDGER');
  const byCategory=value.byNativeCategory as Record<string,unknown>;
  const subtypeVerified=value.subtypeVerifiedByCategory as Record<string,unknown>;
  const subtypeUnverified=value.subtypeUnverifiedByCategory as Record<string,unknown>;
  check(Object.keys(byCategory).length>0 &&
    Object.entries(byCategory).every(([category,count])=>
      CAT.test(category) && Number.isSafeInteger(count) && Number(count)>0) &&
    Object.values(byCategory).reduce<number>((total,n)=>total+Number(n),0)===
      value.definitionCount,
    'CATEGORY_LEDGER');
  check(Object.entries(value.subtypeVerifiedByCategory).every(([category,n])=>
    category in byCategory && Number.isSafeInteger(n) && Number(n)>=0 &&
      Number(n)<=Number(byCategory[category])) &&
    Object.entries(value.subtypeUnverifiedByCategory).every(([category,n])=>
    category in byCategory && Number.isSafeInteger(n) && Number(n)>=0 &&
      Number(n)<=Number(byCategory[category])) &&
    Object.keys(byCategory).every(category=>
      Number(subtypeVerified[category]??0)+
      Number(subtypeUnverified[category]??0)===
      Number(byCategory[category])), 'SUBTYPE_CATEGORY_LEDGER');
  const paths=Array.from({length:256},(_,i)=>
    'id/'+i.toString(16).padStart(2,'0')+'.json');
  check(Object.keys(value.files).length===paths.length &&
    paths.every(p=>Object.prototype.hasOwnProperty.call(value.files,p)),
    'UNEXPECTED_SHARD_PATHS');
  let total=0;
  for(const path of paths){
    const f=value.files[path];
    check(object(f) && typeof f.sha256==='string' && SHA.test(f.sha256) &&
      Number.isSafeInteger(f.bytes) && Number(f.bytes)>=3 &&
      Number(f.bytes)<16_000_000 && Number.isSafeInteger(f.count) &&
      Number(f.count)>=0,'INVALID_SHARD_META');
    total+=Number(f.count);
  }
  check(total===value.definitionCount,'SHARD_COUNT_MISMATCH');
}
function checkRow(row:unknown,m:Db01ItemTypesManifest,path:string):
  asserts row is Db01ItemType {
  check(object(row) && goodId(row.itemId) &&
    bucket(row.itemId)===path.slice(3,5) &&
    typeof row.nativeCategory==='string' && CAT.test(row.nativeCategory) &&
    row.itemTypeName===row.nativeCategory &&
    Number.isSafeInteger(row.itemTypeCode) &&
    row.itemTypeCode===Math.floor(row.itemId/10_000_000) &&
    Number.isSafeInteger(row.subtypeCode) &&
    row.subtypeCode===Math.floor((row.itemId%10_000_000)/100_000) &&
    typeof row.sourceSha256==='string' && SHA.test(row.sourceSha256) &&
    row.sourceIl2cppDumpSha256===m.sourceIl2cppDumpSha256 &&
    row.subtypeNameVerified===(row.subtypeName!==null) &&
    (row.subtypeName===null ||
      (typeof row.subtypeName==='string' && CAT.test(row.subtypeName) &&
      typeof row.subtypeEnumName==='string' && CAT.test(row.subtypeEnumName))) &&
    (row.subtypeEnumName===null ||
      (typeof row.subtypeEnumName==='string' && CAT.test(row.subtypeEnumName))) &&
    row.gameUiCategoryVerified===false &&
    row.worldAvailabilityVerified===false && row.dlcOwnershipVerified===false,
    'ITEM_SOURCE_OR_ENUM_MISMATCH');
}
export function createDb01ItemTypeClient(raw:unknown,
  loadBytes:Db01LoadBytes,catalog:Db01CatalogClient):Db01ItemTypeClient{
  validateDb01ItemTypesManifest(raw);
  check(typeof loadBytes==='function' && catalog?.source?.privateOnly===true &&
    typeof catalog.getItem==='function' && typeof catalog.getItems==='function' &&
    catalog.source.platform===raw.platform &&
    catalog.source.gameVersion===raw.gameVersion &&
    catalog.source.sourceItemsSha256===raw.sourceItemsSha256 &&
    catalog.source.definitions===raw.definitionCount,
    'CATALOG_SOURCE_MISMATCH');
  const manifest:Db01ItemTypesManifest=Object.freeze({...raw,
    byNativeCategory:Object.freeze({...raw.byNativeCategory}),
    subtypeVerifiedByCategory:Object.freeze({...raw.subtypeVerifiedByCategory}),
    subtypeUnverifiedByCategory:Object.freeze({...raw.subtypeUnverifiedByCategory}),
    files:Object.freeze(Object.fromEntries(Object.entries(raw.files).map(([k,v])=>
      [k,Object.freeze({...v})]))),
  });
  const cache=new Map<string,Promise<readonly Db01ItemType[]>>();
  async function readBucket(path:string):Promise<readonly Db01ItemType[]>{
    const existing=cache.get(path);if(existing)return existing;
    const promise=(async()=>{
      const meta=manifest.files[path];check(meta,'UNKNOWN_SHARD');
      const data=await loadBytes(path);
      const bytes=data instanceof ArrayBuffer?new Uint8Array(data):data;
      check(bytes instanceof Uint8Array && bytes.byteLength===meta.bytes,'SHARD_SIZE');
      const copy=new Uint8Array(bytes);
      check(globalThis.crypto?.subtle,'SHA_UNAVAILABLE');
      const hash=await crypto.subtle.digest('SHA-256',copy);
      const hex=Array.from(new Uint8Array(hash),b=>
        b.toString(16).padStart(2,'0')).join('');
      check(hex===meta.sha256,'SHARD_SHA');
      const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(copy));
      check(Array.isArray(parsed)&&parsed.length===meta.count,'SHARD_COUNT');
      const unique=new Set<number>();
      for(const item of parsed){
        checkRow(item,manifest,path);
        check(!unique.has(item.itemId),'SHARD_DUPLICATE_ID');
        unique.add(item.itemId);Object.freeze(item);
      }
      return Object.freeze(parsed) as readonly Db01ItemType[];
    })();
    cache.set(path,promise);
    try{return await promise;}catch(error){cache.delete(path);throw error;}
  }
  function checkIdentity(base:{itemId:number;nativeCategory:string;sourceSha256:string}|null,
    typed:Readonly<Db01ItemType>|null):void{
    check((base===null)===(typed===null) &&
      (base===null||typed===null||
        (base.itemId===typed.itemId&&base.nativeCategory===typed.nativeCategory&&
         base.sourceSha256===typed.sourceSha256)), 'CANONICAL_IDENTITY_MISMATCH');
  }
  async function getItem(id:number):Promise<Readonly<Db01ItemType>|null>{
    check(goodId(id),'INVALID_ID');
    const rows=await readBucket('id/'+bucket(id)+'.json');
    const row=rows.find(r=>r.itemId===id)??null;
    checkIdentity(await catalog.getItem(id),row);
    return row;
  }
  async function getItems(ids:readonly number[]):Promise<readonly (Readonly<Db01ItemType>|null)[]>{
    check(Array.isArray(ids)&&ids.length<=4096&&ids.every(goodId),'INVALID_BATCH');
    if(!ids.length)return Object.freeze([]);
    const paths=[...new Set(ids.map(id=>'id/'+bucket(id)+'.json'))];
    const found=new Map<number,Readonly<Db01ItemType>>();let next=0;
    async function worker(){
      while(next<paths.length){
        const path=paths[next++];
        for(const row of await readBucket(path))found.set(row.itemId,row);
      }
    }
    await Promise.all(Array.from({length:Math.min(8,paths.length)},()=>worker()));
    const result=Object.freeze(ids.map(id=>found.get(id)??null));
    const originals=await catalog.getItems(ids);
    check(originals.length===result.length,'SOURCE_BATCH_MISMATCH');
    for(let i=0;i<ids.length;i++)checkIdentity(originals[i],result[i]);
    return result;
  }
  return Object.freeze({
    source:Object.freeze({
      gameVersion:manifest.gameVersion,
      sourceItemsSha256:manifest.sourceItemsSha256,
      sourceIl2cppDumpSha256:manifest.sourceIl2cppDumpSha256,
      sourceSqliteSha256:manifest.sourceSqliteSha256,
      definitionCount:manifest.definitionCount,
      sourceItemTypeVerified:manifest.sourceItemTypeVerified,
      sourceSubtypeNameVerified:manifest.sourceSubtypeNameVerified,
    }),
    getItem,getItems,
  });
}
