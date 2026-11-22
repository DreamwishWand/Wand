import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcquisitionDatabase} from '../src/lib/acquisition/index.mjs';
import {buildNativeRecipeBasketRequest}
  from '../src/lib/acquisition/recipe-basket-request.ts';

const item=(itemId,quantity=1)=>({kind:'item',itemId,quantity});
const recipe=(recipeId,resultItemId,ingredients,resultQuantity=1,type='crafting')=>
  ({recipeId,resultItemId,ingredients,resultQuantity,type,conditionDigest:null});
function fixture(recipes){
  const made=new Map(),used=new Map();
  for(const r of recipes){
    const output=made.get(r.resultItemId)??[];
    made.set(r.resultItemId,[...output,r.recipeId]);
    for(const part of r.ingredients)if(part.kind==='item'){
      const inputs=used.get(part.itemId)??[];
      used.set(part.itemId,[...inputs,r.recipeId]);
    }
  }
  const ids=new Set([...made.keys(),...used.keys()]);
  const db=createAcquisitionDatabase({
    manifest:{schema:'wand.src02@1',platform:'Steam',gameVersion:'1.26.2'},
    recipes,
    acquisitions:[{pathId:'mining:1',itemId:301,type:'mining'}],
    relatedItems:[...ids,301].filter((id,i,values)=>values.indexOf(id)===i).map(itemId=>({
      itemId,inSrc01:true,recipesProducedBy:made.get(itemId)??[],
      recipesUsedBy:used.get(itemId)??[],
      acquisitionPaths:itemId===301?['mining:1']:[],growPathsForSeed:[]
    }))
  });
  const membership={2001400001:[{itemId:301},{itemId:302}]};
  return Object.freeze({
    contract:'wand.src02.private-browser-bundle@1',
    manifestSha256:'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c',
    privateSource:true,publishable:false,verified:true,provenanceMatched:true,
    currentShopOffersVerified:false,saveWritingAuthorized:false,
    source:{platform:'Steam',gameVersion:'1.26.2'},
    getRecipe:db.getRecipe,getItem:db.getItem,
    getPossibleStallsForItem:db.getPossibleStallsForItem,
    getIngredientSelectorCandidates:id=>membership[id]??[]
  });
}
test('typed Rust request closes nested source recipe graph before Worker transfer',()=>{
  const bundle=fixture([
    recipe(11,101,[item(201,3),item(202)]),
    recipe(12,102,[item(201,2),item(203,2)]),
    recipe(13,201,[item(301,2)],4)
  ]);
  const req=buildNativeRecipeBasketRequest(bundle,
    [{recipeId:12,batches:2},{recipeId:11}],{inventory:{301:3}});
  assert.equal(req.schema,'wand.db02.recipe-basket-request@1');
  assert.deepEqual(req.recipes.map(x=>x.recipeId),[11,12,13]);
  assert.deepEqual(req.goals,[{recipeId:12,batches:2},{recipeId:11,batches:1}]);
  assert.equal(req.options.inventory['301'],3);
  assert.equal(req.acquisitionPaths['301'][0].type,'mining');
  assert.equal(req.possibleStalls['301'].length,0);
  assert.equal(req.ingredientMembershipScope,'three_observed_cooking_native_classes');
  assert.equal(Object.hasOwn(req,'actualSalePrice'),false);
});
test('explicit native selector candidates are source-joined and never auto-selected',()=>{
  const bundle=fixture([
    recipe(21,121,[{kind:'anyTag',tagId:2001400001,quantity:3}],null,'cooking')
  ]);
  const req=buildNativeRecipeBasketRequest(bundle,[{recipeId:21,batches:2}],
    {ingredientChoices:{'21:0':301}});
  assert.deepEqual(req.selectorCandidates['2001400001'],[{itemId:301},{itemId:302}]);
  assert.equal(req.recipes[0].ingredients[0].kind,'anyTag');
  assert.equal(req.options.ingredientChoices['21:0'],301);
  assert.equal(req.recipes[0].resultQuantity,null);
});
test('private source authentication claim and malformed goals fail closed',()=>{
  const bundle=fixture([recipe(11,101,[item(201)])]);
  assert.throws(()=>buildNativeRecipeBasketRequest(
    {...bundle,verified:false},[{recipeId:11}]),/UNVERIFIED_PRIVATE_SOURCE/);
  assert.throws(()=>buildNativeRecipeBasketRequest(
    bundle,[{recipeId:0}]),/INVALID_ID/);
  assert.throws(()=>buildNativeRecipeBasketRequest(
    bundle,[{recipeId:11,batches:0}]),/INVALID_QUANTITY/);
  assert.throws(()=>buildNativeRecipeBasketRequest(
    bundle,[{recipeId:11}],{inventory:{'0201':1}}),/NON_CANONICAL|INVALID_ID/);
  assert.throws(()=>buildNativeRecipeBasketRequest(
    bundle,[{recipeId:11}],{ingredientChoices:{'11:1000':201}}),/INVALID_CHOICE_SLOT/);
});
