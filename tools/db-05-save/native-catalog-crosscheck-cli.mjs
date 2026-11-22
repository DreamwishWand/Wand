#!/usr/bin/env node
/**
 * Private-only strict local Save -> SHA-provenance DB-01 audit.
 *
 * Encryption/decryption stays with the existing strict P1G decoder. The
 * complete decrypted JSON is sent only over a local stdin pipe to Python;
 * it is NEVER written to a temporary JSON file or sent to a remote server.
 *
 * Python's stdout is restricted to a fixed, anonymous report. Output must
 * be located outside ANY Git worktree. No save or catalog is ever modified.
 */
import {readFile,realpath,lstat,mkdir,writeFile,link,unlink} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {decodeP1gPackagedProfile} from '../../src/lib/collection/private-p1g-codec.js';
import {parseSafeJson} from '../../src/lib/collection/safe-profile-json.mjs';

const MAX_PROFILE_BYTES=40*1024*1024;
const MAX_JSON_BYTES=96*1024*1024;
const MAX_STDOUT_BYTES=1024*1024;
const HASH=/^[0-9a-f]{64}$/;
const SCHEMA='wand.db05.owner-private-save-native-catalog-crosscheck@1';
const EXPECTED_FAMILIES=Object.freeze([
  'inventory_item_key','chest_item','collection_item_key',
  'placed_grid_object_item','modified_grid_object_item',
  'container_parent_item','active_mission_slot','achievement_duty_id',
  'mount_item','village_scene'
]);
const strictDecoder=new TextDecoder('utf-8',{fatal:true});
const source=resolve(fileURLToPath(new URL('./native_catalog_crosscheck.py',import.meta.url)));

function options(args){
  let save=null,catalog=null,out=null,expected=null,cleanClaim=false;
  const seen=new Set();
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(key==='--owner-declared-clean'){
      if(cleanClaim)throw Error('DB05_NATIVE_CROSSCHECK_OPTIONS_INVALID');
      cleanClaim=true;continue;
    }
    if(!['--save','--catalog','--out','--expected-catalog-sha256'].includes(key)||
       seen.has(key)||i+1>=args.length||args[i+1].startsWith('--'))
      throw Error('DB05_NATIVE_CROSSCHECK_OPTIONS_INVALID');
    seen.add(key);
    const arg=args[++i];
    if(!arg)throw Error('DB05_NATIVE_CROSSCHECK_OPTIONS_INVALID');
    if(key==='--save')save=resolve(arg);
    else if(key==='--catalog')catalog=resolve(arg);
    else if(key==='--out')out=resolve(arg);
    else expected=arg;
  }
  if(!save||!catalog||!out||!HASH.test(expected??'')||
     [save,catalog].includes(out))
    throw Error('DB05_NATIVE_CROSSCHECK_OPTIONS_INVALID');
  return {save,catalog,out,expected,cleanClaim};
}
async function rejectGitOutput(destination){
  await mkdir(dirname(destination),{recursive:true});
  let directory=await realpath(dirname(destination));
  while(true){
    try{
      await lstat(join(directory,'.git'));
      throw Error('DB05_NATIVE_CROSSCHECK_PUBLIC_GIT_OUTPUT_FORBIDDEN');
    }catch(e){if(e?.code!=='ENOENT')throw e;}
    const parent=dirname(directory);
    if(parent===directory)break;
    directory=parent;
  }
  try{
    await lstat(destination);
    throw Error('DB05_NATIVE_CROSSCHECK_OVERWRITE_FORBIDDEN');
  }catch(e){if(e?.code!=='ENOENT')throw e;}
}
async function strictDecodedJson(path){
  const blob=await readFile(path);
  if(!blob.length||blob.byteLength>MAX_PROFILE_BYTES)
    throw Error('DB05_NATIVE_CROSSCHECK_SAVE_SIZE_INVALID');
  let offset=0;
  while(offset<blob.length && [9,10,13,32].includes(blob[offset]))offset++;
  let root;
  if(blob[offset]===0x7b){
    root=parseSafeJson(strictDecoder.decode(blob));
  }else{
    if(blob.length<16||blob.length%16!==0)
      throw Error('DB05_NATIVE_CROSSCHECK_UNKNOWN_SAVE_CONTAINER');
    const decoded=await decodeP1gPackagedProfile(new Uint8Array(blob));
    root=parseSafeJson(decoded.jsonText);
  }
  if(root===null||typeof root!=='object'||Array.isArray(root)||
     root.Player===null||typeof root.Player!=='object'||Array.isArray(root.Player)||
     root.World===null||typeof root.World!=='object'||Array.isArray(root.World))
    throw Error('DB05_NATIVE_CROSSCHECK_SAVE_ROOT_INVALID');
  const serialized=JSON.stringify(root);
  if(Buffer.byteLength(serialized,'utf8')>MAX_JSON_BYTES)
    throw Error('DB05_NATIVE_CROSSCHECK_DECODED_SIZE_INVALID');
  return serialized;
}
function verifyReport(value){
  if(value===null||typeof value!=='object'||Array.isArray(value)||
     value.schema!==SCHEMA||value.catalog?.zipShaMatchesOwnerPinnedExpected!==true||
     value.catalog?.categoryShardsIndependentlyShaVerified<1||
     value.claims?.editorWriterAuthorized!==false||
     value.claims?.exportAuthorized!==false||
     value.claims?.originalSaveBytesModified!==false||
     value.families?.length!==EXPECTED_FAMILIES.length||
     value.gridSources?.id!=='native_grid_source_path'||
     value.gridSources?.sourcePathMatchesVerified!==false)
    throw Error('DB05_NATIVE_CROSSCHECK_REPORT_INVALID');
  for(let i=0;i<EXPECTED_FAMILIES.length;i++){
    const row=value.families[i];
    if(row?.id!==EXPECTED_FAMILIES[i]||row.editorWriterAuthorized!==false||
       !Number.isSafeInteger(row.observed)||row.observed<0||
       !Number.isSafeInteger(row.matchedSourceDefinitions)||row.matchedSourceDefinitions<0||
       !Number.isSafeInteger(row.unindexedInSuppliedDb01Catalog)||
       !Number.isSafeInteger(row.malformed))
      throw Error('DB05_NATIVE_CROSSCHECK_REPORT_INVALID');
  }
}
export async function runNativeCatalogCrosscheck(argv=process.argv.slice(2)){
  const o=options(argv);
  await rejectGitOutput(o.out);
  const data=await strictDecodedJson(o.save);
  const runner=process.platform==='win32'?'python':'python3';
  const command=spawnSync(runner,[source,'--catalog',o.catalog,
    '--expected-catalog-sha256',o.expected],{
    input:data,encoding:'utf8',
    timeout:120000,maxBuffer:MAX_STDOUT_BYTES,
    windowsHide:true,
    env:{...process.env,PYTHONIOENCODING:'utf-8'}
  });
  if(command.error||command.status!==0)
    throw Error('DB05_NATIVE_CROSSCHECK_LOCAL_SOURCE_ANALYSIS_FAILED');
  let report;
  try{report=JSON.parse(command.stdout);}
  catch{throw Error('DB05_NATIVE_CROSSCHECK_REPORT_FORMAT_INVALID');}
  verifyReport(report);
  report.ownerDeclaredCleanHistory=o.cleanClaim;
  report.ownerDeclarationNotTechnicallyVerified=true;
  const temporary=o.out+'.'+randomUUID()+'.tmp';
  try{
    await writeFile(temporary,JSON.stringify(report,null,2)+'\n',{
      mode:0o600,flag:'wx'
    });
    await link(temporary,o.out); // no replacing any existing file
  }finally{
    await unlink(temporary).catch(()=>{});
  }
  // stdout contains only a fixed generic result without any player values.
  process.stdout.write(JSON.stringify({
    schema:SCHEMA,status:report.status,
    nativeDefinitions:report.catalog.definitionRecords,
    families:report.families.length,
    writerAuthorized:false
  })+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runNativeCatalogCrosscheck().catch(()=>{
    process.stderr.write('DB05_PRIVATE_NATIVE_CATALOG_CROSSCHECK_FAILED\n');
    process.exitCode=1;
  });
}

// Reuse the strict, local-only read boundary for other private DB-05 audits.
export {strictDecodedJson,rejectGitOutput};
