#!/usr/bin/env node
/** Private-only, multi-profile DB-05 clean regression; never a save Writer. */
import { readFile, mkdir, lstat, realpath, writeFile, link, unlink } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import {pathToFileURL} from 'node:url';
import { randomUUID } from 'node:crypto';
import { decodeP1gPackagedProfile } from '../../src/lib/collection/private-p1g-codec.js';
import { parseSafeJson } from '../../src/lib/collection/safe-profile-json.mjs';
import { createCleanSaveRegression } from '../../src/lib/save/clean-regression.mjs';

const MAX_ENCRYPTED=32*1024*1024;
const MAX_JSON=128*1024*1024;
const decoder=new TextDecoder('utf-8',{fatal:true});
const CLAIM_FLAGS=[
  '--owner-declared-clean',
  '--owner-declared-no-cheats',
  '--owner-declared-no-restricted-edits'
];
const INPUT_FLAGS=new Set(['--clean','--candidate','--out']);
const LIMIT=8;
function parseOptions(args){
  const opts={clean:null,candidates:[],output:null,flags:new Set()};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(CLAIM_FLAGS.includes(key)){
      if(opts.flags.has(key))throw new Error('DB05_REGRESSION_INVALID_OPTIONS');
      opts.flags.add(key);
      continue;
    }
    if(!INPUT_FLAGS.has(key)||i+1>=args.length||args[i+1].startsWith('--'))
      throw new Error('DB05_REGRESSION_INVALID_OPTIONS');
    const val=args[++i];
    if(!val)throw new Error('DB05_REGRESSION_INVALID_OPTIONS');
    if(key==='--candidate')opts.candidates.push(resolve(val));
    else if(key==='--clean'){
      if(opts.clean)throw new Error('DB05_REGRESSION_INVALID_OPTIONS');
      opts.clean=resolve(val);
    }else{
      if(opts.output)throw new Error('DB05_REGRESSION_INVALID_OPTIONS');
      opts.output=resolve(val);
    }
  }
  if(!opts.clean||!opts.output||!opts.candidates.length||
     opts.candidates.length>LIMIT||
     opts.flags.size!==CLAIM_FLAGS.length||
     new Set([opts.clean,...opts.candidates]).size!==opts.candidates.length+1||
     [opts.clean,...opts.candidates].includes(opts.output))
    throw new Error('DB05_REGRESSION_INVALID_OPTIONS');
  return opts;
}
async function strictRead(path){
  const input=await readFile(path);
  if(input.length===0||input.length>MAX_JSON)
    throw new Error('DB05_REGRESSION_INPUT_SIZE_INVALID');
  // Filename extension is not evidence of encrypted/plaintext content.
  // The owner has JSON archives with historical ".profile" extensions.
  let first=0;
  while(first<input.length&&[9,10,13,32].includes(input[first]))first++;
  const plaintext=input[first]===0x7b;
  if(plaintext){
    return parseSafeJson(decoder.decode(input));
  }
  if(input.length<16||input.length>MAX_ENCRYPTED||input.length%16!==0)
    throw new Error('DB05_REGRESSION_ENCRYPTED_SIZE_INVALID');
  const decoded=await decodeP1gPackagedProfile(new Uint8Array(input));
  return parseSafeJson(decoded.jsonText); // strict duplicate/precision validated
}
async function refuseGitOutput(path){
  await mkdir(dirname(path),{recursive:true});
  let directory=await realpath(dirname(path));
  while(true){
    try{
      await lstat(join(directory,'.git'));
      throw new Error('DB05_REGRESSION_PUBLIC_GIT_OUTPUT_BLOCKED');
    }catch(e){if(e.code!=='ENOENT')throw e;}
    const parent=dirname(directory);
    if(parent===directory)break;
    directory=parent;
  }
  try{await lstat(path);throw new Error('DB05_REGRESSION_OUTPUT_EXISTS');}
  catch(e){if(e.code!=='ENOENT')throw e;}
}
async function run(argv=process.argv.slice(2)){
  const opts=parseOptions(argv);
  await refuseGitOutput(opts.output);
  const baseline=createCleanSaveRegression(await strictRead(opts.clean),{
    ownerDeclaredClean:true,ownerDeclaredNoCheats:true,
    ownerDeclaredNoRestrictedObjectEdits:true
  });
  const cases=[];
  for(let i=0;i<opts.candidates.length;i++){
    const decoded=await strictRead(opts.candidates[i]);
    const evidence=baseline.compare(decoded);
    cases.push({case:'candidate_'+String(i+1),evidence});
  }
  const report={
    schema:'wand.db05.owner-private-clean-regression-evidence@1',
    source:'owner-declaration-plus-strict-local-p1g-or-json',
    reference:baseline.reference,cases,
    allCasesMayBeDifferentAccounts:true,
    actualObjectMoveHistoryNotAttested:true,
    realProfileDataRetained:false,
    exactGameBuildNotIndependentlyAttested:true,
    originalFilesModified:false,
    noNetworkOrUpload:true,
    writerAuthorized:false,exportAuthorized:false
  };
  const target=opts.output;
  const tmp=target+'.'+randomUUID()+'.tmp';
  try{
    await writeFile(tmp,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    // link() is atomic and refuses an existing target (unlike rename()).
    await link(tmp,target);
  }finally{
    await unlink(tmp).catch(e=>{if(e?.code!=='ENOENT')throw e;});
  }
  process.stdout.write(JSON.stringify({
    schema:report.schema,
    cleanReferenceRules:baseline.reference.knownStructureTemplates,
    editorReadsetRules:baseline.reference.editorReadsetTemplates,
    referenceGraphRules:baseline.reference.referenceRelationRules,
    cases:cases.length,writerAuthorized:false
  })+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  run().catch(()=>{
    // Exceptions may embed input path/key; never print arbitrary error text.
    process.stderr.write('DB05_PRIVATE_CLEAN_REGRESSION_FAILED\n');
    process.exitCode=1;
  });
}
export {run,parseOptions,strictRead};
