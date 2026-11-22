#!/usr/bin/env node
/** DB-05 private source-native completion of the GridData paths in one save. */
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {strictDecodedJson,rejectGitOutput} from './native-catalog-crosscheck-cli.mjs';

const SCHEMA='wand.db05.private-observed-grid-source-extension@1';
const SHA=/^[0-9a-f]{64}$/;
const script=fileURLToPath(new URL('./db04_observed_grid_completion.py',import.meta.url));
const FLAGS=new Set(['--save','--db04-archive','--expected-db04-sha256',
  '--native-grid-root','--out-report','--out-zip']);

function parse(argv){
  const x={};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];
    if(!FLAGS.has(flag)||Object.hasOwn(x,flag)||i+1>=argv.length||
       argv[i+1].startsWith('--'))
      throw new Error('DB05_PRIVATE_GRID_COMPLETION_OPTIONS_INVALID');
    x[flag]=argv[++i];
  }
  if(Object.keys(x).length!==FLAGS.size||
     !SHA.test(x['--expected-db04-sha256']))
    throw new Error('DB05_PRIVATE_GRID_COMPLETION_OPTIONS_INVALID');
  const opts={
    save:resolve(x['--save']),
    archive:resolve(x['--db04-archive']),
    sourceRoot:resolve(x['--native-grid-root']),
    report:resolve(x['--out-report']),
    zip:resolve(x['--out-zip']),
    pin:x['--expected-db04-sha256'],
  };
  if(new Set([opts.save,opts.archive,opts.sourceRoot,opts.report,opts.zip]).size!==5)
    throw new Error('DB05_PRIVATE_GRID_COMPLETION_PATH_COLLISION');
  return opts;
}

export async function completeObservedNativeGridSources(argv=process.argv.slice(2)){
  const opt=parse(argv);
  // First refuse Git-public destinations, both potential source overwrites
  // and any re-use of an existing report/ZIP output.
  await rejectGitOutput(opt.report);
  await rejectGitOutput(opt.zip);
  const folder=await stat(opt.sourceRoot);
  if(!folder.isDirectory())
    throw new Error('DB05_PRIVATE_GRID_COMPLETION_SOURCE_FOLDER_REQUIRED');
  const json=await strictDecodedJson(opt.save);
  const python=process.platform==='win32'?'python':'python3';
  const result=spawnSync(python,[
    script,'--db04-archive',opt.archive,
    '--expected-db04-sha256',opt.pin,
    '--native-grid-root',opt.sourceRoot,
    '--out-report',opt.report,'--out-zip',opt.zip
  ],{
    input:json,encoding:'utf8',timeout:180000,maxBuffer:1024*1024,
    windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}
  });
  if(result.error||result.status!==0)
    throw new Error('DB05_PRIVATE_GRID_COMPLETION_NATIVE_AUDIT_FAILED');
  let returned,privateReport;
  try{
    returned=JSON.parse(result.stdout);
    privateReport=JSON.parse(await readFile(opt.report,'utf8'));
  }catch{
    throw new Error('DB05_PRIVATE_GRID_COMPLETION_REPORT_CORRUPT');
  }
  const count=privateReport?.counts,safety=privateReport?.safety;
  if(returned.schema!==SCHEMA||privateReport.schema!==SCHEMA||
     returned.completeForThisSave!==true||
     returned.completeOriginalGameWorld!==false||
     !Number.isSafeInteger(count?.distinctSaveGridDataPaths)||
     count.distinctSaveGridDataPaths!==count.observedPathsNowIndexed||
     count.observedPathsUnindexed!==0||
     !Number.isSafeInteger(count?.newGridDefinitionFilesVerified)||
     returned.newVerifiedOriginalSources!==count.newGridDefinitionFilesVerified||
     safety?.fullNativeGameWorldIndexed!==false||
     safety?.editorWriterAuthorized!==false||
     safety?.exportAuthorized!==false)
    throw new Error('DB05_PRIVATE_GRID_COMPLETION_REPORT_INVALID');
  // stdout only includes anonymous aggregate values and no private paths.
  process.stdout.write(JSON.stringify({
    schema:SCHEMA,
    savedGridRecords:count.saveGridRecords,
    observedDistinctPaths:count.distinctSaveGridDataPaths,
    newNativeOriginalFiles:count.newGridDefinitionFilesVerified,
    allObservedPathsCovered:true,
    wholeGameWorldCovered:false,
    writerAuthorized:false
  })+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  completeObservedNativeGridSources().catch(()=>{
    process.stderr.write('DB05_PRIVATE_GRID_COMPLETION_FAILED\n');
    process.exitCode=1;
  });
}
