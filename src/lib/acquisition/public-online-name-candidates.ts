/**
 * DB-02 public, read-only exact-name search for online acquisition candidates.
 *
 * Uses the ALREADY LOADED Steam v1.26.2 DB-00 ItemList snapshot, original
 * official campaign publications and the separately labelled community shop
 * observations. No owner-private DB-01 archive or network request is needed.
 *
 * Exact English-name equality is NOT evidence of a redemption, product/offer
 * identifier, purchase, guaranteed grant, account ownership or live stock.
 * Ambiguous/missing names are never assigned Item IDs.
 *
 * The caller must pass the SHA-verified DB-00 loader result; metadata alone
 * cannot cryptographically authenticate an arbitrary in-memory snapshot.
 */
import {loadCurrentGameDatabase} from '../game-db/client.ts';
import {OFFICIAL_CAMPAIGNS} from './official-campaigns.ts';
import {historicalPremiumShop} from './premium-shop-history.ts';
import type {Db00PublishedSnapshot} from './db00-origins.ts';
import type {OfficialCampaign,OriginWindow} from './origins.ts';
import type {ShopAppearance} from './premium-shop-history.ts';

export const DB02_PUBLIC_NAME_CANDIDATE_SCHEMA =
  'wand.db02.published-online-name-candidates@1' as const;
const RELEASE='steam-1.26.2-native-itemlist-v1';
const SOURCE_SHA='496782625e68fb53e018659bbabf0d8bb8bdc55f12037f4c568a7d32321f515b';
const ID=/^[1-9][0-9]{0,15}$/;
const EMPTY=Object.freeze([]) as readonly PublicOnlineNameCandidate[];
const NONDISPLAY=/^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}/i;

interface CandidateCommon {
  readonly itemId:string;
  readonly sourceName:string;
  readonly evidence:'exact_published_db00_en_name_only';
  readonly gameVersion:'1.26.2';
  readonly acquisitionLinkVerified:false;
  readonly actualRewardGrantedVerified:false;
  readonly nativeOfferIdVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly accountOwnershipVerified:false;
}
export interface PublicCampaignNameCandidate extends CandidateCommon {
  readonly kind:'official_campaign_name_candidate';
  readonly campaignId:string;
  readonly campaignKind:OfficialCampaign['kind'];
  readonly rewardName:string;
  readonly campaignWindow:OriginWindow;
  readonly officialSourceUrl:string;
}
export interface PublicShopNameCandidate extends CandidateCommon {
  readonly kind:'community_premium_shop_name_candidate';
  readonly appearanceId:string;
  readonly productName:string;
  readonly componentName:string;
  readonly componentQuantity:number|null;
  readonly weekStart:string;
  readonly weekEndExclusive:string;
  readonly reportedMoonstonePrice:number;
  readonly sourceUrl:string;
  readonly priceAndContentsEvidence:'community_archive_only';
}
export type PublicOnlineNameCandidate=
  PublicCampaignNameCandidate|PublicShopNameCandidate;

export interface PublicOnlineNameCandidateCoverage {
  readonly publishedItemDefinitions:13202;
  readonly distinctNamedEnglishLabels:number;
  readonly ambiguousEnglishLabels:number;
  readonly examinedOfficialRewardNames:number;
  readonly uniquelyMatchedOfficialRewards:number;
  readonly ambiguousOfficialRewards:number;
  readonly unmatchedOfficialRewards:number;
  readonly examinedCommunityShopComponentRows:number;
  readonly uniquelyMatchedCommunityShopComponents:number;
  readonly ambiguousCommunityShopComponents:number;
  readonly unmatchedCommunityShopComponents:number;
  readonly distinctCandidateItemIds:number;
  readonly totalCandidateRelations:number;
  readonly verifiedOnlineAcquisitionLinks:0;
  readonly verifiedNativeShopOfferIds:0;
  readonly completeOnlineHistory:false;
}
export interface PublicOnlineNameCandidateIndex {
  readonly schema:typeof DB02_PUBLIC_NAME_CANDIDATE_SCHEMA;
  readonly evidence:'name_only_no_grant_or_sale_proof';
  readonly coverage:PublicOnlineNameCandidateCoverage;
  getItemCandidates(itemId:number|string):readonly PublicOnlineNameCandidate[];
  getCampaignCandidates(campaignId:string):readonly PublicCampaignNameCandidate[];
  getShopAppearanceCandidates(appearanceId:string):readonly PublicShopNameCandidate[];
  getShopProductCandidates(productName:string):readonly PublicShopNameCandidate[];
}
function requireValue(value:unknown,code:string):asserts value {
  if(!value)throw new TypeError('DB02_PUBLIC_NAME_'+code);
}
function itemId(raw:unknown):string {
  const value=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  requireValue(typeof value==='string'&&ID.test(value)&&
    Number.isSafeInteger(Number(value)),'INVALID_ITEM_ID');
  return value;
}
function validName(raw:unknown):raw is string {
  return typeof raw==='string'&&raw.length>0&&raw.length<=250&&
    raw.trim()===raw&&!NONDISPLAY.test(raw)&&
    !/[\x00-\x1f]/.test(raw);
}
function add<K,V>(map:Map<K,V[]>,key:K,row:V):void{
  const previous=map.get(key);
  if(previous)previous.push(row);
  else map.set(key,[row]);
}
function freezeRows<K,V>(map:Map<K,V[]>):void {
  for(const rows of map.values())Object.freeze(rows);
}
function sourceNameMap(snapshot:Db00PublishedSnapshot):Map<string,string[]> {
  requireValue(snapshot?.kind==='db_snapshot'&&snapshot.id===RELEASE&&
    snapshot.target?.platform==='Steam'&&
    snapshot.target.gameVersion==='1.26.2'&&
    snapshot.target.sourceSha256===SOURCE_SHA&&
    snapshot.coverage?.scope==='steam-v1.26.2-native-itemlist'&&
    snapshot.coverage.complete===true&&Array.isArray(snapshot.items)&&
    snapshot.items.length===13202,'EXACT_CURRENT_PUBLIC_DB00_REQUIRED');
  const uniqueIds=new Set<string>();
  const names=new Map<string,string[]>();
  for(const item of snapshot.items){
    const id=itemId(item?.id);
    requireValue(!uniqueIds.has(id),'DUPLICATE_DB00_ID');
    uniqueIds.add(id);
    const name=item?.names?.en;
    if(validName(name))add(names,name,id);
  }
  return names;
}
/**
 * Intentionally keeps official and third-party data independent. Even a
 * unique match from DB-00 is a discovery candidate, NEVER an ItemOrigin
 * confirmed_source_link. Consumers must render the provenance distinction.
 */
export function indexPublicOnlineNameCandidates(
  snapshot:Db00PublishedSnapshot,
  campaigns:readonly OfficialCampaign[],
  appearances:readonly ShopAppearance[]
):PublicOnlineNameCandidateIndex {
  const names=sourceNameMap(snapshot);
  requireValue(Array.isArray(campaigns)&&Array.isArray(appearances),
    'ORIGIN_LEDGER_REQUIRED');
  const byItem=new Map<string,PublicOnlineNameCandidate[]>();
  const byCampaign=new Map<string,PublicCampaignNameCandidate[]>();
  const byAppearance=new Map<string,PublicShopNameCandidate[]>();
  const byProduct=new Map<string,PublicShopNameCandidate[]>();
  let official=0,officialMatched=0,officialAmbiguous=0,officialMissing=0;
  let shop=0,shopMatched=0,shopAmbiguous=0,shopMissing=0;
  for(const campaign of campaigns) {
    requireValue(campaign&&typeof campaign.campaignId==='string'&&
      Array.isArray(campaign.rewards),'INVALID_CAMPAIGN');
    if(campaign.source?.kind!=='official_publication')continue;
    for(const reward of campaign.rewards){
      if(reward.itemId!==null)continue;
      requireValue(typeof reward.name==='string','INVALID_REWARD_NAME');
      official++;
      const ids=names.get(reward.name)??[];
      if(ids.length>1){officialAmbiguous++;continue;}
      if(ids.length===0){officialMissing++;continue;}
      officialMatched++;
      const candidate:PublicCampaignNameCandidate=Object.freeze({
        kind:'official_campaign_name_candidate',
        itemId:ids[0],sourceName:reward.name,
        evidence:'exact_published_db00_en_name_only',
        gameVersion:'1.26.2',campaignId:campaign.campaignId,
        campaignKind:campaign.kind,rewardName:reward.name,
        campaignWindow:campaign.window,
        officialSourceUrl:campaign.source.sourceUrl,
        acquisitionLinkVerified:false,actualRewardGrantedVerified:false,
        nativeOfferIdVerified:false,currentAvailabilityVerified:false,
        accountOwnershipVerified:false
      });
      add(byItem,candidate.itemId,candidate);
      add(byCampaign,campaign.campaignId,candidate);
    }
  }
  for(const appearance of appearances){
    requireValue(appearance&&typeof appearance.appearanceId==='string'&&
      Array.isArray(appearance.contents)&&
      appearance.source?.kind==='community_wiki'&&
      appearance.priceEvidence==='community_archive_only'&&
      appearance.contentsEvidence==='community_archive_only'&&
      appearance.nativeOfferId===null&&appearance.gameItemId===null&&
      appearance.liveStockVerified===false,'INVALID_SHOP_APPEARANCE');
    for(const component of appearance.contents){
      requireValue(component?.verifiedItemId===null&&
        typeof component.name==='string','INVALID_SHOP_COMPONENT');
      shop++;
      const ids=names.get(component.name)??[];
      if(ids.length>1){shopAmbiguous++;continue;}
      if(ids.length===0){shopMissing++;continue;}
      shopMatched++;
      const candidate:PublicShopNameCandidate=Object.freeze({
        kind:'community_premium_shop_name_candidate',
        itemId:ids[0],sourceName:component.name,
        evidence:'exact_published_db00_en_name_only',gameVersion:'1.26.2',
        appearanceId:appearance.appearanceId,productName:appearance.productName,
        componentName:component.name,componentQuantity:component.quantity,
        weekStart:appearance.saleStart,weekEndExclusive:appearance.saleEndExclusive,
        reportedMoonstonePrice:appearance.moonstonePrice,
        sourceUrl:appearance.source.url,
        priceAndContentsEvidence:'community_archive_only',
        acquisitionLinkVerified:false,actualRewardGrantedVerified:false,
        nativeOfferIdVerified:false,currentAvailabilityVerified:false,
        accountOwnershipVerified:false
      });
      add(byItem,candidate.itemId,candidate);
      add(byAppearance,appearance.appearanceId,candidate);
      add(byProduct,appearance.productName,candidate);
    }
  }
  freezeRows(byItem);freezeRows(byCampaign);freezeRows(byAppearance);freezeRows(byProduct);
  const coverage:PublicOnlineNameCandidateCoverage=Object.freeze({
    publishedItemDefinitions:13202,
    distinctNamedEnglishLabels:names.size,
    ambiguousEnglishLabels:[...names.values()].filter(ids=>ids.length>1).length,
    examinedOfficialRewardNames:official,
    uniquelyMatchedOfficialRewards:officialMatched,
    ambiguousOfficialRewards:officialAmbiguous,
    unmatchedOfficialRewards:officialMissing,
    examinedCommunityShopComponentRows:shop,
    uniquelyMatchedCommunityShopComponents:shopMatched,
    ambiguousCommunityShopComponents:shopAmbiguous,
    unmatchedCommunityShopComponents:shopMissing,
    distinctCandidateItemIds:byItem.size,
    totalCandidateRelations:officialMatched+shopMatched,
    verifiedOnlineAcquisitionLinks:0,
    verifiedNativeShopOfferIds:0,
    completeOnlineHistory:false
  });
  return Object.freeze({
    schema:DB02_PUBLIC_NAME_CANDIDATE_SCHEMA,
    evidence:'name_only_no_grant_or_sale_proof' as const,coverage,
    getItemCandidates(raw:string|number){
      return byItem.get(itemId(raw))??EMPTY;
    },
    getCampaignCandidates(campaignId:string){
      requireValue(typeof campaignId==='string'&&campaignId.length>0&&
        campaignId.length<=128,'INVALID_CAMPAIGN_ID');
      return byCampaign.get(campaignId)??EMPTY as readonly PublicCampaignNameCandidate[];
    },
    getShopAppearanceCandidates(appearanceId:string){
      requireValue(typeof appearanceId==='string'&&appearanceId.length>0&&
        appearanceId.length<=200,'INVALID_APPEARANCE_ID');
      return byAppearance.get(appearanceId)??EMPTY as readonly PublicShopNameCandidate[];
    },
    getShopProductCandidates(productName:string){
      requireValue(typeof productName==='string'&&productName.length>0&&
        productName.length<=200,'INVALID_PRODUCT_NAME');
      return byProduct.get(productName)??EMPTY as readonly PublicShopNameCandidate[];
    }
  });
}

/**
 * Browser-facing public entrypoint. The existing DB-00 loader verifies the
 * active pointer, release index and ALL item shard byte hashes before any
 * name is treated as current-version evidence. No private archive required.
 */
export async function loadPublishedOnlineNameCandidates(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PublicOnlineNameCandidateIndex>{
  const loaded=await loadCurrentGameDatabase(basePath,fetcher);
  requireValue(loaded.kind==='db_snapshot','CURRENT_DB00_RELEASE_REQUIRED');
  return indexPublicOnlineNameCandidates(
    loaded as Db00PublishedSnapshot,OFFICIAL_CAMPAIGNS,historicalPremiumShop.offers
  );
}
