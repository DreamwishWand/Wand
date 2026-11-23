import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCollectionAcquisition}
  from '../src/lib/collection/acquisition-summary.ts';

const ID='40001082';
function fixture(){
  return {
    itemId:ID,
    staticSourceOnly:true,
    currentAvailabilityVerified:false,
    playerOwnershipVerified:false,
    collectionUiMembershipVerified:false,
    recipes:{
      itemId:ID,sourceRecipeResultOnly:true,recipeUnlockedVerified:false,
      recipes:[],sourceRecipeOrigins:[]
    },
    activities:{
      itemId:ID,staticSourceOnly:true,
      actualOccurrenceGuaranteed:false,currentAvailabilityVerified:false,
      sourcePaths:[],sourcePathOrigins:[]
    },
    shared:{
      itemId:ID,starpathRewardsOnlyConfigured:true,starpathRelations:[],
    }
  };
}

test('only exact original configured recipe, activity and Star Path result links appear',()=>{
  const value=fixture();
  value.recipes.recipes=[
    {resultItemId:ID,kind:'cooking'},
    {resultItemId:ID,kind:'crafting'},
    {resultItemId:ID,kind:'cooking'}
  ];
  value.activities.sourcePaths=[
    {resultItemId:ID,method:'farming',occurrenceGuaranteed:false,currentAvailabilityVerified:false},
    {resultItemId:ID,method:'mining',occurrenceGuaranteed:false,currentAvailabilityVerified:false},
    {resultItemId:ID,method:'fishing',occurrenceGuaranteed:false,currentAvailabilityVerified:false},
    {resultItemId:ID,method:'timebending',occurrenceGuaranteed:false,currentAvailabilityVerified:false}
  ];
  value.shared.starpathRelations=[
    {itemId:ID,role:'premium_access_currency',configuredRewardOnly:true,guaranteedGrant:false},
    {itemId:ID,role:'vault_alternative_candidate',configuredRewardOnly:true,guaranteedGrant:false},
    {itemId:ID,role:'configured_reward',configuredRewardOnly:true,guaranteedGrant:false}
  ];
  const summary=summarizeCollectionAcquisition(value);
  assert.deepEqual(summary,{
    itemId:Number(ID),
    kinds:['crafting','cooking','fishing','mining','timebending','farming','starpath'],
    staticSourceOnly:true,
    availabilityVerified:false,
    ownershipVerified:false
  });
  assert.equal(Object.isFrozen(summary),true);
  assert.equal(Object.isFrozen(summary.kinds),true);
});

test('no source link does not invent an acquisition route or entitlement',()=>{
  const value=fixture();
  value.shared.starpathRelations=[
    {itemId:ID,role:'premium_access_currency',configuredRewardOnly:true,guaranteedGrant:false},
    {itemId:ID,role:'vault_alternative_candidate',configuredRewardOnly:true,guaranteedGrant:false},
    {itemId:'123456',role:'configured_reward',configuredRewardOnly:true,guaranteedGrant:false}
  ];
  assert.deepEqual(summarizeCollectionAcquisition(value).kinds,[]);
});

test('rejects live-availability, ownership and mismatched source claims',()=>{
  const a=fixture();
  a.currentAvailabilityVerified=true;
  assert.throws(()=>summarizeCollectionAcquisition(a),/UNVERIFIED_SOURCE/);
  const b=fixture();
  b.playerOwnershipVerified=true;
  assert.throws(()=>summarizeCollectionAcquisition(b),/UNVERIFIED_SOURCE/);
  const c=fixture();
  c.recipes.recipes=[{resultItemId:'123',kind:'crafting'}];
  assert.throws(()=>summarizeCollectionAcquisition(c),/RECIPE_MISMATCH/);
  const d=fixture();
  d.activities.sourcePaths=[{resultItemId:ID,method:'mining',occurrenceGuaranteed:true,currentAvailabilityVerified:false}];
  assert.throws(()=>summarizeCollectionAcquisition(d),/PATH_MISMATCH/);
  const e=fixture();
  e.shared.itemId='123';
  assert.throws(()=>summarizeCollectionAcquisition(e),/ID_MISMATCH/);
});
