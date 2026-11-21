#!/usr/bin/env node
/**
 * SRC-02 / DB-01 source-grounded catalog audit (read only).
 * The DB-01 extended corpus is a partial *definition* index, not an item
 * entitlement catalog. A hit in a definition-only category is never evidence
 * that the referenced ID is a collectable or is acquirable in the live game.
 */
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile, realpath, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const AUDIT_SCHEMA = 'wand.db02.db01-evidence@1';
const SHA = /^[a-f0-9]{64}$/;
const ERROR = (code) => { throw new Error('DB02_CATALOG_AUDIT_' + code); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validId = x => Number.isSafeInteger(x) && x > 0;
const filename = x => 'ddv_Data/StreamingAssets/itemlist/' + x + '.json';
const serial = x => JSON.stringify(x, null, 2) + '\n';

async function checkedBytes(path, limit=64*1024*1024) {
  const resolved=resolve(path);
  const s=await lstat(resolved);
  if (!s.isFile() || s.isSymbolicLink() || s.size > limit) ERROR('INVALID_FILE');
  // Resolve must remain the same file; refuse symlinked parents as well.
  if (await realpath(resolved) !== resolved) ERROR('SYMLINK_PATH');
  return readFile(resolved);
}
async function checkedJSON(path, limit) { return JSON.parse((await checkedBytes(path, limit)).toString('utf8')); }
function requireHash(value, expected, code) {
  if (!SHA.test(expected ?? '') || hash(value) !== expected) ERROR(code);
}
function expect(condition, code) { if (!condition) ERROR(code); }
function categoryMap(src01, expanded) {
  const result=new Map();
  for (const file of src01.sourceFiles) {
    const category=file.path.match(/\/([A-Za-z]+)\.json$/)?.[1];
    expect(category && Number.isSafeInteger(file.count) && file.count > 0 && SHA.test(file.sha256), 'SRC01_CATEGORY');
    expect(!result.has(category), 'DUPLICATE_CATEGORY');
    result.set(category,{domain:'item', sha256:file.sha256, count:file.count, file:file.path});
  }
  for (const [categoryName, data] of Object.entries(expanded.categories)) {
    if (data.status === 'verified_empty') continue;
    const category=categoryName.match(/^([A-Za-z]+)\.json$/)?.[1];
    expect(category && data.status==='native_wire_verified' && SHA.test(data.sha256) && Number.isSafeInteger(data.count) && data.count > 0 && data.source===filename(category), 'EXTENDED_CATEGORY');
    expect(!result.has(category), 'DUPLICATE_CATEGORY');
    result.set(category,{domain:'definition_unclassified', sha256:data.sha256, count:data.count, file:data.source});
  }
  return result;
}
function parseJsonl(bytes, schemaKey, maxLines=30000) {
  const result=[];
  for (const line of bytes.toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    expect(result.length < maxLines, 'OVERSIZE_'+schemaKey);
    result.push(JSON.parse(line));
  }
  return result;
}
function verifyCatalog(db01, db01Rows, src01, expanded, src02, src01Bytes, expandedBytes) {
  expect(db01?.schema==='wand.db01.partial-manifest@2', 'DB01_SCHEMA');
  expect(db01.platform===src02.platform && db01.gameVersion===src02.gameVersion, 'DB01_TARGET');
  expect(src01?.schema==='wand.src01.steam-native@1' && src01.platform===src02.platform && src01.gameVersion===src02.gameVersion && src01.itemsSha256===src02.source?.src01ItemsSha256, 'SRC01_TARGET');
  expect(expanded?.schema==='wand.src01.extended@1' && expanded.platform===src02.platform && expanded.gameVersion===src02.gameVersion, 'EXTENDED_TARGET');
  expect(SHA.test(src02.source?.src01ManifestSha256??'') && hash(src01Bytes)===src02.source.src01ManifestSha256, 'SRC02_PARENT_SRC01_MISMATCH');
  expect(db01?.sources?.length===2 && db01.sources[0].schema===src01.schema && db01.sources[0].manifestSha256===hash(src01Bytes) && db01.sources[0].itemsSha256===src01.itemsSha256, 'DB01_PARENT_SRC01_MISMATCH');
  expect(db01.sources[1].schema===expanded.schema && db01.sources[1].manifestSha256===hash(expandedBytes) && db01.sources[1].itemsSha256===expanded.itemsSha256, 'DB01_PARENT_EXTENDED_MISMATCH');
  expect(db01Rows.length === db01.count, 'DB01_ROW_COUNT');
  const categories=categoryMap(src01,expanded);
  const observed=new Map();
  const catalog=new Map();
  const domainCount={item:0,definition_unclassified:0};
  for (const row of db01Rows) {
    expect(validId(row?.itemId) && !catalog.has(row.itemId), 'DUPLICATE_OR_INVALID_ID');
    const category=categories.get(row.nativeCategory);
    expect(category && row.catalogDomain === category.domain && row.source?.file===category.file && row.source?.sha256===category.sha256, 'UNSUPPORTED_DEFINITION_PROVENANCE');
    expect(row.source.platform===src02.platform && row.source.gameVersion===src02.gameVersion && row.verification?.itemId==='native_frame_verified' && row.verification?.nativeCategory==='native_file_verified', 'UNVERIFIED_NATIVE_ROW');
    catalog.set(row.itemId,row);
    domainCount[row.catalogDomain]++;
    observed.set(row.nativeCategory,(observed.get(row.nativeCategory)??0)+1);
  }
  for(const [name,expected] of categories) expect(observed.get(name)===expected.count,'CATEGORY_COUNT_'+name);
  expect(domainCount.item===db01.catalogDomains?.collectionItem && domainCount.definition_unclassified===db01.catalogDomains?.unclassifiedDefinition, 'CATALOG_DOMAIN_COUNT');
  return catalog;
}
export function auditCatalog({src02, relatedItems, db01, db01Rows, src01, extended, src01Bytes, extendedBytes, guideManifest=null, digests}) {
  expect(src02?.schema==='wand.src02@1' && src02.status==='partial_native_extraction', 'SRC02_SCHEMA');
  expect(SHA.test(src02.files?.['related-items.jsonl']) && SHA.test(digests?.related), 'SRC02_RELATED_DIGEST');
  expect(digests.related===src02.files['related-items.jsonl'], 'SRC02_RELATED_SHA_MISMATCH');
  const catalog=verifyCatalog(db01,db01Rows,src01,extended,src02,src01Bytes,extendedBytes);
  const seen=new Set();
  let inOriginal=0;const supplemental=[];
  const counts={originalSrc01Items:0,additionalNativeDefinitions:0,unresolvedReferences:0};
  for(const row of relatedItems){
    const id=row?.itemId;
    expect(validId(id) && !seen.has(id) && typeof row.inSrc01==='boolean','INVALID_RELATED_ITEM');
    seen.add(id);
    const found=catalog.get(id);
    if (row.inSrc01) {
      expect(found?.catalogDomain==='item', 'ORIGINAL_ITEM_NOT_IN_DB01');
      inOriginal++;
      counts.originalSrc01Items++;
      continue;
    }
    if(found){
      expect(found.catalogDomain==='definition_unclassified','INCONSISTENT_OLD_ITEM_MEMBERSHIP');
      counts.additionalNativeDefinitions++;
      supplemental.push({id,classification:'native_definition_only_unclassified',nativeCategory:found.nativeCategory,sourceFile:found.source.file,sourceSha256:found.source.sha256,acquirableVerified:false});
    } else {
      counts.unresolvedReferences++;
      supplemental.push({id,classification:'unresolved_in_partial_native_index',nativeCategory:null,sourceFile:null,sourceSha256:null,acquirableVerified:false});
    }
  }
  expect(seen.size===src02.counts?.linkedItemIds && inOriginal+supplemental.length===seen.size,'RELATED_COUNT');
  expect(supplemental.length===src02.counts?.unresolvedLinkedItemIds,'ORIGINAL_UNRESOLVED_COUNT');
  supplemental.sort((a,b)=>a.id-b.id);
  const guide=guideManifest==null?{
    status:'not_supplied',rewardRelationVerified:false
  }: {
    status:guideManifest?.schema!=='wand.db03.native-guide@1'?'unknown_guide_contract':
      (guideManifest.target?.platform!==src02.platform || guideManifest.target?.gameVersion!==src02.gameVersion)?'blocked_cross_version':'matching_version_semantics_unverified',
    platform:guideManifest.target?.platform??null,
    gameVersion:guideManifest.target?.gameVersion??null,
    rewardRelationVerified:false
  };
  return {
    schema:AUDIT_SCHEMA,
    status:'partial_source_evidence_not_live_availability',
    target:{platform:src02.platform,gameVersion:src02.gameVersion},
    source:{src02ManifestSha256:digests.src02,src01ManifestSha256:hash(src01Bytes),extendedManifestSha256:hash(extendedBytes),db01ManifestSha256:digests.db01,db01ItemsSha256:digests.db01Items,src02RelatedSha256:digests.related},
    counts:{nativeDb01Definitions:db01Rows.length,src02RelatedItemIds:seen.size,...counts},
    supplementalDefinitions:supplemental,
    guideIntegration:guide,
    limits:{catalogMembershipOnly:true,liveStockVerified:false,ownershipVerified:false,questRewardVerified:false,collectibilityOfDefinitionsVerified:false}
  };
}
export async function auditFiles(paths){
  const keys=['src02Manifest','related','db01Manifest','db01Items','src01Manifest','extendedManifest'];
  for(const key of keys) expect(paths[key],'MISSING_PATH_'+key);
  const bytes={};
  for(const key of keys) bytes[key]=await checkedBytes(paths[key]);
  const src02=JSON.parse(bytes.src02Manifest.toString('utf8'));
  const db01=JSON.parse(bytes.db01Manifest.toString('utf8'));
  requireHash(bytes.db01Items,db01.outputSha256?.['items.jsonl'],'DB01_ITEMS_SHA_MISMATCH');
  requireHash(bytes.related,src02.files?.['related-items.jsonl'],'SRC02_RELATED_SHA_MISMATCH');
  const guideBytes=paths.guideManifest?await checkedBytes(paths.guideManifest):null;
  const guide=guideBytes?JSON.parse(guideBytes.toString('utf8')):null;
  const report=auditCatalog({src02,relatedItems:parseJsonl(bytes.related,'RELATED'),db01,db01Rows:parseJsonl(bytes.db01Items,'DB01'),src01:JSON.parse(bytes.src01Manifest.toString('utf8')),extended:JSON.parse(bytes.extendedManifest.toString('utf8')),src01Bytes:bytes.src01Manifest,extendedBytes:bytes.extendedManifest,guideManifest:guide,digests:{src02:hash(bytes.src02Manifest),db01:hash(bytes.db01Manifest),db01Items:hash(bytes.db01Items),related:hash(bytes.related)}});
  report.source.guideManifestSha256=guideBytes?hash(guideBytes):null;
  if(paths.out){
    const out=resolve(paths.out); const tmp=out+'.tmp-'+process.pid;
    if(Object.entries(paths).some(([key,input])=>key!=='out' && input && resolve(input)===out)) ERROR('OUTPUT_OVERWRITES_INPUT');
    await mkdir(dirname(out),{recursive:true}); await writeFile(tmp,serial(report));await rename(tmp,out);
  }
  return report;
}
async function main(args){
  if(args[0]!=='audit')ERROR('COMMAND');
  const opts={};
  for(let i=1;i<args.length;i+=2){
    const flag=args[i]; const value=args[i+1];
    if(!flag?.startsWith('--')||!value||value.startsWith('--')) ERROR('ARGUMENTS');
    opts[flag.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
  }
  const report=await auditFiles(opts);
  process.stdout.write(serial({schema:report.schema,target:report.target,status:report.status,counts:report.counts,guideIntegration:report.guideIntegration}));
}
if(process.argv[1] && import.meta.url===new URL('file://'+resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(e=>{process.stderr.write(String(e.stack||e)+'\n');process.exitCode=1;});
}