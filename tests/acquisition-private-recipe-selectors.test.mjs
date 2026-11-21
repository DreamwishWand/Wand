import test from 'node:test';
import assert from 'node:assert/strict';
import {PRIVATE_SRC02_BROWSER_CONTRACT} from '../src/lib/acquisition/private-browser-bundle.mjs';
import {DB02_NATIVE_TAG_PARENT_SHA256} from '../src/lib/acquisition/native-tag-evidence.mjs';
import {DB02_TAG_LOCALES_CONTRACT,DB02_TAG_EVIDENCE_MANIFEST_SHA256} from '../src/lib/acquisition/native-tag-locales.mjs';
import {createPrivateRecipeSelectorView,DB02_PRIVATE_RECIPE_SELECTORS_CONTRACT,
  DB02_TAG_LOCALES_RELEASE_SHA256} from '../src/lib/acquisition/private-recipe-selectors.mjs';

const T=2001200001, U=2001200002, TYPE=2001400004;
const recipe=Object.freeze({recipeId:2050000001,ingredients:Object.freeze([
  {kind:'anyTag',tagId:T,quantity:2},
  {kind:'tagAlternatives',tagIds:[U,TYPE,T],quantity:1},
  {kind:'itemAlternatives',itemIds:[30200003,30200001],quantity:1},
  {kind:'item',itemId:30300001,quantity:1},
])});
const member=id=>Object.freeze({itemId:id,availabilityVerified:false});
const candidates=Object.freeze({[T]:Object.freeze([member(30200003),member(30200001)]),
  [U]:Object.freeze([member(30200002)]),[TYPE]:Object.freeze([member(30200003)])});
const acq=Object.freeze({contract:PRIVATE_SRC02_BROWSER_CONTRACT,verified:true,
  privateSource:true,publishable:false,currentAvailabilityVerified:false,
  manifestSha256:DB02_NATIVE_TAG_PARENT_SHA256,
  source:Object.freeze({platform:'Steam',gameVersion:'1.26.2'}),
  getRecipe(id){return id===recipe.recipeId?recipe:null;},
  getIngredientSelectorCandidates(id){return candidates[id]??[];}});
const tags=Object.freeze({contract:DB02_TAG_LOCALES_CONTRACT,verified:true,
  privateSource:true,publishable:false,platform:'Steam',gameVersion:'1.26.2',
  manifestSha256:DB02_TAG_LOCALES_RELEASE_SHA256,
  parentTagManifestSha256:DB02_TAG_EVIDENCE_MANIFEST_SHA256,
  getRecipeSelectorName(id,locale){return [T,TYPE].includes(id)?Object.freeze({tagId:id,locale,
    value:`${locale}-Synthetic${id===T?'Tag':'Type'}`,evidence:'steam1262_exact_tag_locbin'}):null;}});

test('exact private r5 and localized Tag evidence combine without claiming availability',()=>{
  const v=createPrivateRecipeSelectorView(acq,tags,'ja');
  assert.equal(v.contract,DB02_PRIVATE_RECIPE_SELECTORS_CONTRACT);
  assert.equal(v.publishable,false);assert.equal(v.currentAvailabilityVerified,false);
  const result=v.getRecipeIngredientChoices(recipe.recipeId);
  assert.equal(result.recipeEligibilityEvaluated,false);
  assert.equal(result.ingredients.length,4);
  const [first,second,alternatives,fixed]=result.ingredients;
  assert.equal(first.selectors[0].selectorKind,'native_tag');
  assert.equal(first.selectors[0].localizedName,'ja-SyntheticTag');
  assert.equal(first.selectors[0].localizationVerified,true);
  assert.deepEqual(first.candidateItemIds,[30200001,30200003]);
  assert.equal(second.selectors[0].localizationVerified,false);
  assert.equal(second.selectors[1].selectorKind,'cooking_ingredient_type');
  assert.equal(second.selectors[1].localizedName,'ja-SyntheticType');
  assert.equal(second.selectors[1].localizationVerified,true);
  assert.equal(second.selectors[2].localizedName,'ja-SyntheticTag');
  assert.deepEqual(second.candidateItemIds,[30200001,30200002,30200003]);
  assert.deepEqual(alternatives.candidateItemIds,[30200001,30200003]);
  assert.equal(alternatives.candidateCoverage,'source_explicit_item_ids');
  assert.equal(alternatives.selectionRequired,true);
  assert.deepEqual(fixed.candidateItemIds,[30300001]);
  assert.equal(fixed.selectionRequired,false);
  assert.ok(Object.isFrozen(first.selectors));
  assert.ok(Object.isFrozen(first.candidateItemIds));
  assert.throws(()=>{first.candidateItemIds[0]=10;},TypeError);
  assert.equal(v.getRecipeIngredientChoices(2050000002),null);
});

test('unverified, wrong-version or historical acquisition and Tag releases are rejected',()=>{
  for(const source of [
    {...acq,manifestSha256:'a'.repeat(64)},
    {...acq,source:{platform:'Steam',gameVersion:'1.26.1'}},
    {...acq,publishable:true},
    {...acq,currentAvailabilityVerified:true},
    {...acq,verified:false}
  ]) assert.throws(()=>createPrivateRecipeSelectorView(Object.freeze(source),tags,'en'),/UNVERIFIED_R5_SOURCE/);
  for(const names of [
    {...tags,manifestSha256:'a'.repeat(64)},
    {...tags,parentTagManifestSha256:'b'.repeat(64)},
    {...tags,gameVersion:'1.26.1'},
    {...tags,publishable:true}
  ]) assert.throws(()=>createPrivateRecipeSelectorView(acq,Object.freeze(names),'en'),/UNVERIFIED_TAG_LOCALES/);
  assert.throws(()=>createPrivateRecipeSelectorView(acq,tags,'ko'),/UNSUPPORTED_LOCALE/);
});

test('invalid selector IDs and forged translated name evidence fail closed',()=>{
  assert.throws(()=>createPrivateRecipeSelectorView(acq,tags,'en').getRecipeIngredientChoices(0),/INVALID_RECIPE_ID/);
  const badRecipe={...recipe,ingredients:[{kind:'anyTag',tagId:0}]};
  const badAcq=Object.freeze({...acq,getRecipe(){return badRecipe;}});
  assert.throws(()=>createPrivateRecipeSelectorView(badAcq,tags,'en').getRecipeIngredientChoices(recipe.recipeId),/INVALID_SELECTOR_IDS/);
  const forged=Object.freeze({...tags,getRecipeSelectorName(id,locale){return {tagId:id,locale,value:'Fake',evidence:'external_wiki'};}});
  assert.throws(()=>createPrivateRecipeSelectorView(acq,forged,'en').getRecipeIngredientChoices(recipe.recipeId),/INCONSISTENT_TAG_NAME/);
  const badMember=Object.freeze({...acq,getIngredientSelectorCandidates(){return [{itemId:123,availabilityVerified:true}];}});
  assert.throws(()=>createPrivateRecipeSelectorView(badMember,tags,'en').getRecipeIngredientChoices(recipe.recipeId),/UNVERIFIED_CANDIDATE/);
});
