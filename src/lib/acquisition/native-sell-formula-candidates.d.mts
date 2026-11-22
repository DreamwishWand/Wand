/** Currency and resolved native Type gated sell-formula *conditional* source selection. */
export declare const DB02_NATIVE_SELL_FORMULA_CANDIDATES_CONTRACT:
  'wand.db02.native-sell-formula-candidates@1';
export interface SourceSellFormulaCandidateDefinition {
  readonly formulaItemId:number;
  readonly forCurrencyId:number|null;
  readonly nativeItemTypeMatches:boolean|null;
}
export interface SourceSellFormulaCandidateCondition {
  readonly formulaItemId:number;
  readonly currencyMatch:boolean|null;
  readonly nativeTypeMatch:boolean|null;
  readonly conditionalEligible:boolean|null;
  readonly definitionSupplied:boolean;
}
export interface ConditionalSellFormulaSourcePlan {
  readonly contract:typeof DB02_NATIVE_SELL_FORMULA_CANDIDATES_CONTRACT;
  readonly sourceFormulaItemIds:readonly number[];
  readonly forCurrencyId:number;
  readonly candidateConditions:readonly SourceSellFormulaCandidateCondition[];
  readonly formulaSourceReferenceCount:number;
  readonly candidateDefinitionsSupplied:number;
  readonly unresolvedCandidateDefinitionsCount:number;
  readonly unresolvedEligibilityCount:number;
  readonly conditionalFirstFormulaItemId:number|null;
  readonly conditionalSelectionStatus:
    'conditional_first_match'|'unresolved_candidate_precedence'|
    'no_match_in_supplied_definitions';
  readonly nativeMethodCurrencyGateVerifiedSteam1262:true;
  readonly nativeMethodCurrencyGateVerifiedSwitch1262:true;
  readonly nativeMethodResolvedTypeIdentityGateVerifiedSteam1262:true;
  readonly nativeMethodResolvedTypeIdentityGateVerifiedSwitch1262:true;
  readonly nativeFormulaResultFloatTruncationTowardZeroVerifiedSteam1262:true;
  readonly nativeFormulaResultFloatTruncationTowardZeroVerifiedSwitch1262:true;
  readonly formulaDefinitionInputsAuthenticated:false;
  readonly nativeRuntimeFormulaSequenceVerified:false;
  readonly nativeRuntimeTypeIdentityResolved:false;
  readonly runtimeFormulaItemId:null;
  readonly originalRuntimeEquationResult:null;
  readonly effectiveItemSellPrice:null;
  readonly publishable:false;
  readonly writable:false;
}
export declare function classifyConditionalNativeSellFormulaCandidates(
  input:{
    formulaItemIds:readonly number[];
    forCurrencyId:number;
    candidateDefinitions?:readonly SourceSellFormulaCandidateDefinition[];
  }
):ConditionalSellFormulaSourcePlan;
