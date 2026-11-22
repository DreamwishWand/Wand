import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyConditionalNativeSellFormulaCandidates as classify,
  DB02_NATIVE_SELL_FORMULA_CANDIDATES_CONTRACT as CONTRACT}
  from '../src/lib/acquisition/native-sell-formula-candidates.mjs';
const input=(ids,defs=[])=>({formulaItemIds:ids,forCurrencyId:80000000,
  candidateDefinitions:defs});
const def=(id,currencyId=80000000,typeMatches=true)=>({
  formulaItemId:id,forCurrencyId:currencyId,
  nativeItemTypeMatches:typeMatches
});
test('original reference may exist without runtime formula definition or eligible type',()=>{
  const r=classify(input([2100200004]));
  assert.equal(r.contract,CONTRACT);
  assert.equal(r.formulaSourceReferenceCount,1);
  assert.deepEqual(r.sourceFormulaItemIds,[2100200004]);
  assert.equal(r.candidateDefinitionsSupplied,0);
  assert.equal(r.unresolvedEligibilityCount,1);
  assert.equal(r.conditionalSelectionStatus,'unresolved_candidate_precedence');
  assert.equal(r.conditionalFirstFormulaItemId,null);
  assert.equal(r.runtimeFormulaItemId,null);
  assert.equal(r.effectiveItemSellPrice,null);
  assert.equal(r.formulaDefinitionInputsAuthenticated,false);
  assert.ok(Object.isFrozen(r.sourceFormulaItemIds));
  assert.ok(Object.isFrozen(r.candidateConditions));
});
test('native currency mismatch and native runtime Type mismatch each reject formula',()=>{
  for(const d of [def(2100200004,80000001,true),
    def(2100200004,80000000,false),
    def(2100200004,80000001,null)]){
    const r=classify(input([2100200004],[d]));
    assert.equal(r.conditionalSelectionStatus,'no_match_in_supplied_definitions');
    assert.equal(r.conditionalFirstFormulaItemId,null);
    assert.equal(r.candidateConditions[0].conditionalEligible,false);
  }
});
test('first currency-and-native-type-matching candidate wins only conditionally',()=>{
  const r=classify(input([11,12,13,14],[
    def(11,80000001,true),
    def(12,80000000,false),
    def(13,80000000,true),
    def(14,80000000,true)
  ]));
  assert.equal(r.conditionalFirstFormulaItemId,13);
  assert.equal(r.conditionalSelectionStatus,'conditional_first_match');
  assert.equal(r.runtimeFormulaItemId,null);
  assert.equal(r.nativeRuntimeFormulaSequenceVerified,false);
  assert.equal(r.originalRuntimeEquationResult,null);
});
test('unresolved earlier candidate prevents false confident selection of later one',()=>{
  const r=classify(input([10,11,12],[
    def(11,80000000,true),def(12,80000000,true)
  ]));
  assert.equal(r.conditionalFirstFormulaItemId,null);
  assert.equal(r.conditionalSelectionStatus,'unresolved_candidate_precedence');
  assert.equal(r.candidateConditions[0].conditionalEligible,null);
});
test('explicit unknown native type keeps formula eligibility unknown',()=>{
  const r=classify(input([10],[def(10,80000000,null)]));
  assert.equal(r.candidateConditions[0].currencyMatch,true);
  assert.equal(r.candidateConditions[0].nativeTypeMatch,null);
  assert.equal(r.candidateConditions[0].conditionalEligible,null);
  assert.equal(r.conditionalFirstFormulaItemId,null);
  assert.equal(r.effectiveItemSellPrice,null);
});
test('empty source list is known no-match in supplied reference list only',()=>{
  const r=classify(input([]));
  assert.equal(r.conditionalSelectionStatus,'no_match_in_supplied_definitions');
  assert.equal(r.formulaSourceReferenceCount,0);
  assert.equal(r.runtimeFormulaItemId,null);
});
test('cross-platform numeric truncation observation does not produce a price',()=>{
  const r=classify(input([2100200004]));
  assert.equal(r.nativeFormulaResultFloatTruncationTowardZeroVerifiedSteam1262,true);
  assert.equal(r.nativeFormulaResultFloatTruncationTowardZeroVerifiedSwitch1262,true);
  assert.equal(r.nativeMethodCurrencyGateVerifiedSteam1262,true);
  assert.equal(r.nativeMethodResolvedTypeIdentityGateVerifiedSwitch1262,true);
  assert.equal(r.originalRuntimeEquationResult,null);
  assert.equal(r.effectiveItemSellPrice,null);
  assert.equal(r.publishable,false);
  assert.equal(r.writable,false);
});
test('invalid formula IDs, duplicates, caller claims and unknown shapes fail closed',()=>{
  for(const bad of [
    undefined,null,{},input([0]),input([1,1]),input([2147483648]),
    input([1],[def(2)]),input([1],[def(1),def(1)]),
    input([1],[def(1,0,true)]),input([1],[def(1,80000000,'true')]),
    input([1],[{formulaItemId:1,forCurrencyId:80000000,nativeItemTypeMatches:undefined}]),
    {...input([1]),forCurrencyId:0}
  ])assert.throws(()=>classify(bad),/DB02_NATIVE_SELL_FORMULA_/);
});
