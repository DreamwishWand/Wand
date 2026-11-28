import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {openCurrentItemDetails} from '../src/lib/items/public-item-details.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';

test('source details preserve distinct original occurrences and resolve canonical localized identities lazily',async()=>{
  const requests=[];
  const fetcher=async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});};
  const db=await openCurrentItemDatabase('',fetcher);
  const ids=[30000031,51300032,120000073,80300000,30400064,99999999,30000031];
  const rows=await readItemAcquisitionSourceDetails(db,ids,'ja');
  assert.equal(rows[5],null);assert.deepEqual(rows[0],rows[6]);
  const edges=await db.getNativeAcquisitionCandidates(ids);
  const fieldRows=await db.getItemFields(ids,['acquisition.sourceRelations','acquisition.additionalSources','acquisition.effectiveCategories']);
  for(let i=0;i<rows.length;i++){
    const row=rows[i];if(!row)continue;
    assert.equal(row.itemId,ids[i]);
    assert.equal(row.indexedStatus,'current');
    assert.equal(row.nativeStatus,'indexed');
    assert.deepEqual(row.native.map(x=>x.evidence),edges[i]);
    assert.deepEqual(row.indexed.map(x=>x.evidence),fieldRows[i].values['acquisition.sourceRelations']?.links??[]);
    assert.deepEqual(row.additional.map(x=>x.evidence),fieldRows[i].values['acquisition.additionalSources']??[]);
    assert.deepEqual(row.effectiveCategories,fieldRows[i].values['acquisition.effectiveCategories']??[]);
    assert.equal(row.coverageComplete,false);assert.equal(row.currentAvailabilityVerified,false);
  }
  const recipe=rows[0].native.find(x=>x.evidence[0]===2050300095&&x.evidence[1]==='activity_result');
  assert.equal(recipe.identity.itemId,2050300095);
  assert.equal(recipe.identity.nativeCategory,'ActivityData');
  const story=rows[1].native.find(x=>x.evidence[0]===200000001);
  assert.equal(story.identity.nativeCategory,'Story');
  const quest=rows[4].native.find(x=>x.evidence[0]===2070000628);
  assert.equal(quest.identity.nativeCategory,'Mission');
  const [expected]=await db.getItemFields([2070000628],['names.ja','iconGuid']);
  assert.equal(quest.identity.name,expected.values['names.ja']||null);
  assert.equal(quest.identity.locale,'ja');
  const details=await openCurrentItemDetails('',fetcher);
  assert.deepEqual(await details.getItemAcquisitionSourceDetails(ids,'ja'),rows);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')||url.includes('/acquisition/public/')));
  await assert.rejects(readItemAcquisitionSourceDetails(db,ids,'invalid'),/DB01_SOURCE_DETAILS_LOCALE/);
});


test('ordinary category extensions resolve every quest and production source using the same localized identity API',async()=>{
  const requests=[];
  const fetcher=async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});};
  const db=await openCurrentItemDatabase('',fetcher);
  const intro=await db.getFieldRows('acquisition.ordinaryQuestIntroSources');
  const production=await db.getFieldRows('acquisition.ordinaryProductionSources');
  assert.equal(intro.length,66);assert.equal(production.length,8);
  const ids=[...new Set([...intro,...production].map(([id])=>id))];
  const a=new Map(intro),b=new Map(production);
  const rows=await readItemAcquisitionSourceDetails(db,[...ids,99999999,ids[0]],'ja');
  assert.equal(rows[ids.length],null);assert.deepEqual(rows.at(-1),rows[0]);
  const sourceIds=[...new Set([...intro.flatMap(([,v])=>v.map(e=>e.questId)),...production.flatMap(([,v])=>v.map(e=>e.sourceItemId))])];
  const identity=new Map((await db.getItemFields(sourceIds,['names.ja','nativeCategory'])).map(r=>[r.itemId,r.values]));
  for(const row of rows.slice(0,ids.length)){
    assert.equal(row.ordinaryQuestIntroStatus,'indexed');assert.equal(row.ordinaryProductionStatus,'indexed');
    assert(row.effectiveCategories.includes('ordinary_gameplay'));
    assert.deepEqual(row.ordinaryQuestIntro.map(v=>v.evidence),a.get(row.itemId)??[]);
    assert.deepEqual(row.ordinaryProduction.map(v=>v.evidence),b.get(row.itemId)??[]);
    for(const {evidence,identity:source} of [...row.ordinaryQuestIntro,...row.ordinaryProduction]){
      const id=evidence.questId??evidence.sourceItemId;
      assert.equal(source.itemId,id);assert.equal(source.name,identity.get(id)['names.ja']||null);
      assert.equal(source.nativeCategory,identity.get(id).nativeCategory);
      assert.equal(source.locale,'ja');
      assert.equal(evidence.currentAvailabilityVerified,false);
    }
  }
  const details=await openCurrentItemDetails('',fetcher);
  assert.deepEqual(await details.getItemAcquisitionSourceDetails(ids,'ja'),rows.slice(0,ids.length));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')||url.includes('/acquisition/public/')));
});


test('all classification extensions preserve original evidence and localized source and related identities',async()=>{
  const requests=[],fetcher=async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});};
  const db=await openCurrentItemDatabase('',fetcher);
  const fields={initialInventory:'acquisition.ordinaryInitialInventorySources',storyUnlock:'acquisition.storyUnlockSources',characterUnlock:'acquisition.characterUnlockSources',progression:'acquisition.ordinaryProgressionSources',critterBefriending:'acquisition.ordinaryCritterSources',
    conditionalQuest:'acquisition.conditionalQuestSources',initialVillageMemory:'acquisition.initialVillageMemoryTreasureSources',memorySpawn:'acquisition.classifiedMemorySpawnSources',memoryDefaultContent:'acquisition.memoryDefaultContentSources',
    miniEventReward:'acquisition.miniEventRewardSources',eventRecurringLoot:'acquisition.eventRecurringLootSources',eventLootPresent:'acquisition.eventLootPresentSources',questObjective:'acquisition.questObjectiveGrantSources',configuredStore:'acquisition.ordinaryConfiguredStoreSource',
    storeSequence:'acquisition.ordinaryStoreSequenceSources',storeGeneratedShelf:'acquisition.ordinaryGeneratedStoreShelfSources',storeGeneratedStage:'acquisition.ordinaryGeneratedStoreStageSources',
    lootPresent:'acquisition.ordinaryLootPresentSources',critterFeeding:'acquisition.ordinaryCritterFeedingSources',questLoot:'acquisition.questAdditionalLootSources',evolutionAcquisition:'acquisition.evolutionAcquisitionSources',profileLevel:'acquisition.profileLevelRewardSources',historicalStarpath:'acquisition.historicalStarpathSources'};
  const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const expected=new Map(),counts={};
  for(const [family,field] of Object.entries(fields)){
    const rows=catalog.has(field)?await db.getFieldRows(field):[];
    counts[family]=rows.length;
    for(const [id,v] of rows){
      const list=expected.get(id)??[];
      for(const evidence of family==='configuredStore'?[v]:v)if(evidence.category!==null)list.push({family,evidence});
      if(list.length)expected.set(id,list);
    }
  }
  assert(counts.progression>=150);assert.equal(counts.critterBefriending,100);
  assert(counts.conditionalQuest>=5);assert.equal(counts.configuredStore,134);assert.equal(counts.lootPresent,24);
  const ids=[...expected.keys()].sort((a,b)=>a-b);
  const rows=await readItemAcquisitionSourceDetails(db,[...ids,99999999,ids[0]],'ja');
  assert.equal(rows[ids.length],null);assert.deepEqual(rows.at(-1),rows[0]);
  for(const row of rows.slice(0,ids.length)){
    const byFamily=(a,b)=>a.family.localeCompare(b.family);
    assert.deepEqual(row.classificationExtensions.map(({family,evidence})=>({family,evidence})).sort(byFamily),expected.get(row.itemId).sort(byFamily));
    for(const [family,field] of Object.entries(fields))if(Object.hasOwn(row.classificationExtensionStatus,family))assert.equal(row.classificationExtensionStatus[family],catalog.has(field)?'indexed':'not_indexed');
    for(const ext of row.classificationExtensions){
      assert(row.effectiveCategories.includes(ext.category));
      assert.equal(ext.evidence.currentAvailabilityVerified,false);
      if(ext.family==='miniEventReward'||ext.family==='initialInventory'||ext.family==='configuredStore'||ext.family==='historicalStarpath'||ext.family==='profileLevel')assert.equal(ext.identity,null);
      else {assert.equal(ext.identity.itemId,ext.evidence.sourceItemId);assert.equal(ext.identity.locale,'ja');}
      const ev=ext.evidence;
      const related=ext.family==='progression'&&ev.rankActivity?[ev.rankActivity.preConditionItemId,ev.rankActivity.unlockMissionItemId]:ext.family==='characterUnlock'&&ev.kind==='character_secret_condition_unlock'?[ev.missionItemId]:ext.family==='eventRecurringLoot'?[ev.recurringEventItemId,ev.ephemeralItemId??ev.blockerItemId,ev.tableItemId,
          ...(ev.boundedLocalDateGate?[ev.boundedLocalDateGate.conditionItemId,ev.boundedLocalDateGate.missionItemId]:[]),...(ev.orbItemId?[ev.orbItemId]:[])]:ext.family==='memoryDefaultContent'?[ev.orbItemId]:ext.family==='configuredStore'?[80000000]:ext.family==='conditionalQuest'?
        [...new Set(ev.questGates.map(g=>g.questId))]:ext.family==='memorySpawn'?
        [...new Set([...ev.questGates.map(g=>g.questId),...ev.sceneItemIds,...(ev.conditionItemIds??[]),...(ev.characterItemIds??[])])]:
        ext.family==='eventLootPresent'?[...new Set([ev.bagItemId,ev.tableItemId,...(ev.precursors?[ev.inventoryItemId,ev.blockerItemId,...ev.precursors.flatMap(p=>[p.sourceItemId,...(p.missionItemId?[p.missionItemId]:[])])]:[])])]:ext.family==='storeSequence'?[ev.buildingItemId,80000000]:(ext.family==='storeGeneratedShelf'||ext.family==='storeGeneratedStage')?[ev.buildingItemId,80000000,...(ev.setItemId?[ev.setItemId]:[]),...(ev.catalogGate?.targetItemId?[ev.catalogGate.targetItemId]:[])]:ev.tableItemId?[ev.tableItemId]:[];
      assert.deepEqual(ext.relatedIdentities.map(i=>i.itemId),ext.family==='storyUnlock'?[...new Set([...ev.missionItemIds,...ev.conditionItemIds,...ev.unlockCosts.map(c=>c.Id)])]:related);
      assert(ext.relatedIdentities.every(i=>i.locale==='ja'));
    }
  }
  const details=await openCurrentItemDetails('',fetcher);
  assert.deepEqual(await details.getItemAcquisitionSourceDetails(ids.slice(0,2),'ja'),rows.slice(0,2));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')||url.includes('/acquisition/public/')));
  console.log('DB01_CLASSIFICATION_EXTENSIONS '+JSON.stringify({items:ids.length,counts}));
});
