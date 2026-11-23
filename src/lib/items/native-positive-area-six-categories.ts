/**
 * Steam 1.26.2 original source CollectionArea lookup across 6 native
 * categories (9,778 original Item IDs). Does NOT interpret native positive
 * Tag matches as runtime game Collection membership / world availability.
 *
 * Three distinct negative/unknown states must not be conflated:
 * 1. Native IHasTags with zero positive gameplay area IDs: source negative.
 * 2. CritterItemData without IHasTags: runtime ProfileWorld scene required.
 * 3. MountSkin/BoatSkin without IHasTags: source interface unavailable;
 *    native runtime class identity not independently proven from protobuf.
 * The original AllAreas=0 is UNFILTERED SOURCE, not a native HasTag result.
 *
 * Reuses the previously SHA-pinned private original 5-category and Skin
 * readers. No original game data, save data or credentials are published.
 */
import {
  DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA,
  DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS,
  DB01_FIVE_CATEGORY_SOURCE_COUNTS,
  type Db01FiveCategorySourceClient,
  type Db01FiveCategoryNativeCategory,
  type Db01FiveCategorySourceItem,
} from './native-positive-area-five-categories.ts';
import {
  DB01_ORIGINAL_SKIN_NATIVE_SCHEMA,
  DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS,
  type Db01OriginalSkinClient,
  type Db01SkinSourceProtobufClass,
} from './skin-native-subtypes.ts';
import type {Db01OriginalCompanionKind} from './companion-native-has-tag.ts';
import {DB01_COLLECTION_AREA_SOURCE_CONFIGS} from './collection-area-source-config.ts';

export const DB01_SIX_CATEGORY_SOURCE_SCHEMA=
  'wand.db01.original-native-six-categories-steam-1262@1' as const;
export type Db01SixNativeCategory=Db01FiveCategoryNativeCategory|'Skin';
export type Db01SixPositiveAreaCode=1|2|3|4|5|4097;
export type Db01SixSourceAreaEvidence=
  'native_positive_tag'|'native_ihastags_without_positive_tag'|
  'requires_profile_world_scene'|'original_class_without_ihastags';

export const DB01_SIX_CATEGORY_SOURCE_COUNTS=Object.freeze({
  ...DB01_FIVE_CATEGORY_SOURCE_COUNTS,
  Skin:163,
} as const);
export const DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS=Object.freeze({
  1:6630,2:476,3:488,4:479,5:634,4097:269,
} as const);
export const DB01_SIX_CATEGORY_TOTAL=9778 as const;
export const DB01_SIX_CATEGORY_NATIVE_POSITIVE=8976 as const;
export const DB01_SIX_CATEGORY_NATIVE_NO_POSITIVE=673 as const;
export const DB01_SIX_CATEGORY_PROFILE_SCENE_UNRESOLVED=125 as const;
export const DB01_SIX_CATEGORY_NO_IHASTAGS=4 as const;

export interface Db01SixSourceItem{
  readonly itemId:number;
  readonly nativeCategory:Db01SixNativeCategory;
  readonly sourceProtobufClass:string;
  /** null = source type has no IHasTags. Distinguish with areaEvidence. */
  readonly positiveAreaCodes:readonly Db01SixPositiveAreaCode[]|null;
  readonly areaEvidence:Db01SixSourceAreaEvidence;
  readonly companionKind:Db01OriginalCompanionKind|null;
  readonly skinSourceIdBand:number|null;
  readonly originalSourceVerified:true;
  /** Original Skin protobuf does not serialize runtime C# instance class. */
  readonly runtimeNativeObjectTypeIndependentlyVerified:false;
  readonly originalAllAreasNativeDefaultVerified:false;
  readonly runtimeCritterProfileSceneResolved:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01SixSourceCoverage{
  readonly gameVersion:'1.26.2';
  readonly originalSourceDefinitions:9778;
  readonly originalNativeCategoryCounts:Readonly<Record<Db01SixNativeCategory,number>>;
  readonly sourcePositiveNativeAreaItems:8976;
  readonly sourceIHasTagsWithoutPositiveArea:673;
  readonly sourceCritterRuntimeSceneRequired:125;
  readonly sourceSkinWithoutIHasTags:4;
  readonly sourcePositiveByArea:Readonly<Record<number,number>>;
  readonly originalSourceVerified:true;
  readonly originalAllAreasNativeDefaultVerified:false;
  readonly runtimeCritterProfileSceneResolved:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01SixSourceQuery{
  readonly nativeCategories?:readonly Db01SixNativeCategory[];
  /** May be supplied only when Companion is selected. */
  readonly companionKinds?:readonly Db01OriginalCompanionKind[];
  /** May be supplied only when Skin is selected. */
  readonly skinSourceClasses?:readonly Db01SkinSourceProtobufClass[];
  /** [0] is unfiltered original source, never native AllAreas HasTag. */
  readonly areaCodes?:readonly (Db01SixPositiveAreaCode|0)[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01SixSourcePage{
  readonly itemIds:readonly number[];
  readonly total:number;
  readonly hasMore:boolean;
  readonly originalSourceOnly:true;
  readonly allAreasMeansUnfilteredSource:boolean;
  /** Positive tag filtering cannot resolve Critter ProfileWorld matching. */
  readonly critterAreaCandidatesRequireRuntimeScene:boolean;
  /** Positive tag filtering cannot resolve non-IHasTags Skin types. */
  readonly skinNoIHasTagsItemsCannotBeEvaluated:boolean;
  readonly originalAllAreasNativeDefaultVerified:false;
  readonly runtimeCritterProfileSceneResolved:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01SixSourceClient{
  readonly schema:typeof DB01_SIX_CATEGORY_SOURCE_SCHEMA;
  readonly gameVersion:'1.26.2';
  getItem(id:number):Promise<Readonly<Db01SixSourceItem>|null>;
  getCoverage():Promise<Readonly<Db01SixSourceCoverage>>;
  search(query?:Db01SixSourceQuery):Promise<Readonly<Db01SixSourcePage>>;
}

const cats=Object.freeze([
  'Furniture','Clothing','Trimming','Makeup','Companion','Skin',
] as const);
const catSet=new Set<string>(cats);
const kinds=new Set<string>(['pet','mount','critter']);
const skinClasses=Object.freeze([
  'CharacterSkinItemData','StallSkinItemData','BuildingOtherSkinItemData',
  'SceneAssetsSkinItemData','MountSkinItemData','BoatSkinItemData',
  'HouseSkinItemData',
] as const);
const skinSet=new Set<string>(skinClasses);
const areas=DB01_COLLECTION_AREA_SOURCE_CONFIGS
  .filter(x=>x.gameplayTagId>0)
  .map(x=>x.areaCode as Db01SixPositiveAreaCode);
const areasSet=new Set<number>(areas);
const positive=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const nonnegative=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB01_SIX_SOURCE_'+reason);
}
check(areas.length===6&&catSet.size===6&&
  Object.values(DB01_SIX_CATEGORY_SOURCE_COUNTS)
    .reduce((a,b)=>a+b,0)===DB01_SIX_CATEGORY_TOTAL&&
  Object.values(DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS)
    .reduce((a,b)=>a+b,0)===DB01_SIX_CATEGORY_NATIVE_POSITIVE&&
  DB01_SIX_CATEGORY_NATIVE_POSITIVE+
    DB01_SIX_CATEGORY_NATIVE_NO_POSITIVE+
    DB01_SIX_CATEGORY_PROFILE_SCENE_UNRESOLVED+
    DB01_SIX_CATEGORY_NO_IHASTAGS===DB01_SIX_CATEGORY_TOTAL&&
  areas.every(code=>
    DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS[code]===
      DB01_FIVE_CATEGORY_POSITIVE_AREA_COUNTS[code]+
      DB01_ORIGINAL_SKIN_POSITIVE_AREA_COUNTS[code]),
  'STATIC_ORIGINAL_SIX_SOURCE_DRIFT');

function parse(q:Db01SixSourceQuery){
  check(q!==null&&typeof q==='object'&&!Array.isArray(q),
    'INVALID_QUERY');
  const selected=q.nativeCategories??cats;
  const companion=q.companionKinds??['pet','mount','critter'];
  const skin=q.skinSourceClasses??skinClasses;
  const area=q.areaCodes??[0];
  const offset=q.offset??0,limit=q.limit??100;
  check(Array.isArray(selected)&&selected.length<=6&&
    selected.every(x=>catSet.has(x))&&
    new Set(selected).size===selected.length,
    'INVALID_CATEGORIES');
  check(Array.isArray(companion)&&companion.length<=3&&
    companion.every(x=>kinds.has(x))&&
    new Set(companion).size===companion.length&&
    (q.companionKinds===undefined||selected.includes('Companion')),
    'INVALID_COMPANION_KINDS');
  check(Array.isArray(skin)&&skin.length<=7&&
    skin.every(x=>skinSet.has(x))&&
    new Set(skin).size===skin.length&&
    (q.skinSourceClasses===undefined||selected.includes('Skin')),
    'INVALID_SKIN_LAYOUT_CLASSES');
  check(Array.isArray(area)&&area.length>=1&&area.length<=6&&
    area.every(x=>x===0||areasSet.has(x))&&
    new Set(area).size===area.length&&
    (!area.includes(0)||area.length===1),
    'INVALID_NATIVE_AREA_SELECTION');
  check(nonnegative(offset)&&offset<=1_000_000&&
    nonnegative(limit)&&limit<=1000,
    'INVALID_PAGING');
  return {
    categories:new Set<string>(selected),
    companion:companion as readonly Db01OriginalCompanionKind[],
    skin:skin as readonly Db01SkinSourceProtobufClass[],
    areas:area as readonly (Db01SixPositiveAreaCode|0)[],
    offset,limit,
  };
}
type Source='five'|'skin';
type SourcePage=Readonly<{total:number;itemIds:readonly number[];hasMore:boolean}>;
interface Cursor{
  readonly source:Source;
  readonly total:number;
  loaded:number;
  lastConsumed:number;
  page:readonly number[];
  position:number;
}

export function createDb01SixSourceClient(
  five:Db01FiveCategorySourceClient,
  skin:Db01OriginalSkinClient,
):Db01SixSourceClient{
  check(five?.schema===DB01_FIVE_CATEGORY_NATIVE_AREA_SCHEMA&&
    five.gameVersion==='1.26.2'&&
    typeof five.getItem==='function'&&
    typeof five.getCoverage==='function'&&
    typeof five.search==='function'&&
    skin?.schema===DB01_ORIGINAL_SKIN_NATIVE_SCHEMA&&
    skin.gameVersion==='1.26.2'&&
    typeof skin.getItem==='function'&&
    typeof skin.getCoverage==='function'&&
    typeof skin.search==='function',
    'PINNED_PRIVATE_SOURCE_CLIENTS_REQUIRED');

  async function getItem(id:number):Promise<Readonly<Db01SixSourceItem>|null>{
    check(positive(id),'INVALID_ITEM_ID');
    const [a,b]=await Promise.all([five.getItem(id),skin.getItem(id)]);
    check(!(a&&b),'CROSS_SOURCE_ORIGINAL_ID_COLLISION');
    if(a){
      check(a.itemId===id&&
        a.originalSourceVerified===true&&
        a.critterRuntimeProfileSceneResolved===false&&
        a.nativeAllAreasDefaultVerified===false&&
        a.gameCollectionUiMembershipVerified===false&&
        a.playerOwnershipVerified===false&&
        a.dlcEntitlementVerified===false&&
        (a.positiveAreaCodes===null||
          Array.isArray(a.positiveAreaCodes))&&
        (a.sourceAreaEvidence==='requires_profile_world_scene')===
          (a.positiveAreaCodes===null),
        'FIVE_SOURCE_PROOF_MISSING');
      return Object.freeze({
        itemId:id,nativeCategory:a.nativeCategory,
        sourceProtobufClass:a.originalNativeClass,
        positiveAreaCodes:a.positiveAreaCodes===null?
          null:Object.freeze([...a.positiveAreaCodes]),
        areaEvidence:a.sourceAreaEvidence,
        companionKind:a.companionKind,
        skinSourceIdBand:null,
        originalSourceVerified:true as const,
        runtimeNativeObjectTypeIndependentlyVerified:false as const,
        originalAllAreasNativeDefaultVerified:false as const,
        runtimeCritterProfileSceneResolved:false as const,
        gameCollectionUiMembershipVerified:false as const,
        worldAvailabilityVerified:false as const,
        playerOwnershipVerified:false as const,
        dlcEntitlementVerified:false as const,
      });
    }
    if(!b)return null;
    check(b.source.itemId===id&&
      b.originalSourceHashVerified===true&&
      b.originalSourceLayoutVerified===true&&
      b.runtimeNativeClassIndependentlyVerified===false&&
      b.nativeAllAreasDefaultVerified===false&&
      b.gameCollectionUiMembershipVerified===false&&
      b.playerOwnershipVerified===false&&
      b.dlcEntitlementVerified===false&&
      ((b.positiveNativeAreaCodes===null&&
        b.sourceNativeTagState==='not_ihas_tags')||
       (Array.isArray(b.positiveNativeAreaCodes)&&
        (b.sourceNativeTagState==='positive_native_tag'||
         b.sourceNativeTagState==='no_positive_native_tag')&&
        (b.sourceNativeTagState==='positive_native_tag')===
          (b.positiveNativeAreaCodes.length>0))),
      'SKIN_SOURCE_PROOF_MISSING');
    return Object.freeze({
      itemId:id,nativeCategory:'Skin' as const,
      sourceProtobufClass:b.source.sourceProtobufClass,
      positiveAreaCodes:b.positiveNativeAreaCodes===null?
        null:Object.freeze([...b.positiveNativeAreaCodes]),
      areaEvidence:b.sourceNativeTagState==='not_ihas_tags'?
        'original_class_without_ihastags' as const:
        b.sourceNativeTagState==='positive_native_tag'?
          'native_positive_tag' as const:
          'native_ihastags_without_positive_tag' as const,
      companionKind:null,
      skinSourceIdBand:b.source.sourceIdBand,
      originalSourceVerified:true as const,
      runtimeNativeObjectTypeIndependentlyVerified:false as const,
      originalAllAreasNativeDefaultVerified:false as const,
      runtimeCritterProfileSceneResolved:false as const,
      gameCollectionUiMembershipVerified:false as const,
      worldAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      dlcEntitlementVerified:false as const,
    });
  }

  let cache:Promise<Readonly<Db01SixSourceCoverage>>|null=null;
  async function getCoverage():Promise<Readonly<Db01SixSourceCoverage>>{
    if(cache)return cache;
    cache=(async()=>{
      const [a,b]=await Promise.all([
        five.getCoverage(),skin.getCoverage(),
      ]);
      check(a.gameVersion==='1.26.2'&&
        a.sourceDefinitions===9615&&
        a.sourcePositiveNativeAreaItems===8955&&
        a.sourceIHasTagsWithoutPositiveArea===535&&
        a.sourceCritterNeedsProfileWorldScene===125&&
        a.originalAllAreasNativeDefaultVerified===false&&
        a.runtimeCritterSceneResolved===false&&
        a.gameCollectionUiMembershipVerified===false&&
        b.originalSourceDefinitions===163&&
        b.sourceWithDirectTags===71&&
        b.sourceWithPositiveAreaTag===21&&
        b.sourceIHasTagsWithoutPositiveArea===138&&
        b.sourceWithoutIHasTagsInterface===4&&
        b.nativeSourceLayoutVerified===true&&
        b.nativeRuntimeClassIndependentlyVerified===false&&
        b.gameCollectionUiMembershipVerified===false&&
        b.allAreasNativeDefaultVerified===false&&
        cats.slice(0,5).every(c=>
          a.byOriginalNativeCategory[
            c as Db01FiveCategoryNativeCategory]===
            DB01_SIX_CATEGORY_SOURCE_COUNTS[c])&&
        areas.every(code=>
          a.sourcePositiveByOriginalArea[code]+
          b.sourcePositiveAreasByCode[code]===
            DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS[code]),
        'PINNED_SIX_SOURCE_CENSUS_OR_PROOF_DRIFT');
      return Object.freeze({
        gameVersion:'1.26.2' as const,
        originalSourceDefinitions:DB01_SIX_CATEGORY_TOTAL,
        originalNativeCategoryCounts:DB01_SIX_CATEGORY_SOURCE_COUNTS,
        sourcePositiveNativeAreaItems:DB01_SIX_CATEGORY_NATIVE_POSITIVE,
        sourceIHasTagsWithoutPositiveArea:
          DB01_SIX_CATEGORY_NATIVE_NO_POSITIVE,
        sourceCritterRuntimeSceneRequired:
          DB01_SIX_CATEGORY_PROFILE_SCENE_UNRESOLVED,
        sourceSkinWithoutIHasTags:DB01_SIX_CATEGORY_NO_IHASTAGS,
        sourcePositiveByArea:DB01_SIX_CATEGORY_POSITIVE_AREA_COUNTS,
        originalSourceVerified:true as const,
        originalAllAreasNativeDefaultVerified:false as const,
        runtimeCritterProfileSceneResolved:false as const,
        gameCollectionUiMembershipVerified:false as const,
        playerOwnershipVerified:false as const,
        dlcEntitlementVerified:false as const,
      });
    })().catch(error=>{cache=null;throw error;});
    return cache;
  }

  async function search(query:Db01SixSourceQuery={}):
    Promise<Readonly<Db01SixSourcePage>>{
    const q=parse(query);
    const selectedFive=cats.slice(0,5).filter(x=>
      q.categories.has(x)) as readonly Db01FiveCategoryNativeCategory[];
    const fiveEnabled=selectedFive.length>0&&
      (!selectedFive.every(x=>x==='Companion')||q.companion.length>0);
    const skinEnabled=q.categories.has('Skin')&&q.skin.length>0;
    const isPositiveQuery=q.areas[0]!==0;
    const critterUnknown=isPositiveQuery&&
      selectedFive.includes('Companion')&&
      q.companion.includes('critter');
    const skinWithoutTagsUnknown=isPositiveQuery&&skinEnabled&&
      q.skin.some(x=>x==='MountSkinItemData'||x==='BoatSkinItemData');
    async function fetchPage(src:Source,offset:number,limit:number):
      Promise<SourcePage>{
      if(src==='five'){
        const page=await five.search({
          nativeCategories:selectedFive,
          ...(selectedFive.includes('Companion')?
            {companionKinds:q.companion}:{}),
          areaCodes:q.areas,offset,limit,
        });
        check(page.originalSourceAreaSearchOnly===true&&
          page.nativeAllAreasDefaultVerified===false&&
          page.gameCollectionUiMembershipVerified===false&&
          page.playerOwnershipVerified===false&&
          page.dlcEntitlementVerified===false,
          'FIVE_SOURCE_PAGE_PROOF');
        return page;
      }
      const page=await skin.search({
        sourceProtobufClasses:q.skin,
        areaCodes:q.areas,offset,limit,
      });
      check(page.originalSourceOnly===true&&
        page.untaggedClassesExcludedOnlyFromPositiveTagQuery===true&&
        page.allAreasNativeDefaultVerified===false&&
        page.gameCollectionUiMembershipVerified===false&&
        page.playerOwnershipVerified===false&&
        page.dlcEntitlementVerified===false,
        'SKIN_SOURCE_PAGE_PROOF');
      return page;
    }
    const [f,s]=await Promise.all([
      fiveEnabled?fetchPage('five',0,0):null,
      skinEnabled?fetchPage('skin',0,0):null,
    ]);
    const cursors:Cursor[]=[];
    let total=0;
    for(const [src,part,cap] of [
      ['five',f,9615],['skin',s,163],
    ] as const){
      if(part===null)continue;
      check(nonnegative(part.total)&&part.total<=cap&&
        Array.isArray(part.itemIds)&&part.itemIds.length===0&&
        part.hasMore===(part.total>0),
        'INVALID_SOURCE_COUNT_PAGE');
      total+=part.total;
      if(part.total)cursors.push({
        source:src,total:part.total,loaded:0,lastConsumed:0,
        page:[],position:0,
      });
    }
    const result=(itemIds:readonly number[])=>
      Object.freeze({
        itemIds:Object.freeze([...itemIds]),
        total,hasMore:total>q.offset+itemIds.length,
        originalSourceOnly:true as const,
        allAreasMeansUnfilteredSource:!isPositiveQuery,
        critterAreaCandidatesRequireRuntimeScene:critterUnknown,
        skinNoIHasTagsItemsCannotBeEvaluated:skinWithoutTagsUnknown,
        originalAllAreasNativeDefaultVerified:false as const,
        runtimeCritterProfileSceneResolved:false as const,
        gameCollectionUiMembershipVerified:false as const,
        playerOwnershipVerified:false as const,
        dlcEntitlementVerified:false as const,
      });
    if(!q.limit||q.offset>=total)return result([]);
    async function head(c:Cursor):Promise<number|null>{
      while(c.position>=c.page.length){
        if(c.loaded>=c.total)return null;
        const found=await fetchPage(c.source,c.loaded,
          Math.min(256,c.total-c.loaded));
        check(found.total===c.total&&
          Array.isArray(found.itemIds)&&found.itemIds.length>0&&
          found.itemIds.length<=256&&
          found.itemIds.every(positive)&&
          found.itemIds.every((id,i)=>i===0?
            id>c.lastConsumed:id>found.itemIds[i-1])&&
          found.hasMore===(c.loaded+found.itemIds.length<c.total),
          'ORIGINAL_SOURCE_UNSORTED_OR_CORRUPT_PAGE');
        c.loaded+=found.itemIds.length;
        c.page=found.itemIds;
        c.position=0;
      }
      return c.page[c.position];
    }
    const ids:number[]=[];
    const stop=Math.min(total,q.offset+q.limit);
    for(let seen=0;seen<stop;seen++){
      const entries=await Promise.all(cursors.map(head));
      let chosen=-1,lowest=Infinity;
      for(let i=0;i<entries.length;i++){
        const value=entries[i];
        if(value===null)continue;
        check(value!==lowest,'DUPLICATE_CROSS_SOURCE_ORIGINAL_ITEM');
        if(value<lowest){lowest=value;chosen=i;}
      }
      check(chosen>=0,'ORIGINAL_SOURCE_PREMATURE_EXHAUSTION');
      if(seen>=q.offset)ids.push(lowest);
      const pick=cursors[chosen];
      pick.lastConsumed=lowest;
      pick.position++;
    }
    return result(ids);
  }
  return Object.freeze({
    schema:DB01_SIX_CATEGORY_SOURCE_SCHEMA,
    gameVersion:'1.26.2' as const,
    getItem,getCoverage,search,
  });
}
