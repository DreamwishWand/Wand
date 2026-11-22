import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDb01SpecialClient,DB01_SPECIAL_EVIDENCE} from './collection-special.ts';

const sha=v=>createHash('sha256').update(v).digest('hex');
const bytes=v=>new TextEncoder().encode(JSON.stringify(v)+'\n');
const sourceSha='a'.repeat(64),sqliteSha='b'.repeat(64),dumpSha='c'.repeat(64);
const memorySha='d'.repeat(64);
const itemId=31500001;
const match={
  setId:2120000024,submenuCode:6,groupIndex:0,selectorIndex:0,
  selectorKind:7,family:'MemoryShard',nativeCategory:'MemoryShard',
  originalField:'UniverseTagItemID',criterion:2000500001,tagKey:'Mickey',
  evidence:DB01_SPECIAL_EVIDENCE,sourcePredicateMatched:true,
  gameUiMembershipVerified:false,gameUiVisibilityVerified:false,
  worldAvailabilityVerified:false,dlcOwnershipVerified:false,
};
const positive={
  setId:2120000024,submenuCode:6,groupIndex:0,selectorIndex:0,
  selectorKind:7,family:'MemoryShard',field:'UniverseTagItemID',
  criterion:2000500001,tagKey:'Mickey',
  negative:false,sourceMatchedItemCount:2,candidateIncludedCount:1,
  explicitOrNegativeExcludedCount:1,gameUiMembershipVerified:false,
};
const negative={
  setId:2120000024,submenuCode:6,groupIndex:0,selectorIndex:1,
  selectorKind:7,family:'MemoryShard',field:'MemoryShardTagItemID',
  criterion:2001300012,tagKey:'DalmatiansJournal',
  negative:true,sourceMatchedItemCount:1,candidateIncludedCount:0,
  gameUiMembershipVerified:false,
};
function fixture(){
  const data={'selectors.json':bytes([positive,negative])};
  for(let i=0;i<256;i++){
    data['id/'+i.toString(16).padStart(2,'0')+'.json']=
      bytes(itemId%256===i?[{
        itemId,nativeCategory:'MemoryShard',sourceSha256:memorySha,
        memberships:[match],
      }]:[]);
  }
  const files=Object.fromEntries(Object.entries(data).map(([name,body])=>[
    name,{sha256:sha(body),bytes:body.byteLength,
      count:name==='selectors.json'?2:
        name==='id/'+(itemId%256).toString(16).padStart(2,'0')+'.json'?1:0}
  ]));
  const manifest={
    schema:'wand.db01.collection-special-predicates@1',
    platform:'Steam',gameVersion:'1.26.2',
    privateOnly:true,publicationAuthorized:false,
    sourceSqliteSha256:sqliteSha,sourceItemsSha256:sourceSha,
    sourceIl2cppDumpSha256:dumpSha,
    originalCategorySha256:{CollectionSet:'e'.repeat(64),Tag:'f'.repeat(64),
      Character:'1'.repeat(64),MemoryShard:memorySha,
      BoardGame:'2'.repeat(64),Companion:'3'.repeat(64)},
    definitionCount:3,collectionSetCount:1,totalDynamicSelectors:3,
    handledSourceSelectors:2,unresolvedDynamicSelectors:1,
    negativeSelectorsHandled:1,selectorsBySourceKind:{'7':2},
    explicitOrNegativeExcludedCount:1,
    candidateItemIds:1,candidateMemberships:1,bucketCount:256,
    gameRuntimeMembershipVerified:false,gameUiVisibilityComplete:false,
    worldAvailabilityVerified:false,dlcOwnershipVerified:false,files,
  };
  const item={itemId,nativeCategory:'MemoryShard',sourceSha256:memorySha};
  const catalog={source:{privateOnly:true,platform:'Steam',gameVersion:'1.26.2',
    sourceItemsSha256:sourceSha,definitions:3},
    getItem:async id=>id===itemId?item:null,
    getItems:async ids=>ids.map(id=>id===itemId?item:null)};
  const requests=[];
  const load=async path=>{requests.push(path);return data[path];};
  return {data,manifest,catalog,load,requests};
}
test('original memory selector links and negative source filter are distinct',async()=>{
  const f=fixture();
  const client=createDb01SpecialClient(f.manifest,f.load,f.catalog);
  const refs=await client.getItem(itemId);
  assert.equal(refs.length,1);
  assert.equal(refs[0].evidence,DB01_SPECIAL_EVIDENCE);
  assert.equal(refs[0].originalField,'UniverseTagItemID');
  assert.equal(refs[0].sourcePredicateMatched,true);
  assert.equal(refs[0].gameUiMembershipVerified,false);
  assert.equal(refs[0].dlcOwnershipVerified,false);
  const selectors=await client.getSelectors();
  assert.equal(selectors.length,2);
  assert.equal(selectors[1].negative,true);
  assert.equal(selectors[1].candidateIncludedCount,0);
  assert.equal(client.source.unresolvedDynamicSelectors,1);
  const many=await client.getItems([itemId,itemId,1]);
  assert.strictEqual(many[0],refs);
  assert.strictEqual(many[1],refs);
  assert.deepEqual(many[2],[]);
  assert.equal(f.requests.length,3);
});
test('rejects reclassified source versions and publication consent forgery',()=>{
  const f=fixture();
  assert.throws(()=>createDb01SpecialClient(
    {...f.manifest,publicationAuthorized:true},f.load,f.catalog),/SOURCE_CONTRACT/);
  assert.throws(()=>createDb01SpecialClient(f.manifest,f.load,{
    ...f.catalog,source:{...f.catalog.source,gameVersion:'1.27.0'}},),/CATALOG_SOURCE/);
});
test('tampered shard is never a valid source predicate',async()=>{
  const f=fixture();
  const path='id/'+(itemId%256).toString(16).padStart(2,'0')+'.json';
  f.data[path]=bytes([]);
  await assert.rejects(createDb01SpecialClient(
    f.manifest,f.load,f.catalog).getItem(itemId),/BYTES_MISMATCH|FILE_SHA_MISMATCH/);
});
test('cross-catalog source identity must match even for same Item ID',async()=>{
  const f=fixture();
  await assert.rejects(createDb01SpecialClient(
    f.manifest,f.load,{...f.catalog,getItems:async ids=>
      ids.map(id=>id===itemId?{itemId,nativeCategory:'Character',
        sourceSha256:memorySha}:null)}).getItem(itemId),/ORIGINAL_ITEM_IDENTITY/);
});
test('snapshot manifest is immutable against subsequent caller modifications',async()=>{
  const f=fixture();
  const c=createDb01SpecialClient(f.manifest,f.load,f.catalog);
  const path='id/'+(itemId%256).toString(16).padStart(2,'0')+'.json';
  f.manifest.files[path].sha256='0'.repeat(64);
  assert.equal((await c.getItem(itemId))[0].tagKey,'Mickey');
});
