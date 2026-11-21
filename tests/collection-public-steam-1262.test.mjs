import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateSnapshot} from '../src/lib/game-db/model.mjs';

const root=fileURLToPath(new URL('../static/ddv/game-db/',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const RELEASE='steam-1.26.2-native-itemlist-v1';

test('public Steam v1.26.2 exact-source ItemList release has 13,202 canonical IDs and honest name status',async()=>{
  const pointer=JSON.parse(await readFile(join(root,'active.json'),'utf8'));
  assert.equal(pointer.kind,'db_snapshot');
  assert.equal(pointer.snapshot,RELEASE);
  assert.equal(pointer.target.platform,'Steam');
  assert.equal(pointer.target.gameVersion,'1.26.2');
  assert.equal(pointer.path,'ddv/game-db/releases/'+RELEASE);
  const base=join(root,'releases',RELEASE);
  const indexBytes=await readFile(join(base,'index.json'));
  assert.equal(sha(indexBytes),pointer.indexSha256);
  const index=JSON.parse(indexBytes.toString('utf8'));
  assert.equal(index.count,13202);
  assert.equal(index.coverage.scope,'steam-v1.26.2-native-itemlist');
  assert.equal(index.coverage.complete,true);
  assert.equal(index.coverage.semanticCategoriesVerified,false);
  assert.equal(index.sources.length,1);
  assert.equal(index.sources[0].visibility,'public_reference');
  assert.equal(index.shards.length,14);
  assert.equal(index.search.length,8);
  const items=[];
  for(const shard of index.shards){
    const bytes=await readFile(join(base,shard.file));
    assert.equal(bytes.length,shard.bytes,shard.file);
    assert.equal(sha(bytes),shard.sha256,shard.file);
    const payload=JSON.parse(bytes.toString('utf8'));
    assert.equal(payload.schema,'wand.game-db.snapshot@1');
    assert.equal(payload.offset,items.length);
    assert.equal(payload.count,shard.count);
    items.push(...payload.items);
  }
  assert.equal(items.length,13202);
  assert.equal(new Set(items.map(x=>x.id)).size,13202);
  assert.equal(items.filter(x=>x.nameStatus==='verified').length,11492);
  assert.equal(items.filter(x=>x.nameStatus==='unverified').length,1710);
  assert.ok(items.every(x=>x.stateSemantic==='UNVERIFIED'
    && x.worlds.length===0 && x.universes.length===0
    && x.contentIds.length===0 && x.relations.length===0));
  const glass=items.find(x=>x.id==='40005160');
  assert.equal(glass.names.en,'Glass Shoe');
  assert.equal(glass.names.ja,'ガラスの靴');
  const validated=validateSnapshot({
    schema:'wand.game-db.snapshot@1',id:index.id,target:index.target,
    coverage:index.coverage,sources:index.sources,releases:index.releases,
    items,publishable:true
  });
  assert.equal(validated.items.length,13202);
  const copy=structuredClone(validated);
  copy.coverage.nameUnverified=1709;
  assert.throws(()=>validateSnapshot(copy),/unverified names/);
  for(const descriptor of index.search){
    const bytes=await readFile(join(base,descriptor.file));
    assert.equal(bytes.length,descriptor.bytes,descriptor.file);
    assert.equal(sha(bytes),descriptor.sha256,descriptor.file);
    const payload=JSON.parse(bytes.toString('utf8'));
    assert.equal(payload.snapshot,RELEASE);
    assert.equal(payload.locale,descriptor.locale);
    assert.ok(payload.terms['40005160']?.includes('40005160'));
  }
});
