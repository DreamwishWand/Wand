import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createCipheriv} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';

const root=resolve('.');
const cli=join(root,'tools/db-05-save/clean-regression-cli.mjs');
const declaration=[
  '--owner-declared-clean','--owner-declared-no-cheats',
  '--owner-declared-no-restricted-edits'
];
function fixture(version=643){
  return {GameInfo:{Version:version,PrivateUser:'CONFIDENTIAL_FULL_NAME'},
    Player:{AchievementsData:[{AchievementID:2110000001,CurAmount:0}]},
    World:{GridCollection:{Grids:{'3':{ID:3,Objects:{}}},DiffGrids:{}}}};
}
function exec(args){
  return spawnSync(process.execPath,[cli,...args],{
    cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024*1024
  });
}
function crc32(bytes){
  let value=0xffffffff;
  for(const b of bytes){
    value^=b;
    for(let i=0;i<8;i++)
      value=value&1?(0xedb88320^(value>>>1)):(value>>>1);
  }
  return (value^0xffffffff)>>>0;
}
function encryptProfile(doc){
  const key=Buffer.from('62357168683873614A38556C444A557A545A5864325467366D626F3857386e35','hex');
  const json=Buffer.from(JSON.stringify(doc));
  const data=deflateRawSync(json);
  const entry=Buffer.from('profile');
  const local=Buffer.alloc(30+entry.length+data.length);
  local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);
  local.writeUInt16LE(8,8);
  local.writeUInt32LE(crc32(json),14);
  local.writeUInt32LE(data.length,18);
  local.writeUInt32LE(json.length,22);
  local.writeUInt16LE(entry.length,26);
  entry.copy(local,30);data.copy(local,30+entry.length);
  const central=Buffer.alloc(46+entry.length);
  central.writeUInt32LE(0x02014b50,0);
  central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt16LE(8,10);
  central.writeUInt32LE(crc32(json),16);
  central.writeUInt32LE(data.length,20);
  central.writeUInt32LE(json.length,24);
  central.writeUInt16LE(entry.length,28);
  entry.copy(central,46);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
  end.writeUInt32LE(central.length,12);
  end.writeUInt32LE(local.length,16);
  const enc=createCipheriv('aes-256-ecb',key,null);
  return Buffer.concat([enc.update(Buffer.concat([local,central,end])),enc.final()]);
}
test('real CLI accepts encrypted clean .json, plaintext modified .profile and prints only fixed counters',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'db05-clean-matrix-'));
  try{
    const clean=join(directory,'initial-profile.json'); // extension deliberately misleading
    const candidate=join(directory,'different-owner.profile.bin'); // historical plain JSON
    const other=join(directory,'future.json');
    const output=join(directory,'PRIVATE-regression.json');
    await writeFile(clean,encryptProfile(fixture()));
    await writeFile(candidate,JSON.stringify(fixture(626)));
    await writeFile(other,JSON.stringify(fixture(999)));
    const a=exec(['--clean',clean,'--candidate',candidate,
      '--candidate',other,'--out',output,...declaration]);
    assert.equal(a.status,0,a.stderr);
    assert.deepEqual(JSON.parse(a.stdout),{
      schema:'wand.db05.owner-private-clean-regression-evidence@1',
      cleanReferenceRules:23,editorReadsetRules:60,
      referenceGraphRules:14,cases:2,writerAuthorized:false
    });
    const report=JSON.parse(await readFile(output,'utf8'));
    assert.equal(report.cases.length,2);
    assert.equal(report.cases[0].evidence.observedSaveSchema,626);
    assert.equal(report.cases[1].evidence.observedSaveSchema,999);
    assert.equal(report.writerAuthorized,false);
    assert.equal(report.noNetworkOrUpload,true);
    assert.equal(report.originalFilesModified,false);
    assert.equal(report.cases[0].case,'candidate_1');
    assert.equal(JSON.stringify(report).includes('CONFIDENTIAL_FULL_NAME'),false);
    assert.equal(JSON.stringify(report).includes('2110000001'),false);
    assert.equal(JSON.stringify(report).includes(directory),false);
    const before=(await readFile(output)).toString();
    assert.notEqual(exec(['--clean',clean,'--candidate',candidate,
      '--out',output,...declaration]).status,0,
      'Existing report must not be overwritten');
    assert.equal((await readFile(output)).toString(),before);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('CLI prevents real data escaping Git and refuses invalid declaration, duplicates or unsafe integers',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'db05-clean-guard-'));
  try{
    const clean=join(directory,'clean.json');
    const candidate=join(directory,'candidate.json');
    const out=join(directory,'out.json');
    await writeFile(clean,JSON.stringify(fixture()));
    await writeFile(candidate,'{"GameInfo":{"Version":643},"Player":{"x":1,"x":2},"World":{}}');
    let a=exec(['--clean',clean,'--candidate',candidate,'--out',out,...declaration]);
    assert.notEqual(a.status,0);
    assert.match(a.stderr,/DB05_PRIVATE_CLEAN_REGRESSION_FAILED/);
    assert.equal(a.stderr.includes('CONFIDENTIAL_FULL_NAME'),false);
    await assert.rejects(stat(out),{code:'ENOENT'});
    await writeFile(candidate,'{"GameInfo":{"Version":643},"Player":{"i":9007199254740993},"World":{}}');
    a=exec(['--clean',clean,'--candidate',candidate,'--out',out,...declaration]);
    assert.notEqual(a.status,0);
    await assert.rejects(stat(out),{code:'ENOENT'});
    await writeFile(candidate,JSON.stringify(fixture()));
    a=exec(['--clean',clean,'--candidate',candidate,'--out',out,
      '--owner-declared-clean','--owner-declared-no-cheats']);
    assert.notEqual(a.status,0);
    await assert.rejects(stat(out),{code:'ENOENT'});
    a=exec(['--clean',clean,'--candidate',candidate,
      '--out',join(root,'tools/db-05-save/private-regression-test.json'),...declaration]);
    assert.notEqual(a.status,0);
    assert.equal(a.stderr.includes(directory),false);
  }finally{await rm(directory,{recursive:true,force:true});}
});
