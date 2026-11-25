import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createCanonicalRecipeReader} from '../src/lib/acquisition/canonical-recipes.ts';

test('canonical recipe reader preserves the entire original recipe census, quantities and ordered selectors',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const reader=createCanonicalRecipeReader(db);
  const ids=await reader.listRecipeIds();
  assert.equal(ids.length,1943);
  assert.equal((await reader.listRecipeIds('cooking')).length,625);
  assert.equal((await reader.listRecipeIds('crafting')).length,1318);
  const recipes=await reader.getRecipes(ids);
  const byId=new Map(recipes.map(r=>[r.recipeId,r]));
  const results=[...new Set(recipes.map(r=>r.resultItemId))].sort((a,b)=>a-b);
  assert.equal(results.length,1912);
  assert.equal(recipes.filter(r=>r.resultState!==null).length,11);
  assert.equal(recipes.filter(r=>r.maxIngredients!==null).length,25);
  assert.equal(recipes.filter(r=>r.appearWhen!==null).length,1318);
  assert.equal(recipes.flatMap(r=>r.ingredients).length,6383);
  const old=JSON.parse(await readFile('static/acquisition/public/recipe-results-1.26.2.json','utf8'));
  for(const [rid,kind,result,quantity,ingredients] of old.recipes){
    const row=byId.get(rid);
    assert(row);
    assert.equal(row.kind,kind===0?'cooking':'crafting');
    assert.equal(row.resultItemId,result);
    assert.equal(row.resultQuantity,quantity);
    assert.deepEqual(row.ingredients,ingredients.map(([type,x,n])=>type===0?{kind:'item',itemId:x,quantity:kind===0?1:n}:
      type===1?{kind:'ingredient_type',tagId:x,quantity:1}:
      type===2?{kind:'item_alternatives',itemIds:x,quantity:1}:{kind:'all_tags',tagIds:x,quantity:1}));
    assert.equal(row.availabilityVerified,false);
  }
  const [first,unknown,dup]=await reader.getRecipes([2050300000,99999999,2050300000]);
  assert.equal(unknown,null);assert.deepEqual(first,dup);
  assert.deepEqual(first.ingredients,[{kind:'item',itemId:31700009,quantity:3},{kind:'item',itemId:31700006,quantity:1},{kind:'item',itemId:31600009,quantity:1}]);
  const reverse=await reader.getResultRecipes(results);
  assert.equal(reverse.flat().length,1943);
  assert(reverse.every((group,i)=>group.every(r=>r.resultItemId===results[i])));
  const [materials]=await reader.getIngredientUses([31700009]);
  assert(materials.some(r=>r.recipeId===2050300000&&r.ingredientIndex===0&&r.quantity===3));
  const [types]=await reader.getIngredientUses([2001400000],'ingredient_type');
  assert(types.some(r=>r.recipeId===2050000009&&r.ingredientIndex===0));
  const tagRecipe=byId.get(2050000138),tagId=tagRecipe.ingredients[0].tagIds[0];
  const [tags]=await reader.getIngredientUses([tagId],'tag');
  assert(tags.some(r=>r.recipeId===2050000138&&r.selectorKind==='all_tags'));
  assert(!requests.some(url=>url.includes('/acquisition/public/')||url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});
