import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDb01ClassificationClient } from './classification.ts';
const sha=value=>createHash('sha256').update(value).digest('hex');
const bytes=text=>new TextEncoder().encode(text);
const abc='a'.repeat(64),tagSha='b'.repeat(64),sqliteSha='c'.repeat(64);
const row1={
  itemId:1,nativeCategory:'ActivityItem',nativeKey:'Synthetic!Carrot',
  sourceSha256:abc,
  tagReferences:[
    {tagId:2001400014,tagKey:'Vegetable',wireField:11,facet:'ingredientKind'},
    {tagId:2001200028,tagKey:'IsDreamlightValley',wireField:30,facet:'worldContextTag'},
  ],
  facets:{ingredientKind:['Vegetable'],worldContextTag:['IsDreamlightValley']},
  wireSubtypeCode:null,wireSubtypeMeaningVerified:false,gameUiCategoryVerified:false,
  dlcOwnershipVerified:false,worldAvailabilityVerified:false,
};
const row2={
  itemId:2,nativeCategory:'Tag',nativeKey:'Vegetable',sourceSha256:tagSha,
  tagReferences:[],facets:{},wireSubtypeCode:null,wireSubtypeMeaningVerified:false,
  gameUiCategoryVerified:false,dlcOwnershipVerified:false,worldAvailabilityVerified:false,
};
const originalRows=[
  {itemId:1,nativeCategory:'ActivityItem',nativeKey:'Synthetic!Carrot',sourceSha256:abc},
  {itemId:2,nativeCategory:'Tag',nativeKey:'Vegetable',sourceSha256:tagSha},
];
function fixture(){
  const files={},payloads={};
  for(let i=0;i<256;i++){
    const path='id/'+i.toString(16).padStart(2,'0')+'.json';
    const rows=i===1?[row1]:i===2?[row2]:[];
    const payload=bytes(JSON.stringify(rows)+'\n');
    payloads[path]=payload;
    files[path]={sha256:sha(payload),bytes:payload.length,count:rows.length};
  }
  const manifest={schema:'wand.db01.native-tag-overlay@1',
    platform:'Steam',gameVersion:'1.26.2',privateOnly:true,publicationAuthorized:false,
    sourceSqliteSha256:sqliteSha,sourceItemsSha256:abc,tagOriginalSha256:tagSha,
    sourceFilesSha256:{ActivityItem:abc,Tag:tagSha},
    definitionCount:2,tagDefinitionCount:1,taggedDefinitions:1,tagReferenceCount:2,
    byNativeCategory:{ActivityItem:1,Tag:1},
    facetCoverage:{ingredientKind:1,worldContextTag:1},
    bucketCount:256,gameUiTaxonomyComplete:false,worldAvailabilityVerified:false,
    dlcOwnershipVerified:false,files,
  };
  const source={privateOnly:true,platform:'Steam',gameVersion:'1.26.2',
    sourceItemsSha256:abc,definitions:2};
  const catalog={source,getItem:async id=>originalRows.find(v=>v.itemId===id)??null,
    getItems:async ids=>ids.map(id=>originalRows.find(v=>v.itemId===id)??null)};
  const requested=[];
  const loadBytes=async path=>{requested.push(path);return payloads[path];};
  return {manifest,catalog,requested,loadBytes,payloads};
}
test('lazy source-exact Tag facets, world-context not world availability, and many ID queries',async()=>{
  const f=fixture();const c=createDb01ClassificationClient(f.manifest,f.loadBytes,f.catalog);
  const first=await c.getItem(1);
  assert.equal(first.nativeCategory,'ActivityItem');
  assert.deepEqual(first.facets.ingredientKind,['Vegetable']);
  assert.deepEqual(first.facets.worldContextTag,['IsDreamlightValley']);
  assert.equal(first.worldAvailabilityVerified,false);
  assert.equal(first.dlcOwnershipVerified,false);
  assert.deepEqual(f.requested,['id/01.json']);
  assert.strictEqual(await c.getItem(1),first);
  const batch=await c.getItems([2,1,257,1]);
  assert.equal(batch.length,4);
  assert.equal(batch[0].nativeKey,'Vegetable');
  assert.strictEqual(batch[1],first);
  assert.equal(batch[2],null);
  assert.strictEqual(batch[3],first);
  assert.deepEqual(f.requested,['id/01.json','id/02.json']);
  assert.equal(c.source.taggedDefinitions,1);
  assert.equal(c.source.sourceItemsSha256,abc);
});
test('reject cross-version and other canonical source identity mismatches',()=>{
  const f=fixture();
  assert.throws(()=>createDb01ClassificationClient(f.manifest,f.loadBytes,
    {...f.catalog,source:{...f.catalog.source,gameVersion:'1.27.0'}}),
  /CATALOG_SOURCE_MISMATCH/);
  assert.throws(()=>createDb01ClassificationClient(f.manifest,f.loadBytes,
    {...f.catalog,source:{...f.catalog.source,sourceItemsSha256:'d'.repeat(64)}}),
  /CATALOG_SOURCE_MISMATCH/);
});
test('catalog record source identity is not inferred from matching numeric Item ID',async()=>{
  const f=fixture();
  const catalog={...f.catalog,
    getItem:async id=>id===1?{...originalRows[0],nativeKey:'AnotherItem'}:originalRows[1]};
  await assert.rejects(createDb01ClassificationClient(f.manifest,f.loadBytes,catalog).getItem(1),
    /ITEM_IDENTITY_MISMATCH/);
});
test('missing or tampered tag shards, manifest metadata and corpus status fail closed',async()=>{
  const f=fixture();
  const stale=f.payloads['id/01.json'];
  f.payloads['id/01.json']=bytes('[]\n');
  await assert.rejects(createDb01ClassificationClient(f.manifest,f.loadBytes,f.catalog).getItem(1),
    /ASSET_SIZE|ASSET_HASH/);
  f.payloads['id/01.json']=stale;
  f.manifest.gameUiTaxonomyComplete=true;
  assert.throws(()=>createDb01ClassificationClient(f.manifest,f.loadBytes,f.catalog),
    /INVALID_SOURCE_CONTRACT/);
  f.manifest.gameUiTaxonomyComplete=false;
  f.manifest.files['id/01.json'].count=0;
  assert.throws(()=>createDb01ClassificationClient(f.manifest,f.loadBytes,f.catalog),
    /SHARD_TOTAL/);
});
test('manifest snapshot resists caller mutation and does not redirect a future shard',async()=>{
  const f=fixture();
  const c=createDb01ClassificationClient(f.manifest,f.loadBytes,f.catalog);
  f.manifest.files['id/01.json'].sha256='f'.repeat(64);
  f.manifest.sourceFilesSha256.ActivityItem='d'.repeat(64);
  assert.equal((await c.getItem(1)).nativeKey,'Synthetic!Carrot');
});
test('reject invalid tag references even inside a separately hashed malicious shard',async()=>{
  const f=fixture();
  const bad={...row1,tagReferences:[...row1.tagReferences,{
    tagId:2000500001,tagKey:'Mickey',wireField:30,facet:'disneyUniverse',
  }],facets:{ingredientKind:['Vegetable'],worldContextTag:['IsDreamlightValley'],
    disneyUniverse:['Mickey']},dlcOwnershipVerified:true};
  const payload=bytes(JSON.stringify([bad])+'\n');
  f.manifest.files['id/01.json']={sha256:sha(payload),bytes:payload.length,count:1};
  f.payloads['id/01.json']=payload;
  await assert.rejects(createDb01ClassificationClient(f.manifest,f.loadBytes,f.catalog).getItem(1),
    /ROW_IDENTITY/);
});
