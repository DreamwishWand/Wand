import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { openCurrentGameDatabasePages } from '../src/lib/game-db/client.mjs';

const root=resolve(new URL('..',import.meta.url).pathname);
function localFetch(log=[],alter=null) {
  return async (url) => {
    log.push(url);
    const relative=url.replace(/^\/Wand\//,'');
    try {
      let bytes=await readFile(join(root,'static',relative));
      if(alter) bytes=alter(url,bytes);
      return new Response(bytes,{status:200});
    } catch(error) {
      if(error.code==='ENOENT') return new Response('',{status:404});
      throw error;
    }
  };
}
function shardReads(log) {
  return log.filter(url=>/\/items-[0-9]{3,}\.json$/.test(url));
}

test('DB-00 lazily opens the real Steam 1.26.2 release and reads only requested SHA-pinned shards',async()=>{
  const log=[];
  const catalog=await openCurrentGameDatabasePages('/Wand',localFetch(log));
  assert.equal(catalog.kind,'db_snapshot');
  assert.equal(catalog.transport,'sha256_paged');
  assert.equal(catalog.snapshotId,'steam-1.26.2-native-itemlist-v1');
  assert.equal(catalog.itemCount,13202);
  assert.equal(catalog.target.platform,'Steam');
  assert.equal(shardReads(log).length,0,'opening a catalog must not read 13k rows');

  const first=await catalog.loadPage({limit:40});
  assert.equal(first.items.length,40);
  assert.equal(first.items[0].id,'30000031');
  assert.equal(first.nextOffset,40);
  assert.equal(first.done,false);
  assert.equal(shardReads(log).length,1);
  const second=await catalog.loadPage({offset:40,limit:60});
  assert.equal(second.items.length,60);
  assert.equal(shardReads(log).length,1,'neighboring pages reuse the same pinned shard');
  assert.notEqual(first.items[0],second.items[0]);

  const crossing=await catalog.loadPage({offset:990,limit:20});
  assert.equal(crossing.items.length,20);
  assert.equal(crossing.nextOffset,1010);
  assert.equal(shardReads(log).length,2,'crossing one 1000-row boundary fetches only the next shard');

  const last=await catalog.loadPage({offset:13200,limit:20});
  assert.equal(last.items.length,2);
  assert.equal(last.done,true);
  assert.equal(last.nextOffset,null);
  assert.equal(shardReads(log).length,3,'last shard is fetched without all intermediary shards');
  const empty=await catalog.loadPage({offset:13202,limit:50});
  assert.deepEqual(empty.items,[]);
  assert.equal(empty.done,true);
  assert.equal(shardReads(log).length,3);
});
test('DB-00 concurrent scroll requests share one shard fetch, but cannot mutate the verified cache',async()=>{
  const log=[];
  const catalog=await openCurrentGameDatabasePages('/Wand',localFetch(log));
  const pages=await Promise.all([
    catalog.loadPage({offset:0,limit:10}),
    catalog.loadPage({offset:5,limit:10}),
    catalog.loadPage({offset:0,limit:10})
  ]);
  assert.equal(shardReads(log).length,1);
  const id=pages[0].items[0].id;
  const name=pages[0].items[0].names.ja;
  pages[0].items[0].names.ja='TAMPERED';
  pages[0].items[0].id='999';
  const again=await catalog.loadPage({offset:0,limit:1});
  assert.equal(again.items[0].id,id);
  assert.equal(again.items[0].names.ja,name);
  assert.equal(shardReads(log).length,1);
});
test('DB-00 rejects oversized/unbounded paging and corrupted shard bytes',async()=>{
  const catalog=await openCurrentGameDatabasePages('/Wand',localFetch());
  for(const options of [{limit:0},{limit:501},{offset:-1},{offset:13203},
    {offset:1.1},{limit:1.1},{offset:NaN},{offset:Infinity}]) {
    await assert.rejects(catalog.loadPage(options),/Invalid paged Game DB offset or limit/);
  }
  const corrupt=localFetch([], (url,bytes) => url.endsWith('items-000.json')
    ? Buffer.concat([bytes,Buffer.from('x')]) : bytes);
  const tampered=await openCurrentGameDatabasePages('/Wand',corrupt);
  await assert.rejects(tampered.loadPage({offset:0,limit:10}),/byte count mismatch/);
  // Same poisoned shard remains rejectable, never cached as a successful response.
  await assert.rejects(tampered.loadPage({offset:0,limit:10}),/byte count mismatch/);
});
test('DB-00 rollback can still page legacy Collection records (explicit eager transport)',async()=>{
  const log=[];
  const fallback=localFetch(log);
  const reader=await openCurrentGameDatabasePages('/Wand', async url => {
    if(url==='/Wand/ddv/game-db/active.json') return new Response('',{status:404});
    return fallback(url);
  });
  assert.equal(reader.kind,'legacy_collection');
  assert.equal(reader.transport,'eager_legacy');
  assert.equal(reader.itemCount,12552);
  const page=await reader.loadPage({offset:0,limit:2});
  assert.equal(page.items.length,2);
  assert.equal(page.nextOffset,2);
  assert.ok(log.some(url=>url.endsWith('records-17.json')));
});
