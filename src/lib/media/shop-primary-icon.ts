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
import type {createShopSourceReader} from './shop-source-media.ts';
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
  |{readonly status:'male';readonly guid:string;readonly primaryGuid:string|null;readonly className:string}
  |{readonly status:'unresolved';readonly reason:'unknown_class'|'missing_primary'|'unknown_male_field'|'conflicting_primary'|'unsupported_address'};
/** Default is an explicit non-male preview context, not the user's profile. */
export function selectShopProfileIcon(row:ItemFieldProjection|null,profile:'default'|'male',maleFieldIndexed:boolean):ShopProfileIconSelection{
  if(!row)return {status:'unresolved',reason:'unknown_class'};
  const v=row.values,className=v.sourceClass;
  if(typeof className!=='string'||!directClasses.has(className))return {status:'unresolved',reason:'unknown_class'};
  const primary=guid(v.iconGuid),source=guid(v['source.IconAddress']);
  const male=className==='ClothingItemData'?guid(v['source.MaleIconAddress']):null;
  if(className==='ClothingItemData'&&profile==='male'){
    if(!maleFieldIndexed)return {status:'unresolved',reason:'unknown_male_field'};
    const address=v['source.MaleIconAddress'];
    if(address!=null&&address!==''&&!male)return {status:'unresolved',reason:'unsupported_address'};
    if(male&&male!==primary)return {status:'male',guid:male,primaryGuid:primary,className};
  }
  if(!primary)return {status:'unresolved',reason:'missing_primary'};
  if(v['source.IconAddress']!=null&&v['source.IconAddress']!==''&&!source)return {status:'unresolved',reason:'unsupported_address'};
  if(source&&source!==primary)return {status:'unresolved',reason:'conflicting_primary'};
  return {status:'primary',guid:primary,maleGuid:male,className,maleFieldIndexed};
}
type ItemMediaReader={getItemImage(id:number,variant?:ImageVariant):Promise<ItemImage|null>};
type SourceReader=Pick<ReturnType<typeof createShopSourceReader>,'get'|'url'>;
export type ShopIconConsumer='Sprite'|'Icon';
/** Reuse an already published typed GUID when available. Never substitute a
 * different ItemID or a Texture2D for a required Sprite. For an unknown Icon
 * consumer only exact byte-identical typed variants qualify. */
function readPublishedGuid(reader:SourceReader,guid:string,variant:ImageVariant,consumer:ShopIconConsumer):ItemImage|null{
 const address='guid:'+guid;
 const sprite=reader.get(address,'Sprite');
 if(!sprite)return null;
 if(consumer==='Icon'){
   const texture=reader.get(address,'Texture2D');
   if(!texture||sprite.original.sha256!==texture.original.sha256||sprite.thumbnail.sha256!==texture.thumbnail.sha256)return null;
 }
 const url=reader.url(address,variant,'Sprite');
 const image=sprite[variant];
 return url?{url,sha256:image.sha256,width:image.width,height:image.height}:null;
}
/** Primary canonical ItemID artwork remains an explicitly labelled comparison
 * candidate. Distinct male addresses never use the primary ItemID index. */
export async function readShopPrimaryIconCandidate(db:Pick<ItemFieldReader,'getFieldCatalog'|'getItemFields'>,media:ItemMediaReader,itemId:number,variant:ImageVariant='thumbnail',profile:'default'|'male'='default',reader?:SourceReader|null,consumer:ShopIconConsumer='Icon'){
  const fields=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const maleFieldIndexed=fields.has('source.MaleIconAddress');
  if(!fields.has('iconGuid')||!fields.has('sourceClass'))return null;
  const [row]=await db.getItemFields([itemId],['iconGuid','sourceClass','source.IconAddress','source.MaleIconAddress'].filter(f=>fields.has(f)));
  if(!row||row.itemId!==itemId)return null;
  const selection=selectShopProfileIcon(row,profile,maleFieldIndexed);
  const exact=reader&&selection.status!=='unresolved'?readPublishedGuid(reader,selection.guid,variant,consumer):null;
  const image=exact??(selection.status==='primary'?await media.getItemImage(itemId,variant).catch(()=>null):null);
  return {itemId,selection,image,imageSource:exact?'published_guid' as const:image?'item_comparison' as const:null,renderingVerified:false as const};
}
