import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
test('all Custom memories preserve exact override relationships without treating shared consumables as grants',async()=>{
  const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
  const ids=await db.findItemIdsByField('source.AppearanceCondition',{kind:'equals',value:9});
  const memories=(await db.getItemFields(ids,['nativeCategory','source.ConsummableOverrideItemID','source.NumberOfShards','acquisition.customMemoryConsummable','acquisition.effectiveCategories'])).filter(r=>r.values.nativeCategory==='MemoryShard');
  assert.equal(memories.length,299);
  const orbIds=[...new Set(memories.map(r=>r.values['source.ConsummableOverrideItemID']))];
  assert.equal(orbIds.length,102);
  const orbs=new Map((await db.getItemFields(orbIds,['sourceClass','observedFields','source.DefaultItem','source.IsMissionItem','acquisition.effectiveCategories','acquisition.customMemoryItemIds'])).map(r=>[r.itemId,r.values]));
  const counts={},classified={};
  for(const r of memories){
    const v=r.values,e=v['acquisition.customMemoryConsummable'],orbId=v['source.ConsummableOverrideItemID'],o=orbs.get(orbId),d=o['source.DefaultItem'];
    assert.equal(o.sourceClass,'ConsummableItemData');
    const selector=o.observedFields.some(([n,w])=>n===10&&w===2);
    const status=selector?'selector_field_present':d.ItemID===r.itemId?'explicit_matching_default':'different_default';
    assert.equal(e.memoryItemId,r.itemId);assert.equal(e.consummableItemId,orbId);
    assert.equal(e.contentStatus,status);assert.deepEqual(e.defaultItem,d??null);
    assert.equal(e.selectorFieldPresent,selector);assert.equal(e.isMissionItem,o['source.IsMissionItem']===true);
    assert.equal(e.sourceMemorySha256,db.release.sourceFilesSha256.MemoryShard);
    assert.equal(e.sourceActivityItemSha256,db.release.sourceFilesSha256.ActivityItem);
    assert.equal(e.runtimeContentVerified,false);assert.equal(e.guaranteedGrantVerified,false);assert.equal(e.currentAvailabilityVerified,false);
    const expected=status==='explicit_matching_default'&&d.State.MemoryShardIndex<v['source.NumberOfShards']?
      ['ordinary_gameplay','in_game_limited_event'].filter(c=>(o['acquisition.effectiveCategories']??[]).includes(c)):[];
    assert.deepEqual(e.configuredCategories,expected);
    for(const c of expected){assert(v['acquisition.effectiveCategories'].includes(c));classified[c]=(classified[c]??0)+1;}
    counts[status]=(counts[status]??0)+1;
    assert(o['acquisition.customMemoryItemIds'].includes(r.itemId));
  }
  assert.deepEqual(counts,{explicit_matching_default:68,different_default:8,selector_field_present:223});
  for(const [orbId,o] of orbs)assert.deepEqual(o['acquisition.customMemoryItemIds'],memories.filter(r=>r.values['source.ConsummableOverrideItemID']===orbId).map(r=>r.itemId).sort((a,b)=>a-b));
  console.log('DB01_CUSTOM_MEMORY_VERIFIED '+JSON.stringify({items:memories.length,orbs:orbIds.length,counts,classified}));
});
