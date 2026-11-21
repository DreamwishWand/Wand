export type MaterialPlanBlockerReason = 'recipe_choice_required' | 'cyclic_recipe_chain' |
  'maximum_depth_reached' | 'unknown_crafting_yield';
export interface MaterialPlanStep {
  readonly recipeId: number;
  readonly resultItemId: number;
  readonly type: 'crafting' | 'cooking';
  readonly batches: number;
  readonly resultQuantityPerBatch: number | null;
  readonly plannedOutputQuantity: number | null;
  readonly conditionDigest: string | null;
  readonly eligibilityEvaluated: false;
}
export interface MaterialPlanRequirement {
  readonly itemId: number;
  readonly quantity: number;
  readonly reasons: string[];
  readonly recipeCandidateIds: number[];
  readonly acquisitionPaths: Readonly<Record<string, unknown>>[];
  readonly possibleStalls: Readonly<Record<string, unknown>>[];
  readonly acquisitionAvailabilityVerified: false;
}
export interface MaterialPlan {
  readonly schema: 'wand.db02.material-plan@1';
  readonly source: { readonly platform: string; readonly gameVersion: string };
  readonly rootRecipeId: number;
  readonly rootResultItemId: number;
  readonly batches: number;
  readonly outputQuantity: number | null;
  readonly status: 'requires_explicit_choices' | 'static_material_quantities_resolved';
  readonly materialsFullySpecified: boolean;
  readonly recipeEligibilityEvaluated: false;
  readonly acquisitionAvailabilityVerified: false;
  /** Child-first planned batches; simulation only, not player progress. */
  readonly steps: MaterialPlanStep[];
  readonly unresolvedSelectors: Array<{
    readonly recipeId: number;
    readonly ingredientIndex: number;
    readonly kind: 'anyTag' | 'tagAlternatives' | 'itemAlternatives';
    readonly tagId?: number;
    readonly tagIds?: number[];
    readonly itemIds?: number[];
    readonly candidateItemIds: number[];
    readonly membershipCoverage: 'three_observed_cooking_native_classes' | 'not_supplied';
    readonly availabilityVerified: false;
    readonly quantity: number;
    readonly resolution: string;
  }>;
  readonly selectorSelections: Array<{
    readonly recipeId: number;
    readonly ingredientIndex: number;
    readonly itemId: number;
    readonly quantity: number;
    readonly matchedSelectorIds: number[];
    readonly availabilityVerified: false;
  }>;
  readonly blockers: Array<{
    readonly itemId: number;
    readonly quantity: number;
    readonly reason: MaterialPlanBlockerReason;
    readonly recipeCandidateIds?: number[];
    readonly itemChain?: number[];
  }>;
  readonly requiredMaterials: MaterialPlanRequirement[];
  readonly inventoryUsed: Array<{ readonly itemId: number; readonly quantity: number }>;
  readonly remainingInventory: Array<{ readonly itemId: number; readonly quantity: number }>;
  readonly producedSurplus: Array<{ readonly itemId: number; readonly quantity: number }>;
}
export interface PlanOptions {
  /** Count of times to perform the specified recipe; default 1. */
  batches?: number;
  /** Caller-supplied hypothetical counts, NOT sourced from a save. */
  inventory?: Record<string | number, number>;
  /** When multiple crafting recipes produce one item, select an explicit recipe. */
  recipeChoices?: Record<string | number, number>;
  /** Explicit choice by source recipeId:zero-based ingredientIndex; must be in verified candidates. */
  ingredientChoices?: Record<string, number>;
  expandSingleRecipe?: boolean;
  maxDepth?: number;
}
export function planRecipeRequirements(
  db: {
    source: { platform: string; gameVersion: string };
    getRecipe(id: number): any;
    ingredientMembershipScope?: 'three_observed_cooking_native_classes' | 'not_supplied';
    getIngredientSelectorCandidates?(id: number): Array<{itemId: number}>;
    getRecipesForItem(id: number): any[];
    getAcquisitionPaths(id: number): Readonly<Record<string, unknown>>[];
    getPossibleStallsForItem(id: number): Readonly<Record<string, unknown>>[];
  },
  recipeId: number | string,
  options?: PlanOptions
): MaterialPlan;

export interface RecipeBasketGoal {
  /** Exact native recipe ID; repeated goals are combined before planning. */
  recipeId: number | string;
  /** Number of source recipe executions, default 1. */
  batches?: number;
}
export interface MaterialBasket extends Omit<MaterialPlan,
  'schema' | 'rootRecipeId' | 'rootResultItemId' | 'batches' | 'outputQuantity'> {
  readonly schema: 'wand.db02.material-basket@1';
  readonly goals: Array<{
    readonly recipeId: number;
    readonly resultItemId: number;
    readonly batches: number;
    readonly outputQuantity: number | null;
  }>;
}
export function planRecipeBasket(
  db: Parameters<typeof planRecipeRequirements>[0],
  goals: RecipeBasketGoal[],
  options?: Omit<PlanOptions, 'batches'>
): MaterialBasket;