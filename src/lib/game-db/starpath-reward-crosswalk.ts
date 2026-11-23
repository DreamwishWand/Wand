/**
 * DB-00: 60 original source-recorded Star Path reward/currency Item IDs,
 * with DB-03's source-pinned 43+9 exact names and 8 UNNAMED motifs.
 *
 * A source reward ID is not a granted/owned reward, an active Star Path,
 * a guaranteed Vault alternative, a playable premium entitlement, or a
 * Collection UI item. Never invent a motif name or publish private SQLite.
 */
import {canonicalId} from './model.ts';
import type {DbLocale,SharedGameDatabase} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem} from './source-join.ts';
import type {GuideRewardIndex,GuideItemRelation} from '../guide/reward-relations.ts';
import {
  STARPATH_EXTRA_CATEGORIES,
  type StarpathExtraCategory,type StarpathRewardExtras,
  starpathRewardDisplayName
} from '../guide/starpath-reward-extras.ts';
import {
  VERIFIED_STARPATH_REWARD_NAMES,
  STARPATH_UNRESOLVED_REWARD_IDS,
  verifyStarpathRewardNameCensus,starpathRewardName
} from '../guide/starpath-reward-names.ts';

export const DB00_STARPATH_EXTRA_CONTRACT=
  'wand.game-db.starpath-reward-crosswalk@1' as const;
export type Db00StarpathNameState=
  'public_original_name'|'original_extra_name'|'no_native_motif_name';
const LOCALES=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
const CATEGORIES=new Set<string>([
  'Building','Currency','TouchOfMagic','Tool',
  'Companion','Makeup','Skin','PhotoMode'
]);
const VALID_SEASON=/^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB00_STARPATH_CROSSWALK_'+code);
}
export interface Db00StarpathRewardItem{
  readonly itemId:string;
  readonly item:Db00SourceJoinedItem;
  readonly relations:readonly GuideItemRelation[];
  readonly seasonIds:readonly string[];
  readonly exactOriginalDisplayName:string|null;
  readonly nameState:Db00StarpathNameState;
  /** Only the 17 separately source-verified extras have this specific type. */
  readonly extraNativeCategory:StarpathExtraCategory|null;
  readonly configuredRewardsOnly:true;
  readonly currentAvailabilityVerified:false;
  readonly guaranteedGrantVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00StarpathRewardSearchRequest{
  readonly locale?:DbLocale;
  /** Exact original localized name substring or numeric Item ID prefix. */
  readonly text?:string;
  readonly seasonId?:string;
  readonly nameState?:Db00StarpathNameState;
  readonly extraNativeCategory?:StarpathExtraCategory;
  /** Source configuration IDs with no published ItemList definition are excluded. */
  readonly publishedOnly?:true;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00StarpathRewardPage{
  readonly scope:'pinned_starpath_reward_source_only';
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00StarpathRewardItem[];
  readonly currentAvailabilityVerified:false;
  readonly guaranteedGrantVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
  readonly seasonCatalogComplete:false;
}
export interface Db00StarpathRewardReader{
  readonly contract:typeof DB00_STARPATH_EXTRA_CONTRACT;
  readonly snapshotId:string;
  readonly sourceItemIds:60;
  readonly publicOriginalNames:43;
  readonly additionalOriginalNames:9;
  readonly unlabeledMotifs:8;
  getItem(itemId:string|number,locale?:DbLocale):Db00StarpathRewardItem|null;
  search(request?:Db00StarpathRewardSearchRequest):Db00StarpathRewardPage;
}
export function createDb00StarpathRewardReader(
  database:SharedGameDatabase,joined:Db00SourceJoinedReader,
  guide:GuideRewardIndex,extras:StarpathRewardExtras
):Db00StarpathRewardReader{
  check(database?.contract==='wand.game-db.shared@1' &&
    database.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    database.itemCount===13202 &&
    database.target.platform==='Steam' &&
    database.target.gameVersion==='1.26.2' &&
    joined?.contract==='wand.game-db.source-join@1' &&
    joined.snapshotId===database.snapshotId,
    'EXACT_CURRENT_ITEMLIST_REQUIRED');
  check(guide?.contract==='wand.db03.reward-relations@1' &&
    guide.evidence.platform==='Steam' &&
    guide.evidence.gameVersion==='1.26.2' &&
    guide.evidence.integrity==='pinned_public_sha256' &&
    guide.coverage.currentAvailabilityVerified===false &&
    guide.coverage.playerProgressIncluded===false &&
    Array.isArray(guide.itemIds) && guide.itemIds.length===60 &&
    guide.seasons.length===2,
    'EXACT_CURRENT_REWARD_SOURCE_REQUIRED');
  check(extras?.schema==='wand.db03.starpath-reward-extra@1' &&
    extras.source?.gameVersion==='Steam 1.26.2' &&
    extras.source.catalogComplete===false &&
    extras.source.published?.localizedNames===9 &&
    extras.source.published?.sourceCategories===17 &&
    extras.source.published?.unlabeledMotifs===8 &&
    extras.source.privatePackageSha256===
      '0a1286655a0c4d2ceb91aa61a06c257d2cf485076c8a11dbf3484ad3b7bb5f25' &&
    extras.rows && Object.keys(extras.rows).length===17,
    'EXACT_PINNED_REWARD_EXTRAS_REQUIRED');
  const census=verifyStarpathRewardNameCensus();
  check(census.verifiedNames===43&&census.unresolved===17 &&
    census.sourceCandidates===60 && census.playerOwnershipVerified===false &&
    census.currentAvailabilityVerified===false,
    'STARPATH_NAME_CENSUS');
  const known=new Set<string>(Object.keys(VERIFIED_STARPATH_REWARD_NAMES));
  const extra=new Set<string>(STARPATH_UNRESOLVED_REWARD_IDS);
  const ids=new Set(guide.itemIds);
  check(ids.size===60 && known.size===43 && extra.size===17 &&
    [...known].every(id=>ids.has(id)&&!extra.has(id)) &&
    [...extra].every(id=>ids.has(id)&&Object.hasOwn(extras.rows,id)),
    'REWARD_ID_CLOSURE');
  let extrasNamed=0,motifs=0;
  for(const [id,row] of Object.entries(extras.rows)){
    check(extra.has(id) && row.category===STARPATH_EXTRA_CATEGORIES[id] &&
      CATEGORIES.has(row.category),'EXTRA_SOURCE_CATEGORY_MISMATCH');
    if(row.category==='TouchOfMagic'){
      check(row.names===null,'MOTIF_NAME_MUST_BE_UNKNOWN');
      motifs++;
    }else{
      check(row.names!==null&&Object.keys(row.names).length===8,
        'EXTRA_SOURCE_NAME_REQUIRED');
      extrasNamed++;
    }
  }
  check(extrasNamed===9&&motifs===8,'EXTRA_NAME_CENSUS');
  const sorted=Object.freeze([...ids].sort((a,b)=>Number(a)-Number(b)));
  function originalName(id:string,locale:DbLocale):string|null{
    if(known.has(id))return starpathRewardName(id,locale);
    const row=extras.rows[id];
    if(!row||row.category==='TouchOfMagic')return null;
    return starpathRewardDisplayName(id,locale,extras);
  }
  const nameState=(id:string):Db00StarpathNameState=>
    known.has(id)?'public_original_name':
    extras.rows[id].category==='TouchOfMagic'?
      'no_native_motif_name':'original_extra_name';
  function getItem(raw:string|number,locale:DbLocale='ja'):
    Db00StarpathRewardItem|null{
    check(LOCALES.has(locale),'INVALID_LOCALE');
    const id=canonicalId(raw);
    if(!ids.has(id))return null;
    const joinedItem=joined.getItem(id);
    const relations=guide.getItemRelations(id);
    check(joinedItem.itemId===id && relations.length>0 &&
      relations.every(row=>row.itemId===id &&
        row.configuredRewardOnly===true &&
        row.currentAvailabilityVerified===false &&
        row.playerOwnershipVerified===false) &&
      joinedItem.playerOwnershipVerified===false,
      'ITEM_SOURCE_RELATION_MISMATCH');
    const state=nameState(id),name=originalName(id,locale);
    check((state==='no_native_motif_name'&&name===null) ||
      (state!=='no_native_motif_name'&&typeof name==='string'&&name.length>0),
      'EXACT_NAME_OR_MOTIF_MISMATCH');
    return Object.freeze({
      itemId:id,item:joinedItem,relations:Object.freeze([...relations]),
      seasonIds:Object.freeze([...new Set(relations.map(row=>row.seasonId))]),
      exactOriginalDisplayName:name,nameState:state,
      extraNativeCategory:extras.rows[id]?.category??null,
      configuredRewardsOnly:true as const,
      currentAvailabilityVerified:false as const,
      guaranteedGrantVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  }
  function search(request:Db00StarpathRewardSearchRequest={}):
    Db00StarpathRewardPage{
    check(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const locale=request.locale??'ja';
    check(LOCALES.has(locale),'INVALID_LOCALE');
    const text=request.text??'';
    check(typeof text==='string'&&text.length<=120&&
      !/[\x00-\x1f]/.test(text),'INVALID_TEXT');
    const needle=text.normalize('NFKC').toLocaleLowerCase().trim();
    const season=request.seasonId;
    check(season===undefined||VALID_SEASON.test(season),'INVALID_SEASON');
    const state=request.nameState;
    check(state===undefined || state==='public_original_name' ||
      state==='original_extra_name' || state==='no_native_motif_name',
      'INVALID_NAME_STATE');
    const category=request.extraNativeCategory;
    check(category===undefined||CATEGORIES.has(category),'INVALID_EXTRA_CATEGORY');
    check(request.publishedOnly===undefined||request.publishedOnly===true,
      'INVALID_PUBLISHED_FILTER');
    const offset=request.offset??0,limit=request.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0 &&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,'INVALID_PAGE');
    const matches=sorted.filter(id=>{
      if(state&&nameState(id)!==state)return false;
      if(category&&extras.rows[id]?.category!==category)return false;
      if(request.publishedOnly&&database.getItem(id)===null)return false;
      if(season&&!guide.getItemRelations(id).some(ref=>
        ref.seasonId===season))return false;
      if(needle){
        const name=originalName(id,locale);
        if(!id.startsWith(needle) &&
          !(name&&name.normalize('NFKC').toLocaleLowerCase().includes(needle)))
          return false;
      }
      return true;
    });
    const selected=matches.slice(offset,offset+limit).map(id=>getItem(id,locale)!);
    const next=offset+selected.length;
    return Object.freeze({
      scope:'pinned_starpath_reward_source_only' as const,
      snapshotId:database.snapshotId,total:matches.length,
      offset,nextOffset:next<matches.length?next:null,
      items:Object.freeze(selected),
      currentAvailabilityVerified:false as const,
      guaranteedGrantVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const,
      seasonCatalogComplete:false as const
    });
  }
  return Object.freeze({
    contract:DB00_STARPATH_EXTRA_CONTRACT,
    snapshotId:database.snapshotId,
    sourceItemIds:60 as const,publicOriginalNames:43 as const,
    additionalOriginalNames:9 as const,unlabeledMotifs:8 as const,
    getItem,search
  });
}
