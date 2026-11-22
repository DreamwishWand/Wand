import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  createDb01UniversePredicateClient, DB01_COLLECTION_UNIVERSE_RULE,
} from './collection-universe.ts';

const encode=x=>new TextEncoder().encode(JSON.stringify(x)+'\n');
const sha=x=>createHash('sha256').update(x).digest('hex');
const source='a'.repeat(64),itemSource='b'.repeat(64),dump='c'.repeat(64);
const itemId=40000047, linkedSet=2040000009, collectionSet=2120000024;
const relation={
  setId:collectionSet,groupIndex:0,nativeCategory:'Furniture',
  sourceSetItemId:linkedSet,universeTagId:2000500001,universeTagKey:'Mickey',
  selectorField:3,rule:DB01_COLLECTION_UNIVERSE_RULE,
  sourcePredicateMatched:true,gameUiMembershipVerified:false,
  gameUiVisibilityVerified:false,worldAvailabilityVerified:false,
  dlcOwnershipVerified:false,
};
const selector={
  setId:collectionSet,groupIndex:0,submenuCode:3,nativeCategory:'Furniture',
  universeTagId:2000500001,universeTagKey:'Mickey',
  matchedCandidateCount:1,explicitIgnoredMatches:1,
  rule:DB01_COLLECTION_UNIVERSE_RULE,gameRuntimeMembershipVerified:false,
};
function fixture(){
  const data={'selectors.json':encode([selector])};
  for(let i=0;i<256;i++){
    data['id/'+i.toString(16).padStart(2,'0')+'.json']=encode(
      itemId%256===i?[{itemId,memberships:[relation]}]:[]);
  }
  const manifest={
    schema:'wand.db01.collection-set-universe-predicates@1',
    platform:'Steam',gameVersion:'1.26.2',
    privateOnly:true,publicationAuthorized:false,
    sourceSqliteSha256:'d'.repeat(64),sourceItemsSha256:source,
    sourceIl2cppDumpSha256:dump,
    originalCategorySha256:{
      CollectionSet:'e'.repeat(64),Tag:'f'.repeat(64),Set:'1'.repeat(64),
      Furniture:itemSource,Clothing:'2'.repeat(64)},
    sourceDefinitionCount:3,collectionSetCount:1,dynamicSelectorCount:2,
    resolvedSourcePredicateSelectors:1,unresolvedDynamicSelectors:1,
    resolvedByNativeCategory:{Furniture:1},explicitIgnoreMatches:1,
    candidateItemIds:1,candidateMemberships:1,bucketCount:256,
    sourcePredicateMatched:true,gameRuntimeMembershipVerified:false,
    gameUiVisibilityComplete:false,dlcOwnershipVerified:false,
    worldAvailabilityVerified:false,
    files:Object.fromEntries(Object.entries(data).map(([k,v])=>
      [k,{bytes:v.byteLength,sha256:sha(v),count:k==='selectors.json'||k===
        'id/'+(itemId%256).toString(16).padStart(2,'0')+'.json'?1:0}])),
  };
  const item={itemId,nativeCategory:'Furniture',sourceSha256:itemSource};
  const catalog={source:{platform:'Steam',gameVersion:'1.26.2',privateOnly:true,
    sourceItemsSha256:source,definitions:3},
    getItem:async id=>id===itemId?item:null,
    getItems:async ids=>ids.map(id=>id===itemId?item:null)};
  const requests=[];
  const loadBytes=async path=>{requests.push(path);return data[path];};
  return {manifest,data,catalog,requests,loadBytes};
}
test('exact source predicate relation is queryable but runtime membership remains unverified',async()=>{
  const f=fixture();
  const client=createDb01UniversePredicateClient(f.manifest,f.loadBytes,f.catalog);
  const links=await client.getItem(itemId);
  assert.equal(links.length,1);
  assert.equal(links[0].sourceSetItemId,linkedSet);
  assert.equal(links[0].universeTagKey,'Mickey');
  assert.equal(links[0].rule,DB01_COLLECTION_UNIVERSE_RULE);
  assert.equal(links[0].sourcePredicateMatched,true);
  assert.equal(links[0].gameUiVisibilityVerified,false);
  assert.equal(links[0].dlcOwnershipVerified,false);
  const results=await client.getItems([itemId,itemId,9000000]);
  assert.strictEqual(results[0],links);
  assert.strictEqual(results[1],links);
  assert.deepEqual(results[2],[]);
  assert.equal(client.source.unresolvedDynamicSelectors,1);
  const selectors=await client.getSelectors();
  assert.equal(selectors.length,1);
  assert.equal(selectors[0].explicitIgnoredMatches,1);
  assert.equal(selectors[0].gameRuntimeMembershipVerified,false);
  assert.equal(f.requests.length,3);
});
test('reject incompatible catalogs and inconsistent selector ledger before reading',()=>{
  const f=fixture();
  assert.throws(()=>createDb01UniversePredicateClient({
    ...f.manifest,dynamicSelectorCount:1},f.loadBytes,f.catalog),/COUNT_LEDGER/);
  assert.throws(()=>createDb01UniversePredicateClient({
    ...f.manifest,worldAvailabilityVerified:true},f.loadBytes,f.catalog),/PRIVATE_SOURCE/);
  assert.throws(()=>createDb01UniversePredicateClient(f.manifest,f.loadBytes,{
    ...f.catalog,source:{...f.catalog.source,gameVersion:'1.25.0'}}),
    /CATALOG_SOURCE/);
});
test('tamper in source shard cannot invent any predicate evidence',async()=>{
  const f=fixture();
  const path='id/'+(itemId%256).toString(16).padStart(2,'0')+'.json';
  f.data[path]=encode([]);
  await assert.rejects(
    createDb01UniversePredicateClient(f.manifest,f.loadBytes,f.catalog).getItem(itemId),
    /FILE_SHA|FILE_SIZE/);
});
test('self-consistently changed JSON must agree with canonical current source class/hash',async()=>{
  const f=fixture();
  const forged={...f.catalog,getItems:async ids=>ids.map(id=>id===itemId?
    {itemId,nativeCategory:'Furniture',sourceSha256:'0'.repeat(64)}:null)};
  await assert.rejects(createDb01UniversePredicateClient(
    f.manifest,f.loadBytes,forged).getItem(itemId),/SOURCE_IDENTITY/);
});
test('manifest mutation after source acceptance cannot retarget SHA verification',async()=>{
  const f=fixture();
  const client=createDb01UniversePredicateClient(f.manifest,f.loadBytes,f.catalog);
  const path='id/'+(itemId%256).toString(16).padStart(2,'0')+'.json';
  f.manifest.files[path].sha256='0'.repeat(64);
  assert.equal((await client.getItem(itemId))[0].universeTagKey,'Mickey');
});
