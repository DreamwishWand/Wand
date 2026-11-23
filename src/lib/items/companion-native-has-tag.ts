/**
 * Steam 1.26.2 original Companion: Pet, Mount and Critter are NOT the same
 * IL2CPP ItemData class and must NEVER use a shared guessed Tags field.
 *
 * PetItemData: IHasTags.Tags protobuf field 7 (241 original records).
 * MountItemData: IHasTags.Tags protobuf field 10 (28 source records).
 * CritterItemData: does not implement IHasTags (125 source records).
 *   Critter location/scene is a oneof, original field 6 or 7; its
 *   CollectionArea route may require ProfileWorld scene lookup. A Critter
 *   CANNOT be classified as "no matching game world" from missing Tags.
 *
 * Source is caller-supplied PRIVATE SHA256-indexed original shards. No
 * source game files or player profiles are embedded in published TypeScript.
 */
import type {Db01CatalogClient,Db01LoadBytes} from './index.ts';
import {
  evaluateOriginalNativeHasTag,
  type Db01OriginalHasTagResult,
} from './native-has-tag.ts';
import {DB01_COLLECTION_AREA_SOURCE_CONFIGS} from './collection-area-source-config.ts';

export const DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA=
  'wand.db01.original-companion-native-steam-1262@1' as const;
export const DB01_ORIGINAL_COMPANION_SOURCE_SHA256=
  '62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219' as const;
export const DB01_ORIGINAL_COMPANION_TAG_SHA256=
  'bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4' as const;
export const DB01_ORIGINAL_COMPANION_IL2CPP_SHA256=
  '0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08' as const;
export const DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS=Object.freeze({
  PetItemData:241,MountItemData:28,CritterItemData:125,
} as const);
export const DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS=Object.freeze({
  1:170,2:20,3:16,4:19,5:17,4097:4,
} as const);
export type Db01OriginalCompanionClass=
  keyof typeof DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS;
export type Db01OriginalCompanionKind='pet'|'mount'|'critter';
export type Db01OriginalCompanionArea=1|2|3|4|5|4097;

export interface Db01OriginalCompanionManifest{
  readonly schema:typeof DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA;
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly privateOnly:true;
  readonly publicationAuthorized:false;
  readonly sourceCompanionSha256:typeof DB01_ORIGINAL_COMPANION_SOURCE_SHA256;
  readonly sourceTagSha256:typeof DB01_ORIGINAL_COMPANION_TAG_SHA256;
  readonly sourceIl2cppDumpSha256:typeof DB01_ORIGINAL_COMPANION_IL2CPP_SHA256;
  readonly sourceDefinitionCount:394;
  readonly originalNativeClassCounts:
    Readonly<Record<Db01OriginalCompanionClass,number>>;
  readonly bucketCount:256;
  readonly files:Readonly<Record<string,Readonly<{sha256:string;bytes:number;count:number}>>>;
  readonly sourcePositiveAreaCountsVerified:true;
  readonly sourceCritterLocationOneofVerified:true;
  readonly sourceNativeHasTagsInterfacesVerified:true;
  readonly sourceCritterRuntimeWorldSceneVerified:false;
  readonly nativeAllAreasDefaultMatchVerified:false;
  readonly actualGameCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01OriginalCompanionRow{
  readonly itemId:number;
  readonly nativeKey:string;
  readonly nativeCategory:'Companion';
  readonly originalNativeClass:Db01OriginalCompanionClass;
  readonly nativeKind:Db01OriginalCompanionKind;
  /** null = Critter does NOT implement IHasTags; [] = genuine Mount IHasTags
   * with no source direct Tag IDs. These states must not be conflated.
   */
  readonly nativeTags:readonly number[]|null;
  readonly tagsFieldNumber:7|10|null;
  readonly critterLocationOneofFieldNumber:6|7|null;
  readonly originalIHasTagsInterface:boolean;
  readonly originalIHasSetInterface:false;
  readonly nativeClassSourceVerified:true;
  readonly runtimeCritterWorldSceneVerified:false;
  readonly gameUiCollectionMembershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01OriginalCompanionItem{
  readonly source:Readonly<Db01OriginalCompanionRow>;
  /** null = Critter location/scene route is not evaluable from native Tag IDs.
   * [] = Pet/Mount IHasTags source has no positive native area tag.
   */
  readonly positiveNativeAreaCodes:readonly Db01OriginalCompanionArea[]|null;
  readonly originalIHasTagsInterface:boolean;
  readonly needsRuntimeCritterSceneEvaluation:boolean;
  readonly sourceShardHashVerified:true;
  readonly sourceOriginalNativeClassVerified:true;
  readonly actualCollectionUiMembershipVerified:false;
  readonly nativeAllAreasDefaultPredicateVerified:false;
  readonly playerEntitlementVerified:false;
}
export interface Db01OriginalCompanionCritterHasTagUnavailable{
  readonly kind:'no_original_ihas_tags_interface';
  readonly itemId:number;
  readonly originalNativeClass:'CritterItemData';
  readonly originalLocationOneofFieldNumber:6|7;
  readonly runtimeCritterSceneRequired:true;
  readonly gameCollectionAreaMembershipVerified:false;
}
export interface Db01OriginalCompanionCoverage{
  readonly sourceDefinitions:394;
  readonly originalNativeClassCounts:
    Readonly<Record<Db01OriginalCompanionClass,number>>;
  readonly sourceNativeTaggedPositiveAreaItems:246;
  readonly sourceNativeTaggedWithoutPositiveArea:23;
  readonly sourceCritterLocationOneofCase6:105;
  readonly sourceCritterSceneOneofCase7:20;
  readonly sourceCritterRuntimeWorldUnknown:125;
  readonly sourcePositiveAreaByCode:Readonly<Record<number,number>>;
  readonly nativeClassAndInterfaceSourceVerified:true;
  readonly critterRuntimeCollectionAreaVerified:false;
  readonly actualGameUiMembershipVerified:false;
  readonly nativeAllAreasDefaultTagVerified:false;
}
export interface Db01OriginalCompanionSearch{
  readonly kinds?:readonly Db01OriginalCompanionKind[];
  /** [0] means all original Companion records, including Critters awaiting
   * runtime ProfileWorld data. Positive codes only select proven native
   * IHasTags (Pet/Mount) candidates; Critters remain UNKNOWN, not false.
   */
  readonly areaCodes?:readonly (Db01OriginalCompanionArea|0)[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01OriginalCompanionSearchPage{
  readonly itemIds:readonly number[];
  readonly total:number;
  readonly hasMore:boolean;
  readonly sourceNativePetAndMountTagOnly:true;
  readonly critterProfileWorldAreaUnresolved:true;
  readonly actualCollectionUiMembershipVerified:false;
  readonly nativeAllAreasDefaultPredicateVerified:false;
  readonly playerEntitlementVerified:false;
}
export interface Db01OriginalCompanionClient{
  readonly schema:typeof DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA;
  readonly gameVersion:'1.26.2';
  getItem(id:number):Promise<Readonly<Db01OriginalCompanionItem>|null>;
  getItems(ids:readonly number[]):
    Promise<readonly (Readonly<Db01OriginalCompanionItem>|null)[]>;
  hasTag(id:number,tagId:number):Promise<
    Readonly<Db01OriginalHasTagResult>|
    Readonly<Db01OriginalCompanionCritterHasTagUnavailable>|null>;
  getCoverage():Promise<Readonly<Db01OriginalCompanionCoverage>>;
  search(query?:Db01OriginalCompanionSearch):
    Promise<Readonly<Db01OriginalCompanionSearchPage>>;
}

const specs=DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS;
const knownClasses=new Set<string>(Object.keys(specs));
const knownKinds=new Set<string>(['pet','mount','critter']);
const areas=DB01_COLLECTION_AREA_SOURCE_CONFIGS
  .filter(c=>c.gameplayTagId>0);
const codes=new Set<number>(areas.map(c=>c.areaCode));
const sha=/^[a-f0-9]{64}$/;
const obj=(x:unknown):x is Record<string,unknown>=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const positive=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonnegative=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function check(ok:unknown,why:string):asserts ok{
  if(!ok)throw new TypeError('DB01_COMPANION_NATIVE_'+why);
}
function bucket(id:number):string{
  return 'id/'+(id%256).toString(16).padStart(2,'0')+'.json';
}
check(areas.length===6&&
  DB01_COLLECTION_AREA_SOURCE_CONFIGS.length===7&&
  DB01_COLLECTION_AREA_SOURCE_CONFIGS[6].areaCode===0&&
  Object.values(specs).reduce((a,b)=>a+b,0)===394&&
  Object.values(DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS)
    .reduce((a,b)=>a+b,0)===246,
  'ORIGINAL_SOURCE_STATIC_CENSUS_DRIFT');

export function validateDb01OriginalCompanionManifest(
  raw:unknown,
):asserts raw is Db01OriginalCompanionManifest{
  check(obj(raw),'MANIFEST_REQUIRED');
  check(raw.schema===DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA&&
    raw.platform==='Steam'&&raw.gameVersion==='1.26.2'&&
    raw.privateOnly===true&&raw.publicationAuthorized===false&&
    raw.sourceCompanionSha256===DB01_ORIGINAL_COMPANION_SOURCE_SHA256&&
    raw.sourceTagSha256===DB01_ORIGINAL_COMPANION_TAG_SHA256&&
    raw.sourceIl2cppDumpSha256===DB01_ORIGINAL_COMPANION_IL2CPP_SHA256&&
    raw.sourceDefinitionCount===394&&raw.bucketCount===256&&
    raw.sourcePositiveAreaCountsVerified===true&&
    raw.sourceCritterLocationOneofVerified===true&&
    raw.sourceNativeHasTagsInterfacesVerified===true&&
    raw.sourceCritterRuntimeWorldSceneVerified===false&&
    raw.nativeAllAreasDefaultMatchVerified===false&&
    raw.actualGameCollectionUiMembershipVerified===false&&
    raw.playerOwnershipVerified===false&&
    raw.dlcEntitlementVerified===false,
    'ORIGINAL_SOURCE_IDENTITY');
  const counts=raw.originalNativeClassCounts;
  check(obj(counts)&&Object.keys(counts).length===3&&
    Object.entries(specs).every(([key,count])=>
      counts[key]===count),
    'ORIGINAL_NATIVE_CLASS_CENSUS');
  const files=raw.files;
  check(obj(files)&&Object.keys(files).length===256,
    'SOURCE_SHARD_LEDGER');
  let count=0;
  for(let i=0;i<256;i++){
    const key='id/'+i.toString(16).padStart(2,'0')+'.json';
    const meta=files[key];
    check(obj(meta)&&typeof meta.sha256==='string'&&sha.test(meta.sha256)&&
      nonnegative(meta.count)&&nonnegative(meta.bytes)&&
      meta.bytes>=3&&meta.bytes<10_000_000,
      'SOURCE_SHARD_LEDGER_ENTRY');
    count+=meta.count;
  }
  check(count===394,'ORIGINAL_ITEM_CENSUS');
}
function validateRow(
  raw:unknown,path:string,
):Readonly<Db01OriginalCompanionRow>{
  check(obj(raw)&&positive(raw.itemId)&&
    bucket(raw.itemId)===path&&
    typeof raw.nativeKey==='string'&&
    raw.nativeKey.length>0&&raw.nativeKey.length<=256&&
    raw.nativeKey.trim()===raw.nativeKey&&
    !/[\x00-\x1f]/.test(raw.nativeKey)&&
    raw.nativeCategory==='Companion'&&
    typeof raw.originalNativeClass==='string'&&
    knownClasses.has(raw.originalNativeClass)&&
    typeof raw.nativeKind==='string'&&
    knownKinds.has(raw.nativeKind)&&
    raw.originalIHasSetInterface===false&&
    raw.nativeClassSourceVerified===true&&
    raw.runtimeCritterWorldSceneVerified===false&&
    raw.gameUiCollectionMembershipVerified===false&&
    raw.dlcEntitlementVerified===false,
    'BAD_SOURCE_COMPANION_ROW');
  if(raw.originalNativeClass==='CritterItemData'){
    check(raw.nativeKind==='critter'&&raw.nativeTags===null&&
      raw.tagsFieldNumber===null&&
      (raw.critterLocationOneofFieldNumber===6||
       raw.critterLocationOneofFieldNumber===7)&&
      raw.originalIHasTagsInterface===false,
      'CRITTER_MUST_NOT_PRETEND_IHAS_TAGS');
  }else{
    const pet=raw.originalNativeClass==='PetItemData';
    check(raw.nativeKind===(pet?'pet':'mount')&&
      raw.tagsFieldNumber===(pet?7:10)&&
      raw.critterLocationOneofFieldNumber===null&&
      raw.originalIHasTagsInterface===true&&
      Array.isArray(raw.nativeTags)&&
      raw.nativeTags.length<=10000&&
      raw.nativeTags.every(positive)&&
      new Set(raw.nativeTags).size===raw.nativeTags.length&&
      (!pet||raw.nativeTags.length>0),
      'BAD_PET_OR_MOUNT_TAG_INTERFACE');
    Object.freeze(raw.nativeTags);
  }
  return Object.freeze(raw as unknown as Db01OriginalCompanionRow);
}

export function createDb01OriginalCompanionClient(
  raw:unknown,loadBytes:Db01LoadBytes,catalog:Db01CatalogClient,
):Db01OriginalCompanionClient{
  validateDb01OriginalCompanionManifest(raw);
  check(typeof loadBytes==='function'&&
    catalog?.source?.platform==='Steam'&&
    catalog.source.gameVersion==='1.26.2'&&
    catalog.source.privateOnly===true&&
    catalog.source.fullCorpusParsed===true&&
    typeof catalog.getCategory==='function'&&
    typeof catalog.getItems==='function',
    'PINNED_PRIVATE_CATALOG_REQUIRED');
  const manifest=raw;
  const cache=new Map<string,Promise<readonly Readonly<Db01OriginalCompanionRow>[]>>();
  async function shard(path:string){
    const cached=cache.get(path);
    if(cached)return cached;
    const task=(async()=>{
      const meta=manifest.files[path];
      check(!!meta,'UNKNOWN_ORIGINAL_SHARD');
      const blob=await loadBytes(path);
      const bytes=blob instanceof ArrayBuffer?new Uint8Array(blob):blob;
      check(bytes instanceof Uint8Array&&bytes.byteLength===meta.bytes,
        'SOURCE_SHARD_SIZE');
      const snapshot=new Uint8Array(bytes);
      check(!!globalThis.crypto?.subtle,'SHA256_UNAVAILABLE');
      const digest=Array.from(new Uint8Array(
        await crypto.subtle.digest('SHA-256',snapshot)),
      x=>x.toString(16).padStart(2,'0')).join('');
      check(digest===meta.sha256,'SOURCE_SHARD_SHA256');
      const parsed:unknown=JSON.parse(
        new TextDecoder('utf-8',{fatal:true}).decode(snapshot));
      check(Array.isArray(parsed)&&parsed.length===meta.count,
        'SOURCE_SHARD_ENTRY_COUNT');
      const seen=new Set<number>();
      return Object.freeze(parsed.map(row=>{
        const item=validateRow(row,path);
        check(!seen.has(item.itemId),'DUPLICATE_SHARD_ITEM_ID');
        seen.add(item.itemId);
        return item;
      }));
    })();
    cache.set(path,task);
    try{return await task;}
    catch(e){cache.delete(path);throw e;}
  }
  async function getItems(ids:readonly number[]):
    Promise<readonly (Readonly<Db01OriginalCompanionItem>|null)[]>{
    check(Array.isArray(ids)&&ids.length<=4096&&ids.every(positive),
      'BAD_ITEM_BATCH');
    if(!ids.length)return Object.freeze([]);
    const paths=[...new Set(ids.map(bucket))];
    const found=new Map<number,Readonly<Db01OriginalCompanionRow>>();
    let next=0;
    async function worker(){
      while(next<paths.length){
        const path=paths[next++];
        for(const row of await shard(path))found.set(row.itemId,row);
      }
    }
    await Promise.all(Array.from({
      length:Math.min(8,paths.length)},()=>worker()));
    const canonical=await catalog.getItems(ids);
    check(canonical.length===ids.length,'CATALOG_BATCH_LENGTH');
    return Object.freeze(ids.map((id,i)=>{
      const row=found.get(id)??null;
      if(row===null)return null;
      const current=canonical[i];
      check(current?.catalogDomain==='item'&&
        current.itemId===id&&
        current.nativeCategory==='Companion'&&
        current.nativeKey===row.nativeKey&&
        current.sourceSha256===DB01_ORIGINAL_COMPANION_SOURCE_SHA256,
        'SOURCE_CATALOG_ITEM_IDENTITY');
      const positiveAreas=row.nativeTags===null?null:
        Object.freeze(areas.filter(c=>
          row.nativeTags!.includes(c.gameplayTagId))
          .map(c=>c.areaCode as Db01OriginalCompanionArea));
      check(positiveAreas===null||positiveAreas.length<=1,
        'ORIGINAL_MULTIPLE_POSITIVE_AREA_TAGS');
      return Object.freeze({
        source:row,positiveNativeAreaCodes:positiveAreas,
        originalIHasTagsInterface:row.originalIHasTagsInterface,
        needsRuntimeCritterSceneEvaluation:row.nativeTags===null,
        sourceShardHashVerified:true as const,
        sourceOriginalNativeClassVerified:true as const,
        actualCollectionUiMembershipVerified:false as const,
        nativeAllAreasDefaultPredicateVerified:false as const,
        playerEntitlementVerified:false as const,
      });
    }));
  }
  async function getItem(id:number){
    check(positive(id),'INVALID_ITEM_ID');
    return (await getItems([id]))[0]??null;
  }
  async function hasTag(id:number,tagId:number){
    check(nonnegative(tagId),'INVALID_REQUESTED_TAG_ID');
    const row=await getItem(id);
    if(!row)return null;
    if(row.source.originalNativeClass==='CritterItemData'){
      return Object.freeze({
        kind:'no_original_ihas_tags_interface' as const,
        itemId:id,originalNativeClass:'CritterItemData' as const,
        originalLocationOneofFieldNumber:
          row.source.critterLocationOneofFieldNumber as 6|7,
        runtimeCritterSceneRequired:true as const,
        gameCollectionAreaMembershipVerified:false as const,
      });
    }
    return evaluateOriginalNativeHasTag({
      itemId:id,gameVersion:'1.26.2',
      nativeTags:row.source.nativeTags!,
      setLookup:{kind:'not_ihas_set'},
    },tagId);
  }
  type Index=Readonly<{
    sorted:readonly number[];
    rows:ReadonlyMap<number,Readonly<Db01OriginalCompanionItem>>;
    coverage:Readonly<Db01OriginalCompanionCoverage>;
  }>;
  let indexTask:Promise<Index>|null=null;
  async function build():Promise<Index>{
    const canonical=await catalog.getCategory('Companion');
    check(canonical.length===394,'ORIGINAL_SOURCE_CATEGORY_COUNT');
    const rows=new Map<number,Readonly<Db01OriginalCompanionItem>>();
    const classCounts=new Map<Db01OriginalCompanionClass,number>();
    const world=new Map<number,number>();
    let positiveCount=0,withoutWorld=0,critCase6=0,critCase7=0;
    for(let offset=0;offset<canonical.length;offset+=256){
      const part=canonical.slice(offset,offset+256);
      const native=await getItems(part.map(x=>x.itemId));
      check(native.length===part.length,'ORIGINAL_CATALOG_BATCH');
      for(let i=0;i<part.length;i++){
        const source=native[i],base=part[i];
        check(source!==null&&
          source.source.itemId===base.itemId&&
          !rows.has(base.itemId),
          'MISSING_OR_DUPLICATE_ORIGINAL_ITEM');
        rows.set(base.itemId,source);
        const cls=source.source.originalNativeClass;
        classCounts.set(cls,(classCounts.get(cls)??0)+1);
        if(source.source.nativeKind==='critter'){
          check(source.positiveNativeAreaCodes===null&&
            source.needsRuntimeCritterSceneEvaluation===true,
            'CRITTER_WORLD_MUST_REMAIN_UNRESOLVED');
          if(source.source.critterLocationOneofFieldNumber===6)critCase6++;
          if(source.source.critterLocationOneofFieldNumber===7)critCase7++;
        }else{
          const codes=source.positiveNativeAreaCodes!;
          positiveCount+=Number(codes.length>0);
          withoutWorld+=Number(codes.length===0);
          for(const code of codes)world.set(code,(world.get(code)??0)+1);
        }
      }
    }
    check(rows.size===394&&
      Object.entries(specs).every(([key,count])=>
        classCounts.get(key as Db01OriginalCompanionClass)===count)&&
      positiveCount===246&&withoutWorld===23&&
      critCase6===105&&critCase7===20&&
      areas.every(c=>
        (world.get(c.areaCode)??0)===
          DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS[
            c.areaCode as Db01OriginalCompanionArea]),
      'ORIGINAL_NATIVE_COMPANION_SOURCE_DRIFT');
    const coverage:Readonly<Db01OriginalCompanionCoverage>=Object.freeze({
      sourceDefinitions:394 as const,
      originalNativeClassCounts:specs,
      sourceNativeTaggedPositiveAreaItems:246 as const,
      sourceNativeTaggedWithoutPositiveArea:23 as const,
      sourceCritterLocationOneofCase6:105 as const,
      sourceCritterSceneOneofCase7:20 as const,
      sourceCritterRuntimeWorldUnknown:125 as const,
      sourcePositiveAreaByCode:DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS,
      nativeClassAndInterfaceSourceVerified:true,
      critterRuntimeCollectionAreaVerified:false,
      actualGameUiMembershipVerified:false,
      nativeAllAreasDefaultTagVerified:false,
    });
    return Object.freeze({
      rows,sorted:Object.freeze([...rows.keys()].sort((a,b)=>a-b)),
      coverage,
    });
  }
  function index(){
    if(!indexTask)indexTask=build().catch(error=>{
      indexTask=null;throw error;});
    return indexTask;
  }
  async function search(query:Db01OriginalCompanionSearch={}):
    Promise<Readonly<Db01OriginalCompanionSearchPage>>{
    check(obj(query),'INVALID_QUERY');
    const kinds=query.kinds??['pet','mount','critter'];
    const selected=query.areaCodes??[0];
    const offset=query.offset??0,limit=query.limit??100;
    check(Array.isArray(kinds)&&kinds.length<=3&&
      kinds.every(k=>knownKinds.has(k))&&
      new Set(kinds).size===kinds.length&&
      Array.isArray(selected)&&selected.length>0&&
      selected.length<=6&&
      selected.every(code=>code===0||codes.has(code))&&
      new Set(selected).size===selected.length&&
      (!selected.includes(0)||selected.length===1)&&
      nonnegative(offset)&&offset<=1_000_000&&
      nonnegative(limit)&&limit<=1000,
      'INVALID_QUERY_FILTER');
    const current=await index(),wanted=new Set(kinds);
    const result:number[]=[];
    let total=0;
    for(const id of current.sorted){
      const row=current.rows.get(id)!;
      if(!wanted.has(row.source.nativeKind))continue;
      if(!selected.includes(0)&&
        !(row.positiveNativeAreaCodes??[]).some(code=>
          selected.includes(code)))continue;
      if(total>=offset&&result.length<limit)result.push(id);
      total++;
    }
    return Object.freeze({
      itemIds:Object.freeze(result),
      total,hasMore:total>offset+result.length,
      sourceNativePetAndMountTagOnly:true,
      critterProfileWorldAreaUnresolved:true,
      actualCollectionUiMembershipVerified:false,
      nativeAllAreasDefaultPredicateVerified:false,
      playerEntitlementVerified:false,
    });
  }
  return Object.freeze({
    schema:DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA,
    gameVersion:'1.26.2' as const,
    getItem,getItems,hasTag,
    getCoverage:async()=>(await index()).coverage,search,
  });
}
