import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createStallLootReader} from '../src/lib/items/public-stall-loot.ts';

test('all 90 native stall definitions, 335 slots and 1385 item occurrences join both ways without losing repeats',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{
    requests.push(url);
    return new Response(await readFile('static'+url),{status:200});
  });
  const reader=createStallLootReader(db);
  const stallIds=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'StallBuildingItemData'});
  assert.equal(stallIds.length,90);
  const stalls=await reader.getForStalls(stallIds);
  assert(stalls.every(r=>r.status==='indexed'&&r.currentAvailabilityVerified===false));
  const withSlots=stalls.filter(r=>r.slots.length);
  assert.equal(withSlots.length,65);
  assert.equal(stalls.filter(r=>r.definition.shopDataKey!==null).length,65);
  assert.equal(stalls.filter(r=>r.definition.dialogueStall!==null).length,6);
  const slots=stalls.flatMap(r=>r.slots);
  assert.equal(slots.length,335);
  assert.equal(new Set(slots.map(s=>s.lootTableId)).size,279);
  assert.equal(slots.filter(s=>s.table.groups.some(g=>g.availableWhen!==null||g.originalGroup.ItemsConditional?.length)).length,2);
  const key=(stallId,slotIndex,tableId,path,itemId)=>JSON.stringify([stallId,slotIndex,tableId,path,itemId]);
  const forward=stalls.flatMap(stall=>stall.slots.flatMap(slot=>slot.table.occurrences.map(o=>
    key(stall.itemId,slot.slotIndex,slot.lootTableId,o.sourcePath,o.itemId))));
  const itemIds=[...new Set(slots.flatMap(s=>s.table.occurrences.map(o=>o.itemId)))].sort((a,b)=>a-b);
  assert.equal(forward.length,1385);
  assert.equal(itemIds.length,606);
  const reverse=await reader.getForItems(itemIds);
  assert(reverse.every(r=>r.status==='indexed'&&r.currentAvailabilityVerified===false));
  assert.deepEqual(reverse.flatMap(r=>r.sources.map(s=>key(s.stall.stallItemId,s.slotIndex,
    s.loot.occurrence.tableItemId,s.loot.occurrence.sourcePath,r.itemId))).sort(),forward.sort());
  assert.equal(new Set(reverse.flatMap(r=>r.sources.map(s=>s.stall.stallItemId+':'+r.itemId))).size,745);
  const valley=stalls.find(r=>r.itemId===20100000);
  assert.deepEqual(valley.definition.slotLootTableIds,[2090000056,2090000052,2090000057,2090000052,2090000058,2090000052]);
  assert.deepEqual(reverse.find(r=>r.itemId===30200009).sources.filter(s=>s.stall.stallItemId===20100000).map(s=>s.slotIndex),[1,3,5]);
  const [known,nonstall,unknown,duplicate]=await reader.getForStalls([20100000,40000047,99999999,20100000]);
  assert.equal(nonstall.status,'not_stall');assert.equal(unknown,null);assert.deepEqual(known,duplicate);
  const [item,missing,again]=await reader.getForItems([30200009,99999999,30200009]);
  assert.equal(missing,null);assert.deepEqual(item,again);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});
