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


test('every dialogue stall item occurrence joins the original stall to the canonical target without conflating loot slots',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const ids=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'StallBuildingItemData'});
  const raw=await db.getItemFields(ids,['source.DialogueStall']);
  const expected=[];
  for(const row of raw)for(const [i,v] of (row.values['source.DialogueStall']?.ItemsToGive??[]).entries()){
    if(Number.isSafeInteger(v.ItemToGive)&&v.ItemToGive>0)expected.push({stallItemId:row.itemId,
      itemId:v.ItemToGive,sourcePath:'source.DialogueStall.ItemsToGive['+i+'].ItemToGive',
      original:v,configuredGrantVerified:false,currentAvailabilityVerified:false});
  }
  assert(expected.length>0);
  const reader=createStallLootReader(db);
  const forward=await reader.getForStalls(ids);
  assert.deepEqual(forward.flatMap(r=>r.definition.dialogueItems),expected);
  const targets=[...new Set(expected.map(r=>r.itemId))];
  const reverse=await reader.getForItems(targets);
  const key=r=>JSON.stringify([r.stallItemId,r.itemId,r.sourcePath]);
  assert.deepEqual(reverse.flatMap(r=>r.dialogueSources.map(s=>{
    assert.equal(s.stall.stallItemId,s.occurrence.stallItemId);
    assert.equal(s.occurrence.itemId,r.itemId);
    assert.equal(s.occurrence.configuredGrantVerified,false);
    assert.equal(s.occurrence.currentAvailabilityVerified,false);
    return key(s.occurrence);
  })).sort(),expected.map(key).sort());
  const known=targets[0];
  const [a,missing,b]=await reader.getForItems([known,99999999,known]);
  assert.equal(missing,null);assert.deepEqual(a,b);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
  console.log('DB01_DIALOGUE_STALL '+JSON.stringify({occurrences:expected.length,items:targets.length,
    stalls:new Set(expected.map(r=>r.stallItemId)).size}));
});
