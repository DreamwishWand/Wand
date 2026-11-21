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
    readonly kind: 'anyTag' | 'tagAlternatives';
    readonly tagId?: number;
    readonly tagIds?: number[];
    readonly quantity: number;
    readonly resolution: string;
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
  expandSingleRecipe?: boolean;
  maxDepth?: number;
}
export function planRecipeRequirements(
  db: {
    source: { platform: string; gameVersion: string };
    getRecipe(id: number): any;
    getRecipesForItem(id: number): any[];
    getAcquisitionPaths(id: number): Readonly<Record<string, unknown>>[];
    getPossibleStallsForItem(id: number): Readonly<Record<string, unknown>>[];
  },
  recipeId: number | string,
  options?: PlanOptions
): MaterialPlan;