import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createBlockerSourceReader} from '../src/lib/items/public-blocker-sources.ts';

test('all original blocker definitions preserve direct rewards, loot and contextual references both ways',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const reader=createBlockerSourceReader(db);
  const ids=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'FurnitureBlockerItemData'});
  assert.equal(ids.length,422);
  const rows=await reader.getForBlockers(ids);
  assert(rows.every(r=>r.status==='indexed'));
  const defs=rows.map(r=>r.definition);
  const direct=defs.filter(d=>d.defaultRewardItemId!==null);
  assert.equal(direct.length,63);
  assert.equal(new Set(direct.map(d=>d.defaultRewardItemId)).size,52);
  const original=JSON.parse(await readFile('data/ddv/item-master/original-furniture-production-steam-1.26.2.json','utf8'));
  assert.deepEqual(direct.map(d=>[d.blockerItemId,d.defaultRewardItemId]),original.blockerDefaultRewards);
  const tools=defs.find(r=>r.blockerItemId===40600000);
  assert.deepEqual(tools.toolBreakable,{Tool:110500000,Upgrade:150100015});
  assert(defs.every(r=>!r.actualSpawnVerified&&!r.actualDropVerified));
  const expected=defs.flatMap(d=>(d.lootTable?.occurrences??[]).map(o=>[d.blockerItemId,o.itemId,o.sourcePath]));
  assert(expected.length>0);
  const items=[...new Set([...direct.map(d=>d.defaultRewardItemId),...expected.map(r=>r[1])])];
  const reverse=await reader.getForItems(items);
  const key=r=>JSON.stringify(r);
  assert.deepEqual(reverse.flatMap(r=>r.direct.map(d=>key([d.blockerItemId,r.itemId]))).sort(),
    original.blockerDefaultRewards.map(key).sort());
  assert.deepEqual(reverse.flatMap(r=>r.loot.map(l=>key([l.blocker.blockerItemId,r.itemId,l.occurrence.occurrence.sourcePath]))).sort(),
    expected.map(key).sort());
  const incoming=await db.getItemsReferences(ids,'incoming');
  const sourceIds=[...new Set(incoming.flatMap(r=>r.map(e=>e[0])))];
  const sourceRows=await db.getItemFields(sourceIds,['nativeCategory']);
  const sourceCategory=new Map(sourceRows.map(r=>[r.itemId,r.values.nativeCategory]));
  for(const [i,d] of defs.entries()){
    assert.deepEqual(d.contextReferences.map(r=>[r.sourceItemId,r.sourcePath]),
      incoming[i].filter(([id])=>['Mission','ConditionalEvent','RecurringEvent'].includes(sourceCategory.get(id))));
    assert(d.contextReferences.every(r=>r.spawnVerified===false));
  }
  const [a,non,missing,b]=await reader.getForBlockers([40600000,40000047,99999999,40600000]);
  assert.equal(non.status,'not_blocker');assert.equal(missing,null);assert.deepEqual(a,b);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
  console.log('DB01_BLOCKER_CONTEXT '+JSON.stringify({blockers:defs.length,direct:direct.length,
    lootTables:defs.filter(d=>d.lootTable!==null).length,lootOccurrences:expected.length,
    contextualReferences:defs.reduce((n,d)=>n+d.contextReferences.length,0),
    contextualBlockers:defs.filter(d=>d.contextReferences.length).length}));
});
