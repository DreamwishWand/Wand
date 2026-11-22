import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_CURRENT_CATALOG_SCHEMA,
  currentDb00ItemIds,loadCurrentDb02OriginCatalog
} from '../src/lib/acquisition/current-catalog.ts';

const ROOT=new URL('../static/ddv/game-db/releases/steam-1.26.2-native-itemlist-v1/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('index.json',ROOT),'utf8'));

function realDb00Snapshot(){
  const items=[];
  let next=0;
  for(const shard of manifest.shards){
    assert.equal(shard.offset,next);
    const bytes=readFileSync(new URL(shard.file,ROOT));
    assert.equal(bytes.byteLength,shard.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),shard.sha256);
    const payload=JSON.parse(bytes.toString('utf8'));
    assert.equal(payload.offset,next);
    assert.equal(payload.count,shard.count);
    assert.equal(payload.items.length,shard.count);
    items.push(...payload.items);
    next+=shard.count;
  }
  return {
    kind:'db_snapshot',id:manifest.id,
    target:manifest.target,coverage:manifest.coverage,items
  };
}
test('Real published DB-00 Steam 1.26.2 manifest and all 14 SHA-pinned shards provide 13,202 unique query IDs',()=>{
  assert.equal(DB02_CURRENT_CATALOG_SCHEMA,'wand.db02.current-db00-origins@1');
  const snapshot=realDb00Snapshot();
  assert.equal(snapshot.coverage.itemDefinitions,13202);
  const ids=currentDb00ItemIds(snapshot);
  assert.equal(ids.length,13202);
  assert.equal(new Set(ids).size,13202);
  assert.equal(ids[0],snapshot.items[0].id);
  assert.equal(ids.at(-1),snapshot.items.at(-1).id);
  assert(Object.isFrozen(ids));
  assert.throws(()=>ids.push('5'),TypeError);
});
test('Catalog import rejects cross-version, incomplete and duplicate published Item IDs',()=>{
  const snapshot=realDb00Snapshot();
  const incompatible={...snapshot,target:{...snapshot.target,gameVersion:'1.26.1'}};
  assert.throws(()=>currentDb00ItemIds(incompatible),/EXACT_DB00_RELEASE_REQUIRED/);
  assert.throws(()=>currentDb00ItemIds({...snapshot,items:snapshot.items.slice(1)}),
    /EXACT_DB00_RELEASE_REQUIRED/);
  assert.throws(()=>currentDb00ItemIds({
    ...snapshot,items:[...snapshot.items.slice(0,-1),snapshot.items[0]]
  }),/INVALID_OR_DUPLICATE_ITEM_ID/);
  assert.throws(()=>currentDb00ItemIds({
    ...snapshot,items:[{...snapshot.items[0],id:'0009'},...snapshot.items.slice(1)]
  }),/INVALID_OR_DUPLICATE_ITEM_ID/);
});
test('A user-supplied unverified private archive cannot drive the 13,202-item join',async()=>{
  const invalidArchive=new Uint8Array([1,2,3]);
  const trusted={
    platform:'Steam',gameVersion:'1.26.2',
    manifestSha256:'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c',
    src01ManifestSha256:'1ebf71a19792bb2293a710cec533b1471e4f2c0e695a9d413bbcfc305022f6',
    currentConditionSha256:'9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'
  };
  await assert.rejects(loadCurrentDb02OriginCatalog(
    invalidArchive,trusted,'/Wand',
    async()=>({status:404,ok:false})
  ),/PRIVATE_SRC02_ARCHIVE_SIZE/);
});
