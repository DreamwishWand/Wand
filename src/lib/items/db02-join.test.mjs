import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDb01Db02Join, DB01_DB02_JOIN_CONTRACT } from './db02-join.ts';
const sha = text => createHash('sha256').update(text).digest('hex');
const currentCondition='9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
const staleCondition='f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150';
function fixture(options={}) {
  const nativeSha=sha('SRC01-native-manifest');
  const source={platform:'Steam',gameVersion:'1.26.2'};
  const item=Object.freeze({itemId:30000031,nativeCategory:'ActivityItem',catalogDomain:'item',nativeKey:'Crafting!PurifiedNightShard'});
  const calls=[];
  const catalog={source:{...source,privateOnly:true,nativeSourceManifestSha256:nativeSha},
    async getItem(id){calls.push(['db01',id]);return id===30000031?item:null;}};
  const db02={source:{...source},getItem(id){calls.push(['db02',id]);return options.noAcquisition ? null :
    {itemId:id,source:{...source},status:'unresolved_or_no_verified_link',possibleStalls:[]};}};
  const manifest={schema:'wand.src02@1',status:'partial_native_extraction',...source,
    source:{src01ManifestSha256:nativeSha,src01ItemsSha256:sha('SRC01-native-items'),conditionSha256:currentCondition},
    files:Object.fromEntries(['recipes.jsonl','acquisitions.jsonl','loot-tables.jsonl','related-items.jsonl','condition-gates.jsonl','condition-definitions.jsonl'].map(name=>[name,sha(name)]))};
  const bytes=new TextEncoder().encode(JSON.stringify(manifest));
  const pins={manifestSha256:sha(bytes),currentConditionSha256:currentCondition};
  return {catalog,db02,manifest,bytes,pins,calls,item};
}
test('same-version source-verified static DB-02 item match, no entitlement or availability promotion',async()=>{
  const f=fixture();const join=await createDb01Db02Join(f.catalog,f.db02,f.bytes,f.pins);
  const value=await join.getItem(30000031);
  assert.equal(join.contract,DB01_DB02_JOIN_CONTRACT);
  assert.equal(value.status,'exact_current_definition_id');
  assert.equal(value.definition,f.item);
  assert.equal(value.staticAcquisition.status,'unresolved_or_no_verified_link');
  assert.deepEqual(f.calls,[['db01',30000031],['db02',30000031]]);
  assert.equal(value.liveAvailabilityVerified,false);
  assert.equal(value.unlockOrEntitlementVerified,false);
  assert.equal(value.publicationAuthorized,false);
  assert.equal(value.saveWritingAuthorized,false);
});
test('partial catalog absence does not imply game item absence or unavailable acquisition',async()=>{
  const f=fixture();const j=await createDb01Db02Join(f.catalog,f.db02,f.bytes,f.pins);
  const value=await j.getItem(999999);
  assert.equal(value.status,'not_in_partial_db01_catalog');
  assert.equal(value.definition,null);
  assert.equal(value.staticAcquisition.itemId,999999);
  assert.equal(value.liveAvailabilityVerified,false);
});
test('missing DB-02 static info stays unknown, not negative availability',async()=>{
  const f=fixture({noAcquisition:true});const j=await createDb01Db02Join(f.catalog,f.db02,f.bytes,f.pins);
  const value=await j.getItem(30000031);
  assert.equal(value.staticAcquisition,null);
  assert.equal(value.status,'exact_current_definition_id');
});
test('rejects archived 1.26.1 Condition SHA misrepresented as v1.26.2',async()=>{
  const f=fixture();f.manifest.source.conditionSha256=staleCondition;
  f.bytes=new TextEncoder().encode(JSON.stringify(f.manifest));f.pins.manifestSha256=sha(f.bytes);
  await assert.rejects(createDb01Db02Join(f.catalog,f.db02,f.bytes,f.pins),/CURRENT_CONDITION_SOURCE_REQUIRED/);
  const good=fixture();good.pins.currentConditionSha256=staleCondition;
  await assert.rejects(createDb01Db02Join(good.catalog,good.db02,good.bytes,good.pins),/CURRENT_CONDITION_SOURCE_REQUIRED/);
});
test('rejects Guide/World old game versions and SRC01 native-chain mismatch',async()=>{
  const f=fixture();f.manifest.gameVersion='1.26.1';
  f.bytes=new TextEncoder().encode(JSON.stringify(f.manifest));f.pins.manifestSha256=sha(f.bytes);
  await assert.rejects(createDb01Db02Join(f.catalog,f.db02,f.bytes,f.pins),/EXACT_VERSION_REQUIRED/);
  const g=fixture();g.manifest.source.src01ManifestSha256=sha('foreign-native');
  g.bytes=new TextEncoder().encode(JSON.stringify(g.manifest));g.pins.manifestSha256=sha(g.bytes);
  await assert.rejects(createDb01Db02Join(g.catalog,g.db02,g.bytes,g.pins),/NATIVE_SOURCE_CHAIN_MISMATCH/);
});
test('requires external trusted exact manifest bytes and complete file hash ledger',async()=>{
  const f=fixture();f.bytes[15]^=1;
  await assert.rejects(createDb01Db02Join(f.catalog,f.db02,f.bytes,f.pins),/MANIFEST_HASH_MISMATCH/);
  const g=fixture();delete g.manifest.files['related-items.jsonl'];
  g.bytes=new TextEncoder().encode(JSON.stringify(g.manifest));g.pins.manifestSha256=sha(g.bytes);
  await assert.rejects(createDb01Db02Join(g.catalog,g.db02,g.bytes,g.pins),/DB02_OUTPUT_EVIDENCE_MISSING/);
});
test('rejects foreign DB-02 consumer, wrong row identity, invalid numeric Item ID',async()=>{
  const f=fixture();f.db02.source.gameVersion='1.26.1';
  await assert.rejects(createDb01Db02Join(f.catalog,f.db02,f.bytes,f.pins),/DB02_CONSUMER_VERSION_MISMATCH/);
  const g=fixture();g.db02.getItem=id=>({itemId:id+1,source:g.db02.source});
  const j=await createDb01Db02Join(g.catalog,g.db02,g.bytes,g.pins);
  await assert.rejects(j.getItem(30000031),/DB02_RESULT_PROVENANCE_MISMATCH/);
  await assert.rejects(j.getItem(0),/INVALID_ITEM_ID/);
  await assert.rejects(j.getItem(Number.MAX_SAFE_INTEGER+1),/INVALID_ITEM_ID/);
});