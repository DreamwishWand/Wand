/**
 * Only builds a bounded source graph from the SHA-authenticated private r5
 * bundle. Recipe execution, inventory maths, selector choices, cycle and
 * surplus handling belong exclusively to Rust/WASM.
 *
 * No private source rows are loaded, logged, persisted or published here.
 */
import type {PrivateSrc02BrowserBundle} from './private-browser-bundle.mjs';

export type PositiveId = number;
export type RecipeBasketGoal = Readonly<{recipeId:number|string;batches?:number}>;
export interface RecipeBasketOptions {
  readonly inventory?: Readonly<Record<string,number>>;
  readonly recipeChoices?: Readonly<Record<string,number>>;
  readonly ingredientChoices?: Readonly<Record<string,number>>;
  readonly expandSingleRecipe?: boolean;
  readonly maxDepth?: number;
}

export interface NativeRecipeBasketRequest {
  readonly schema:'wand.db02.recipe-basket-request@1';
  readonly source:{readonly platform:'Steam';readonly gameVersion:'1.26.2'};
  readonly goals:ReadonlyArray<{recipeId:number;batches:number}>;
  readonly recipes:ReadonlyArray<{
    recipeId:number;resultItemId:number;type:'crafting'|'cooking';
    resultQuantity:number|null;conditionDigest:string|null;
    ingredients:ReadonlyArray<Record<string,unknown>>;
  }>;
  readonly selectorCandidates:Readonly<Record<string,ReadonlyArray<{itemId:number}>>>;
  readonly acquisitionPaths:Readonly<Record<string,readonly unknown[]>>;
  readonly possibleStalls:Readonly<Record<string,readonly unknown[]>>;
  readonly ingredientMembershipScope:'three_observed_cooking_native_classes';
  readonly options:{
    readonly inventory:Readonly<Record<string,number>>;
    readonly recipeChoices:Readonly<Record<string,number>>;
    readonly ingredientChoices:Readonly<Record<string,number>>;
    readonly expandSingleRecipe:boolean;
    readonly maxDepth:number;
  };
}
const MAX_RECIPES=8192;
const MAX_ITEMS=20000;
const MAX_CANDIDATES=4096;
const MAX_GOALS=200;
const MAX_INPUT_BYTES=16*1024*1024;
const R5='ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c';
const isRecord=(x:unknown):x is Record<string,unknown> =>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const invalid=(code:string):never=>{throw new TypeError('DB02_RUST_SOURCE_'+code);};
function id(value:unknown):number{
  const num=typeof value==='string'&&/^[1-9][0-9]*$/.test(value)
    ? Number(value):value;
  if(typeof num!=='number'||!Number.isSafeInteger(num)||num<=0)
    return invalid('INVALID_ID');
  return num;
}
function safeCount(value:unknown,nonzero:boolean):number{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||
      value<0||(nonzero&&value===0))return invalid('INVALID_QUANTITY');
  return value;
}
function keyedQuantities(value:unknown,nonzero:boolean):Record<string,number>{
  if(value===undefined)return {};
  if(!isRecord(value))return invalid('INVALID_MAP');
  const result:Record<string,number>=Object.create(null);
  for(const [key,n] of Object.entries(value)){
    const parsed=id(key);
    if(String(parsed)!==key)return invalid('NON_CANONICAL_MAP_KEY');
    result[key]=safeCount(n,nonzero);
  }
  return result;
}
function normalizeOptions(value:RecipeBasketOptions|undefined){
  if(value!==undefined&&!isRecord(value))return invalid('INVALID_OPTIONS');
  const options=value??{};
  const expand=options.expandSingleRecipe??true;
  const depth=options.maxDepth??12;
  if(typeof expand!=='boolean'||typeof depth!=='number'||!Number.isInteger(depth)||depth<0||depth>24)
    return invalid('INVALID_OPTIONS');
  const ingredients:Record<string,number>=Object.create(null);
  if(options.ingredientChoices!==undefined){
    if(!isRecord(options.ingredientChoices))return invalid('INVALID_CHOICES');
    for(const [key,target] of Object.entries(options.ingredientChoices)){
      const parts=key.split(':');
      if(parts.length!==2||String(id(parts[0]))!==parts[0]||
          !/^(?:0|[1-9][0-9]*)$/.test(parts[1])||Number(parts[1])>127)
        return invalid('INVALID_CHOICE_SLOT');
      ingredients[key]=id(target);
    }
  }
  return {
    inventory:keyedQuantities(options.inventory,false),
    recipeChoices:keyedQuantities(options.recipeChoices,true),
    ingredientChoices:ingredients,
    expandSingleRecipe:expand,maxDepth:depth
  };
}
function normalizedIngredient(raw:unknown):Record<string,unknown>{
  if(!isRecord(raw))return invalid('INGREDIENT_TYPE');
  const quantity=safeCount(raw.quantity,true);
  switch(raw.kind){
    case 'item':return {kind:'item',itemId:id(raw.itemId),quantity};
    case 'anyTag':return {kind:'anyTag',tagId:id(raw.tagId),quantity};
    case 'tagAlternatives':{
      if(!Array.isArray(raw.tagIds)||!raw.tagIds.length)
        return invalid('TAG_SELECTOR_EMPTY');
      return {kind:'tagAlternatives',tagIds:raw.tagIds.map(id),quantity};
    }
    case 'itemAlternatives':{
      if(!Array.isArray(raw.itemIds)||!raw.itemIds.length)
        return invalid('ITEM_SELECTOR_EMPTY');
      return {kind:'itemAlternatives',itemIds:raw.itemIds.map(id),quantity};
    }
    default:return invalid('INGREDIENT_KIND');
  }
}

/** Runs strictly in a short-lived Worker on source previously verified by loader. */
export function buildNativeRecipeBasketRequest(
  bundle:PrivateSrc02BrowserBundle,goals:readonly RecipeBasketGoal[],
  options?:RecipeBasketOptions
):NativeRecipeBasketRequest{
  if(!bundle||bundle.contract!=='wand.src02.private-browser-bundle@1'||
      bundle.privateSource!==true||bundle.publishable!==false||
      bundle.verified!==true||bundle.provenanceMatched!==true||
      bundle.manifestSha256!==R5||
      bundle.source.platform!=='Steam'||bundle.source.gameVersion!=='1.26.2'||
      bundle.currentShopOffersVerified!==false||
      bundle.saveWritingAuthorized!==false)
    return invalid('UNVERIFIED_PRIVATE_SOURCE');
  if(!Array.isArray(goals)||goals.length<1||goals.length>MAX_GOALS)
    return invalid('GOAL_LIMIT');
  const normalizedGoals=goals.map(goal=>{
    if(!isRecord(goal))return invalid('GOAL_SHAPE');
    if(Object.keys(goal).some(k=>k!=='recipeId'&&k!=='batches'))
      return invalid('GOAL_FIELDS');
    const batches=safeCount(goal.batches??1,true);
    if(batches>1_000_000)return invalid('BATCH_LIMIT');
    return {recipeId:id(goal.recipeId),batches};
  });
  const normalized=normalizeOptions(options);
  const recipes=new Map<number,NativeRecipeBasketRequest['recipes'][number]>();
  const visitedItems=new Set<number>();
  const selectorCandidates:Record<string,Array<{itemId:number}>>=Object.create(null);
  const acquisitionPaths:Record<string,readonly unknown[]>=Object.create(null);
  const possibleStalls:Record<string,readonly unknown[]>=Object.create(null);

  function visitItem(itemId:number):void{
    if(visitedItems.has(itemId))return;
    if(visitedItems.size>=MAX_ITEMS)return invalid('ITEM_GRAPH_TOO_LARGE');
    visitedItems.add(itemId);
    const record=bundle.getItem(itemId);
    const row=isRecord(record)?record:{};
    const paths=row.acquisitionPaths;
    acquisitionPaths[String(itemId)]=Array.isArray(paths)?paths:[];
    const stalls=bundle.getPossibleStallsForItem(itemId);
    possibleStalls[String(itemId)]=Array.isArray(stalls)?stalls:[];
    const madeBy=row.madeBy;
    if(!Array.isArray(madeBy))return;
    for(const recipe of madeBy){
      if(!isRecord(recipe)||recipe.type!=='crafting')continue;
      visitRecipe(id(recipe.recipeId));
    }
  }
  function visitSelector(selectorId:number):void{
    const key=String(selectorId);
    if(Object.hasOwn(selectorCandidates,key))return;
    if(Object.keys(selectorCandidates).length>=4096)
      return invalid('SELECTOR_LIMIT');
    const source=bundle.getIngredientSelectorCandidates(selectorId);
    if(!Array.isArray(source)||source.length>MAX_CANDIDATES)
      return invalid('SELECTOR_MEMBERS_INVALID');
    const members=new Set<number>();
    for(const member of source){
      if(!isRecord(member))return invalid('SELECTOR_MEMBER_SHAPE');
      members.add(id(member.itemId));
    }
    selectorCandidates[key]=[...members].sort((a,b)=>a-b).map(itemId=>({itemId}));
    for(const member of selectorCandidates[key])visitItem(member.itemId);
  }
  function visitRecipe(recipeId:number):void{
    if(recipes.has(recipeId))return;
    if(recipes.size>=MAX_RECIPES)return invalid('RECIPE_GRAPH_TOO_LARGE');
    const raw=bundle.getRecipe(recipeId);
    if(!isRecord(raw)||!['cooking','crafting'].includes(String(raw.type))||
        !Array.isArray(raw.ingredients)||raw.ingredients.length<1||
        raw.ingredients.length>128)
      return invalid('RECIPE_UNRESOLVED');
    if(id(raw.recipeId)!==recipeId)return invalid('RECIPE_ID_MISMATCH');
    const ingredients=raw.ingredients.map(normalizedIngredient);
    const resultItemId=id(raw.resultItemId);
    const qty=raw.resultQuantity==null?null:safeCount(raw.resultQuantity,true);
    const digest=raw.conditionDigest==null?null:
      typeof raw.conditionDigest==='string'?raw.conditionDigest:
        invalid('CONDITION_DIGEST');
    const normalizedRecipe={
      recipeId,resultItemId,
      type:raw.type as 'crafting'|'cooking',
      resultQuantity:qty,conditionDigest:digest,ingredients
    };
    recipes.set(recipeId,normalizedRecipe); // before traversal: cycles terminate
    for(const ingredient of ingredients){
      if(ingredient.kind==='item')visitItem(ingredient.itemId as number);
      else if(ingredient.kind==='anyTag')
        visitSelector(ingredient.tagId as number);
      else if(ingredient.kind==='tagAlternatives'){
        for(const tag of ingredient.tagIds as number[])visitSelector(tag);
      }else if(ingredient.kind==='itemAlternatives'){
        for(const candidate of ingredient.itemIds as number[])visitItem(candidate);
      }
    }
  }
  for(const goal of normalizedGoals)visitRecipe(goal.recipeId);
  const request:NativeRecipeBasketRequest={
    schema:'wand.db02.recipe-basket-request@1',
    source:{platform:'Steam',gameVersion:'1.26.2'},
    goals:normalizedGoals,
    recipes:[...recipes.values()].sort((a,b)=>a.recipeId-b.recipeId),
    selectorCandidates,acquisitionPaths,possibleStalls,
    ingredientMembershipScope:'three_observed_cooking_native_classes',
    options:normalized
  };
  if(new TextEncoder().encode(JSON.stringify(request)).length>MAX_INPUT_BYTES)
    return invalid('PLAN_SOURCE_TOO_LARGE');
  return request;
}
