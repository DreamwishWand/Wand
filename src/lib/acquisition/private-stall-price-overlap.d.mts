/**
 * Source-only private static price coverage for exact Steam v1.26.2.
 * No current offers, runtime price selection, stock or eligibility verification.
 */
import type {StaticItemPriceDefinition} from './private-shop-prices.mjs';
import type {SourceConfiguredCurrencyCost} from './source-price-currency.mjs';

export declare const DB02_STALL_PRICE_OVERLAP_CONTRACT:
  'wand.db02.private-stall-price-overlap@1';

export interface SourcePriceCandidate {
  readonly itemId:number;
  readonly priceDatabaseKeys:readonly string[];
  readonly sourcePriceDefinitionPresent:boolean;
  readonly shopConfiguredCurrencyIds:readonly number[];
  readonly sourceConfiguredMatchingPurchaseCosts:readonly SourceConfiguredCurrencyCost[];
  readonly sourceConfiguredOtherCurrencyPurchaseCosts:readonly SourceConfiguredCurrencyCost[];
  readonly sourcePriceNeverEffectiveShopPrice:true;
  readonly status:
    'source_configured_price_candidate' |
    'not_listed_in_observed_static_price_databases';
  readonly currentShopOfferVerified:false;
  readonly effectivePriceVerified:false;
}
export interface SlotPriceCandidate extends SourcePriceCandidate {
  readonly candidateGroupIndexes:readonly number[];
  readonly hasConditionalFilter:boolean;
}
export interface SourceSlotPriceCoverage {
  readonly slotIndex:number;
  readonly lootTableId:number;
  readonly candidates:readonly SlotPriceCandidate[];
  readonly enumeratedCandidatesExhaustive:false;
  readonly sourceSlotIndexMappingVerified:false;
  readonly currentOfferVerified:false;
}
export interface SourceStallPriceCoverage {
  readonly stallId:number;
  readonly shopKey:string;
  readonly slotCount:number;
  readonly shopConfiguredCurrencyIds:readonly number[];
  readonly candidatePriceDatabaseKeys:readonly string[];
  readonly candidates:readonly SourcePriceCandidate[];
  readonly slots:readonly SourceSlotPriceCoverage[];
  readonly enumeratedCandidateCount:number;
  readonly candidatesWithStaticPrices:number;
  readonly candidatesWithoutStaticPrices:number;
  readonly coverage:
    'all_enumerated_candidates_have_price_definitions'|
    'no_enumerated_price_overlap'|
    'partial_enumerated_price_overlap';
  readonly shopToPriceDatabaseSelectionVerified:false;
  readonly sourceSlotIndexMappingVerified:false;
  readonly currentOffersVerified:false;
  readonly stockVerified:false;
  readonly effectivePricesVerified:false;
  readonly publishable:false;
}
export interface SourcePriceOverlapCounts {
  readonly stalls:65;
  readonly pricedStalls:50;
  readonly unpricedStalls:15;
  readonly partiallyPricedStalls:0;
  readonly enumeratedCandidateOccurrences:745;
  readonly candidateOccurrencesWithStaticPrices:683;
  readonly candidateOccurrencesWithoutStaticPrices:62;
  readonly distinctEnumeratedCandidateItems:606;
  readonly oneDatabaseStalls:29;
  readonly twoDatabaseStalls:18;
  readonly threeDatabaseStalls:3;
  readonly configuredMatchingPurchaseCostOccurrences:683;
  readonly otherCurrencyPurchaseCostOccurrences:162;
}
export interface SourcePriceOverlapView {
  readonly contract:typeof DB02_STALL_PRICE_OVERLAP_CONTRACT;
  readonly gameVersion:'1.26.2';
  readonly platform:'Steam';
  readonly acquisitionSourceManifestSha256:string;
  readonly priceSourceManifestSha256:string;
  readonly verifiedPrivateSources:true;
  readonly publishable:false;
  readonly saveWriterAuthorized:false;
  readonly currentOffersVerified:false;
  readonly shopDatabaseSelectionVerified:false;
  readonly effectivePricesVerified:false;
  readonly stockVerified:false;
  readonly counts:SourcePriceOverlapCounts;
  listStallPriceCoverage():readonly SourceStallPriceCoverage[];
  getStallPriceCoverage(stallId:number):SourceStallPriceCoverage|null;
  getPossibleStaticPriceReferencesForItem(itemId:number):Readonly<{
    itemId:number;
    definitions:readonly StaticItemPriceDefinition[];
    possibleStalls:readonly Readonly<{
      stallId:number;
      nameKey:string;
      shopDataKey:string;
      slots:readonly {slotIndex:number;lootTableId:number;candidateGroupIndexes:readonly number[]}[];
      hasConditionalFilter:boolean;
      status:'static_candidate_not_verified_for_sale';
    }>[];
    sourcePriceDefinitionPresent:boolean;
    currentOfferVerified:false;
    shopDatabaseSelectionVerified:false;
    effectivePriceVerified:false;
    playerEligibilityVerified:false;
    publishable:false;
  }>;
}
/**
 * Authenticate the exact SRC-02 r5 private ZIP and the exact independently
 * pinned static ProtoDB price release bytes. No source records are bundled
 * with the JS package and no network access is performed.
 */
export declare function loadPrivateStallPriceOverlap(input:{
  acquisitionArchiveBytes:Uint8Array;
  priceManifestBytes:Uint8Array|ArrayBuffer;
  priceFiles:Readonly<Record<string,Uint8Array|ArrayBuffer>>;
}):Promise<SourcePriceOverlapView>;
