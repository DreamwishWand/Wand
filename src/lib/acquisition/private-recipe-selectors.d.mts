/** Private-only, exact-version Tag name overlay for acquisition recipe selectors. */
export declare const DB02_PRIVATE_RECIPE_SELECTORS_CONTRACT: 'wand.db02.private-recipe-selectors@1';
export declare const DB02_TAG_LOCALES_RELEASE_SHA256: 'f6f990d77f30c1d34e2b902cac5c78e6953f07509a5332e33e115397a9d582e0';
export interface PrivateRecipeSelector {
  readonly selectorId: number;
  readonly selectorKind: 'native_tag' | 'cooking_ingredient_type' | 'unknown_selector';
  readonly localizedName: string | null;
  readonly localizationVerified: boolean;
  readonly localizationSource: 'steam1262_exact_tag_locbin' | null;
  readonly currentAvailabilityVerified: false;
}
export interface PrivateRecipeIngredient {
  readonly position: number;
  readonly kind: string;
  readonly quantity: number | null;
  readonly selectors: readonly PrivateRecipeSelector[];
  readonly candidateItemIds: readonly number[];
  readonly candidateCoverage: 'three_observed_cooking_native_classes_only' | 'source_explicit_item_ids';
  readonly currentAvailabilityVerified: false;
  readonly selectionRequired: boolean;
}
export interface PrivateRecipeChoices {
  readonly recipeId: number;
  readonly locale: string;
  readonly ingredients: readonly PrivateRecipeIngredient[];
  readonly privateSource: true;
  readonly publishable: false;
  readonly sourceGameVersion: '1.26.2';
  readonly sourceManifestSha256: string;
  readonly currentAvailabilityVerified: false;
  readonly playerOwnershipVerified: false;
  readonly recipeEligibilityEvaluated: false;
}
export interface PrivateRecipeSelectorView {
  readonly contract: typeof DB02_PRIVATE_RECIPE_SELECTORS_CONTRACT;
  readonly privateSource: true;
  readonly publishable: false;
  readonly verified: true;
  readonly sourceGameVersion: '1.26.2';
  readonly locale: string;
  readonly acquisitionManifestSha256: string;
  readonly tagLocalesManifestSha256: string;
  readonly currentAvailabilityVerified: false;
  readonly playerOwnershipVerified: false;
  /** Null means absent from current partial source, not absent from the game. */
  getRecipeIngredientChoices(recipeId: number): PrivateRecipeChoices | null;
}
export declare function createPrivateRecipeSelectorView(
  acquisition: import('./private-browser-bundle.mjs').PrivateSrc02BrowserBundle,
  tagLocales: import('./native-tag-locales.mjs').NativeTagLocaleLookup,
  locale: string
): PrivateRecipeSelectorView;
