/**
 * DB-00 owner-local five-category CollectionArea source browse for Steam
 * v1.26.2. Reuses DB-01's final 9,615-definition native-source merger:
 * Furniture, Clothing, Trimming, Makeup and Companion.
 *
 * CritterItemData does not implement IHasTags. Its source Location/Scene
 * oneof must be evaluated with a verified ProfileWorld/scene route before
 * asserting game Collection UI membership. We retain a NULL evidence
 * path, not an empty "no area" set. Code 0 means unfiltered SOURCE rows,
 * never the game's native AllAreas/default Item predicate.
 *
 * Private original shards are supplied through the DB-01 client only.
 * Browser consumers should run large private scans in a Web Worker.
 */
import {canonicalId} from './model.ts';
import type {PublicSharedGameSources} from './public-sources.ts';
import type {Db00SourceJoinedItem} from './source-join.ts';
import type {Db00OriginalCollectionArea}
  from './collection-area-sources.ts';
import {
  DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA,
  DB01_FIVE_CATEGORY_SOURCE_COUNTS,
  DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,
  DB01_FIVE_CATEGORY_SOURCE_TOTAL,
  DB01_FIVE_CATEGORY_NATIVE_POSITIVE,
  DB01_FIVE_CATEGORY_NATIVE_TAG_NO_POSITIVE,
  DB01_FIVE_CATEGORY_CRITTER_SCENE_UNKNOWN,
  type Db01FiveCategorySourceClient,
  type Db01FiveCategorySourceCoverage,
  type Db01FiveCategorySourceItem,
  type Db01FiveCategoryNativeCategory,
  type Db01SourceAreaEvidence
} from '../items/native-positive-area-five-categories.ts';
import type {
  Db01NativePositiveAreaCode
} from '../items/native-positive-area-unified.ts';
import type {
  Db01OriginalCompanionKind
} from '../items/companion-native-has-tag.ts';

export const DB00_LOCAL_FIVE_CATEGORY_SOURCE_CONTRACT=
  'wand.game-db.local-five-category-collection-area@1' as const;
type AreaCode=Db01NativePositiveAreaCode|0;
const CODES=Object.freeze([1,2,3,4,5,4097] as const);
const CATEGORIES=Object.freeze([
  'Furniture','Clothing','Trimming','Makeup','Companion'
] as const);
const KINDS=Object.freeze(['pet','mount','critter'] as const);
const MAX_PAGE=120;
function check(ok:unknown,reason:string):asserts ok {
  if(!ok)throw new TypeError('DB00_LOCAL_FIVE_AREA_'+reason);
}
export interface Db00LocalFiveAreaItem {
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly original:Readonly<Db01FiveCategorySourceItem>;
  readonly nativeCategory:Db01FiveCategoryNativeCategory;
  readonly companionKind:Db01OriginalCompanionKind|null;
  readonly sourceAreaEvidence:Db01SourceAreaEvidence;
  /** null = original Critter missing IHasTags, not a negative Tag match. */
  readonly positiveSourceAreas:readonly Db00OriginalCollectionArea[]|null;
  readonly firstProvenPositiveAreaCode:Db01NativePositiveAreaCode|null;
  readonly critterLocationOneofFieldNumber:6|7|null;
  readonly originalSourceVerified:true;
  readonly runtimeCritterSceneVerified:false;
  readonly nativeAllAreasDefaultVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00LocalFiveAreaCoverage{
  readonly snapshotId:string;
  readonly original:Readonly<Db01FiveCategorySourceCoverage>;
  readonly sourceDefinitions:9615;
  readonly sourcePositiveNativeAreaItems:8955;
  readonly originalHasTagsNoPositiveMatch:535;
  readonly critterProfileWorldSceneUnknown:125;
  readonly categoryCounts:Readonly<Record<Db01FiveCategoryNativeCategory,number>>;
  readonly positiveSourceAreaCounts:Readonly<Record<Db01NativePositiveAreaCode,number>>;
  readonly nativeAllAreasDefaultVerified:false;
  readonly critterRuntimeSceneVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00LocalFiveAreaQuery {
  readonly nativeCategories?:readonly Db01FiveCategoryNativeCategory[];
  readonly companionKinds?:readonly Db01OriginalCompanionKind[];
  /** [0] means unfiltered source rows, including 125 unresolved Critters. */
  readonly areaCodes?:readonly AreaCode[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00LocalFiveAreaPage {
  readonly snapshotId:string;
  readonly nativeCategories:readonly Db01FiveCategoryNativeCategory[];
  readonly companionKinds:readonly Db01OriginalCompanionKind[];
  readonly areaCodes:readonly AreaCode[];
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00LocalFiveAreaItem[];
  readonly allAreasMeansUnfilteredOriginalSource:boolean;
  /** Positive Tag query omits Critters pending runtime scene resolution. */
  readonly selectedCritterSceneCandidatesUnresolved:boolean;
  readonly runtimeCritterSceneVerified:false;
  readonly nativeAllAreasDefaultVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00LocalFiveAreaReader{
  readonly contract:typeof DB00_LOCAL_FIVE_CATEGORY_SOURCE_CONTRACT;
  readonly snapshotId:string;
  readonly gameVersion:'1.26.2';
  readonly sourceDefinitions:9615;
  readonly ownerLocalOnly:true;
  readonly publicationAuthorized:false;
  readonly originalSourceOnly:true;
  readonly gameCollectionUiMembershipVerified:false;
  getCoverage():Promise<Db00LocalFiveAreaCoverage>;
  getItem(itemId:string|number):Promise<Db00LocalFiveAreaItem|null>;
  search(query?:Db00LocalFiveAreaQuery):Promise<Db00LocalFiveAreaPage>;
}

export function joinDb00LocalFiveCategoryCollectionAreas(
  publicData:PublicSharedGameSources,
  source:Db01FiveCategorySourceClient
):Db00LocalFiveAreaReader{
  const db=publicData?.database;
  const areaIndex=publicData?.originalCollectionAreas;
  check(publicData?.schema==='wand.game-db.public-sources@1'&&
    publicData.snapshotId==='steam-1.26.2-native-itemlist-v1'&&
    db?.contract==='wand.game-db.shared@1'&&
    db.target.platform==='Steam'&&db.target.gameVersion==='1.26.2'&&
    db.itemCount===13202&&
    publicData.hasPrivateGameSource===false&&
    publicData.currentAvailabilityVerified===false&&
    publicData.playerOwnershipVerified===false&&
    typeof publicData.getItem==='function'&&
    areaIndex?.contract==='wand.game-db.original-collection-area-reference@1'&&
    areaIndex.platform==='Steam'&&areaIndex.gameVersion==='1.26.2'&&
    areaIndex.sourceConfigCount===7&&
    areaIndex.orderedAreas.length===7&&
    areaIndex.gameUiItemMembershipVerified===false&&
    source?.schema===DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA&&
    source.gameVersion==='1.26.2'&&
    typeof source.getCoverage==='function'&&
    typeof source.getItem==='function'&&
    typeof source.search==='function',
    'VERIFIED_FIVE_CATEGORY_ORIGINAL_SOURCE_REQUIRED');
  const native=areaIndex.orderedAreas.filter(
    x=>x.original.gameplayTagId>0
  );
  check(native.length===6&&
    native.every((a,i)=>a.areaCode===CODES[i]&&
      a.originalConfigVerified===true&&
      a.sourceTagCandidateOnly===true&&
      a.gameUiItemMembershipVerified===false)&&
    areaIndex.orderedAreas[6].areaCode===0&&
    areaIndex.orderedAreas[6].original.gameplayTagId===0,
    'ORIGINAL_AREA_ORDER_OR_DEFAULT_MISMATCH');
  const areaByCode=new Map<number,Db00OriginalCollectionArea>(
    native.map(x=>[x.areaCode,x])
  );
  check(areaByCode.size===6,'DUPLICATE_POSITIVE_AREA_CODE');

  let coverageTask:Promise<Db00LocalFiveAreaCoverage>|null=null;
  const getCoverage=():Promise<Db00LocalFiveAreaCoverage>=>{
    if(coverageTask)return coverageTask;
    coverageTask=(async()=>{
      const original=await source.getCoverage();
      const counts=original?.sourcePositiveByOriginalArea;
      const cats=original?.byOriginalNativeCategory;
      check(original?.gameVersion==='1.26.2'&&
        original.sourceDefinitions===DB01_FIVE_CATEGORY_SOURCE_TOTAL&&
        original.sourcePositiveNativeAreaItems===
          DB01_FIVE_CATEGORY_NATIVE_POSITIVE&&
        original.sourceIHasTagsWithoutPositiveArea===
          DB01_FIVE_CATEGORY_NATIVE_TAG_NO_POSITIVE&&
        original.sourceCritterNeedsProfileWorldScene===
          DB01_FIVE_CATEGORY_CRITTER_SCENE_UNKNOWN&&
        original.sourceOriginalItemAndClassVerified===true&&
        original.nativeAllAreasDefaultVerified===false&&
        original.runtimeCritterSceneResolved===false&&
        original.gameCollectionUiMembershipVerified===false&&
        original.playerOwnershipVerified===false&&
        original.dlcEntitlementVerified===false&&
        cats!==null&&typeof cats==='object'&&
        CATEGORIES.every(c=>cats[c]===
          DB01_FIVE_CATEGORY_SOURCE_COUNTS[c])&&
        counts!==null&&typeof counts==='object'&&
        CODES.every(code=>counts[code]===
          DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS[code])&&
        CATEGORIES.reduce((s,c)=>s+cats[c],0)===9615&&
        CODES.reduce((s,c)=>s+counts[c],0)===8955,
        'ORIGINAL_FIVE_CATEGORY_CENSUS_DRIFT');
      return Object.freeze({
        snapshotId:publicData.snapshotId,original,
        sourceDefinitions:9615 as const,
        sourcePositiveNativeAreaItems:8955 as const,
        originalHasTagsNoPositiveMatch:535 as const,
        critterProfileWorldSceneUnknown:125 as const,
        categoryCounts:DB01_FIVE_CATEGORY_SOURCE_COUNTS,
        positiveSourceAreaCounts:DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,
        nativeAllAreasDefaultVerified:false as const,
        critterRuntimeSceneVerified:false as const,
        gameCollectionUiMembershipVerified:false as const,
        playerOwnershipVerified:false as const
      });
    })().catch(e=>{coverageTask=null;throw e;});
    return coverageTask;
  };
  const joined=(id:string,original:Readonly<Db01FiveCategorySourceItem>|null):
    Db00LocalFiveAreaItem|null=>{
    if(original===null)return null;
    const codes=original.positiveAreaCodes;
    const critter=original.nativeCategory==='Companion'&&
      original.companionKind==='critter';
    check(original.itemId===Number(id)&&
      CATEGORIES.includes(original.nativeCategory)&&
      typeof original.originalNativeClass==='string'&&
      original.originalNativeClass.length>0&&
      original.originalSourceVerified===true&&
      original.critterRuntimeProfileSceneResolved===false&&
      original.nativeAllAreasDefaultVerified===false&&
      original.gameCollectionUiMembershipVerified===false&&
      original.worldAvailabilityVerified===false&&
      original.playerOwnershipVerified===false&&
      original.dlcEntitlementVerified===false&&
      (original.nativeCategory==='Companion'?
        KINDS.includes(original.companionKind as Db01OriginalCompanionKind):
        original.companionKind===null)&&
      (critter?
        original.originalNativeClass==='CritterItemData'&&
        original.sourceAreaEvidence==='requires_profile_world_scene'&&
        codes===null&&
        original.firstProvenPositiveAreaCode===null&&
        (original.critterLocationOneofFieldNumber===6||
          original.critterLocationOneofFieldNumber===7):
        Array.isArray(codes)&&codes.length<=1&&
        codes.every(code=>areaByCode.has(code))&&
        original.firstProvenPositiveAreaCode===(codes[0]??null)&&
        original.critterLocationOneofFieldNumber===null&&
        original.sourceAreaEvidence===(codes.length?
          'native_positive_tag':'native_ihastags_without_positive_tag')),
      'NATIVE_ITEM_CRITTER_OR_TAG_EVIDENCE_MISMATCH');
    const shared=publicData.getItem(id);
    check(shared.itemId===id&&
      shared.currentlyAvailableVerified===false&&
      shared.playerOwnershipVerified===false,
      'SHARED_ITEM_SOURCE_STATUS_MISMATCH');
    return Object.freeze({
      itemId:id,shared,original,
      nativeCategory:original.nativeCategory,
      companionKind:original.companionKind,
      sourceAreaEvidence:original.sourceAreaEvidence,
      positiveSourceAreas:codes===null?null:
        Object.freeze(codes.map(code=>areaByCode.get(code)!)),
      firstProvenPositiveAreaCode:original.firstProvenPositiveAreaCode,
      critterLocationOneofFieldNumber:
        original.critterLocationOneofFieldNumber,
      originalSourceVerified:true as const,
      runtimeCritterSceneVerified:false as const,
      nativeAllAreasDefaultVerified:false as const,
      gameCollectionUiMembershipVerified:false as const,
      playerOwnershipVerified:false as const,
      currentAvailabilityVerified:false as const,
      dlcEntitlementVerified:false as const
    });
  };
  const getItem=async(raw:string|number):
    Promise<Db00LocalFiveAreaItem|null>=>{
    const id=canonicalId(raw);
    return joined(id,await source.getItem(Number(id)));
  };
  function validate(raw:Db00LocalFiveAreaQuery){
    check(raw!==null&&typeof raw==='object'&&!Array.isArray(raw),
      'INVALID_REQUEST');
    const nativeCategories=raw.nativeCategories??CATEGORIES;
    const companionKinds=raw.companionKinds??KINDS;
    const areaCodes=raw.areaCodes??[0];
    check(Array.isArray(nativeCategories)&&nativeCategories.length<=5&&
      nativeCategories.every(c=>CATEGORIES.includes(c))&&
      new Set(nativeCategories).size===nativeCategories.length,
      'INVALID_NATIVE_CATEGORIES');
    check(Array.isArray(companionKinds)&&companionKinds.length<=3&&
      companionKinds.every(c=>KINDS.includes(c))&&
      new Set(companionKinds).size===companionKinds.length&&
      (raw.companionKinds===undefined||
        nativeCategories.includes('Companion')),
      'INVALID_COMPANION_KINDS');
    check(Array.isArray(areaCodes)&&areaCodes.length>0&&
      areaCodes.length<=6&&
      areaCodes.every(c=>c===0||areaByCode.has(c))&&
      new Set(areaCodes).size===areaCodes.length&&
      (!areaCodes.includes(0)||areaCodes.length===1),
      'INVALID_ORIGINAL_AREA_CODES');
    const offset=raw.offset??0,limit=raw.limit??80;
    check(Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=MAX_PAGE,
      'INVALID_PAGE');
    return {nativeCategories,companionKinds,areaCodes,offset,limit};
  }
  async function search(raw:Db00LocalFiveAreaQuery={}):
    Promise<Db00LocalFiveAreaPage>{
    const q=validate(raw);
    const coverage=await getCoverage();
    const all=q.areaCodes.length===1&&q.areaCodes[0]===0;
    const wantCritter=q.nativeCategories.includes('Companion')&&
      q.companionKinds.includes('critter')&&!all;
    const page=await source.search({
      nativeCategories:q.nativeCategories,
      companionKinds:q.nativeCategories.includes('Companion')?
        q.companionKinds:undefined,
      areaCodes:q.areaCodes,offset:q.offset,limit:q.limit
    });
    check(Number.isSafeInteger(page?.total)&&
      page.total>=0&&page.total<=coverage.sourceDefinitions&&
      Array.isArray(page.itemIds)&&
      page.itemIds.length<=q.limit&&
      page.itemIds.length<=Math.max(0,page.total-q.offset)&&
      (page.total<=q.offset||page.itemIds.length>0)&&
      page.itemIds.every((id,i)=>Number.isSafeInteger(id)&&id>0&&
        (i===0||id>page.itemIds[i-1]))&&
      page.hasMore===(page.total>q.offset+page.itemIds.length)&&
      page.originalSourceAreaSearchOnly===true&&
      page.allAreasMeansUnfilteredOriginalSource===all&&
      page.selectedCritterSceneCandidatesUnresolved===wantCritter&&
      page.runtimeCritterProfileSceneVerified===false&&
      page.nativeAllAreasDefaultVerified===false&&
      page.gameCollectionUiMembershipVerified===false&&
      page.playerOwnershipVerified===false&&
      page.dlcEntitlementVerified===false&&
      (q.nativeCategories.length!==0||page.total===0)&&
      (!all||q.nativeCategories.length!==5||
        q.companionKinds.length!==3||page.total===9615),
      'ORIGINAL_SOURCE_PAGE_CONTRACT_MISMATCH');
    const rows=await Promise.all(page.itemIds.map(getItem));
    const chosen=new Set<string>(q.nativeCategories);
    const kinds=new Set<string>(q.companionKinds);
    const items=Object.freeze(rows.map(row=>{
      check(row!==null&&
        chosen.has(row.nativeCategory)&&
        (row.nativeCategory!=='Companion'||kinds.has(row.companionKind!))&&
        (all||row.positiveSourceAreas?.some(a=>
          q.areaCodes.includes(a.areaCode))===true),
        'SOURCE_PAGE_ITEM_MATCH_MISMATCH');
      return row;
    }));
    const next=q.offset+items.length;
    return Object.freeze({
      snapshotId:publicData.snapshotId,
      nativeCategories:Object.freeze([...q.nativeCategories]),
      companionKinds:Object.freeze([...q.companionKinds]),
      areaCodes:Object.freeze([...q.areaCodes]),
      total:page.total,offset:q.offset,
      nextOffset:next<page.total?next:null,items,
      allAreasMeansUnfilteredOriginalSource:all,
      selectedCritterSceneCandidatesUnresolved:wantCritter,
      runtimeCritterSceneVerified:false as const,
      nativeAllAreasDefaultVerified:false as const,
      gameCollectionUiMembershipVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_LOCAL_FIVE_CATEGORY_SOURCE_CONTRACT,
    snapshotId:publicData.snapshotId,
    gameVersion:'1.26.2' as const,
    sourceDefinitions:9615 as const,
    ownerLocalOnly:true as const,
    publicationAuthorized:false as const,
    originalSourceOnly:true as const,
    gameCollectionUiMembershipVerified:false as const,
    getCoverage,getItem,search
  });
}
