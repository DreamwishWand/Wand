import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  ORIGINAL_GUIDE_SHARD_FILE_SHA,
  ORIGINAL_GUIDE_SHARD_FILE_NAMES,
  ORIGINAL_GUIDE_SHARD_SOURCE_VERSION,
  ORIGINAL_GUIDE_SHARD_AUDIT_SHA,
  ORIGINAL_GUIDE_SHARD_TOTAL_BYTES,
  expectedOriginalGuideShardSha
} from '../src/lib/guide/shard-fingerprints.ts';

test('owner private original shard audit has exactly 32 full-file SHA-256 pins',()=>{
  const names=Object.keys(ORIGINAL_GUIDE_SHARD_FILE_SHA).sort();
  assert.deepEqual(names,Array.from({length:32},(_,i)=>`part-${String(i).padStart(2,'0')}.json`));
  assert(names.every(x=>/^[a-f0-9]{64}$/.test(ORIGINAL_GUIDE_SHARD_FILE_SHA[x])));
  assert.equal(new Set(Object.values(ORIGINAL_GUIDE_SHARD_FILE_SHA)).size,32);
  assert.equal(ORIGINAL_GUIDE_SHARD_SOURCE_VERSION,'1.26.1');
  assert.equal(ORIGINAL_GUIDE_SHARD_TOTAL_BYTES,98001716);
  assert.equal(ORIGINAL_GUIDE_SHARD_AUDIT_SHA,
    '99a539aad1884c92cc92337f52c6651879dc2f27493a9185dec36ff05863c4bf');
  assert.equal(expectedOriginalGuideShardSha('part-00.json'),
    '32af2babef912a63a1a153a498fc7bc39fcf0b0e21b347e11363cefc5e7fb084');
});

test('unexpected shard, traversal or changed filename fails closed',()=>{
  for(const path of ['part-32.json','part-00.json.bak','../part-00.json','quest-shards/part-00.json','PART-00.JSON',null]){
    assert.throws(()=>expectedOriginalGuideShardSha(path),/unknown owner-original shard/);
  }
});

test('actual owner-original shard files have exact full bytes if private fixture is available',async t=>{
  const dir=process.env.DB03_PRIVATE_SHARD_DIR;
  if(!dir)return t.skip('owner-private shards not published to CI');
  let total=0;
  for(let i=0;i<32;i++){
    const name=`part-${String(i).padStart(2,'0')}.json`;
    const bytes=await readFile(`${dir}/${name}`);
    total+=bytes.length;
    assert.equal(createHash('sha256').update(bytes).digest('hex'),expectedOriginalGuideShardSha(name));
  }
  assert.equal(total,ORIGINAL_GUIDE_SHARD_TOTAL_BYTES);
});

test('typed 32-source ledger exports frozen canonical filenames and rejects unsafe aliases',()=>{
  const expected=Array.from({length:32},(_,i)=>'part-'+String(i).padStart(2,'0')+'.json');
  assert.deepEqual(ORIGINAL_GUIDE_SHARD_FILE_NAMES,expected);
  assert(Object.isFrozen(ORIGINAL_GUIDE_SHARD_FILE_NAMES));
  assert(Object.isFrozen(ORIGINAL_GUIDE_SHARD_FILE_SHA));
  for(const name of expected){
    assert.equal(expectedOriginalGuideShardSha(name),ORIGINAL_GUIDE_SHARD_FILE_SHA[name]);
  }
  for(const unknown of ['__proto__','constructor','part-00.JSON','part-0.json',
    'part-033.json','part-00.json?download=1','part-00.json/..','/part-00.json',
    'part-31.json\0',42,undefined,{}]){
    assert.throws(()=>expectedOriginalGuideShardSha(unknown),
      /unknown owner-original shard/);
  }
});
