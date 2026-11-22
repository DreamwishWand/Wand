import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const REPO=resolve('.');
const CLI=join(REPO,'tools/db-05-save/db04-observed-grid-completion-cli.mjs');
const PYTEST=join(REPO,'tools/db-05-save/test_db04_grid_path_audit.py');
const native='GridData/OffGridBuildings/Expansion04/MissingNative.json';
const sampleSource=Buffer.from('08021002220800000000040000002a0150','hex');
const prepare= [
  'import importlib.util,sys',
  'from pathlib import Path',
  'p=Path(sys.argv[1]);sys.path.insert(0,str(p.parent))',
  'spec=importlib.util.spec_from_file_location("test_db04",p)',
  'm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)',
  'b=Path(sys.argv[2]);print(m.build_zip(b))'
].join('\n');
const run=args=>spawnSync(process.execPath,[CLI,...args],{
  cwd:REPO,encoding:'utf8',timeout:60000,maxBuffer:1024*1024
});
const profile={
  GameInfo:{Version:643,PrivateDevice:'SENSITIVE_DEVICE_USER'},
  Player:{Name:'SENSITIVE_PLAYER_NAME'},
  World:{GridCollection:{
    Grids:{
      '100':{ID:100,GridDataPath:'GridData/Villages/Village04-MeadowLevel-GridData.json'},
      '200':{ID:200,GridDataPath:'GridData/Villages/Village04-MeadowLevel-GridData.json'},
      '300':{ID:300,GridDataPath:'GridData/Furniture/Mission/NativeGrid-Two.json'},
      '400':{ID:400,GridDataPath:native}
    },
    DiffGrids:{}
  }}
};
test('private full observed GridData index CLI covers synthetic 3/3 paths without leaking identity',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'db05-observed-index-'));
  try{
    const save=join(dir,'owner.json'),base=join(dir,'partial.zip');
    const gridRoot=join(dir,'raw-streamingassets');
    const report=join(dir,'report.json'),bundle=join(dir,'bundle.zip');
    const raw=join(gridRoot,native);
    await mkdir(resolve(raw,'..'),{recursive:true});
    await writeFile(raw,sampleSource);
    await writeFile(save,JSON.stringify(profile));
    const pin=spawnSync('python3',['-c',prepare,PYTEST,base],{encoding:'utf8',cwd:REPO});
    assert.equal(pin.status,0,pin.stderr);
    const args=['--save',save,'--db04-archive',base,
      '--expected-db04-sha256',pin.stdout.trim(),
      '--native-grid-root',gridRoot,
      '--out-report',report,'--out-zip',bundle];
    const r=run(args);
    assert.equal(r.status,0,r.stderr);
    assert.deepEqual(JSON.parse(r.stdout),{
      schema:'wand.db05.private-observed-grid-source-extension@1',
      savedGridRecords:4,observedDistinctPaths:3,newNativeOriginalFiles:1,
      allObservedPathsCovered:true,wholeGameWorldCovered:false,
      writerAuthorized:false
    });
    const content=JSON.parse(await readFile(report,'utf8'));
    assert.equal(content.counts.totalCombinedDb04GridDefinitions,3);
    assert.equal(content.counts.observedPathsUnindexed,0);
    assert.equal(content.safety.editorWriterAuthorized,false);
    for(const secret of ['SENSITIVE','GridData/','MissingNative.json',
                         gridRoot,save,base]){
      assert.equal(JSON.stringify(content).includes(secret),false,secret);
      assert.equal(r.stdout.includes(secret),false,secret);
    }
    assert.ok((await stat(bundle)).size>0);
    const before=await readFile(report);
    assert.notEqual(run(args).status,0,'must not overwrite private reports');
    assert.deepEqual(await readFile(report),before);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('private observed GridData index refuses duplicate save JSON and source pin mismatch',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'db05-observed-source-guard-'));
  try{
    const save=join(dir,'owner.json'),base=join(dir,'partial.zip');
    const gridRoot=join(dir,'raw-streamingassets');
    const report=join(dir,'report.json'),bundle=join(dir,'bundle.zip');
    await mkdir(gridRoot,{recursive:true});
    const pin=spawnSync('python3',['-c',prepare,PYTEST,base],{encoding:'utf8',cwd:REPO});
    assert.equal(pin.status,0,pin.stderr);
    await writeFile(save,'{"GameInfo":{"Version":643},"Player":{"dup":1,"dup":2},"World":{}}');
    const args=['--save',save,'--db04-archive',base,
      '--expected-db04-sha256',pin.stdout.trim(),
      '--native-grid-root',gridRoot,
      '--out-report',report,'--out-zip',bundle];
    assert.notEqual(run(args).status,0);
    await assert.rejects(stat(report),{code:'ENOENT'});
    await assert.rejects(stat(bundle),{code:'ENOENT'});
    await writeFile(save,JSON.stringify(profile));
    args[5]='0'.repeat(64);
    assert.notEqual(run(args).status,0);
    await assert.rejects(stat(bundle),{code:'ENOENT'});
    args[5]=pin.stdout.trim();
    args[9]=join(REPO,'tools/db-05-save/NO_PRIVATE_OUTPUT_ALLOWED.json');
    assert.notEqual(run(args).status,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
