/**
 * Source-pinned, private-only recipe ingredient choices with exact Tag.locbin names.
 * Does not select ingredients, evaluate conditions, or infer current availability.
 */
import { PRIVATE_SRC02_BROWSER_CONTRACT } from './private-browser-bundle.mjs';
import { DB02_NATIVE_TAG_PARENT_SHA256 } from './native-tag-evidence.mjs';
import {
  DB02_TAG_EVIDENCE_MANIFEST_SHA256,
  DB02_TAG_LOCALES,
  DB02_TAG_LOCALES_CONTRACT
} from './native-tag-locales.mjs';

export const DB02_PRIVATE_RECIPE_SELECTORS_CONTRACT = 'wand.db02.private-recipe-selectors@1';
// Independent owner-private 2026-11-21 release audit, NOT read from user-selected data.
export const DB02_TAG_LOCALES_RELEASE_SHA256 = 'f6f990d77f30c1d34e2b902cac5c78e6953f07509a5332e33e115397a9d582e0';
const validId = value => Number.isSafeInteger(value) && value > 0;
const isTag = id => id >= 2001200000 && id < 2001300000;
const isCookingType = id => id >= 2001400000 && id < 2001500000;
const fail = code => { throw new TypeError('DB02_PRIVATE_RECIPE_SELECTORS_' + code); };

/**
 * All source records come from independently SHA-verified private loaders.
 * The same game version alone is not enough: require the accepted exact r5
 * manifest and its corresponding native Tag and localization releases.
 */
export function createPrivateRecipeSelectorView(acquisition, tagLocales, locale) {
  if (acquisition?.contract !== PRIVATE_SRC02_BROWSER_CONTRACT ||
      acquisition?.verified !== true || acquisition.privateSource !== true ||
      acquisition.publishable !== false || !Object.isFrozen(acquisition) ||
      acquisition.source?.platform !== 'Steam' || acquisition.source?.gameVersion !== '1.26.2' ||
      acquisition.manifestSha256 !== DB02_NATIVE_TAG_PARENT_SHA256 ||
      acquisition.currentAvailabilityVerified !== false ||
      typeof acquisition.getRecipe !== 'function' ||
      typeof acquisition.getIngredientSelectorCandidates !== 'function') fail('UNVERIFIED_R5_SOURCE');
  if (tagLocales?.contract !== DB02_TAG_LOCALES_CONTRACT ||
      tagLocales.verified !== true || tagLocales.privateSource !== true ||
      tagLocales.publishable !== false || !Object.isFrozen(tagLocales) ||
      tagLocales.platform !== 'Steam' || tagLocales.gameVersion !== '1.26.2' ||
      tagLocales.manifestSha256 !== DB02_TAG_LOCALES_RELEASE_SHA256 ||
      tagLocales.parentTagManifestSha256 !== DB02_TAG_EVIDENCE_MANIFEST_SHA256 ||
      typeof tagLocales.getRecipeSelectorName !== 'function') fail('UNVERIFIED_TAG_LOCALES');
  if (!DB02_TAG_LOCALES.includes(locale)) fail('UNSUPPORTED_LOCALE');

  const choiceFor = (id) => {
    if (!validId(id)) fail('INVALID_SELECTOR_ID');
    const kind = isTag(id) ? 'native_tag' : isCookingType(id) ? 'cooking_ingredient_type' : 'unknown_selector';
    const name = kind === 'native_tag' ? tagLocales.getRecipeSelectorName(id, locale) : null;
    if (name !== null && (name?.tagId !== id || name.locale !== locale ||
        typeof name.value !== 'string' || !name.value.trim() ||
        name.evidence !== 'steam1262_exact_tag_locbin')) fail('INCONSISTENT_TAG_NAME');
    return Object.freeze({ selectorId:id, selectorKind:kind,
      localizedName: name?.value ?? null,
      localizationVerified: name !== null,
      localizationSource: name?.evidence ?? null,
      currentAvailabilityVerified:false });
  };
  const recipeView = (recipeId) => {
    if (!validId(recipeId)) fail('INVALID_RECIPE_ID');
    const recipe = acquisition.getRecipe(recipeId);
    if (recipe === null) return null; // Not in this private partial index: not proof of absence.
    if (!Array.isArray(recipe?.ingredients)) fail('INVALID_RECIPE_SOURCE');
    const ingredients = recipe.ingredients.map((ingredient, index) => {
      if (ingredient === null || typeof ingredient !== 'object' || Array.isArray(ingredient))
        fail('INVALID_INGREDIENT');
      let ids = [];
      if (ingredient.kind === 'anyTag') ids = [ingredient.tagId];
      else if (ingredient.kind === 'tagAlternatives') ids = ingredient.tagIds;
      if (!Array.isArray(ids) || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length)
        fail('INVALID_SELECTOR_IDS');
      const selectors = Object.freeze(ids.map(choiceFor));
      const candidateIds = new Set();
      for (const id of ids) {
        const rows = acquisition.getIngredientSelectorCandidates(id);
        if (!Array.isArray(rows)) fail('INVALID_CANDIDATES');
        for (const row of rows) {
          if (!validId(row?.itemId) || row.availabilityVerified !== false)
            fail('UNVERIFIED_CANDIDATE');
          candidateIds.add(row.itemId);
        }
      }
      // Fixed/alternative Item IDs are explicit game definitions, not inferred
      // from the three-class partial cooking selector membership index.
      if (ingredient.kind === 'item') {
        if (!validId(ingredient.itemId)) fail('INVALID_ITEM_ID');
        candidateIds.add(ingredient.itemId);
      } else if (ingredient.kind === 'itemAlternatives') {
        if (!Array.isArray(ingredient.itemIds) ||
            ingredient.itemIds.some(id => !validId(id)) ||
            new Set(ingredient.itemIds).size !== ingredient.itemIds.length)
          fail('INVALID_ITEM_ALTERNATIVES');
        for (const id of ingredient.itemIds) candidateIds.add(id);
      }
      const explicit = ingredient.kind === 'item' || ingredient.kind === 'itemAlternatives';
      return Object.freeze({position:index, kind:ingredient.kind,
        quantity:ingredient.quantity ?? null, selectors,
        candidateItemIds:Object.freeze([...candidateIds].sort((a,b)=>a-b)),
        candidateCoverage:explicit ? 'source_explicit_item_ids' :
          'three_observed_cooking_native_classes_only',
        currentAvailabilityVerified:false,
        selectionRequired:ids.length>0 || ingredient.kind==='itemAlternatives'});
    });
    return Object.freeze({recipeId, locale, ingredients:Object.freeze(ingredients),
      privateSource:true, publishable:false, sourceGameVersion:'1.26.2',
      sourceManifestSha256:DB02_NATIVE_TAG_PARENT_SHA256,
      currentAvailabilityVerified:false, playerOwnershipVerified:false,
      recipeEligibilityEvaluated:false});
  };
  return Object.freeze({contract:DB02_PRIVATE_RECIPE_SELECTORS_CONTRACT,
    privateSource:true,publishable:false,verified:true,
    sourceGameVersion:'1.26.2',locale,
    acquisitionManifestSha256:DB02_NATIVE_TAG_PARENT_SHA256,
    tagLocalesManifestSha256:DB02_TAG_LOCALES_RELEASE_SHA256,
    currentAvailabilityVerified:false, playerOwnershipVerified:false,
    getRecipeIngredientChoices:recipeView});
}
