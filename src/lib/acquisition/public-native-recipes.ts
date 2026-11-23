/**
 * DB-02 native v1.26.2 recipe result and ingredient dependency reader.
 *
 * Steam original ActivityData.json is byte-pinned in the offline extractor.
 * Only a compact, lossless projection of recipe relationships is public.
 * A recipe definition proves an Item result link, NOT a player unlock,
 * available materials, successful cooking/crafting or live conditions.
 */
import type {ItemOrigin,OriginProvenance} from './origins.ts';

export const DB02_NATIVE_RECIPE_SCHEMA='wand.db02.native-recipe-results@1' as const;
export const DB02_NATIVE_RECIPE_FILE='recipe-results-1.26.2.json' as const;
export const DB02_NATIVE_RECIPE_BYTES=150180 as const;
export const DB02_NATIVE_RECIPE_SHA256=
  'ee767b8808f9bef078234d978c3893b5a9649050c7ccf8ee460bd3a32ef02f0e' as const;
export const DB02_NATIVE_RECIPE_ORIGINAL_SHA256=
  '2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296' as const;

const SOURCE_FILE='ddv_Data/StreamingAssets/itemlist/ActivityData.json';
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const ID=/^[1-9][0-9]{0,15}$/;
const PINNED=new WeakSet<object>();
const EMPTY_RECIPES=Object.freeze([]) as readonly NativeRecipe[];
const EMPTY_ORIGINS=Object.freeze([]) as readonly ItemOrigin[];
const EMPTY_USES=Object.freeze([]) as readonly NativeRecipeIngredientUse[];
const EMPTY_IDS=Object.freeze([]) as readonly string[];
const WINDOW=Object.freeze({start:null,endExclusive:null});
const CONDITIONS=Object.freeze([
  'Source defines a recipe result; unlocks, ingredients and live conditions are not evaluated'
]);
const PROVENANCE:OriginProvenance=Object.freeze({
  sourceId:'src02:steam1262:activitydata:recipe-results',
  kind:'verified_game_native',
  sourceUrl:'/acquisition/public/'+DB02_NATIVE_RECIPE_FILE,
  checkedOn:'2026-11-23',gameVersion:'1.26.2',
  sha256:DB02_NATIVE_RECIPE_ORIGINAL_SHA256
});

export type NativeRecipeKind='cooking'|'crafting';
export type NativeRecipeIngredient=
  | Readonly<{kind:'item';itemId:string;quantity:number}>
  | Readonly<{kind:'any_tag';tagId:string;quantity:1}>
  | Readonly<{kind:'item_alternatives';itemIds:readonly string[];quantity:1}>
  | Readonly<{kind:'tag_alternatives';tagIds:readonly string[];quantity:1}>;

export interface NativeRecipe {
  readonly recipeId:string;
  readonly resultItemId:string;
  readonly kind:NativeRecipeKind;
  /** From CraftingRecipeItemData.Result.Amount; cooking source does not encode yield. */
  readonly resultQuantity:number|null;
  readonly ingredients:readonly NativeRecipeIngredient[];
  readonly recipeUnlockedVerified:false;
  readonly playerCanCraftVerified:false;
  readonly liveConditionsEvaluated:false;
}
export interface NativeRecipeIngredientUse {
  readonly recipeId:string;
  readonly resultItemId:string;
  readonly recipeKind:NativeRecipeKind;
  readonly ingredientIndex:number;
  readonly ingredientKind:NativeRecipeIngredient['kind'];
  /** Item or Tag alternatives are optional choices, NOT all mandatory. */
  readonly isAlternativeChoice:boolean;
}
export interface NativeRecipeIndex {
  readonly schema:typeof DB02_NATIVE_RECIPE_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly source:OriginProvenance;
  readonly coverage:Readonly<{
    sourceActivityDefinitions:2630;
    recipeDefinitions:1943;
    craftingRecipes:1318;
    cookingRecipes:625;
    distinctResultItemIds:1912;
    playerCanCraftVerified:false;
    recipeUnlockedVerified:false;
    cookingYieldKnown:false;
    liveConditionsEvaluated:false;
    allAcquisitionRoutesCovered:false;
  }>;
  readonly recipes:readonly NativeRecipe[];
  /** Native recipe ItemOrigin relations, not claims that a player can craft now. */
  readonly origins:readonly ItemOrigin[];
  getRecipe(recipeId:string|number):NativeRecipe|null;
  getResultRecipes(itemId:string|number):readonly NativeRecipe[];
  getResultOrigins(itemId:string|number):readonly ItemOrigin[];
  getIngredientItemUses(itemId:string|number):readonly NativeRecipeIngredientUse[];
  getIngredientTagUses(tagId:string|number):readonly NativeRecipeIngredientUse[];
  listResultItemIds(kind?:NativeRecipeKind):readonly string[];
  listRecipeIds(kind?:NativeRecipeKind):readonly string[];
}
function check(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('DB02_NATIVE_RECIPE_'+code);
}
function object(raw:unknown):raw is Record<string,unknown>{
  return raw!==null&&typeof raw==='object'&&!Array.isArray(raw);
}
function normalizedId(raw:unknown):string{
  const id=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof id==='string'&&ID.test(id)&&Number.isSafeInteger(Number(id)),
    'INVALID_ITEM_ID');
  return id;
}
function positive(raw:unknown):number{
  check(typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>0,
    'POSITIVE_NUMBER_REQUIRED');
  return raw;
}
function add<T>(map:Map<string,T[]>,key:string,item:T):void{
  const prev=map.get(key);
  if(prev)prev.push(item);
  else map.set(key,[item]);
}
function freezeArrays<T>(map:Map<string,T[]>):void{
  for(const arr of map.values())Object.freeze(arr);
}
function parseIngredient(raw:unknown,kind:NativeRecipeKind):NativeRecipeIngredient{
  check(Array.isArray(raw)&&raw.length>=2,'INVALID_INGREDIENT');
  const code=raw[0];
  if(code===0){
    check(raw.length===(kind==='crafting'?3:2),'INVALID_ITEM_INGREDIENT');
    const itemId=normalizedId(positive(raw[1]));
    const quantity=kind==='crafting'?positive(raw[2]):1;
    return Object.freeze({kind:'item' as const,itemId,quantity});
  }
  check(kind==='cooking','COOKING_SELECTOR_ONLY');
  if(code===1){
    check(raw.length===2,'INVALID_TAG_SELECTOR');
    return Object.freeze({kind:'any_tag' as const,
      tagId:normalizedId(positive(raw[1])),quantity:1 as const});
  }
  check((code===2||code===3)&&raw.length===2&&
    Array.isArray(raw[1])&&raw[1].length>0&&raw[1].length<=1000,
    'INVALID_ALTERNATIVES');
  let prev=0;
  const ids:string[]=[];
  for(const rawId of raw[1]){
    const n=positive(rawId);
    check(n>prev,'ALTERNATIVES_MUST_BE_SORTED_UNIQUE');
    ids.push(normalizedId(n));
    prev=n;
  }
  const frozen=Object.freeze(ids);
  return code===2?
    Object.freeze({kind:'item_alternatives' as const,itemIds:frozen,
      quantity:1 as const}):
    Object.freeze({kind:'tag_alternatives' as const,tagIds:frozen,
      quantity:1 as const});
}
function parse(raw:unknown):NativeRecipeIndex{
  check(object(raw)&&raw.schema===DB02_NATIVE_RECIPE_SCHEMA&&
    object(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&object(raw.source)&&
    raw.source.file===SOURCE_FILE&&
    raw.source.sha256===DB02_NATIVE_RECIPE_ORIGINAL_SHA256&&
    raw.source.bytes===260627&&object(raw.coverage)&&
    Array.isArray(raw.recipes)&&raw.recipes.length===1943&&
    object(raw.ingredientEncoding)&&
    JSON.stringify(raw.ingredientEncoding)==='{"0":"item","1":"any_tag","2":"item_alternatives","3":"tag_alternatives"}',
    'SOURCE_SCHEMA');
  const census=raw.coverage;
  check(census.sourceActivityDefinitions===2630&&
    census.recipeDefinitions===1943&&
    census.craftingRecipes===1318&&census.cookingRecipes===625&&
    census.distinctResultItemIds===1912&&
    census.playerCanCraftVerified===false&&
    census.recipeUnlockedVerified===false&&
    census.cookingYieldKnown===false&&
    census.liveConditionsEvaluated===false&&
    census.allAcquisitionRoutesCovered===false,'SOURCE_CENSUS');

  const recipes:NativeRecipe[]=[];
  const origins:ItemOrigin[]=[];
  const byRecipe=new Map<string,NativeRecipe>();
  const byResult=new Map<string,NativeRecipe[]>();
  const originsByResult=new Map<string,ItemOrigin[]>();
  const ingredientItemUses=new Map<string,NativeRecipeIngredientUse[]>();
  const ingredientTagUses=new Map<string,NativeRecipeIngredientUse[]>();
  const itemIds=new Set<string>();
  const cookingIds=new Set<string>();
  const craftingIds=new Set<string>();
  const kindRecipeIds:{cooking:string[];crafting:string[]}={cooking:[],crafting:[]};
  let cooking=0,crafting=0,previous=0;
  for(const tuple of raw.recipes){
    check(Array.isArray(tuple)&&tuple.length===5&&
      Array.isArray(tuple[4])&&tuple[4].length<=30,'RECIPE_TUPLE');
    const numericId=positive(tuple[0]);
    check(numericId>previous,'RECIPE_ORDER_OR_DUPLICATE');
    previous=numericId;
    const kind=tuple[1]===0?'cooking':tuple[1]===1?'crafting':null;
    check(kind!==null,'INVALID_KIND');
    check(kind==='cooking'?
      numericId>=2050000000&&numericId<2050100000:
      numericId>=2050300000&&numericId<2050400000,'NATIVE_RECIPE_ID');
    const recipeId=normalizedId(numericId);
    const resultItemId=normalizedId(positive(tuple[2]));
    const resultQuantity=kind==='crafting'?positive(tuple[3]):null;
    if(kind==='cooking')check(tuple[3]===null,'COOKING_YIELD_IS_NOT_ENCODED');
    const ingredients=Object.freeze(tuple[4].map(
      (value:unknown)=>parseIngredient(value,kind)
    ));
    const recipe:NativeRecipe=Object.freeze({
      recipeId,resultItemId,kind,resultQuantity,ingredients,
      recipeUnlockedVerified:false,playerCanCraftVerified:false,
      liveConditionsEvaluated:false
    });
    recipes.push(recipe);
    byRecipe.set(recipeId,recipe);
    add(byResult,resultItemId,recipe);
    const origin:ItemOrigin=Object.freeze({
      originId:'native:recipe:'+recipeId,itemId:resultItemId,
      kind,routeStatus:'confirmed_source_link',campaignId:null,
      name:(kind==='crafting'?'Crafting':'Cooking')+' recipe '+recipeId,
      productId:null,quantity:resultQuantity,price:null,
      accessTier:'not_applicable',window:WINDOW,salePeriods:Object.freeze([]),
      conditions:CONDITIONS,source:PROVENANCE,availability:'not_live_verified'
    });
    origins.push(origin);
    add(originsByResult,resultItemId,origin);
    itemIds.add(resultItemId);
    kind==='cooking'?
      (cooking++,cookingIds.add(resultItemId)):
      (crafting++,craftingIds.add(resultItemId));
    kindRecipeIds[kind].push(recipeId);
    ingredients.forEach((ingredient,ingredientIndex)=>{
      const usage:NativeRecipeIngredientUse=Object.freeze({
        recipeId,resultItemId,recipeKind:kind,ingredientIndex,
        ingredientKind:ingredient.kind,
        isAlternativeChoice:ingredient.kind.endsWith('_alternatives')
      });
      if(ingredient.kind==='item')
        add(ingredientItemUses,ingredient.itemId,usage);
      else if(ingredient.kind==='any_tag')
        add(ingredientTagUses,ingredient.tagId,usage);
      else if(ingredient.kind==='item_alternatives')
        for(const id of ingredient.itemIds)add(ingredientItemUses,id,usage);
      else
        for(const id of ingredient.tagIds)add(ingredientTagUses,id,usage);
    });
  }
  check(cooking===625&&crafting===1318&&itemIds.size===1912&&
    recipes.length===1943&&origins.length===1943,'RECIPE_TOTALS');
  for(const m of [byResult,originsByResult,ingredientItemUses,ingredientTagUses])
    freezeArrays(m);
  const allItems=Object.freeze([...itemIds].sort((a,b)=>Number(a)-Number(b)));
  const craftItems=Object.freeze([...craftingIds].sort((a,b)=>Number(a)-Number(b)));
  const cookItems=Object.freeze([...cookingIds].sort((a,b)=>Number(a)-Number(b)));
  const allRecipeIds=Object.freeze(recipes.map(r=>r.recipeId));
  const craftRecipeIds=Object.freeze(kindRecipeIds.crafting);
  const cookRecipeIds=Object.freeze(kindRecipeIds.cooking);
  const index:NativeRecipeIndex=Object.freeze({
    schema:DB02_NATIVE_RECIPE_SCHEMA,gameVersion:'1.26.2' as const,
    source:PROVENANCE,coverage:Object.freeze({
      sourceActivityDefinitions:2630 as const,recipeDefinitions:1943 as const,
      craftingRecipes:1318 as const,cookingRecipes:625 as const,
      distinctResultItemIds:1912 as const,playerCanCraftVerified:false as const,
      recipeUnlockedVerified:false as const,cookingYieldKnown:false as const,
      liveConditionsEvaluated:false as const,allAcquisitionRoutesCovered:false as const
    }),
    recipes:Object.freeze(recipes),origins:Object.freeze(origins),
    getRecipe(rawId:string|number){
      return byRecipe.get(normalizedId(rawId))??null;
    },
    getResultRecipes(rawId:string|number){
      return byResult.get(normalizedId(rawId))??EMPTY_RECIPES;
    },
    getResultOrigins(rawId:string|number){
      return originsByResult.get(normalizedId(rawId))??EMPTY_ORIGINS;
    },
    getIngredientItemUses(rawId:string|number){
      return ingredientItemUses.get(normalizedId(rawId))??EMPTY_USES;
    },
    getIngredientTagUses(rawId:string|number){
      return ingredientTagUses.get(normalizedId(rawId))??EMPTY_USES;
    },
    listResultItemIds(kind?:NativeRecipeKind){
      check(kind===undefined||kind==='cooking'||kind==='crafting','INVALID_KIND');
      return kind===undefined?allItems:kind==='cooking'?cookItems:craftItems;
    },
    listRecipeIds(kind?:NativeRecipeKind){
      check(kind===undefined||kind==='cooking'||kind==='crafting','INVALID_KIND');
      return kind===undefined?allRecipeIds:kind==='cooking'?cookRecipeIds:craftRecipeIds;
    }
  });
  PINNED.add(index);
  return index;
}
export function hasPinnedNativeRecipeEvidence(x:unknown):x is NativeRecipeIndex{
  return x!==null&&typeof x==='object'&&PINNED.has(x);
}
export async function loadPinnedNativeRecipeResults(
  basePath='',fetcher:typeof fetch=fetch
):Promise<NativeRecipeIndex>{
  check(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  check(typeof fetcher==='function','FETCH_REQUIRED');
  const response=await fetcher(basePath+'/acquisition/public/'+DB02_NATIVE_RECIPE_FILE);
  check(response.ok,'DOWNLOAD_FAILED');
  const buffer=await response.arrayBuffer();
  check(buffer.byteLength===DB02_NATIVE_RECIPE_BYTES,'BYTES');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(digest===DB02_NATIVE_RECIPE_SHA256,'SHA');
  return parse(JSON.parse(new TextDecoder().decode(buffer)));
}
