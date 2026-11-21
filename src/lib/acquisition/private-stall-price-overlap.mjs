/**
 * DB-02 local/private ONLY: exact Steam v1.26.2 SRC-02 r5 stall candidates
 * intersected with original ProtoDB static item-price definitions.
 *
 * No shop-specific database selection, runtime stock, offer, discount or
 * player eligibility is inferred. An exact candidate Item ID relation only.
 */
import {loadPrivateSrc02BrowserBundle,CURRENT_STEAM_1262_CONDITION_SHA256}
  from './private-browser-bundle.mjs';
import {loadPrivateShopPriceView} from './private-shop-prices.mjs';
import {compareConfiguredPurchaseCurrencies} from './source-price-currency.mjs';

export const DB02_STALL_PRICE_OVERLAP_CONTRACT='wand.db02.private-stall-price-overlap@1';
const ACQ_SHA='ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c';
const SRC01_SHA='1ebf71a19792bb2293a710cec533b1471e4e4f2c0e695a9d413bbcfc305022f6';
const PRICE_SHA='641f1b5c5268f136de7bf345f372f06bde923ce0f1f24871225a97913091e975';
const EMPTY=Object.freeze([]);
const invalid=code=>{throw new TypeError('DB02_STALL_PRICE_OVERLAP_'+code);};
const expect=(test,code)=>{if(!test)invalid(code);};
const positive=x=>Number.isSafeInteger(x)&&x>0&&x<=2147483647;
const freeze=Object.freeze;

export async function loadPrivateStallPriceOverlap({
  acquisitionArchiveBytes,priceManifestBytes,priceFiles
}={}){
  // The independently pinned loaders authenticate all raw file bytes.
  // A caller cannot promote an arbitrary self-consistent manifest to r5.
  const source=await loadPrivateSrc02BrowserBundle(acquisitionArchiveBytes,{
    platform:'Steam',gameVersion:'1.26.2',manifestSha256:ACQ_SHA,
    src01ManifestSha256:SRC01_SHA,
    currentConditionSha256:CURRENT_STEAM_1262_CONDITION_SHA256
  });
  const pricing=await loadPrivateShopPriceView({
    manifestBytes:priceManifestBytes,files:priceFiles
  });
  expect(source.contract==='wand.src02.private-browser-bundle@1'&&
    source.verified===true&&source.privateSource===true&&source.publishable===false&&
    source.manifestSha256===ACQ_SHA&&
    pricing.contract==='wand.db02.private-shop-prices@1'&&
    pricing.verified===true&&pricing.privateSource===true&&pricing.publishable===false&&
    pricing.sourceManifestSha256===PRICE_SHA&&
    pricing.src02R5ManifestSha256===ACQ_SHA,
    'SOURCE_RELEASE_MISMATCH');

  const stallsById=new Map(),candidateIds=new Set();
  let pricedStalls=0,unpricedStalls=0,partiallyPricedStalls=0;
  let candidateCount=0,pricedCandidateCount=0,unpricedCandidateCount=0;
  let oneDatabaseStalls=0,twoDatabaseStalls=0,threeDatabaseStalls=0;
  let configuredMatchingPurchaseCostOccurrences=0,otherCurrencyPurchaseCostOccurrences=0;
  const relations=pricing.listSourceStallShopRelations();
  expect(relations.length===65,'STALL_LINK_CENSUS');

  for(const relation of relations){
    const stall=source.getStaticStall(relation.stallId);
    const originalShop=pricing.getSourceStallShopConfiguration(relation.stallId);
    expect(stall?.source?.gameVersion==='1.26.2'&&
      stall.source.platform==='Steam'&&
      stall.shopDataKey===relation.shopKey&&
      stall.slots.length===relation.nativeShopSlotCount&&
      originalShop?.stall===relation&&
      originalShop.shop?.shopKey===relation.shopKey&&
      originalShop.shop.slotCount===stall.slots.length&&
      relation.nativeSlotCountMatchesStallLoot===true&&
      relation.offerItemMappingVerified===false&&!stallsById.has(stall.stallId),
      'STALL_SHOP_CONFIG_MISMATCH');

    const shopCurrencies=freeze(originalShop.shop.slots.map(row=>row.currencyId));
    const candidateMap=new Map();
    const slots=freeze(stall.slots.map((slot,index)=>{
      expect(slot.slotIndex===index&&Array.isArray(slot.candidates),
        'INVALID_STATIC_SLOT');
      const candidates=freeze(slot.candidates.map(candidate=>{
        const itemId=candidate.itemId;
        expect(positive(itemId),'INVALID_CANDIDATE_ID');
        candidateIds.add(itemId);
        if(!candidateMap.has(itemId)){
          const definitions=pricing.getSourceItemPriceDefinitions(itemId);
          // This release contains one database row per Item ID at most.
          expect(definitions.length<=1,'MULTIPLE_PRICE_DATABASE_CONTEXTS');
          const currencies=compareConfiguredPurchaseCurrencies(definitions,shopCurrencies);
          expect(definitions.length===0||currencies.matchCount===1,
            'SOURCE_CURRENCY_MATCH_NOT_UNIQUE');
          candidateMap.set(itemId,freeze({itemId,
            shopConfiguredCurrencyIds:currencies.shopConfiguredCurrencyIds,
            sourceConfiguredMatchingPurchaseCosts:currencies.sourceConfiguredMatchingPurchaseCosts,
            sourceConfiguredOtherCurrencyPurchaseCosts:currencies.sourceConfiguredOtherCurrencyPurchaseCosts,
            sourcePriceNeverEffectiveShopPrice:true,
            priceDatabaseKeys:freeze(definitions.map(row=>row.databaseKey)),
            sourcePriceDefinitionPresent:definitions.length>0,
            status:definitions.length>0?'source_configured_price_candidate':
              'not_listed_in_observed_static_price_databases',
            currentShopOfferVerified:false,effectivePriceVerified:false}));
        }
        return freeze({...candidateMap.get(itemId),
          candidateGroupIndexes:candidate.candidateGroupIndexes,
          hasConditionalFilter:candidate.hasCondition});
      }));
      return freeze({slotIndex:slot.slotIndex,lootTableId:slot.lootTableId,
        candidates,enumeratedCandidatesExhaustive:false,
        sourceSlotIndexMappingVerified:false,
        currentOfferVerified:false});
    }));
    const candidates=freeze([...candidateMap.values()].sort((a,b)=>a.itemId-b.itemId));
    const priced=candidates.filter(x=>x.sourcePriceDefinitionPresent).length;
    const missing=candidates.length-priced;
    expect(candidates.length===stall.candidateItemIds.length,
      'STALL_CANDIDATE_SET_MISMATCH');
    const databases=freeze([...new Set(candidates.flatMap(c=>c.priceDatabaseKeys))].sort());
    if(databases.length===1)oneDatabaseStalls++;
    else if(databases.length===2)twoDatabaseStalls++;
    else if(databases.length===3)threeDatabaseStalls++;
    else expect(databases.length===0,'UNEXPECTED_DATABASE_COUNT');
    configuredMatchingPurchaseCostOccurrences+=candidates.reduce((n,c)=>
      n+c.sourceConfiguredMatchingPurchaseCosts.length,0);
    otherCurrencyPurchaseCostOccurrences+=candidates.reduce((n,c)=>
      n+c.sourceConfiguredOtherCurrencyPurchaseCosts.length,0);
    const classification=priced===0?'no_enumerated_price_overlap':
      missing===0?'all_enumerated_candidates_have_price_definitions':
        'partial_enumerated_price_overlap';
    if(priced===0)unpricedStalls++;
    else if(missing===0)pricedStalls++;
    else partiallyPricedStalls++;
    candidateCount+=candidates.length;
    pricedCandidateCount+=priced;
    unpricedCandidateCount+=missing;
    stallsById.set(relation.stallId,freeze({
      stallId:relation.stallId,shopKey:relation.shopKey,
      slotCount:stall.slots.length,shopConfiguredCurrencyIds:freeze([...new Set(shopCurrencies)].sort((a,b)=>a-b)),
      candidatePriceDatabaseKeys:databases,
      candidates,slots,
      enumeratedCandidateCount:candidates.length,
      candidatesWithStaticPrices:priced,
      candidatesWithoutStaticPrices:missing,
      coverage:classification,
      // A DB name is attached to an Item ID, not proven to be selected
      // by the runtime for this Shop/slot/transaction.
      shopToPriceDatabaseSelectionVerified:false,
      sourceSlotIndexMappingVerified:false,
      currentOffersVerified:false,stockVerified:false,
      effectivePricesVerified:false,publishable:false
    }));
  }
  const counts=freeze({
    stalls:relations.length,pricedStalls,unpricedStalls,partiallyPricedStalls,
    enumeratedCandidateOccurrences:candidateCount,
    candidateOccurrencesWithStaticPrices:pricedCandidateCount,
    candidateOccurrencesWithoutStaticPrices:unpricedCandidateCount,
    distinctEnumeratedCandidateItems:candidateIds.size,
    oneDatabaseStalls,twoDatabaseStalls,threeDatabaseStalls,
    configuredMatchingPurchaseCostOccurrences,otherCurrencyPurchaseCostOccurrences
  });
  expect(pricedStalls===50&&unpricedStalls===15&&partiallyPricedStalls===0&&
    candidateCount===745&&pricedCandidateCount===683&&
    unpricedCandidateCount===62&&candidateIds.size===606&&
    oneDatabaseStalls===29&&twoDatabaseStalls===18&&threeDatabaseStalls===3&&
    configuredMatchingPurchaseCostOccurrences===683&&otherCurrencyPurchaseCostOccurrences===162,
    'SOURCE_OVERLAP_CENSUS');

  const validItem=id=>{expect(positive(id),'INVALID_ITEM_ID');return id;};
  const entries=freeze([...stallsById.values()].sort((a,b)=>a.stallId-b.stallId));
  return freeze({
    contract:DB02_STALL_PRICE_OVERLAP_CONTRACT,
    gameVersion:'1.26.2',platform:'Steam',
    acquisitionSourceManifestSha256:ACQ_SHA,priceSourceManifestSha256:PRICE_SHA,
    verifiedPrivateSources:true,publishable:false,saveWriterAuthorized:false,
    currentOffersVerified:false,shopDatabaseSelectionVerified:false,
    effectivePricesVerified:false,stockVerified:false,
    counts,
    listStallPriceCoverage:()=>entries,
    getStallPriceCoverage:id=>stallsById.get(validItem(id))??null,
    getPossibleStaticPriceReferencesForItem:id=>{
      const itemId=validItem(id);
      const definitions=pricing.getSourceItemPriceDefinitions(itemId);
      const possibleStalls=source.getPossibleStallsForItem(itemId);
      return freeze({itemId,definitions,possibleStalls,
        sourcePriceDefinitionPresent:definitions.length>0,
        currentOfferVerified:false,shopDatabaseSelectionVerified:false,
        effectivePriceVerified:false,playerEligibilityVerified:false,
        publishable:false});
    }
  });
}
