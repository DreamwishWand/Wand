import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createCurrentActivityEvidenceReader,readFishingFilterFacts} from '../src/lib/items/public-activity-evidence.ts';

test('all original fishing definitions join the actual result and retain same-row rarity and village area',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const reader=createCurrentActivityEvidenceReader(db);
  const activityIds=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'FishingDataItemData'});
  assert.equal(activityIds.length,282);
  const definitions=await db.getItemFields(activityIds,['source.Result.ItemID','source.Rarity','source.Locations']);
  const ids=[...new Set(definitions.map(r=>r.values['source.Result.ItemID']))].sort((a,b)=>a-b);
  assert.equal(ids.length,239);
  const rows=await reader.getFishingSources(ids);
  assert(rows.every(r=>r.status==='indexed'));
  const sources=rows.flatMap(r=>r.sources).sort((a,b)=>a.activityItemId-b.activityItemId);
  assert.equal(sources.length,282);
  assert.equal(sources.filter(s=>s.rarityFieldPresent).length,255);
  assert.equal(sources.filter(s=>s.villageAreaCodes.length).length,181);
  assert.equal(sources.filter(s=>s.resultItemId>=31000000&&s.resultItemId<31100000).length,136);
  for(const [i,s] of sources.entries()){
    const r=definitions[i];assert.equal(s.activityItemId,r.itemId);
    assert.equal(s.resultItemId,r.values['source.Result.ItemID']);
    assert.equal(s.rarityCode,r.values['source.Rarity']??0);
    assert.equal(s.rarityFieldPresent,r.values['source.Rarity']!==undefined);
    assert.deepEqual(s.villageAreaCodes,r.values['source.Locations']??[]);
  }
  const [fish,trash,unknown,duplicate]=await reader.getFishingFilterEvidence([31000001,31000005,99999999,31000001],
    {FishLocation:{UseField:true,VillageAreas:{AreaList:[0]}},FishRarity:{UseField:true,FishRarities:{FishRarities:[1,2]}}});
  assert.deepEqual(fish.matchingSourceIds,[2050100002]);assert.deepEqual(trash.matchingSourceIds,[]);
  assert.equal(unknown,null);assert.deepEqual(fish,duplicate);
  assert(fish.matches.some(m=>m.locationMatch===false&&m.rarityMatch===true));
  assert(fish.matches.every(m=>m.reviewedSourceMatch===(m.locationMatch===true&&m.rarityMatch===true)));
  assert.equal(fish.nativeFilterVerified,false);
  assert.equal(readFishingFilterFacts({FishLocation:{UseField:true,Random:true,VillageAreas:{AreaList:[0]}}}).location.status,'unresolved');
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')||url.includes('/acquisition/public/')));
});
test('ingredient references distinguish a concrete Item from an original cooking type and require recorded meal ingredients',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const reader=createCurrentActivityEvidenceReader(db);
  const [fish,other,meal,unknown,duplicate]=await reader.getIngredientDefinitionEvidence([31000001,30200020,30300005,99999999,31000001],
    [2001400000,30200020,31000001,99999999]);
  assert.equal(fish.status,'source_definition');assert.equal(fish.cookingIngredientTypeId,2001400000);
  assert.deepEqual(fish.referenceMatches.map(r=>r.reference.kind),['cooking_type','ingredient_item','ingredient_item','unresolved']);
  assert.deepEqual(fish.referenceMatches.map(r=>r.matches),[true,false,true,null]);
  assert.equal(other.referenceMatches[1].matches,true);
  assert.equal(meal.status,'recorded_meal_ingredients_required');
  assert(meal.referenceMatches.every(r=>r.matches===null));
  assert.equal(unknown,null);assert.deepEqual(fish,duplicate);
});
