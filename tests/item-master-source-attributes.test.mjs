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
