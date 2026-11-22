import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDb01ItemTypeClient} from './item-types.ts';
const sha=s=>createHash('sha256').update(s).digest('hex');
const sourceSha='a'.repeat(64),dbSha='b'.repeat(64),dumpSha='c'.repeat(64);
const row1={
  itemId:30_200_001,nativeCategory:'ActivityItem',sourceSha256:sourceSha,
  itemTypeCode:3,itemTypeName:'ActivityItem',subtypeCode:2,
  subtypeEnumName:'ActivityItemType',subtypeName:'Crop',subtypeNameVerified:true,
  sourceIl2cppDumpSha256:dumpSha,
  gameUiCategoryVerified:false,worldAvailabilityVerified:false,dlcOwnershipVerified:false,
};
const row2={
  itemId:10_000_001,nativeCategory:'Character',sourceSha256:sourceSha,
  itemTypeCode:1,itemTypeName:'Character',subtypeCode:0,
  subtypeEnumName:null,subtypeName:null,subtypeNameVerified:false,
  sourceIl2cppDumpSha256:dumpSha,
  gameUiCategoryVerified:false,worldAvailabilityVerified:false,dlcOwnershipVerified:false,
};
const rows=[row1,row2];
function fixture(){
  const files={},data={},byCategory={ActivityItem:1,Character:1};
  for(let i=0;i<256;i++){
    const name='id/'+i.toString(16).padStart(2,'0')+'.json';
    const payload=new TextEncoder().encode(JSON.stringify(
      rows.filter(row=>row.itemId%256===i))+'\n');
    data[name]=payload;
    files[name]={sha256:sha(payload),bytes:payload.length,
      count:rows.filter(row=>row.itemId%256===i).length};
  }
  const manifest={
    schema:'wand.db01.il2cpp-types@1',privateOnly:true,publicationAuthorized:false,
    platform:'Steam',gameVersion:'1.26.2',sourceSqliteSha256:dbSha,
    sourceItemsSha256:sourceSha,sourceIl2cppDumpSha256:dumpSha,
    itemTypeEnumName:'Definitions.Items.ItemType',definitionCount:2,
    sourceItemTypeVerified:2,sourceSubtypeNameVerified:1,
    sourceSubtypeNameUnverified:1,byNativeCategory:byCategory,
    subtypeVerifiedByCategory:{ActivityItem:1},
    subtypeUnverifiedByCategory:{Character:1},
    bucketCount:256,gameUiTaxonomyComplete:false,
    worldAvailabilityVerified:false,dlcOwnershipVerified:false,files,
  };
  const canonical={source:{privateOnly:true,platform:'Steam',gameVersion:'1.26.2',
    sourceItemsSha256:sourceSha,definitions:2},
    getItem:async id=>rows.find(x=>x.itemId===id)??null,
    getItems:async ids=>ids.map(id=>rows.find(x=>x.itemId===id)??null)};
  const requests=[];
  const load=async p=>{requests.push(p);return data[p];};
  return {manifest,canonical,requests,load,data};
}
test('exact native type and named subtype with still unknown UI category',async()=>{
  const f=fixture();
  const c=createDb01ItemTypeClient(f.manifest,f.load,f.canonical);
  const crop=await c.getItem(30_200_001);
  assert.equal(crop.itemTypeName,'ActivityItem');
  assert.equal(crop.subtypeName,'Crop');
  assert.equal(crop.subtypeEnumName,'ActivityItemType');
  assert.equal(crop.gameUiCategoryVerified,false);
  assert.equal(crop.dlcOwnershipVerified,false);
  const batch=await c.getItems([10_000_001,30_200_001,999_999_999,30_200_001]);
  assert.equal(batch[0].itemTypeName,'Character');
  assert.equal(batch[0].subtypeName,null);
  assert.strictEqual(batch[1],crop);
  assert.equal(batch[2],null);
  assert.strictEqual(batch[3],crop);
  assert.equal(new Set(f.requests).size,3); // missing ID has its own verified bucket
  assert.equal(c.source.sourceSubtypeNameVerified,1);
});
test('reject untrusted manifest or cross-version mismatches before loading files',()=>{
  const f=fixture();
  assert.throws(()=>createDb01ItemTypeClient({...f.manifest,
    sourceItemTypeVerified:1},f.load,f.canonical),/COVERAGE_LEDGER/);
  assert.throws(()=>createDb01ItemTypeClient(f.manifest,f.load,
    {...f.canonical,source:{...f.canonical.source,gameVersion:'1.27.0'}}),
    /CATALOG_SOURCE_MISMATCH/);
});
test('tampered full shard and self-consistent forged subtype code rejected',async()=>{
  const f=fixture();
  const name='id/'+(row1.itemId%256).toString(16).padStart(2,'0')+'.json';
  f.data[name]=new TextEncoder().encode('[]\n');
  await assert.rejects(createDb01ItemTypeClient(f.manifest,f.load,f.canonical)
    .getItem(row1.itemId),/SHARD_SIZE|SHARD_SHA/);
  const bad={...row1,subtypeCode:8,subtypeName:'Jacket'};
  const payload=new TextEncoder().encode(JSON.stringify([bad])+'\n');
  f.manifest.files[name]={sha256:sha(payload),bytes:payload.length,count:1};
  f.data[name]=payload;
  await assert.rejects(createDb01ItemTypeClient(f.manifest,f.load,f.canonical)
    .getItem(row1.itemId),/ITEM_SOURCE_OR_ENUM_MISMATCH/);
});
test('caller mutation after validation cannot retarget SHA or source identity',async()=>{
  const f=fixture();
  const client=createDb01ItemTypeClient(f.manifest,f.load,f.canonical);
  const name='id/'+(row1.itemId%256).toString(16).padStart(2,'0')+'.json';
  f.manifest.files[name].sha256='f'.repeat(64);
  assert.equal((await client.getItem(row1.itemId)).subtypeName,'Crop');
});
test('missing original/overlay definition is rejected',async()=>{
  const f=fixture();
  const canonical={...f.canonical,getItem:async()=>null};
  await assert.rejects(
    createDb01ItemTypeClient(f.manifest,f.load,canonical).getItem(row1.itemId),
    /CANONICAL_IDENTITY_MISMATCH/);
});
