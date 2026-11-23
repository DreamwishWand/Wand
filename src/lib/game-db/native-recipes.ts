/**
 * DB-00 lazy, source-qualified Item-ID bridge to DB-02's original recipe graph.
 * DB-02 remains responsible for source hashing, parsing and ingredient rules.
 *
 * Static recipe results do not establish unlocked recipes, player inventory,
 * ability to craft, Collection membership or current availability.
 */
import {canonicalId} from './model.ts';
import type {DbLocale,SharedGameDatabase} from './integrated.ts';
import type {Db00SourceJoinedReader,Db00SourceJoinedItem} from './source-join.ts';
import {
  hasPinnedNativeRecipeEvidence,DB02_NATIVE_RECIPE_ORIGINAL_SHA256,
  type NativeRecipeIndex,type NativeRecipe,type NativeRecipeKind,
  type NativeRecipeIngredientUse
} from '../acquisition/public-native-recipes.ts';
import type {ItemOrigin} from '../acquisition/origins.ts';

export const DB00_NATIVE_RECIPE_CONTRACT='wand.game-db.native-recipe-join@1' as const;
const LOCALES=new Set<string>([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR'
]);
function check(ok:unknown,code:string):asserts ok {
  if(!ok)throw new TypeError('DB00_NATIVE_RECIPE_'+code);
}
export interface Db00NativeRecipeResult {
  readonly itemId:string;
  readonly item:Db00SourceJoinedItem;
  readonly recipes:readonly NativeRecipe[];
  /** Separate source routes; never silently append to existing DB-02 origins. */
  readonly sourceRecipeOrigins:readonly ItemOrigin[];
  readonly sourceRecipeResultOnly:true;
  readonly recipeUnlockedVerified:false;
  readonly canCraftNowVerified:false;
  readonly playerOwnershipVerified:false;
  readonly collectionUiMembershipVerified:false;
}
export interface Db00NativeRecipeRef {
  readonly recipe:NativeRecipe;
  readonly result:Db00NativeRecipeResult;
  readonly originalIngredientSelectorsOnly:true;
  readonly recipeUnlockedVerified:false;
  readonly canCraftNowVerified:false;
}
export interface Db00NativeRecipeSearch {
  readonly kind?:NativeRecipeKind;
  readonly text?:string;
  readonly locale?:DbLocale;
  readonly publishedOnly?:true;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db00NativeRecipePage {
  readonly scope:'original_recipe_results_only';
  readonly snapshotId:string;
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00NativeRecipeResult[];
  readonly recipeUnlockedVerified:false;
  readonly canCraftNowVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00NativeRecipeReader {
  readonly contract:typeof DB00_NATIVE_RECIPE_CONTRACT;
  readonly snapshotId:string;
  readonly sourceRecipeDefinitions:1943;
  readonly distinctResultItemIds:1912;
  readonly sourceRecipeResultOnly:true;
  readonly recipeUnlockedVerified:false;
  readonly canCraftNowVerified:false;
  getResult(itemId:number|string):Db00NativeRecipeResult;
  getRecipe(recipeId:number|string):Db00NativeRecipeRef|null;
  getIngredientItemUses(itemId:number|string):readonly NativeRecipeIngredientUse[];
  /** Tag ID is a selector, never a resolved Item ID or a required ingredient. */
  getIngredientTagUses(tagId:number|string):readonly NativeRecipeIngredientUse[];
  searchResults(request?:Db00NativeRecipeSearch):Db00NativeRecipePage;
}

/** Reuses only DB-02's already SHA-pinned original Steam v1.26.2 reader. */
export function createDb00NativeRecipeReader(
  database:SharedGameDatabase,
  joined:Db00SourceJoinedReader,
  source:NativeRecipeIndex
):Db00NativeRecipeReader {
  check(database?.contract==='wand.game-db.shared@1' &&
    database.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    database.itemCount===13202 &&
    database.target.platform==='Steam' &&
    database.target.gameVersion==='1.26.2' &&
    joined?.contract==='wand.game-db.source-join@1' &&
    joined.snapshotId===database.snapshotId,
    'CURRENT_ITEMLIST_REQUIRED');
  check(hasPinnedNativeRecipeEvidence(source) &&
    source.schema==='wand.db02.native-recipe-results@1' &&
    source.gameVersion==='1.26.2' &&
    source.source.kind==='verified_game_native' &&
    source.source.gameVersion==='1.26.2' &&
    source.source.sha256===DB02_NATIVE_RECIPE_ORIGINAL_SHA256 &&
    source.coverage.recipeDefinitions===1943 &&
    source.coverage.distinctResultItemIds===1912 &&
    source.coverage.craftingRecipes===1318 &&
    source.coverage.cookingRecipes===625 &&
    source.coverage.recipeUnlockedVerified===false &&
    source.coverage.playerCanCraftVerified===false &&
    source.coverage.cookingYieldKnown===false &&
    source.coverage.liveConditionsEvaluated===false &&
    source.coverage.allAcquisitionRoutesCovered===false &&
    source.recipes.length===1943 &&
    source.origins.length===1943,
    'PINNED_DB02_RECIPE_SOURCE_REQUIRED');
  function getResult(raw:number|string):Db00NativeRecipeResult {
    const itemId=canonicalId(raw);
    const item=joined.getItem(itemId);
    check(item.itemId===itemId && item.currentlyAvailableVerified===false &&
      item.playerOwnershipVerified===false,'ITEM_JOIN_MISMATCH');
    return Object.freeze({
      itemId,item,recipes:source.getResultRecipes(itemId),
      sourceRecipeOrigins:source.getResultOrigins(itemId),
      sourceRecipeResultOnly:true as const,
      recipeUnlockedVerified:false as const,
      canCraftNowVerified:false as const,
      playerOwnershipVerified:false as const,
      collectionUiMembershipVerified:false as const
    });
  }
  function getRecipe(raw:number|string):Db00NativeRecipeRef|null {
    const recipe=source.getRecipe(canonicalId(raw));
    if(!recipe)return null;
    const result=getResult(recipe.resultItemId);
    check(result.recipes.includes(recipe) &&
      result.sourceRecipeOrigins.some(origin=>
        origin.originId==='native:recipe:'+recipe.recipeId),
      'REVERSE_RECIPE_RESULT_MISMATCH');
    return Object.freeze({
      recipe,result,
      originalIngredientSelectorsOnly:true as const,
      recipeUnlockedVerified:false as const,
      canCraftNowVerified:false as const
    });
  }
  function searchResults(request:Db00NativeRecipeSearch={}):Db00NativeRecipePage {
    check(request!==null&&typeof request==='object'&&!Array.isArray(request),
      'INVALID_REQUEST');
    const {kind}=request;
    check(kind===undefined||kind==='cooking'||kind==='crafting',
      'INVALID_KIND');
    const locale=request.locale??'en';
    check(LOCALES.has(locale),'INVALID_LOCALE');
    const text=request.text??'';
    check(typeof text==='string'&&text.length<=120&&
      !/[\x00-\x1f]/.test(text),'INVALID_TEXT');
    check(request.publishedOnly===undefined||request.publishedOnly===true,
      'INVALID_PUBLISHED_FILTER');
    const offset=request.offset??0,limit=request.limit??100;
    check(Number.isSafeInteger(offset)&&offset>=0&&
      Number.isSafeInteger(limit)&&limit>0&&limit<=500,'INVALID_PAGE');
    const needle=text.trim().normalize('NFKC').toLocaleLowerCase();
    const ids=source.listResultItemIds(kind).filter(id=>{
      const published=database.getItem(id);
      if(request.publishedOnly&&!published)return false;
      return !needle||id.startsWith(needle) ||
        !!published?.names[locale]?.normalize('NFKC')
          .toLocaleLowerCase().includes(needle);
    });
    const items=Object.freeze(ids.slice(offset,offset+limit).map(getResult));
    const next=offset+items.length;
    return Object.freeze({
      scope:'original_recipe_results_only' as const,
      snapshotId:database.snapshotId,total:ids.length,offset,
      nextOffset:next<ids.length?next:null,
      items,recipeUnlockedVerified:false as const,
      canCraftNowVerified:false as const,
      playerOwnershipVerified:false as const
    });
  }
  return Object.freeze({
    contract:DB00_NATIVE_RECIPE_CONTRACT,
    snapshotId:database.snapshotId,
    sourceRecipeDefinitions:1943 as const,
    distinctResultItemIds:1912 as const,
    sourceRecipeResultOnly:true as const,
    recipeUnlockedVerified:false as const,
    canCraftNowVerified:false as const,
    getResult,getRecipe,
    getIngredientItemUses:(id:number|string)=>
      source.getIngredientItemUses(canonicalId(id)),
    getIngredientTagUses:(id:number|string)=>
      source.getIngredientTagUses(canonicalId(id)),
    searchResults
  });
}
