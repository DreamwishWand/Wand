import type {PremiumBundleRevision,PremiumBundleComponent} from '../items/public-item-master.ts';
import type {BundleArtwork} from './bundle-artwork.ts';
import type {ItemImage} from './item-media.ts';
import type {ShopSourceKind} from './shop-source-media.ts';
import type {ImageVariant} from './public-image-key.ts';
type ShopReader={get(address:unknown,kind?:ShopSourceKind):BundleArtwork|null};
type ItemReader={getItemImage(itemId:number,variant?:ImageVariant):Promise<ItemImage|null>};
export interface ShopContentArtwork {
  readonly position:number;
  readonly component:PremiumBundleComponent;
  readonly kind:'explicit'|'item'|'missing';
  readonly sprite:BundleArtwork|null;
  readonly texture:BundleArtwork|null;
  readonly item:ItemImage|null;
}
/**
 * Native Steam 1.26.2 BundleItemViewModel ctor 0x6F3CDD0 passes Image to
 * PreviewableItemViewModel ctor 0x6F739B0; IconAddress helper 0x6F76F40
 * returns a nonempty override before consulting native Item data.
 * LoadItemsAsync.MoveNext 0x6F4478D..0x6F44842 appends the content item,
 * then evolution steps, quest items and a notable companion reward.
 * Contents positions are NOT runtime Items positions beyond the first.
 * Canonical Item artwork is useful for content browsing, not proof of
 * a runtime icon address (which can depend on native subtype/profile).
 */
export async function readShopContentArtwork(revision:PremiumBundleRevision,shop:ShopReader,items:ItemReader,variant:ImageVariant='thumbnail'):Promise<readonly ShopContentArtwork[]>{
  const pending=new Map<number,Promise<ItemImage|null>>();
  return Promise.all(revision.components.map(async(component,position):Promise<ShopContentArtwork>=>{
    if(typeof component.image==='string'&&component.image.length>0){
      const sprite=shop.get(component.image,'Sprite'),texture=shop.get(component.image,'Texture2D');
      return {position,component,kind:'explicit',sprite,texture,item:null};
    }
    let request=pending.get(component.itemId);
    if(!request){request=items.getItemImage(component.itemId,variant).catch(()=>null);pending.set(component.itemId,request);}
    const item=await request;
    return {position,component,kind:item?'item':'missing',sprite:null,texture:null,item};
  }));
}
