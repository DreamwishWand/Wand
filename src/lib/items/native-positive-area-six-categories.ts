/**
 * Steam v1.26.2 native CollectionArea source search across six Item domains.
 * Reuses the authenticated five-category and Skin readers without copying
 * game data. This is ORIGINAL SOURCE evidence, never Collection UI membership.
 * Positive area queries cannot resolve Critter scenes or Skin non-IHasTags.
 */
import {
  DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA,
  DB01_FIVE_CATEGORY_SOURCE_COUNTS,
  DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,
  type Db01FiveCategorySourceClient,
  type Db01FiveCategoryNativeCategory,
  type Db01SourceAreaEvidence,
} from './native-positive-area-five-categories.ts';
import {
  DB01_ORIGINAL_SKIN_NATIVE_SCHEMA,
  DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS,
  DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS,
  type Db01OriginalSkinClient,
  type Db01SkinSourceProtobufClass,
} from './skin-native-subtypes.ts';
import type {Db01OriginalCompanionKind} from './companion-native-has-tag.ts';
import type {Db01NativePositiveAreaCode} from './native-positive-area-unified.ts';

export const DB01_SIX_CATEGORY_NATIVE_AREA_SCHEMA=
  'wand.db01.native-positive-area-six-category-steam-1262@1' as const;
export type Db01SixCategory=Db01FiveCategoryNativeCategory|'Skin';
export type Db01SixAreaEvidence=Db01SourceAreaEvidence|'original_interface_absent';
export const DB01_SIX_CATEGORY_SOURCE_COUNTS=Object.freeze({
  ...DB01_FIVE_CATEGORY_SOURCE_COUNTS,Skin:163,
} as const);
export const DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS=Object.freeze({
  1:6630,2:476,3:488,4:479,5:634,4097:269,
} as const);
export const DB01_SIX_CATEGORY_TOTAL=9778 as const;
export const DB01_SIX_CATEGORY_POSITIVE=8976 as const;
export const DB01_SIX_CATEGORY_HAS_TAGS_NO_POSITIVE=673 as const;
export const DB01_SIX_CATEGORY_NO_IHAS_TAGS=4 as const;
export const DB01_SIX_CATEGORY_CRITTER_SCENE_UNKNOWN=125 as const;

export interface Db01SixSourceItem {
  readonly itemId:number;
  readonly nativeCategory:Db01SixCategory;
  /** Layout, NOT independently confirmed runtime class for Skin. */
  readonly sourceProtobufClass:string;
  readonly companionKind:Db01OriginalCompanionKind|null;
  readonly positiveAreaCodes:readonly Db01NativePositiveAreaCode[]|null;
  readonly sourceAreaEvidence:Db01SixAreaEvidence;
  readonly critterLocationOneofFieldNumber:6|7|null;
  readonly originalSourceVerified:true;
  readonly runtimeSkinClassIndependentlyVerified:false;
  readonly runtimeCritterSceneResolved:false;
  readonly nativeAllAreasDefaultVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01SixSourceCoverage {
  readonly gameVersion:'1.26.2';
  readonly sourceDefinitions:9778;
  readonly sourcePositiveAreaItems:8976;
  readonly sourceIHasTagsWithoutPositiveArea:673;
  readonly sourceWithoutIHasTags:4;
  readonly critterSceneUnresolved:125;
  readonly categories:Readonly<Record<Db01SixCategory,number>>;
  readonly positiveByArea:Readonly<Record<number,number>>;
  readonly nativeAllAreasDefaultVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly runtimeSkinClassIndependentlyVerified:false;
  readonly runtimeCritterSceneResolved:false;
}
export interface Db01SixSourceQuery {
  readonly nativeCategories?:readonly Db01SixCategory[];
  readonly companionKinds?:readonly Db01OriginalCompanionKind[];
  readonly skinSourceProtobufClasses?:readonly Db01SkinSourceProtobufClass[];
  /** [0] is an unfiltered original source list, not native AllAreas. */
  readonly areaCodes?:readonly (Db01NativePositiveAreaCode|0)[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01SixSourcePage {
  readonly itemIds:readonly number[];
  readonly total:number;
  readonly hasMore:boolean;
  readonly originalSourceOnly:true;
  readonly allAreasMeansUnfilteredOriginalSource:boolean;
  readonly selectedCritterScenesUnresolved:boolean;
  readonly selectedSkinWithoutIHasTagsUnresolved:boolean;
  readonly gameCollectionUiMembershipVerified:false;
  readonly nativeAllAreasDefaultVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01SixSourceClient {
  readonly schema:typeof DB01_SIX_CATEGORY_NATIVE_AREA_SCHEMA;
  readonly gameVersion:'1.26.2';
  getCoverage():Promise<Readonly<Db01SixSourceCoverage>>;
  getItem(id:number):Promise<Readonly<Db01SixSourceItem>|null>;
  search(query?:Db01SixSourceQuery):Promise<Readonly<Db01SixSourcePage>>;
}

const CATEGORIES=Object.freeze([
  'Furniture','Clothing','Trimming','Makeup','Companion','Skin',
] as const);
const AREAS=Object.freeze([1,2,3,4,5,4097] as const);
const KINDS=Object.freeze(['pet','mount','critter'] as const);
const SKINS=Object.freeze(
  Object.keys(DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS) as Db01SkinSourceProtobufClass[]);
const SKINS_WITHOUT_TAGS=Object.freeze([
  'MountSkinItemData','BoatSkinItemData',
] as const);
const integer=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x);
const nonneg=(x:unknown):x is number=>integer(x)&&x>=0;
const pos=(x:unknown):x is number=>integer(x)&&x>0;
function check(ok:unknown,reason:string):asserts ok {
  if(!ok)throw new TypeError('DB01_SIX_NATIVE_AREA_'+reason);
}
check(CATEGORIES.length===6&&AREAS.length===6&&
  Object.values(DB01_SIX_CATEGORY_SOURCE_COUNTS)
    .reduce((a,b)=>a+b,0)===DB01_SIX_CATEGORY_TOTAL&&
  Object.values(DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS)
    .reduce((a,b)=>a+b,0)===DB01_SIX_CATEGORY_POSITIVE&&
  DB01_SIX_CATEGORY_POSITIVE+DB01_SIX_CATEGORY_HAS_TAGS_NO_POSITIVE+
    DB01_SIX_CATEGORY_NO_IHAS_TAGS+
    DB01_SIX_CATEGORY_CRITTER_SCENE_UNKNOWN===DB01_SIX_CATEGORY_TOTAL&&
  AREAS.every(code=>DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS[code]===
    DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS[code]+
      DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS[code])&&
  SKINS.length===7,'PINNED_CENSUS');

function selected<T extends string|number>(
  raw:readonly T[]|undefined,allowed:readonly T[],reason:string,
):readonly T[] {
  const values=raw??allowed;
  check(Array.isArray(values)&&values.length<=allowed.length&&
    values.every(x=>allowed.includes(x))&&
    new Set(values).size===values.length,reason);
  return Object.freeze([...values]);
}
function parse(q:Db01SixSourceQuery) {
  check(q!==null&&typeof q==='object'&&!Array.isArray(q),'INVALID_QUERY');
  const categories=selected(q.nativeCategories,CATEGORIES,'INVALID_CATEGORIES');
  const kinds=selected(q.companionKinds,KINDS,'INVALID_COMPANION_KINDS');
  const skins=selected(q.skinSourceProtobufClasses,SKINS,'INVALID_SKIN_CLASSES');
  check((q.companionKinds===undefined||categories.includes('Companion'))&&
    (q.skinSourceProtobufClasses===undefined||categories.includes('Skin')),
    'UNSELECTED_SUBTYPE_FILTER');
  const areaCodes=selected(q.areaCodes??[0],Object.freeze([0,...AREAS]),
    'INVALID_AREAS');
  check(areaCodes.length>=1&&
    (!areaCodes.includes(0)||areaCodes.length===1),'AMBIGUOUS_ALL_AREAS');
  const offset=q.offset??0,limit=q.limit??100;
  check(nonneg(offset)&&offset<=1_000_000&&
    nonneg(limit)&&limit<=1000,'INVALID_PAGE');
  return {categories,kinds,skins,areaCodes,offset,limit};
}

type Source='five'|'skin';
type Page=Readonly<{itemIds:readonly number[];total:number;hasMore:boolean}>;
interface Cursor {
  source:Source;
  total:number;
  loaded:number;
  cursor:number;
  lastConsumed:number;
  items:readonly number[];
}
export function createDb01SixCategorySourceClient(
  five:Db01FiveCategorySourceClient,
  skin:Db01OriginalSkinClient,
):Db01SixSourceClient {
  check(five?.schema===DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA&&
    five.gameVersion==='1.26.2'&&
    skin?.schema===DB01_ORIGINAL_SKIN_NATIVE_SCHEMA&&
    skin.gameVersion==='1.26.2'&&
    typeof five.getCoverage==='function'&&
    typeof five.getItem==='function'&&
    typeof five.search==='function'&&
    typeof skin.getCoverage==='function'&&
    typeof skin.getItem==='function'&&
    typeof skin.search==='function','PINNED_READERS_REQUIRED');

  async function getItem(id:number):Promise<Readonly<Db01SixSourceItem>|null> {
    check(pos(id),'INVALID_ITEM_ID');
    const [f,s]=await Promise.all([five.getItem(id),skin.getItem(id)]);
    check(!(f&&s),'CROSS_SOURCE_ID_COLLISION');
    if(f){
      check(f.itemId===id&&f.originalSourceVerified===true&&
        f.critterRuntimeProfileSceneResolved===false&&
        f.nativeAllAreasDefaultVerified===false&&
        f.gameCollectionUiMembershipVerified===false&&
        f.worldAvailabilityVerified===false&&
        f.playerOwnershipVerified===false&&
        f.dlcEntitlementVerified===false&&
        (f.positiveAreaCodes===null?
          f.sourceAreaEvidence==='requires_profile_world_scene':
          Array.isArray(f.positiveAreaCodes)),
        'FIVE_ORIGINAL_SOURCE_EVIDENCE');
      return Object.freeze({
        itemId:id,nativeCategory:f.nativeCategory,
        sourceProtobufClass:f.originalNativeClass,
        companionKind:f.companionKind,
        positiveAreaCodes:f.positiveAreaCodes,
        sourceAreaEvidence:f.sourceAreaEvidence,
        critterLocationOneofFieldNumber:f.critterLocationOneofFieldNumber,
        originalSourceVerified:true as const,
        runtimeSkinClassIndependentlyVerified:false as const,
        runtimeCritterSceneResolved:false as const,
        nativeAllAreasDefaultVerified:false as const,
        gameCollectionUiMembershipVerified:false as const,
        worldAvailabilityVerified:false as const,
        playerOwnershipVerified:false as const,
        dlcEntitlementVerified:false as const,
      });
    }
    if(!s)return null;
    const row=s.source,codes=s.positiveNativeAreaCodes;
    check(row.itemId===id&&row.nativeCategory==='Skin'&&
      s.originalSourceHashVerified===true&&
      s.originalSourceLayoutVerified===true&&
      row.sourceSubtypeLayoutVerified===true&&
      row.nativeRuntimeObjectTypeIndependentlyVerified===false&&
      s.runtimeNativeClassIndependentlyVerified===false&&
      s.gameCollectionUiMembershipVerified===false&&
      s.nativeAllAreasDefaultVerified===false&&
      s.dlcEntitlementVerified===false&&
      s.playerOwnershipVerified===false&&
      (codes===null?
        row.originalIHasTagsInterface===false&&
        s.sourceNativeTagState==='not_ihas_tags'&&
        SKINS_WITHOUT_TAGS.some(x=>x===row.sourceProtobufClass):
        Array.isArray(codes)&&codes.length<=1&&
        row.originalIHasTagsInterface===true&&
        s.sourceNativeTagState===(codes.length?
          'positive_native_tag':'no_positive_native_tag')),
      'SKIN_INTERFACE_OR_EVIDENCE_DRIFT');
    return Object.freeze({
      itemId:id,nativeCategory:'Skin' as const,
      sourceProtobufClass:row.sourceProtobufClass,
      companionKind:null,positiveAreaCodes:codes,
      sourceAreaEvidence:codes===null?
        'original_interface_absent' as const:
        codes.length?'native_positive_tag' as const:
          'native_ihastags_without_positive_tag' as const,
      critterLocationOneofFieldNumber:null,
      originalSourceVerified:true as const,
      runtimeSkinClassIndependentlyVerified:false as const,
      runtimeCritterSceneResolved:false as const,
      nativeAllAreasDefaultVerified:false as const,
      gameCollectionUiMembershipVerified:false as const,
      worldAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const,
    });
  }

  let task:Promise<Readonly<Db01SixSourceCoverage>>|null=null;
  function getCoverage():Promise<Readonly<Db01SixSourceCoverage>> {
    if(task)return task;
    task=(async()=>{
      const [f,s]=await Promise.all([five.getCoverage(),skin.getCoverage()]);
      check(f.sourceDefinitions===9615&&
        f.sourcePositiveNativeAreaItems===8955&&
        f.sourceIHasTagsWithoutPositiveArea===535&&
        f.sourceCritterNeedsProfileWorldScene===125&&
        f.gameCollectionUiMembershipVerified===false&&
        f.nativeAllAreasDefaultVerified===false&&
        s.originalSourceDefinitions===163&&
        s.sourceWithPositiveAreaTag===21&&
        s.sourceIHasTagsWithoutPositiveArea===138&&
        s.sourceWithoutIHasTagsInterface===4&&
        s.nativeSourceLayoutVerified===true&&
        s.nativeRuntimeClassIndependentlyVerified===false&&
        s.gameCollectionUiMembershipVerified===false&&
        s.allAreasNativeDefaultVerified===false&&
        SKINS.every(cls=>
          s.originalSubtypeCounts[cls]===
            DB01_ORIGINAL_SKIN_SOURCE_LAYOUTS[cls].count)&&
        CATEGORIES.slice(0,5).every(category=>
          f.byOriginalNativeCategory[category as Db01FiveCategoryNativeCategory]===
            DB01_FIVE_CATEGORY_SOURCE_COUNTS[
              category as Db01FiveCategoryNativeCategory])&&
        AREAS.every(code=>
          f.sourcePositiveByOriginalArea[code]+
            s.sourcePositiveAreasByCode[code]===
              DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS[code]),
        'ORIGINAL_SOURCE_CENSUS_DRIFT');
      return Object.freeze({
        gameVersion:'1.26.2' as const,
        sourceDefinitions:DB01_SIX_CATEGORY_TOTAL,
        sourcePositiveAreaItems:DB01_SIX_CATEGORY_POSITIVE,
        sourceIHasTagsWithoutPositiveArea:
          DB01_SIX_CATEGORY_HAS_TAGS_NO_POSITIVE,
        sourceWithoutIHasTags:DB01_SIX_CATEGORY_NO_IHAS_TAGS,
        critterSceneUnresolved:DB01_SIX_CATEGORY_CRITTER_SCENE_UNKNOWN,
        categories:DB01_SIX_CATEGORY_SOURCE_COUNTS,
        positiveByArea:DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS,
        nativeAllAreasDefaultVerified:false as const,
        gameCollectionUiMembershipVerified:false as const,
        runtimeSkinClassIndependentlyVerified:false as const,
        runtimeCritterSceneResolved:false as const,
      });
    })().catch(error=>{task=null;throw error;});
    return task;
  }
  async function search(query:Db01SixSourceQuery={}):
    Promise<Readonly<Db01SixSourcePage>> {
    const q=parse(query),fiveCats=q.categories.filter(
      (category):category is Db01FiveCategoryNativeCategory=>
        category!=='Skin');
    const useFive=fiveCats.length>0 &&
      (fiveCats.some(c=>c!=='Companion')||q.kinds.length>0);
    const useSkin=q.categories.includes('Skin')&&q.skins.length>0;
    const positiveOnly=!q.areaCodes.includes(0);
    const unknownCritter=positiveOnly&&fiveCats.includes('Companion')&&
      q.kinds.includes('critter');
    const unknownSkin=positiveOnly&&useSkin&&
      q.skins.some(cls=>
        SKINS_WITHOUT_TAGS.some(noTag=>noTag===cls));
    async function load(source:Source,offset:number,limit:number):Promise<Page>{
      if(source==='five'){
        const p=await five.search({
          nativeCategories:fiveCats,areaCodes:q.areaCodes,
          ...(fiveCats.includes('Companion')?{companionKinds:q.kinds}:{}),
          offset,limit,
        });
        check(p.originalSourceAreaSearchOnly===true&&
          p.gameCollectionUiMembershipVerified===false&&
          p.nativeAllAreasDefaultVerified===false&&
          p.selectedCritterSceneCandidatesUnresolved===unknownCritter&&
          p.playerOwnershipVerified===false&&p.dlcEntitlementVerified===false,
          'UNVERIFIED_FIVE_SOURCE_PAGE');
        return p;
      }
      const p=await skin.search({
        sourceProtobufClasses:q.skins,areaCodes:q.areaCodes,offset,limit,
      });
      check(p.originalSourceOnly===true&&
        p.untaggedClassesExcludedOnlyFromPositiveTagQuery===true&&
        p.gameCollectionUiMembershipVerified===false&&
        p.allAreasNativeDefaultVerified===false&&
        p.playerOwnershipVerified===false&&p.dlcEntitlementVerified===false,
        'UNVERIFIED_SKIN_SOURCE_PAGE');
      return p;
    }
    const sourceNames:Source[]=[];
    if(useFive)sourceNames.push('five');
    if(useSkin)sourceNames.push('skin');
    const summaries=await Promise.all(sourceNames.map(s=>load(s,0,0)));
    const cursors:Cursor[]=[];
    let total=0;
    for(let i=0;i<sourceNames.length;i++){
      const p=summaries[i],cap=sourceNames[i]==='five'?9615:163;
      check(nonneg(p.total)&&p.total<=cap&&
        Array.isArray(p.itemIds)&&p.itemIds.length===0&&
        p.hasMore===(p.total>0),'SOURCE_SUMMARY_DRIFT');
      total+=p.total;
      if(p.total)cursors.push({
        source:sourceNames[i],total:p.total,loaded:0,cursor:0,
        lastConsumed:0,items:[],
      });
    }
    const wrap=(ids:readonly number[])=>Object.freeze({
      itemIds:Object.freeze([...ids]),total,
      hasMore:total>q.offset+ids.length,
      originalSourceOnly:true as const,
      allAreasMeansUnfilteredOriginalSource:!positiveOnly,
      selectedCritterScenesUnresolved:unknownCritter,
      selectedSkinWithoutIHasTagsUnresolved:unknownSkin,
      gameCollectionUiMembershipVerified:false as const,
      nativeAllAreasDefaultVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const,
    });
    if(q.offset>=total||q.limit===0)return wrap([]);
    async function head(c:Cursor):Promise<number|null>{
      while(c.cursor===c.items.length){
        if(c.loaded>=c.total)return null;
        const p=await load(c.source,c.loaded,
          Math.min(256,c.total-c.loaded));
        check(p.total===c.total&&
          Array.isArray(p.itemIds)&&p.itemIds.length>0&&
          p.itemIds.length<=256&&p.itemIds.every(pos)&&
          p.itemIds.every((id,i)=>i===0?
            id>c.lastConsumed:id>p.itemIds[i-1])&&
          p.hasMore===(
            c.loaded+p.itemIds.length<c.total),
          'CORRUPT_OR_UNSORTED_SOURCE_PAGE');
        c.loaded+=p.itemIds.length;
        c.items=p.itemIds;
        c.cursor=0;
      }
      return c.items[c.cursor];
    }
    const result:number[]=[];
    for(let seen=0;seen<Math.min(total,q.offset+q.limit);seen++){
      const values=await Promise.all(cursors.map(head));
      const candidates=values.filter((x):x is number=>x!==null);
      check(candidates.length>0,'SOURCE_EXHAUSTED_EARLY');
      const smallest=Math.min(...candidates);
      check(candidates.filter(x=>x===smallest).length===1,
        'DUPLICATE_ORIGINAL_ITEM_ID');
      const index=values.findIndex(x=>x===smallest);
      if(seen>=q.offset)result.push(smallest);
      const c=cursors[index];
      c.lastConsumed=smallest;
      c.cursor++;
    }
    return wrap(result);
  }
  return Object.freeze({
    schema:DB01_SIX_CATEGORY_NATIVE_AREA_SCHEMA,
    gameVersion:'1.26.2' as const,getCoverage,getItem,search,
  });
}
