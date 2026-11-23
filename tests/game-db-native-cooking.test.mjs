import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DB00_COOKING_INGREDIENT_CONTRACT,
  createDb00CookingIngredientReader
} from '../src/lib/game-db/native-cooking.ts';
import {openPublicSharedGameSources}
  from '../src/lib/game-db/public-sources.ts';
const ROOT=new URL('../static/',import.meta.url);
const COOKING='cooking-members-1.26.2.json';
const RECIPE='recipe-results-1.26.2.json';
function source({corrupt=false,missing=false}={}){
  const urls=[];
  const fetcher=async url=>{
    assert(typeof url==='string'&&url.startsWith('/Wand/')&&!url.includes('..'));
    urls.push(url);
    if(missing&&url.endsWith('/'+COOKING))
      return new Response('missing',{status:404});
    let data;
    try{data=readFileSync(new URL(url.slice(6),ROOT));}
    catch{return new Response('missing',{status:404});}
    if(corrupt&&url.endsWith('/'+COOKING)){
      data=Buffer.from(data);data[42]^=1;
    }
    return new Response(data,{status:200});
  };
  return {urls,fetcher};
}
let memo;
function open(){
  return memo??=openPublicSharedGameSources('/Wand',source().fetcher);
}

test('DB-00 loads SHA-pinned 469 observed cooking members and 238 recipe selector uses on demand',async()=>{
  const {urls,fetcher}=source();
  const app=await openPublicSharedGameSources('/Wand',fetcher);
  const startup=urls.length;
  assert(startup>0);
  assert(!urls.some(x=>x.endsWith('/'+COOKING)||x.endsWith('/'+RECIPE)));
  const reader=await app.loadNativeCookingIngredientSources();
  assert.equal(reader,await app.loadNativeCookingIngredientSources());
  assert.equal(reader.contract,DB00_COOKING_INGREDIENT_CONTRACT);
  assert.equal(reader.snapshotId,app.snapshotId);
  assert.equal(reader.observedMemberIds,469);
  assert.equal(reader.originalRecipeSelectorUses,238);
  assert.equal(reader.recipeReferencedSelectorIds,13);
  assert.deepEqual(reader.observedClasses,
    ['CropItemData','FishItemData','IngredientItemData']);
  assert.equal(reader.playerInventoryVerified,false);
  assert.equal(reader.runtimeIngredientEligibilityVerified,false);
  assert.equal(urls.length,startup+2);
  assert.equal(urls.filter(x=>x.endsWith('/'+COOKING)).length,1);
  assert.equal(urls.filter(x=>x.endsWith('/'+RECIPE)).length,1);
  assert.equal(await app.loadNativeRecipeSources() instanceof Object,true);
  assert.equal(urls.length,startup+2);
  assert.equal(app.acquisition.coverage.combinedSourceRoutes,1255);
  assert(Object.isFrozen(reader));
});

test('paginate all 469 original crop/fish/ingredient classes without asserting inventory or live eligibility',async()=>{
  const app=await open();
  const reader=await app.loadNativeCookingIngredientSources();
  const db02=await app.acquisition.loadNativeCookingMembers();
  const rows=[];
  for(let offset=0;;){
    const page=reader.pageMembers({offset,limit:57});
    assert.equal(page.scope,'three_original_cooking_item_classes_only');
    assert.equal(page.total,469);
    assert.equal(page.runtimeIngredientEligibilityVerified,false);
    rows.push(...page.items);
    if(page.nextOffset===null)break;
    assert(page.nextOffset>offset);
    offset=page.nextOffset;
  }
  assert.equal(rows.length,469);
  assert.deepEqual(rows.map(r=>r.itemId),
    db02.members.map(r=>r.itemId));
  assert.equal(rows.filter(r=>r.nativeMember?.nativeClass==='CropItemData').length,165);
  assert.equal(rows.filter(r=>r.nativeMember?.nativeClass==='FishItemData').length,103);
  assert.equal(rows.filter(r=>r.nativeMember?.nativeClass==='IngredientItemData').length,201);
  for(const row of rows){
    assert.deepEqual(row.item,app.getItem(row.itemId));
    assert.equal(row.nativeMember?.itemId,row.itemId);
    assert.equal(row.originalSourceObservationOnly,true);
    assert.equal(row.runtimeIngredientEligibilityVerified,false);
    assert.equal(row.playerOwnershipVerified,false);
    assert.equal(row.collectionUiMembershipVerified,false);
    assert(Object.isFrozen(row));
  }
  assert.equal(reader.getMember('999999999').nativeMember,null);
  assert.deepEqual(reader.pageMembers({offset:469,limit:100}).items,[]);
  assert.throws(()=>reader.pageMembers({limit:501}),/INVALID_PAGE/);
  assert.throws(()=>reader.pageMembers({offset:-1}),/INVALID_PAGE/);
  assert.throws(()=>reader.getMember('000123'),/invalid numeric Item ID/);
});

test('selectors preserve two original ID namespaces and exact source candidates',async()=>{
  const app=await open();
  const reader=await app.loadNativeCookingIngredientSources();
  const db02=await app.acquisition.loadNativeCookingMembers();
  const typeIds=reader.listObservedSelectors('cooking_ingredient_type');
  const tagIds=reader.listObservedSelectors('item_tag');
  assert.equal(typeIds.length,13);
  assert.equal(tagIds.length,21);
  assert(typeIds.every(id=>Number(id)>=2001400000&&Number(id)<2001500000));
  assert(tagIds.every(id=>Number(id)>=2001200000&&Number(id)<2001300000));
  assert.deepEqual(reader.listRecipeReferencedSelectors(),
    db02.recipeReferencedSelectors);
  for(const id of reader.listRecipeReferencedSelectors()){
    const actual=reader.getSelectorCandidates(id);
    const expected=db02.getSelectorCandidates(id);
    assert.equal(actual.length,expected.length);
    assert.deepEqual(actual.map(x=>x.originalSelectorCandidate),expected);
    assert(actual.length>0);
    for(const row of actual){
      assert.equal(row.ingredient.itemId,row.originalSelectorCandidate.itemId);
      assert.equal(row.ingredient.nativeMember?.sourceObservedOnly,true);
      assert.equal(row.originalSelectorCandidate.observedMembershipOnly,true);
      assert.equal(row.observedMembershipOnly,true);
      assert.equal(row.playerInventoryVerified,false);
    }
  }
  assert.throws(()=>reader.getSelectorCandidates(90000000),
    /INVALID_SELECTOR_ID/);
});

test('a cooking recipe resolves exact candidate Item IDs and individual source ingredient selection rules',async()=>{
  const app=await open();
  const reader=await app.loadNativeCookingIngredientSources();
  const recipeIndex=await app.acquisition.loadNativeRecipeResults();
  const native=await app.acquisition.loadCookingRecipeResolver();
  const raw=recipeIndex.recipes.find(recipe=>
    recipe.kind==='cooking'&&
    native.getRecipeIngredientOptions(recipe.recipeId)?.some(o=>
      o.selectorIds.length>0&&o.candidateItemIds.length>0));
  assert(raw);
  const selected=reader.getRecipe(raw.recipeId);
  assert(selected);
  assert.equal(selected.recipe,raw);
  assert.equal(selected.result.itemId,raw.resultItemId);
  assert.equal(selected.ingredients.length,raw.ingredients.length);
  assert.equal(selected.recipeUnlockedVerified,false);
  assert.equal(selected.playerCanCookVerified,false);
  assert.equal(selected.playerInventoryVerified,false);
  assert.equal(selected.originalRecipeAndMembersOnly,true);
  const original=native.getRecipeIngredientOptions(raw.recipeId);
  assert(original);
  for(let i=0;i<original.length;i++){
    const wanted=original[i],actual=selected.ingredients[i];
    assert.deepEqual(actual.sourceOption,wanted);
    assert.deepEqual(actual.candidates.map(x=>x.itemId),wanted.candidateItemIds);
    assert.equal(actual.candidateCount,wanted.candidateItemIds.length);
    assert.equal(actual.playerChoiceVerified,false);
    assert.equal(actual.runtimeIngredientEligibilityVerified,false);
    assert(Object.isFrozen(actual));
  }
  const crafting=recipeIndex.recipes.find(r=>r.kind==='crafting');
  assert(crafting);
  assert.equal(reader.getRecipe(crafting.recipeId),null);
  assert.equal(reader.getRecipe('999999999'),null);
});

test('reverse cooking ingredient uses distinguish candidate alternatives from guaranteed requirements',async()=>{
  const app=await open();
  const reader=await app.loadNativeCookingIngredientSources();
  const native=await app.acquisition.loadCookingRecipeResolver();
  const recipes=await app.acquisition.loadNativeRecipeResults();
  const m=await app.acquisition.loadNativeCookingMembers();
  const member=m.members.find(row=>
    native.getItemRecipeUses(row.itemId).some(use=>
      recipes.getRecipe(use.recipeId)?.kind==='cooking'));
  assert(member);
  const uses=reader.getItemRecipeUses(member.itemId);
  assert(uses.length>0);
  assert(uses.every(u=>recipes.getRecipe(u.originalUse.recipeId)?.kind==='cooking'));
  for(const use of uses){
    assert.equal(use.recipeResult.itemId,use.originalUse.resultItemId);
    assert.equal(use.candidateOnly,use.originalUse.candidateOnly);
    assert.equal(use.originalUse.ingredientAvailabilityVerified,false);
    assert.equal(use.originalUse.playerOwnershipVerified,false);
    assert.equal(use.playerInventoryVerified,false);
    assert(Object.isFrozen(use));
  }
  assert.deepEqual(reader.getItemRecipeUses('999999999'),[]);
});

test('forged cooking source and tampered optional projection fail closed',async()=>{
  const app=await open();
  const recipes=await app.acquisition.loadNativeRecipeResults();
  const members=await app.acquisition.loadNativeCookingMembers();
  assert.throws(()=>createDb00CookingIngredientReader(
    app.database,app.joined,recipes,
    {...members,coverage:{...members.coverage}}
  ),/PINNED_DB02_RECIPE_AND_MEMBERS_REQUIRED/);
  const corrupt=await openPublicSharedGameSources('/Wand',
    source({corrupt:true}).fetcher);
  await assert.rejects(corrupt.loadNativeCookingIngredientSources(),
    /DB02_PUBLIC_COOKING_SHA/);
  const missing=await openPublicSharedGameSources('/Wand',
    source({missing:true}).fetcher);
  await assert.rejects(missing.loadNativeCookingIngredientSources(),
    /DB02_PUBLIC_COOKING_DOWNLOAD_FAILED/);
  assert.equal(missing.database.itemCount,13202);
});
