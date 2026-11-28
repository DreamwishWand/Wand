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
import {readShopQuestSeeds} from './shop-quest-seeds.ts';
const ordinary=new Set([
 'FurnitureItemData','FurnitureRequestItemData','FurnitureBlockerItemData','FurnitureAncientMachineItemData',
 'FurnitureSnippetTrapItemData','LandscapingItemData','BuildingItemData','StallBuildingItemData','OffGridBuildingItemData',
 'HouseSkinItemData','DecalItemData','UpgradeToolItemData','BuildingOtherSkinItemData','StallSkinItemData',
 'SceneAssetsSkinItemData','MountSkinItemData','BoatSkinItemData'
]);
export type ShopRuntimeItem={readonly itemId:number;readonly quantity:number;readonly address:string|null;readonly field:string;readonly contentIndex:number;readonly evolutionStep?:number;readonly companionReward?:true};
export type ShopRuntimePrefix={readonly revisionSha256:string;readonly items:readonly ShopRuntimeItem[];readonly complete:boolean;
 readonly blockedBy:'version'|'unknown_item'|'evolution'|'evolution_index'|'quest'|'companion_reward'|null};
export function buildShopRuntimePrefix(revision:PremiumBundleRevision,rows:readonly (ItemFieldProjection|null)[],evolutionIndexed:boolean,evolutionTargets:ReadonlyMap<number,ItemFieldProjection>=new Map(),questSeeds:ReadonlySet<number>|null=null):ShopRuntimePrefix{
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
      if(Object.hasOwn(row.values,'acquisition.evolutionChain')){
        const steps=readEvolutionSteps(row,evolutionTargets);
        if(!steps)return finish('evolution');
        // PreviewableItemViewModel.<.ctor>b__1 RVA 0x6F77E00:
        // reads IEvolveData.EvolvesInto, constructs with quantity 1,
        // increments levelIndex; profile progress only sets _locked.
        for(const [j,id] of steps.entries())items.push({itemId:id,quantity:1,address:null,
          field:'Contents.'+i+'.EvolutionSteps.'+j+'.Icon',contentIndex:i,evolutionStep:j});
      }
      continue;
   }
   if(cls==='CharacterSkinItemData'){
     if(questSeeds&&!questSeeds.has(c.itemId))continue;
     return finish('quest');
   }
   // NotableCompanionRewardItemViewModel.Create 0x6F5C7D6..0x6F5C7E3:
   // a PetItemData with IsNotable=false returns null before reading friendship.
   // Do not treat missing or unindexed source fields as a proven false.
   if(cls==='PetItemData'&&row.values['source.IsNotable']===false)continue;
   if(cls==='PetItemData'&&row.values['source.IsNotable']===true){
     const reward=readNotableCompanionReward(row);
     if(!reward)return finish('companion_reward');
     items.push({itemId:reward.itemId,quantity:reward.quantity,address:null,
       field:'Contents.'+i+'.NotableCompanionReward.Icon',contentIndex:i,companionReward:true});
     continue;
   }
   if(cls==='PetItemData'||cls==='CritterItemData')return finish('companion_reward');
   if(typeof cls!=='string'||!ordinary.has(cls))return finish('unknown_item');
 }
 return finish(null);
}
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const itemId=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function readEvolutionSteps(row:ItemFieldProjection,targets:ReadonlyMap<number,ItemFieldProjection>):number[]|null{
 const chain=row.values['acquisition.evolutionChain'];
 if(!Array.isArray(chain)||!chain.length)return null;
 const ids:number[]=[];
 for(const [j,step] of chain.entries()){
   if(!record(step)||step.kind!=='item_evolution'||step.sourceGameVersion!=='1.26.2'||
      step.baseItemId!==row.itemId||step.stepIndex!==j||
      step.previousConfiguredTargetItemId!==(ids.at(-1)??null)||!itemId(step.targetItemId)||
      step.targetItemId===row.itemId||ids.includes(step.targetItemId))return null;
   const target=targets.get(step.targetItemId),inverse=target?.values['acquisition.evolutionSource'];
   if(!target||target.itemId!==step.targetItemId||target.values.sourceClass!==row.values.sourceClass||
      !record(inverse)||inverse.kind!=='item_evolution'||inverse.sourceGameVersion!=='1.26.2'||
      inverse.baseItemId!==row.itemId||inverse.targetItemId!==step.targetItemId||inverse.stepIndex!==j)return null;
   ids.push(step.targetItemId);
 }
 return ids;
}
/** PetFriendship.GetFriendshipLevels (0x3A551F0) merges per-pet levels
 * into default levels by Level (predicate 0x38D07E0), replacing reward lists.
 * Original protoDb record 400: default positions 0..5 map to levels 0..5;
 * ALL 241 per-pet definitions have levels 2 and 5 and exactly one Tier1Reward
 * at level 5, quantity 1. Create reads index 5, then first Tier1Reward
 * (0x6F5C809..0x6F5C89E). Do not infer a reward from default or missing data.
 * DB-01's byOwner projection already validates every referenced ItemID.
 */
function readNotableCompanionReward(row:ItemFieldProjection):{itemId:number;quantity:number}|null{
 const values=row.values['acquisition.individualFriendshipRewards'];
 if(!Array.isArray(values))return null;
 const level5=values.filter(v=>record(v)&&v.level===5);
 if(level5.length!==1)return null;
 const reward=level5[0];
 if(!record(reward)||reward.kind!=='pet_friendship_reward'||reward.sourceId!==row.itemId||
    reward.sourceRecord!=='PetFriendship'||reward.sourceRecordIndex!==400||
    reward.sourceProtoDbSha256!=='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'||
    reward.rewardStage!=='Tier1Reward'||!itemId(reward.itemId)||!itemId(reward.amount))return null;
 return {itemId:reward.itemId,quantity:reward.amount};
}
export async function readShopRuntimePrefix(revision:PremiumBundleRevision,db:Pick<PublicCompleteItemMaster,'release'|'getFieldCatalog'|'getItemFields'|'getFieldRows'|'findItemIdsByField'>){
 if(revision.gameVersion!=='1.26.2'||db.release.target.gameVersion!==revision.gameVersion)return buildShopRuntimePrefix({...revision,gameVersion:'unsupported'},[],false);
 const fields=new Set((await db.getFieldCatalog()).map(f=>f.field));
 const has=fields.has('acquisition.evolutionChain');
 const rows=fields.has('sourceClass')?await db.getItemFields(revision.components.map(c=>c.itemId),['sourceClass','acquisition.evolutionChain','source.IsNotable','acquisition.individualFriendshipRewards'].filter(f=>fields.has(f))):[];
 const targetIds=new Set<number>();
 if(has&&fields.has('acquisition.evolutionSource'))for(const row of rows){
   const chain=row?.values['acquisition.evolutionChain'];
   if(Array.isArray(chain))for(const step of chain)if(record(step)&&itemId(step.targetItemId))targetIds.add(step.targetItemId);
 }
 const targets=new Map<number,ItemFieldProjection>();
 if(targetIds.size)for(const row of await db.getItemFields([...targetIds],['sourceClass','acquisition.evolutionSource']))if(row)targets.set(row.itemId,row);
 const questSeeds=rows.some(row=>row?.values.sourceClass==='CharacterSkinItemData')?await readShopQuestSeeds(db).catch(()=>null):null;
 return buildShopRuntimePrefix(revision,rows,has,targets,questSeeds);
}
