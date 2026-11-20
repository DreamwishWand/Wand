import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateCollectionRuntimeIndex, decodeCollectionRecord } from '../src/lib/collection/catalog.mjs';
import { CATEGORY_ORDER } from '../src/lib/collection/taxonomy.mjs';

const root = new URL('../static/ddv/collection/v1.25/', import.meta.url);

test('the complete v1.25 reference corpus matches its own immutable manifest', async () => {
  const index = validateCollectionRuntimeIndex(JSON.parse(await readFile(new URL('index.json',root),'utf8')));
  const found = new Set();
  let count = 0;
  const families = new Map();
  for (const shard of index.shards) {
    const bytes = await readFile(new URL(shard.file,root));
    assert.equal(bytes.length,shard.bytes,shard.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),shard.sha256,shard.file);
    const payload = JSON.parse(bytes.toString('utf8'));
    assert.equal(payload.count,shard.count);
    assert.equal(payload.offset,count);
    assert.equal(payload.r.length,shard.count);
    for (const row of payload.r) {
      const record = decodeCollectionRecord(index,row,'ja');
      assert.equal(found.has(record.itemId),false,'Duplicate Item ID '+record.itemId);
      found.add(record.itemId);
      assert.ok(record.label.length>0);
      families.set(record.family,(families.get(record.family)??0)+1);
    }
    count+=payload.r.length;
  }
  assert.equal(count,index.n);
  assert.equal(count,12552);
  assert.ok(families.has('Furniture'));
  assert.equal(CATEGORY_ORDER.filter(name=>families.has(name)).length,26);
});
