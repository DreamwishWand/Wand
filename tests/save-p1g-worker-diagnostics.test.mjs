import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import {
  inspectLocalSaveDiagnosticsBytes, SAVE_LOCAL_WORKER_CONTRACT,
  MAX_LOCAL_P1G_BYTES, MAX_LOCAL_JSON_BYTES
} from '../src/lib/save/save-diagnostics-worker-core.mjs';
import { sanitizeSaveDiagnosticView, makeSaveDiagnosticView } from '../src/lib/save/diagnostic-view.mjs';

// Entirely synthetic, owner-private originals are never loaded into CI.
const KEY=Buffer.from('62357168683873614A38556C444A557A545A5864325467366D626F3857386e35','hex');
const ENTRY=Buffer.from('profile');
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);}return(c^0xffffffff)>>>0;}
function encodedP1g(decoded) {
  const json=Buffer.from(typeof decoded==='string'?decoded:JSON.stringify(decoded));
  const compressed=deflateRawSync(json);
  const local=Buffer.alloc(30+ENTRY.length+compressed.length);
  local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);
  local.writeUInt16LE(8,8);
  local.writeUInt32LE(crc32(json),14);
  local.writeUInt32LE(compressed.length,18);
  local.writeUInt32LE(json.length,22);
  local.writeUInt16LE(ENTRY.length,26);
  ENTRY.copy(local,30);
  compressed.copy(local,30+ENTRY.length);
  const central=Buffer.alloc(46+ENTRY.length);
  central.writeUInt32LE(0x02014b50,0);
  central.writeUInt16LE(20,4);
  central.writeUInt16LE(20,6);
  central.writeUInt16LE(8,10);
  central.writeUInt32LE(crc32(json),16);
  central.writeUInt32LE(compressed.length,20);
  central.writeUInt32LE(json.length,24);
  central.writeUInt16LE(ENTRY.length,28);
  ENTRY.copy(central,46);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(1,8);
  end.writeUInt16LE(1,10);
  end.writeUInt32LE(central.length,12);
  end.writeUInt32LE(local.length,16);
  const cipher=createCipheriv('aes-256-ecb',KEY,null);
  cipher.setAutoPadding(true);
  return new Uint8Array(Buffer.concat([cipher.update(Buffer.concat([local,central,end])),cipher.final()]));
}
const utf8=text=>new TextEncoder().encode(text);
function syntheticSave(version) {
  return {
    GameInfo:{Version:version},
    Player:{
      PlayerAccountPrivate:'SENSITIVE_PROFILE_CUSTOMER_ACCOUNT',
      ContainerInventories:{'99188':{ID:99188,Inventory:[{
        ItemID:40000001,Amount:4
      }]}}
    },
    World:{GridCollection:{
      Grids:{'17':{ID:17,Objects:{'125':{
        ID:125,ItemID:40000001,State:{Storage:{ContainerInventoryID:99188}}
      }}}},
      DiffGrids:{}
    }}
  };
}
function verifyRedactedReply(answer) {
  assert.equal(answer.kind,'save-diagnostics-summary');
  assert.equal(answer.contract,SAVE_LOCAL_WORKER_CONTRACT);
  assert.equal(answer.strictDecoderRoundTripVerified,false);
  assert.equal(answer.writerAuthorized,false);
  assert.equal(answer.exportAuthorized,false);
  assert.equal(answer.summary.knownPublicTemplates,440);
  const view=sanitizeSaveDiagnosticView(structuredClone(answer.summary));
  assert.equal(view.referenceRules.length,14);
  assert.equal(view.writerAuthorized,false);
  const chest=view.referenceRules.find(x=>x.id==='placed_storage_to_container');
  assert.equal(chest.observed,1);
  assert.equal(chest.resolved,1);
  const text=JSON.stringify(answer);
  for(const secret of [
    'SENSITIVE_PROFILE_CUSTOMER_ACCOUNT','40000001',
    '99188','125','PlayerAccountPrivate'
  ]) assert.equal(text.includes(secret),false,secret);
}

test('synthetic encrypted P1G 626/643 profiles decode inside isolated Worker core',async()=>{
  for(const v of [626,643]){
    const encrypted=encodedP1g(syntheticSave(v));
    const original=Uint8Array.from(encrypted);
    const result=await inspectLocalSaveDiagnosticsBytes('p1g',encrypted);
    verifyRedactedReply(result);
    assert.equal(result.format,'p1g');
    assert.deepEqual(encrypted,original); // core never mutates caller buffer
  }
});

test('strict decoded JSON 626/643 inputs emit same anonymous diagnostic views',async()=>{
  for(const v of [626,643]){
    const bytes=utf8(JSON.stringify(syntheticSave(v)));
    const result=await inspectLocalSaveDiagnosticsBytes('json',bytes);
    verifyRedactedReply(result);
    assert.equal(result.format,'json');
    const p1g=await inspectLocalSaveDiagnosticsBytes('p1g',encodedP1g(syntheticSave(v)));
    assert.deepEqual(result.summary,p1g.summary);
  }
});

test('unsafe huge JSON integers and duplicate keys are rejected before diagnostics',async()=>{
  const duplicate='{"GameInfo":{"Version":643},"Player":{"x":1,"x":2},"World":{}}';
  const unsafe='{"GameInfo":{"Version":643},"Player":{"unsafe":9007199254740993},"World":{}}';
  await assert.rejects(inspectLocalSaveDiagnosticsBytes('json',utf8(duplicate)),/Duplicate JSON object key/);
  await assert.rejects(inspectLocalSaveDiagnosticsBytes('json',utf8(unsafe)),/Unsafe JSON integer/);
  await assert.rejects(inspectLocalSaveDiagnosticsBytes('p1g',encodedP1g(duplicate)),/PROFILE_JSON_INVALID/);
  await assert.rejects(inspectLocalSaveDiagnosticsBytes('p1g',encodedP1g(unsafe)),/PROFILE_JSON_INVALID/);
});

test('invalid formats, malformed cipher and strict bounds fail before private data parsing',async()=>{
  await assert.rejects(inspectLocalSaveDiagnosticsBytes('unknown',new Uint8Array(16)),/DB05_LOCAL_SOURCE_INVALID/);
  await assert.rejects(inspectLocalSaveDiagnosticsBytes('p1g',new Uint8Array(15)),/DB05_LOCAL_SOURCE_SIZE_INVALID/);
  await assert.rejects(inspectLocalSaveDiagnosticsBytes('p1g',new Uint8Array(17)),/DB05_LOCAL_SOURCE_SIZE_INVALID/);
  await assert.rejects(inspectLocalSaveDiagnosticsBytes('json',new Uint8Array(0)),/DB05_LOCAL_SOURCE_SIZE_INVALID/);
  await assert.rejects(inspectLocalSaveDiagnosticsBytes('p1g',new Uint8Array(16)),Error);
  assert.equal(MAX_LOCAL_P1G_BYTES,32*1024*1024);
  assert.equal(MAX_LOCAL_JSON_BYTES,128*1024*1024);
});

test('raw save and arbitrary Worker metadata are not allowed to enter the UI view',()=>{
  const original=makeSaveDiagnosticView(syntheticSave(643));
  const source=structuredClone(original);
  source.referenceRules[0].label='SECRET_PLAYER_NAME_INJECTED';
  source.referenceRules[0].rawMapKey='99188_PRIVATE';
  source.path='/World/UserToken/99188';
  source.shapeDomains[0].name='PRIVATE_CUSTOMER_NAME';
  const view=sanitizeSaveDiagnosticView(source);
  assert.equal(view.referenceRules[0].label,original.referenceRules[0].label);
  const display=JSON.stringify(view);
  for(const secret of ['SECRET_PLAYER_NAME_INJECTED','99188_PRIVATE',
    'PRIVATE_CUSTOMER_NAME','/World/UserToken']) assert.equal(display.includes(secret),false);
  assert.equal(Object.isFrozen(view),true);
});

test('unrecognized, duplicated or missing public IDs and forged types fail closed',()=>{
  const original=makeSaveDiagnosticView(syntheticSave(643));
  const badUnknown=structuredClone(original);
  badUnknown.referenceRules[0].id='private-customer';
  assert.throws(()=>sanitizeSaveDiagnosticView(badUnknown),/DB05_DIAGNOSTIC_WORKER_REPLY_INVALID/);
  const badDuplicate=structuredClone(original);
  badDuplicate.referenceRules[0].id=badDuplicate.referenceRules[1].id;
  assert.throws(()=>sanitizeSaveDiagnosticView(badDuplicate),/DB05_DIAGNOSTIC_WORKER_REPLY_INVALID/);
  const badCount=structuredClone(original);
  badCount.referenceRules[0].observed=Number.MAX_SAFE_INTEGER+5;
  assert.throws(()=>sanitizeSaveDiagnosticView(badCount),/DB05_DIAGNOSTIC_WORKER_REPLY_INVALID/);
  const badShape=structuredClone(original);
  badShape.shapeDomains[0].status='UNRECOGNIZED';
  assert.throws(()=>sanitizeSaveDiagnosticView(badShape),/DB05_DIAGNOSTIC_WORKER_REPLY_INVALID/);
  const badPermissions=structuredClone(original);
  badPermissions.writerAuthorized=true;
  assert.throws(()=>sanitizeSaveDiagnosticView(badPermissions),/DB05_DIAGNOSTIC_WORKER_REPLY_INVALID/);
});

test('worker summary fields are fixed; nonstandard user data never becomes labels',async()=>{
  const save=syntheticSave(643);
  save.Player.SecretCredentials='SECRET_WORKER_CONTENT_123';
  save.World.GridCollection.Grids['PRIVATE_KEY']={
    ID:98,Objects:{'X-PRIVATE':{ID:200,State:{Storage:{ContainerInventoryID:99188}}}}
  };
  const result=await inspectLocalSaveDiagnosticsBytes('p1g',encodedP1g(save));
  const text=JSON.stringify(result);
  assert.equal(text.includes('SECRET_WORKER_CONTENT_123'),false);
  assert.equal(text.includes('PRIVATE_KEY'),false);
  assert.equal(text.includes('X-PRIVATE'),false);
});
