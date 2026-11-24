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