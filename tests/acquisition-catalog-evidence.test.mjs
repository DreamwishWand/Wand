import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditFiles } from '../tools/src-02-acquisition/audit_catalog.mjs';
import { createAcquisitionCatalogEvidence } from '../src/lib/acquisition/catalog-evidence.ts';

const hash=x=>createHash('sha256').update(x).digest('hex');
const json=x=>Buffer.from(JSON.stringify(x)+'\n');
const lines=xs=>Buffer.from(xs.map(x=>JSON.stringify(x)).join('\n')+'\n');
const sha1='a'.repeat(64),sha2='b'.repeat(64);
function buildFixture(overrides={}){
  const src01={schema:'wand.src01.steam-native@1',gameVersion:'1.26.2',platform:'Steam',itemCount:1,itemsSha256:sha1,
    sourceFiles:[{path:'ddv_Data/StreamingAssets/itemlist/Furniture.json',sha256:sha1,count:1}]};
  const extended={schema:'wand.src01.extended@1',gameVersion:'1.26.2',platform:'Steam',itemsSha256:sha2,
    categories:{'Currency.json':{status:'native_wire_verified',count:1,sha256:sha2,source:'ddv_Data/StreamingAssets/itemlist/Currency.json'}}};
  const src01Bytes=json(src01),extBytes=json(extended);
  const db01Rows=[
    {itemId:11,nativeCategory:'Furniture',catalogDomain:'item',source:{file:'ddv_Data/StreamingAssets/itemlist/Furniture.json',sha256:sha1,platform:'Steam',gameVersion:'1.26.2'},verification:{itemId:'native_frame_verified',nativeCategory:'native_file_verified'}},
    {itemId:22,nativeCategory:'Currency',catalogDomain:'definition_unclassified',source:{file:'ddv_Data/StreamingAssets/itemlist/Currency.json',sha256:sha2,platform:'Steam',gameVersion:'1.26.2'},verification:{itemId:'native_frame_verified',nativeCategory:'native_file_verified'}}
  ];
  const relatedRows=[{itemId:11,inSrc01:true},{itemId:22,inSrc01:false},{itemId:33,inSrc01:false}];
  const db01={schema:'wand.db01.partial-manifest@2',count:2,platform:'Steam',gameVersion:'1.26.2',catalogDomains:{collectionItem:1,unclassifiedDefinition:1},
    sources:[{schema:src01.schema,manifestSha256:hash(src01Bytes),itemsSha256:sha1},{schema:extended.schema,manifestSha256:hash(extBytes),itemsSha256:sha2}],
    outputSha256:{'items.jsonl':hash(lines(db01Rows))}};
  const src02={schema:'wand.src02@1',status:'partial_native_extraction',platform:'Steam',gameVersion:'1.26.2',
    counts:{linkedItemIds:3,unresolvedLinkedItemIds:2},files:{'related-items.jsonl':hash(lines(relatedRows))},
    source:{src01ManifestSha256:hash(src01Bytes),src01ItemsSha256:sha1}};
  const guide={schema:'wand.db03.native-guide@1',target:{gameVersion:'1.26.1',platform:'Steam'}};
  const content={src02Manifest:json(src02),related:lines(relatedRows),db01Manifest:json(db01),db01Items:lines(db01Rows),src01Manifest:src01Bytes,extendedManifest:extBytes,guideManifest:json(guide)};
  return {...content,...overrides};
}
async function run(input,fn){
  const dir=await mkdtemp(join(tmpdir(),'db02-catalog-audit-'));
  try{
    const paths={};
    for(const [key,bytes] of Object.entries(input)){
      const p=join(dir,key+'.json');await writeFile(p,bytes);paths[key]=p;
    }
    return await fn(paths,dir);
  }finally{await rm(dir,{recursive:true,force:true});}
}
test('catalog audit separates source item, native definition-only, unresolved and blocked Guide version',async()=>{
  await run(buildFixture(),async p=>{
    const audit=await auditFiles(p);
    assert.equal(audit.counts.originalSrc01Items,1);
    assert.equal(audit.counts.additionalNativeDefinitions,1);
    assert.equal(audit.counts.unresolvedReferences,1);
    assert.equal(audit.guideIntegration.status,'blocked_cross_version');
    assert.equal(audit.guideIntegration.rewardRelationVerified,false);
    const index=createAcquisitionCatalogEvidence(audit,{
      src02ManifestSha256:hash(await readFile(p.src02Manifest)),db01ManifestSha256:hash(await readFile(p.db01Manifest))
    });
    assert.equal(index.lookupUnindexedItem(22).nativeCategory,'Currency');
    assert.equal(index.lookupUnindexedItem('33').classification,'unresolved_in_partial_native_index');
    assert.equal(index.lookupUnindexedItem(11),null);
    assert.equal(index.crossVersionGuideBlocked,true);
    assert.equal(index.inventoryVerified,false);
    assert.equal(index.collectibilityVerified,false);
  });
});
test('tampered catalog row bytes fail digest before classification',async()=>{
  await run(buildFixture(),async p=>{
    await writeFile(p.db01Items,lines([{itemId:22}]));
    await assert.rejects(auditFiles(p),/DB01_ITEMS_SHA_MISMATCH/);
  });
});
test('modified original SRC-01 manifest fails chain of provenance',async()=>{
  const f=buildFixture();const src01=JSON.parse(f.src01Manifest);src01.itemCount=200;
  await run({...f,src01Manifest:json(src01)},async p=>assert.rejects(auditFiles(p),/SRC02_PARENT_SRC01_MISMATCH/));
});
test('DB-01 reordered original source hashes are rejected',async()=>{
  const f=buildFixture(),db01=JSON.parse(f.db01Manifest);
  db01.sources[0].manifestSha256=sha2;
  await run({...f,db01Manifest:json(db01)},async p=>assert.rejects(auditFiles(p),/DB01_PARENT_SRC01_MISMATCH/));
});
test('exact target mismatch refuses cross-version DB-01 data',async()=>{
  const f=buildFixture(),db01=JSON.parse(f.db01Manifest);
  db01.gameVersion='1.26.1';
  await run({...f,db01Manifest:json(db01)},async p=>assert.rejects(auditFiles(p),/DB01_TARGET/));
});
test('definition-only evidence cannot be relabeled as collectible without source validation',async()=>{
  const f=buildFixture(),rows=f.db01Items.toString().trim().split('\n').map(JSON.parse),db01=JSON.parse(f.db01Manifest);
  rows[1].catalogDomain='item'; db01.outputSha256['items.jsonl']=hash(lines(rows));
  await run({...f,db01Items:lines(rows),db01Manifest:json(db01)},async p=>assert.rejects(auditFiles(p),/UNSUPPORTED_DEFINITION_PROVENANCE/));
});
test('original indexed Item ID cannot disappear from matching DB-01 coverage',async()=>{
  const f=buildFixture(),rows=f.related.toString().trim().split('\n').map(JSON.parse),src02=JSON.parse(f.src02Manifest);
  rows[0].itemId=44;src02.files['related-items.jsonl']=hash(lines(rows));
  await run({...f,related:lines(rows),src02Manifest:json(src02)},async p=>assert.rejects(auditFiles(p),/ORIGINAL_ITEM_NOT_IN_DB01/));
});
test('duplicate definition IDs are not silently overwritten',async()=>{
  const f=buildFixture(),rows=f.db01Items.toString().trim().split('\n').map(JSON.parse),db01=JSON.parse(f.db01Manifest);
  rows[1].itemId=11;db01.outputSha256['items.jsonl']=hash(lines(rows));
  await run({...f,db01Items:lines(rows),db01Manifest:json(db01)},async p=>assert.rejects(auditFiles(p),/DUPLICATE_OR_INVALID_ID/));
});
test('forged source counts reject missing records even with updated checksum',async()=>{
  const f=buildFixture(),db01=JSON.parse(f.db01Manifest);db01.catalogDomains.collectionItem=15;
  await run({...f,db01Manifest:json(db01)},async p=>assert.rejects(auditFiles(p),/CATALOG_DOMAIN_COUNT/));
});
test('guide match does not authorize quest rewards',async()=>{
  const f=buildFixture();const guide={schema:'wand.db03.native-guide@1',target:{gameVersion:'1.26.2',platform:'Steam'}};
  await run({...f,guideManifest:json(guide)},async p=>{
    const a=await auditFiles(p);assert.equal(a.guideIntegration.status,'matching_version_semantics_unverified');
    assert.equal(a.guideIntegration.rewardRelationVerified,false);
  });
});
test('consumer requires independent trusted source digests and rejects forging unsafe availability',async()=>{
  await run(buildFixture(),async p=>{
    const a=await auditFiles(p);const pins={src02ManifestSha256:hash(await readFile(p.src02Manifest)),db01ManifestSha256:hash(await readFile(p.db01Manifest))};
    assert.throws(()=>createAcquisitionCatalogEvidence(a),/VERIFIED_AUDIT_REQUIRED/);
    assert.throws(()=>createAcquisitionCatalogEvidence(a,{...pins,db01ManifestSha256:sha1}),/VERIFIED_AUDIT_REQUIRED/);
    assert.throws(()=>createAcquisitionCatalogEvidence({...a,limits:{...a.limits,liveStockVerified:true}},pins),/UNSAFE_AUDIT/);
    assert.throws(()=>createAcquisitionCatalogEvidence({...a,supplementalDefinitions:[...a.supplementalDefinitions,a.supplementalDefinitions[0]]},pins),/INVALID_COUNTS/);
  });
});
test('symlinked private input is rejected before parsing',async()=>{
  await run(buildFixture(),async(p,dir)=>{
    const alias=join(dir,'alias.json');await symlink(p.db01Manifest,alias);p.db01Manifest=alias;
    await assert.rejects(auditFiles(p),/INVALID_FILE|SYMLINK_PATH/);
  });
});
test('audit never overwrites a private source file',async()=>{
  await run(buildFixture(),async p=>{
    await assert.rejects(auditFiles({...p,out:p.db01Manifest}),/OUTPUT_OVERWRITES_INPUT/);
  });
});

test('typed catalog projection retains only vetted fields and immutable evidence',async()=>{
  await run(buildFixture(),async p=>{
    const audit=await auditFiles(p);
    const pins={src02ManifestSha256:hash(await readFile(p.src02Manifest)),
      db01ManifestSha256:hash(await readFile(p.db01Manifest))};
    const result=createAcquisitionCatalogEvidence(audit,pins);
    assert(Object.isFrozen(result));
    assert(Object.isFrozen(result.counts));
    assert(Object.isFrozen(result.target));
    const row=result.lookupUnindexedItem('22');
    assert(Object.isFrozen(row));
    assert.deepEqual(Object.keys(row).sort(),[
      'acquirableVerified','classification','id','itemId','nativeCategory',
      'sourceFile','sourceSha256'
    ]);
    audit.supplementalDefinitions[0].nativeCategory='Tampered';
    audit.counts.additionalNativeDefinitions=999;
    assert.equal(row.id,22); // Preserve source audit numeric ID.
    assert.equal(row.itemId,'22'); // Stable DB-00 ID string.
    assert.equal(row.nativeCategory,'Currency');
    assert.equal(result.counts.additionalNativeDefinitions,1);
    assert.equal(result.lookupUnindexedItem(33).acquirableVerified,false);
    assert.equal(result.lookupUnindexedItem(11),null);
  });
});

test('typed catalog rejects unsafe source paths, malformed category and ownership claims',async()=>{
  await run(buildFixture(),async p=>{
    const audit=await auditFiles(p);
    const pins={src02ManifestSha256:hash(await readFile(p.src02Manifest)),
      db01ManifestSha256:hash(await readFile(p.db01Manifest))};
    const rewrap=(patch)=>({...audit,...patch});
    assert.throws(()=>createAcquisitionCatalogEvidence(rewrap({
      limits:{...audit.limits,ownershipVerified:true}
    }),pins),/UNSAFE_AUDIT/);
    assert.throws(()=>createAcquisitionCatalogEvidence(rewrap({
      limits:{...audit.limits,questRewardVerified:true}
    }),pins),/UNSAFE_AUDIT/);
    assert.throws(()=>createAcquisitionCatalogEvidence(rewrap({
      supplementalDefinitions:audit.supplementalDefinitions.map(row=>
        row.classification==='native_definition_only_unclassified'?
          {...row,sourceFile:'../private/save.json'}:row)
    }),pins),/INVALID_SOURCE/);
    assert.throws(()=>createAcquisitionCatalogEvidence(rewrap({
      supplementalDefinitions:audit.supplementalDefinitions.map(row=>
        row.classification==='native_definition_only_unclassified'?
          {...row,nativeCategory:'../Currency'}:row)
    }),pins),/INVALID_SOURCE/);
    assert.throws(()=>createAcquisitionCatalogEvidence(rewrap({
      supplementalDefinitions:audit.supplementalDefinitions.map(row=>
        row.classification==='unresolved_in_partial_native_index'?
          {...row,sourceSha256:'a'.repeat(64)}:row)
    }),pins),/UNSAFE_UNRESOLVED/);
    assert.throws(()=>createAcquisitionCatalogEvidence(rewrap({
      counts:{...audit.counts,nativeDb01Definitions:-1}
    }),pins),/INVALID_COUNTS/);
  });
});
