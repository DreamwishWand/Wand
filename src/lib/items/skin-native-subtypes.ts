/**
 * SHA-verified PRIVATE original Steam 1.26.2 Skin 163-record source reader.
 *
 * Seven source protobuf layouts are identified by independently verified
 * same-version field contracts + original disjoint item ID bands. Original
 * framed protobuf does NOT serialize a class name: type is SOURCE LAYOUT,
 * NOT independently verified runtime object instance identity.
 *
 * CharacterSkin/BuildingOther/Stall/SceneAssets/House implement IHasTags;
 * MountSkin and BoatSkin (4 records) do NOT. No Skin class implements
 * IHasSet. No game Collection UI, DLC rights or world availability inferred.
 */
import type {Db01CatalogClient,Db01LoadBytes} from './index.ts';
import {
  evaluateOriginalNativeHasTag,
  type Db01OriginalHasTagResult,
} from './native-has-tag.ts';
import {DB01_COLLECTION_AREA_SOURCE_CONFIGS} from './collection-area-source-config.ts';

export const DB01_ORIGINAL_SKIN_NATIVE_SCHEMA =
  'wand.db01.original-skin-subtypes-steam-1262@1' as const;
export const DB01_ORIGINAL_SKIN_SHA256 =
  'c557b76c8a762afb3d6cdd66e9c6ced22e7d863ff3dc7426f8f9aff3939e6371' as const;
export const DB01_ORIGINAL_SKIN_TAG_SHA256 =
  'bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4' as const;
export const DB01_ORIGINAL_SKIN_IL2CPP_SHA256 =
  '0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08' as const;

export const DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS=Object.freeze({
  CharacterSkinItemData:Object.freeze({sourceIdBand:1700,tagsFieldNumber:11,count:91}),
  StallSkinItemData:Object.freeze({sourceIdBand:1701,tagsFieldNumber:18,count:15}),
  BuildingOtherSkinItemData:Object.freeze({sourceIdBand:1702,tagsFieldNumber:18,count:32}),
  SceneAssetsSkinItemData:Object.freeze({sourceIdBand:1703,tagsFieldNumber:18,count:9}),
  MountSkinItemData:Object.freeze({sourceIdBand:1704,tagsFieldNumber:null,count:1}),
  BoatSkinItemData:Object.freeze({sourceIdBand:1705,tagsFieldNumber:null,count:3}),
  HouseSkinItemData:Object.freeze({sourceIdBand:1706,tagsFieldNumber:18,count:12}),
} as const);
export const DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS=Object.freeze({
  1:5,2:3,3:3,4:1,5:2,4097:7,
} as const);
export type Db01SkinSourceProtobufClass=
  keyof typeof DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS;
export type Db01SkinPositiveAreaCode=1|2|3|4|5|4097;

export interface Db01OriginalSkinManifest{
  readonly schema:typeof DB01_ORIGINAL_SKIN_NATIVE_SCHEMA;
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly privateOnly:true;
  readonly publicationAuthorized:false;
  readonly sourceSkinSha256:typeof DB01_ORIGINAL_SKIN_SHA256;
  readonly sourceTagSha256:typeof DB01_ORIGINAL_SKIN_TAG_SHA256;
  readonly sourceIl2cppDumpSha256:typeof DB01_ORIGINAL_SKIN_IL2CPP_SHA256;
  readonly sourceDefinitionCount:163;
  readonly originalSourceProtobufClassCounts:
    Readonly<Record<Db01SkinSourceProtobufClass,number>>;
  readonly originalSourcePositiveAreaCounts:Readonly<Record<string,number>>;
  readonly nativeIHasTagsAndSetInterfacesVerified:true;
  readonly nativeRuntimeObjectTypeIndependentlyVerified:false;
  readonly nativeAllAreasDefaultPredicateVerified:false;
  readonly actualCollectionUiMembershipVerified:false;
  readonly playerEntitlementVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly bucketCount:256;
  readonly files:Readonly<Record<string,Readonly<{
    sha256:string;bytes:number;count:number;
  }>>>;
}
export interface Db01OriginalSkinRow{
  readonly itemId:number;
  readonly nativeKey:string;
  readonly nativeCategory:'Skin';
  readonly sourceIdBand:number;
  readonly sourceProtobufClass:Db01SkinSourceProtobufClass;
  readonly tagsFieldNumber:11|18|null;
  /** null = no native IHasTags interface. [] = genuine empty source Tags. */
  readonly nativeTags:readonly number[]|null;
  readonly originalIHasTagsInterface:boolean;
  readonly originalIHasSetInterface:false;
  readonly sourceSubtypeLayoutVerified:true;
  readonly nativeRuntimeObjectTypeIndependentlyVerified:false;
  readonly actualCollectionUiMembershipVerified:false;
  readonly nativeAllAreasDefaultPredicateVerified:false;
  readonly playerEntitlementVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01OriginalSkinItem{
  readonly source:Readonly<Db01OriginalSkinRow>;
  readonly positiveNativeAreaCodes:readonly Db01SkinPositiveAreaCode[]|null;
  readonly sourceNativeTagState:
    'positive_native_tag'|'no_positive_native_tag'|'not_ihas_tags';
  readonly originalSourceHashVerified:true;
  readonly originalSourceLayoutVerified:true;
  readonly gameCollectionUiMembershipVerified:false;
  readonly runtimeNativeClassIndependentlyVerified:false;
  readonly nativeAllAreasDefaultVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db01OriginalSkinNoHasTag{
  readonly kind:'no_native_ihas_tags';
  readonly itemId:number;
  readonly sourceProtobufClass:'MountSkinItemData'|'BoatSkinItemData';
  readonly originalSourceLayoutVerified:true;
  readonly nativeRuntimeClassIndependentlyVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
}
export interface Db01OriginalSkinCoverage{
  readonly originalSourceDefinitions:163;
  readonly originalSubtypeCounts:Readonly<Record<Db01SkinSourceProtobufClass,number>>;
  readonly sourceWithDirectTags:71;
  readonly sourceWithPositiveAreaTag:21;
  readonly sourceIHasTagsWithoutPositiveArea:138;
  readonly sourceWithoutIHasTagsInterface:4;
  readonly sourcePositiveAreasByCode:Readonly<Record<number,number>>;
  readonly nativeSourceLayoutVerified:true;
  readonly nativeRuntimeClassIndependentlyVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly allAreasNativeDefaultVerified:false;
}
export interface Db01OriginalSkinQuery{
  readonly sourceProtobufClasses?:readonly Db01SkinSourceProtobufClass[];
  readonly areaCodes?:readonly (Db01SkinPositiveAreaCode|0)[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01OriginalSkinPage{
  readonly itemIds:readonly number[];
  readonly total:number;
  readonly hasMore:boolean;
  readonly originalSourceOnly:true;
  readonly untaggedClassesExcludedOnlyFromPositiveTagQuery:true;
  readonly gameCollectionUiMembershipVerified:false;
  readonly allAreasNativeDefaultVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01OriginalSkinClient{
  readonly schema:typeof DB01_ORIGINAL_SKIN_NATIVE_SCHEMA;
  readonly gameVersion:'1.26.2';
  getItem(id:number):Promise<Readonly<Db01OriginalSkinItem>|null>;
  getItems(ids:readonly number[]):Promise<
    readonly (Readonly<Db01OriginalSkinItem>|null)[]>;
  hasTag(id:number,tagId:number):Promise<
    Readonly<Db01OriginalHasTagResult>|Readonly<Db01OriginalSkinNoHasTag>|null>;
  getCoverage():Promise<Readonly<Db01OriginalSkinCoverage>>;
  search(query?:Db01OriginalSkinQuery):
    Promise<Readonly<Db01OriginalSkinPage>>;
}

const layouts:Readonly<Record<string,Readonly<{
  sourceIdBand:number;tagsFieldNumber:number|null;count:number;
}>>>=DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS;
const known=new Set<string>(Object.keys(layouts));
const originalClasses=Object.keys(layouts) as Db01SkinSourceProtobufClass[];
const positiveAreaConfigs=DB01_COLLECTION_AREA_SOURCE_CONFIGS
  .filter(c=>c.gameplayTagId>0);
const positiveCodes=new Set<number>(positiveAreaConfigs.map(x=>x.areaCode));
const obj=(x:unknown):x is Record<string,unknown>=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const integer=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x);
const positive=(x:unknown):x is number=>integer(x)&&x>0;
const nonnegative=(x:unknown):x is number=>integer(x)&&x>=0;
const hash=/^[0-9a-f]{64}$/;
function check(condition:unknown,reason:string):asserts condition{
  if(!condition)throw new TypeError('DB01_SKIN_SOURCE_'+reason);
}
function shard(id:number){
  return 'id/'+(id%256).toString(16).padStart(2,'0')+'.json';
}
check(originalClasses.length===7&&
  Object.values(layouts).reduce((n,x)=>n+x.count,0)===163&&
  positiveAreaConfigs.length===6&&
  Object.values(DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS)
    .reduce((a,b)=>a+b,0)===21,
  'PINNED_ORIGINAL_CLASS_OR_AREA_STATIC_CENSUS');

export function validateDb01OriginalSkinManifest(
  raw:unknown,
):asserts raw is Db01OriginalSkinManifest{
  check(obj(raw),'MANIFEST_REQUIRED');
  check(raw.schema===DB01_ORIGINAL_SKIN_NATIVE_SCHEMA&&
    raw.platform==='Steam'&&raw.gameVersion==='1.26.2'&&
    raw.privateOnly===true&&raw.publicationAuthorized===false&&
    raw.sourceSkinSha256===DB01_ORIGINAL_SKIN_SHA256&&
    raw.sourceTagSha256===DB01_ORIGINAL_SKIN_TAG_SHA256&&
    raw.sourceIl2cppDumpSha256===DB01_ORIGINAL_SKIN_IL2CPP_SHA256&&
    raw.sourceDefinitionCount===163&&raw.bucketCount===256&&
    raw.nativeIHasTagsAndSetInterfacesVerified===true&&
    raw.nativeRuntimeObjectTypeIndependentlyVerified===false&&
    raw.nativeAllAreasDefaultPredicateVerified===false&&
    raw.actualCollectionUiMembershipVerified===false&&
    raw.playerEntitlementVerified===false&&
    raw.dlcEntitlementVerified===false,
    'ORIGINAL_MANIFEST_CONTRACT');
  const classCounts=raw.originalSourceProtobufClassCounts;
  check(obj(classCounts)&&Object.keys(classCounts).length===7&&
    originalClasses.every(c=>classCounts[c]===layouts[c].count),
    'ORIGINAL_SOURCE_SUBTYPE_CENSUS');
  const areaCounts=raw.originalSourcePositiveAreaCounts;
  check(obj(areaCounts)&&Object.keys(areaCounts).length===6&&
    positiveAreaConfigs.every(c=>areaCounts[String(c.areaCode)]===
      DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS[
        c.areaCode as Db01SkinPositiveAreaCode]),
    'ORIGINAL_POSITIVE_AREA_CENSUS');
  const files=raw.files;
  check(obj(files)&&Object.keys(files).length===256,
    'ORIGINAL_SOURCE_SHARD_LEDGER');
  let count=0;
  for(let i=0;i<256;i++){
    const key='id/'+i.toString(16).padStart(2,'0')+'.json';
    const meta=files[key];
    check(obj(meta)&&typeof meta.sha256==='string'&&
      hash.test(meta.sha256)&&nonnegative(meta.bytes)&&
      meta.bytes>=3&&meta.bytes<=10_000_000&&
      nonnegative(meta.count),
      'INVALID_SOURCE_SHARD_LEDGER');
    count+=meta.count;
  }
  check(count===163,'ORIGINAL_SOURCE_SHARD_TOTAL');
}
function validateRow(input:unknown,path:string):Readonly<Db01OriginalSkinRow>{
  check(obj(input)&&positive(input.itemId)&&
    shard(input.itemId)===path&&
    typeof input.nativeKey==='string'&&
    input.nativeKey.length>0&&input.nativeKey.length<=256&&
    input.nativeKey.trim()===input.nativeKey&&
    !/[\x00-\x1f]/.test(input.nativeKey)&&
    input.nativeCategory==='Skin'&&
    typeof input.sourceProtobufClass==='string'&&
    known.has(input.sourceProtobufClass)&&
    input.sourceSubtypeLayoutVerified===true&&
    input.nativeRuntimeObjectTypeIndependentlyVerified===false&&
    input.actualCollectionUiMembershipVerified===false&&
    input.nativeAllAreasDefaultPredicateVerified===false&&
    input.playerEntitlementVerified===false&&
    input.dlcEntitlementVerified===false&&
    input.originalIHasSetInterface===false,
    'UNTRUSTED_SOURCE_ROW');
  const layout=layouts[input.sourceProtobufClass as string];
  check(input.sourceIdBand===layout.sourceIdBand&&
    Math.floor(input.itemId/100_000)===layout.sourceIdBand&&
    input.tagsFieldNumber===layout.tagsFieldNumber&&
    input.originalIHasTagsInterface===
      (layout.tagsFieldNumber!==null),
    'SOURCE_NATIVE_CLASS_LAYOUT_MISMATCH');
  if(layout.tagsFieldNumber===null){
    check(input.nativeTags===null,
      'NON_IHAS_TAGS_MUST_NOT_HAVE_TAGS');
  }else{
    check(Array.isArray(input.nativeTags)&&
      input.nativeTags.length<=10000&&
      input.nativeTags.every(positive)&&
      new Set(input.nativeTags).size===input.nativeTags.length,
      'SOURCE_ORIGINAL_TAG_FIELD_INVALID');
    Object.freeze(input.nativeTags);
  }
  return Object.freeze(input as unknown as Db01OriginalSkinRow);
}
function rowAreas(row:Db01OriginalSkinRow):
  readonly Db01SkinPositiveAreaCode[]|null{
  if(row.nativeTags===null)return null;
  const matched=positiveAreaConfigs.filter(x=>
    row.nativeTags!.includes(x.gameplayTagId))
    .map(x=>x.areaCode as Db01SkinPositiveAreaCode);
  check(matched.length<=1,'MULTIPLE_NATIVE_POSITIVE_TAGS');
  return Object.freeze(matched);
}
function query(input:Db01OriginalSkinQuery){
  check(obj(input),'INVALID_QUERY');
  const kinds=input.sourceProtobufClasses??originalClasses;
  const areas=input.areaCodes??[0];
  const offset=input.offset??0,limit=input.limit??100;
  check(Array.isArray(kinds)&&kinds.length<=7&&
    kinds.every(c=>known.has(c))&&
    new Set(kinds).size===kinds.length,
    'INVALID_ORIGINAL_SOURCE_CLASSES');
  check(Array.isArray(areas)&&areas.length>0&&areas.length<=6&&
    areas.every(a=>a===0||positiveCodes.has(a))&&
    new Set(areas).size===areas.length&&
    (!areas.includes(0)||areas.length===1),
    'INVALID_POSITIVE_OR_UNFILTERED_AREA');
  check(nonnegative(offset)&&offset<=1_000_000&&
    nonnegative(limit)&&limit<=1000,'INVALID_PAGING');
  return {classes:new Set<string>(kinds),areas,
    offset,limit};
}

export function createDb01OriginalSkinClient(
  manifest:unknown,loadBytes:Db01LoadBytes,catalog:Db01CatalogClient,
):Db01OriginalSkinClient{
  validateDb01OriginalSkinManifest(manifest);
  check(typeof loadBytes==='function'&&
    catalog?.source?.platform==='Steam'&&
    catalog.source.gameVersion==='1.26.2'&&
    catalog.source.privateOnly===true&&
    catalog.source.fullCorpusParsed===true&&
    typeof catalog.getCategory==='function'&&
    typeof catalog.getItems==='function',
    'PINNED_SOURCE_CATALOG_REQUIRED');
  const m=manifest;
  const cache=new Map<string,Promise<readonly Readonly<Db01OriginalSkinRow>[]>>();
  async function readBucket(path:string){
    const existing=cache.get(path);
    if(existing)return existing;
    const task=(async()=>{
      const entry=m.files[path];
      check(entry!==undefined,'UNKNOWN_SOURCE_SHARD');
      const raw=await loadBytes(path);
      const buffer=raw instanceof ArrayBuffer?new Uint8Array(raw):raw;
      check(buffer instanceof Uint8Array&&buffer.byteLength===entry.bytes,
        'ORIGINAL_SHARD_SIZE');
      const bytes=new Uint8Array(buffer);
      check(!!globalThis.crypto?.subtle,'DIGEST_UNAVAILABLE');
      const digest=Array.from(new Uint8Array(
        await crypto.subtle.digest('SHA-256',bytes)),
      x=>x.toString(16).padStart(2,'0')).join('');
      check(digest===entry.sha256,'ORIGINAL_SHARD_SHA256');
      const parsed:unknown=JSON.parse(
        new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      check(Array.isArray(parsed)&&parsed.length===entry.count,
        'ORIGINAL_SHARD_ROW_COUNT');
      const seen=new Set<number>();
      return Object.freeze(parsed.map(row=>{
        const source=validateRow(row,path);
        check(!seen.has(source.itemId),'DUPLICATE_ORIGINAL_ID');
        seen.add(source.itemId);
        return source;
      }));
    })();
    cache.set(path,task);
    try{return await task;}
    catch(error){cache.delete(path);throw error;}
  }
  async function getItems(ids:readonly number[]):
    Promise<readonly (Readonly<Db01OriginalSkinItem>|null)[]>{
    check(Array.isArray(ids)&&ids.length<=4096&&ids.every(positive),
      'INVALID_SOURCE_ITEM_BATCH');
    if(!ids.length)return Object.freeze([]);
    const paths=[...new Set(ids.map(shard))];
    const found=new Map<number,Readonly<Db01OriginalSkinRow>>();
    let index=0;
    async function worker(){
      while(index<paths.length){
        const path=paths[index++];
        for(const row of await readBucket(path))found.set(row.itemId,row);
      }
    }
    await Promise.all(Array.from({length:Math.min(8,paths.length)},worker));
    const original=await catalog.getItems(ids);
    check(original.length===ids.length,'SOURCE_CATALOG_ITEM_BATCH');
    return Object.freeze(ids.map((id,i)=>{
      const row=found.get(id)??null;
      if(!row)return null;
      const canonical=original[i];
      check(canonical?.catalogDomain==='item'&&
        canonical.itemId===id&&
        canonical.nativeCategory==='Skin'&&
        canonical.nativeKey===row.nativeKey&&
        canonical.sourceSha256===DB01_ORIGINAL_SKIN_SHA256,
        'ORIGINAL_SOURCE_CATALOG_IDENTITY');
      const positiveNativeAreaCodes=rowAreas(row);
      return Object.freeze({
        source:row,positiveNativeAreaCodes,
        sourceNativeTagState:positiveNativeAreaCodes===null?
          'not_ihas_tags' as const:
          positiveNativeAreaCodes.length>0?
            'positive_native_tag' as const:'no_positive_native_tag' as const,
        originalSourceHashVerified:true as const,
        originalSourceLayoutVerified:true as const,
        gameCollectionUiMembershipVerified:false as const,
        runtimeNativeClassIndependentlyVerified:false as const,
        nativeAllAreasDefaultVerified:false as const,
        dlcEntitlementVerified:false as const,
        playerOwnershipVerified:false as const,
      });
    }));
  }
  async function getItem(id:number){
    check(positive(id),'INVALID_ITEM_ID');
    return (await getItems([id]))[0]??null;
  }
  async function hasTag(id:number,tagId:number){
    check(nonnegative(tagId),'INVALID_REQUESTED_TAG_ID');
    const item=await getItem(id);
    if(!item)return null;
    if(item.source.nativeTags===null){
      check(item.source.sourceProtobufClass==='MountSkinItemData'||
        item.source.sourceProtobufClass==='BoatSkinItemData',
        'UNEXPECTED_NO_IHAS_TAGS');
      return Object.freeze({
        kind:'no_native_ihas_tags' as const,itemId:id,
        sourceProtobufClass:item.source.sourceProtobufClass,
        originalSourceLayoutVerified:true as const,
        nativeRuntimeClassIndependentlyVerified:false as const,
        gameCollectionUiMembershipVerified:false as const,
      });
    }
    return evaluateOriginalNativeHasTag({
      itemId:id,gameVersion:'1.26.2',
      nativeTags:item.source.nativeTags,
      setLookup:{kind:'not_ihas_set'},
    },tagId);
  }
  type Index=Readonly<{
    sorted:readonly number[];
    byId:ReadonlyMap<number,Readonly<Db01OriginalSkinItem>>;
    coverage:Readonly<Db01OriginalSkinCoverage>;
  }>;
  let indexTask:Promise<Index>|null=null;
  async function build():Promise<Index>{
    const catalogRows=await catalog.getCategory('Skin');
    check(catalogRows.length===163,'ORIGINAL_SOURCE_CATEGORY_CENSUS');
    const byId=new Map<number,Readonly<Db01OriginalSkinItem>>();
    const classCounts=new Map<string,number>();
    const world=new Map<number,number>();
    let direct=0,positiveCount=0,tagNoArea=0,noIHasTags=0;
    for(let i=0;i<catalogRows.length;i+=256){
      const batch=catalogRows.slice(i,i+256);
      const results=await getItems(batch.map(x=>x.itemId));
      for(let j=0;j<batch.length;j++){
        const item=results[j],catalogRow=batch[j];
        check(item&&item.source.itemId===catalogRow.itemId&&
          !byId.has(item.source.itemId),
          'ORIGINAL_SOURCE_ITEM_MISSING_OR_DUPLICATE');
        byId.set(item.source.itemId,item);
        const row=item.source;
        classCounts.set(row.sourceProtobufClass,
          (classCounts.get(row.sourceProtobufClass)??0)+1);
        if(item.positiveNativeAreaCodes===null){
          noIHasTags++;
        }else{
          direct+=Number(row.nativeTags!.length>0);
          if(item.positiveNativeAreaCodes.length){
            positiveCount++;
            for(const code of item.positiveNativeAreaCodes){
              world.set(code,(world.get(code)??0)+1);
            }
          }else tagNoArea++;
        }
      }
    }
    check(byId.size===163&&direct===71&&positiveCount===21&&
      tagNoArea===138&&noIHasTags===4&&
      originalClasses.every(cls=>classCounts.get(cls)===layouts[cls].count)&&
      positiveAreaConfigs.every(area=>
        (world.get(area.areaCode)??0)===
          DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS[
            area.areaCode as Db01SkinPositiveAreaCode]),
      'NATIVE_SOURCE_FULL_CORPUS_DRIFT');
    const coverage=Object.freeze({
      originalSourceDefinitions:163 as const,
      originalSubtypeCounts:Object.freeze(
        Object.fromEntries(classCounts) as Record<Db01SkinSourceProtobufClass,number>),
      sourceWithDirectTags:71 as const,
      sourceWithPositiveAreaTag:21 as const,
      sourceIHasTagsWithoutPositiveArea:138 as const,
      sourceWithoutIHasTagsInterface:4 as const,
      sourcePositiveAreasByCode:DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS,
      nativeSourceLayoutVerified:true as const,
      nativeRuntimeClassIndependentlyVerified:false as const,
      gameCollectionUiMembershipVerified:false as const,
      allAreasNativeDefaultVerified:false as const,
    });
    return Object.freeze({
      sorted:Object.freeze([...byId.keys()].sort((a,b)=>a-b)),
      byId,coverage,
    });
  }
  function index(){
    if(!indexTask)indexTask=build().catch(error=>{
      indexTask=null;throw error;});
    return indexTask;
  }
  async function search(input:Db01OriginalSkinQuery={}):
    Promise<Readonly<Db01OriginalSkinPage>>{
    const criteria=query(input),current=await index();
    const results:number[]=[];
    let total=0;
    for(const id of current.sorted){
      const row=current.byId.get(id)!;
      if(!criteria.classes.has(row.source.sourceProtobufClass))continue;
      if(!criteria.areas.includes(0)&&
        !(row.positiveNativeAreaCodes??[]).some(code=>
          criteria.areas.includes(code)))continue;
      if(total>=criteria.offset&&results.length<criteria.limit){
        results.push(id);
      }
      total++;
    }
    return Object.freeze({
      itemIds:Object.freeze(results),
      total,hasMore:total>criteria.offset+results.length,
      originalSourceOnly:true as const,
      untaggedClassesExcludedOnlyFromPositiveTagQuery:true as const,
      gameCollectionUiMembershipVerified:false as const,
      allAreasNativeDefaultVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const,
    });
  }
  return Object.freeze({
    schema:DB01_ORIGINAL_SKIN_NATIVE_SCHEMA,
    gameVersion:'1.26.2' as const,
    getItem,getItems,hasTag,
    getCoverage:async()=>(await index()).coverage,search,
  });
}
