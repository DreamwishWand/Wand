import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_NATIVE_RECIPE_FILE,DB02_NATIVE_RECIPE_BYTES,
  DB02_NATIVE_RECIPE_SHA256,DB02_NATIVE_RECIPE_ORIGINAL_SHA256,
  loadPinnedNativeRecipeResults,hasPinnedNativeRecipeEvidence
} from '../src/lib/acquisition/public-native-recipes.ts';

const data=readFileSync(new URL('../static/acquisition/public/'+
  DB02_NATIVE_RECIPE_FILE,import.meta.url));
const fixture=JSON.parse(data);
function localFetcher(opts={}){
  const requests=[];
  const fetcher=async url=>{
    requests.push(url);
    assert.equal(url,'/Wand/acquisition/public/'+DB02_NATIVE_RECIPE_FILE);
    if(opts.missing)return new Response('missing',{status:404});
    if(opts.truncate)return new Response(data.subarray(0,-1),{status:200});
    const copy=Buffer.from(data);
    if(opts.corrupt)copy[80]^=1;
    return new Response(copy,{status:200});
  };
  return {requests,fetcher};
}

test('Steam 1.26.2 ActivityData projection is SHA-pinned and confirms exactly 1943 recipe-result relations',async()=>{
  assert.equal(data.length,DB02_NATIVE_RECIPE_BYTES);
  assert.equal(createHash('sha256').update(data).digest('hex'),
    DB02_NATIVE_RECIPE_SHA256);
  assert.equal(fixture.source.sha256,DB02_NATIVE_RECIPE_ORIGINAL_SHA256);
  assert.equal(fixture.source.bytes,260627);
  assert.equal(fixture.recipes.length,1943);
  const {requests,fetcher}=localFetcher();
  const index=await loadPinnedNativeRecipeResults('/Wand',fetcher);
  assert.equal(requests.length,1);
  assert.equal(index.schema,'wand.db02.native-recipe-results@1');
  assert.equal(index.gameVersion,'1.26.2');
  assert.equal(index.source.kind,'verified_game_native');
  assert.equal(index.source.sha256,DB02_NATIVE_RECIPE_ORIGINAL_SHA256);
  assert.equal(index.coverage.sourceActivityDefinitions,2630);
  assert.equal(index.coverage.recipeDefinitions,1943);
  assert.equal(index.coverage.cookingRecipes,625);
  assert.equal(index.coverage.craftingRecipes,1318);
  assert.equal(index.coverage.distinctResultItemIds,1912);
  assert.equal(index.coverage.playerCanCraftVerified,false);
  assert.equal(index.coverage.recipeUnlockedVerified,false);
  assert.equal(index.coverage.cookingYieldKnown,false);
  assert.equal(index.coverage.liveConditionsEvaluated,false);
  assert.equal(index.coverage.allAcquisitionRoutesCovered,false);
  assert.equal(index.recipes.length,1943);
  assert.equal(index.origins.length,1943);
  assert.equal(index.listResultItemIds().length,1912);
  assert.equal(index.listRecipeIds().length,1943);
  assert.equal(index.listRecipeIds('cooking').length,625);
  assert.equal(index.listRecipeIds('crafting').length,1318);
  assert.equal(new Set(index.origins.map(r=>r.originId)).size,1943);
  assert(Object.isFrozen(index)&&Object.isFrozen(index.recipes)&&
    Object.isFrozen(index.origins)&&Object.isFrozen(index.coverage));
  assert(hasPinnedNativeRecipeEvidence(index));
  assert(!hasPinnedNativeRecipeEvidence({
    ...index,source:{...index.source}
  }));
  for(const row of index.origins){
    assert.equal(row.routeStatus,'confirmed_source_link');
    assert.equal(row.source.kind,'verified_game_native');
    assert.equal(row.source.sha256,DB02_NATIVE_RECIPE_ORIGINAL_SHA256);
    assert.equal(row.availability,'not_live_verified');
    assert.equal(row.price,null);
    assert.equal(row.campaignId,null);
    assert(index.getResultOrigins(row.itemId).includes(row));
    assert(Object.isFrozen(row));
  }
});
test('Crafting output quantity and exact ingredients retain original Item IDs',async()=>{
  const index=await loadPinnedNativeRecipeResults('/Wand',localFetcher().fetcher);
  const row=index.getRecipe('2050300000');
  assert(row);
  assert.equal(row.kind,'crafting');
  assert.equal(row.resultItemId,'40001082');
  assert.equal(row.resultQuantity,1);
  assert.deepEqual(row.ingredients,[
    {kind:'item',itemId:'31700009',quantity:3},
    {kind:'item',itemId:'31700006',quantity:1},
    {kind:'item',itemId:'31600009',quantity:1}
  ]);
  assert.equal(row.playerCanCraftVerified,false);
  assert.equal(row.recipeUnlockedVerified,false);
  assert.equal(row.liveConditionsEvaluated,false);
  assert(Object.isFrozen(row)&&Object.isFrozen(row.ingredients));
  assert.deepEqual(index.getResultRecipes('40001082'),[row]);
  const origin=index.getResultOrigins(40001082)[0];
  assert.equal(origin.originId,'native:recipe:2050300000');
  assert.equal(origin.kind,'crafting');
  assert.equal(origin.quantity,1);
  assert.equal(origin.accessTier,'not_applicable');
  const ingredientUse=index.getIngredientItemUses(31700009);
  assert(ingredientUse.some(u=>u.recipeId===row.recipeId&&
    u.ingredientIndex===0&&u.ingredientKind==='item'&&
    u.resultItemId==='40001082'&&!u.isAlternativeChoice));
  assert(Object.isFrozen(ingredientUse));
  assert.equal(index.getIngredientTagUses('31700009').length,0);
});
test('Cooking preserves tags, original alternatives and unspecified result yield',async()=>{
  const index=await loadPinnedNativeRecipeResults('/Wand',localFetcher().fetcher);
  const meal=index.getRecipe(2050000009);
  assert(meal);
  assert.equal(meal.kind,'cooking');
  assert.equal(meal.resultItemId,'30300010');
  assert.equal(meal.resultQuantity,null);
  assert.deepEqual(meal.ingredients[0],
    {kind:'any_tag',tagId:'2001400000',quantity:1});
  assert.equal(index.getIngredientTagUses('2001400000')
    .some(u=>u.recipeId===meal.recipeId&&!u.isAlternativeChoice),true);
  const tagChoice=index.getRecipe(2050000138);
  assert(tagChoice);
  assert.deepEqual(tagChoice.ingredients,[
    {kind:'tag_alternatives',tagIds:['2001200019'],quantity:1}
  ]);
  assert.equal(index.getIngredientTagUses('2001200019')
    .some(u=>u.recipeId===tagChoice.recipeId&&u.isAlternativeChoice),true);
  assert.equal(index.getResultOrigins('30300010')[0].quantity,null);
  assert(index.getResultRecipes('80000010').length===13);
  assert.equal(index.getResultOrigins('80000010').length,13);
  assert.equal(index.getResultRecipes('99999999').length,0);
  assert.equal(index.getIngredientItemUses('99999999').length,0);
  assert.equal(index.getIngredientTagUses('99999999').length,0);
  assert.equal(index.getRecipe('2050000001'),null);
});
test('tampering, missing bytes and invalid Item IDs fail closed',async()=>{
  await assert.rejects(
    loadPinnedNativeRecipeResults('/Wand',localFetcher({corrupt:true}).fetcher),
    /DB02_NATIVE_RECIPE_SHA/
  );
  await assert.rejects(
    loadPinnedNativeRecipeResults('/Wand',localFetcher({truncate:true}).fetcher),
    /DB02_NATIVE_RECIPE_BYTES/
  );
  await assert.rejects(
    loadPinnedNativeRecipeResults('/Wand',localFetcher({missing:true}).fetcher),
    /DB02_NATIVE_RECIPE_DOWNLOAD_FAILED/
  );
  await assert.rejects(
    loadPinnedNativeRecipeResults('/Wand/../src',localFetcher().fetcher),
    /DB02_NATIVE_RECIPE_INVALID_BASE_PATH/
  );
  const index=await loadPinnedNativeRecipeResults('/Wand',localFetcher().fetcher);
  assert.throws(()=>index.getRecipe('02050300000'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getResultRecipes('-1'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getIngredientTagUses('..'),/INVALID_ITEM_ID/);
  assert.throws(()=>index.listRecipeIds('twitch_drop'),/INVALID_KIND/);
  assert.throws(()=>index.listResultItemIds('premium_shop'),/INVALID_KIND/);
});
