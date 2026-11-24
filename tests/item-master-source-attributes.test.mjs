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
  assert.equal(Object.keys(fields).length,5);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.itemCount,0),760);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.occurrences,0),2362);
  assert.equal(Object.values(fields).reduce((s,f)=>s+f.leafCount,0),11525);
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
