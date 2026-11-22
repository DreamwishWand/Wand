/** DB-01 original-native Item ID and Tag facet filtering for shared services.
 *
 * Game's internal ItemType/subtype enum and source Tag IDs are independently
 * verified. "Furniture Kind", style, colour, Disney universe and world-context
 * Tags are associations, NOT a reconstructed game-screen filter hierarchy,
 * DLC entitlement or proven world of acquisition.
 *
 * No private assets/URLs or production JavaScript. The existing version-pinned
 * lazy catalog, IL2CPP type and original Tag clients remain the only loaders.
 */
import type {Db01CatalogClient,Db01Item} from './index.ts';
import {
  DB01_TAG_FACETS,
  type Db01TagFacet,type Db01TagRef,type Db01Classification,
  type Db01ClassificationClient,
} from './classification.ts';
import type {Db01ItemType,Db01ItemTypeClient} from './item-types.ts';

export const DB01_NATIVE_FILTER_CONTRACT='wand.db01.original-native-filters@1' as const;
export const DB01_NATIVE_ITEM_CLASSES=[
  'ActivityItem','Furniture','Clothing','Trimming',
] as const;
export type Db01NativeClass=typeof DB01_NATIVE_ITEM_CLASSES[number];

export interface Db01NativeFacetItem{
  readonly itemId:number;
  readonly nativeCategory:Db01NativeClass;
  readonly originalType:Readonly<Db01ItemType>;
  readonly tagReferences:readonly Readonly<Db01TagRef>[];
  /** Exact source original Tag keys, not translated UI labels. */
  readonly originalFacets:Readonly<Partial<Record<Db01TagFacet,readonly string[]>>>;
  /** Current source item definition for 8-language exact names and icon GUID. */
  readonly definition:Readonly<Db01Item>;
  readonly gameUiFilterVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01FacetOption{
  readonly facet:Db01TagFacet;
  readonly tagId:number;
  readonly originalTagKey:string;
  readonly matchingNativeItemIds:number;
  readonly sourceTagAssociationVerified:true;
  readonly gameUiFilterVerified:false;
}
export interface Db01SubtypeOption{
  readonly nativeCategory:Db01NativeClass;
  readonly subtypeCode:number;
  /** Name is source IL2CPP enum only; NOT the user-visible game label. */
  readonly originalSubtypeName:string|null;
  readonly subtypeNameVerified:boolean;
  readonly matchingNativeItemIds:number;
  readonly gameUiFilterVerified:false;
}
export interface Db01SubtypeSelection{
  readonly nativeCategory:Db01NativeClass;
  readonly subtypeCode:number;
}
export interface Db01NativeFilterQuery{
  /** OR across native classes. Omitted means all four inventory classes. */
  readonly nativeCategories?:readonly Db01NativeClass[];
  /** OR across exact (class,IL2CPP subtype) pairs. */
  readonly subtypes?:readonly Db01SubtypeSelection[];
  /**
   * OR within one facet (e.g. Blue OR Red); AND between facets
   * (e.g. FurnitureStyle AND Color). Missing/empty facet => no condition.
   * Tag ID must be the original Tag.json identifier, not an arbitrary name.
   */
  readonly facets?:Readonly<Partial<Record<Db01TagFacet,readonly number[]>>>;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01NativeFilterResult{
  readonly total:number;
  readonly itemIds:readonly number[];
  readonly hasMore:boolean;
  readonly originalNativeMatchesOnly:true;
  readonly gameUiFilterVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01NativeFilterCoverage{
  readonly gameVersion:string;
  readonly sourceItemsSha256:string;
  readonly sourceSqliteSha256:string;
  readonly sourceIl2cppDumpSha256:string;
  readonly fullNativeDefinitions:number;
  readonly byNativeCategory:Readonly<Record<Db01NativeClass,number>>;
  readonly byOriginalTagFacet:Readonly<Record<Db01TagFacet,number>>;
  readonly namedSourceSubtypes:number;
  readonly completeSourceNativeItemScan:true;
  readonly gameUiFilterVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01NativeFacetFilterClient{
  readonly contract:typeof DB01_NATIVE_FILTER_CONTRACT;
  readonly source:Readonly<Pick<Db01NativeFilterCoverage,
    'gameVersion'|'sourceItemsSha256'|'sourceSqliteSha256'|'sourceIl2cppDumpSha256'>>;
  /** First call loads a *verified* read-only 13,202-native-item index for v1.26.2.
   * Counts adapt to other versions; no ID ranges or unproved tag fallbacks. */
  getCoverage():Promise<Readonly<Db01NativeFilterCoverage>>;
  getItem(id:number):Promise<Readonly<Db01NativeFacetItem>|null>;
  search(query?:Db01NativeFilterQuery):Promise<Readonly<Db01NativeFilterResult>>;
  getFacetOptions(facet:Db01TagFacet,
    category?:Db01NativeClass):Promise<readonly Readonly<Db01FacetOption>[]>;
  getSubtypeOptions(category:Db01NativeClass):
    Promise<readonly Readonly<Db01SubtypeOption>[]>;
}

const CLASSES=new Set<string>(DB01_NATIVE_ITEM_CLASSES);
const FACETS=new Set<string>(DB01_TAG_FACETS);
const safeId=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonnegative=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function require(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB01_NATIVE_FILTER_'+reason);
}
function isClass(v:unknown):v is Db01NativeClass{
  return typeof v==='string'&&CLASSES.has(v);
}
function isFacet(v:unknown):v is Db01TagFacet{
  return typeof v==='string'&&FACETS.has(v);
}
function safeQuery(raw:Db01NativeFilterQuery):{
  categories:ReadonlySet<Db01NativeClass>;
  subtypes:ReadonlySet<string>|null;
  facets:readonly Readonly<{name:Db01TagFacet;tags:ReadonlySet<number>}>[];
  offset:number;limit:number;
}{
  require(raw!==null&&typeof raw==='object'&&!Array.isArray(raw),'QUERY_SHAPE');
  const categories=raw.nativeCategories===undefined?
    [...DB01_NATIVE_ITEM_CLASSES]:raw.nativeCategories;
  require(Array.isArray(categories)&&categories.length<=4&&
    categories.every(isClass),'NATIVE_CATEGORY_FILTER');
  const typeRules=raw.subtypes??[];
  require(Array.isArray(typeRules)&&typeRules.length<=256&&
    typeRules.every(v=>v!==null&&typeof v==='object'&&
      isClass(v.nativeCategory)&&nonnegative(v.subtypeCode)),
    'SUBTYPE_FILTER');
  const facetSelections=raw.facets??{};
  require(facetSelections!==null&&typeof facetSelections==='object'&&
    !Array.isArray(facetSelections)&&
    Object.keys(facetSelections).every(isFacet),'FACETS_FILTER');
  const facets:Readonly<{name:Db01TagFacet;tags:ReadonlySet<number>}>[]=[];
  for(const name of DB01_TAG_FACETS){
    const ids=facetSelections[name]??[];
    require(Array.isArray(ids)&&ids.length<=256&&ids.every(safeId),'TAG_IDS');
    if(ids.length)facets.push(Object.freeze({name,tags:new Set(ids)}));
  }
  const offset=raw.offset??0,limit=raw.limit??100;
  require(nonnegative(offset)&&nonnegative(limit)&&limit<=1000&&
    offset<=1_000_000,'PAGING');
  return {
    categories:new Set(categories),
    subtypes:typeRules.length?new Set(typeRules.map(v=>
      v.nativeCategory+':'+v.subtypeCode)):null,
    facets,offset,limit,
  };
}

export function createDb01NativeFacetFilterClient(
  catalog:Db01CatalogClient,tags:Db01ClassificationClient,
  itemTypes:Db01ItemTypeClient,
):Db01NativeFacetFilterClient{
  const base=catalog?.source,tagSource=tags?.source,typeSource=itemTypes?.source;
  require(base?.privateOnly===true&&base.platform==='Steam'&&
    base.fullCorpusParsed===true&&safeId(base.definitions)&&
    safeId(base.currentNativeItemDefinitions)&&
    typeof catalog.getCategory==='function'&&
    typeof catalog.getItems==='function'&&
    typeof tags?.getItems==='function'&&
    typeof itemTypes?.getItems==='function','COMPLETE_PRIVATE_CATALOG');
  require(tagSource?.privateOnly===true&&
    tagSource.gameVersion===base.gameVersion&&
    typeSource?.gameVersion===base.gameVersion&&
    tagSource.sourceItemsSha256===base.sourceItemsSha256&&
    typeSource.sourceItemsSha256===base.sourceItemsSha256&&
    tagSource.definitionCount===base.definitions&&
    typeSource.definitionCount===base.definitions&&
    typeSource.sourceItemTypeVerified===base.definitions&&
    tagSource.sourceSqliteSha256===typeSource.sourceSqliteSha256,
    'SOURCE_VERSION_OR_SQLITE_IDENTITY');

  // Original Furniture field-7 packed Tag IDs were added by the
  // corrected full v1.26.2 Tag release. The first original-source Tag
  // archive lacks 112 world-context and 31 universe associations despite
  // sharing the same catalog Items SHA: a base-source hash alone cannot
  // distinguish the two derived Tag releases. Fail closed on that known
  // retired release rather than silently mis-filtering furniture.
  if(base.gameVersion==='1.26.2'&&base.definitions===39067){
    require(tagSource.taggedDefinitions===14973&&
      tagSource.facetCoverage?.worldContextTag===11275&&
      tagSource.facetCoverage?.disneyUniverse===1997,
      'RETIRED_INCOMPLETE_TAG_OVERLAY');
  }
  const source=Object.freeze({
    gameVersion:base.gameVersion,sourceItemsSha256:base.sourceItemsSha256,
    sourceSqliteSha256:tagSource.sourceSqliteSha256,
    sourceIl2cppDumpSha256:typeSource.sourceIl2cppDumpSha256,
  });
  type NativeIndex={
    rows:ReadonlyMap<number,Readonly<Db01NativeFacetItem>>;
    coverage:Readonly<Db01NativeFilterCoverage>;
    byFacet:ReadonlyMap<Db01TagFacet,ReadonlyMap<number,Readonly<{
      tagKey:string;itemIds:ReadonlySet<number>}>>>;
    subtypeIndex:ReadonlyMap<Db01NativeClass,
      ReadonlyMap<number,Readonly<{name:string|null;verified:boolean;count:number}>>>;
    sortedIds:readonly number[];
  };
  let loader:Promise<NativeIndex>|null=null;
  async function build():Promise<NativeIndex>{
    const categories=await Promise.all(DB01_NATIVE_ITEM_CLASSES.map(category=>
      catalog.getCategory(category)));
    const native=new Map<number,Readonly<Db01NativeFacetItem>>();
    const tagOptions=new Map<Db01TagFacet,
      Map<number,{tagKey:string;itemIds:Set<number>}>>();
    const subtypeOptions=new Map<Db01NativeClass,
      Map<number,{name:string|null;verified:boolean;count:number}>>();
    const byCategory={} as Record<Db01NativeClass,number>;
    const byFacet={} as Record<Db01TagFacet,number>;
    for(const facet of DB01_TAG_FACETS){
      byFacet[facet]=0;tagOptions.set(facet,new Map());
    }
    let namedSubtypes=0;

    const requests:readonly {category:Db01NativeClass;rows:readonly Readonly<Db01Item>[]}[]=
      DB01_NATIVE_ITEM_CLASSES.map((category,index)=>({
        category,rows:categories[index],
      }));
    for(const {category,rows} of requests){
      require(rows.length<=base.currentNativeItemDefinitions,'CATEGORY_COUNT');
      byCategory[category]=rows.length;
      subtypeOptions.set(category,new Map());
      for(let offset=0;offset<rows.length;offset+=4096){
        const batch=rows.slice(offset,offset+4096);
        const ids=batch.map(r=>r.itemId);
        // Both independent source overlays have the same original Item-ID
        // SHA contract, so their bucket reads may proceed simultaneously.
        const [tagRows,typeRows]=await Promise.all([
          tags.getItems(ids),itemTypes.getItems(ids),
        ]);
        require(tagRows.length===batch.length&&typeRows.length===batch.length,
          'SOURCE_BATCH_LENGTH');
        for(let i=0;i<batch.length;i++){
          const row=batch[i],tag=tagRows[i],type=typeRows[i];
          require(safeId(row.itemId)&&row.nativeCategory===category&&
            row.catalogDomain==='item'&&!native.has(row.itemId),
            'NATIVE_ITEM_ID_OR_CATEGORY');
          require(tag!==null&&type!==null,'CURRENT_SOURCE_MISSING');
          require(tag.itemId===row.itemId&&
            tag.nativeCategory===category&&
            tag.nativeKey===row.nativeKey&&
            tag.sourceSha256===row.sourceSha256&&
            type.itemId===row.itemId&&
            type.nativeCategory===category&&
            type.sourceSha256===row.sourceSha256&&
            type.gameUiCategoryVerified===false&&
            tag.gameUiCategoryVerified===false,
            'SOURCE_ROW_MISMATCH');
          require(nonnegative(type.subtypeCode),'SOURCE_SUBTYPE_CODE');
          if(type.subtypeNameVerified){
            require(typeof type.subtypeName==='string','SOURCE_SUBTYPE_NAME');
            namedSubtypes++;
          }else require(type.subtypeName===null,'UNVERIFIED_SUBTYPE_NAME');

          const matches=new Set<Db01TagFacet>();
          const refPairs=new Set<string>();
          for(const ref of tag.tagReferences){
            require(isFacet(ref.facet)&&safeId(ref.tagId)&&
              typeof ref.tagKey==='string'&&ref.tagKey.length>0&&
              nonnegative(ref.wireField),'ORIGINAL_TAG_REF');
            const pair=ref.facet+':'+ref.tagId;
            // A single Tag ID may be present on several source wire fields.
            // Count each original Item ID exactly once per facet/tag pair.
            if(refPairs.has(pair))continue;
            refPairs.add(pair);
            matches.add(ref.facet);
            const group=tagOptions.get(ref.facet)!;
            const previous=group.get(ref.tagId);
            if(previous){
              require(previous.tagKey===ref.tagKey,'TAG_KEY_CONFLICT');
              previous.itemIds.add(row.itemId);
            }else{
              group.set(ref.tagId,{tagKey:ref.tagKey,itemIds:new Set([row.itemId])});
            }
          }
          for(const f of matches)byFacet[f]++;
          const current=subtypeOptions.get(category)!;
          const prev=current.get(type.subtypeCode);
          if(prev){
            require(prev.name===type.subtypeName&&
              prev.verified===type.subtypeNameVerified,
              'SUBTYPE_ENUM_CONFLICT');
            prev.count++;
          }else{
            current.set(type.subtypeCode,{
              name:type.subtypeName,verified:type.subtypeNameVerified,count:1,
            });
          }
          native.set(row.itemId,Object.freeze({
            itemId:row.itemId,nativeCategory:category,
            originalType:type,tagReferences:tag.tagReferences,
            originalFacets:tag.facets,definition:row,
            gameUiFilterVerified:false,
            worldAvailabilityVerified:false,dlcEntitlementVerified:false,
          }));
        }
      }
    }
    require(native.size===base.currentNativeItemDefinitions,'INCOMPLETE_NATIVE_SCAN');
    const coverage=Object.freeze({
      ...source,fullNativeDefinitions:native.size,
      byNativeCategory:Object.freeze(byCategory),
      byOriginalTagFacet:Object.freeze(byFacet),
      namedSourceSubtypes:namedSubtypes,
      completeSourceNativeItemScan:true as const,
      gameUiFilterVerified:false as const,
      worldAvailabilityVerified:false as const,
      dlcEntitlementVerified:false as const,
    });
    return {
      rows:native,
      sortedIds:Object.freeze([...native.keys()].sort((a,b)=>a-b)),
      coverage,byFacet:tagOptions,subtypeIndex:subtypeOptions,
    };
  }
  function indexed():Promise<NativeIndex>{
    if(loader===null){
      loader=build().catch(error=>{
        loader=null;
        throw error;
      });
    }
    return loader;
  }
  async function getItem(id:number):Promise<Readonly<Db01NativeFacetItem>|null>{
    require(safeId(id),'ITEM_ID');
    return (await indexed()).rows.get(id)??null;
  }
  async function search(query:Db01NativeFilterQuery={}):Promise<Readonly<Db01NativeFilterResult>>{
    const selected=safeQuery(query),index=await indexed();
    const hits:number[]=[];
    let total=0;
    for(const id of index.sortedIds){
      const row=index.rows.get(id)!;
      if(!selected.categories.has(row.nativeCategory))continue;
      if(selected.subtypes&&!selected.subtypes.has(
        row.nativeCategory+':'+row.originalType.subtypeCode))continue;
      let eligible=true;
      for(const group of selected.facets){
        if(!row.tagReferences.some(ref=>
          ref.facet===group.name&&group.tags.has(ref.tagId))){
          eligible=false;break;
        }
      }
      if(!eligible)continue;
      if(total>=selected.offset&&hits.length<selected.limit)hits.push(id);
      total++;
    }
    return Object.freeze({
      total,itemIds:Object.freeze(hits),
      hasMore:total>selected.offset+hits.length,
      originalNativeMatchesOnly:true as const,
      gameUiFilterVerified:false as const,
      worldAvailabilityVerified:false as const,
      dlcEntitlementVerified:false as const,
    });
  }
  async function getFacetOptions(
    facet:Db01TagFacet,category?:Db01NativeClass,
  ):Promise<readonly Readonly<Db01FacetOption>[]>{
    require(isFacet(facet)&&(category===undefined||isClass(category)),
      'FACET_OPTION_SELECTION');
    const index=await indexed();
    const byTag=index.byFacet.get(facet)!;
    const rows:Db01FacetOption[]=[];
    for(const [tagId,entry] of byTag){
      const matching=category===undefined?entry.itemIds.size:
        [...entry.itemIds].reduce((sum,id)=>sum+
          (index.rows.get(id)?.nativeCategory===category?1:0),0);
      if(!matching)continue;
      rows.push(Object.freeze({
        facet,tagId,originalTagKey:entry.tagKey,
        matchingNativeItemIds:matching,
        sourceTagAssociationVerified:true,
        gameUiFilterVerified:false,
      }));
    }
    return Object.freeze(rows.sort((a,b)=>a.tagId-b.tagId));
  }
  async function getSubtypeOptions(category:Db01NativeClass):
    Promise<readonly Readonly<Db01SubtypeOption>[]>{
    require(isClass(category),'SUBTYPE_OPTION_CATEGORY');
    const index=await indexed();
    const result:Db01SubtypeOption[]=[];
    for(const [subtypeCode,record] of index.subtypeIndex.get(category)!){
      result.push(Object.freeze({
        nativeCategory:category,subtypeCode,
        originalSubtypeName:record.name,
        subtypeNameVerified:record.verified,
        matchingNativeItemIds:record.count,
        gameUiFilterVerified:false,
      }));
    }
    return Object.freeze(result.sort((a,b)=>a.subtypeCode-b.subtypeCode));
  }
  return Object.freeze({
    contract:DB01_NATIVE_FILTER_CONTRACT,source,
    getCoverage:async()=> (await indexed()).coverage,
    getItem,search,getFacetOptions,getSubtypeOptions,
  });
}
