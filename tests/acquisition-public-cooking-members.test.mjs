import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_PUBLIC_COOKING_MEMBERS_FILE,
  DB02_PUBLIC_COOKING_MEMBERS_SHA,DB02_PUBLIC_COOKING_MEMBERS_BYTES,
  loadPinnedNativeCookingMembers,hasPinnedNativeCookingMemberEvidence,
  joinNativeRecipeCookingMembers
} from '../src/lib/acquisition/public-cooking-members.ts';
import {loadPinnedNativeRecipeResults}
  from '../src/lib/acquisition/public-native-recipes.ts';

const path=new URL('../static/acquisition/public/',import.meta.url);
const source=readFileSync(new URL(DB02_PUBLIC_COOKING_MEMBERS_FILE,path));
const recipeSource=readFileSync(new URL('recipe-results-1.26.2.json',path));
function localFetch(options={}){
  const seen=[];
  const fetcher=async url=>{
    seen.push(url);
    assert(url.startsWith('/Wand/acquisition/public/'));
    if(options.missing)return new Response('missing',{status:404});
    const name=url.split('/').at(-1);
    const bytes=name===DB02_PUBLIC_COOKING_MEMBERS_FILE?
      Buffer.from(source):name==='recipe-results-1.26.2.json'?
      Buffer.from(recipeSource):null;
    assert(bytes,'unexpected public asset '+url);
    if(options.corrupt&&name===DB02_PUBLIC_COOKING_MEMBERS_FILE)bytes[100]^=1;
    if(options.short&&name===DB02_PUBLIC_COOKING_MEMBERS_FILE)
      return new Response(bytes.subarray(0,-1),{status:200});
    return new Response(bytes,{status:200});
  };
  return {seen,fetcher};
}
test('469 original cooking members and all 13 recipe-used selectors are source SHA-pinned',async()=>{
  assert.equal(source.length,DB02_PUBLIC_COOKING_MEMBERS_BYTES);
  assert.equal(createHash('sha256').update(source).digest('hex'),
    DB02_PUBLIC_COOKING_MEMBERS_SHA);
  const parsed=JSON.parse(source);
  assert.equal(parsed.source.activityItemSha256,
    '4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2');
  assert.equal(parsed.source.activityDataSha256,
    '2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296');
  const {seen,fetcher}=localFetch();
  const index=await loadPinnedNativeCookingMembers('/Wand',fetcher);
  assert.equal(seen.length,1);
  const c=index.coverage;
  assert.equal(c.sourceActivityItemDefinitions,4050);
  assert.equal(c.observedCookingMembers,469);
  assert.equal(c.observedCropItems,165);
  assert.equal(c.observedFishItems,103);
  assert.equal(c.observedIngredientItems,201);
  assert.equal(c.observedTypeIds,13);
  assert.equal(c.observedTagIds,21);
  assert.equal(c.observedTypeMemberships,469);
  assert.equal(c.observedTagMemberships,580);
  assert.equal(c.recipeSelectorUses,238);
  assert.equal(c.recipeSelectorIdsReferenced,13);
  assert.equal(c.recipeSelectorIdsWithObservedMembers,13);
  assert.equal(c.recipeSelectorIdsWithoutObservedMembers,0);
  assert.equal(c.runtimeIngredientEligibilityVerified,false);
  assert.equal(c.allCookingItemClassesCovered,false);
  assert.equal(c.playerOwnershipVerified,false);
  assert.equal(c.liveAvailabilityVerified,false);
  assert.equal(index.members.length,469);
  assert.equal(new Set(index.members.map(x=>x.itemId)).size,469);
  assert.equal(index.recipeReferencedSelectors.length,13);
  assert.equal(index.getObservedSelectorIds('cooking_ingredient_type').length,13);
  assert.equal(index.getObservedSelectorIds('item_tag').length,21);
  assert.equal(index.getObservedSelectorIds().length,34);
  for(const selector of index.recipeReferencedSelectors)
    assert(index.getSelectorCandidates(selector).length>0);
  assert(hasPinnedNativeCookingMemberEvidence(index));
  assert(!hasPinnedNativeCookingMemberEvidence({...index}));
  assert(Object.isFrozen(index)&&Object.isFrozen(index.members)&&
    Object.isFrozen(index.coverage)&&Object.isFrozen(index.recipeReferencedSelectors));
});
test('source CookingIngredientType and IHasTags are distinct, with class-specific original field pins',async()=>{
  const index=await loadPinnedNativeCookingMembers('/Wand',localFetch().fetcher);
  const crop=index.getItemMember('30200000');
  assert(crop);
  assert.equal(crop.nativeClass,'CropItemData');
  assert.equal(crop.cookingIngredientTypeId,'2001400014');
  assert.deepEqual(crop.tagIds,['2001200014','2001200019','2001200028']);
  assert.equal(crop.originalClassFieldNumber,11);
  assert.equal(crop.originalTagFieldNumber,30);
  assert.equal(crop.sourceObservedOnly,true);
  assert.equal(crop.playerOwnershipVerified,false);
  assert(Object.isFrozen(crop)&&Object.isFrozen(crop.tagIds));
  assert.equal(index.getItemMember(31000000)?.originalClassFieldNumber,10);
  assert.equal(index.getItemMember(31000000)?.originalTagFieldNumber,14);
  assert.equal(index.getItemMember(31100000)?.originalClassFieldNumber,8);
  assert.equal(index.getItemMember(31100000)?.originalTagFieldNumber,13);
  const type=index.getSelectorCandidates(2001400014);
  assert.equal(type.length,44);
  assert.equal(type[0].matchedBy,'cooking_ingredient_type');
  assert(type.some(x=>x.itemId==='30200000'));
  const tag=index.getSelectorCandidates(2001200019);
  assert.equal(tag.length,8);
  assert.equal(tag[0].matchedBy,'item_tag');
  assert(tag.some(x=>x.itemId==='30200000'));
  assert.equal(index.getSelectorCandidateItemIds(2001400014).length,44);
  assert.deepEqual(index.getSelectorCandidates('2001400099'),[]);
  assert.deepEqual(index.getSelectorCandidateItemIds('2001200999'),[]);
  assert.equal(index.getItemMember(99999999),null);
  assert(Object.isFrozen(type)&&Object.isFrozen(tag));
  assert(Object.isFrozen(index.getSelectorCandidateItemIds(2001400014)));
});
test('source-pinned original recipe crosswalk resolves all 238 selectors without silently choosing materials',async()=>{
  const {seen,fetcher}=localFetch();
  const [recipes,members]=await Promise.all([
    loadPinnedNativeRecipeResults('/Wand',fetcher),
    loadPinnedNativeCookingMembers('/Wand',fetcher)
  ]);
  assert.equal(seen.length,2);
  const joined=joinNativeRecipeCookingMembers(recipes,members);
  assert.equal(joined.schema,'wand.db02.native-cooking-recipe-resolver@1');
  assert.equal(joined.sourceRecipeDefinitions,1943);
  assert.equal(joined.recipeSelectorUses,238);
  assert.equal(joined.recipeSelectorIdsResolved,13);
  assert.equal(joined.playerInventoryVerified,false);
  const meal=joined.getRecipeIngredientOptions('2050000009');
  assert(meal);
  assert.equal(meal[0].originalIngredient.kind,'any_tag');
  assert.deepEqual(meal[0].selectorIds,['2001400000']);
  assert.equal(meal[0].resolution,'observed_native_selector_candidates');
  assert.equal(meal[0].candidateItemIds.length,55);
  assert.equal(meal[0].materialChoiceRequired,true);
  assert.equal(meal[0].ingredientAvailabilityVerified,false);
  assert.equal(meal[0].playerChoiceVerified,false);
  const tagAlternative=joined.getRecipeIngredientOptions('2050000138');
  assert(tagAlternative);
  assert.deepEqual(tagAlternative[0].selectorIds,['2001200019']);
  assert.equal(tagAlternative[0].candidateItemIds.length,8);
  assert.equal(tagAlternative[0].originalIngredient.kind,'tag_alternatives');
  const craft=joined.getRecipeIngredientOptions(2050300000);
  assert(craft);
  assert.deepEqual(craft.map(x=>x.candidateItemIds),[
    ['31700009'],['31700006'],['31600009']
  ]);
  assert(craft.every(x=>x.resolution==='explicit_item'&&
    x.materialChoiceRequired===false));
  assert(joined.getItemRecipeUses('31700009').some(x=>
    x.recipeId==='2050300000'&&x.ingredientIndex===0&&
    x.match==='fixed_recipe_item'&&x.candidateOnly===false));
  const candidateUses=joined.getItemRecipeUses('30200000');
  assert(candidateUses.some(x=>x.match==='native_selector_candidate'&&
    x.candidateOnly===true&&x.matchedSelectorIds.length>0));
  assert(candidateUses.every(x=>x.ingredientAvailabilityVerified===false));
  assert(Object.isFrozen(joined));
  assert(Object.isFrozen(meal)&&Object.isFrozen(meal[0])&&
    Object.isFrozen(meal[0].candidateItemIds));
  assert(Object.isFrozen(candidateUses)&&
    Object.isFrozen(candidateUses[0].matchedSelectorIds));
  assert.deepEqual(joined.getItemRecipeUses('99999999'),[]);
  assert.equal(joined.getRecipeIngredientOptions('2050999999'),null);
  assert.equal(joined.getRecipeIngredientOption(2050000009,99),null);
});
test('tampering, malformed selectors and unverified join objects fail closed',async()=>{
  await assert.rejects(loadPinnedNativeCookingMembers(
    '/Wand',localFetch({corrupt:true}).fetcher),/DB02_PUBLIC_COOKING_SHA/);
  await assert.rejects(loadPinnedNativeCookingMembers(
    '/Wand',localFetch({short:true}).fetcher),/DB02_PUBLIC_COOKING_BYTES/);
  await assert.rejects(loadPinnedNativeCookingMembers(
    '/Wand',localFetch({missing:true}).fetcher),/DB02_PUBLIC_COOKING_DOWNLOAD_FAILED/);
  await assert.rejects(loadPinnedNativeCookingMembers(
    '/Wand/../src',localFetch().fetcher),/DB02_PUBLIC_COOKING_INVALID_BASE_PATH/);
  const members=await loadPinnedNativeCookingMembers('/Wand',localFetch().fetcher);
  assert.throws(()=>members.getSelectorCandidates('31700009'),/INVALID_SELECTOR_ID/);
  assert.throws(()=>members.getSelectorCandidates('02001400014'),/INVALID_ITEM_ID/);
  assert.throws(()=>members.getObservedSelectorIds('premium_shop'),/INVALID_SELECTOR_KIND/);
  assert.throws(()=>members.getItemMember('-3'),/INVALID_ITEM_ID/);
  const recipes=await loadPinnedNativeRecipeResults('/Wand',localFetch().fetcher);
  assert.throws(()=>joinNativeRecipeCookingMembers(recipes,{...members}),
    /PINNED_RECIPE_AND_MEMBER_REQUIRED/);
  const joined=joinNativeRecipeCookingMembers(recipes,members);
  assert.throws(()=>joined.getRecipeIngredientOption(2050000009,-1),/INVALID_SLOT/);
});
