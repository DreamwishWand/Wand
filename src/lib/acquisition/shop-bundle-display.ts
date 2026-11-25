/** Shop product discovery view over existing authenticated acquisition and Item DB.
 * Native title precedence, Steam 1.26.2 BundleViewModel constructor:
 * OnlineBundleData.Title, otherwise first Contents.ItemId -> IItemData.DisplayName.
 * Do not infer a localized dedicated title from the Item name or offer ID.
 * No new database, code availability claim, or unverified artwork activation.
 */
import {hasPinnedShopCatalogEvidence,type ShopCatalogSource} from './public-native-shop.ts';
import type {ItemMasterLocale,PublicCompleteItemMaster} from '../items/public-item-master.ts';
import {getVerifiedShopTitle} from './shop-localized-titles.ts';
import type {PublicItemMediaReader} from '../items/public-item-media.ts';

const SHOP_CATEGORIES=new Set(['Seasonal Bundles','Featured','Spotlight Collection','Limited-Time Deals','Recommended']);
export const isShopDiscoveryCategory=(category:string)=>SHOP_CATEGORIES.has(category);
export type ShopDisplayName=Readonly<{text:string|null;locale:ItemMasterLocale|null;source:'native_title'|'native_item_display_name'|'missing';requestedLocaleVerified:boolean}>;
type NameReader=Pick<PublicCompleteItemMaster,'getItemFields'>;
type MediaReader=Pick<PublicItemMediaReader,'getItemImages'>;

export async function createShopBundleDisplay(
  snapshots:readonly ShopCatalogSource[],items:NameReader,locale:ItemMasterLocale,media:MediaReader
){
  if(!snapshots.length||!snapshots.every(hasPinnedShopCatalogEvidence)||
    new Set(snapshots.map(s=>s.snapshotKey)).size!==snapshots.length)throw new TypeError('SHOP_SOURCE_REQUIRED');
  const appearances=snapshots.flatMap(s=>s.offers
    .map(offer=>({snapshotKey:s.snapshotKey,offer})));
  const ids=[...new Set(appearances.flatMap(a=>a.offer.components.map(p=>Number(p.itemId))))];
  const field='names.'+locale;
  const rows=await items.getItemFields(ids,[field]);
  const names=new Map<number,string|null>();
  for(const [i,id] of ids.entries()){
    const row=rows[i];
    if(row&&row.itemId!==id)throw new TypeError('SHOP_ITEM_ID_MISMATCH');
    const name=row?.values[field];
    names.set(id,typeof name==='string'&&name.length>0?name:null);
  }
  const missing=():ShopDisplayName=>Object.freeze({text:null,locale:null,source:'missing',requestedLocaleVerified:false});
  const records=appearances.map(({snapshotKey,offer})=>{
    const components=Object.freeze(offer.components.map(p=>Object.freeze({
      itemId:Number(p.itemId),quantity:p.quantity,name:names.get(Number(p.itemId))??null
    })));
    const first=components[0];
    const localizedTitle=offer.title?getVerifiedShopTitle(offer.nativeOfferId,offer.title,locale):null;
    const name:ShopDisplayName=offer.title
      ?Object.freeze({text:localizedTitle??offer.title,locale:localizedTitle?locale:'en',source:'native_title',requestedLocaleVerified:localizedTitle!==null||locale==='en'})
      :first?.name?Object.freeze({text:first.name,locale,source:'native_item_display_name',requestedLocaleVerified:true})
      :missing();
    return Object.freeze({snapshotKey,nativeOfferId:offer.nativeOfferId,sourceCategory:offer.sourceCategory,
      name,components,presetDiscoveryCandidate:isShopDiscoveryCategory(offer.sourceCategory),
      artworkStatus:'not_verified' as const,codeAvailabilityVerified:false as const});
  });
  type Row=(typeof records)[number];
  const byId=new Map<string,Row[]>();
  const byItem=new Map<number,Row[]>();
  const exact=new Map<string,Row>();
  for(const row of records){
    const group=byId.get(row.nativeOfferId)??[];group.push(row);byId.set(row.nativeOfferId,group);
    exact.set(row.snapshotKey+':'+row.nativeOfferId,row);
    for(const id of new Set(row.components.map(p=>p.itemId))){
      const group=byItem.get(id)??[];group.push(row);byItem.set(id,group);
    }
  }
  for(const group of [...byId.values(),...byItem.values()])Object.freeze(group);
  return Object.freeze({
    locale,records:Object.freeze(records),
    presetRecords:Object.freeze(records.filter(r=>r.presetDiscoveryCandidate)),
    historicalCoverageComplete:false as const,
    getOfferAppearances(id:string):readonly Row[]{return byId.get(id)??[];},
    getItemBundles(id:number):readonly Row[]{return byItem.get(id)??[];},
    getPresetItemBundles(id:number):readonly Row[]{return Object.freeze((byItem.get(id)??[]).filter(r=>r.presetDiscoveryCandidate));},
    /** Match DB-01's verified release Item IDs, not sale windows or cache dates.
     * Return the complete bundle plus the subset of newly introduced items.
     * Keep distinct source appearances until artwork and contents identity is resolved. */
    getBundlesForAddedItems(ids:readonly number[]){
      const requested=new Set(ids.filter(id=>Number.isSafeInteger(id)&&id>0));
      const found=new Set<Row>();
      for(const id of requested)for(const row of byItem.get(id)??[])found.add(row);
      return Object.freeze(records.filter(row=>found.has(row)).map(bundle=>Object.freeze({bundle,
        addedItemIds:Object.freeze([...new Set(bundle.components.filter(p=>requested.has(p.itemId)).map(p=>p.itemId))])})));
    },
    /** Load images only for a selected appearance; not a new item image store. */
    async getComponentImages(snapshotKey:string,offerId:string){
      const row=exact.get(snapshotKey+':'+offerId);
      if(!row)return null;
      const images=await media.getItemImages(row.components.map(p=>p.itemId),'thumbnail');
      return Object.freeze(row.components.map((p,i)=>Object.freeze({...p,image:images[i]??null})));
    }
  });
}
