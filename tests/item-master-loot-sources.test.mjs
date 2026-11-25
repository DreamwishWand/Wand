import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createLootSourceReader} from '../src/lib/items/public-loot-sources.ts';

test('all original LootTable groups and occurrences retain configuration, condition and item state',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const reader=createLootSourceReader(db);
  const ids=await db.findItemIdsByField('nativeCategory',{kind:'equals',value:'LootTable'});
  assert.equal(ids.length,960);
  const tables=await reader.getForTables(ids);
  assert(tables.every(r=>r.status==='indexed'));
  const defs=tables.map(r=>r.definition);
  assert.equal(defs.reduce((n,d)=>n+d.groups.length,0),2087);
  assert.equal(defs.filter(d=>d.occurrences.length).length,944);
  const all=defs.flatMap(d=>d.occurrences);
  assert.equal(all.length,3804);
  assert.equal(all.filter(r=>r.conditionalGroupIndex!==null).length,60);
  assert.equal(all.filter(r=>r.conditions!==null).length,60);
  assert.equal(all.filter(r=>r.state!==null).length,675);
  const itemIds=[...new Set(all.map(r=>r.itemId))].sort((a,b)=>a-b);
  assert.equal(itemIds.length,1100);
  const first=defs.find(d=>d.tableItemId===2090000000);
  assert.equal(first.groups[0].minimum,100);
  assert.equal(first.groups[0].maximum,300);
  assert.equal(first.groups[0].weight,70);
  assert.equal(first.occurrences[0].itemId,80000000);
  const conditional=defs.find(d=>d.tableItemId===2090000339).occurrences.find(r=>r.conditionalGroupIndex!==null);
  assert.equal(conditional.itemId,31700169);
  assert.equal(conditional.sourcePath,'source.Rewards.SubLootTables[0].ItemsConditional[0].Items[0].ItemID');
  assert(conditional.conditions);
  const inverse=await reader.getForItems(itemIds);
  assert(inverse.every(r=>r.status==='indexed'&&r.guaranteedRewardVerified===false&&r.currentAvailabilityVerified===false));
  const key=r=>r.tableItemId+':'+r.sourcePath+':'+r.itemId;
  assert.deepEqual(inverse.flatMap(r=>r.sources.map(s=>key(s.occurrence))).sort(),all.map(key).sort());
  assert(inverse.find(r=>r.itemId===31700169).sources.some(s=>key(s.occurrence)===key(conditional)));
  const [a,missing,b]=await reader.getForItems([31700169,99999999,31700169]);
  assert.equal(missing,null);assert.deepEqual(a,b);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});

test('canonical loot referrers retain original occurrence paths and optional localized source identities',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{
    requests.push(url);return new Response(await readFile('static'+url),{status:200});
  });
  const reader=createLootSourceReader(db);
  const ids=await db.findItemIdsByField('nativeCategory',{kind:'equals',value:'LootTable'});
  const [contexts,edges]=await Promise.all([reader.getTableReferrers(ids,'ja'),db.getItemsReferences(ids,'incoming')]);
  const byId=new Map(contexts.map(r=>[r.tableItemId,r]));
  for(const [i,c] of contexts.entries()){
    assert.equal(c.status,'indexed');
    assert.equal(c.coverageComplete,false);
    assert.deepEqual(c.referrers.map(r=>[r.sourceItemId,r.sourcePath]),edges[i]);
    assert(c.referrers.every(r=>r.locale==='ja'&&r.acquisitionContextVerified===false));
  }
  const refs=(tableId)=>byId.get(tableId).referrers;
  assert(refs(2090000111).some(r=>r.sourceItemId===31400007&&r.role==='loot_present'));
  assert(refs(2090000292).some(r=>r.sourceItemId===40600126&&r.role==='blocker_reward'));
  assert(refs(2090000173).some(r=>r.sourceItemId===2070000620&&r.role==='quest_override_reward'));
  assert(refs(2090000003).some(r=>r.sourceItemId===2010000003&&r.role==='recurring_weed_override'));
  const {ACTIVITY_ITEM_LOOT_REFS,FURNITURE_LOOT_REFS}=await import('../src/lib/acquisition/native-loot-object-references.data.ts');
  for(const [id,suffix,field] of ACTIVITY_ITEM_LOOT_REFS){
    const path=field===8?'source.LootTableItemID':field===9?'source.TreasureLootTable':'source.DefaultItem.ItemID';
    assert(refs(2090000000+suffix).some(r=>r.sourceItemId===id&&r.sourcePath===path),String(id)+' '+path);
  }
  for(const [id,suffix] of FURNITURE_LOOT_REFS){
    assert(refs(2090000000+suffix).some(r=>r.sourceItemId===id&&r.sourcePath==='source.RewardLootTableItemID'),String(id));
  }
  const [item]=await reader.getForItems([31700169],'ja');
  assert(item.sources.length);
  for(const source of item.sources)assert.deepEqual(source.tableReferrers,byId.get(source.occurrence.tableItemId));
  const [bare]=await reader.getForItems([31700169]);
  assert(bare.sources.every(s=>s.tableReferrers===undefined));
  const [a,missing,notTable,b]=await reader.getTableReferrers([2090000111,99999999,31400007,2090000111],'ja');
  assert.equal(missing,null);assert.equal(notTable.status,'not_loot_table');assert.deepEqual(a,b);
  const details=await (await import('../src/lib/items/public-item-details.ts')).openCurrentItemDetails('',async url=>new Response(await readFile('static'+url),{status:200}));
  assert.deepEqual(await details.getItemLootSources([31700169],'ja'),[item]);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});
