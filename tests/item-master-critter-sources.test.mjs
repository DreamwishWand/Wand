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

test('126 original critter food filters reuse the shared definition evidence and preserve all type-matched candidates',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{
    requests.push(url);return new Response(await readFile('static'+url),{status:200});
  });
  const reader=createCritterSourceReader(db);
  const ids=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'CritterItemData'});
  const rows=await reader.getFoodFilterCandidates(ids);
  const all=rows.flatMap(r=>[r.like,r.favorite].filter(Boolean));
  assert.equal(all.length,126);
  assert(all.every(r=>r.status==='source_definition_candidates'&&r.nativeFilterVerified===false));
  const unique=new Set(all.map(f=>f));
  assert(unique.size<=26);
  const counts=new Map();
  for(const f of all)counts.set(f.facts.activitySubtypeCode,(counts.get(f.facts.activitySubtypeCode)??0)+1);
  assert.deepEqual([...counts].sort((a,b)=>a[0]-b[0]),[[2,16],[3,31],[8,14],[10,27],[11,33],[16,5]]);
  assert.equal(all.filter(f=>f.facts.directTagGroups.length>0).length,53);
  assert.equal(all.filter(f=>f.facts.minimumMealStars!==null).length,26);
  assert.equal(all.filter(f=>f.facts.ingredientTypeReferences.length>0).length,16);
  for(const [condition,expected,definitions] of [[1,40,5],[2,125,11]]){
    const crops=all.filter(f=>f.facts.cropTypeCondition===condition);
    assert.equal(crops.length,definitions);
    for(const f of crops){
      assert.equal(f.candidates.length,165);
      assert.equal(f.candidates.filter(c=>c.cropTypeMatch===true).length,expected);
      assert.equal(f.candidates.filter(c=>c.cropTypeMatch===false).length,165-expected);
    }
  }
  const rabbit=rows.find(r=>r.critterItemId===120100000);
  assert.equal(rabbit.favorite,null);
  assert.equal(rabbit.like.facts.cropTypeCondition,2);
  // Separate calls through the shared detail entry point must reuse the
  // same candidate promises and inverse preparation for this exact DB.
  const secondReader=createCritterSourceReader(db);
  assert.equal(secondReader,reader);
  const repeated=await secondReader.getFoodFilterCandidates([120100000]);
  assert.equal(repeated[0].like,rabbit.like);
  const otherDb=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  assert.notEqual(createCritterSourceReader(otherDb),reader);
  const [carrot,missing,duplicate]=await secondReader.getForFoodFilterCandidates([30200000,99999999,30200000]);
  assert.equal(carrot.status,'indexed');assert.equal(missing,null);assert.deepEqual(carrot,duplicate);
  assert(carrot.references.some(r=>r.critterItemId===120100000&&r.preference==='like'&&r.evidence.cropTypeMatch===true));
  for(const ref of carrot.references){
    assert.deepEqual(ref.evidence,rows.find(r=>r.critterItemId===ref.critterItemId)[ref.preference].candidates.find(r=>r.itemId===30200000));
  }
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});


test('ordinary befriending classification preserves every eligible original village critter reward and excludes appearance gates',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const ids=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'CritterItemData'});
  const reader=createCritterSourceReader(db);
  const defs=(await reader.getForCritters(ids)).map(r=>r.definition);
  const raw=await db.getItemFields(ids,['source.AppearanceConditions','observedFields']);
  const gateTag=(await db.getSourceRelations()).sourceFieldDeclarations.CritterItemData.AppearanceConditions;
  const classes=new Map(await db.getFieldRows('sourceClass'));
  const key=(pet,critter,count,area,gate)=>JSON.stringify([pet,critter,count,area,gate]);
  const expected=[];
  for(const [i,d] of defs.entries()){
    if(classes.get(d.befriendingPetItemId)!=='PetItemData'||d.location?.kind!=='village_area'||!(d.feedingBeforeUnlock>0)||
      !d.schedule.some(day=>day.some(s=>s.endHour>s.startHour)))continue;
    const v=raw[i].values,gate=v['source.AppearanceConditions'];
    const absent=gate===undefined&&Number.isSafeInteger(gateTag)&&!v.observedFields.some(([n])=>n===gateTag);
    const empty=gate!==null&&typeof gate==='object'&&!Array.isArray(gate)&&Object.keys(gate).length===0;
    if(absent||empty)expected.push(key(d.befriendingPetItemId,d.critterItemId,d.feedingBeforeUnlock,d.location.areaCode,absent?'field_absent':'explicit_empty'));
  }
  assert(expected.length>0);
  const actual=await db.getFieldRows('acquisition.ordinaryCritterSources');
  const effective=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
  const native=await db.getNativeAcquisitionCandidates(actual.map(([id])=>id));
  assert.deepEqual(actual.flatMap(([id,links],i)=>links.map(l=>{
    assert(effective.get(id).includes('ordinary_gameplay'));
    assert.equal(l.sourceFileSha256,db.release.sourceFilesSha256.Companion);
    assert.equal(l.currentAvailabilityVerified,false);assert.equal(l.guaranteedGrantVerified,false);
    assert(native[i].some(([source,role,path])=>source===l.sourceItemId&&role==='critter_befriending_reward'&&path===l.sourcePath));
    return key(id,l.sourceItemId,l.configuredFeedingCount,l.villageAreaCode,l.appearanceGate);
  })).sort(),expected.sort());
  assert(!actual.some(([,links])=>links.some(l=>l.sourceItemId===120100056)));
});
