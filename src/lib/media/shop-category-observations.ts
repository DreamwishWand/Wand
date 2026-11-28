import {hasPinnedShopCatalogEvidence,type ShopCatalogSource} from '../acquisition/public-native-shop.ts';
import type {PremiumBundleDefinition,PremiumBundleRevision} from '../items/public-item-master.ts';
export type NativeShopPresentation='grid'|'one_line'|'unsupported';
// Steam 1.26.2 dump: Companion (16164), Dream (16175), Signature (16212)
// derive from LightOneLineBundleGroupsCategoryViewModel (16194), whereas
// Featured (16177), Seasonal (16211), Spotlight (16213), LimitedTimeDeals
// (16195), and Recommended derive from LightBundleGroupsCategoryViewModel.
// One-line uses LightOneLineBundle._prefab, not LightSingleBundle.LayoutSelector.
const oneLine=new Set(['Companion Bundles','Dream Bundles','Signature Bundles']);
const grid=new Set(['Seasonal Bundles','Featured','Spotlight Collection','Limited-Time Deals','Recommended']);
export function nativeShopPresentation(category:string):NativeShopPresentation{
  return oneLine.has(category)?'one_line':grid.has(category)?'grid':'unsupported';
}
export interface ShopCategoryObservation{
  readonly snapshotKey:string;readonly category:string;readonly presentation:NativeShopPresentation;
}
/** Exact historical appearance, not an offer's timeless category, live stock,
 * nor proof that a historical visual definition is unchanged. Match ordered
 * occurrences including quantities. Never infer category from bundle ID. */
export function createShopCategoryObservations(sources:readonly ShopCatalogSource[]){
  if(!sources.every(hasPinnedShopCatalogEvidence))throw new TypeError('SHOP_CATEGORY_SOURCE_REQUIRED');
  const byId=new Map<string,{snapshotKey:string;offer:ShopCatalogSource['offers'][number]}[]>();
  for(const source of sources)for(const offer of source.offers){
    const rows=byId.get(offer.nativeOfferId)??[];
    rows.push({snapshotKey:source.snapshotKey,offer});byId.set(offer.nativeOfferId,rows);
  }
  return (definition:PremiumBundleDefinition,revision:PremiumBundleRevision):readonly ShopCategoryObservation[]=>{
    const id=revision.onlineId??definition.bundleId;
    return (byId.get(id)??[]).filter(({offer})=>offer.components.length===revision.components.length&&
      offer.components.every((p,i)=>p.itemId===String(revision.components[i].itemId)&&p.quantity===revision.components[i].quantity))
      .map(({snapshotKey,offer})=>({snapshotKey,category:offer.sourceCategory,presentation:nativeShopPresentation(offer.sourceCategory)}));
  };
}
