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
  assert.equal(Object.keys(fields).length,120);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.itemCount,0),7449);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.occurrences,0),16042);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.leafCount,0),284111);
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
