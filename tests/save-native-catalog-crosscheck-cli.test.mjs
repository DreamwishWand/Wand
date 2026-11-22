import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const REPO=resolve('.');
const CLI=join(REPO,'tools/db-05-save/native-catalog-crosscheck-cli.mjs');
const PYTEST=join(REPO,'tools/db-05-save/test_native_catalog_crosscheck.py');
const KEY=Buffer.from('62357168683873614A38556C444A557A545A5864325467366D626F3857386e35','hex');
const ENTRY=Buffer.from('profile');
const buildFixture=String.raw`import importlib.util,sys
spec=importlib.util.spec_from_file_location("test_native",sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
from pathlib import Path
print(module.synthetic_archive(Path(sys.argv[2])))`;
function crc32(bytes) {
  let c=0xffffffff;
  for(const b of bytes){
    c^=b;
    for(let i=0;i<8;i++) c=c&1?(0xedb88320^(c>>>1)):(c>>>1);
  }
  return (c^0xffffffff)>>>0;
}
function syntheticP1g(save) {
  const json=Buffer.from(typeof save==='string'?save:JSON.stringify(save),'utf8');
  const compressed=deflateRawSync(json);
  const local=Buffer.alloc(30+ENTRY.length+compressed.length);
  local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);
  local.writeUInt32LE(crc32(json),14);local.writeUInt32LE(compressed.length,18);
  local.writeUInt32LE(json.length,22);local.writeUInt16LE(ENTRY.length,26);
  ENTRY.copy(local,30);compressed.copy(local,30+ENTRY.length);
  const central=Buffer.alloc(46+ENTRY.length);
  central.writeUInt32LE(0x02014b50,0);
  central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt16LE(8,10);
  central.writeUInt32LE(crc32(json),16);
  central.writeUInt32LE(compressed.length,20);
  central.writeUInt32LE(json.length,24);
  central.writeUInt16LE(ENTRY.length,28);ENTRY.copy(central,46);
  const footer=Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50,0);
  footer.writeUInt16LE(1,8);footer.writeUInt16LE(1,10);
  footer.writeUInt32LE(central.length,12);
  footer.writeUInt32LE(local.length,16);
  const cipher=createCipheriv('aes-256-ecb',KEY,null);
  return Buffer.concat([cipher.update(Buffer.concat([local,central,footer])),cipher.final()]);
}
const fakeSave=(version=643)=>({
  GameInfo:{Version:version,LastSaveDeviceInfo:{deviceType:'DeviceType_Switch',
    deviceID:'PRIVATE_DEVICE_ACCOUNT_NEVER_LEAK'}},
  Player:{
    Name:'PRIVATE_OWNER_NEVER_LEAK',
    ListInventories:{'1':{Inventory:{'321001':{Amount:2}}}},
    ContainerInventories:{
      '0':{ParentItemID:null,Inventory:[{ItemID:321002,Amount:5}]},
      '1':{ParentItemID:400111,Inventory:[]}
    },
    CollectionSets:[{GroupData:[{GroupsCollectionItems:{
      '400111':false,'321001':true
    }}]}],
    AchievementsData:[{AchievementID:211010}],
    Mounts:[]
  },
  World:{
    GridCollection:{
      Grids:{'11':{GridDataPath:'PRIVATE_GRID_PATH',
        Objects:{'100':{ItemID:400222}}}},
      DiffGrids:{'11':{ModifiedObjects:{'101':{ItemID:400222}}}}
    },
    MissionSlots:{'1':{Slots:[{MissionId:207010}]}},
    Villages:[{SceneItemId:154010}]
  }
});
const runner=(args)=>spawnSync(process.execPath,[CLI,...args],{
  cwd:REPO,encoding:'utf8',timeout:45000,maxBuffer:1024*1024
});
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'db05-source-native-'));
  const catalog=join(dir,'private-native.zip');
  const get=spawnSync('python3',['-c',buildFixture,PYTEST,catalog],{
    cwd:REPO,encoding:'utf8',timeout:10000
  });
  assert.equal(get.status,0,get.stderr);
  const expected=get.stdout.trim();
  assert.match(expected,/^[0-9a-f]{64}$/);
  return {dir,catalog,expected};
}
test('strict P1G -> local pipe -> SHA-pinned native catalog -> anonymous private report',async()=>{
  const f=await fixture();
  try{
    const save=join(f.dir,'clean.profile.json');
    const out=join(f.dir,'private-report.json');
    await writeFile(save,syntheticP1g(fakeSave()));
    const answer=runner(['--save',save,'--catalog',f.catalog,
      '--expected-catalog-sha256',f.expected,'--out',out,
      '--owner-declared-clean']);
    assert.equal(answer.status,0,answer.stderr);
    assert.deepEqual(JSON.parse(answer.stdout),{
      schema:'wand.db05.owner-private-save-native-catalog-crosscheck@1',
      status:'all_observed_non_sentinel_references_catalogued',
      nativeDefinitions:7,families:10,writerAuthorized:false
    });
    const report=JSON.parse(await readFile(out,'utf8'));
    assert.equal(report.catalog.definitionRecords,7);
    assert.equal(report.totals.observed,11);
    assert.equal(report.totals.matchedSourceDefinitions,10);
    assert.equal(report.totals.nullSentinels,1);
    assert.equal(report.gridSources.observed,1);
    assert.equal(report.ownerDeclaredCleanHistory,true);
    assert.equal(report.ownerDeclarationNotTechnicallyVerified,true);
    assert.equal(report.claims.editorWriterAuthorized,false);
    assert.equal(report.claims.exportAuthorized,false);
    const content=JSON.stringify(report)+answer.stdout+answer.stderr;
    for(const secret of ['PRIVATE_OWNER','PRIVATE_DEVICE','PRIVATE_GRID_PATH',
      '321001','321002','400111','400222','211010','207010','154010',f.dir]){
      assert.equal(content.includes(secret),false,secret);
    }
    const previous=await readFile(out);
    const overwrite=runner(['--save',save,'--catalog',f.catalog,
      '--expected-catalog-sha256',f.expected,'--out',out]);
    assert.notEqual(overwrite.status,0,'Private report must never be clobbered');
    assert.deepEqual(await readFile(out),previous);
  }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('future schema number is not a compatibility gate; mismatched SHA and unsafe JSON fail closed',async()=>{
  const f=await fixture();
  try{
    const save=join(f.dir,'future.profile');
    const out=join(f.dir,'report.json');
    await writeFile(save,JSON.stringify(fakeSave(1000)));
    const answer=runner(['--save',save,'--catalog',f.catalog,
      '--expected-catalog-sha256',f.expected,'--out',out]);
    assert.equal(answer.status,0,answer.stderr);
    assert.equal(JSON.parse(await readFile(out,'utf8')).save.observedSchemaVersion,1000);
    const wrong=runner(['--save',save,'--catalog',f.catalog,
      '--expected-catalog-sha256','0'.repeat(64),
      '--out',join(f.dir,'wrong-sha.json')]);
    assert.notEqual(wrong.status,0);
    await assert.rejects(stat(join(f.dir,'wrong-sha.json')),{code:'ENOENT'});
    await writeFile(save,'{"GameInfo":{"Version":643},"Player":{"x":1,"x":2},"World":{}}');
    const duplicate=runner(['--save',save,'--catalog',f.catalog,
      '--expected-catalog-sha256',f.expected,'--out',join(f.dir,'invalid.json')]);
    assert.notEqual(duplicate.status,0);
    assert.equal(duplicate.stderr.includes('PRIVATE'),false);
    await assert.rejects(stat(join(f.dir,'invalid.json')),{code:'ENOENT'});
    const git=runner(['--save',join(f.dir,'future.profile'),
      '--catalog',f.catalog,'--expected-catalog-sha256',f.expected,
      '--out',join(REPO,'tools/db-05-save/PROHIBITED-private-report.json')]);
    assert.notEqual(git.status,0);
  }finally{await rm(f.dir,{recursive:true,force:true});}
});
