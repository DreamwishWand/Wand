/**
 * DB-00 owner-local, six-category original CollectionArea source adapter.
 *
 * DB-01 alone authenticates PRIVATE Steam v1.26.2 source shards and merges
 * sorted Item IDs. This adapter joins the completed source results to DB-00
 * public Item names and source CollectionArea configs; it does not copy the
 * native parser, source merging logic or any private bytes.
 *
 * Original positive Tags != game Collection UI membership. Critters need
 * ProfileWorld scene resolution; some Skin protobuf layouts have NO native
 * IHasTags. Null area matches are not a negative world classification.
 */
import {canonicalId} from './model.ts';
import type {PublicSharedGameSources} from './public-sources.ts';
import type {Db00SourceJoinedItem} from './source-join.ts';
import type {Db00OriginalCollectionArea} from './collection-area-sources.ts';
import {
  DB01_SIX_CATEGORY_NATIVE_AREA_SCHEMA,
  DB01_SIX_CATEGORY_SOURCE_COUNTS,
  DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS,
  DB01_SIX_CATEGORY_TOTAL,
  DB01_SIX_CATEGORY_POSITIVE,
  DB01_SIX_CATEGORY_HAS_TAGS_NO_POSITIVE,
  DB01_SIX_CATEGORY_NO_IHAS_TAGS,
  DB01_SIX_CATEGORY_CRITTER_SCENE_UNKNOWN,
  type Db01SixSourceClient,
  type Db01SixSourceItem,
  type Db01SixSourceCoverage,
  type Db01SixSourceQuery,
  type Db01SixCategory,
  type Db01SixAreaEvidence
} from '../items/native-positive-area-six-categories.ts';
import {
  DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS,
  type Db01SkinSourceProtobufClass
} from '../items/skin-native-subtypes.ts';
import type {Db01OriginalCompanionKind} from '../items/companion-native-has-tag.ts';
import type {Db01NativePositiveAreaCode} from '../items/native-positive-area-unified.ts';

export const DB00_SIX_ORIGINAL_AREA_CONTRACT=
  'wand.game-db.owner-local-six-category-areas@1' as const;
const CATEGORIES=Object.freeze([
  'Furniture','Clothing','Trimming','Makeup','Companion','Skin'
] as const);
const KINDS=Object.freeze(['pet','mount','critter'] as const);
const SKINS=Object.freeze(
  Object.keys(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS) as Db01SkinSourceProtobufClass[]
);
const CODES=Object.freeze([1,2,3,4,5,4097] as const);
const NO_TAG_SKIN=Object.freeze(['MountSkinItemData','BoatSkinItemData'] as const);
const MAX_PAGE=120;
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB00_SIX_SOURCE_'+reason);
}
export interface Db00SixOriginalItem {
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly original:Readonly<Db01SixSourceItem>;
  readonly nativeCategory:Db01SixCategory;
  /** For Skin this is source-protobuf layout, NOT proven runtime class. */
  readonly sourceProtobufClass:string;
  readonly companionKind:Db01OriginalCompanionKind|null;
  readonly originalAreaEvidence:Db01SixAreaEvidence;
  /** null = original IHasTags absent or Critter requires Scene. */
  readonly positiveSourceAreas:readonly Db00OriginalCollectionArea[]|null;
  readonly firstPositiveSourceAreaCode:Db01NativePositiveAreaCode|null;
  readonly pendingSourceAreaReason:
    'critter_requires_profile_world_scene'|
    'skin_missing_original_ihastags'|
    'ihastags_no_positive_source_tag'|null;
  readonly sourceOriginalItemVerified:true;
  readonly skinRuntimeClassIndependentlyVerified:false;
  readonly runtimeCritterSceneVerified:false;
  readonly nativeAllAreasDefaultVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00SixOriginalAreaCoverage{
  readonly snapshotId:string;
  readonly original:Readonly<Db01SixSourceCoverage>;
  readonly sourceDefinitions:9778;
  readonly originalPositiveTagMatches:8976;
  readonly originalIHasTagsNoPositiveTag:673;
  readonly originalSkinWithoutIHasTags:4;
  readonly originalCritterSceneUnresolved:125;
  readonly nativeCategoryCounts:Readonly<Record<Db01SixCategory,number>>;
  readonly originalPositiveAreaCounts:Readonly<Record<Db01NativePositiveAreaCode,number>>;
  readonly gameCollectionUiMembershipVerified:false;
  readonly nativeAllAreasDefaultVerified:false;
}
export interface Db00SixOriginalAreaPage{
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00SixOriginalItem[];
  readonly allAreasMeansUnfilteredOriginalSource:boolean;
  /** Positive Tag search OMITTED possible scene-based Critters. */
  readonly selectedCritterScenesUnresolved:boolean;
  /** Positive Tag search OMITTED Skin layouts lacking native IHasTags. */
  readonly selectedSkinWithoutIHasTagsUnresolved:boolean;
  readonly gameCollectionUiMembershipVerified:false;
  readonly nativeAllAreasDefaultVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00SixOriginalAreaReader{
  readonly contract:typeof DB00_SIX_ORIGINAL_AREA_CONTRACT;
  readonly snapshotId:string;
  readonly sourceDefinitions:9778;
  readonly ownerLocalOnly:true;
  readonly publicationAuthorized:false;
  readonly gameCollectionUiMembershipVerified:false;
  getCoverage():Promise<Db00SixOriginalAreaCoverage>;
  getItem(itemId:string|number):Promise<Db00SixOriginalItem|null>;
  search(query?:Db01SixSourceQuery):Promise<Db00SixOriginalAreaPage>;
}

/** Attach authenticated owner-local DB-01 source data to the public DB-00
 * snapshot. This function fetches NO private files or browser-origin assets.
 */
export function joinDb00SixOriginalCollectionAreas(
  publicData:PublicSharedGameSources,
  source:Db01SixSourceClient
):Db00SixOriginalAreaReader{
  const db=publicData?.database;
  const ref=publicData?.originalCollectionAreas;
  check(publicData?.schema==='wand.game-db.public-sources@1'&&
    publicData.snapshotId==='steam-1.26.2-native-itemlist-v1'&&
    db?.contract==='wand.game-db.shared@1'&&
    db.itemCount===13202&&db.target.platform==='Steam'&&
    db.target.gameVersion==='1.26.2'&&
    publicData.hasPrivateGameSource===false&&
    publicData.playerOwnershipVerified===false&&
    typeof publicData.getItem==='function'&&
    ref?.contract==='wand.game-db.original-collection-area-reference@1'&&
    ref.platform==='Steam'&&ref.gameVersion==='1.26.2'&&
    ref.sourceConfigCount===7&&ref.orderedAreas.length===7&&
    ref.gameUiItemMembershipVerified===false&&
    source?.schema===DB01_SIX_CATEGORY_NATIVE_AREA_SCHEMA&&
    source.gameVersion==='1.26.2'&&
    typeof source.getCoverage==='function'&&
    typeof source.getItem==='function'&&
    typeof source.search==='function',
    'PINNED_CURRENT_DB00_AND_DB01_REQUIRED');
  const originals=ref.orderedAreas.filter(a=>a.original.gameplayTagId>0);
  check(originals.length===6&&
    originals.every((a,i)=>a.areaCode===CODES[i]&&
      a.originalConfigVerified===true&&
      a.sourceTagCandidateOnly===true&&
      a.gameUiItemMembershipVerified===false)&&
    ref.orderedAreas[6].areaCode===0&&
    ref.orderedAreas[6].original.gameplayTagId===0,
    'SEVEN_NATIVE_AREA_CONFIG_ORDER');
  const byCode=new Map<number,Db00OriginalCollectionArea>(
    originals.map(a=>[a.areaCode,a]));
  check(byCode.size===6,'DUPLICATE_NATIVE_AREA_CONFIG');

  let coverageTask:Promise<Db00SixOriginalAreaCoverage>|null=null;
  function getCoverage():Promise<Db00SixOriginalAreaCoverage>{
    if(coverageTask)return coverageTask;
    coverageTask=(async()=>{
      const original=await source.getCoverage();
      const cats=original?.categories,counts=original?.positiveByArea;
      check(original?.gameVersion==='1.26.2'&&
        original.sourceDefinitions===DB01_SIX_CATEGORY_TOTAL&&
        original.sourcePositiveAreaItems===DB01_SIX_CATEGORY_POSITIVE&&
        original.sourceIHasTagsWithoutPositiveArea===
          DB01_SIX_CATEGORY_HAS_TAGS_NO_POSITIVE&&
        original.sourceWithoutIHasTags===DB01_SIX_CATEGORY_NO_IHAS_TAGS&&
        original.critterSceneUnresolved===
          DB01_SIX_CATEGORY_CRITTER_SCENE_UNKNOWN&&
        original.nativeAllAreasDefaultVerified===false&&
        original.gameCollectionUiMembershipVerified===false&&
        original.runtimeSkinClassIndependentlyVerified===false&&
        original.runtimeCritterSceneResolved===false&&
        cats!==null&&typeof cats==='object'&&
        CATEGORIES.every(cat=>cats[cat]===DB01_SIX_CATEGORY_SOURCE_COUNTS[cat])&&
        counts!==null&&typeof counts==='object'&&
        CODES.every(code=>counts[code]===
          DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS[code])&&
        CATEGORIES.reduce((s,c)=>s+cats[c],0)===9778&&
        CODES.reduce((s,c)=>s+counts[c],0)===8976,
        'ORIGINAL_SOURCE_CENSUS_DRIFT');
      return Object.freeze({
        snapshotId:publicData.snapshotId,original,
        sourceDefinitions:9778 as const,
        originalPositiveTagMatches:8976 as const,
        originalIHasTagsNoPositiveTag:673 as const,
        originalSkinWithoutIHasTags:4 as const,
        originalCritterSceneUnresolved:125 as const,
        nativeCategoryCounts:DB01_SIX_CATEGORY_SOURCE_COUNTS,
        originalPositiveAreaCounts:DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS,
        gameCollectionUiMembershipVerified:false as const,
        nativeAllAreasDefaultVerified:false as const
      });
    })().catch(e=>{coverageTask=null;throw e;});
    return coverageTask;
  }
  function joinOne(
    id:string,row:Readonly<Db01SixSourceItem>|null
  ):Db00SixOriginalItem|null{
    if(!row)return null;
    check(row.itemId===Number(id)&&
      CATEGORIES.includes(row.nativeCategory)&&
      typeof row.sourceProtobufClass==='string'&&
      row.sourceProtobufClass.length>0&&
      row.originalSourceVerified===true&&
      row.runtimeSkinClassIndependentlyVerified===false&&
      row.runtimeCritterSceneResolved===false&&
      row.nativeAllAreasDefaultVerified===false&&
      row.gameCollectionUiMembershipVerified===false&&
      row.worldAvailabilityVerified===false&&
      row.playerOwnershipVerified===false&&
      row.dlcEntitlementVerified===false,
      'SOURCE_ITEM_ID_OR_PROOF_INVALID');
    const critter=row.sourceAreaEvidence==='requires_profile_world_scene';
    const skinNoTag=row.sourceAreaEvidence==='original_interface_absent';
    const noPositive=row.sourceAreaEvidence===
      'native_ihastags_without_positive_tag';
    const positive=row.sourceAreaEvidence==='native_positive_tag';
    check((critter&&row.nativeCategory==='Companion'&&
        row.companionKind==='critter'&&
        row.sourceProtobufClass==='CritterItemData'&&
        (row.critterLocationOneofFieldNumber===6||
          row.critterLocationOneofFieldNumber===7)&&
        row.positiveAreaCodes===null)||
      (skinNoTag&&row.nativeCategory==='Skin'&&
        row.companionKind===null&&
        NO_TAG_SKIN.some(cls=>cls===row.sourceProtobufClass)&&
        row.critterLocationOneofFieldNumber===null&&
        row.positiveAreaCodes===null)||
      ((noPositive||positive)&&
        // The source-layout contract proves MountSkin and BoatSkin never
        // implement IHasTags; a forged [] is NOT an evaluated empty Tag list.
        (row.nativeCategory!=='Skin'||!NO_TAG_SKIN.some(
          cls=>cls===row.sourceProtobufClass))&&
        Array.isArray(row.positiveAreaCodes)&&
        row.positiveAreaCodes.length===(positive?1:0)&&
        row.positiveAreaCodes.every(code=>byCode.has(code))&&
        row.critterLocationOneofFieldNumber===null&&
        (row.nativeCategory!=='Skin'||SKINS.includes(
          row.sourceProtobufClass as Db01SkinSourceProtobufClass))&&
        (row.nativeCategory==='Companion'?
          row.companionKind==='pet'||row.companionKind==='mount':
          row.companionKind===null)),
      'SOURCE_NULL_VS_EMPTY_INTERFACE_SEMANTICS');
    const shared=publicData.getItem(id);
    check(shared.itemId===id&&
      shared.currentlyAvailableVerified===false&&
      shared.playerOwnershipVerified===false,
      'SHARED_ITEM_JOIN_MISMATCH');
    const matched=row.positiveAreaCodes===null?null:
      Object.freeze(row.positiveAreaCodes.map(code=>byCode.get(code)!));
    return Object.freeze({
      itemId:id,shared,original:row,
      nativeCategory:row.nativeCategory,
      sourceProtobufClass:row.sourceProtobufClass,
      companionKind:row.companionKind,
      originalAreaEvidence:row.sourceAreaEvidence,
      positiveSourceAreas:matched,
      // Original DB-01 positive code type excludes the unfiltered code 0.
      firstPositiveSourceAreaCode:row.positiveAreaCodes?.[0]??null,
      pendingSourceAreaReason:critter?'critter_requires_profile_world_scene':
        skinNoTag?'skin_missing_original_ihastags':
          noPositive?'ihastags_no_positive_source_tag':null,
      sourceOriginalItemVerified:true as const,
      skinRuntimeClassIndependentlyVerified:false as const,
      runtimeCritterSceneVerified:false as const,
      nativeAllAreasDefaultVerified:false as const,
      gameCollectionUiMembershipVerified:false as const,
      playerOwnershipVerified:false as const,
      currentAvailabilityVerified:false as const,
      dlcEntitlementVerified:false as const
    });
  }
  async function getItem(id:string|number){
    const key=canonicalId(id);
    return joinOne(key,await source.getItem(Number(key)));
  }
  function validateQuery(q:Db01SixSourceQuery){
    check(q!==null&&typeof q==='object'&&!Array.isArray(q),
      'INVALID_QUERY');
    const cats=q.nativeCategories??CATEGORIES;
    const kinds=q.companionKinds??KINDS;
    const skins=q.skinSourceProtobufClasses??SKINS;
    const areas=q.areaCodes??[0];
    check(Array.isArray(cats)&&cats.length<=6&&
      cats.every(c=>CATEGORIES.includes(c))&&
      new Set(cats).size===cats.length,'INVALID_CATEGORY_FILTER');
    check(Array.isArray(kinds)&&kinds.length<=3&&
      kinds.every(k=>KINDS.includes(k))&&
      new Set(kinds).size===kinds.length&&
      (q.companionKinds===undefined||cats.includes('Companion')),
      'INVALID_COMPANION_KIND_FILTER');
    check(Array.isArray(skins)&&skins.length<=7&&
      skins.every(k=>SKINS.includes(k))&&
      new Set(skins).size===skins.length&&
      (q.skinSourceProtobufClasses===undefined||cats.includes('Skin')),
      'INVALID_SKIN_LAYOUT_FILTER');
    check(Array.isArray(areas)&&areas.length>0&&areas.length<=6&&
      areas.every(code=>code===0||byCode.has(code))&&
      new Set(areas).size===areas.length&&
      (!areas.includes(0)||areas.length===1),
      'INVALID_OR_AMBIGUOUS_AREA_CODES');
    const offset=q.offset??0,limit=q.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=MAX_PAGE,
      'INVALID_PAGING');
    return {cats,kinds,skins,areas,offset,limit};
  }
  async function search(q:Db01SixSourceQuery={}):
    Promise<Db00SixOriginalAreaPage>{
    const selected=validateQuery(q);
    await getCoverage();
    const all=selected.areas.length===1&&selected.areas[0]===0;
    const critterUnknown=!all&&selected.cats.includes('Companion')&&
      selected.kinds.includes('critter');
    const skinUnknown=!all&&selected.cats.includes('Skin')&&
      selected.skins.some(cls=>NO_TAG_SKIN.some(noTag=>noTag===cls));
    // DB-01 alone owns the source sort/merge and original filtering.
    const raw=await source.search(q);
    check(Number.isSafeInteger(raw?.total)&&
      raw.total>=0&&raw.total<=9778&&
      Array.isArray(raw.itemIds)&&
      raw.itemIds.length<=selected.limit&&
      raw.itemIds.length<=Math.max(0,raw.total-selected.offset)&&
      (selected.offset>=raw.total||raw.itemIds.length>0)&&
      raw.itemIds.every((id,i)=>Number.isSafeInteger(id)&&id>0&&
        (i===0||id>raw.itemIds[i-1]))&&
      raw.hasMore===(raw.total>selected.offset+raw.itemIds.length)&&
      raw.originalSourceOnly===true&&
      raw.allAreasMeansUnfilteredOriginalSource===all&&
      raw.selectedCritterScenesUnresolved===critterUnknown&&
      raw.selectedSkinWithoutIHasTagsUnresolved===skinUnknown&&
      raw.gameCollectionUiMembershipVerified===false&&
      raw.nativeAllAreasDefaultVerified===false&&
      raw.playerOwnershipVerified===false&&
      raw.dlcEntitlementVerified===false&&
      (selected.cats.length!==0||raw.total===0)&&
      (!all||selected.cats.length!==6||
        selected.kinds.length!==3||selected.skins.length!==7||
        raw.total===9778),
      'ORIGINAL_SIX_SOURCE_PAGE_CORRUPT');
    // Bound concurrent per-ID source access; source readers cache
    // SHA-authenticated original buckets. No ID-range classification.
    const items:(Db00SixOriginalItem|null)[]=new Array(raw.itemIds.length);
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(12,items.length)},
      async()=>{
        while(cursor<items.length){
          const i=cursor++;
          items[i]=await getItem(raw.itemIds[i]);
        }
      }));
    const categories=new Set<string>(selected.cats);
    const kinds=new Set<string>(selected.kinds);
    const skins=new Set<string>(selected.skins);
    const joined=Object.freeze(items.map(item=>{
      check(item!==null&&categories.has(item.nativeCategory)&&
        (item.nativeCategory!=='Companion'||kinds.has(item.companionKind!))&&
        (item.nativeCategory!=='Skin'||skins.has(item.sourceProtobufClass))&&
        (all||item.positiveSourceAreas?.some(a=>
          selected.areas.includes(a.areaCode))===true),
        'RETURNED_ITEM_ID_CATEGORY_AREA_MISMATCH');
      return item;
    }));
    const next=selected.offset+joined.length;
    return Object.freeze({
      snapshotId:publicData.snapshotId,total:raw.total,
      offset:selected.offset,nextOffset:next<raw.total?next:null,
      items:joined,
      allAreasMeansUnfilteredOriginalSource:all,
      selectedCritterScenesUnresolved:critterUnknown,
      selectedSkinWithoutIHasTagsUnresolved:skinUnknown,
      gameCollectionUiMembershipVerified:false as const,
      nativeAllAreasDefaultVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_SIX_ORIGINAL_AREA_CONTRACT,
    snapshotId:publicData.snapshotId,
    sourceDefinitions:9778 as const,
    ownerLocalOnly:true as const,
    publicationAuthorized:false as const,
    gameCollectionUiMembershipVerified:false as const,
    getCoverage,getItem,search
  });
}
