/**
 * Crosswalk of reported historical Premium Shop bundle contents to current
 * exact game-localization names. This is a QUERY HINT, never a verified sale.
 */
import {historicalPremiumShop,type ShopAppearance} from './premium-shop-history.ts';
import {
  exactCurrentDb01NameIds,type VerifiedDb01EnglishNames
} from './origin-name-candidates.ts';

export const PREMIUM_SHOP_CANDIDATE_SCHEMA='wand.db02.premium-shop-candidates@1' as const;
export interface PremiumShopItemCandidate{
  readonly itemId:string;
  readonly shopProductName:string;
  readonly componentName:string;
  readonly componentQuantity:number|null;
  readonly appearanceId:string;
  readonly window:{readonly start:string;readonly endExclusive:string};
  readonly reportedMoonstonePrice:number;
  readonly evidence:'community_weekly_shop_plus_exact_native_name';
  readonly acquisitionLinkVerified:false;
  readonly stockVerified:false;
  readonly nativeOfferId:null;
  readonly sourceUrl:string;
}
export interface PremiumShopCandidateIndex{
  readonly schema:typeof PREMIUM_SHOP_CANDIDATE_SCHEMA;
  readonly coverage:Readonly<{
    searchedDistinctComponentNames:number;
    uniqueExactNativeNames:number;
    ambiguousExactNativeNames:number;
    unmatchedNames:number;
    candidateRelations:number;
    nativePurchaseLinksVerified:0;
    completeHistoricalSource:false;
  }>;
  getItemCandidates(itemId:string|number):readonly PremiumShopItemCandidate[];
  getProductCandidates(productName:string):readonly PremiumShopItemCandidate[];
}
const ID=/^[1-9][0-9]{0,15}$/;
function id(value:string|number):string{
  const key=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  if(typeof key!=='string'||!ID.test(key)||!Number.isSafeInteger(Number(key)))
    throw new TypeError('DB02_SHOP_CANDIDATE_INVALID_ID');
  return key;
}
/**
 * Call only with a SHA-attested private DB-01 catalog client. All result rows
 * remain static, immutable and explicitly unverified as acquisition links.
 */
export async function matchPremiumShopHistoryToDb01(
  db01:VerifiedDb01EnglishNames
):Promise<PremiumShopCandidateIndex>{
  const originals=historicalPremiumShop.offers;
  const distinct=new Set(originals.flatMap(a=>a.contents.map(c=>c.name)));
  const nameIds=new Map<string,readonly string[]>();
  let uniqueNames=0,ambiguousNames=0,unmatched=0;
  for(const name of distinct){
    const ids=await exactCurrentDb01NameIds(db01,name);
    nameIds.set(name,ids);
    if(ids.length===1)uniqueNames++;
    else if(ids.length>1)ambiguousNames++;
    else unmatched++;
  }
  const byItem=new Map<string,PremiumShopItemCandidate[]>();
  const byProduct=new Map<string,PremiumShopItemCandidate[]>();
  let relations=0;
  for(const appearance of originals){
    for(const component of appearance.contents){
      const matched=nameIds.get(component.name)??[];
      if(matched.length!==1)continue;
      const id=matched[0];
      const row:PremiumShopItemCandidate=Object.freeze({
        itemId:id,shopProductName:appearance.productName,componentName:component.name,
        componentQuantity:component.quantity,appearanceId:appearance.appearanceId,
        window:Object.freeze({start:appearance.saleStart,endExclusive:appearance.saleEndExclusive}),
        reportedMoonstonePrice:appearance.moonstonePrice,
        evidence:'community_weekly_shop_plus_exact_native_name',
        acquisitionLinkVerified:false,stockVerified:false,nativeOfferId:null,
        sourceUrl:appearance.source.url
      });
      relations++;
      (byItem.get(id)??(byItem.set(id,[]),byItem.get(id)!)).push(row);
      (byProduct.get(appearance.productKey)??(byProduct.set(appearance.productKey,[]),
        byProduct.get(appearance.productKey)!)).push(row);
    }
  }
  for(const group of [...byItem.values(),...byProduct.values()])Object.freeze(group);
  const coverage=Object.freeze({
    searchedDistinctComponentNames:distinct.size,uniqueExactNativeNames:uniqueNames,
    ambiguousExactNativeNames:ambiguousNames,unmatchedNames:unmatched,
    candidateRelations:relations,nativePurchaseLinksVerified:0 as const,
    completeHistoricalSource:false as const
  });
  const empty=Object.freeze([]) as readonly PremiumShopItemCandidate[];
  return Object.freeze({
    schema:PREMIUM_SHOP_CANDIDATE_SCHEMA,coverage,
    getItemCandidates(raw:string|number){return byItem.get(id(raw))??empty;},
    getProductCandidates(name:string){
      const source=historicalPremiumShop.getProduct(name);
      return source.length?byProduct.get(source[0].productKey)??empty:empty;
    }
  });
}
