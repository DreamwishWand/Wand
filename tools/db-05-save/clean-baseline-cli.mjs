#!/usr/bin/env node
/** Owner-private encrypted P1G clean-baseline evidence; NEVER uploads or exports a save. */
import {readFile,mkdir,writeFile,rename,unlink,stat} from 'node:fs/promises';
import {resolve,dirname,join,parse} from 'node:path';
import {randomUUID} from 'node:crypto';
import {decodeP1gPackagedProfile} from '../../src/lib/collection/private-p1g-codec.js';
import {parseSafeJson} from '../../src/lib/collection/safe-profile-json.mjs';
import {createCleanSaveBaseline} from '../../src/lib/save/clean-baseline.mjs';

const flag=(name)=>process.argv.indexOf(name);
const value=(name)=>{
  const i=flag(name);
  return i>0&&i+1<process.argv.length?process.argv[i+1]:null;
};
async function blockGitOutput(target){
  let dir=resolve(dirname(target));
  while(true){
    try {
      const entry=await stat(join(dir,'.git'));
      if(entry)throw new Error('DB05_CLEAN_BASELINE_PUBLIC_GIT_OUTPUT_BLOCKED');
    }catch(e){
      if(e?.code!=='ENOENT')throw e;
    }
    const parent=dirname(dir);
    if(parent===dir)break;
    dir=parent;
  }
}
async function inspect(path){
  const input=await readFile(path);
  if(input.byteLength===0||input.byteLength>32*1024*1024)
    throw new Error('DB05_CLEAN_BASELINE_INPUT_SIZE_INVALID');
  const decoded=await decodeP1gPackagedProfile(new Uint8Array(input));
  // Strict decoder already rejected duplicate keys, unsafe numbers, CRC,
  // ZIP ambiguity and invalid UTF-8. Parse the original verified JSON only.
  return parseSafeJson(decoded.jsonText);
}
async function run(){
  const clean=value('--clean'),output=value('--out'),candidate=value('--candidate');
  const claim=process.argv.includes('--owner-declared-clean')&&
    process.argv.includes('--owner-declared-no-cheats')&&
    process.argv.includes('--owner-declared-no-restricted-edits');
  if(!clean||!output||!claim){
    throw new Error('USAGE: --clean /PRIVATE/profile.json --out /PRIVATE/evidence.json --owner-declared-clean --owner-declared-no-cheats --owner-declared-no-restricted-edits [--candidate /PRIVATE/other-profile.json]');
  }
  const inputPath=resolve(clean),outPath=resolve(output);
  if(outPath===inputPath||(candidate&&outPath===resolve(candidate)))
    throw new Error('DB05_CLEAN_BASELINE_OUTPUT_OVERWRITES_SOURCE');
  await blockGitOutput(outPath);
  const baseline=createCleanSaveBaseline(await inspect(inputPath),{
    ownerDeclaredClean:true,ownerDeclaredNoCheats:true,
    ownerDeclaredNoRestrictedObjectEdits:true
  });
  const record={
    schema:'wand.db05.owner-private-clean-baseline-evidence@1',
    source:'owner_declaration_plus_strict_local_p1g_decode',
    reference:baseline.reference,
    comparison:candidate?baseline.compare(await inspect(resolve(candidate))):null,
    originalGameBuildVerified:false,
    codecReencodeVerified:false,
    dataUploaded:false,
    privateOutputRequired:true
  };
  await mkdir(dirname(outPath),{recursive:true});
  // Never clobber an owner original or overwrite an existing private report.
  const tmp=outPath+'.'+randomUUID()+'.tmp';
  try {
    await writeFile(tmp,JSON.stringify(record,null,2)+'\n',{mode:0o600,flag:'wx'});
    // Refuse an existing target before committing the temporary result.
    try{await stat(outPath);throw new Error('DB05_CLEAN_BASELINE_OUTPUT_EXISTS');}
    catch(e){if(e?.code!=='ENOENT')throw e;}
    await rename(tmp,outPath);
  }finally{await unlink(tmp).catch(e=>{if(e?.code!=='ENOENT')throw e;});}
  process.stdout.write(JSON.stringify({
    schema:record.schema,
    observedPublicFields:record.reference.fieldCount,
    comparisonStatus:record.comparison?.status??'not_requested',
    saveWriterAuthorized:false
  })+'\n');
}
run().catch(error=>{
  process.stderr.write(String(error?.message??'DB05_CLEAN_BASELINE_FAILED')+'\n');
  process.exitCode=1;
});
