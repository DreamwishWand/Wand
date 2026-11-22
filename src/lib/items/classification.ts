/** Source-exact, private DB-01 Tag classification overlay. UI taxonomies and
 * DLC permissions are intentionally NOT inferred from native tag references. */
import type { Db01CatalogClient, Db01LoadBytes } from './index.ts';
export const DB01_TAG_SCHEMA='wand.db01.native-tag-overlay@1' as const;
export const DB01_TAG_FACETS=[
  'clothingSlot','furnitureKind','disneyUniverse','ingredientKind','mealKind',
  'furnitureStyle','clothingStyle','color','worldContextTag','otherTag',
] as const;
export type Db01TagFacet=typeof DB01_TAG_FACETS[number];
export interface Db01TagRef {
  readonly tagId:number; readonly tagKey:string; readonly wireField:number;
  readonly facet:Db01TagFacet;
}
export interface Db01Classification {
  readonly itemId:number; readonly nativeCategory:string; readonly nativeKey:string;
  readonly sourceSha256:string; readonly tagReferences:readonly Db01TagRef[];
  readonly facets:Readonly<Record<string,readonly string[]>>;
  readonly wireSubtypeCode:number|null;
  readonly wireSubtypeMeaningVerified:false; readonly gameUiCategoryVerified:false;
  readonly dlcOwnershipVerified:false; readonly worldAvailabilityVerified:false;
}
export interface Db01TagManifest {
  readonly schema:typeof DB01_TAG_SCHEMA; readonly platform:'Steam'; readonly gameVersion:string;
  readonly privateOnly:true; readonly publicationAuthorized:false;
  readonly sourceSqliteSha256:string; readonly sourceItemsSha256:string;
  readonly tagOriginalSha256:string; readonly sourceFilesSha256:Readonly<Record<string,string>>;
  readonly definitionCount:number; readonly tagDefinitionCount:number;
  readonly taggedDefinitions:number; readonly tagReferenceCount:number;
  readonly byNativeCategory:Readonly<Record<string,number>>;
  readonly facetCoverage:Readonly<Record<string,number>>;
  readonly bucketCount:256; readonly gameUiTaxonomyComplete:false;
  readonly worldAvailabilityVerified:false; readonly dlcOwnershipVerified:false;
  readonly files:Readonly<Record<string,Readonly<{sha256:string;bytes:number;count:number}>>>;
}
export interface Db01FieldCoverage {
  readonly verified:number; readonly unverified:number;
}
export interface Db01ClassificationCoverage {
  readonly totalDefinitions:number;
  readonly anyOriginalTag:Readonly<Db01FieldCoverage>;
  readonly facets:Readonly<Record<Db01TagFacet,Readonly<Db01FieldCoverage>>>;
  readonly gameUiCategory:Readonly<Db01FieldCoverage>;
  readonly dlcOwnership:Readonly<Db01FieldCoverage>;
  readonly worldAvailability:Readonly<Db01FieldCoverage>;
  readonly interpretedSubtype:Readonly<Db01FieldCoverage>;
}
export interface Db01ClassificationClient {
  readonly source:Readonly<Pick<Db01TagManifest,
    'gameVersion'|'sourceItemsSha256'|'sourceSqliteSha256'|'tagOriginalSha256'|
    'definitionCount'|'taggedDefinitions'|'facetCoverage'|'privateOnly'>>;
  getItem(id:number):Promise<Readonly<Db01Classification>|null>;
  getItems(ids:readonly number[]):Promise<readonly (Readonly<Db01Classification>|null)[]>;
  getCoverage():Readonly<Db01ClassificationCoverage>;
}
const SHA=/^[a-f0-9]{64}$/;
const VERSION=/^\d+\.\d+\.\d+$/;
const CAT=/^[A-Za-z][A-Za-z0-9]*$/;
const facetSet=new Set<string>(DB01_TAG_FACETS);
const bucket=(id:number)=>id.toString(16).slice(-2).padStart(2,'0');
const validId=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const key=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&v.trim()===v&&!/[\x00-\x1f]/.test(v);
function check(ok:unknown,reason:string):asserts ok{if(!ok)throw new TypeError('DB01_TAG_'+reason);}
export function validateDb01TagManifest(v:unknown):asserts v is Db01TagManifest{
  check(obj(v),'MANIFEST_REQUIRED');
  check(v.schema===DB01_TAG_SCHEMA&&v.platform==='Steam'&&typeof v.gameVersion==='string'&&
    VERSION.test(v.gameVersion)&&v.privateOnly===true&&v.publicationAuthorized===false&&
    v.bucketCount===256&&v.gameUiTaxonomyComplete===false&&
    v.worldAvailabilityVerified===false&&v.dlcOwnershipVerified===false,'INVALID_SOURCE_CONTRACT');
  check([v.sourceSqliteSha256,v.sourceItemsSha256,v.tagOriginalSha256].every(x=>
    typeof x==='string'&&SHA.test(x)),'SOURCE_SHA_REQUIRED');
  check(Number.isSafeInteger(v.definitionCount)&&Number(v.definitionCount)>0&&
    Number.isSafeInteger(v.tagDefinitionCount)&&Number(v.tagDefinitionCount)>0&&
    Number.isSafeInteger(v.taggedDefinitions)&&Number(v.taggedDefinitions)>=0&&
    Number(v.taggedDefinitions)<=Number(v.definitionCount)&&
    Number.isSafeInteger(v.tagReferenceCount)&&Number(v.tagReferenceCount)>=0,'COUNT');
  check(obj(v.sourceFilesSha256)&&obj(v.byNativeCategory)&&obj(v.facetCoverage)&&obj(v.files),'LEDGER');
  const sourceHashes=v.sourceFilesSha256 as Record<string,unknown>;
  const categories=Object.entries(v.byNativeCategory);
  check(categories.length>0&&categories.length===Object.keys(v.sourceFilesSha256).length&&
    categories.every(([cat,n])=>CAT.test(cat)&&Number.isSafeInteger(n)&&Number(n)>0&&
      typeof sourceHashes[cat]==='string'&&SHA.test(sourceHashes[cat] as string))&&
    categories.reduce((sum,[,n])=>sum+Number(n),0)===v.definitionCount&&
    v.sourceFilesSha256.Tag===v.tagOriginalSha256,'CATEGORY_COUNTS');
  check(Object.entries(v.facetCoverage).every(([name,n])=>
    facetSet.has(name)&&Number.isSafeInteger(n)&&Number(n)>=0&&
    Number(n)<=Number(v.definitionCount)),'FACET_COUNTS');
  const paths=Array.from({length:256},(_,i)=>'id/'+i.toString(16).padStart(2,'0')+'.json');
  check(Object.keys(v.files).length===256&&
    paths.every(path=>Object.prototype.hasOwnProperty.call(v.files,path)),'SHARD_SET');
  let total=0;
  for(const path of paths){
    const meta=v.files[path];
    check(obj(meta)&&typeof meta.sha256==='string'&&SHA.test(meta.sha256)&&
      Number.isSafeInteger(meta.bytes)&&Number(meta.bytes)>=3&&Number(meta.bytes)<16_000_000&&
      Number.isSafeInteger(meta.count)&&Number(meta.count)>=0,'SHARD_META');
    total+=Number(meta.count);
  }
  check(total===v.definitionCount,'SHARD_TOTAL');
}
function validateRow(row:unknown,m:Db01TagManifest,path:string):asserts row is Db01Classification{
  check(obj(row)&&validId(row.itemId)&&bucket(row.itemId)===path.slice(3,5)&&
    typeof row.nativeCategory==='string'&&CAT.test(row.nativeCategory)&&key(row.nativeKey)&&
    row.sourceSha256===m.sourceFilesSha256[row.nativeCategory]&&
    row.wireSubtypeMeaningVerified===false&&row.gameUiCategoryVerified===false&&
    row.dlcOwnershipVerified===false&&row.worldAvailabilityVerified===false&&
    (row.wireSubtypeCode===null||
      (Number.isSafeInteger(row.wireSubtypeCode)&&Number(row.wireSubtypeCode)>=0)),'ROW_IDENTITY');
  check(Array.isArray(row.tagReferences)&&obj(row.facets),'ROW_TAGS');
  const seen=new Set<string>(), groups=new Map<string,string[]>();
  for(const ref of row.tagReferences){
    check(obj(ref)&&validId(ref.tagId)&&key(ref.tagKey)&&
      Number.isInteger(ref.wireField)&&Number(ref.wireField)>0&&
      typeof ref.facet==='string'&&facetSet.has(ref.facet),'TAG_REFERENCE');
    const identity=String(ref.wireField)+':'+String(ref.tagId);
    check(!seen.has(identity),'DUPLICATE_TAG');seen.add(identity);
    if(ref.facet!=='otherTag'){
      const values=groups.get(ref.facet)??[];
      if(!values.includes(ref.tagKey))values.push(ref.tagKey);
      groups.set(ref.facet,values);
    }
  }
  check(Object.keys(row.facets).length===groups.size,'FACET_COUNT');
  for(const [name,values] of groups){
    const provided=row.facets[name];
    check(Array.isArray(provided)&&provided.length===values.length&&
      values.every((tag,i)=>provided[i]===tag),'FACET_MISMATCH');
  }
}
export function createDb01ClassificationClient(raw:unknown,loadBytes:Db01LoadBytes,
  catalog:Db01CatalogClient):Db01ClassificationClient{
  validateDb01TagManifest(raw);
  check(typeof loadBytes==='function'&&catalog?.source?.privateOnly===true&&
    typeof catalog.getItem==='function'&&typeof catalog.getItems==='function'&&
    catalog.source.platform===raw.platform&&catalog.source.gameVersion===raw.gameVersion&&
    catalog.source.sourceItemsSha256===raw.sourceItemsSha256&&
    catalog.source.definitions===raw.definitionCount,'CATALOG_SOURCE_MISMATCH');
  const m:Db01TagManifest=Object.freeze({...raw,
    sourceFilesSha256:Object.freeze({...raw.sourceFilesSha256}),
    byNativeCategory:Object.freeze({...raw.byNativeCategory}),
    facetCoverage:Object.freeze({...raw.facetCoverage}),
    files:Object.freeze(Object.fromEntries(Object.entries(raw.files).map(([p,v])=>
      [p,Object.freeze({...v})]))),
  });
  const cache=new Map<string,Promise<readonly Db01Classification[]>>();
  async function readBucket(path:string):Promise<readonly Db01Classification[]>{
    const existing=cache.get(path);if(existing)return existing;
    const promise=(async()=>{
      const meta=m.files[path];check(meta,'UNKNOWN_ASSET');
      const data=await loadBytes(path);
      const bytes=data instanceof ArrayBuffer?new Uint8Array(data):data;
      check(bytes instanceof Uint8Array&&bytes.byteLength===meta.bytes,'ASSET_SIZE');
      const stable=new Uint8Array(bytes);
      check(globalThis.crypto?.subtle,'SHA_UNAVAILABLE');
      const digest=await crypto.subtle.digest('SHA-256',stable);
      const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      check(hex===meta.sha256,'ASSET_HASH');
      const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(stable));
      check(Array.isArray(value)&&value.length===meta.count,'ASSET_COUNT');
      const seen=new Set<number>();
      for(const row of value){
        validateRow(row,m,path);
        check(!seen.has(row.itemId),'DUPLICATE_ID');seen.add(row.itemId);
        for(const tags of Object.values(row.facets))Object.freeze(tags);
        for(const ref of row.tagReferences)Object.freeze(ref);
        Object.freeze(row.tagReferences);Object.freeze(row.facets);Object.freeze(row);
      }
      return Object.freeze(value) as readonly Db01Classification[];
    })();
    cache.set(path,promise);
    try{return await promise;}catch(error){cache.delete(path);throw error;}
  }
  function matched(base:{itemId:number;nativeCategory:string;nativeKey:string;sourceSha256:string}|null,
    row:Readonly<Db01Classification>|null):void{
    check((base===null)===(row===null)&&
      (base===null||row===null||(base.itemId===row.itemId&&
        base.nativeCategory===row.nativeCategory&&base.nativeKey===row.nativeKey&&
        base.sourceSha256===row.sourceSha256)),'ITEM_IDENTITY_MISMATCH');
  }
  async function getItem(id:number):Promise<Readonly<Db01Classification>|null>{
    check(validId(id),'INVALID_ID');
    const rows=await readBucket('id/'+bucket(id)+'.json');
    const row=rows.find(v=>v.itemId===id)??null;
    matched(await catalog.getItem(id),row);
    return row;
  }
  async function getItems(ids:readonly number[]):Promise<readonly (Readonly<Db01Classification>|null)[]>{
    check(Array.isArray(ids)&&ids.length<=4096&&ids.every(validId),'INVALID_BATCH');
    if(!ids.length)return Object.freeze([]);
    const paths=[...new Set(ids.map(id=>'id/'+bucket(id)+'.json'))];
    const found=new Map<number,Readonly<Db01Classification>>();
    let next=0;
    async function worker():Promise<void>{
      while(next<paths.length){
        const path=paths[next++];
        for(const row of await readBucket(path))found.set(row.itemId,row);
      }
    }
    await Promise.all(Array.from({length:Math.min(8,paths.length)},()=>worker()));
    const result=Object.freeze(ids.map(id=>found.get(id)??null));
    const base=await catalog.getItems(ids);
    check(base.length===result.length,'BASE_LENGTH');
    for(let i=0;i<ids.length;i++)matched(base[i],result[i]);
    return result;
  }
  const coverageFor=(verified:number):Readonly<Db01FieldCoverage>=>Object.freeze({
    verified,unverified:m.definitionCount-verified,
  });
  const facetCoverage=Object.freeze(Object.fromEntries(DB01_TAG_FACETS.map(name=>
    [name,coverageFor(m.facetCoverage[name]??0)]))) as
    Readonly<Record<Db01TagFacet,Readonly<Db01FieldCoverage>>>;
  const unverified=coverageFor(0);
  const coverage:Readonly<Db01ClassificationCoverage>=Object.freeze({
    totalDefinitions:m.definitionCount,anyOriginalTag:coverageFor(m.taggedDefinitions),
    facets:facetCoverage,gameUiCategory:unverified,dlcOwnership:unverified,
    worldAvailability:unverified,interpretedSubtype:unverified,
  });
  return Object.freeze({
    source:Object.freeze({gameVersion:m.gameVersion,sourceItemsSha256:m.sourceItemsSha256,
      sourceSqliteSha256:m.sourceSqliteSha256,tagOriginalSha256:m.tagOriginalSha256,
      definitionCount:m.definitionCount,taggedDefinitions:m.taggedDefinitions,
      facetCoverage:m.facetCoverage,privateOnly:m.privateOnly}),
    getItem,getItems,getCoverage:()=>coverage,
  });
}
