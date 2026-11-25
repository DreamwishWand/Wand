import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readQuestFilterFacts,createQuestFilterCandidateReader} from '../src/lib/items/public-quest-filter-candidates.ts';

test('original quest filters retain explicit types, direct tags and unresolved constraints from the current master',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const quests=await db.findItemIdsByField('nativeCategory',{kind:'equals',value:'Mission'});
  const rows=await db.getItemFields(quests,['source.Steps']);
  const fields={BringItem:['TargetItem'],Possess:['Item'],CraftItem:['Target'],CookMeal:['TargetMealItem','TargetIngredientItem'],
    ConsumeItem:['Item'],CollectCurrency:['CurrencyType'],MineMineral:['TargetItem'],GiftToCharacter:['TargetItem'],
    PurchaseItem:['ItemToPurchase'],SellItem:['ItemToSell'],PickUp:['FlowerItem','EphemeralItem','IngredientItem','QuestItem','RegularItem'],
    CatchFish:['TargetItem'],GardeningHarvest:['TargetItem','TargetSeed'],GardeningPlant:['TargetItem','TargetSeed']};
  const filters=[];
  for(const r of rows)for(const step of r.values['source.Steps']??[])for(const sub of step.SubSteps??[])for(const objective of sub.Objectives??[]){
    for(const [kind,names] of Object.entries(fields))for(const name of names){
      const selector=objective[kind]?.[name];
      const raw=(['BringItem','PurchaseItem','SellItem'].includes(kind)?selector?.ItemToGive:selector)?.FilterGenerator;
      if(raw)filters.push(raw);
    }
  }
  assert.equal(filters.length,154);
  const facts=filters.map(readQuestFilterFacts);
  assert.equal(facts.filter(f=>f.directTagGroups.some(g=>g.tagIds.length)).length,71);
  assert.equal(facts.filter(f=>f.minimumMealStars!==null).length,35);
  assert.equal(facts.filter(f=>f.ingredientTypeReferences.length).length,25);
  assert.equal(facts.filter(f=>f.otherConfiguredFields.includes('FishLocation')).length,6);
  assert.equal(facts.filter(f=>f.otherConfiguredFields.includes('FishRarity')).length,2);
  const counts={};for(const f of facts){const key=f.itemTypeCode+':'+f.activitySubtypeCode;counts[key]=(counts[key]??0)+1;}
  assert.deepEqual(counts,{'3:3':59,'3:8':25,'3:10':20,'3:16':19,'3:11':14,'3:2':8,'4:null':4,'5:null':4,'205:null':1});
  const reader=createQuestFilterCandidateReader(db);
  const meal=await reader.resolve(filters.find(f=>f.Type===3&&f.ActivityItemType===3&&f.MinMealStarRating?.Value?.Value===5));
  assert.equal(meal.status,'source_definition_candidates');
  assert.equal(meal.facts.minimumMealStars,5);
  assert.equal(meal.candidates.length,618);
  const values=await db.getItemFields(meal.candidates.map(c=>c.itemId),['source.StarRating']);
  assert(meal.candidates.every((c,i)=>c.starRatingMatch===(values[i].values['source.StarRating']>=5)));
  const tagged=await reader.resolve(filters.find(f=>f.Type===3&&f.ActivityItemType===8&&f.Tags?.some(g=>g.Tags?.length===1)&&!f.TagCondition));
  const tagIds=tagged.facts.directTagGroups.flatMap(g=>g.tagIds);
  const taggedRows=await db.getItemFields(tagged.candidates.map(c=>c.itemId),['tags']);
  for(const [i,r] of taggedRows.entries()){
    const own=r.values.tags.map(t=>t.id);
    assert.equal(tagged.candidates[i].directTagMatch,tagIds.every(t=>own.includes(t)));
  }
  assert(tagged.candidates.some(c=>c.directTagMatch));
  assert(tagged.candidates.some(c=>c.directTagMatch===false));
  assert.equal(tagged.nativeFilterVerified,false);
  assert.equal(tagged.runtimeRequirementVerified,false);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')||url.includes('/acquisition/public/')));
  assert.throws(()=>readQuestFilterFacts({Type:3,Tags:[{Tags:[0]}]}),/TAG_IDS/);
});
