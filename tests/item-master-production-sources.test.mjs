import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createProductionSourceReader} from '../src/lib/items/public-production-sources.ts';

test('mining and timebending source rows retain actual result, locations, weights and oneof quantities',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const reader=createProductionSourceReader(db);
  const miningIds=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'MiningDataItemData'});
  const timeIds=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'TimeBendingDataItemData'});
  assert.equal(miningIds.length,299);assert.equal(timeIds.length,82);
  const defs=await db.getItemFields([...miningIds,...timeIds],['source.Result.ItemID']);
  const ids=[...new Set(defs.map(r=>r.values['source.Result.ItemID']))];
  assert.equal(new Set(defs.slice(0,299).map(r=>r.values['source.Result.ItemID'])).size,76);
  assert.equal(new Set(defs.slice(299).map(r=>r.values['source.Result.ItemID'])).size,76);
  const rows=await reader.getForItems(ids);
  assert(rows.every(r=>r.activityStatus==='indexed'));
  const all=rows.flatMap(r=>r.sources);
  const mining=all.filter(r=>r.kind==='mining'),time=all.filter(r=>r.kind==='timebending');
  assert.equal(mining.length,299);assert.equal(time.length,82);
  assert.equal(mining.filter(r=>r.rarityFieldPresent).length,276);
  assert.equal(mining.filter(r=>r.valuableField===true).length,160);
  assert.equal(mining.filter(r=>r.location?.kind==='scene').length,5);
  assert.equal(mining.filter(r=>r.location?.kind==='village_area').length,294);
  assert(mining.every(r=>r.weightPercentage!==null&&r.minimumHits!==null&&r.maximumHits!==null));
  const example=mining.find(r=>r.activityItemId===2050200022);
  assert.deepEqual(example.location,{kind:'village_area',areaCode:0});
  assert.equal(example.resultItemId,31600022);assert.equal(example.rarityCode,3);
  assert.equal(example.weightPercentage,900);assert.equal(example.minimumHits,3);assert.equal(example.maximumHits,5);
  assert.equal(time.filter(r=>r.locationsFieldPresent).length,47);
  assert.equal(time.filter(r=>r.configuredAmount!==null).length,79);
  assert.equal(time.filter(r=>r.configuredRange!==null).length,3);
  assert.equal(time.filter(r=>r.missionField===true).length,35);
  const mist=time.find(r=>r.activityItemId===2050400000);
  assert.equal(mist.resultItemId,80000003);
  assert.deepEqual(mist.configuredRange,{minimum:400,maximum:500,original:{Min:400,Max:500}});
  assert.deepEqual(mist.locations,[{kind:'scene',sceneItemId:1540000101},{kind:'scene',sceneItemId:1540000000}]);
  assert.equal(mist.category,'Mist');assert.equal(mist.baseMaterialization,1000);
  assert(rows.every(r=>r.currentAvailabilityVerified===false));
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});

test('all 171 original seeds preserve duration presence, yield, self-references and missing production',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const reader=createProductionSourceReader(db);
  const ids=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'SeedItemData'});
  assert.equal(ids.length,171);
  const rows=await reader.getForSeeds(ids);
  assert(rows.every(r=>r.status==='indexed'));
  const seeds=rows.map(r=>r.definition);
  assert.equal(seeds.filter(r=>r.resultItemId!==null).length,169);
  assert.equal(seeds.filter(r=>r.producesItemField===true).length,166);
  assert.equal(seeds.filter(r=>r.growthPeriod!==null).length,171);
  assert.equal(seeds.filter(r=>r.productionPeriod!==null).length,171);
  const byId=new Map(seeds.map(r=>[r.seedItemId,r]));
  assert.equal(byId.get(30400010).resultItemId,30200000);
  assert.equal(byId.get(30400010).growthPeriod.configuredSeconds,900);
  assert.equal(byId.get(30400025).configuredYield,3);
  assert.equal(byId.get(30400025).growthPeriod.configuredSeconds,1380);
  assert.equal(byId.get(30400129).growthPeriod.configuredSeconds,0.1);
  assert.equal(byId.get(30400129).resultItemId,30400129);
  assert.equal(byId.get(30400127).resultItemId,null);
  assert.equal(byId.get(30400258).producesItemField,null);
  const resultIds=[...new Set(seeds.flatMap(r=>r.resultItemId===null?[]:[r.resultItemId]))];
  assert.equal(resultIds.length,165);
  const inverse=await reader.getForItems(resultIds);
  assert(inverse.every(r=>r.seedStatus==='indexed'));
  const linked=inverse.flatMap(r=>r.sources.filter(s=>s.kind==='seed_production')).sort((a,b)=>a.seedItemId-b.seedItemId);
  assert.deepEqual(linked,seeds.filter(r=>r.resultItemId!==null).sort((a,b)=>a.seedItemId-b.seedItemId));
  const [a,missing,b]=await reader.getForSeeds([30400010,99999999,30400010]);
  assert.equal(missing,null);assert.deepEqual(a,b);
});

test('original blocker default reward and BeeHouse production remain distinct canonical source roles',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const facts=JSON.parse(await readFile('data/ddv/item-master/original-furniture-production-steam-1.26.2.json','utf8'));
  const original=new Map(facts.blockerDefaultRewards);
  const classes=new Map(await db.getFieldRows('sourceClass'));
  const rewards=(await db.getFieldRows('source.DefaultRewardItemID')).filter(([i,v])=>classes.get(i)==='FurnitureBlockerItemData'&&v>0);
  assert.deepEqual(rewards,[...original]);
  assert.equal(rewards.length,63);
  const resultIds=[...new Set(rewards.map(r=>r[1]))].sort((a,b)=>a-b);
  assert.equal(resultIds.length,52);
  const incoming=await db.getNativeAcquisitionCandidates(resultIds);
  const reverse=incoming.flatMap((entries,i)=>entries.filter(r=>r[1]==='blocker_default_reward').map(r=>{
    assert.equal(r[2],'source.DefaultRewardItemID');
    return [r[0],resultIds[i]];
  })).sort((a,b)=>a[0]-b[0]);
  assert.deepEqual(reverse,rewards);
  const [honey]=await createProductionSourceReader(db).getForItems([31100251]);
  assert.equal(honey.machineStatus,'indexed');
  const bee=honey.sources.find(r=>r.kind==='bee_house_production');
  assert(bee);assert.equal(bee.machineItemId,40800027);assert.equal(bee.resultItemId,31100251);
  assert.equal(bee.effectZoneSizeX,5);assert.equal(bee.effectZoneSizeY,5);
  assert.equal(bee.minimumProductionDuration.configuredSeconds,600);
  assert.equal(bee.maximumProductionDuration.configuredSeconds,1200);
  assert.equal(bee.maximumProduced,6);
  assert.equal(honey.currentAvailabilityVerified,false);
  const [native]=await db.getNativeAcquisitionCandidates([31100251]);
  assert(native.some(r=>r[0]===40800027&&r[1]==='machine_produced_item'&&r[2]==='source.BeeHouse.ProducedItemID'));
  const [raw]=await db.getItemFields([40800027],['source.BeeHouse']);
  assert.deepEqual(raw.values['source.BeeHouse'],{EffectZoneSizeX:5,EffectZoneSizeY:5,ProducedItemID:31100251,
    MinProductionDuration:{Seconds:600},MaxProductionDuration:{Seconds:1200},MaxProduced:6});
});


test('ordinary production classification requires an independently ordinary source, explicit productive quantity and no mission seed gate',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const legacy=new Map(await db.getFieldRows('acquisition.categories'));
  const rewards=new Map(await db.getFieldRows('acquisition.individualFriendshipRewards'));
  const rewardIds=new Set([...rewards.values()].flatMap(v=>v.filter(r=>r.amount!==null).map(r=>r.itemId)));
  const ordinary=id=>legacy.get(id)?.includes('ordinary_gameplay')||rewardIds.has(id);
  const effective=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
  const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const evidence=catalog.has('acquisition.ordinaryProductionSources')?await db.getFieldRows('acquisition.ordinaryProductionSources'):[];
  const reader=createProductionSourceReader(db);
  const seedIds=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'SeedItemData'});
  const seeds=await reader.getForSeeds(seedIds);
  const sourceIds=[...new Set(evidence.flatMap(([,links])=>links.map(r=>r.sourceItemId)))];
  const fields=['source.ProducesItem','source.ProducedAmount','source.ProducedItemID','source.IsMissionItem',
    'source.MissionSeedBlockHarvest','source.MissionSeedLocationRestriction','source.BeeHouse','sourceClass'];
  const raw=await db.getItemFields(sourceIds,fields.filter(f=>catalog.has(f)));
  const byId=new Map(raw.map(r=>[r.itemId,r.values]));
  for(const [itemId,links] of evidence){
    assert(effective.get(itemId).includes('ordinary_gameplay'));
    for(const link of links){
      assert(ordinary(link.sourceItemId));assert.notEqual(link.sourceItemId,itemId);
      assert(link.configuredQuantity>0);assert.equal(link.currentAvailabilityVerified,false);
      assert.equal(link.ordinarySourceIndependentlyClassified,true);
      const row=byId.get(link.sourceItemId);
      if(link.kind==='ordinary_seed_production'){
        assert.equal(row.sourceClass,'SeedItemData');
        assert.equal(row['source.ProducesItem'],true);
        assert.equal(row['source.ProducedItemID'],itemId);
        assert.equal(row['source.ProducedAmount'],link.configuredQuantity);
        assert.notEqual(row['source.IsMissionItem'],true);
        assert.notEqual(row['source.MissionSeedBlockHarvest'],true);
        assert.equal(row['source.MissionSeedLocationRestriction'],undefined);
        assert.equal(link.quantityKind,'configured_yield');
      }else{
        assert.equal(link.kind,'ordinary_bee_house_production');
        assert.equal(row['source.BeeHouse'].ProducedItemID,itemId);
        assert.equal(row['source.BeeHouse'].MaxProduced,link.configuredQuantity);
        assert.equal(link.quantityKind,'maximum_produced');
      }
    }
  }
  const excluded=seeds.filter(r=>r.definition.missionField===true||r.definition.missionSeedBlockHarvest===true||
    r.definition.resultItemId===r.itemId||r.definition.producesItemField!==true);
  for(const seed of excluded)assert(!sourceIds.includes(seed.itemId),'excluded seed '+seed.itemId);
  // Every fully explicit eligible seed must be represented, even if its
  // output was already classified by a different original source.
  const keys=new Set(evidence.flatMap(([id,links])=>links.map(l=>id+':'+l.sourceItemId)));
  for(const {definition:s} of seeds){
    if(ordinary(s.seedItemId)&&s.resultItemId!==null&&s.resultItemId!==s.seedItemId&&
      s.producesItemField===true&&s.configuredYield>0&&s.missionField===false&&
      s.missionSeedBlockHarvest===false&&s.missionSeedLocationRestriction===null){
      const target=await db.getItemFields([s.resultItemId],['nativeCategory']);
      if(target[0]?.values.nativeCategory==='ActivityItem')assert(keys.has(s.resultItemId+':'+s.seedItemId));
    }
  }
  console.log('ordinary production classification census',JSON.stringify({items:evidence.length,
    newOrdinary:evidence.filter(([id])=>!ordinary(id)).length,previouslyUnclassified:evidence.filter(([id])=>!legacy.has(id)&&!rewardIds.has(id)).length}));
});
