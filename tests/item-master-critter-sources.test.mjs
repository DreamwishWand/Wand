import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createCritterSourceReader} from '../src/lib/items/public-critter-sources.ts';

test('all 125 original critter definitions preserve schedules, feeding selectors and pet reward references',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{
    requests.push(url);return new Response(await readFile('static'+url),{status:200});
  });
  const reader=createCritterSourceReader(db);
  const ids=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'CritterItemData'});
  assert.equal(ids.length,125);
  const rows=await reader.getForCritters(ids);
  assert(rows.every(r=>r.status==='indexed'));
  const defs=rows.map(r=>r.definition);
  assert.equal(defs.filter(d=>d.location?.kind==='village_area').length,105);
  assert.equal(defs.filter(d=>d.location?.kind==='scene').length,20);
  assert(defs.every(d=>d.schedule.length===7&&d.currentAvailabilityVerified===false));
  const intervals=defs.flatMap(d=>d.schedule.flat());
  assert.equal(intervals.length,577);
  assert.equal(intervals.filter(s=>!s.startFieldPresent&&s.startHour===0).length,429);
  const count=(field,mode)=>defs.filter(d=>d[field].mode===mode).length;
  for(const [field,expected] of [['like',[20,10,95]],['favorite',[81,13,31]]]){
    assert.deepEqual(['Item','ItemList','FilterGenerator'].map(m=>count(field,m)),expected);
  }
  const likes=defs.flatMap(d=>d.like.explicitItems);
  const favorites=defs.flatMap(d=>d.favorite.explicitItems);
  assert.equal(likes.length,55);assert.equal(favorites.length,117);
  assert.equal(new Set(likes.map(r=>r.itemId)).size,15);
  assert.equal(new Set(favorites.map(r=>r.itemId)).size,32);
  assert.equal(new Set(defs.map(d=>d.likeLootTableItemId)).size,24);
  assert.equal(new Set(defs.map(d=>d.favoriteLootTableItemId)).size,24);
  const pets=defs.filter(d=>d.befriendingPetItemId!==null&&d.befriendingPetItemId>0);
  assert.equal(pets.length,105);
  assert.equal(new Set(pets.map(d=>d.befriendingPetItemId)).size,105);
  const petRefs=await db.getNativeAcquisitionCandidates(pets.map(d=>d.befriendingPetItemId));
  for(const [i,p] of pets.entries())assert(petRefs[i].some(r=>r[0]===p.critterItemId&&
    r[1]==='critter_befriending_reward'&&r[2]==='source.BefriendingPetRewardItemID'));
  const rabbit=defs.find(d=>d.critterItemId===120100000);
  assert.deepEqual(rabbit.location,{kind:'village_area',areaCode:2});
  assert.deepEqual(rabbit.schedule[0],[{startHour:12,endHour:24,startFieldPresent:true,endFieldPresent:true}]);
  assert.deepEqual(rabbit.schedule[2],[]);
  assert.equal(rabbit.favorite.explicitItems[0].itemId,30200000);
  assert.equal(rabbit.like.original.FilterGenerator.CropType,2);
  assert.equal(rabbit.feedingBeforeUnlock,2);
  assert.equal(rabbit.befriendingPetItemId,120000002);
  const turtle=defs.find(d=>d.critterItemId===120100002);
  assert.deepEqual(turtle.location,{kind:'village_area',areaCode:0});
  const foodIds=[...new Set([...likes,...favorites].map(r=>r.itemId))].sort((a,b)=>a-b);
  const reverse=await reader.getForFood(foodIds);
  const key=(id,p,i,path)=>JSON.stringify([id,p,i,path]);
  const forward=defs.flatMap(d=>['like','favorite'].flatMap(p=>d[p].explicitItems.map(r=>key(d.critterItemId,p,r.itemId,r.sourcePath))));
  assert.deepEqual(reverse.flatMap(r=>r.sources.map(s=>key(s.critterItemId,s.preference,r.itemId,s.sourcePath))).sort(),forward.sort());
  assert(reverse.every(r=>r.status==='indexed'&&r.filterEligibilityVerified===false));
  const [a,noncritter,missing,b]=await reader.getForCritters([120100000,30200000,99999999,120100000]);
  assert.equal(noncritter.status,'not_critter');assert.equal(missing,null);assert.deepEqual(a,b);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});
