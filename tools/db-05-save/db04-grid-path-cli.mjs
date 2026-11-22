#!/usr/bin/env node
/** Private offline QwX GridDataPath -> source-native DB-04 exact path audit. */
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFile,link,unlink} from 'node:fs/promises';
import {strictDecodedJson,rejectGitOutput} from './native-catalog-crosscheck-cli.mjs';

const SCHEMA='wand.db05.owner-private-native-grid-path-lookup@1';
const SHA=/^[0-9a-f]{64}$/;
function parse(argv){
  const o={};
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(!['--save','--db04-archive','--expected-sha256','--out'].includes(key)||
      Object.hasOwn(o,key)||i+1>=argv.length||argv[i+1].startsWith('--'))
      throw Error('DB05_GRID_AUDIT_ARGUMENTS_INVALID');
    o[key]=argv[++i];
  }
  for(const k of ['--save','--db04-archive','--expected-sha256','--out']){
    if(typeof o[k]!=='string'||!o[k])throw Error('DB05_GRID_AUDIT_ARGUMENTS_INVALID');
  }
  if(!SHA.test(o['--expected-sha256']))throw Error('DB05_GRID_AUDIT_PIN_REQUIRED');
  const save=resolve(o['--save']),archive=resolve(o['--db04-archive']),out=resolve(o['--out']);
  if(new Set([save,archive,out]).size!==3)throw Error('DB05_GRID_AUDIT_FILE_PATH_COLLISION');
  return {save,archive,out,pin:o['--expected-sha256']};
}
const script=fileURLToPath(new URL('./db04_grid_path_audit.py',import.meta.url));
function validate(report){
  const a=report?.save,b=report?.join,c=report?.nativeDb04;
  if(report?.schema!==SCHEMA||a?.totalGridRecords<0||
    !Number.isSafeInteger(a?.totalGridRecords)||
    !Number.isSafeInteger(a?.distinctValidPaths)||
    !Number.isSafeInteger(b?.matchedDistinctPaths)||
    !Number.isSafeInteger(b?.notInPartialDb04DistinctPaths)||
    b?.matchedDistinctPaths+b?.notInPartialDb04DistinctPaths!==a?.distinctValidPaths||
    b?.matchedObservations+b?.notInPartialDb04Observations+
      a?.malformedGridPathOrRecord!==a?.totalGridRecords||
    c?.archiveShaMatchesExternalPin!==true||
    c?.nativeSourceOriginalBytesIndependentlyRehashedHere!==false||
    c?.wholeGameSourceCatalogComplete!==false||
    b?.numericSaveGridIdUsedAsSourceKey!==false||
    b?.missingInPartialCatalogIsNotSaveCorruption!==true||
    report?.claims?.editorWriterAuthorized!==false||
    report?.claims?.exportAuthorized!==false||
    !Array.isArray(report?.byPartition))
    throw Error('DB05_GRID_AUDIT_RESULT_INVALID');
  const allowed=new Set(['Villages','Furniture','OffGridBuildings','Rooms',
    'Worlds','Setless','FloatingIslands','ObstacleCourseArenas','other']);
  for(const row of report.byPartition){
    if(!allowed.has(row.category)||!Number.isSafeInteger(row.observed)||
      row.observed<1||row.matched<0||row.notInPartialDb04<0||
      row.matched+row.notInPartialDb04!==row.observed)
      throw Error('DB05_GRID_AUDIT_RESULT_INVALID');
  }
}
export async function runDb04GridPathAudit(argv=process.argv.slice(2)){
  const o=parse(argv);
  await rejectGitOutput(o.out);
  const json=await strictDecodedJson(o.save);
  const python=process.platform==='win32'?'python':'python3';
  const run=spawnSync(python,[script,'--db04-archive',o.archive,
    '--expected-sha256',o.pin],{
    input:json,encoding:'utf8',timeout:120000,maxBuffer:1024*1024,
    windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}
  });
  if(run.error||run.status!==0)
    throw Error('DB05_GRID_AUDIT_PRIVATE_SOURCE_JOIN_FAILED');
  let report;
  try{report=JSON.parse(run.stdout);}
  catch{throw Error('DB05_GRID_AUDIT_REPORT_JSON_INVALID');}
  validate(report);
  const temp=o.out+'.'+randomUUID()+'.tmp';
  try{
    await writeFile(temp,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    await link(temp,o.out);
  }finally{
    await unlink(temp).catch(()=>{});
  }
  process.stdout.write(JSON.stringify({
    schema:report.schema,
    observed:report.save.totalGridRecords,
    matched:report.join.matchedObservations,
    notInPartialDb04:report.join.notInPartialDb04Observations,
    writerAuthorized:false
  })+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runDb04GridPathAudit().catch(()=>{
    process.stderr.write('DB05_PRIVATE_GRID_PATH_AUDIT_FAILED\n');
    process.exitCode=1;
  });
}
