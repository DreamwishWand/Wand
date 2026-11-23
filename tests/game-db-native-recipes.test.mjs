import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openPublicSharedGameSources} from '../src/lib/game-db/public-sources.ts';
import {
  createDb00NativeRecipeReader,DB00_NATIVE_RECIPE_CONTRACT
} from '../src/lib/game-db/native-recipes.ts';

const ROOT=new URL('../static/',import.meta.url);
const RECIPE='recipe-results-1.26.2.json';
function fetcher(corrupt=false){
  const calls=[];
  return {
    calls,
    async read(url){
      assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
      calls.push(url);
      let bytes;
      try{bytes=readFileSync(new URL(url.slice(6),ROOT));}
      catch{return new Response('not found',{status:404});}
      if(corrupt&&url.endsWith('/'+RECIPE)){
        bytes=Buffer.from(bytes);bytes[80]^=1;
      }
      return new Response(bytes,{status:200});
    }
  };
}
let cached;
const shared=()=>cached??=openPublicSharedGameSources('/Wand',fetcher().read);

test('DB-00 loads exact 1943 original cooking/crafting relations lazily once without changing published origins',async()=>{
  const {calls,read}=fetcher();
  const app=await openPublicSharedGameSources('/Wand',read);
  const prior=calls.length;
  assert(prior>0);
  assert(!calls.some(x=>x.endsWith('/'+RECIPE)));
  const before=app.getItem('40001082');
  const reader=await app.loadNativeRecipeSources();
  assert.equal(reader,await app.loadNativeRecipeSources());
  assert.equal(reader.contract,DB00_NATIVE_RECIPE_CONTRACT);
  assert.equal(reader.snapshotId,app.snapshotId);
  assert.equal(reader.sourceRecipeDefinitions,1943);
  assert.equal(reader.distinctResultItemIds,1912);
  assert.equal(reader.sourceRecipeResultOnly,true);
  assert.equal(reader.recipeUnlockedVerified,false);
  assert.equal(reader.canCraftNowVerified,false);
  assert.equal(calls.length,prior+1);
  assert.equal(calls.filter(x=>x.endsWith('/'+RECIPE)).length,1);
  const direct=await app.acquisition.loadNativeRecipeResults();
  assert.equal(direct.coverage.recipeDefinitions,1943);
  assert.equal(calls.length,prior+1);
  assert.deepEqual(app.getItem('40001082').origins,before.origins,
    'native recipe evidence never silently promotes original acquisition routes');
  assert.equal(app.acquisition.coverage.combinedSourceRoutes,1255);
  assert(Object.isFrozen(reader));
});

test('DB-00 exact recipe and Item-ID crosswalk preserves quantity, ingredient alternatives and ownership uncertainty',async()=>{
  const app=await shared();
  const reader=await app.loadNativeRecipeSources();
  const craft=reader.getRecipe('2050300000');
  assert(craft);
  assert.equal(craft.recipe.kind,'crafting');
  assert.equal(craft.recipe.resultItemId,'40001082');
  assert.equal(craft.recipe.resultQuantity,1);
  assert.deepEqual(craft.recipe.ingredients,[
    {kind:'item',itemId:'31700009',quantity:3},
    {kind:'item',itemId:'31700006',quantity:1},
    {kind:'item',itemId:'31600009',quantity:1}
  ]);
  assert.equal(craft.result.itemId,'40001082');
  assert.deepEqual(craft.result.item,app.getItem('40001082'));
  assert(craft.result.recipes.includes(craft.recipe));
  assert(craft.result.sourceRecipeOrigins.some(o=>
    o.originId==='native:recipe:2050300000'));
  assert.equal(craft.result.recipeUnlockedVerified,false);
  assert.equal(craft.result.canCraftNowVerified,false);
  assert.equal(craft.result.playerOwnershipVerified,false);
  assert.equal(craft.result.collectionUiMembershipVerified,false);
  assert.equal(craft.originalIngredientSelectorsOnly,true);
  const ingredient=reader.getIngredientItemUses('31700009');
  assert(ingredient.some(x=>x.recipeId===craft.recipe.recipeId&&
    x.ingredientIndex===0&&!x.isAlternativeChoice));
  assert.deepEqual(reader.getIngredientTagUses('31700009'),[]);
  const meal=reader.getRecipe('2050000009');
  assert(meal);
  assert.equal(meal.recipe.kind,'cooking');
  assert.equal(meal.recipe.resultQuantity,null);
  assert.deepEqual(meal.recipe.ingredients[0],
    {kind:'any_tag',tagId:'2001400000',quantity:1});
  assert(reader.getIngredientTagUses('2001400000').some(x=>
    x.recipeId==='2050000009'));
  assert.equal(reader.getIngredientItemUses('2001400000').length,0);
  assert.equal(reader.getRecipe('2050000001'),null);
  assert.equal(reader.getResult('99999999').recipes.length,0);
  assert(Object.isFrozen(craft));
  assert(Object.isFrozen(craft.result));
});

test('DB-00 source recipe result search paginates all 1912 Item IDs and filters native categories without inferred Collection membership',async()=>{
  const app=await shared();
  const reader=await app.loadNativeRecipeSources();
  assert.equal(reader.searchResults().total,1912);
  const all=[];
  for(let offset=0;;){
    const page=reader.searchResults({offset,limit:199});
    assert.equal(page.scope,'original_recipe_results_only');
    assert.equal(page.recipeUnlockedVerified,false);
    assert.equal(page.canCraftNowVerified,false);
    assert.equal(page.playerOwnershipVerified,false);
    all.push(...page.items);
    if(page.nextOffset===null)break;
    assert(page.nextOffset>offset);
    offset=page.nextOffset;
  }
  assert.equal(all.length,1912);
  assert.equal(new Set(all.map(x=>x.itemId)).size,1912);
  const upstream=await app.acquisition.loadNativeRecipeResults();
  assert.deepEqual(all.map(x=>x.itemId),upstream.listResultItemIds());
  assert.equal(all.reduce((n,row)=>n+row.recipes.length,0),1943);
  for(const kind of ['cooking','crafting']){
    const page=reader.searchResults({kind,limit:500});
    assert.equal(page.total,upstream.listResultItemIds(kind).length);
    assert(page.items.every(x=>x.recipes.some(r=>r.kind===kind)));
  }
  const published=reader.searchResults({publishedOnly:true,limit:500});
  assert(published.total>0&&published.total<=1912);
  assert(published.items.every(x=>x.item.catalog!==null));
  const subset=reader.searchResults({text:'40001082'});
  assert(subset.items.some(x=>x.itemId==='40001082'));
  const outside=all.find(x=>x.item.catalog===null);
  if(outside)assert.equal(outside.item.catalogStatus,'outside_published_item_scope');
  assert(Object.isFrozen(published)&&Object.isFrozen(published.items));
  assert.throws(()=>reader.searchResults({kind:'shop'}),/INVALID_KIND/);
  assert.throws(()=>reader.searchResults({publishedOnly:false}),/INVALID_PUBLISHED_FILTER/);
  assert.throws(()=>reader.searchResults({locale:'ko'}),/INVALID_LOCALE/);
  assert.throws(()=>reader.searchResults({limit:0}),/INVALID_PAGE/);
  assert.throws(()=>reader.searchResults({offset:-1}),/INVALID_PAGE/);
  assert.throws(()=>reader.getResult('040001082'),/invalid numeric Item ID/);
});

test('DB-00 rejects fabricated native recipe readers; DB-02 refuses corrupted optional bytes',async()=>{
  const app=await shared();
  const upstream=await app.acquisition.loadNativeRecipeResults();
  assert.throws(()=>createDb00NativeRecipeReader(app.database,app.joined,{
    ...upstream,coverage:{...upstream.coverage}
  }),/PINNED_DB02_RECIPE_SOURCE_REQUIRED/);
  const {calls,read}=fetcher(true);
  const fresh=await openPublicSharedGameSources('/Wand',read);
  await assert.rejects(fresh.loadNativeRecipeSources(),
    /DB02_NATIVE_RECIPE_SHA/);
  assert.equal(calls.filter(x=>x.endsWith('/'+RECIPE)).length,1);
  assert.equal(fresh.database.itemCount,13202);
});
