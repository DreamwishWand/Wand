import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createPreferenceSourceReader} from '../src/lib/items/public-preference-sources.ts';

test('all original character preference profiles and pools preserve repeated slots and include/exclude occurrences',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{
    requests.push(url);return new Response(await readFile('static'+url),{status:200});
  });
  const reader=createPreferenceSourceReader(db);
  const [charIds,profileIds,poolIds]=await Promise.all(['CharacterItemData','PreferenceProfileItemData','PreferencePoolItemData'].map(value=>
    db.findItemIdsByField('sourceClass',{kind:'equals',value})));
  assert.deepEqual([charIds.length,profileIds.length,poolIds.length],[142,86,86]);
  const [chars,profiles,pools]=await Promise.all([reader.getForCharacters(charIds),reader.getForProfiles(profileIds),reader.getForPools(poolIds)]);
  assert([...chars,...profiles,...pools].every(r=>r.status==='indexed'&&r.definition));
  const cs=chars.map(r=>r.definition),ps=profiles.map(r=>r.definition),qs=pools.map(r=>r.definition);
  assert.equal(cs.filter(c=>c.primary!==null).length,88);
  assert.equal(cs.filter(c=>c.fallback!==null).length,3);
  assert.equal(new Set(cs.flatMap(c=>c.primary?[c.primary.profileItemId]:[])).size,71);
  assert.deepEqual(cs.filter(c=>c.fallback).map(c=>c.characterItemId).sort((a,b)=>a-b),[10000049,10000050,10000209]);
  assert(cs.filter(c=>c.fallback).every(c=>c.fallback.profileItemId===1510000098));
  assert(ps.every(p=>p.slots.length===3&&new Set(p.slots.map(s=>s.poolItemId)).size<3));
  assert.deepEqual(ps.find(p=>p.profileItemId===1510000002).slots.map(s=>s.poolItemId),[1510100005,1510100005,1510100007]);
  assert.deepEqual(cs.find(c=>c.characterItemId===10000001).primary.slots.map(s=>s.poolItemId),[1510100090,1510100090,1510100090]);
  assert.equal(qs.flatMap(p=>p.rules).length,430);
  const modes=['all','custom','unset'];
  for(const [group,expected] of Object.entries({
    FavoriteFlowers:[25,50,11],FavoriteMeals:[24,49,13],FavoriteIngredients:[14,44,28],
    FavoriteMinerals:[22,49,15],FavoriteCraftingMaterials:[13,22,51]
  })){
    const rules=qs.flatMap(p=>p.rules.filter(r=>r.group===group));
    assert.deepEqual(modes.map(m=>rules.filter(r=>r.inclusionMode===m).length),expected,group);
  }
  const forward=[];
  const key=(i,p,path)=>JSON.stringify([i,p,path]);
  for(const pool of qs)for(const rule of pool.rules){
    for(const [polarity,items] of [['Inclusions.Custom',rule.inclusions.Custom?.SpecificItems??[]],['Exclusions',rule.exclusions.SpecificItems??[]]]){
      items.forEach((itemId,index)=>forward.push({itemId,poolItemId:pool.poolItemId,path:'source.'+rule.group+'.'+polarity+'.SpecificItems['+index+']'}));
    }
  }
  assert.equal(forward.length,1457);
  assert.equal(forward.filter(r=>r.path.includes('.Inclusions.')).length,1068);
  assert.equal(forward.filter(r=>r.path.includes('.Exclusions.')).length,389);
  const ids=[...new Set(forward.map(r=>r.itemId))].sort((a,b)=>a-b);
  assert.equal(ids.length,490);
  const inverse=await reader.getForItems(ids);
  assert(inverse.every(r=>r.status==='indexed'&&r.dailySelectionVerified===false&&r.filterMembershipVerified===false));
  assert.deepEqual(inverse.flatMap(r=>r.occurrences.map(s=>key(r.itemId,s.poolItemId,s.sourcePath))).sort(),
    forward.map(r=>key(r.itemId,r.poolItemId,r.path)).sort());
  const contexts=new Map();
  for(const c of cs)for(const role of ['primary','fallback']){
    const profile=c[role];if(!profile)continue;
    for(const slot of profile.slots){
      const list=contexts.get(slot.poolItemId)??[];
      list.push(JSON.stringify([c.characterItemId,profile.profileItemId,role,slot.slotIndex]));
      contexts.set(slot.poolItemId,list);
    }
  }
  for(const r of inverse)for(const occ of r.occurrences){
    assert.equal(occ.polarity,occ.sourcePath.includes('.Exclusions.')?'exclude':'include');
    assert.deepEqual(occ.characterSlots.map(s=>JSON.stringify([s.characterItemId,s.profileItemId,s.role,s.slotIndex])).sort(),[...(contexts.get(occ.poolItemId)??[])].sort());
  }
  const [a,missing,nonchar,b]=await reader.getForCharacters([10000001,99999999,30200000,10000001]);
  assert.equal(missing,null);assert.equal(nonchar.status,'not_character');assert.deepEqual(a,b);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});
