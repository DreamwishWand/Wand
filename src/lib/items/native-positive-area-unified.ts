/**
 * DB-01 Steam v1.26.2 common, source-native positive CollectionArea index.
 *
 * Composes the two independently SHA-verified PRIVATE source clients:
 *   Furniture (7 original protobuf subtypes): 6,746 native items
 *   Clothing + Trimming + Makeup: 2,475 original native items
 *
 * All 9,221 source objects implement original IHasTags, with IHasSet only
 * where the same-version IL2CPP interface is actually implemented.
 * Positive area predicates are exact original native direct OR inherited
 * SetItemData.Tags checks against six serialized Unity area configurations.
 *
 * This DOES NOT prove game Collection screen membership/visibility, DLC
 * purchase, world availability, player ownership, or native AllAreas fallback.
 * A zero-match item remains source-UNRESOLVED, not DreamlightValley.
 *
 * Source readers load original game-derived shards only from an authorized
 * caller-provided local/private store. Run full scans off main thread.
 */
import {
  DB01_FURNITURE_NATIVE_AREA_PREDICATES,
  DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS,
  type Db01FurniturePositiveAreaSourceClient,
  type Db01SourcePositiveCollectionAreaCode,
} from './furniture-positive-areas.ts';
import {
  DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA,
  DB01_WARDROBE_CATEGORY_SPECS,
  DB01_WARDROBE_POSITIVE_AREA_CENSUS,
  type Db01WardrobeOriginalClient,
  type Db01WardrobeOriginalCategory,
} from './wardrobe-native-has-tag.ts';
import {DB01_COLLECTION_AREA_SOURCE_CONFIGS} from './collection-area-source-config.ts';

export const DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA=
  'wand.db01.native-positive-area-unified-steam-1262@1' as const;

export type Db01NativePositiveAreaCategory=
  'Furniture'|Db01WardrobeOriginalCategory;
export type Db01NativePositiveAreaCode=Db01SourcePositiveCollectionAreaCode;

export const DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS=Object.freeze({
  Furniture:6746,Clothing:2041,Trimming:365,Makeup:69,
} as const);
export const DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS=Object.freeze({
  1:6455,2:453,3:469,4:459,5:615,4097:258,
} as const);
export const DB01_NATIVE_POSITIVE_AREA_SOURCE_TOTAL=9221 as const;
export const DB01_NATIVE_POSITIVE_AREA_SOURCE_MATCHED=8709 as const;
export const DB01_NATIVE_POSITIVE_AREA_SOURCE_UNRESOLVED=512 as const;

export interface Db01UnifiedPositiveAreaItem{
  readonly itemId:number;
  readonly originalNativeCategory:Db01NativePositiveAreaCategory;
  readonly originalNativeClass:string;
  /** Positive original tag matches only, ordered by the original
   * CollectionsUIConfig array; this is NOT game UI item membership.
   */
  readonly positiveAreaCodes:readonly Db01NativePositiveAreaCode[];
  readonly firstProvenPositiveAreaCode:Db01NativePositiveAreaCode|null;
  readonly sourceOriginalIHasTagsAndSetSemanticsVerified:true;
  readonly allAreasNativeDefaultPredicateVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db01UnifiedPositiveAreaCoverage{
  readonly gameVersion:'1.26.2';
  readonly sourceDefinitionCount:9221;
  readonly originalNativeCategoryCounts:
    Readonly<Record<Db01NativePositiveAreaCategory,number>>;
  readonly positiveAreaItems:8709;
  readonly unresolvedPositiveAreaItems:512;
  /** Each source object matches at most one positive native area. */
  readonly positiveAreaByCode:Readonly<Record<number,number>>;
  readonly verifiedOriginalNativeHasTagSource:true;
  readonly gameCollectionUiMembershipVerified:false;
  readonly allAreasNativeDefaultPredicateVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01UnifiedPositiveAreaQuery{
  /** OR by native source category. Empty = no results. */
  readonly nativeCategories?:readonly Db01NativePositiveAreaCategory[];
  /** OR by positive native code; [0] is UNFILTERED SOURCE ITEMS,
   * not the native code-0 default Item predicate. No 0 mixed with positives.
   * Omitted means [0].
   */
  readonly areaCodes?:readonly (Db01NativePositiveAreaCode|0)[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01UnifiedPositiveAreaPage{
  readonly total:number;
  readonly itemIds:readonly number[];
  readonly hasMore:boolean;
  readonly sourcePositiveNativeHasTagOnly:true;
  readonly allAreasMeansUnfilteredOriginalSource:boolean;
  readonly gameCollectionUiMembershipVerified:false;
  readonly allAreasNativeDefaultPredicateVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01UnifiedPositiveAreaClient{
  readonly schema:typeof DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA;
  readonly gameVersion:'1.26.2';
  getItem(itemId:number):Promise<Readonly<Db01UnifiedPositiveAreaItem>|null>;
  getCoverage():Promise<Readonly<Db01UnifiedPositiveAreaCoverage>>;
  search(query?:Db01UnifiedPositiveAreaQuery):
    Promise<Readonly<Db01UnifiedPositiveAreaPage>>;
}

const order=Object.freeze(
  DB01_COLLECTION_AREA_SOURCE_CONFIGS.filter(x=>x.gameplayTagId>0)
    .map(x=>x.areaCode as Db01NativePositiveAreaCode));
const validCodes=new Set<number>(order);
const categories=Object.freeze([
  'Furniture','Clothing','Trimming','Makeup',
] as const);
const validCategories=new Set<string>(categories);
const positive=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonnegative=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function check(value:unknown,reason:string):asserts value{
  if(!value)throw new TypeError('DB01_UNIFIED_NATIVE_AREA_'+reason);
}
check(order.length===6&&new Set(order).size===6&&
  categories.length===4&&
  Object.values(DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS).reduce(
    (a,b)=>a+b,0)===DB01_NATIVE_POSITIVE_AREA_SOURCE_TOTAL&&
  Object.values(DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS).reduce(
    (a,b)=>a+b,0)===DB01_NATIVE_POSITIVE_AREA_SOURCE_MATCHED&&
  DB01_NATIVE_POSITIVE_AREA_SOURCE_MATCHED+
    DB01_NATIVE_POSITIVE_AREA_SOURCE_UNRESOLVED===
    DB01_NATIVE_POSITIVE_AREA_SOURCE_TOTAL&&
  order.every(code=>DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS[code]===
    DB01_FURNITURE_ORIGINAL_POSITIVE_AREA_CENSUS[code]+
    DB01_WARDROBE_POSITIVE_AREA_CENSUS[code]),
  'STATIC_ORIGINAL_SOURCE_CENSUS_OR_ORDER_DRIFT');

function parseQuery(raw:Db01UnifiedPositiveAreaQuery){
  check(!!raw&&typeof raw==='object'&&!Array.isArray(raw),
    'INVALID_QUERY');
  const nativeCategories=raw.nativeCategories??categories;
  check(Array.isArray(nativeCategories)&&
    nativeCategories.length<=4&&
    nativeCategories.every(x=>validCategories.has(x))&&
    new Set(nativeCategories).size===nativeCategories.length,
    'INVALID_NATIVE_CATEGORY');
  const areaCodes=raw.areaCodes??[0];
  check(Array.isArray(areaCodes)&&areaCodes.length>=1&&
    areaCodes.length<=6&&
    areaCodes.every(x=>x===0||validCodes.has(x))&&
    new Set(areaCodes).size===areaCodes.length&&
    (!areaCodes.includes(0)||areaCodes.length===1),
    'INVALID_OR_AMBIGUOUS_NATIVE_AREA');
  const offset=raw.offset??0,limit=raw.limit??100;
  check(nonnegative(offset)&&offset<=1_000_000&&
    nonnegative(limit)&&limit<=1000,
    'INVALID_PAGING');
  return Object.freeze({
    categories:Object.freeze([...nativeCategories]),
    areas:Object.freeze([...areaCodes]) as readonly
      (Db01NativePositiveAreaCode|0)[],
    offset,limit,
  });
}

type Source='furniture'|'wardrobe';
type SourceChunk=Readonly<{total:number;itemIds:readonly number[];hasMore:boolean}>;
interface Cursor{
  readonly source:Source;
  readonly total:number;
  loaded:number;
  position:number;
  lastConsumed:number;
  page:readonly number[];
  index:number;
}

export function createDb01UnifiedPositiveAreaClient(
  furniture:Db01FurniturePositiveAreaSourceClient,
  wardrobe:Db01WardrobeOriginalClient,
):Db01UnifiedPositiveAreaClient{
  check(furniture?.contract===DB01_FURNITURE_NATIVE_AREA_PREDICATES&&
    furniture.gameVersion==='1.26.2'&&
    wardrobe?.schema===DB01_ORIGINAL_WARDROBE_HAS_TAG_SCHEMA&&
    wardrobe.gameVersion==='1.26.2'&&
    typeof furniture.getItem==='function'&&
    typeof furniture.getCoverage==='function'&&
    typeof furniture.search==='function'&&
    typeof wardrobe.getItem==='function'&&
    typeof wardrobe.getCoverage==='function'&&
    typeof wardrobe.search==='function',
    'PINNED_PRIVATE_ORIGINAL_SOURCE_CLIENTS_REQUIRED');

  function verifiedItem(
    row:Db01UnifiedPositiveAreaItem,
  ):Readonly<Db01UnifiedPositiveAreaItem>{
    check(positive(row.itemId)&&
      validCategories.has(row.originalNativeCategory)&&
      typeof row.originalNativeClass==='string'&&
      row.originalNativeClass.length>0&&
      Array.isArray(row.positiveAreaCodes)&&
      row.positiveAreaCodes.length<=6&&
      row.positiveAreaCodes.every(x=>validCodes.has(x))&&
      new Set(row.positiveAreaCodes).size===
        row.positiveAreaCodes.length&&
      order.filter(code=>row.positiveAreaCodes.includes(code)).every(
        (code,index)=>row.positiveAreaCodes[index]===code),
      'UNTRUSTED_ORIGINAL_ITEM_AREAS');
    return Object.freeze(row);
  }

  async function getItem(itemId:number):
    Promise<Readonly<Db01UnifiedPositiveAreaItem>|null>{
    check(positive(itemId),'INVALID_ITEM_ID');
    // Item ID numeric ranges are NOT used as an unverified native category
    // classifier. Both source clients are consulted and collisions rejected.
    const [a,b]=await Promise.all([
      furniture.getItem(itemId),wardrobe.getItem(itemId),
    ]);
    check(!(a&&b),'CROSS_SOURCE_ORIGINAL_ITEM_ID_COLLISION');
    if(a){
      check(a.itemId===itemId&&
        a.positiveNativeHasTagPredicatesVerified===true&&
        a.originalAllAreasDefaultHasTagEvaluated===false&&
        a.actualCollectionUiMembershipVerified===false&&
        a.gameWorldAvailabilityVerified===false&&
        a.playerEntitlementVerified===false,
        'FURNITURE_SOURCE_PROOF_REQUIRED');
      return verifiedItem({
        itemId,originalNativeCategory:'Furniture',
        originalNativeClass:a.originalNativeFurnitureClass,
        positiveAreaCodes:Object.freeze([...a.matchedPositiveAreaCodes]),
        firstProvenPositiveAreaCode:a.firstProvenAreaCode,
        sourceOriginalIHasTagsAndSetSemanticsVerified:true,
        allAreasNativeDefaultPredicateVerified:false,
        gameCollectionUiMembershipVerified:false,
        worldAvailabilityVerified:false,
        dlcEntitlementVerified:false,
        playerOwnershipVerified:false,
      });
    }
    if(b){
      check(b.original.itemId===itemId&&
        b.sourceShardHashVerified===true&&
        b.gameUiCollectionMembershipVerified===false&&
        b.worldAvailabilityVerified===false&&
        b.dlcEntitlementVerified===false,
        'WARDROBE_SOURCE_PROOF_REQUIRED');
      const positiveAreas=Object.freeze([...b.positiveAreaCodes]);
      return verifiedItem({
        itemId,originalNativeCategory:b.original.nativeCategory,
        originalNativeClass:b.original.originalNativeClass,
        positiveAreaCodes:positiveAreas,
        firstProvenPositiveAreaCode:positiveAreas[0]??null,
        sourceOriginalIHasTagsAndSetSemanticsVerified:true,
        allAreasNativeDefaultPredicateVerified:false,
        gameCollectionUiMembershipVerified:false,
        worldAvailabilityVerified:false,
        dlcEntitlementVerified:false,
        playerOwnershipVerified:false,
      });
    }
    return null;
  }

  let coverageTask:Promise<Readonly<Db01UnifiedPositiveAreaCoverage>>|null=null;
  async function getCoverage():
    Promise<Readonly<Db01UnifiedPositiveAreaCoverage>>{
    if(coverageTask)return coverageTask;
    coverageTask=(async()=>{
      const [f,w]=await Promise.all([
        furniture.getCoverage(),wardrobe.getCoverage(),
      ]);
      check(f.gameVersion==='1.26.2'&&
        f.originalFurnitureCount===6746&&
        f.anyPositiveAreaTagItems===6303&&
        f.withoutPositiveAreaTagItems===443&&
        f.originalPositiveHasTagPredicatesVerified===true&&
        f.allAreasNativeDefaultTagVerified===false&&
        f.nativeGameUiAreaMembershipVerified===false&&
        w.sourceDefinitionCount===2475&&
        w.sourceResolvedSetItemReferences===2405&&
        w.positiveAreaItems===2406&&
        w.sourceUnassignedPositiveAreaItems===69&&
        w.sourceVerifiedPositiveAreaPredicates===true&&
        w.originalAllAreasDefaultHasTagEvaluated===false&&
        w.runtimeCollectionUiMembershipVerified===false&&
        categories.slice(1).every(c=>
          w.originalCategoryCounts[c as Db01WardrobeOriginalCategory]===
            DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS[c])&&
        order.every(code=>
          f.sourceItemsByPositiveArea[code]+w.positiveAreaByCode[code]===
            DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS[code]),
        'PINNED_SOURCE_CENSUS_OR_PROOF_DRIFT');
      return Object.freeze({
        gameVersion:'1.26.2',
        sourceDefinitionCount:DB01_NATIVE_POSITIVE_AREA_SOURCE_TOTAL,
        originalNativeCategoryCounts:
          DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS,
        positiveAreaItems:DB01_NATIVE_POSITIVE_AREA_SOURCE_MATCHED,
        unresolvedPositiveAreaItems:
          DB01_NATIVE_POSITIVE_AREA_SOURCE_UNRESOLVED,
        positiveAreaByCode:DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS,
        verifiedOriginalNativeHasTagSource:true,
        gameCollectionUiMembershipVerified:false,
        allAreasNativeDefaultPredicateVerified:false,
        dlcEntitlementVerified:false,
      });
    })().catch(e=>{coverageTask=null;throw e;});
    return coverageTask;
  }

  async function search(query:Db01UnifiedPositiveAreaQuery={}):
    Promise<Readonly<Db01UnifiedPositiveAreaPage>>{
    const q=parseQuery(query);
    const needFurniture=q.categories.includes('Furniture');
    const selectedWardrobe=q.categories.filter(
      (c):c is Db01WardrobeOriginalCategory=>c!=='Furniture');
    const needWardrobe=selectedWardrobe.length>0;
    async function page(
      source:Source,offset:number,limit:number,
    ):Promise<SourceChunk>{
      if(source==='furniture'){
        const found=await furniture.search({
          areaCodes:q.areas,offset,limit,
        });
        check(found.originalPositiveAreaNativeSourceOnly===true&&
          found.actualCollectionUiMembershipVerified===false&&
          found.areaDefaultNativePredicateEvaluated===false&&
          found.playerOwnershipVerified===false&&
          found.dlcEntitlementVerified===false,
          'UNVERIFIED_FURNITURE_SEARCH');
        return found;
      }
      const found=await wardrobe.search({
        nativeCategories:selectedWardrobe,areaCodes:q.areas,
        offset,limit,
      });
      check(found.sourceNativeHasTagMatchesOnly===true&&
        found.actualCollectionUiMembershipVerified===false&&
        found.allAreasDefaultNativePredicateEvaluated===false&&
        found.playerEntitlementVerified===false,
        'UNVERIFIED_WARDROBE_SEARCH');
      return found;
    }

    const [fTotal,wTotal]=await Promise.all([
      needFurniture?page('furniture',0,0):null,
      needWardrobe?page('wardrobe',0,0):null,
    ]);
    const maxTotal=(source:Source)=>
      source==='furniture'?6746:2475;
    for(const [source,summary] of [
      ['furniture',fTotal],['wardrobe',wTotal],
    ] as const){
      if(summary===null)continue;
      check(nonnegative(summary.total)&&
        summary.total<=maxTotal(source)&&
        Array.isArray(summary.itemIds)&&
        summary.itemIds.length===0&&
        summary.hasMore===(summary.total>0),
        'INVALID_ORIGINAL_SOURCE_COUNT_PAGE');
    }
    const total=(fTotal?.total??0)+(wTotal?.total??0);
    if(q.limit===0||q.offset>=total){
      return Object.freeze({
        total,itemIds:Object.freeze([] as number[]),
        hasMore:total>q.offset,
        sourcePositiveNativeHasTagOnly:true,
        allAreasMeansUnfilteredOriginalSource:q.areas[0]===0,
        gameCollectionUiMembershipVerified:false,
        allAreasNativeDefaultPredicateVerified:false,
        worldAvailabilityVerified:false,
        playerOwnershipVerified:false,
        dlcEntitlementVerified:false,
      });
    }
    const cursors:Cursor[]=[];
    if(fTotal)cursors.push({
      source:'furniture',total:fTotal.total,loaded:0,position:0,
      lastConsumed:0,page:[],index:0,
    });
    if(wTotal)cursors.push({
      source:'wardrobe',total:wTotal.total,loaded:0,position:0,
      lastConsumed:0,page:[],index:0,
    });
    async function head(cursor:Cursor):Promise<number|null>{
      while(cursor.index>=cursor.page.length){
        if(cursor.loaded>=cursor.total)return null;
        const current=await page(cursor.source,cursor.loaded,
          Math.min(256,cursor.total-cursor.loaded));
        check(current.total===cursor.total&&
          Array.isArray(current.itemIds)&&
          current.itemIds.length>0&&
          current.itemIds.length<=256&&
          current.itemIds.every(positive)&&
          current.itemIds.every((id,i)=>i===0?
            id>cursor.lastConsumed:id>current.itemIds[i-1])&&
          current.hasMore===(
            cursor.loaded+current.itemIds.length<cursor.total),
          'ORIGINAL_SOURCE_PAGE_CORRUPT_OR_UNSORTED');
        cursor.loaded+=current.itemIds.length;
        cursor.page=current.itemIds;
        cursor.index=0;
      }
      return cursor.page[cursor.index];
    }
    const collected:number[]=[];
    let seen=0;
    const until=Math.min(total,q.offset+q.limit);
    while(seen<until){
      const entries=await Promise.all(cursors.map(head));
      let selectedIndex=-1,lowest=Infinity;
      for(let i=0;i<entries.length;i++){
        const candidate=entries[i];
        if(candidate===null)continue;
        check(candidate!==lowest,
          'DUPLICATE_ITEM_ID_ACROSS_ORIGINAL_SOURCES');
        if(candidate<lowest){lowest=candidate;selectedIndex=i;}
      }
      check(selectedIndex>=0,'PREMATURE_ORIGINAL_SOURCE_EXHAUSTION');
      if(seen>=q.offset)collected.push(lowest);
      const selected=cursors[selectedIndex];
      selected.lastConsumed=lowest;
      selected.index++;
      seen++;
    }
    return Object.freeze({
      total,itemIds:Object.freeze(collected),
      hasMore:total>q.offset+collected.length,
      sourcePositiveNativeHasTagOnly:true,
      allAreasMeansUnfilteredOriginalSource:q.areas[0]===0,
      gameCollectionUiMembershipVerified:false,
      allAreasNativeDefaultPredicateVerified:false,
      worldAvailabilityVerified:false,
      playerOwnershipVerified:false,
      dlcEntitlementVerified:false,
    });
  }

  return Object.freeze({
    schema:DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA,
    gameVersion:'1.26.2' as const,
    getItem,getCoverage,search,
  });
}
