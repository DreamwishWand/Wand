/**
 * DB-00 owner-local Companion native class and source-positive area browser.
 *
 * DB-01 owns the SHA-verified PRIVATE original Companion source. DB-02 owns
 * the public SHA-verified 394 original Item IDs/name keys and 134 Pet Source
 * enum values. This join cannot convert native Pet/Mount Tags to actual
 * game Collection UI membership. Critters have NO IHasTags and require
 * ProfileWorld/scene evaluation (not available from this original source).
 */
import {canonicalId} from './model.ts';
import type {PublicSharedGameSources} from './public-sources.ts';
import type {Db00CompanionIdentityReader,Db00CompanionIdentityItem}
  from './native-companion-identities.ts';
import type {Db00OriginalCollectionArea}
  from './collection-area-sources.ts';
import {
  DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA,
  DB01_ORIGINAL_COMPANION_SOURCE_SHA256,
  DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS,
  DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS,
  type Db01OriginalCompanionClient,
  type Db01OriginalCompanionItem,
  type Db01OriginalCompanionCoverage,
  type Db01OriginalCompanionKind,
  type Db01OriginalCompanionArea
} from '../items/companion-native-has-tag.ts';

export const DB00_LOCAL_COMPANION_CLASSES=
  'wand.game-db.local-original-companion-classes@1' as const;
type AreaCode=Db01OriginalCompanionArea|0;
const AREA_CODES=Object.freeze([1,2,3,4,5,4097] as const);
const KINDS=Object.freeze(['pet','mount','critter'] as const);
const MAX_PAGE=150;
const MAX_BATCH=200;
function assert(ok:unknown,reason:string):asserts ok {
  if(!ok)throw new TypeError('DB00_LOCAL_COMPANION_'+reason);
}
export interface Db00LocalCompanionItem{
  readonly itemId:string;
  readonly publicIdentity:Db00CompanionIdentityItem;
  readonly original:Readonly<Db01OriginalCompanionItem>;
  readonly nativeKind:Db01OriginalCompanionKind;
  readonly originalNativeClass:'PetItemData'|'MountItemData'|'CritterItemData';
  /**
   * null = Critter has no IHasTags, NOT zero matches;
   * [] = genuine Pet/Mount IHasTags with no positive source area Tag.
   */
  readonly positiveNativeAreaCodes:readonly Db01OriginalCompanionArea[]|null;
  readonly positiveSourceAreas:readonly Db00OriginalCollectionArea[]|null;
  readonly sourceAreaResolution:
    'positive_original_pet_or_mount_tag'|
    'no_positive_original_pet_or_mount_tag'|
    'critter_requires_profile_world_scene';
  readonly needsRuntimeCritterSceneEvaluation:boolean;
  readonly originalNativeClassVerified:true;
  readonly originalNativeNameKeyVerified:true;
  readonly gameCollectionUiMembershipVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly campaignGrantVerified:false;
}
export interface Db00LocalCompanionCoverage{
  readonly snapshotId:string;
  readonly original:Readonly<Db01OriginalCompanionCoverage>;
  readonly originalDefinitions:394;
  readonly petDefinitions:241;
  readonly mountDefinitions:28;
  readonly critterDefinitions:125;
  readonly petMountPositiveAreaMatches:246;
  readonly petMountNoPositiveAreaMatches:23;
  readonly critterSceneLocationPending:125;
  readonly critterOneofLocation6:105;
  readonly critterOneofScene7:20;
  readonly positiveAreaCounts:Readonly<Record<Db01OriginalCompanionArea,number>>;
  readonly nativeAllAreasDefaultVerified:false;
  readonly critterRuntimeWorldVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
}
export interface Db00LocalCompanionSearchRequest{
  readonly kinds?:readonly Db01OriginalCompanionKind[];
  /** [0] is all original Companion definitions, not a native UI AllAreas. */
  readonly areaCodes?:readonly AreaCode[];
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00LocalCompanionPage{
  readonly snapshotId:string;
  readonly kinds:readonly Db01OriginalCompanionKind[];
  readonly areaCodes:readonly AreaCode[];
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00LocalCompanionItem[];
  readonly allAreasMeansUnfilteredOriginalSource:boolean;
  readonly critterRuntimeWorldVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db00LocalCompanionReader{
  readonly contract:typeof DB00_LOCAL_COMPANION_CLASSES;
  readonly snapshotId:string;
  readonly gameVersion:'1.26.2';
  readonly originalDefinitions:394;
  readonly ownerLocalOnly:true;
  readonly publicationAuthorized:false;
  readonly critterRuntimeWorldVerified:false;
  readonly gameCollectionUiMembershipVerified:false;
  getCoverage():Promise<Db00LocalCompanionCoverage>;
  getItem(itemId:string|number):Promise<Db00LocalCompanionItem|null>;
  getItems(itemIds:readonly (string|number)[]):
    Promise<readonly (Db00LocalCompanionItem|null)[]>;
  search(query?:Db00LocalCompanionSearchRequest):
    Promise<Db00LocalCompanionPage>;
}

/** Loads public companion names only on explicit invocation; owner-local
 * DB-01 original shards remain behind the caller-supplied client. */
export async function joinDb00LocalCompanionSources(
  publicData:PublicSharedGameSources,
  source:Db01OriginalCompanionClient
):Promise<Db00LocalCompanionReader>{
  const db=publicData?.database;
  const areas=publicData?.originalCollectionAreas;
  assert(publicData?.schema==='wand.game-db.public-sources@1' &&
    publicData.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    db?.contract==='wand.game-db.shared@1'&&
    db.itemCount===13202&&db.target.platform==='Steam'&&
    db.target.gameVersion==='1.26.2'&&
    publicData.hasPrivateGameSource===false&&
    publicData.playerOwnershipVerified===false&&
    typeof publicData.loadNativeCompanionIdentitySources==='function'&&
    areas?.contract==='wand.game-db.original-collection-area-reference@1'&&
    areas.gameVersion==='1.26.2'&&
    areas.sourceConfigCount===7&&areas.orderedAreas.length===7&&
    areas.gameUiItemMembershipVerified===false&&
    source?.schema===DB01_ORIGINAL_COMPANION_NATIVE_SCHEMA&&
    source.gameVersion==='1.26.2'&&
    typeof source.getItem==='function'&&
    typeof source.getItems==='function'&&
    typeof source.getCoverage==='function'&&
    typeof source.search==='function',
    'CURRENT_PUBLIC_AND_PRIVATE_COMPANION_SOURCES_REQUIRED');
  const positive=areas.orderedAreas.filter(a=>a.original.gameplayTagId>0);
  assert(positive.length===6&&
    positive.every((a,i)=>a.areaCode===AREA_CODES[i]&&
      a.originalConfigVerified===true&&
      a.sourceTagCandidateOnly===true&&
      a.gameUiItemMembershipVerified===false)&&
    areas.orderedAreas[6].areaCode===0&&
    areas.orderedAreas[6].original.gameplayTagId===0,
    'CURRENT_ORIGINAL_AREA_CONFIG_SEQUENCE_REQUIRED');
  const areaByCode=new Map<number,Db00OriginalCollectionArea>(
    positive.map(a=>[a.areaCode,a])
  );
  assert(areaByCode.size===6&&
    areas.originalTagSha256.length===64,
    'ORIGINAL_POSITIVE_AREA_CONFIG_INVALID');

  const identity:Db00CompanionIdentityReader=
    await publicData.loadNativeCompanionIdentitySources();
  assert(identity.contract==='wand.game-db.native-companion-identities@1'&&
    identity.snapshotId===publicData.snapshotId&&
    identity.originalCompanionDefinitions===394&&
    identity.originalIdentityVerified===true&&
    identity.campaignNumericItemIdLinkVerified===false&&
    identity.playerOwnershipVerified===false&&
    identity.listNativeItemIds().length===394&&
    DB01_ORIGINAL_COMPANION_SOURCE_SHA256===
      '62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219',
    'DB02_COMPANION_ID_SOURCE_PIN_MISMATCH');
  const sourceIds=new Set(identity.listNativeItemIds());
  assert(sourceIds.size===394,'PUBLIC_COMPANION_ID_CENSUS');

  let coverageTask:Promise<Db00LocalCompanionCoverage>|null=null;
  const getCoverage=():Promise<Db00LocalCompanionCoverage>=>{
    if(coverageTask)return coverageTask;
    coverageTask=(async()=>{
      const original=await source.getCoverage();
      const klass=original?.originalNativeClassCounts;
      const byArea=original?.sourcePositiveAreaByCode;
      assert(original?.sourceDefinitions===394&&
        klass!==null&&typeof klass==='object'&&
        Object.entries(DB01_ORIGINAL_COMPANION_NATIVE_CLASS_COUNTS)
          .every(([k,count])=>klass[k as keyof typeof klass]===count)&&
        original.sourceNativeTaggedPositiveAreaItems===246&&
        original.sourceNativeTaggedWithoutPositiveArea===23&&
        original.sourceCritterLocationOneofCase6===105&&
        original.sourceCritterSceneOneofCase7===20&&
        original.sourceCritterRuntimeWorldUnknown===125&&
        byArea!==null&&typeof byArea==='object'&&
        AREA_CODES.every(code=>
          byArea[code]===DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS[code])&&
        AREA_CODES.reduce((s,k)=>s+byArea[k],0)===246&&
        original.nativeClassAndInterfaceSourceVerified===true&&
        original.critterRuntimeCollectionAreaVerified===false&&
        original.actualGameUiMembershipVerified===false&&
        original.nativeAllAreasDefaultTagVerified===false,
        'ORIGINAL_COMPANION_CLASS_CENSUS_MISMATCH');
      return Object.freeze({
        snapshotId:publicData.snapshotId,original,
        originalDefinitions:394 as const,petDefinitions:241 as const,
        mountDefinitions:28 as const,critterDefinitions:125 as const,
        petMountPositiveAreaMatches:246 as const,
        petMountNoPositiveAreaMatches:23 as const,
        critterSceneLocationPending:125 as const,
        critterOneofLocation6:105 as const,
        critterOneofScene7:20 as const,
        positiveAreaCounts:DB01_ORIGINAL_COMPANION_POSITIVE_AREA_COUNTS,
        nativeAllAreasDefaultVerified:false as const,
        critterRuntimeWorldVerified:false as const,
        gameCollectionUiMembershipVerified:false as const
      });
    })().catch(err=>{coverageTask=null;throw err;});
    return coverageTask;
  };
  function joinOne(
    id:string,original:Readonly<Db01OriginalCompanionItem>|null
  ):Db00LocalCompanionItem|null{
    const pub=identity.getItem(id);
    if(original===null){
      assert(pub===null,'MISSING_PRIVATE_COMPANION_ID');
      return null;
    }
    const x=original.source;
    assert(sourceIds.has(id)&&pub!==null&&
      x.itemId===Number(id)&&
      x.nativeCategory==='Companion'&&
      x.nativeKey===pub.native.nativeNameKey&&
      pub.native.originalSourceSha256===DB01_ORIGINAL_COMPANION_SOURCE_SHA256&&
      pub.originalIdentityVerified===true&&
      pub.numericCampaignRewardLinkVerified===false&&
      pub.playerOwnershipVerified===false&&
      x.nativeClassSourceVerified===true&&
      x.originalIHasSetInterface===false&&
      x.gameUiCollectionMembershipVerified===false&&
      x.dlcEntitlementVerified===false&&
      x.runtimeCritterWorldSceneVerified===false&&
      original.sourceShardHashVerified===true&&
      original.sourceOriginalNativeClassVerified===true&&
      original.actualCollectionUiMembershipVerified===false&&
      original.nativeAllAreasDefaultPredicateVerified===false&&
      original.playerEntitlementVerified===false,
      'COMPANION_ORIGINAL_ID_CLASS_OR_PROOF_MISMATCH');
    const critter=x.nativeKind==='critter';
    const pet=x.nativeKind==='pet';
    const mount=x.nativeKind==='mount';
    const codes=original.positiveNativeAreaCodes;
    if(critter){
      assert(x.originalNativeClass==='CritterItemData'&&
        x.nativeTags===null&&x.tagsFieldNumber===null&&
        (x.critterLocationOneofFieldNumber===6||
          x.critterLocationOneofFieldNumber===7)&&
        x.originalIHasTagsInterface===false&&
        codes===null&&
        original.originalIHasTagsInterface===false&&
        original.needsRuntimeCritterSceneEvaluation===true&&
        pub.explicitSourceCategory===null,
        'CRITTER_MUST_NOT_BE_EVALUATED_AS_TAGGABLE_PET');
    }else{
      assert((pet&&x.originalNativeClass==='PetItemData'&&
        x.tagsFieldNumber===7)||
        (mount&&x.originalNativeClass==='MountItemData'&&
          x.tagsFieldNumber===10),
        'INCORRECT_PET_OR_MOUNT_ORIGINAL_CLASS');
      assert(x.nativeTags!==null&&Array.isArray(x.nativeTags)&&
        x.critterLocationOneofFieldNumber===null&&
        x.originalIHasTagsInterface===true&&
        original.originalIHasTagsInterface===true&&
        original.needsRuntimeCritterSceneEvaluation===false&&
        codes!==null&&Array.isArray(codes)&&codes.length<=1&&
        codes.every(code=>areaByCode.has(code))&&
        codes.every(code=>x.nativeTags!.includes(
          areaByCode.get(code)!.original.gameplayTagId))&&
        positive.filter(a=>x.nativeTags!.includes(a.original.gameplayTagId))
          .length===codes.length&&
        (mount?pub.explicitSourceCategory===null:true),
        'ORIGINAL_PET_MOUNT_NATIVE_TAG_MISMATCH');
    }
    const refs=codes===null?null:Object.freeze(
      codes.map(code=>areaByCode.get(code)!)
    );
    const result:Db00LocalCompanionItem=Object.freeze({
      itemId:id,publicIdentity:pub,original,
      nativeKind:x.nativeKind,originalNativeClass:x.originalNativeClass,
      positiveNativeAreaCodes:codes,positiveSourceAreas:refs,
      sourceAreaResolution:critter?'critter_requires_profile_world_scene':
        codes!.length?'positive_original_pet_or_mount_tag':
          'no_positive_original_pet_or_mount_tag',
      needsRuntimeCritterSceneEvaluation:critter,
      originalNativeClassVerified:true,
      originalNativeNameKeyVerified:true,
      gameCollectionUiMembershipVerified:false,
      currentAvailabilityVerified:false,
      playerOwnershipVerified:false,
      dlcEntitlementVerified:false,
      campaignGrantVerified:false
    });
    return result;
  }
  async function getItem(raw:string|number):
    Promise<Db00LocalCompanionItem|null>{
    const id=canonicalId(raw);
    return joinOne(id,await source.getItem(Number(id)));
  }
  async function getItems(ids:readonly (string|number)[]):
    Promise<readonly (Db00LocalCompanionItem|null)[]>{
    assert(Array.isArray(ids)&&ids.length<=MAX_BATCH,'INVALID_BATCH');
    const keys=ids.map(canonicalId);
    const originals=await source.getItems(keys.map(Number));
    assert(originals.length===keys.length,'SOURCE_BATCH_LENGTH_MISMATCH');
    return Object.freeze(originals.map((row,i)=>joinOne(keys[i],row)));
  }
  function normalizeQuery(raw:Db00LocalCompanionSearchRequest){
    assert(raw!==null&&typeof raw==='object'&&!Array.isArray(raw),
      'INVALID_SEARCH_QUERY');
    const kinds=raw.kinds??KINDS,areaCodes=raw.areaCodes??[0];
    assert(Array.isArray(kinds)&&kinds.length<=3&&
      kinds.every(k=>KINDS.includes(k))&&
      new Set(kinds).size===kinds.length,'INVALID_SOURCE_KIND_FILTER');
    assert(Array.isArray(areaCodes)&&areaCodes.length>0&&
      areaCodes.length<=6&&
      areaCodes.every(code=>code===0||areaByCode.has(code))&&
      new Set(areaCodes).size===areaCodes.length&&
      (!areaCodes.includes(0)||areaCodes.length===1),
      'INVALID_OR_AMBIGUOUS_SOURCE_AREA');
    const offset=raw.offset??0,limit=raw.limit??100;
    assert(Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=MAX_PAGE,
      'INVALID_PAGE');
    return {kinds,areaCodes,offset,limit};
  }
  async function search(raw:Db00LocalCompanionSearchRequest={}):
    Promise<Db00LocalCompanionPage>{
    const q=normalizeQuery(raw);
    await getCoverage();
    const page=await source.search(q);
    const all=q.areaCodes.length===1&&q.areaCodes[0]===0;
    assert(Number.isSafeInteger(page?.total)&&page.total>=0&&
      page.total<=394&&
      (!q.kinds.length||page.total>=0)&&
      (!q.kinds.length?page.total===0:true)&&
      (all&&q.kinds.length===3?page.total===394:true)&&
      Array.isArray(page.itemIds)&&
      page.itemIds.length<=q.limit&&
      page.itemIds.length<=Math.max(0,page.total-q.offset)&&
      (page.total<=q.offset||page.itemIds.length>0)&&
      page.itemIds.every((id,i)=>Number.isSafeInteger(id)&&
        id>0&&(i===0||id>page.itemIds[i-1]))&&
      page.hasMore===(page.total>q.offset+page.itemIds.length)&&
      page.sourceNativePetAndMountTagOnly===true&&
      page.critterProfileWorldAreaUnresolved===true&&
      page.actualCollectionUiMembershipVerified===false&&
      page.nativeAllAreasDefaultPredicateVerified===false&&
      page.playerEntitlementVerified===false,
      'SOURCE_COMPANION_PAGE_MISMATCH');
    const rows=await getItems(page.itemIds);
    const allowedKinds=new Set(q.kinds);
    const items=Object.freeze(rows.map(row=>{
      assert(row!==null&&allowedKinds.has(row.nativeKind)&&
        (all||row.positiveNativeAreaCodes?.some(code=>
          q.areaCodes.includes(code))===true)&&
        row.playerOwnershipVerified===false&&
        row.gameCollectionUiMembershipVerified===false,
        'SOURCE_COMPANION_PAGE_ROW_MISMATCH');
      return row;
    }));
    const next=q.offset+items.length;
    return Object.freeze({
      snapshotId:publicData.snapshotId,
      kinds:Object.freeze([...q.kinds]),
      areaCodes:Object.freeze([...q.areaCodes]),
      total:page.total,offset:q.offset,
      nextOffset:next<page.total?next:null,
      items,allAreasMeansUnfilteredOriginalSource:all,
      critterRuntimeWorldVerified:false,
      gameCollectionUiMembershipVerified:false,
      playerOwnershipVerified:false,
      dlcEntitlementVerified:false
    });
  }
  return Object.freeze({
    contract:DB00_LOCAL_COMPANION_CLASSES,
    snapshotId:publicData.snapshotId,gameVersion:'1.26.2' as const,
    originalDefinitions:394 as const,
    ownerLocalOnly:true as const,
    publicationAuthorized:false as const,
    critterRuntimeWorldVerified:false as const,
    gameCollectionUiMembershipVerified:false as const,
    getCoverage,getItem,getItems,search
  });
}
