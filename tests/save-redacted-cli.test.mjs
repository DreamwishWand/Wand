import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runComparison } from '../tools/db-05-save/compare.mjs';

const base = [
  {path:'/GameInfo',type:'object'},
  {path:'/GameInfo/Version',type:'integer'},
  {path:'/Player',type:'object'},
  {path:'/World',type:'object'},
  {path:'/Player/ContainerInventories',type:'object'},
  {path:'/Player/ContainerInventories/{containerId}/Inventory[]/Amount',type:'integer'}
];
const summary = (version, type='integer') => ({
  schema:'wand.db05.ingest@1', safeForPublicRepository:false, writerAuthorized:false,
  current:{
    schemaObserved:version,rootRequiredFieldsPresent:true,rootRequiredObjectsObserved:true,
    otherWitnessCount:10, decoderAndBuildVerified:false, writerAuthorized:false,
    publicWitnesses:base.map(field=>field.path.endsWith('/Amount')?{...field,type}:field)
  },
  extraSensitiveField:'must_not_appear_in_result'
});
function sandbox(fn) {
  const d=mkdtempSync(join(tmpdir(),'wand-db05-private-'));
  try{return fn(d)}finally{rmSync(d,{recursive:true,force:true})}
}
test('private CLI compares sanitized summaries without modifying either source',()=>sandbox(d=>{
  const left=join(d,'previous.json'),right=join(d,'current.json'),output=join(d,'result.json');
  writeFileSync(left,JSON.stringify(summary(626)));
  writeFileSync(right,JSON.stringify(summary(643,'string')));
  const prior=[readFileSync(left),readFileSync(right)];
  const result=runComparison(['--previous',left,'--current',right,'--out',output]);
  assert.equal(result.status,'observed_type_conflict');
  assert.deepEqual(prior,[readFileSync(left),readFileSync(right)]);
  const saved=readFileSync(output,'utf8');
  assert.equal(JSON.parse(saved).status,result.status);
  assert.ok(!saved.includes('must_not_appear_in_result'));
  assert.ok(!saved.includes(left));
  assert.ok(!saved.includes(right));
  assert.ok(!saved.includes('"schemaObserved"'));
  if(process.platform!=='win32')assert.equal(statSync(output).mode & 0o777,0o600);
}));

test('private CLI rejects overwrite, invalid inputs and in-repository outputs',()=>sandbox(d=>{
  const left=join(d,'previous.json'),right=join(d,'current.json'),output=join(d,'result.json');
  writeFileSync(left,JSON.stringify(summary(626)));
  writeFileSync(right,JSON.stringify(summary(643)));
  writeFileSync(output,'preserve existing');
  assert.throws(()=>runComparison(['--previous',left,'--current',right,'--out',output]),/PRIVATE_OUTPUT_MUST_BE_NEW/);
  assert.equal(readFileSync(output,'utf8'),'preserve existing');
  assert.throws(()=>runComparison(['--previous',left,'--current',right,'--out',
    resolve('tools/db-05-save/must-never-write.json')]),/PRIVATE_REPORT_OUTPUT_INSIDE_GIT/);
  const raw=join(d,'raw.json');writeFileSync(raw,JSON.stringify({status:'structural_witness',fieldWitnesses:[]}));
  assert.throws(()=>runComparison(['--previous',left,'--current',raw,'--out',join(d,'failure.json')]),
    /DB05_REDACTED_SUMMARY_REQUIRED/);
  assert.equal(existsSync(join(d,'failure.json')),false);
}));

test('direct Node CLI invocation writes a private report and exits cleanly',()=>sandbox(d=>{
  const left=join(d,'old.json'),right=join(d,'new.json'),out=join(d,'compared.json');
  writeFileSync(left,JSON.stringify(summary(626)));
  writeFileSync(right,JSON.stringify(summary(643,'string')));
  const script=resolve('tools/db-05-save/compare.mjs');
  const child=spawnSync(process.execPath,[script,'--previous',left,'--current',right,'--out',out],
    {encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  assert.ok(existsSync(out));
  assert.equal(JSON.parse(readFileSync(out,'utf8')).status,'observed_type_conflict');
  assert.equal(child.stdout,'');
}));
