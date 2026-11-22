import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const REPO=resolve('.');
const CLI=join(REPO,'tools/db-05-save/db04-grid-path-cli.mjs');
const PYTEST=join(REPO,'tools/db-05-save/test_db04_grid_path_audit.py');
const KEY=Buffer.from('62357168683873614A38556C444A557A545A5864325467366D626F3857386e35','hex');
const ENTRY=Buffer.from('profile');
const pythonBuild=[
  'import importlib.util,sys',
  'from pathlib import Path',
  'p=Path(sys.argv[1]);sys.path.insert(0,str(p.parent))',
  'spec=importlib.util.spec_from_file_location("db04_test",p)',
  'mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)',
  'print(mod.build_zip(Path(sys.argv[2])))'
].join('\n');
const names={
  source:'GridData/Villages/Village04-MeadowLevel-GridData.json',
  second:'GridData/Furniture/Mission/NativeGrid-Two.json',
  absent:'GridData/OffGridBuildings/Expansion04/MissingNative.json'
};
function fixtureSave(version=643) {
  return {GameInfo:{Version:version,ProfileUID:'SECRET_OWNER_UID'},
    Player:{Name:'SECRET_OWNER_NAME'},
    World:{GridCollection:{Grids:{
      '100':{ID:100,GridDataPath:names.source,Objects:{}},
      '200':{ID:200,GridDataPath:names.source,Objects:{}},
      '300':{ID:300,GridDataPath:names.second,Objects:{}},
      '400':{ID:400,GridDataPath:names.absent,Objects:{}}
    },DiffGrids:{}}}};
}
function crc32(b){
  let c=0xffffffff;
  for(const x of b){c^=x;for(let i=0;i<8;i++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);}
  return(c^0xffffffff)>>>0;
}
function encrypt(save) {
  const json=Buffer.from(JSON.stringify(save));
  const compressed=deflateRawSync(json);
  const local=Buffer.alloc(30+ENTRY.length+compressed.length);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
  local.writeUInt16LE(8,8);
  local.writeUInt32LE(crc32(json),14);
  local.writeUInt32LE(compressed.length,18);
  local.writeUInt32LE(json.length,22);
  local.writeUInt16LE(ENTRY.length,26);
  ENTRY.copy(local,30);compressed.copy(local,30+ENTRY.length);
  const central=Buffer.alloc(46+ENTRY.length);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);
  central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);
  central.writeUInt32LE(crc32(json),16);
  central.writeUInt32LE(compressed.length,20);
  central.writeUInt32LE(json.length,24);
  central.writeUInt16LE(ENTRY.length,28);ENTRY.copy(central,46);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);
  end.writeUInt16LE(1,10);end.writeUInt32LE(central.length,12);
  end.writeUInt32LE(local.length,16);
  const aes=createCipheriv('aes-256-ecb',KEY,null);
  return Buffer.concat([aes.update(Buffer.concat([local,central,end])),aes.final()]);
}
function run(args) {
  return spawnSync(process.execPath,[CLI,...args],{
    cwd:REPO,encoding:'utf8',timeout:45000,maxBuffer:1024*1024
  });
}
async function sourceFixture() {
  const dir=await mkdtemp(join(tmpdir(),'db05-grid-'));
  const archive=join(dir,'partial-db04.zip');
  const p=spawnSync('python3',['-c',pythonBuild,PYTEST,archive],{
    cwd:REPO,encoding:'utf8',timeout:10000
  });
  assert.equal(p.status,0,p.stderr);
  const digest=p.stdout.trim();
  assert.match(digest,/^[0-9a-f]{64}$/);
  return {dir,archive,digest};
}
test('encrypted P1G -> private DB-04 ZIP SHA pin -> exact GridDataPath counts',async()=>{
  const x=await sourceFixture();
  try{
    const original=join(x.dir,'original-save.json');
    const out=join(x.dir,'private-grid-counts.json');
    await writeFile(original,encrypt(fixtureSave()));
    const cmd=run(['--save',original,'--db04-archive',x.archive,
      '--expected-sha256',x.digest,'--out',out]);
    assert.equal(cmd.status,0,cmd.stderr);
    assert.deepEqual(JSON.parse(cmd.stdout),{
      schema:'wand.db05.owner-private-native-grid-path-lookup@1',
      observed:4,matched:3,notInPartialDb04:1,writerAuthorized:false
    });
    const report=JSON.parse(await readFile(out,'utf8'));
    assert.equal(report.join.matchedDistinctPaths,2);
    assert.equal(report.join.notInPartialDb04DistinctPaths,1);
    assert.equal(report.save.distinctValidPaths,3);
    assert.equal(report.join.missingInPartialCatalogIsNotSaveCorruption,true);
    assert.equal(report.nativeDb04.wholeGameSourceCatalogComplete,false);
    assert.equal(report.claims.editorWriterAuthorized,false);
    assert.equal(report.claims.exportAuthorized,false);
    const evidence=JSON.stringify(report)+cmd.stderr+cmd.stdout;
    for(const secret of ['SECRET_OWNER','GridData/','NativeGrid',
      'MeadowLevel','MissingNative','PRIVATE_OWNER_UID',x.dir]){
      assert.equal(evidence.includes(secret),false,secret);
    }
    const orig=await readFile(out);
    const duplicate=run(['--save',original,'--db04-archive',x.archive,
      '--expected-sha256',x.digest,'--out',out]);
    assert.notEqual(duplicate.status,0);
    assert.deepEqual(await readFile(out),orig);
  }finally{await rm(x.dir,{recursive:true,force:true});}
});
test('version neutral plaintext, archive tampering, duplicate JSON and Git output guards',async()=>{
  const x=await sourceFixture();
  try{
    const original=join(x.dir,'original.profile');
    const out=join(x.dir,'private-report.json');
    await writeFile(original,JSON.stringify(fixtureSave(999)));
    const success=run(['--save',original,'--db04-archive',x.archive,
      '--expected-sha256',x.digest,'--out',out]);
    assert.equal(success.status,0,success.stderr);
    assert.equal(JSON.parse(await readFile(out,'utf8')).save.schemaNumberObserved,999);
    const badPin=run(['--save',original,'--db04-archive',x.archive,
      '--expected-sha256','0'.repeat(64),'--out',join(x.dir,'bad-pin.json')]);
    assert.notEqual(badPin.status,0);
    await assert.rejects(stat(join(x.dir,'bad-pin.json')),{code:'ENOENT'});
    await writeFile(original,'{"GameInfo":{"Version":643},"Player":{"secret":1,"secret":2},"World":{}}');
    const duplicate=run(['--save',original,'--db04-archive',x.archive,
      '--expected-sha256',x.digest,'--out',join(x.dir,'bad-json.json')]);
    assert.notEqual(duplicate.status,0);
    await assert.rejects(stat(join(x.dir,'bad-json.json')),{code:'ENOENT'});
    const git=run(['--save',original,'--db04-archive',x.archive,
      '--expected-sha256',x.digest,
      '--out',join(REPO,'tools/db-05-save/never-commit-private-grid-report.json')]);
    assert.notEqual(git.status,0);
    assert.equal(git.stderr.includes('SECRET_OWNER'),false);
  }finally{await rm(x.dir,{recursive:true,force:true});}
});
