import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb01Db00Patch } from './db00-join.ts';
import { DB01_LOCALES } from './index.ts';
const sha='c'.repeat(64);
const names=Object.fromEntries(DB01_LOCALES.map(l=>[l,l==='en'?'Synthetic Item':null]));
const record={itemId:5,nativeCategory:'ActivityItem',catalogDomain:'item',names,sourceSha256:sha};
const source={privateOnly:true,platform:'Steam',gameVersion:'1.26.2',nativeSourceManifestSha256:sha,
  currentNativeItemDefinitions:1,definitions:3};
const client={source,getCategory:async category=>category==='ActivityItem'?[record]:[]};
const target={platform:'Steam',gameVersion:'1.26.2',sourceSha256:sha,buildId:null};
test('TypeScript DB00 bridge preserves source exactness, private status and only item domain', async()=>{
  const result=await createDb01Db00Patch(client,target);
  assert.equal(result.patch.items.length,1);
  assert.equal(result.patch.items[0].names.en,'Synthetic Item');
  assert.equal(result.excludedUnclassifiedDefinitions,2);
  assert.equal(result.publishable,false);
  assert.equal(result.patch.sources[0].visibility,'private');
  assert.equal(result.saveWritingAuthorized,false);
});
test('TypeScript DB00 bridge forbids incorrect source or a build guess',async()=>{
  await assert.rejects(createDb01Db00Patch(client,{...target,sourceSha256:'a'.repeat(64)}),/EXACT_SOURCE_TARGET_REQUIRED/);
  await assert.rejects(createDb01Db00Patch(client,{...target,buildId:'0'}),/EXACT_SOURCE_TARGET_REQUIRED/);
  await assert.rejects(createDb01Db00Patch({...client,source:{...source,privateOnly:false}},target),/PRIVATE_CATALOG_REQUIRED/);
});
test('TypeScript DB00 bridge rejects misclassified records and wrong item counts',async()=>{
  await assert.rejects(createDb01Db00Patch({...client,getCategory:async cat=>cat==='ActivityItem'?[{...record,catalogDomain:'definition_unclassified'}]:[]},target),/UNCLASSIFIED_PATCH_BLOCKED/);
  await assert.rejects(createDb01Db00Patch({...client,source:{...source,currentNativeItemDefinitions:2}},target),/NATIVE_ITEM_COUNT_MISMATCH/);
});