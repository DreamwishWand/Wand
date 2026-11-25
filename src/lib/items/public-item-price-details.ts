/** Shared display-facing price projection. Read only requested Item IDs and
 * referenced currencies from the already pinned current master.
 * These are configured source amounts, not live shop quotes or sale eligibility.
 */
import type {PublicCompleteItemMaster,ItemMasterLocale,OriginalItemPriceFacts,
  ConfiguredItemPriceOverride} from './public-item-master.ts';

export interface ItemPriceCurrency {
  readonly itemId:number;
  readonly name:string|null;
  readonly iconGuid:string|null;
  readonly locale:ItemMasterLocale;
}
export interface ItemConfiguredPrice {
  readonly currency:Readonly<ItemPriceCurrency>|null;
  readonly currencyItemId:number;
  readonly amount:number|null;
  readonly source:'static'|'dynamic_cache'|'explicit_override';
  readonly amountFieldPresent:boolean;
  readonly liveTransactionVerified:false;
}
export interface ItemPriceDetails {
  readonly itemId:number;
  readonly gameVersion:string;
  readonly originalPriceStatus:OriginalItemPriceFacts['status'];
  readonly purchase:readonly Readonly<ItemConfiguredPrice>[];
  readonly sell:readonly Readonly<ItemConfiguredPrice>[];
  /** Retain currency-only, incomplete and non-audited overrides separately. */
  readonly configuredOverride:Readonly<ConfiguredItemPriceOverride>;
  readonly runtimePriceVerified:false;
  readonly runtimeSaleEligibilityVerified:false;
}
function check(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB01_PRICE_DETAILS_'+code);
}
export async function readItemPriceDetails(db:PublicCompleteItemMaster,ids:readonly number[],locale:ItemMasterLocale):
  Promise<readonly (Readonly<ItemPriceDetails>|null)[]>{
  check(['en','fr','de','es','it','ja','ko','zh-Hans'].includes(locale),'LOCALE');
  const [prices,overrides]=await Promise.all([db.getOriginalItemPrices(ids),db.getConfiguredPriceOverrides(ids)]);
  const currencies=new Set<number>();
  for(let i=0;i<prices.length;i++){
    const p=prices[i],o=overrides[i];
    check((p===null)===(o===null)&&(!p||p.itemId===o?.itemId),'ITEM_JOIN');
    if(!p||!o)continue;
    for(const cost of [...p.purchaseCosts,...p.sellCosts])currencies.add(cost.currencyItemId);
    if(o.nativePurchaseOverride)currencies.add(o.nativePurchaseOverride.currencyItemId);
    if(o.overrideCurrencyItemId!==null)currencies.add(o.overrideCurrencyItemId);
    if(o.priceCurrencyItemId!==null)currencies.add(o.priceCurrencyItemId);
  }
  const currencyIds=[...currencies].sort((a,b)=>a-b);
  const field='names.'+locale;
  const rows=currencyIds.length?await db.getItemFields(currencyIds,['nativeCategory',field,'iconGuid']):[];
  const byId=new Map<number,Readonly<ItemPriceCurrency>>();
  for(const row of rows){
    if(!row||row.values.nativeCategory!=='Currency')continue;
    const name=row.values[field],icon=row.values.iconGuid;
    byId.set(row.itemId,Object.freeze({itemId:row.itemId,locale,
      name:typeof name==='string'&&name.length>0?name:null,
      iconGuid:typeof icon==='string'&&/^[0-9a-f]{32}$/.test(icon)?icon:null}));
  }
  return Object.freeze(prices.map((p,i)=>{
    if(!p)return null;
    const o=overrides[i];check(o&&o.itemId===p.itemId,'ITEM_JOIN');
    const make=(currencyItemId:number,amount:number|null,amountFieldPresent:boolean,source:ItemConfiguredPrice['source'])=>
      Object.freeze({currencyItemId,currency:byId.get(currencyItemId)??null,amount,amountFieldPresent,source,
        liveTransactionVerified:false as const});
    const buy=new Map<number,Readonly<ItemConfiguredPrice>>();
    const sell:Readonly<ItemConfiguredPrice>[]=[];
    if(p.providerKind){
      for(const c of p.purchaseCosts)buy.set(c.currencyItemId,make(c.currencyItemId,c.amount,c.amountFieldPresent,p.providerKind));
      for(const c of p.sellCosts)sell.push(make(c.currencyItemId,c.amount,c.amountFieldPresent,p.providerKind));
    }
    // The audited explicit override precedes formula/provider lookup only
    // for its own matching currency. Never rewrite sell or other currencies.
    const n=o.nativePurchaseOverride;
    if(n)buy.set(n.currencyItemId,make(n.currencyItemId,n.amount,true,'explicit_override'));
    return Object.freeze({itemId:p.itemId,gameVersion:db.release.target.gameVersion,
      originalPriceStatus:p.status,purchase:Object.freeze([...buy.values()].sort((a,b)=>a.currencyItemId-b.currencyItemId)),
      sell:Object.freeze(sell.sort((a,b)=>a.currencyItemId-b.currencyItemId)),configuredOverride:o,
      runtimePriceVerified:false as const,runtimeSaleEligibilityVerified:false as const});
  }));
}
