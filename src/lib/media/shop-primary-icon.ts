/** Steam 1.26.2 native item icon selection, not a rendering certificate.
 * PreviewableItemViewModel.<.ctor>g__IconAddress|95_0 (0x6F76F40):
 * explicit override first; clothing (ItemType=5, exact ClothingItemData)
 * male profile (ProfileAvatar.get_IsMale 0x13272D0) and nonempty field +0x78;
 * otherwise IItemData.get_IconAddress (interface slot 4).
 * The classes below directly return +0x30 at RVA 0x69B4C0.
 * Empty primary has an additional native fallback; never infer it.
 */
import type {ItemFieldReader,ItemFieldProjection} from '../items/item-field-reader.ts';
import type {ItemImage} from './item-media.ts';
import type {ImageVariant} from './public-image-key.ts';
const directClasses=new Set([
  'FurnitureItemData','FurnitureRequestItemData','FurnitureBlockerItemData','FurnitureAncientMachineItemData',
  'FurnitureSnippetTrapItemData','LandscapingItemData','BuildingItemData','StallBuildingItemData',
  'OffGridBuildingItemData','HouseSkinItemData','ClothingItemData','DecalItemData','ToolItemData',
  'UpgradeToolItemData','CharacterSkinItemData','BuildingOtherSkinItemData','StallSkinItemData',
  'SceneAssetsSkinItemData','MountSkinItemData','BoatSkinItemData','CritterItemData','PetItemData'
]);
const guid=(v:unknown):string|null=>typeof v==='string'&&/^(?:guid:)?[0-9a-f]{32}$/.test(v)?v.replace(/^guid:/,''):null;
export type ShopProfileIconSelection =
  |{readonly status:'primary';readonly guid:string;readonly maleGuid:string|null;readonly className:string;readonly maleFieldIndexed:boolean}
  |{readonly status:'male';readonly guid:string;readonly primaryGuid:string;readonly className:string}
  |{readonly status:'unresolved';readonly reason:'unknown_class'|'missing_primary'|'unknown_male_field'|'conflicting_primary'};
/** Default is an explicit non-male preview context, not the user's profile. */
export function selectShopProfileIcon(row:ItemFieldProjection|null,profile:'default'|'male',maleFieldIndexed:boolean):ShopProfileIconSelection{
  const v=row?.values??{},className=v.sourceClass;
  if(typeof className!=='string'||!directClasses.has(className))return {status:'unresolved',reason:'unknown_class'};
  const primary=guid(v.iconGuid),source=guid(v['source.IconAddress']);
  if(!primary)return {status:'unresolved',reason:'missing_primary'};
  if(source&&source!==primary)return {status:'unresolved',reason:'conflicting_primary'};
  const male=className==='ClothingItemData'?guid(v['source.MaleIconAddress']):null;
  if(className==='ClothingItemData'&&profile==='male'){
    if(!maleFieldIndexed)return {status:'unresolved',reason:'unknown_male_field'};
    if(male&&male!==primary)return {status:'male',guid:male,primaryGuid:primary,className};
  }
  return {status:'primary',guid:primary,maleGuid:male,className,maleFieldIndexed};
}
type ItemMediaReader={getItemImage(id:number,variant?:ImageVariant):Promise<ItemImage|null>};
/** Use only the existing canonical Item image index. Male alternatives with a
 * distinct GUID are NOT returned from the primary ItemID index.
 * The CDN reader does not establish a native Sprite consumer, so the result
 * is an explicitly marked comparison candidate, never PublishedShopArtwork.
 */
export async function readShopPrimaryIconCandidate(db:Pick<ItemFieldReader,'getFieldCatalog'|'getItemFields'>,media:ItemMediaReader,itemId:number,variant:ImageVariant='thumbnail',profile:'default'|'male'='default'){
  const fields=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const maleFieldIndexed=fields.has('source.MaleIconAddress');
  if(!fields.has('iconGuid')||!fields.has('sourceClass'))return null;
  const [row]=await db.getItemFields([itemId],['iconGuid','sourceClass','source.IconAddress','source.MaleIconAddress'].filter(f=>fields.has(f)));
  if(!row||row.itemId!==itemId)return null;
  const selection=selectShopProfileIcon(row,profile,maleFieldIndexed);
  const image=selection.status==='primary'?await media.getItemImage(itemId,variant).catch(()=>null):null;
  return {itemId,selection,image,renderingVerified:false as const};
}
