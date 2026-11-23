/**
 * DB-00 original Steam v1.26.2 Companion identity, Pet Source enum and
 * *unverified name-semantic* campaign candidate crosswalk.
 *
 * The native identity is original source data; the three official-to-native
 * naming proposals are NOT original numeric campaign->Item links. Never
 * promote the proposal to a verified origin, redemption grant, owned pet,
 * current sale or Collection UI membership.
 */
import {canonicalId} from './model.ts';
import type {DbLocale,SharedGameDatabase} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem}
  from './source-join.ts';
import {
  hasPinnedCompanionIdentityEvidence,
  DB02_COMPANION_IDENTITIES_SCHEMA,DB02_COMPANION_ORIGINAL_SHA,
  type PinnedNativeCompanionIdentityIndex,
  type CompanionOfficialNameCandidateIndex,
  type NativeCompanionIdentity,type CompanionOfficialNameCandidate
} from '../acquisition/public-native-companion-identities.ts';
import type {NativePetSourceCategory,NativePetSourceClassification}
  from '../acquisition/public-pet-source-categories.ts';
import type {Db00NativeCompanionReader}
  from './native-companions.ts';

export const DB00_NATIVE_COMPANION_IDENTITY_CONTRACT=
  'wand.game-db.native-companion-identities@1' as const;
const CATEGORY=new Set<string>([
  'quest','timebending','event','star_path','premium_shop','exclusive_promotion'
]);
const LOCALES=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
const EMPTY_NAMES=Object.freeze([]) as readonly CompanionOfficialNameCandidate[];
const EMPTY_CLASSIFICATIONS=Object.freeze([]) as readonly NativePetSourceClassification[];
function check(ok:unknown,why:string):asserts ok {
  if(!ok)throw new TypeError('DB00_COMPANION_IDENTITIES_'+why);
}
export type Db00CompanionSourceFilter=NativePetSourceCategory|'not_in_explicit_source_subset';
export interface Db00CompanionIdentityItem {
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  readonly native:NativeCompanionIdentity;
  /** 134 exact original non-world, nonzero PetItemData.Source enum values. */
  readonly sourceClassifications:readonly NativePetSourceClassification[];
  readonly explicitSourceCategory:NativePetSourceCategory|null;
  /** Null does NOT mean no game source or World category. */
  readonly unclassifiedSourceIsNotAbsenceProof:true;
  /** These are three semantic comparisons, never official Item IDs. */
  readonly officialNameCandidates:readonly CompanionOfficialNameCandidate[];
  readonly originalIdentityVerified:true;
  readonly originalNativeNameKeyVerified:true;
  readonly localizedNativeNameVerified:false;
  readonly numericCampaignRewardLinkVerified:false;
  readonly campaignGrantVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00CompanionIdentitySearchRequest{
  readonly category?:Db00CompanionSourceFilter;
  readonly hasOfficialNameCandidateOnly?:true;
  readonly publishedOnly?:true;
  /** Item ID prefix, original native key, or localized DB-00 published name. */
  readonly text?:string;
  readonly locale?:DbLocale;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00CompanionIdentityPage{
  readonly snapshotId:string;
  readonly source:'native_companion_identity_and_pet_source_only';
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00CompanionIdentityItem[];
  readonly originalDefinitionIdsVerified:true;
  readonly numericCampaignRewardLinksVerified:0;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00CompanionIdentityReader {
  readonly contract:typeof DB00_NATIVE_COMPANION_IDENTITY_CONTRACT;
  readonly snapshotId:string;
  readonly originalCompanionDefinitions:394;
  readonly explicitNativeSourceCategoryRows:134;
  readonly remainingWithoutExplicitSourceCategory:260;
  readonly officialNameCandidateRelations:3;
  readonly nativeCandidateItemIds:2;
  readonly originalIdentityVerified:true;
  readonly campaignNumericItemIdLinkVerified:false;
  readonly playerAcquisitionVerified:false;
  readonly playerOwnershipVerified:false;
  listNativeItemIds():readonly string[];
  getItem(itemId:string|number):Db00CompanionIdentityItem|null;
  getNativeNameKey(key:string):Db00CompanionIdentityItem|null;
  getOfficialCampaignNameCandidates(campaignId:string):
    readonly Db00CompanionIdentityItem[];
  search(request?:Db00CompanionIdentitySearchRequest):
    Db00CompanionIdentityPage;
}
export function createDb00CompanionIdentityReader(
  db:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  categories:Db00NativeCompanionReader,
  native:PinnedNativeCompanionIdentityIndex,
  campaigns:CompanionOfficialNameCandidateIndex
):Db00CompanionIdentityReader {
  check(db?.contract==='wand.game-db.shared@1'&&
    db.snapshotId==='steam-1.26.2-native-itemlist-v1'&&
    db.itemCount===13202&&
    db.target.platform==='Steam'&&db.target.gameVersion==='1.26.2'&&
    joined?.contract==='wand.game-db.source-join@1'&&
    joined.snapshotId===db.snapshotId&&
    categories?.contract==='wand.game-db.native-companions@1'&&
    categories.snapshotId===db.snapshotId&&
    categories.categoryRows===134&&
    categories.sourceCategoryOnly===true&&
    categories.specificCampaignLinkVerified===false&&
    categories.playerAcquisitionVerified===false,
    'CURRENT_ITEM_AND_NATIVE_CATEGORY_SOURCE_REQUIRED');
  check(hasPinnedCompanionIdentityEvidence(native)&&
    native.schema===DB02_COMPANION_IDENTITIES_SCHEMA&&
    native.gameVersion==='1.26.2'&&
    native.originalSha256===DB02_COMPANION_ORIGINAL_SHA&&
    native.identities.length===394&&
    native.coverage.originalCompanionDefinitions===394&&
    native.coverage.distinctCompanionItemIds===394&&
    native.coverage.uniqueNativeNameKeys===394&&
    native.coverage.nativeLocalizationKeyPatternVerified===true&&
    native.coverage.specificCampaignLinksVerified===0&&
    native.coverage.translatedDisplayNamesVerified===false&&
    native.coverage.playerAcquisitionVerified===false&&
    campaigns?.schema==='wand.db02.official-native-companion-name-candidates@1'&&
    campaigns.targetVersion==='1.26.2'&&
    campaigns.native===native&&
    campaigns.coverage.semanticCandidateRelations===3&&
    campaigns.coverage.distinctNativeCandidateItemIds===2&&
    campaigns.coverage.officialNumericItemIdLinksVerified===0&&
    campaigns.coverage.playerGrantsVerified===0&&
    campaigns.coverage.nativeNameOnlyNotCampaignProof===true,
    'PINNED_COMPANION_ID_AND_CAMPAIGN_NAME_REQUIRED');

  const ids=native.listItemIds();
  check(ids.length===394&&new Set(ids).size===394&&
    ids.every((id,i)=>i===0||Number(id)>Number(ids[i-1])),
    'NATIVE_COMPANION_ID_CENSUS');
  const categoriesAll=categories.search({limit:500});
  check(categoriesAll.total===134&&
    categoriesAll.items.length===134&&
    categoriesAll.sourceCategoryOnly===true&&
    categoriesAll.specificCampaignLinkVerified===false&&
    categoriesAll.playerAcquisitionVerified===false,
    'NATIVE_SOURCE_CATEGORY_ROWS_REQUIRED');
  const byCategory=new Map<string,NativePetSourceClassification>();
  for(const row of categoriesAll.items){
    const id=row.itemId;
    check(native.getItem(id)!==null&&!byCategory.has(id)&&
      row.sourceClassified===true&&
      row.classifications.length===1&&
      row.classifications[0].itemId===id&&
      CATEGORY.has(row.classifications[0].category)&&
      row.classifications[0].sourceCategoryOnly===true&&
      row.classifications[0].campaignLinkVerified===false&&
      row.classifications[0].playerAcquisitionVerified===false,
      'PET_CATEGORY_FOREIGN_OR_MISMATCH');
    byCategory.set(id,row.classifications[0]);
  }
  check(byCategory.size===134&&ids.length-byCategory.size===260,
    'NATIVE_COMPANION_CATEGORY_CENSUS');

  const namedCandidates=new Map<string,readonly CompanionOfficialNameCandidate[]>();
  let totalNames=0,markedIds=0;
  for(const id of ids){
    const proposals=campaigns.getItemCandidates(id);
    check(Array.isArray(proposals)&&
      proposals.every(x=>
        x.itemId===id&&
        x.companion===native.getItem(id)&&
        x.evidence==='native_key_semantic_name_candidate_only'&&
        x.originalNativeItemIdVerified===true&&
        x.originalNativeNameKeyVerified===true&&
        x.officialCampaignRewardNameVerified===true&&
        x.officialCampaignNumericItemIdLinkVerified===false&&
        x.campaignGrantVerified===false&&
        x.currentAvailabilityVerified===false&&
        x.playerOwnershipVerified===false),
      'UNVERIFIED_CAMPAIGN_NAME_LINK');
    if(proposals.length){
      namedCandidates.set(id,proposals);
      markedIds++;
      totalNames+=proposals.length;
    }
  }
  check(totalNames===3&&markedIds===2,'NATIVE_NAME_CANDIDATE_CENSUS');

  function getItem(raw:string|number):Db00CompanionIdentityItem|null{
    const id=canonicalId(raw);
    const identity=native.getItem(id);
    if(!identity)return null;
    const shared=joined.getItem(id);
    const classification=byCategory.get(id);
    const sourceClassifications=classification?
      Object.freeze([classification]):EMPTY_CLASSIFICATIONS;
    const officialNameCandidates=namedCandidates.get(id)??EMPTY_NAMES;
    check(identity.itemId===id&&
      identity.originalSourceSha256===DB02_COMPANION_ORIGINAL_SHA&&
      identity.sourceLocalizationNameKey===
        'Companion.'+identity.nativeNameKey+'_DisplayName'&&
      identity.sourceDefinitionIdVerified===true&&
      identity.sourceNameKeyVerified===true&&
      identity.translatedDisplayNameVerified===false&&
      identity.specificCampaignLinkVerified===false&&
      identity.playerOwnershipVerified===false&&
      shared.itemId===id&&
      shared.currentlyAvailableVerified===false&&
      shared.playerOwnershipVerified===false&&
      categories.getItem(id).sourceClassified===(classification!==undefined),
      'ORIGINAL_COMPANION_AND_SHARED_ITEM_MISMATCH');
    return Object.freeze({
      itemId:id,shared,native:identity,sourceClassifications,
      explicitSourceCategory:classification?.category??null,
      unclassifiedSourceIsNotAbsenceProof:true as const,
      officialNameCandidates,
      originalIdentityVerified:true as const,
      originalNativeNameKeyVerified:true as const,
      localizedNativeNameVerified:false as const,
      numericCampaignRewardLinkVerified:false as const,
      campaignGrantVerified:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  }
  function search(request:Db00CompanionIdentitySearchRequest={}):
    Db00CompanionIdentityPage{
    check(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const category=request.category;
    check(category===undefined||category==='not_in_explicit_source_subset'||
      (typeof category==='string'&&CATEGORY.has(category)),
      'INVALID_SOURCE_CATEGORY');
    check(request.hasOfficialNameCandidateOnly===undefined||
      request.hasOfficialNameCandidateOnly===true,'INVALID_NAME_FILTER');
    check(request.publishedOnly===undefined||request.publishedOnly===true,
      'INVALID_PUBLISHED_FILTER');
    const locale=request.locale??'en';
    check(LOCALES.has(locale),'INVALID_LOCALE');
    const text=request.text??'';
    check(typeof text==='string'&&text.length<=120&&
      !/[\x00-\x1f]/.test(text),'INVALID_TEXT');
    const offset=request.offset??0,limit=request.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,'INVALID_PAGE');
    const needle=text.normalize('NFKC').toLocaleLowerCase().trim();
    const filtered=ids.filter(id=>{
      const classified=byCategory.get(id);
      if(category!==undefined&&
        (category==='not_in_explicit_source_subset'?
          classified!==undefined:classified?.category!==category))return false;
      if(request.hasOfficialNameCandidateOnly&&!namedCandidates.has(id))return false;
      const published=db.getItem(id);
      if(request.publishedOnly&&published===null)return false;
      const original=native.getItem(id)!;
      if(needle&&!(
        id.startsWith(needle)||
        original.nativeNameKey.normalize('NFKC')
          .toLocaleLowerCase().includes(needle)||
        !!published?.names[locale]?.normalize('NFKC')
          .toLocaleLowerCase().includes(needle)))return false;
      return true;
    });
    const items=Object.freeze(filtered.slice(offset,offset+limit).map(id=>
      getItem(id)!
    ));
    const next=offset+items.length;
    return Object.freeze({
      snapshotId:db.snapshotId,
      source:'native_companion_identity_and_pet_source_only' as const,
      total:filtered.length,offset,
      nextOffset:next<filtered.length?next:null,items,
      originalDefinitionIdsVerified:true as const,
      numericCampaignRewardLinksVerified:0 as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_NATIVE_COMPANION_IDENTITY_CONTRACT,
    snapshotId:db.snapshotId,
    originalCompanionDefinitions:394 as const,
    explicitNativeSourceCategoryRows:134 as const,
    remainingWithoutExplicitSourceCategory:260 as const,
    officialNameCandidateRelations:3 as const,
    nativeCandidateItemIds:2 as const,
    originalIdentityVerified:true as const,
    campaignNumericItemIdLinkVerified:false as const,
    playerAcquisitionVerified:false as const,
    playerOwnershipVerified:false as const,
    listNativeItemIds:()=>ids,
    getItem,
    getNativeNameKey:(key:string)=>{
      const id=native.getByNativeNameKey(key)?.itemId;
      return id?getItem(id):null;
    },
    getOfficialCampaignNameCandidates:(campaignId:string)=>{
      const proposals=campaigns.getCampaignCandidates(campaignId);
      return Object.freeze(proposals.map(row=>{
        const item=getItem(row.itemId);
        check(item!==null&&
          item.officialNameCandidates.includes(row),
          'CAMPAIGN_NAME_REVERSE_MISMATCH');
        return item;
      }));
    },
    search,
  });
}
