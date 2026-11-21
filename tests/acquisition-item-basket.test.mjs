import test from 'node:test';
import assert from 'node:assert/strict';
import { createAcquisitionDatabase } from '../src/lib/acquisition/index.mjs';
import {planItemBasket, planItemRequirements, planRecipeBasket, planRecipeRequirements}
  from '../src/lib/acquisition/planner.mjs';

const part=(id,quantity=1)=>({kind:'item',itemId:id,quantity});
const recipe=(recipeId,resultItemId,ingredients,resultQuantity=1,type='crafting')=>
  ({recipeId,resultItemId,ingredients,resultQuantity,type,conditionDigest:null});
function db(recipes, acq=[]) {
  const made=new Map(),used=new Map();
  for(const r of recipes){
    if(!made.has(r.resultItemId))made.set(r.resultItemId,[]);
    made.get(r.resultItemId).push(r.recipeId);
    for(const i of r.ingredients)if(i.kind==='item'){
      if(!used.has(i.itemId))used.set(i.itemId,[]);
      used.get(i.itemId).push(r.recipeId);
    }
  }
  const all=new Set([...made.keys(),...used.keys(),...acq.map(a=>a.itemId)]);
  return createAcquisitionDatabase({
    manifest:{schema:'wand.src02@1',platform:'Steam',gameVersion:'1.26.2'},
    recipes, acquisitions:acq, relatedItems:[...all].map(itemId=>({
      itemId,inSrc01:true,recipesProducedBy:made.get(itemId)??[],
      recipesUsedBy:used.get(itemId)??[],
      acquisitionPaths:acq.filter(a=>a.itemId===itemId).map(a=>a.pathId),
      growPathsForSeed:[]
    }))
  });
}
const fixture=()=>db([
  recipe(11,101,[part(201,3),part(202)]),
  recipe(12,102,[part(201,2),part(203,2)]),
  recipe(13,201,[part(301,2)],4)
]);
const required=p=>Object.fromEntries(p.requiredMaterials.map(i=>[i.itemId,i.quantity]));

test('native Item ID basket expands exact known yields, sharing surplus and source order',()=>{
  const result=planItemBasket(fixture(),[{itemId:102,quantity:2},{itemId:'101'}]);
  assert.equal(result.schema,'wand.db02.item-basket@1');
  assert.deepEqual(result.goals,[{itemId:101,quantity:1},{itemId:102,quantity:2}]);
  assert.deepEqual(required(result),{202:1,203:4,301:4});
  assert.deepEqual(result.steps.map(x=>[x.recipeId,x.batches]),[[13,1],[11,1],[13,1],[12,2]]);
  assert.deepEqual(result.producedSurplus,[{itemId:201,quantity:1}]);
  assert.equal(result.materialsFullySpecified,true);
  assert.equal(result.recipeEligibilityEvaluated,false);
  assert.equal(result.acquisitionAvailabilityVerified,false);
});

test('hypothetical inventory covers root demand before any crafting and never double counts',()=>{
  const p=planItemBasket(fixture(),[{itemId:101,quantity:2},{itemId:102}],{
    inventory:{101:1,301:2,202:3,203:1}
  });
  assert.deepEqual(required(p),{203:1,301:2});
  assert.deepEqual(p.inventoryUsed,[
    {itemId:101,quantity:1},{itemId:202,quantity:1},
    {itemId:203,quantity:1},{itemId:301,quantity:2}]);
  assert.deepEqual(p.producedSurplus,[{itemId:201,quantity:3}]);
  assert.deepEqual(p.steps.map(x=>[x.recipeId,x.batches]),[[13,1],[11,1],[13,1],[12,1]]);
});

test('direct non-craftable source items remain explicit, not falsely missing from the game',()=>{
  const d=db([], [{pathId:'mining:42',type:'mining',itemId:301}]);
  const p=planItemRequirements(d,301,{quantity:4,inventory:{301:1}});
  assert.equal(p.schema,'wand.db02.item-plan@1');
  assert.equal(p.targetItemId,301);
  assert.equal(p.targetQuantity,4);
  assert.deepEqual(required(p),{301:3});
  assert.equal(p.requiredMaterials[0].reasons[0],'no_crafting_recipe');
  assert.equal(p.requiredMaterials[0].acquisitionPaths[0].type,'mining');
  assert.equal(p.materialsFullySpecified,true);
  assert.equal(p.acquisitionAvailabilityVerified,false);
  assert.deepEqual(p.blockers,[]);
});

test('root meal Item ID is blocked by unknown native cooking yield; explicit recipe batch stays supported',()=>{
  const d=db([recipe(40,400,[part(301,2)],null,'cooking')]);
  const p=planItemBasket(d,[{itemId:400,quantity:3}]);
  assert.deepEqual(required(p),{400:3});
  assert.equal(p.materialsFullySpecified,false);
  assert.equal(p.blockers[0].reason,'cooking_yield_unverified');
  assert.deepEqual(p.blockers[0].recipeCandidateIds,[40]);
  assert.equal(p.requiredMaterials[0].acquisitionAvailabilityVerified,false);
  const batch=planRecipeBasket(d,[{recipeId:40,batches:3}]);
  assert.equal(batch.goals[0].outputQuantity,null);
  assert.deepEqual(required(batch),{301:6});
  // If the user already has enough of the target, no unverifiable batch is required.
  const fromStock=planItemBasket(d,[{itemId:400,quantity:3}],{inventory:{400:3}});
  assert.deepEqual(required(fromStock),{});
  assert.deepEqual(fromStock.blockers,[]);
});

test('ambiguous native crafting output forces explicit recipe selection',()=>{
  const d=db([recipe(11,201,[part(301)],2),recipe(12,201,[part(302)],3)]);
  const p=planItemBasket(d,[{itemId:201,quantity:5}]);
  assert.deepEqual(required(p),{201:5});
  assert.equal(p.status,'requires_explicit_choices');
  assert.deepEqual(p.blockers[0].recipeCandidateIds,[11,12]);
  const selected=planItemBasket(d,[{itemId:201,quantity:5}],{recipeChoices:{201:12}});
  assert.deepEqual(required(selected),{302:2});
  assert.deepEqual(selected.producedSurplus,[{itemId:201,quantity:1}]);
  assert.throws(()=>planItemBasket(d,[{itemId:201}],{recipeChoices:{201:99}}),/Invalid selected recipe/);
});

test('repeated Item IDs are normalized and produce the same result regardless of order',()=>{
  const d=fixture();
  const a=planItemBasket(d,[{itemId:102},{itemId:101},{itemId:102,quantity:2}]);
  const b=planItemBasket(d,[{itemId:101},{itemId:102,quantity:3}]);
  assert.deepEqual(a,b);
  assert.deepEqual(a.goals,[{itemId:101,quantity:1},{itemId:102,quantity:3}]);
});

test('simple target item planning equals an explicit crafting batch when yield is one',()=>{
  const d=fixture();
  const a=planItemRequirements(d,101,{quantity:2,inventory:{301:1}});
  const b=planRecipeRequirements(d,11,{batches:2,inventory:{301:1}});
  assert.deepEqual(a.requiredMaterials,b.requiredMaterials);
  assert.deepEqual(a.steps,b.steps);
  assert.deepEqual(a.inventoryUsed,b.inventoryUsed);
  assert.deepEqual(a.remainingInventory,b.remainingInventory);
});

test('unknown native Item ID is not assumed unavailable or silently dropped',()=>{
  const p=planItemBasket(fixture(),[{itemId:999999,quantity:7}]);
  assert.deepEqual(required(p),{999999:7});
  assert.equal(p.requiredMaterials[0].acquisitionPaths.length,0);
  assert.equal(p.requiredMaterials[0].reasons[0],'no_crafting_recipe');
  assert.equal(p.acquisitionAvailabilityVerified,false);
});

test('item basket preserves depth and cycles as explicit blockers',()=>{
  const d=db([recipe(11,101,[part(201)]),recipe(12,201,[part(101)])]);
  const loop=planItemBasket(d,[{itemId:101}]);
  assert.equal(loop.blockers[0].reason,'cyclic_recipe_chain');
  assert.deepEqual(required(loop),{101:1});
  const depth=planItemBasket(d,[{itemId:101}],{maxDepth:0});
  assert.equal(depth.blockers[0].reason,'maximum_depth_reached');
  assert.deepEqual(required(depth),{101:1});
});

test('malformed or unsafe item goals and options are rejected without data mutation',()=>{
  const d=fixture();
  for(const goals of [[],null,{},[{}],[null],[{itemId:0}],[{itemId:'001'}],
    [{itemId:101,quantity:0}],[{itemId:101,quantity:-1}],
    [{itemId:101,quantity:1_000_001}],[{itemId:101,additional:4}]]){
    assert.throws(()=>planItemBasket(d,goals));
  }
  assert.throws(()=>planItemBasket(d,Array.from({length:201},()=>({itemId:101}))),/200 goals/);
  assert.throws(()=>planItemBasket(d,[{itemId:101,quantity:600000},{itemId:101,quantity:600000}]),/Combined target/);
  assert.throws(()=>planItemBasket(d,[{itemId:101}],{inventory:{'0101':1}}),/inventory Item ID/);
  assert.throws(()=>planItemBasket(d,[{itemId:101}],{maxDepth:30}),/maximum recursion depth/);
  assert.throws(()=>planItemBasket(d,[{itemId:101}],{recipeChoices:{201:10000}}),/Invalid selected recipe/);
  assert.throws(()=>planItemRequirements(d,101,{quantity:0}),/target quantity/);
  assert.throws(()=>planItemRequirements(d,101,null),/Invalid item plan options/);
  const stock={301:4}; const before=structuredClone(d.getRecipe(11));
  planItemBasket(d,[{itemId:101}],{inventory:stock});
  assert.deepEqual(stock,{301:4});
  assert.deepEqual(d.getRecipe(11),before);
});