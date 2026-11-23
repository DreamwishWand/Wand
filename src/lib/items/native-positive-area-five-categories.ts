/**
 * Steam v1.26.2 DB-01 five-category original native area source index.
 *
 * Reuses the existing four-category verified source search (9,221 records)
 * and the independent Companion native source reader (394 records). For
 * CritterItemData, NO IHasTags exists: its original CollectionArea route
 * can depend on ProfileWorld village/scene. Critter area evidence stays
 * 'requires_profile_world_scene', never 'tag_does_not_match'.
 *
 * Positive area filtering is ONLY a query over original native Tag matches.
 * It does not establish live Collection screen membership, world access,
 * purchased DLC, ownership or the native AllAreas/default route.
 * Private original shards are loaded only by supplied verified readers.
 * Run broad source scans from a Web Worker.
 */
import {
  DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS,
  DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS,
  type Db01UnifiedPositiveAreaClient,
  type Db01NativePositiveAreaCategory,
  type Db01NativePositiveAreaCode,
} from './native-positive-area-unified.ts';
import {
  DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA,
  DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS,
  DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS,
  type Db01OriginalCompanionClient,
  type Db01OriginalCompanionKind,
} from './companion-native-has-tag.ts';
import {DB01_COLLECTION_AREA_SOURCE_CONFIGS} from './collection-area-source-config.ts';

export const DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA=
  'wand.db01.native-positive-area-five-category-steam-1262@1' as const;

export type Db01FiveCategoryNativeCategory =
  Db01NativePositiveAreaCategory|'Companion';
export type Db01SourceAreaEvidence =
  'native_positive_tag'|
  'native_ihastags_without_positive_tag'|
  'requires_profile_world_scene';

export const DB01_FIVE_CATEGORY_SOURCE_COUNTS=Object.freeze({
  ...DB01_NATIVE_POSITIVE_AREA_SOURCE_COUNTS,Companion:394,
} as const);
export const DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS=Object.freeze({
  1:6625,2:473,3:485,4:478,5:632,4097:262,
} as const);
export const DB01_FIVE_CATEGORY_SOURCE_TOTAL=9615 as const;
export const DB01_FIVE_CATEGORY_NATIVE_POSITIVE=8955 as const;
export const DB01_FIVE_CATEGORY_NATIVE_TAG_NO_POSITIVE=535 as const;
export const DB01_FIVE_CATEGORY_CRITTER_SCENE_UNKNOWN=125 as const;

export interface Db01FiveCategorySourceItem {
  readonly itemId:number;
  readonly nativeCategory:Db01FiveCategoryNativeCategory;
  readonly originalNativeClass:string;
  readonly companionKind:Db01OriginalCompanionKind|null;
  /** null specifically means original CritterItemData has NO IHasTags.
   * [] means original IHasTags was evaluated with no positive area tag.
   */
  readonly positiveAreaCodes:readonly Db01NativePositiveAreaCode[]|null;
  readonly firstProvenPositiveAreaCode:Db01NativePositiveAreaCode|null;
  readonly sourceAreaEvidence:Db01SourceAreaEvidence;
  readonly critterLocationOneofFieldNumber:6|7|null;
  readonly originalSourceVerified:true;
  readonly critterRuntimeProfileSceneResolved:false;
  readonly nativeAllAreasDefaultVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01FiveCategorySourceCoverage {
  readonly gameVersion:'1.26.2';
  readonly sourceDefinitions:9615;
  readonly byOriginalNativeCategory:
    Readonly<Record<Db01FiveCategoryNativeCategory,number>>;
  readonly sourcePositiveNativeAreaItems:8955;
  readonly sourceIHasTagsWithoutPositiveArea:535;
  readonly sourceCritterNeedsProfileWorldScene:125;
  readonly sourcePositiveByOriginalArea:Readonly<Record<number,number>>;
  readonly sourceOriginalItemAndClassVerified:true;
  readonly nativeAllAreasDefaultVerified:false;
  readonly runtimeCritterSceneResolved:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01FiveCategorySourceQuery {
  /** OR within category; omitted selects all five native categories. */
  readonly nativeCategories?:readonly Db01FiveCategoryNativeCategory[];
  /** Only applied if Companion is selected. Defaults to all 3 classes. */
  readonly companionKinds?:readonly Db01OriginalCompanionKind[];
  /** 0 means all original source records, INCLUDING all 125 Critters.
   * Positive codes return only verified positive native Tag matches:
   * missing Critters are UNKNOWN, not confirmed negatives.
   */
  readonly areaCodes?:readonly (Db01NativePositiveAreaCode|0)[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01FiveCategorySourcePage {
  readonly itemIds:readonly number[];
  readonly total:number;
  readonly hasMore:boolean;
  readonly sourceNativePositiveTagOnly:true;
  readonly allAreasMeansUnfilteredOriginalSource:boolean;
  /** True when a positive-area query selected Critters, whose scene-based
   * matches have not been evaluated; omission does NOT prove non-membership.
   */
  readonly selectedCritterSceneCandidatesUnresolved:boolean;
  readonly runtimeCritterProfileSceneVerified:false;
  readonly nativeAllAreasDefaultVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01FiveCategorySourceClient {
  readonly schema:typeof DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA;
  readonly gameVersion:'1.26.2';
  getItem(itemId:number):Promise<Readonly<Db01FiveCategorySourceItem>|null>;
  getCoverage():Promise<Readonly<Db01FiveCategorySourceCoverage>>;
  search(query?:Db01FiveCategorySourceQuery):
    Promise<Readonly<Db01FiveCategorySourcePage>>;
}

const categories=Object.freeze([
  'Furniture','Clothing','Trimming','Makeup','Companion',
] as const);
const categorySet=new Set<string>(categories);
const companionKinds=Object.freeze(['pet','mount','critter'] as const);
const companionSet=new Set<string>(companionKinds);
const positiveAreaCodes=Object.freeze(
  DB01_COLLECTION_AREA_SOURCE_CONFIGS.filter(x=>x.gameplayTagId>0)
    .map(x=>x.areaCode as Db01NativePositiveAreaCode));
const areaSet=new Set<number>(positiveAreaCodes);
const pos=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const nonneg=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB01_FIVE_NATIVE_AREA_'+code);
}

check(categories.length===5&&positiveAreaCodes.length===6&&
  Object.values(DB01_FIVE_CATEGORY_SOURCE_COUNTS)
    .reduce((a,b)=>a+b,0)===DB01_FIVE_CATEGORY_SOURCE_TOTAL&&
  Object.values(DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS)
    .reduce((a,b)=>a+b,0)===DB01_FIVE_CATEGORY_NATIVE_POSITIVE&&
  DB01_FIVE_CATEGORY_NATIVE_POSITIVE+
    DB01_FIVE_CATEGORY_NATIVE_TAG_NO_POSITIVE+
    DB01_FIVE_CATEGORY_CRITTER_SCENE_UNKNOWN===
    DB01_FIVE_CATEGORY_SOURCE_TOTAL&&
  positiveAreaCodes.every(code=>
    DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS[code]===
      DB01_NATIVE_POSITIVE_AREA_SOURCE_AREA_COUNTS[code]+
      DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS[code])&&
  Object.values(DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS)
    .reduce((a,b)=>a+b,0)===394,
  'PINNED_STATIC_CENSUS');

function parse(raw:Db01FiveCategorySourceQuery){
  check(raw!==null&&typeof raw==='object'&&!Array.isArray(raw),
    'INVALID_QUERY');
  const kinds=raw.companionKinds??companionKinds;
  const chosen=raw.nativeCategories??categories;
  const areas=raw.areaCodes??[0];
  const offset=raw.offset??0,limit=raw.limit??100;
  check(Array.isArray(chosen)&&chosen.length<=5&&
    chosen.every(c=>categorySet.has(c))&&
    new Set(chosen).size===chosen.length,
    'INVALID_SOURCE_CATEGORIES');
  check(Array.isArray(kinds)&&kinds.length<=3&&
    kinds.every(c=>companionSet.has(c))&&
    new Set(kinds).size===kinds.length&&
    (raw.companionKinds===undefined||chosen.includes('Companion')),
    'INVALID_COMPANION_KINDS');
  check(Array.isArray(areas)&&areas.length>=1&&areas.length<=6&&
    areas.every(a=>a===0||areaSet.has(a))&&
    new Set(areas).size===areas.length&&
    (!areas.includes(0)||areas.length===1),
    'INVALID_ORIGINAL_AREA_CODES');
  check(nonneg(offset)&&offset<=1_000_000&&
    nonneg(limit)&&limit<=1000,
    'INVALID_PAGING');
  return Object.freeze({
    categories:Object.freeze([...chosen]),
    kinds:Object.freeze([...kinds]),
    areas:Object.freeze([...areas]) as readonly
      (Db01NativePositiveAreaCode|0)[],
    offset,limit,
  });
}

type Source='four_categories'|'companion';
type SourcePage=Readonly<{itemIds:readonly number[];total:number;hasMore:boolean}>;
interface ReaderCursor {
  readonly source:Source;
  readonly total:number;
  loaded:number;
  lastConsumed:number;
  page:readonly number[];
  cursor:number;
}

export function createDb01FiveCategorySourceClient(
  four:Db01UnifiedPositiveAreaClient,
  companion:Db01OriginalCompanionClient,
):Db01FiveCategorySourceClient{
  check(four?.schema===DB01_NATIVE_POSITIVE_AREA_UNIFIED_SCHEMA&&
    four.gameVersion==='1.26.2'&&
    companion?.schema===DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA&&
    companion.gameVersion==='1.26.2'&&
    typeof four.getItem==='function'&&
    typeof four.getCoverage==='function'&&
    typeof four.search==='function'&&
    typeof companion.getItem==='function'&&
    typeof companion.getCoverage==='function'&&
    typeof companion.search==='function',
    'PINNED_READERS_REQUIRED');

  async function getItem(id:number):
    Promise<Readonly<Db01FiveCategorySourceItem>|null>{
    check(pos(id),'INVALID_ITEM_ID');
    const [item,pet]=await Promise.all([
      four.getItem(id),companion.getItem(id),
    ]);
    check(!(item&&pet),'DUPLICATE_CROSS_SOURCE_ITEM_ID');
    if(item){
      check(item.itemId===id&&
        item.sourceOriginalIHasTagsAndSetSemanticsVerified===true&&
        item.allAreasNativeDefaultPredicateVerified===false&&
        item.gameCollectionUiMembershipVerified===false&&
        item.worldAvailabilityVerified===false&&
        item.dlcEntitlementVerified===false&&
        item.playerOwnershipVerified===false&&
        Array.isArray(item.positiveAreaCodes)&&
        item.positiveAreaCodes.length<=1,
        'FOUR_CATEGORY_NATIVE_PROOF');
      const tags=Object.freeze([...item.positiveAreaCodes]);
      return Object.freeze({
        itemId:id,nativeCategory:item.originalNativeCategory,
        originalNativeClass:item.originalNativeClass,
        companionKind:null,positiveAreaCodes:tags,
        firstProvenPositiveAreaCode:tags[0]??null,
        sourceAreaEvidence:tags.length?
          'native_positive_tag' as const:
          'native_ihastags_without_positive_tag' as const,
        critterLocationOneofFieldNumber:null,
        originalSourceVerified:true as const,
        critterRuntimeProfileSceneResolved:false as const,
        nativeAllAreasDefaultVerified:false as const,
        gameCollectionUiMembershipVerified:false as const,
        worldAvailabilityVerified:false as const,
        playerOwnershipVerified:false as const,
        dlcEntitlementVerified:false as const,
      });
    }
    if(!pet)return null;
    const data=pet.source;
    check(data.itemId===id&&
      data.nativeCategory==='Companion'&&
      pet.sourceShardHashVerified===true&&
      pet.sourceOriginalNativeClassVerified===true&&
      pet.actualCollectionUiMembershipVerified===false&&
      pet.nativeAllAreasDefaultPredicateVerified===false&&
      pet.playerEntitlementVerified===false&&
      data.runtimeCritterWorldSceneVerified===false,
      'COMPANION_NATIVE_PROOF');
    const critter=data.nativeKind==='critter';
    const tags=pet.positiveNativeAreaCodes;
    check((critter&&
        tags===null&&pet.originalIHasTagsInterface===false&&
        pet.needsRuntimeCritterSceneEvaluation===true&&
        (data.critterLocationOneofFieldNumber===6||
         data.critterLocationOneofFieldNumber===7))||
      (!critter&&
        Array.isArray(tags)&&tags.length<=1&&
        pet.originalIHasTagsInterface===true&&
        pet.needsRuntimeCritterSceneEvaluation===false&&
        data.critterLocationOneofFieldNumber===null),
      'CRITTER_NULL_IS_NOT_NATIVE_HAS_TAG_FALSE');
    const codes=tags===null?null:Object.freeze([...tags]);
    return Object.freeze({
      itemId:id,nativeCategory:'Companion' as const,
      originalNativeClass:data.originalNativeClass,
      companionKind:data.nativeKind,
      positiveAreaCodes:codes,
      firstProvenPositiveAreaCode:codes?.[0]??null,
      sourceAreaEvidence:critter?
        'requires_profile_world_scene' as const:
        codes!.length?'native_positive_tag' as const:
          'native_ihastags_without_positive_tag' as const,
      critterLocationOneofFieldNumber:critter?
        data.critterLocationOneofFieldNumber:null,
      originalSourceVerified:true as const,
      critterRuntimeProfileSceneResolved:false as const,
      nativeAllAreasDefaultVerified:false as const,
      gameCollectionUiMembershipVerified:false as const,
      worldAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const,
    });
  }

  let coverageCache:Promise<Readonly<Db01FiveCategorySourceCoverage>>|null=null;
  async function getCoverage():Promise<Readonly<Db01FiveCategorySourceCoverage>>{
    if(coverageCache)return coverageCache;
    coverageCache=(async()=>{
      const [f,c]=await Promise.all([
        four.getCoverage(),companion.getCoverage(),
      ]);
      check(f.gameVersion==='1.26.2'&&
        f.sourceDefinitionCount===9221&&
        f.positiveAreaItems===8709&&
        f.unresolvedPositiveAreaItems===512&&
        f.verifiedOriginalNativeHasTagSource===true&&
        f.allAreasNativeDefaultPredicateVerified===false&&
        f.gameCollectionUiMembershipVerified===false&&
        c.sourceDefinitions===394&&
        c.sourceNativeTaggedPositiveAreaItems===246&&
        c.sourceNativeTaggedWithoutPositiveArea===23&&
        c.sourceCritterRuntimeWorldUnknown===125&&
        c.sourceCritterLocationOneofCase6===105&&
        c.sourceCritterSceneOneofCase7===20&&
        c.nativeClassAndInterfaceSourceVerified===true&&
        c.critterRuntimeCollectionAreaVerified===false&&
        c.nativeAllAreasDefaultTagVerified===false&&
        c.actualGameUiMembershipVerified===false&&
        categories.slice(0,4).every(cat=>
          f.originalNativeCategoryCounts[
            cat as Db01NativePositiveAreaCategory]===
            DB01_FIVE_CATEGORY_SOURCE_COUNTS[cat])&&
        positiveAreaCodes.every(code=>
          f.positiveAreaByCode[code]+
            c.sourcePositiveAreaByCode[code]===
            DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS[code]),
        'ORIGINAL_SOURCE_COUNT_OR_EVIDENCE_DRIFT');
      return Object.freeze({
        gameVersion:'1.26.2' as const,
        sourceDefinitions:DB01_FIVE_CATEGORY_SOURCE_TOTAL,
        byOriginalNativeCategory:DB01_FIVE_CATEGORY_SOURCE_COUNTS,
        sourcePositiveNativeAreaItems:DB01_FIVE_CATEGORY_NATIVE_POSITIVE,
        sourceIHasTagsWithoutPositiveArea:
          DB01_FIVE_CATEGORY_NATIVE_TAG_NO_POSITIVE,
        sourceCritterNeedsProfileWorldScene:
          DB01_FIVE_CATEGORY_CRITTER_SCENE_UNKNOWN,
        sourcePositiveByOriginalArea:
          DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,
        sourceOriginalItemAndClassVerified:true as const,
        nativeAllAreasDefaultVerified:false as const,
        runtimeCritterSceneResolved:false as const,
        gameCollectionUiMembershipVerified:false as const,
        playerOwnershipVerified:false as const,
        dlcEntitlementVerified:false as const,
      });
    })().catch(error=>{coverageCache=null;throw error;});
    return coverageCache;
  }

  async function search(query:Db01FiveCategorySourceQuery={}):
    Promise<Readonly<Db01FiveCategorySourcePage>>{
    const q=parse(query);
    const selectedFour=q.categories.filter(
      (x):x is Db01NativePositiveAreaCategory=>x!=='Companion');
    const includesCompanion=q.categories.includes('Companion')&&
      q.kinds.length>0;
    const crittersSelected=includesCompanion&&q.kinds.includes('critter');
    const sceneUnknown=crittersSelected&&q.areas[0]!==0;
    async function sourcePage(source:Source,offset:number,limit:number):
      Promise<SourcePage>{
      if(source==='four_categories'){
        const page=await four.search({
          nativeCategories:selectedFour,areaCodes:q.areas,
          offset,limit,
        });
        check(page.sourcePositiveNativeHasTagOnly===true&&
          page.gameCollectionUiMembershipVerified===false&&
          page.allAreasNativeDefaultPredicateVerified===false&&
          page.worldAvailabilityVerified===false&&
          page.playerOwnershipVerified===false&&
          page.dlcEntitlementVerified===false,
          'UNVERIFIED_FOUR_CATEGORY_PAGE');
        return page;
      }
      const page=await companion.search({
        kinds:q.kinds,areaCodes:q.areas,offset,limit,
      });
      check(page.sourceNativePetAndMountTagOnly===true&&
        page.critterProfileWorldAreaUnresolved===true&&
        page.actualCollectionUiMembershipVerified===false&&
        page.nativeAllAreasDefaultPredicateVerified===false&&
        page.playerEntitlementVerified===false,
        'UNVERIFIED_COMPANION_PAGE');
      return page;
    }
    const summaries=await Promise.all([
      selectedFour.length?
        sourcePage('four_categories',0,0):null,
      includesCompanion?
        sourcePage('companion',0,0):null,
    ]);
    const sources:Source[]=['four_categories','companion'];
    let total=0;
    const cursors:ReaderCursor[]=[];
    for(let i=0;i<2;i++){
      const summary=summaries[i];
      if(!summary)continue;
      const cap=i===0?9221:394;
      check(nonneg(summary.total)&&summary.total<=cap&&
        Array.isArray(summary.itemIds)&&summary.itemIds.length===0&&
        summary.hasMore===(summary.total>0),
        'CORRUPT_SOURCE_TOTAL_PAGE');
      total+=summary.total;
      if(summary.total)cursors.push({
        source:sources[i],total:summary.total,
        loaded:0,lastConsumed:0,page:[],cursor:0,
      });
    }
    const wrap=(items:readonly number[])=>
      Object.freeze({
        itemIds:Object.freeze([...items]),total,
        hasMore:total>q.offset+items.length,
        sourceNativePositiveTagOnly:true as const,
        allAreasMeansUnfilteredOriginalSource:q.areas[0]===0,
        selectedCritterSceneCandidatesUnresolved:sceneUnknown,
        runtimeCritterProfileSceneVerified:false as const,
        nativeAllAreasDefaultVerified:false as const,
        gameCollectionUiMembershipVerified:false as const,
        playerOwnershipVerified:false as const,
        dlcEntitlementVerified:false as const,
      });
    if(!q.limit||q.offset>=total)return wrap([]);
    async function head(c:ReaderCursor):Promise<number|null>{
      while(c.cursor===c.page.length){
        if(c.loaded>=c.total)return null;
        const current=await sourcePage(c.source,c.loaded,
          Math.min(256,c.total-c.loaded));
        check(current.total===c.total&&
          Array.isArray(current.itemIds)&&
          current.itemIds.length>0&&current.itemIds.length<=256&&
          current.itemIds.every(pos)&&
          current.itemIds.every((n,i)=>i===0?
            n>c.lastConsumed:n>current.itemIds[i-1])&&
          current.hasMore===(
            c.loaded+current.itemIds.length<c.total),
          'CORRUPT_OR_UNSORTED_ORIGINAL_SOURCE_PAGE');
        c.loaded+=current.itemIds.length;
        c.page=current.itemIds;
        c.cursor=0;
      }
      return c.page[c.cursor];
    }
    const ids:number[]=[];
    const end=Math.min(total,q.offset+q.limit);
    for(let seen=0;seen<end;seen++){
      const values=await Promise.all(cursors.map(head));
      let index=-1,minimum=Infinity;
      for(let i=0;i<values.length;i++){
        const n=values[i];
        if(n===null)continue;
        check(n!==minimum,
          'CROSS_SOURCE_ORIGINAL_ITEM_ID_COLLISION');
        if(n<minimum){minimum=n;index=i;}
      }
      check(index>=0,'SOURCE_EXHAUSTED_BEFORE_TOTAL');
      if(seen>=q.offset)ids.push(minimum);
      const selected=cursors[index];
      selected.lastConsumed=minimum;
      selected.cursor++;
    }
    return wrap(ids);
  }

  return Object.freeze({
    schema:DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA,
    gameVersion:'1.26.2' as const,
    getItem,getCoverage,search,
  });
}
