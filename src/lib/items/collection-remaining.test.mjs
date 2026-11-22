import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  createDb01RemainingClient,DB01_REMAINING_EVIDENCE,
} from './collection-remaining.ts';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const encoded=value=>new TextEncoder().encode(JSON.stringify(value)+'\n');
const sqliteSha='a'.repeat(64),sourceSha='b'.repeat(64);
const originalSha='c'.repeat(64),dumpSha='d'.repeat(64);
const itemId=31700001,recipeId=2050300001;
const positive={
  collectionSetId:2120000005,groupIndex:0,selectorIndex:0,
  activityCase:null,sourceField:'CraftingRecipeItemData.RecipeType',
  criterion:2001100001,criterionName:'RefinedMaterial',
  sourceRecipeItemId:recipeId,
  sourceRule:'source_crafting_recipe_type_and_result_item_id',
  evidence:DB01_REMAINING_EVIDENCE,
  sourcePredicateMatched:true,gameUiMembershipVerified:false,
  worldAvailabilityVerified:false,dlcOwnershipVerified:false,
};
const negative={
  collectionSetId:2120000004,groupIndex:0,selectorIndex:1,
  criterion:2001100001,criterionName:'RefinedMaterial',
  sourceRecipeItemId:recipeId,
  sourceRule:'source_crafting_recipe_type_and_result_item_id',
  evidence:DB01_REMAINING_EVIDENCE,
  negative:true,gameUiMembershipVerified:false,
};
const selector={
  collectionSetId:2120000004,submenuCode:8,groupIndex:0,selectorIndex:1,
  sourceKind:'crafting',activityCase:null,
  sourceField:'CraftingRecipeItemData.RecipeType',
  criterion:2001100001,criterionName:'RefinedMaterial',
  negative:true,matchedSourceRecordCount:1,
  selectedItemIdCount:1,explicitlyExcludedCount:0,
  sourceRule:'source_crafting_recipe_type_and_result_item_id',
  gameUiMembershipVerified:false,
};
function fixture(){
  const data={'selectors.json':encoded([selector])};
  const actual='id/'+(itemId%256).toString(16).padStart(2,'0')+'.json';
  for(let i=0;i<256;i++){
    const path='id/'+i.toString(16).padStart(2,'0')+'.json';
    data[path]=encoded(path===actual?[{
      itemId,nativeCategory:'ActivityItem',sourceSha256:originalSha,
      positive:[positive],negative:[negative],
    }]:[]);
  }
  const manifest={
    schema:'wand.db01.collection-activity-crafting@1',
    privateOnly:true,publicationAuthorized:false,
    platform:'Steam',gameVersion:'1.26.2',
    sourceSqliteSha256:sqliteSha,sourceItemsSha256:sourceSha,
    sourceIl2cppDumpSha256:dumpSha,
    originalCategorySha256:{
      ActivityData:'e'.repeat(64),ActivityItem:originalSha,
      Tag:'f'.repeat(64),CollectionSet:'1'.repeat(64)},
    definitionCount:3,sourceSelectorCount:1,resolvedActivitySelectors:0,
    resolvedCraftingSelectors:1,unresolvedActivityCraftingSelectors:0,
    sourceMatchedPositiveItemIds:1,sourceMatchedNegativeItemIds:1,
    sourceMatchedCombinedItemIds:1,positiveAssociations:1,negativeAssociations:1,
    sameGroupActivityPositiveSuppressed:0,
    gameRuntimeMembershipVerified:false,worldAvailabilityVerified:false,
    dlcOwnershipVerified:false,bucketCount:256,
    files:Object.fromEntries(Object.entries(data).map(([name,body])=>
      [name,{sha256:sha(body),bytes:body.length,
        count:name==='selectors.json'||name===actual?1:0}])),
  };
  const original={itemId,nativeCategory:'ActivityItem',sourceSha256:originalSha};
  const catalog={source:{privateOnly:true,platform:'Steam',gameVersion:'1.26.2',
    sourceItemsSha256:sourceSha,definitions:3},
    getItem:async id=>id===itemId?original:null,
    getItems:async ids=>ids.map(id=>id===itemId?original:null)};
  const requests=[];
  const load=async path=>{requests.push(path);return data[path];};
  return {manifest,data,catalog,load,requests,actual};
}
test('positive Crafting result and negative exclusion remain separate',async()=>{
  const f=fixture();
  const c=createDb01RemainingClient(f.manifest,f.load,f.catalog);
  const found=await c.getItem(itemId);
  assert.equal(found.positive.length,1);
  assert.equal(found.negative.length,1);
  assert.equal(found.positive[0].sourcePredicateMatched,true);
  assert.equal(found.negative[0].negative,true);
  assert.equal(found.positive[0].sourceRecipeItemId,recipeId);
  assert.equal(found.negative[0].collectionSetId,2120000004);
  assert.equal(found.positive[0].gameUiMembershipVerified,false);
  assert.equal(found.positive[0].dlcOwnershipVerified,false);
  const selectors=await c.getSelectors();
  assert.equal(selectors[0].negative,true);
  const batch=await c.getItems([itemId,itemId,11111111]);
  assert.strictEqual(batch[0],found);
  assert.strictEqual(batch[1],found);
  assert.equal(batch[2],null);
  assert.equal(f.requests.length,3);
});
test('wrong canonical version rejected without loading any asset',()=>{
  const f=fixture();
  assert.throws(()=>createDb01RemainingClient(f.manifest,f.load,{
    ...f.catalog,source:{...f.catalog.source,gameVersion:'1.27.0'}}),
    /CATALOG_IDENTITY/);
  assert.throws(()=>createDb01RemainingClient({
    ...f.manifest,publicationAuthorized:true},f.load,f.catalog),
    /SOURCE_CONTRACT/);
});
test('shard tampering rejected by independently pinned SHA and file size',async()=>{
  const f=fixture();
  f.data[f.actual]=encoded([]);
  await assert.rejects(createDb01RemainingClient(
    f.manifest,f.load,f.catalog).getItem(itemId),/SIZE_MISMATCH|SHA_MISMATCH/);
});
test('same-group positive links cannot coexist with negative exceptions',async()=>{
  const f=fixture();
  const corrupt={...positive,collectionSetId:negative.collectionSetId};
  const payload=encoded([{
    itemId,nativeCategory:'ActivityItem',sourceSha256:originalSha,
    positive:[corrupt],negative:[negative],
  }]);
  f.data[f.actual]=payload;
  f.manifest.files[f.actual]={sha256:sha(payload),bytes:payload.length,count:1};
  await assert.rejects(createDb01RemainingClient(
    f.manifest,f.load,f.catalog).getItem(itemId),
    /SAME_GROUP_EXCLUSION_CONFLICT/);
});
test('same ID but a different original category is never accepted',async()=>{
  const f=fixture();
  const catalog={...f.catalog,getItems:async ids=>ids.map(id=>
    id===itemId?{itemId,nativeCategory:'Furniture',sourceSha256:originalSha}:null)};
  await assert.rejects(createDb01RemainingClient(
    f.manifest,f.load,catalog).getItem(itemId),/CANONICAL_ITEM_MISMATCH/);
});
