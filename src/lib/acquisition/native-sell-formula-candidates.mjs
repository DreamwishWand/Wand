/**
 * DB-02 formula selection *conditions* observed in original Steam/Switch 1.26.2
 * SellPriceFormulaItemData.GetSellPriceFormulaItemData /
 * IsFormulaValidForItem / CalculateItemPrice. No original equation or
 * registered formula-runtime list is available to this pure module.
 *
 * Currency must match; the formula must be valid for the item's resolved
 * native runtime Type identity; the first eligible candidate wins.
 * A caller-supplied type-match boolean is NOT authenticated source evidence.
 */
export const DB02_NATIVE_SELL_FORMULA_CANDIDATES_CONTRACT=
  'wand.db02.native-sell-formula-candidates@1';
const fail=reason=>{throw new TypeError('DB02_NATIVE_SELL_FORMULA_'+reason);};
const ok=(yes,reason)=>{if(!yes)fail(reason);};
const positive=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const freeze=Object.freeze;
const statuses=freeze({
  resolved:'conditional_first_match',
  uncertain:'unresolved_candidate_precedence',
  none:'no_match_in_supplied_definitions'
});

/**
 * formulaItemIds should be from authenticated original
 * DynamicItemPriceDatase source references, where available. The optional
 * candidateDefinitions are NOT trusted: they can assist hypothetical analysis
 * but must never enable a claim about a real game's effective selling price.
 *
 * A missing definition or an unresolved native type check remains UNKNOWN;
 * unknown earlier formulas prevent selecting a known later formula.
 */
export function classifyConditionalNativeSellFormulaCandidates(input={}){
  ok(input!==null&&typeof input==='object'&&!Array.isArray(input),
    'INVALID_INPUT');
  const {formulaItemIds,forCurrencyId,candidateDefinitions=[]}=input;
  ok(Array.isArray(formulaItemIds)&&formulaItemIds.length<=32&&
    formulaItemIds.every(positive)&&
    new Set(formulaItemIds).size===formulaItemIds.length,
    'INVALID_FORMULA_IDS');
  ok(positive(forCurrencyId)&&Array.isArray(candidateDefinitions)&&
    candidateDefinitions.length<=formulaItemIds.length,
    'INVALID_INPUT');
  const knownIds=new Set(formulaItemIds),seen=new Set(),map=new Map();
  for(const r of candidateDefinitions){
    ok(r&&typeof r==='object'&&!Array.isArray(r)&&
      positive(r.formulaItemId)&&knownIds.has(r.formulaItemId)&&
      !seen.has(r.formulaItemId)&&
      (r.forCurrencyId===null||positive(r.forCurrencyId))&&
      (r.nativeItemTypeMatches===null||
        typeof r.nativeItemTypeMatches==='boolean'),
      'INVALID_FORMULA_DEFINITION');
    seen.add(r.formulaItemId);map.set(r.formulaItemId,r);
  }
  const candidates=freeze(formulaItemIds.map(id=>{
    const r=map.get(id);
    const currencyMatch=r===undefined||r.forCurrencyId===null?
      null:r.forCurrencyId===forCurrencyId;
    const nativeTypeMatch=r?.nativeItemTypeMatches??null;
    const eligibility=currencyMatch===false||nativeTypeMatch===false?
      false:currencyMatch===true&&nativeTypeMatch===true?true:null;
    return freeze({
      formulaItemId:id,
      currencyMatch,nativeTypeMatch,
      conditionalEligible:eligibility,
      definitionSupplied:r!==undefined
    });
  }));
  let firstMatch=null,unresolvedBeforeFirst=false,uncertain=0;
  for(const r of candidates){
    if(r.conditionalEligible===null){uncertain++;unresolvedBeforeFirst=true;}
    if(r.conditionalEligible===true){
      if(!unresolvedBeforeFirst)firstMatch=r.formulaItemId;
      break;
    }
  }
  const status=firstMatch!==null?statuses.resolved:
    uncertain>0||candidates.some(r=>r.conditionalEligible===true)?
      statuses.uncertain:statuses.none;
  const remainingUnresolved=candidates.filter(x=>x.conditionalEligible===null).length;
  return freeze({
    contract:DB02_NATIVE_SELL_FORMULA_CANDIDATES_CONTRACT,
    sourceFormulaItemIds:freeze([...formulaItemIds]),
    forCurrencyId,
    candidateConditions:candidates,
    formulaSourceReferenceCount:formulaItemIds.length,
    candidateDefinitionsSupplied:seen.size,
    unresolvedCandidateDefinitionsCount:formulaItemIds.length-seen.size,
    unresolvedEligibilityCount:remainingUnresolved,
    conditionalFirstFormulaItemId:firstMatch,
    conditionalSelectionStatus:status,
    nativeMethodCurrencyGateVerifiedSteam1262:true,
    nativeMethodCurrencyGateVerifiedSwitch1262:true,
    nativeMethodResolvedTypeIdentityGateVerifiedSteam1262:true,
    nativeMethodResolvedTypeIdentityGateVerifiedSwitch1262:true,
    nativeFormulaResultFloatTruncationTowardZeroVerifiedSteam1262:true,
    nativeFormulaResultFloatTruncationTowardZeroVerifiedSwitch1262:true,
    formulaDefinitionInputsAuthenticated:false,
    nativeRuntimeFormulaSequenceVerified:false,
    nativeRuntimeTypeIdentityResolved:false,
    runtimeFormulaItemId:null,
    originalRuntimeEquationResult:null,
    effectiveItemSellPrice:null,
    publishable:false,
    writable:false
  });
}
