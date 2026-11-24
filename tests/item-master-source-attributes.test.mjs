import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openPublicItemMaster} from '../src/lib/items/public-item-master.ts';
import {openPublicItemDetails} from '../src/lib/items/public-item-details.ts';

const fetcher=async url=>new Response(await readFile('static'+url),{status:200});

test('same-release source attributes include original recipe quantities, native grid layers and price overrides',async()=>{
  const db=await openPublicItemMaster('',fetcher,{scope:'complete',gameVersion:'current'});
  const coverage=db.release.sourceAttributeCoverage;
  assert.equal(coverage.itemCount,30007);
  assert.equal(coverage.fieldCount,215);
  assert.equal(coverage.fieldOccurrences,123764);
  assert.equal(coverage.fields.GridAreaData,11325);
  assert.equal(coverage.fields.PriceOverride,8229);
  assert.equal(coverage.fields.Ingredients,1943);
  assert.equal(coverage.gridLayerOccupancyVerified,false);
  assert.equal(coverage.runtimePriceVerified,false);
  assert.equal(coverage.allOriginalFieldSemanticsVerified,false);
  const [recipe,shoe,priced]=await db.getItems([2050300095,40005160,40000047]);
  assert.deepEqual(recipe.sourceAttributes.Result,{ItemID:30000031,Amount:1});
  assert.deepEqual(recipe.sourceAttributes.Ingredients,[{ItemID:31700021,Amount:5},{ItemID:31700022,Amount:1}]);
  assert.deepEqual(shoe.sourceAttributes.GridAreaData.Layers,[68]);
  assert.equal(shoe.sourceAttributes.GridAreaData.SizeX,1);
  assert.deepEqual(shoe.sourceAttributes.PriceOverride,{});
  assert.deepEqual(priced.sourceAttributes.PriceOverride.Price,{Id:80000000,Amount:16000});
  assert(Object.isFrozen(recipe.sourceAttributes.Ingredients[0]));
  assert(Object.isFrozen(shoe.sourceAttributes.GridAreaData.Layers));
  assert.equal(recipe.availabilityVerified,false);
  assert.equal(await db.getItem(99999999),null);
});

test('complete details expose the same typed attributes without an extra dataset request',async()=>{
  const requests=[];
  const db=await openPublicItemDetails('',async url=>{requests.push(url);return fetcher(url)});
  const item=await db.getCompleteItem(30000031);
  assert.equal(item.definition.sourceAttributes.ExtraGiftFriendship,800);
  assert.equal(item.definition.sourceAttributes.Description,'ActivityItem.RefinedNightShard_Small_Description');
  assert(item.definition.craftingRecipeItemIds.includes(2050300095));
  assert.equal(requests.filter(url=>url.includes('source-attributes')).length,0);
});

test('native supplement preserves original nullable stride values and offers nested field reads',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete',gameVersion:'current'});
  assert.equal(db.release.nativeSupplementCoverage.strideOverrideCount,257);
  assert.equal(db.release.nativeSupplementCoverage.runtimeSemanticsVerified,false);
  const selected=await db.getItemFields([40004525,40005145,40600142,40600317,40005160],['source.GridAreaData.StrideOverride']);
  assert.deepEqual(selected.map(r=>r.values['source.GridAreaData.StrideOverride']),[1,2,3,4,undefined]);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/fields/source.GridAreaData/')));
  const ids=await db.findItemIdsByField('source.GridAreaData.StrideOverride',{kind:'present'});
  assert.equal(ids.length,257);
  const item=await db.getItem(40005145);
  assert.equal(item.sourceAttributes.GridAreaData.StrideOverride,2);
  assert(!item.sourceAttributes.GridAreaData._unresolvedFields?.includes(5));
  const grid=await db.getItemFields([40005160],['source.GridAreaData.SizeX','source.GridAreaData.Layers']);
  assert.equal(grid[0].values['source.GridAreaData.SizeX'],1);
  assert.deepEqual(grid[0].values['source.GridAreaData.Layers'],[68]);
});


test('reviewed original reference arrays preserve order and sentinel values',async()=>{
  const db=await openPublicItemMaster('',fetcher,{scope:'complete',gameVersion:'current'});
  assert.deepEqual(db.release.referenceAttributeCoverage.fields,{
    AdditionalRewardItemIDs:35,CharacterInteractionSceneRestrictionsItemID:3,EmployeeItemIDs:82
  });
  const rows=await db.getItemFields([180000000,20100000,20100013,2070000921],[
    'source.AdditionalRewardItemIDs','source.EmployeeItemIDs','source.CharacterInteractionSceneRestrictionsItemID'
  ]);
  assert.deepEqual(rows[0].values['source.AdditionalRewardItemIDs'],[40002309,40002310]);
  assert.deepEqual(rows[1].values['source.EmployeeItemIDs'],[10000004]);
  assert.deepEqual(rows[2].values['source.EmployeeItemIDs'],[0]);
  assert.deepEqual(rows[3].values['source.CharacterInteractionSceneRestrictionsItemID'],[1540000095,1540000096]);
});

test('source ItemID references are bidirectional and lazy, with paths and valid targets',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const outgoing=await db.getItemReferences(2050300095,'outgoing');
  assert(outgoing.some(([id,path])=>id===30000031&&path==='source.Result.ItemID'));
  assert(outgoing.some(([id,path])=>id===31700021&&path==='source.Ingredients[0].ItemID'));
  const incoming=await db.getItemReferences(30000031,'incoming');
  assert(incoming.some(([id,path])=>id===2050300095&&path==='source.Result.ItemID'));
  const reward=await db.getItemReferences(180000000,'outgoing');
  assert(reward.some(([id,path])=>id===40002309&&path==='source.AdditionalRewardItemIDs[0]'));
  assert((await db.getItemReferences(40002309,'incoming')).some(([id,path])=>id===180000000&&path==='source.AdditionalRewardItemIDs[0]'));
  assert(!(await db.getItemReferences(20100013,'outgoing')).some(([id])=>id===0));
  assert.equal(await db.getItemReferences(99999999,'incoming'),null);
  assert(Object.isFrozen(incoming)&&Object.isFrozen(incoming[0]));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/text/')||url.includes('/locale/')));
  await assert.rejects(db.getItemReferences(30000031,'other'),/INVALID_REFERENCE_DIRECTION/);
});


test('reviewed root arrays preserve all source values, order and repeats in the common master',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const fields=db.release.reviewedRootArrayCoverage.fields;
  assert.equal(Object.keys(fields).length,22);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.itemCount,0),2219);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.valueCount,0),5145);
  assert.equal(fields.IncompatibleWith.elementType,'ClothingItemType');
  assert.equal(fields.Locations.elementType,'VillageAreaType');
  const values=await db.getItemFields([10000001,20100000,50000094,2070000628,2050100000,1510000002],[
    'source.PreferredItemDifficulties','source.BoardGameFigurineItemIDs',
    'source.SlotLootTableItemID','source.IncompatibleWith','source.ItemsToDeleteAfterMission',
    'source.Locations','source.Slots'
  ]);
  assert.deepEqual(values[0].values['source.PreferredItemDifficulties'],[1,2,3]);
  assert.deepEqual(values[0].values['source.BoardGameFigurineItemIDs'],Array(5).fill(180000035));
  assert.deepEqual(values[1].values['source.SlotLootTableItemID'],[2090000056,2090000052,2090000057,2090000052,2090000058,2090000052]);
  assert.deepEqual(values[2].values['source.IncompatibleWith'],[13]);
  assert.deepEqual(values[3].values['source.ItemsToDeleteAfterMission'],[31200032]);
  assert.deepEqual(values[4].values['source.Locations'],[6]);
  assert.deepEqual(values[5].values['source.Slots'],[1510100005,1510100005,1510100007]);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
  const reverse=await db.findItemIdsByField('source.BoardGameFigurineItemIDs',{kind:'contains',value:180000035});
  assert(reverse.includes(10000001));
  const links=await db.getItemReferences(10000001,'outgoing');
  assert(links.some(([id,path])=>id===180000035&&path==='source.BoardGameFigurineItemIDs[0]'));
  assert(links.some(([id,path])=>id===180000035&&path==='source.BoardGameFigurineItemIDs[4]'));
  assert(links.some(([id,path])=>id===50600110&&path==='source.SignatureItems[0]'));
  assert((await db.getItemReferences(31200032,'incoming')).some(([id,path])=>id===2070000628&&path==='source.ItemsToDeleteAfterMission[0]'));
  assert((await db.getItemReferences(1510000002,'outgoing')).some(([id,path])=>id===1510100005&&path==='source.Slots[1]'));
});


test('reviewed message trees retain presence, ordered rewards and nested source fields',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const fields=db.release.reviewedMessageCoverage.fields;
  assert.equal(Object.keys(fields).length,10);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.itemCount,0),3286);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.occurrences,0),4567);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.leafCount,0),9832);
  const [crop,empty,nanos,village,mission,ach,event,request]=await db.getItemFields([
    30400010,30400120,30400128,40200003,2070000672,2110100001,2010000003,31500016
  ],['source.GrowthPeriod','source.ProductionPeriod.Nanos','source.VillageArea',
     'source.RewardsXP.Currency','source.Milestones','source.IntervalData','source.ItemList','source.DefaultItem']);
  assert.deepEqual(crop.values['source.GrowthPeriod'],{Seconds:900});
  assert.deepEqual(empty.values['source.GrowthPeriod'],{});
  assert.equal(nanos.values['source.ProductionPeriod.Nanos'],1000000);
  assert.deepEqual(village.values['source.VillageArea'],{UseField:true,VillageArea:0});
  assert.deepEqual(mission.values['source.RewardsXP.Currency'],[{Amount:{Max:500,Min:500},CurrencyId:80000000}]);
  assert.deepEqual(ach.values['source.Milestones'].map(x=>x.Milestone),[25,400,1100,2000,4500]);
  assert.deepEqual(event.values['source.IntervalData'],{TimeOfDay:{TimeOfDay:[{Hour:5}]}});
  assert.deepEqual(event.values['source.ItemList'].Items.map(x=>x.Weight),[2,2,2,1]);
  assert.deepEqual(request.values['source.DefaultItem'],{Amount:1,ItemID:130000079,State:{MemoryShardIndex:0}});
  assert((await db.getItemReferences(2110100001,'outgoing')).some(([id,p])=>id===80300000&&p==='source.Milestones[4].RewardItem'));
  assert((await db.getItemReferences(80000000,'incoming')).some(([id,p])=>id===2070000672&&p==='source.RewardsXP.Currency[0].CurrencyId'));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});


test('category-qualified source groups retain schedule and selector structure and reward references',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const fields=db.release.reviewedMessageGroupCoverage.fields;
  assert.equal(Object.keys(fields).length,37);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.itemCount,0),18177);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.occurrences,0),20060);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.leafCount,0),63120);
  assert.notEqual(fields['Character.DailySchedule'].declaredType,fields['Companion.DailySchedule'].declaredType);
  const [character,companion,empty,mission]=await db.getItemFields([10000001,120100000,2070000620,2070000628],[
    'source.DailySchedule','source.FavoriteItem.Item.Item.Item','source.LikeItem.FilterGenerator.CropType','source.AdditionnalRewards'
  ]);
  assert.equal(character.values['source.DailySchedule'].length,7);
  assert.deepEqual(character.values['source.DailySchedule'][0].Schedule[0],{End:5,Location:{Anywhere:{}},Start:3,Type:8});
  assert.deepEqual(companion.values['source.DailySchedule'][0],{Schedule:[{End:24,Start:12}]});
  assert.deepEqual(companion.values['source.DailySchedule'][2],{});
  assert.equal(companion.values['source.FavoriteItem.Item.Item.Item'],30200000);
  assert.equal(companion.values['source.LikeItem.FilterGenerator.CropType'],2);
  assert.deepEqual(empty.values['source.AdditionnalRewards'],{});
  assert.deepEqual(mission.values['source.AdditionnalRewards'].SubLootTables[0],{Items:[{ItemID:30400064}],Max:2,Min:2});
  assert((await db.getItemReferences(30200000,'incoming')).some(([id,p])=>id===120100000&&p==='source.FavoriteItem.Item.Item.Item'));
  assert((await db.getItemReferences(2070000628,'outgoing')).some(([id,p])=>id===30400064&&p==='source.AdditionnalRewards.SubLootTables[0].Items[0].ItemID'));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});


test('all original loot tables and facility upgrades retain conditions, costs, GUIDs and source links',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const coverage=db.release.reviewedMessageGroupCoverage.fields;
  assert.equal(coverage['LootTable.Rewards'].itemCount,960);
  assert.equal(coverage['LootTable.Rewards'].leafCount,11694);
  assert.equal(coverage['Building.UpgradeInfo'].itemCount,323);
  assert.equal(coverage['Building.UpgradeInfo'].occurrences,604);
  assert.equal(coverage['Building.UpgradeInfo'].leafCount,4476);
  const [loot,building]=await db.getItemFields([2090000000,20000011],['source.Rewards.SubLootTables','source.UpgradeInfo']);
  assert.deepEqual(loot.values['source.Rewards.SubLootTables'],[
    {Items:[{ItemID:80000000}],Max:300,Min:100,Weight:70},
    {Max:1,Min:1,Types_:[{Clothing:{}},{Furniture:{FurnitureItemType:0}},{Furniture:{FurnitureItemType:7}}],Weight:30}
  ]);
  assert.deepEqual(building.values['source.UpgradeInfo'],[{Cost:{Id:80000000},Level:1,PrefabAddress:'guid:577885985cca7724b89c231693ed8eb1',UpgradeDialogueAddress:'guid:ac6c6b1b23a68124faed83172ac2e3b3'}]);
  const outgoing=await db.getItemReferences(20100002,'outgoing');
  assert(outgoing.some(([id,p])=>id===2090000006&&p.endsWith('.Fishing.FishLootTableItemID')));
  assert((await db.getItemReferences(20000011,'outgoing')).some(([id,p])=>id===80000000&&p==='source.UpgradeInfo[0].Cost.Id'));
  assert((await db.getItemReferences(2090000339,'outgoing')).some(([id,p])=>id===2070001328&&p==='source.Rewards.SubLootTables[0].ItemsConditional[0].Conditions.Conditions[0].MissionStatus.Mission'));
  assert((await db.getItemReferences(31000022,'incoming')).some(([id,p])=>id===2090000523&&p==='source.Rewards.SubLootTables[0].Items[0].State.MealData.IngredientsUsed[0]'));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});


test('all source ConditionsList groups retain native trees and audited cross references',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const fields=Object.values(db.release.reviewedMessageGroupCoverage.fields).filter(f=>f.declaredType==='ConditionsList');
  assert.equal(fields.length,30);
  assert.equal(fields.reduce((s,f)=>s+f.itemCount,0),16134);
  assert.equal(fields.reduce((s,f)=>s+f.leafCount,0),35425);
  const [condition,keyhole,available,unlock,companion]=await db.getItemFields([2130000001,2130000119,2070000620,2070000628,120100056],[
    'source.Conditions.Conditions','source.AvailableConditions.Conditions','source.UnlockConditions','source.AppearanceConditions.Conditions'
  ]);
  assert.deepEqual(condition.values['source.Conditions.Conditions'],[{MissionStepStatus:{Mission:2070000651,Status:5,StepID:2}}]);
  assert.deepEqual(keyhole.values['source.Conditions.Conditions'],[{KeyholeStatus:{Keyhole:'1b4144b0-8285-477b-b1d0-9db454592b97',Status:3}}]);
  assert.deepEqual(available.values['source.AvailableConditions.Conditions'],[{PlayerLevel:{PlayerLevel:1}},{RealmUnlocked:{Universe:2000500019}}]);
  assert.deepEqual(available.values['source.UnlockConditions'],{});
  assert.deepEqual(unlock.values['source.UnlockConditions'],{Conditions:[{CurrentVillage:{VillageScene:1540000000}}]});
  assert.deepEqual(companion.values['source.AppearanceConditions.Conditions'],[{MissionStepStatus:{Mission:2070001046,Status:4}}]);
  assert((await db.getItemReferences(2070000651,'incoming')).some(([id,p])=>id===2130000001&&p==='source.Conditions.Conditions[0].MissionStepStatus.Mission'));
  assert((await db.getItemReferences(2070000620,'outgoing')).some(([id,p])=>id===2000500019&&p==='source.AvailableConditions.Conditions[1].RealmUnlocked.Universe'));
  assert((await db.getItemReferences(120100056,'outgoing')).some(([id,p])=>id===2070001046&&p==='source.AppearanceConditions.Conditions[0].MissionStepStatus.Mission'));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});


test('large reviewed structures retain mission order, source identities and byte-bounded lazy blocks',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const fields=db.release.reviewedStructureCoverage.fields;
  assert.equal(Object.keys(fields).length,180);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.itemCount,0),43758);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.occurrences,0),56948);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.leafCount,0),707588);
  assert.equal(fields['Mission.Steps'].occurrences,7878);
  const catalog=await db.getFieldCatalog();
  const column=catalog.find(f=>f.field==='source.Steps');
  assert(column.blocks.length>1,'large mission column must be byte-sharded');
  assert(column.blocks.every(b=>db.release.assets[b.path].bytes<=1024*1024+256));
  const [mission,character,spawn,subgrid,keyhole,tool,toggle,container,auto]=await db.getItemFields(
    [2070000620,10000001,1520000001,40000059,40001053,40600000,40000056,40000047,2070000628],
    ['source.Steps','source.OverrideSchedules','source.Spawn.AmountToSpawn','source.SubGrid.SubGridDataPath',
     'source.Keyhole.Keyhole','source.ToolBreakable','source.Toggle','source.Container','source.AutoAccept']);
  assert.equal(mission.values['source.Steps'][0].StepName,'Group01');
  assert.equal(mission.values['source.Steps'][0].OngoingDialogue,'guid:a8dc5f21e864b824aa9fb813b6a98b36');
  assert.equal(character.values['source.OverrideSchedules'][0].Conditions.Conditions[0].MissionStepStatus.Mission,2070001510);
  assert.deepEqual(spawn.values['source.Spawn.AmountToSpawn'],{Value:{Value:3}});
  assert.equal(subgrid.values['source.SubGrid.SubGridDataPath'],'GridData/Furniture/Mickey_Set03/Table01-GridData.json');
  assert.equal(keyhole.values['source.Keyhole.Keyhole'],'06bc29e3-3f6e-4413-b1a7-5add7dcab261');
  assert.deepEqual(tool.values['source.ToolBreakable'],{Tool:110500000,Upgrade:150100015});
  assert.equal(toggle.values['source.Toggle'].BackToDefaultOnDailyReset,true);
  assert.equal(container.values['source.Container'].DefaultContainerInventoryData,'Furniture_16Slot');
  assert.equal(auto.values['source.AutoAccept'][0].Conditions.Conditions[0].Inventory.Item,31200032);
  assert((await db.getItemReferences(2070001510,'incoming')).some(([id,p])=>id===10000001&&p==='source.OverrideSchedules[0].Conditions.Conditions[0].MissionStepStatus.Mission'));
  assert((await db.getItemReferences(110500000,'incoming')).some(([id,p])=>id===40600000&&p==='source.ToolBreakable.Tool'));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
  assert(requests.filter(url=>url.includes('/fields/source.Steps/')).length<column.blocks.length);
});


test('expanded numeric structures preserve source definitions and related IDs',async()=>{
  const db=await openPublicItemMaster('',fetcher,{scope:'complete'});
  const f=db.release.reviewedStructureCoverage.fields;
  assert.equal(f['ActivityData.Location'].itemCount,299);
  assert.equal(f['Preference.FavoriteIngredients'].itemCount,86);
  assert.equal(f['Furniture.CraftingStation'].itemCount,23);
  assert.equal(f['DutyAch.StepDifficultyLayers'].itemCount,160);
  assert.equal(f['Mission.NoOutro'].itemCount,255);
  const [activity,pref,station,machine,event,story,mission]=await db.getItemFields(
    [2050200022,1510100005,40000462,40800001,1520000524,200000001,2070000656],
    ['source.Location','source.FavoriteIngredients','source.CraftingStation','source.AutoCooker','source.GiveItem','source.Reward','source.NoOutro']);
  assert.deepEqual(activity.values['source.Location'],{VillageArea:0});
  assert.deepEqual(pref.values['source.FavoriteIngredients'],{Exclusions:{},Inclusions:{}});
  assert.deepEqual(station.values['source.CraftingStation'].CraftingRecipeTypes,[2001100001,2001100003,2001100000,2001100002,2001100015,2001100014]);
  assert.deepEqual(machine.values['source.AutoCooker'],{ActionCost:{Amount:25,Id:80000003},InputSlotMaxCapacity:10,OutputMaxCapacity:10,ProductionCooldown:{Seconds:180}});
  assert.deepEqual(event.values['source.GiveItem'],{Items:[{Amount:1,ItemID:120000073}]});
  assert.deepEqual(story.values['source.Reward'],{Amount:1,ItemID:51300032});
  assert.deepEqual(mission.values['source.NoOutro'],{});
  assert((await db.getItemReferences(2001100001,'incoming')).some(([id,p])=>id===40000462&&p==='source.CraftingStation.CraftingRecipeTypes[0]'));
  assert((await db.getItemReferences(40800001,'outgoing')).some(([id,p])=>id===80000003&&p==='source.AutoCooker.ActionCost.Id'));
});


test('mixed structures retain exact localization keys, inert formulas and map entry presence',async()=>{
  const db=await openPublicItemMaster('',fetcher,{scope:'complete'});
  const f=db.release.reviewedStructureCoverage.fields;
  assert.equal(f['Furniture.Mannequin'].itemCount,6);
  assert.equal(f['Profession.IconOverrides'].itemCount,10);
  assert.equal(f['Mission.Any'].itemCount,475);
  assert.equal(f['ConditionalEvent.SendMailbox'].itemCount,207);
  const [mannequin,profession,soft,hard,mission,mail]=await db.getItemFields(
    [40001920,1500100000,80000000,80100000,2070000620,1520000968],
    ['source.Mannequin.EmptyMannequinClothes','source.IconOverrides','source.HardCurrencyConversionTiers','source.SkipTimerTiers','source.Any','source.SendMailbox']);
  assert.deepEqual(mannequin.values['source.Mannequin.EmptyMannequinClothes'],[{Value:50000212},{Key:1,Value:50100077}]);
  assert.deepEqual(profession.values['source.IconOverrides'],[{Value:'guid:7763bdca09de6c14aa942b506f9c3d89'}]);
  assert.deepEqual(soft.values['source.HardCurrencyConversionTiers'],[{ConversionEquation:'Ceil({Amount} * 0.1)'}]);
  assert.deepEqual(hard.values['source.SkipTimerTiers'],[{ConversionEquation:'Max(1, 4 * ({Minutes}^0.82))'}]);
  assert.deepEqual(mission.values['source.Any'],{
    CompletedRequestDescription:'Story/MRQS010_Welcome.Story!MRQS010_Welcome_Any_CompletedRequestDescription',
    OutroDialogue:'guid:405d1303929ba4c4ab80b8b0ddf4feb3'
  });
  assert.equal(mail.values['source.SendMailbox'].Villager,10000103);
  assert((await db.getItemReferences(50000212,'incoming')).some(([id,p])=>id===40001920&&p==='source.Mannequin.EmptyMannequinClothes[0].Value'));
  assert((await db.getItemReferences(1520000968,'outgoing')).some(([id,p])=>id===10000103&&p==='source.SendMailbox.Villager'));
});


test('overloaded native declarations preserve complete original results and formula table keys',async()=>{
  const db=await openPublicItemMaster('',fetcher,{scope:'complete'});
  const fields=db.release.reviewedStructureCoverage.fields;
  assert.equal(Object.keys(fields).filter(k=>k.includes('@')).length,10);
  assert.equal(fields['ActivityData.Result@CraftingRecipeItemData.Types.ResultInstance'].itemCount,1318);
  assert.equal(fields['ActivityData.Result@ItemWithState'].itemCount,663);
  assert.equal(fields['ActivityData.Ingredients@RepeatedField<RecipeItemData.Types.Ingredient>'].occurrences,2056);
  const [craft,recipe,fishing,other,price,profession,landscape]=await db.getItemFields(
    [2050300153,2050000004,2050400000,2050100000,2100000000,2100300000,40200025],
    ['source.Result','source.Ingredients','source.Locations','source.TablesOfValues','source.SubGrid']);
  assert.deepEqual(craft.values['source.Result'],{Amount:1,ItemID:31500101,State:{ConsummableData:{Amount:1,ItemID:150100003}}});
  assert.deepEqual(recipe.values['source.Ingredients'],[{ItemID:31100053},{ItemID:31100001},{ItemID:30200045},{ItemID:30200090}]);
  assert.deepEqual(fishing.values['source.Locations'],[{Scene:1540000101},{Scene:1540000000}]);
  assert.deepEqual(other.values['source.Result'],{ItemID:31000029});
  assert.deepEqual(price.values['source.TablesOfValues'][0].Values[0],{EquationValue:6,Key:'1'});
  assert.deepEqual(price.values['source.TablesOfValues'][1].Values[0],{EquationValue:2,Key:'2000100009'});
  assert.deepEqual(profession.values['source.TablesOfValues'],[{DefaultValue:30,VariableName:'PercentagePointsPerLevel'},{DefaultValue:10,VariableName:'PercentagePointsPerSplashLevel'}]);
  assert.deepEqual(landscape.values['source.SubGrid'],{SubGrid:{SubGridDataPath:'GridData/Furniture/NonIP_SetLess/BrickCorner01-GridData.json'}});
  assert((await db.getItemReferences(150100003,'incoming')).some(([id,p])=>id===2050300153&&p==='source.Result.State.ConsummableData.ItemID'));
  assert((await db.getItemReferences(1540000101,'incoming')).some(([id,p])=>id===2050400000&&p==='source.Locations[0].Scene'));
  assert((await db.getItemReferences(2100000000,'outgoing')).some(([id,p])=>id===2000100009&&p==='source.TablesOfValues[1].Values[0].Key'));
});


test('full root scalar source census preserves signed values, explicit presence, ordered tags and asset keys',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const c=db.release.reviewedRootScalarCoverage;
  assert.equal(c.groupCount,557);
  assert.equal(c.fieldPairs,206619);
  assert.equal(c.occurrences,206968);
  assert.equal(c.leafCount,261397);
  assert.equal(c.identityOccurrences,78134);
  assert.equal(c.existingPairs+c.addedPairs,c.fieldPairs);
  assert(c.addedPairs>0);
  const [character,crop,negative,mission,furniture,clothes]=await db.getItemFields(
    [10000001,30400010,30400025,2070000620,40000059,50000212],
    ['source.BoardGameAIConfig','source.GlotID','source.Tags','source.HarvestPrefabAddress',
     'source.NumberOfGrowthPeriods','source.HasGrowthBoost','source.AvailableDescription',
     'source.IntroDialogue','source.IconAddress','source.MaleIconAddress']);
  assert.equal(character.values['source.BoardGameAIConfig'],'DefaultAI');
  assert.equal(character.values['source.GlotID'],508889);
  assert.deepEqual(character.values['source.Tags'],[2000500051,2001200066]);
  assert.equal(crop.values['source.HarvestPrefabAddress'],'guid:0ec80682be37fd24e80be3ee553693c9');
  assert.equal(crop.values['source.HasGrowthBoost'],true);
  assert.equal(negative.values['source.NumberOfGrowthPeriods'],-1);
  assert.equal(mission.values['source.AvailableDescription'],'Story/MRQS010_Welcome.Story!MRQS010_Welcome_AvailableDescription');
  assert.equal(mission.values['source.IntroDialogue'],'guid:80e4636849f13d840bc645e3061ef3ea');
  assert.deepEqual(furniture.values['source.Tags'],[2000300000,2000300003,2000700008,2000200001,2000200000,2000400003,2000400006,2000700000,2001200028]);
  assert.equal(clothes.values['source.MaleIconAddress'],'guid:e3509f066e496c64f8a846856c181020');
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});


test('complete original root message census preserves legacy grid, catalog and collection structures',async()=>{
  const db=await openPublicItemMaster('',fetcher,{scope:'complete'});
  const unique=new Map();
  for(const coverage of [db.release.reviewedMessageCoverage,db.release.reviewedMessageGroupCoverage,db.release.reviewedStructureCoverage]){
    for(const [label,g] of Object.entries(coverage.fields)){
      const field=label.split('@')[0].split('.').at(-1);
      const key=g.category+'.'+field+'@'+g.declaredType;
      if(unique.has(key))assert.deepEqual(unique.get(key),g);
      unique.set(key,g);
    }
  }
  assert.equal(unique.size,226);
  assert.equal([...unique.values()].reduce((n,g)=>n+g.occurrences,0),81457);
  const [furniture,stride,currency,recipe,clothes,building,group,empty]=await db.getItemFields(
    [40000047,40002300,80000000,2050301241,50000440,20100048,2120000015,40001786],
    ['source.GridAreaData','source.AppearWhen','source.CatalogVisibilityConditions','source.GridEditRestriction','source.Groups','source.ItemList']);
  assert.deepEqual(furniture.values['source.GridAreaData'],{AcceptedFloorTypesFlag:1070327039,Layers:[332,332,332,332,332,332],SizeX:3,SizeY:2});
  assert.equal(stride.values['source.GridAreaData'].StrideOverride,2);
  assert(!Object.hasOwn(stride.values['source.GridAreaData'],'_unresolvedFields'));
  assert.deepEqual(currency.values['source.GridAreaData'],{AcceptedFloorTypesFlag:1070331135,Layers:[4],SizeX:1,SizeY:1});
  assert.deepEqual(recipe.values['source.AppearWhen'],{Conditions:{Conditions:[{KeyholeStatus:{Keyhole:'b54f1892-1cae-46a1-a5af-479b643e0753',Status:4}}]},ConditionsMeet:true});
  assert.deepEqual(clothes.values['source.CatalogVisibilityConditions'],{UnlockedByDesignChallenge:'DreamSnap154_ExplosionsOfColor'});
  assert.equal(building.values['source.GridEditRestriction'].CanPlace.CustomRestrictions[0].Reason,'menu.unlock_all_biomes');
  assert.deepEqual(group.values['source.Groups'],[{CollectionsByItem:[{Ignore:true,ItemList:[30200018,30200120,30200191]}],CollectionsByType:[{ActivityItem:{ByGameplayTag:2001200013}}]}]);
  assert.deepEqual(empty.values['source.ItemList'],{});
  assert((await db.getItemReferences(30200018,'incoming')).some(([id,p])=>id===2120000015&&p==='source.Groups[0].CollectionsByItem[0].ItemList[0]'));
});


test('explicit source relations link quest owners, price currencies and Collection tag predicates',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const categoryRows=await db.getFieldRows('nativeCategory');
  const categories=new Map(categoryRows);
  const owners=await db.getFieldRows('source.OwnerCharacter');
  const example=owners.find(([id,target])=>categories.get(id)==='Mission'&&categories.get(target)==='Character');
  assert(example,'original quest must have a canonical character owner');
  const [missionId,owner]=example;
  const [mission,price,group,unknown,repeat]=await db.getItemsReferences(
    [missionId,40000047,2120000015,99999999,40000047],'outgoing');
  assert.equal(unknown,null);
  assert.deepEqual(repeat,price);
  assert(mission.some(([id,path])=>id===owner&&path==='source.OwnerCharacter'));
  assert(price.some(([id,path])=>id===80000000&&path==='source.PriceOverride.Price.Id'));
  assert(group.some(([id,path])=>id===2001200013&&path==='source.Groups[0].CollectionsByType[0].ActivityItem.ByGameplayTag'));
  const reverse=await db.getItemsReferences([owner,80000000,2001200013],'incoming');
  assert(reverse[0].some(([id,path])=>id===missionId&&path==='source.OwnerCharacter'));
  assert(reverse[1].some(([id,path])=>id===40000047&&path==='source.PriceOverride.Price.Id'));
  assert(reverse[2].some(([id,path])=>id===2120000015&&path==='source.Groups[0].CollectionsByType[0].ActivityItem.ByGameplayTag'));
  assert(Object.isFrozen(reverse)&&Object.isFrozen(reverse[0]));
  assert.deepEqual(await db.getItemsReferences([],'incoming'),[]);
  await assert.rejects(db.getItemsReferences([40000047],'both'),/INVALID_REFERENCE_DIRECTION/);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});


test('nested source references connect actual quest conditions, event selectors, costs and rewards',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const examples=[
    [1520000001,31200032,'source.Spawn.QuestItem.Item.Item.Item'],
    [1520000038,20100002,'source.Spawn.SpawnLocationSource.Building.Building'],
    [1520000067,1540000000,'source.Spawn.SpawnLocationSource.AnywhereInScene.Scene'],
    [1520000088,30400131,'source.Spawn.GardenItem.Seed'],
    [2070000620,2090000173,'source.OverrideRewards.Rewards[0]'],
    [2070001662,10000219,'source.OwnerOverrides[0].Character'],
    [20000078,80000000,'source.SpecificUnlockCost.Id'],
    [2010000003,2090000003,'source.WeedOverrides.WeedLootTable'],
    [2110100005,30200058,'source.GardeningHarvest.TargetItem.Item.Item.Item'],
    [2110100104,20500000,'source.Upgrade.BuildingID'],
    [2110300018,10000194,'source.Objective.Friend.CharacterID']
  ];
  const outgoing=await db.getItemsReferences(examples.map(x=>x[0]),'outgoing');
  const incoming=await db.getItemsReferences(examples.map(x=>x[1]),'incoming');
  for(const [i,[origin,target,path]] of examples.entries()){
    // The source retains original array indices; an owner override may appear
    // after another entry, so normalize only that index in this fixture.
    const match=p=>p===path||path==='source.OwnerOverrides[0].Character'&&/^source\.OwnerOverrides\[\d+\]\.Character$/.test(p);
    assert(outgoing[i].some(([id,p])=>id===target&&match(p)),origin+' '+path);
    assert(incoming[i].some(([id,p])=>id===origin&&match(p)),target+' '+path);
  }
  const placement=await db.getItemReferences(20000011,'outgoing');
  assert(placement.some(([id,p])=>id===2070000982&&/^source\.GridEditRestriction\.CanMove\.Conditions\.Conditions\[\d+\]\.MissionStatus\.Mission$/.test(p)));
  const tag=await db.getItemReferences(2110100001,'outgoing');
  assert(tag.some(([id,p])=>id===2001200014&&/^source\.GardeningHarvest\.TargetItem\.FilterGenerator\.Tags\[\d+\]\.Tags\[\d+\]$/.test(p)));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});


test('native acquisition candidates expose original reward and output occurrences without ingredient or condition misclassification',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const field='acquisition.nativeCandidates';
  const ids=[30000031,51300032,120000073,80300000,30400064,31200032,99999999];
  const rows=await db.getItemFields(ids,[field]);
  const typed=await db.getNativeAcquisitionCandidates(ids);
  assert.deepEqual(typed,rows.map(row=>row===null?null:row.values[field]??[]));
  assert(Object.isFrozen(typed)&&Object.isFrozen(typed[0]));
  const has=(row,sourceId,role,path)=>(row.values[field]??[]).some(
    ([source,r,p])=>source===sourceId&&r===role&&p===path);
  assert(has(rows[0],2050300095,'activity_result','source.Result.ItemID'));
  assert(has(rows[1],200000001,'story_reward','source.Reward.ItemID'));
  assert(has(rows[2],1520000524,'conditional_grant','source.GiveItem.Items[0].ItemID'));
  assert(has(rows[3],2110100001,'duty_reward','source.Milestones[4].RewardItem'));
  assert(has(rows[4],2070000628,'quest_additional_loot_candidate','source.AdditionnalRewards.SubLootTables[0].Items[0].ItemID'));
  assert(!(rows[5].values[field]??[]).some(([id,,p])=>id===1520000001&&p.includes('Spawn')));
  assert.equal(rows[6],null);
  const all=await db.getFieldRows(field);
  assert(all.length>0);
  for(const [,links] of all)for(const [,role,path] of links){
    assert(!/Ingredients|Conditions|Spawn|Tags/.test(path));
    assert(typeof role==='string');
  }
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});


test('canonical introduction attributes distinguish proven earlier presence from unknown release',async()=>{
  const requests=[];
  const db=await openPublicItemMaster('',async url=>{requests.push(url);return fetcher(url)},{scope:'complete'});
  const fields=['history.firstObservedVersion','history.introducedVersion','history.introducedAfterVersion',
    'history.contentReleaseId','history.observationEvidence'];
  const rows=await db.getItemFields([40005160,2130000001,99999999],fields);
  assert.equal(rows[0].values['history.firstObservedVersion'],'1.26.1');
  assert.equal(rows[0].values['history.observationEvidence'],'sha_identical_earlier_source');
  assert.equal(rows[0].values['history.introducedVersion'],null);
  assert.equal(rows[1].values['history.firstObservedVersion'],'1.26.2');
  assert.equal(rows[1].values['history.observationEvidence'],'current_source_only');
  assert.equal(rows[1].values['history.introducedVersion'],null);
  assert.equal(rows[2],null);
  assert.equal((await db.findItemIdsByField('history.firstObservedVersion',{kind:'equals',value:'1.26.1'})).length,33627);
  assert.equal((await db.findItemIdsByField('history.introducedVersion',{kind:'equals',value:null})).length,39067);
  assert.deepEqual(await db.findItemIdsByField('history.introducedVersion',{kind:'equals',value:'1.26.2'}),[]);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});
