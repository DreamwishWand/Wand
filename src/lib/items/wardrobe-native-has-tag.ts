/**
 * Source-exact original Steam v1.26.2 Clothing, Trimming, Makeup IHasTags.
 * Offline generator SHA-pins three original native itemlists, Tag, Set,
 * and IL2CPP, and emits PRIVATE-only 256-shard data. Never fetch game
 * originals from a public path or bundle generated source shards.
 *
 * All three native item classes implement IHasTags AND IHasSet. Original
 * ItemDataExtensions.HasTag checks direct Tags then SetItemData.Tags.
 * Original CollectionAreaConfig positive Tag matches are source candidates,
 * NOT verified game-screen Collection membership, availability or DLC state.
 * The AllAreas config's native default Item remains unverified and must
 * never be silently treated as a Dreamlight Valley membership match.
 */
import type {Db01CatalogClient,Db01LoadBytes} from './index.ts';
import {
  evaluateOriginalNativeHasTag,
  validateOriginalHasTagItem,
  type Db01NativeHasSetLookup,
  type Db01OriginalHasTagItem,
  type Db01OriginalHasTagResult,
} from './native-has-tag.ts';
import {DB01_COLLECTION_AREA_SOURCE_CONFIGS} from './collection-area-source-config.ts';

export const DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA=
  'wand.db01.original-wardrobe-ihastags-steam-1262@1' as const;
export const DB01_WARDROBE_CATEGORY_SPECS=Object.freeze({
  Clothing:Object.freeze({
    sha256:'a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946',
    originalNativeClass:'ClothingItemData',tagsFieldNumber:9,
    setFieldNumber:8,count:2041,sourcePositiveAreaItems:2041,
  }),
  Trimming:Object.freeze({
    sha256:'a330a5b44860faece7eecb9c07acf3064b15010c97837d9d450f54a7b2ff966c',
    originalNativeClass:'TrimmingItemData',tagsFieldNumber:10,
    setFieldNumber:9,count:365,sourcePositiveAreaItems:365,
  }),
  Makeup:Object.freeze({
    sha256:'ce83251a6ac082690c7a93698fee7526cf465b13a09d9e117d2e158500effe22',
    originalNativeClass:'MakeupItemData',tagsFieldNumber:15,
    setFieldNumber:14,count:69,sourcePositiveAreaItems:0,
  }),
} as const);
export type Db01WardrobeOriginalCategory=
  keyof typeof DB01_WARDROBE_CATEGORY_SPECS;
export type Db01WardrobePositiveAreaCode=1|2|3|4|5|4097;
export const DB01_WARDROBE_POSITIVE_AREA_CENSUS=Object.freeze({
  1:2140,2:19,3:47,4:28,5:137,4097:35,
} as const);
export const DB01_WARDROBE_TAG_SHA256=
  'bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4' as const;
export const DB01_WARDROBE_SET_SHA256=
  '3682f4888244a9a460d08300a00cc873307c9ad3553fb929aaca135efb38708f' as const;
export const DB01_WARDROBE_IL2CPP_SHA256=
  '0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08' as const;

export interface Db01WardrobeOriginalManifest{
  readonly schema:typeof DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA;
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly privateOnly:true;
  readonly publicationAuthorized:false;
  readonly sourceCategorySha256:Readonly<Record<Db01WardrobeOriginalCategory,string>>;
  readonly sourceTagSha256:typeof DB01_WARDROBE_TAG_SHA256;
  readonly sourceSetSha256:typeof DB01_WARDROBE_SET_SHA256;
  readonly sourceIl2cppDumpSha256:typeof DB01_WARDROBE_IL2CPP_SHA256;
  readonly sourceDefinitionCount:2475;
  readonly originalCategoryCounts:Readonly<Record<Db01WardrobeOriginalCategory,number>>;
  readonly bucketCount:256;
  readonly files:Readonly<Record<string,Readonly<{sha256:string;bytes:number;count:number}>>>;
  readonly originalIHasTagsAndIHasSetVerified:true;
  readonly sourceSetReferenceLookupComplete:true;
  readonly sourcePositiveAreaCountsVerified:true;
  readonly nativeAllAreasDefaultTagVerified:false;
  readonly actualCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01WardrobeOriginalRow{
  readonly itemId:number;
  readonly nativeKey:string;
  readonly nativeCategory:Db01WardrobeOriginalCategory;
  readonly originalNativeClass:string;
  readonly tagsFieldNumber:number;
  readonly nativeTags:readonly number[];
  readonly setLookup:Db01NativeHasSetLookup;
  readonly nativeHasTagSchemaVerified:true;
  readonly gameUiCollectionMembershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01WardrobeOriginalItem{
  readonly original:Readonly<Db01WardrobeOriginalRow>;
  readonly input:Readonly<Db01OriginalHasTagItem>;
  /** Six positive static native area predicates, original serialized order;
   * code 0 is NEVER inferred from source Tag IDs. */
  readonly positiveAreaCodes:readonly Db01WardrobePositiveAreaCode[];
  readonly sourceShardHashVerified:true;
  readonly gameUiCollectionMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01WardrobeOriginalCoverage{
  readonly sourceDefinitionCount:2475;
  readonly originalCategoryCounts:Readonly<Record<Db01WardrobeOriginalCategory,number>>;
  readonly sourceResolvedSetItemReferences:2405;
  readonly sourceWithoutSetReference:70;
  readonly positiveAreaItems:2406;
  readonly sourceUnassignedPositiveAreaItems:69;
  readonly positiveAreaByCode:Readonly<Record<number,number>>;
  readonly sourceVerifiedPositiveAreaPredicates:true;
  readonly originalAllAreasDefaultHasTagEvaluated:false;
  readonly runtimeCollectionUiMembershipVerified:false;
}
export interface Db01WardrobeOriginalSearch{
  readonly nativeCategories?:readonly Db01WardrobeOriginalCategory[];
  /** 0 = unfiltered source items, NOT original native code-0 HasTag. */
  readonly areaCodes?:readonly (Db01WardrobePositiveAreaCode|0)[];
  readonly tagIds?:readonly number[];
  readonly tagMatch?:'all'|'any';
  readonly includeInheritedSetTags?:boolean;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01WardrobeOriginalSearchPage{
  readonly itemIds:readonly number[];
  readonly total:number;
  readonly hasMore:boolean;
  readonly sourceNativeHasTagMatchesOnly:true;
  readonly actualCollectionUiMembershipVerified:false;
  readonly allAreasDefaultNativePredicateEvaluated:false;
  readonly playerEntitlementVerified:false;
}
export interface Db01WardrobeOriginalClient{
  readonly schema:typeof DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA;
  readonly gameVersion:'1.26.2';
  getItem(id:number):Promise<Readonly<Db01WardrobeOriginalItem>|null>;
  getItems(ids:readonly number[]):
    Promise<readonly (Readonly<Db01WardrobeOriginalItem>|null)[]>;
  hasTag(id:number,tagId:number):Promise<Readonly<Db01OriginalHasTagResult>|null>;
  getCoverage():Promise<Readonly<Db01WardrobeOriginalCoverage>>;
  search(query?:Db01WardrobeOriginalSearch):
    Promise<Readonly<Db01WardrobeOriginalSearchPage>>;
}

const specs:Readonly<Record<string,Readonly<{
  sha256:string;originalNativeClass:string;
  tagsFieldNumber:number;setFieldNumber:number;
  count:number;sourcePositiveAreaItems:number;
}>>>=DB01_WARDROBE_CATEGORY_SPECS;
const categories=new Set<string>(Object.keys(specs));
const positiveConfigs=DB01_COLLECTION_AREA_SOURCE_CONFIGS
  .filter(c=>c.gameplayTagId>0);
const areaCodes=new Set<number>(positiveConfigs.map(c=>c.areaCode));
const sha=/^[a-f0-9]{64}$/;
const obj=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v);
const positive=(v:unknown):v is number=>integer(v)&&v>0;
const nonnegative=(v:unknown):v is number=>integer(v)&&v>=0;
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB01_WARDROBE_ORIGINAL_'+reason);
}
function shard(id:number):string{
  return 'id/'+(id%256).toString(16).padStart(2,'0')+'.json';
}
check(positiveConfigs.length===6&&
  DB01_COLLECTION_AREA_SOURCE_CONFIGS.length===7&&
  DB01_COLLECTION_AREA_SOURCE_CONFIGS[6].areaCode===0&&
  DB01_COLLECTION_AREA_SOURCE_CONFIGS[6].gameplayTagId===0&&
  Object.values(DB01_WARDROBE_POSITIVE_AREA_CENSUS).reduce(
    (sum,n)=>sum+n,0)===2406,
  'ORIGINAL_SOURCE_AREA_CONFIG_DRIFT');

export function validateDb01WardrobeOriginalManifest(
  raw:unknown,
):asserts raw is Db01WardrobeOriginalManifest{
  check(obj(raw),'MANIFEST_REQUIRED');
  check(raw.schema===DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA&&
    raw.platform==='Steam'&&raw.gameVersion==='1.26.2'&&
    raw.privateOnly===true&&raw.publicationAuthorized===false&&
    raw.sourceTagSha256===DB01_WARDROBE_TAG_SHA256&&
    raw.sourceSetSha256===DB01_WARDROBE_SET_SHA256&&
    raw.sourceIl2cppDumpSha256===DB01_WARDROBE_IL2CPP_SHA256&&
    raw.sourceDefinitionCount===2475&&raw.bucketCount===256&&
    raw.originalIHasTagsAndIHasSetVerified===true&&
    raw.sourceSetReferenceLookupComplete===true&&
    raw.sourcePositiveAreaCountsVerified===true&&
    raw.nativeAllAreasDefaultTagVerified===false&&
    raw.actualCollectionUiMembershipVerified===false&&
    raw.playerOwnershipVerified===false&&
    raw.dlcEntitlementVerified===false,
    'UNTRUSTED_ORIGINAL_SOURCE_CONTRACT');
  const categoryHashes=raw.sourceCategorySha256;
  const categoryCounts=raw.originalCategoryCounts;
  check(obj(categoryHashes)&&obj(categoryCounts)&&
    Object.keys(categoryHashes).length===3&&
    Object.keys(categoryCounts).length===3&&
    [...categories].every(k=>
      categoryHashes[k]===specs[k].sha256&&
      categoryCounts[k]===specs[k].count),
    'ORIGINAL_CATEGORY_SOURCE_CENSUS');
  const ledger=raw.files;
  check(obj(ledger)&&Object.keys(ledger).length===256,
    'SOURCE_SHARD_LEDGER_REQUIRED');
  let count=0;
  for(let i=0;i<256;i++){
    const key='id/'+i.toString(16).padStart(2,'0')+'.json';
    const meta=ledger[key];
    check(obj(meta)&&typeof meta.sha256==='string'&&
      sha.test(meta.sha256)&&nonnegative(meta.count)&&
      nonnegative(meta.bytes)&&meta.bytes>=3&&meta.bytes<10_000_000,
      'SOURCE_SHARD_META_INVALID');
    count+=meta.count;
  }
  check(count===2475,'SOURCE_SHARD_CENSUS_DRIFT');
}

function validateRow(value:unknown,path:string):Readonly<Db01WardrobeOriginalRow>{
  check(obj(value)&&positive(value.itemId)&&
    shard(value.itemId)===path&&
    typeof value.nativeKey==='string'&&
    value.nativeKey.trim()===value.nativeKey&&
    value.nativeKey.length>0&&value.nativeKey.length<=256&&
    !/[\x00-\x1f]/.test(value.nativeKey)&&
    typeof value.nativeCategory==='string'&&
    categories.has(value.nativeCategory)&&
    value.nativeHasTagSchemaVerified===true&&
    value.gameUiCollectionMembershipVerified===false&&
    value.dlcEntitlementVerified===false,
    'INVALID_ORIGINAL_SOURCE_ROW');
  const spec=specs[value.nativeCategory as string];
  check(value.originalNativeClass===spec.originalNativeClass&&
    value.tagsFieldNumber===spec.tagsFieldNumber&&
    Array.isArray(value.nativeTags)&&
    value.nativeTags.length>0&&
    value.nativeTags.length<=10000&&
    value.nativeTags.every(positive)&&
    new Set(value.nativeTags).size===value.nativeTags.length,
    'WRONG_ORIGINAL_NATIVE_TAG_FIELD');
  const set=value.setLookup;
  check(obj(set)&&set.kind==='has_set'&&
    nonnegative(set.setItemId)&&obj(set.definition),
    'ORIGINAL_IHASSET_REQUIRED');
  if(set.setItemId===0){
    check(set.definition.kind==='missing_original_set_definition',
      'SOURCE_ZERO_SET_LOOKUP');
  }else{
    check(set.definition.kind==='original_set_definition'&&
      set.definition.itemId===set.setItemId&&
      Array.isArray(set.definition.nativeTags)&&
      set.definition.nativeTags.every(positive)&&
      new Set(set.definition.nativeTags).size===
        set.definition.nativeTags.length,
      'SOURCE_SET_REFERENCE_INCOMPLETE');
    Object.freeze(set.definition.nativeTags);
  }
  Object.freeze(value.nativeTags);
  Object.freeze(set.definition);
  Object.freeze(set);
  const row=value as unknown as Db01WardrobeOriginalRow;
  validateOriginalHasTagItem({
    itemId:row.itemId,gameVersion:'1.26.2',
    nativeTags:row.nativeTags,setLookup:row.setLookup,
  });
  return Object.freeze(row);
}

function nativeAreas(item:Db01OriginalHasTagItem):
  readonly Db01WardrobePositiveAreaCode[]{
  const effective=new Set(item.nativeTags);
  if(item.setLookup.kind==='has_set'&&
    item.setLookup.definition.kind==='original_set_definition'){
    for(const t of item.setLookup.definition.nativeTags)effective.add(t);
  }
  const matches=positiveConfigs.filter(c=>
    effective.has(c.gameplayTagId));
  check(matches.length<=1,'MULTIPLE_ORIGINAL_POSITIVE_AREAS');
  return Object.freeze(matches.map(c=>
    c.areaCode as Db01WardrobePositiveAreaCode));
}

function selection(input:Db01WardrobeOriginalSearch){
  check(obj(input),'INVALID_SEARCH');
  const selectedCategories=input.nativeCategories??[...categories] as
    Db01WardrobeOriginalCategory[];
  check(Array.isArray(selectedCategories)&&selectedCategories.length<=3&&
    selectedCategories.every(x=>categories.has(x))&&
    new Set(selectedCategories).size===selectedCategories.length,
    'UNKNOWN_NATIVE_SOURCE_CATEGORY');
  const selectedAreas=input.areaCodes??[0] as const;
  check(Array.isArray(selectedAreas)&&selectedAreas.length>=1&&
    selectedAreas.length<=6&&
    selectedAreas.every(x=>x===0||areaCodes.has(x))&&
    new Set(selectedAreas).size===selectedAreas.length&&
    (!selectedAreas.includes(0)||selectedAreas.length===1),
    'UNKNOWN_OR_AMBIGUOUS_AREA_CODES');
  const tags=input.tagIds??[];
  check(Array.isArray(tags)&&tags.length<=256&&tags.every(positive)&&
    new Set(tags).size===tags.length,
    'INVALID_SOURCE_TAG_FILTER');
  const match=input.tagMatch??'any',inherited=input.includeInheritedSetTags??true;
  check((match==='all'||match==='any')&&typeof inherited==='boolean',
    'INVALID_SOURCE_TAG_OPTIONS');
  const offset=input.offset??0,limit=input.limit??100;
  check(nonnegative(offset)&&offset<=1_000_000&&
    nonnegative(limit)&&limit<=1000,'INVALID_PAGING');
  return {categories:new Set(selectedCategories),
    areas:new Set(selectedAreas),tags,match,inherited,offset,limit};
}

export function createDb01WardrobeOriginalClient(
  manifest:unknown,loadBytes:Db01LoadBytes,catalog:Db01CatalogClient,
):Db01WardrobeOriginalClient{
  validateDb01WardrobeOriginalManifest(manifest);
  check(typeof loadBytes==='function'&&
    catalog?.source?.platform==='Steam'&&
    catalog.source.gameVersion==='1.26.2'&&
    catalog.source.privateOnly===true&&
    catalog.source.fullCorpusParsed===true&&
    typeof catalog.getItem==='function'&&
    typeof catalog.getItems==='function'&&
    typeof catalog.getCategory==='function',
    'PINNED_PRIVATE_DB01_CATALOG_REQUIRED');
  const m=manifest;
  const bucketCache=new Map<string,Promise<readonly Readonly<Db01WardrobeOriginalRow>[]>>();
  async function bucket(path:string){
    const cached=bucketCache.get(path);
    if(cached)return cached;
    const task=(async()=>{
      const metadata=m.files[path];
      check(!!metadata,'SOURCE_SHARD_PATH_UNKNOWN');
      const payload=await loadBytes(path);
      const bytes=payload instanceof ArrayBuffer?
        new Uint8Array(payload):payload;
      check(bytes instanceof Uint8Array&&bytes.byteLength===metadata.bytes,
        'SOURCE_SHARD_BYTES');
      const snapshot=new Uint8Array(bytes);
      check(!!globalThis.crypto?.subtle,
        'SHA256_UNAVAILABLE');
      const hash=Array.from(new Uint8Array(
        await crypto.subtle.digest('SHA-256',snapshot)),n=>
          n.toString(16).padStart(2,'0')).join('');
      check(hash===metadata.sha256,'SOURCE_SHARD_SHA256');
      const decoded:unknown=JSON.parse(
        new TextDecoder('utf-8',{fatal:true}).decode(snapshot));
      check(Array.isArray(decoded)&&decoded.length===metadata.count,
        'SOURCE_SHARD_ROW_COUNT');
      const seen=new Set<number>();
      return Object.freeze(decoded.map(value=>{
        const row=validateRow(value,path);
        check(!seen.has(row.itemId),'DUPLICATE_ORIGINAL_ITEM_ID');
        seen.add(row.itemId);
        return row;
      }));
    })();
    bucketCache.set(path,task);
    try{return await task;}
    catch(error){bucketCache.delete(path);throw error;}
  }
  async function getItems(ids:readonly number[]):
    Promise<readonly (Readonly<Db01WardrobeOriginalItem>|null)[]>{
    check(Array.isArray(ids)&&ids.length<=4096&&ids.every(positive),
      'INVALID_ITEM_BATCH');
    if(!ids.length)return Object.freeze([]);
    const paths=[...new Set(ids.map(shard))];
    const found=new Map<number,Readonly<Db01WardrobeOriginalRow>>();
    let cursor=0;
    async function worker(){
      while(cursor<paths.length){
        const path=paths[cursor++];
        for(const row of await bucket(path))found.set(row.itemId,row);
      }
    }
    await Promise.all(Array.from({length:Math.min(paths.length,8)},worker));
    const [rows]=await Promise.all([catalog.getItems(ids)]);
    check(rows.length===ids.length,'DB01_CATALOG_BATCH_LENGTH');
    return Object.freeze(ids.map((id,index)=>{
      const original=found.get(id)??null;
      if(!original)return null;
      const item=rows[index];
      check(item?.catalogDomain==='item'&&
        item.itemId===id&&
        item.nativeCategory===original.nativeCategory&&
        item.nativeKey===original.nativeKey&&
        item.sourceSha256===
          specs[original.nativeCategory].sha256,
        'DB01_CATALOG_ORIGINAL_ITEM_IDENTITY');
      const input=Object.freeze({
        itemId:id,gameVersion:'1.26.2' as const,
        nativeTags:original.nativeTags,setLookup:original.setLookup,
      });
      return Object.freeze({
        original,input,positiveAreaCodes:nativeAreas(input),
        sourceShardHashVerified:true as const,
        gameUiCollectionMembershipVerified:false as const,
        worldAvailabilityVerified:false as const,
        dlcEntitlementVerified:false as const,
      });
    }));
  }
  async function getItem(id:number){
    check(positive(id),'INVALID_ITEM_ID');
    return (await getItems([id]))[0]??null;
  }
  async function hasTag(id:number,tagId:number){
    check(nonnegative(tagId),'INVALID_TAG_ID');
    const item=await getItem(id);
    return item?evaluateOriginalNativeHasTag(item.input,tagId):null;
  }
  type Indexed=Readonly<{
    byId:ReadonlyMap<number,Readonly<Db01WardrobeOriginalItem>>;
    sorted:readonly number[];
    coverage:Readonly<Db01WardrobeOriginalCoverage>;
  }>;
  let task:Promise<Indexed>|null=null;
  async function build():Promise<Indexed>{
    const familyRows=await Promise.all(
      [...categories].map(category=>catalog.getCategory(category)));
    const canonical=familyRows.flat();
    check(canonical.length===2475,'CATALOG_NATIVE_ITEM_CENSUS');
    const byId=new Map<number,Readonly<Db01WardrobeOriginalItem>>();
    const byCategory=new Map<Db01WardrobeOriginalCategory,number>();
    const byArea=new Map<number,number>();
    let setCount=0,noSetCount=0,positiveCount=0;
    for(let i=0;i<canonical.length;i+=512){
      const base=canonical.slice(i,i+512);
      const source=await getItems(base.map(x=>x.itemId));
      check(source.length===base.length,'MISSING_SOURCE_BATCH');
      for(let j=0;j<base.length;j++){
        const actual=source[j];
        const item=base[j];
        check(actual&&actual.original.itemId===item.itemId&&
          actual.original.nativeKey===item.nativeKey&&
          !byId.has(item.itemId),
          'SOURCE_ITEM_ID_MISMATCH');
        byId.set(item.itemId,actual);
        const cat=actual.original.nativeCategory;
        byCategory.set(cat,(byCategory.get(cat)??0)+1);
        const set=actual.original.setLookup;
        check(set.kind==='has_set','NATIVE_IHASSET_REQUIRED');
        setCount+=Number(set.setItemId>0);
        noSetCount+=Number(set.setItemId===0);
        positiveCount+=Number(actual.positiveAreaCodes.length>0);
        for(const code of actual.positiveAreaCodes){
          byArea.set(code,(byArea.get(code)??0)+1);
        }
      }
    }
    check(byId.size===2475&&setCount===2405&&noSetCount===70&&
      positiveCount===2406&&
      [...categories].every(category=>
        byCategory.get(category as Db01WardrobeOriginalCategory)===
          specs[category].count)&&
      positiveConfigs.every(c=>
        (byArea.get(c.areaCode)??0)===
          DB01_WARDROBE_POSITIVE_AREA_CENSUS[
            c.areaCode as Db01WardrobePositiveAreaCode]),
      'SOURCE_CENSUS_VERSION_OR_TAG_DRIFT');
    const coverage=Object.freeze({
      sourceDefinitionCount:2475 as const,
      originalCategoryCounts:Object.freeze(Object.fromEntries(
        [...byCategory]) as Record<Db01WardrobeOriginalCategory,number>),
      sourceResolvedSetItemReferences:2405 as const,
      sourceWithoutSetReference:70 as const,
      positiveAreaItems:2406 as const,
      sourceUnassignedPositiveAreaItems:69 as const,
      positiveAreaByCode:Object.freeze(Object.fromEntries(
        positiveConfigs.map(c=>[c.areaCode,byArea.get(c.areaCode)??0]))),
      sourceVerifiedPositiveAreaPredicates:true as const,
      originalAllAreasDefaultHasTagEvaluated:false as const,
      runtimeCollectionUiMembershipVerified:false as const,
    });
    return Object.freeze({
      byId,sorted:Object.freeze([...byId.keys()].sort((a,b)=>a-b)),
      coverage,
    });
  }
  function index(){
    if(!task)task=build().catch(e=>{task=null;throw e;});
    return task;
  }
  async function search(query:Db01WardrobeOriginalSearch={}){
    const parsed=selection(query);
    const current=await index();
    const found:number[]=[];
    let total=0;
    for(const id of current.sorted){
      const row=current.byId.get(id)!;
      if(!parsed.categories.has(row.original.nativeCategory))continue;
      if(!parsed.areas.has(0)&&
        !row.positiveAreaCodes.some(c=>parsed.areas.has(c)))continue;
      if(parsed.tags.length){
        const effective=new Set(row.input.nativeTags);
        if(parsed.inherited&&row.input.setLookup.kind==='has_set'&&
          row.input.setLookup.definition.kind==='original_set_definition'){
          for(const tag of row.input.setLookup.definition.nativeTags){
            effective.add(tag);
          }
        }
        const matches=parsed.match==='all'?
          parsed.tags.every(t=>effective.has(t)):
          parsed.tags.some(t=>effective.has(t));
        if(!matches)continue;
      }
      if(total>=parsed.offset&&found.length<parsed.limit)found.push(id);
      total++;
    }
    return Object.freeze({
      itemIds:Object.freeze(found),
      total,
      hasMore:total>parsed.offset+found.length,
      sourceNativeHasTagMatchesOnly:true as const,
      actualCollectionUiMembershipVerified:false as const,
      allAreasDefaultNativePredicateEvaluated:false as const,
      playerEntitlementVerified:false as const,
    });
  }
  return Object.freeze({
    schema:DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA,
    gameVersion:'1.26.2',
    getItem,getItems,hasTag,
    getCoverage:async()=>(await index()).coverage,search,
  });
}
