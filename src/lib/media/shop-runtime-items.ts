/** Source-derived runtime prefix, Steam 1.26.2.
 * BundleViewModel.<LoadItemsAsync>d__112.MoveNext 0x6F4478D..0x6F44842:
 * append base, then EvolutionSteps, GetQuestItems, notable companion reward.
 * TryGetEvolutionLevels 0x41078F0 requires IEvolveItemData; the only
 * implementing concrete classes in this dump are ClothingItemData and ToolItemData.
 * GetCharacterSkinQuests 0x6F7696C requires BundleItemType.CharacterStyle (1).
 * TryGetNotableCompanionRewardItem 0x6F76660 requires Companion (3).
 * Unknown expansions terminate the prefix; never shift a later content forward.
 */
import type {PublicCompleteItemMaster,PremiumBundleRevision} from '../items/public-item-master.ts';
import type {ItemFieldProjection} from '../items/item-field-reader.ts';
const ordinary=new Set([
 'FurnitureItemData','FurnitureRequestItemData','FurnitureBlockerItemData','FurnitureAncientMachineItemData',
 'FurnitureSnippetTrapItemData','LandscapingItemData','BuildingItemData','StallBuildingItemData','OffGridBuildingItemData',
 'HouseSkinItemData','DecalItemData','UpgradeToolItemData','BuildingOtherSkinItemData','StallSkinItemData',
 'SceneAssetsSkinItemData','MountSkinItemData','BoatSkinItemData'
]);
export type ShopRuntimeItem={readonly itemId:number;readonly quantity:number;readonly address:string|null;readonly field:string;readonly contentIndex:number};
export type ShopRuntimePrefix={readonly revisionSha256:string;readonly items:readonly ShopRuntimeItem[];readonly complete:boolean;
 readonly blockedBy:'version'|'unknown_item'|'evolution'|'evolution_index'|'quest'|'companion_reward'|null};
export function buildShopRuntimePrefix(revision:PremiumBundleRevision,rows:readonly (ItemFieldProjection|null)[],evolutionIndexed:boolean):ShopRuntimePrefix{
 const items:ShopRuntimeItem[]=[];
 const finish=(blockedBy:ShopRuntimePrefix['blockedBy']):ShopRuntimePrefix=>({revisionSha256:revision.revisionSha256,items,complete:blockedBy===null,blockedBy});
 if(revision.gameVersion!=='1.26.2')return finish('version');
 for(const [i,c] of revision.components.entries()){
   items.push({itemId:c.itemId,quantity:c.quantity,address:typeof c.image==='string'&&c.image.length?c.image:null,field:'Contents.'+i+'.Image',contentIndex:i});
   const row=rows[i];
   if(!row||row.itemId!==c.itemId)return finish('unknown_item');
   const cls=row.values.sourceClass;
   if(cls==='ClothingItemData'||cls==='ToolItemData'){
      if(!evolutionIndexed)return finish('evolution_index');
      if(Object.hasOwn(row.values,'acquisition.evolutionChain'))return finish('evolution');
      continue;
   }
   if(cls==='CharacterSkinItemData')return finish('quest');
   if(cls==='PetItemData'||cls==='CritterItemData')return finish('companion_reward');
   if(typeof cls!=='string'||!ordinary.has(cls))return finish('unknown_item');
 }
 return finish(null);
}
export async function readShopRuntimePrefix(revision:PremiumBundleRevision,db:Pick<PublicCompleteItemMaster,'release'|'getFieldCatalog'|'getItemFields'>){
 if(revision.gameVersion!=='1.26.2'||db.release.target.gameVersion!==revision.gameVersion)return buildShopRuntimePrefix({...revision,gameVersion:'unsupported'},[],false);
 const fields=new Set((await db.getFieldCatalog()).map(f=>f.field));
 const has=fields.has('acquisition.evolutionChain');
 const rows=fields.has('sourceClass')?await db.getItemFields(revision.components.map(c=>c.itemId),has?['sourceClass','acquisition.evolutionChain']:['sourceClass']):[];
 return buildShopRuntimePrefix(revision,rows,has);
}
