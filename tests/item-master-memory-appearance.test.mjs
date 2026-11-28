import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
const names=['Anywhere','Gardening','Fishing','Cooking','RemovingWeeds','WateringFlowers','FeedingCritters','Exploring','Mining','Custom','Digging','RemovingBlockers','Mission','CatchingSnippets'];
test('all original memory appearance actions, exact condition fields, shard counts and related orb identities',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const ids=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'MemoryShardItemData'});
  assert.equal(ids.length,472);
  const rows=await db.getItemFields(ids,['source.AppearanceCondition','source.Conditions','source.NumberOfShards','source.ConsummableOverrideItemID','source.MemoryShardTagItemID','acquisition.memoryOrbItemId','acquisition.memoryShardTagItemId','observedFields','acquisition.memoryAppearance','acquisition.effectiveCategories']);
  const details=await readItemAcquisitionSourceDetails(db,ids,'ja');
  const counts={},gates={},dlc={};let ordinary=0,festival=0;
  const orbGroups=new Map(),tagGroups=new Map();
  const group=(map,key,itemId)=>{const list=map.get(key)??[];list.push(itemId);map.set(key,list);};
  const expansionIds=new Map([[2130001296,'Expansion01'],[2130001490,'Expansion02'],[2130003048,'Expansion03'],[2130004933,'Expansion04']]);
  const eventIds=new Map([[130000408,'HauntedFloatingFestival2026'],[130000411,'WinterFloatingFestival'],[130000446,'SpringFloatingFestival']]);
  const commonIds=[...expansionIds.keys(),2130004213,2130004415,2130004992];
  const originalConditions=new Map((await db.getItemFields(commonIds,['source.Conditions'])).map(r=>[r.itemId,r.values['source.Conditions']]));
  for(const [i,row] of rows.entries()){
    const v=row.values,a=v['acquisition.memoryAppearance'],code=v['source.AppearanceCondition'],condition=v['source.Conditions'];
    assert.equal(a.appearanceConditionCode,code);assert.equal(a.appearanceCondition,names[code]);
    assert.equal(a.configuredShardCount,v['source.NumberOfShards']);
    for(const [sourceKey,indexKey,map] of [
      ['source.ConsummableOverrideItemID','acquisition.memoryOrbItemId',orbGroups],
      ['source.MemoryShardTagItemID','acquisition.memoryShardTagItemId',tagGroups]
    ]){
      const original=v[sourceKey];
      if(Number.isSafeInteger(original)&&original>0){
        assert.equal(v[indexKey],original);
        group(map,original,row.itemId);
      }else assert.equal(v[indexKey],undefined);
    }
    assert.deepEqual(a.conditions,condition??null);
    assert.equal(a.conditionsFieldPresent,condition!==undefined);
    const absent=condition===undefined&&!v.observedFields.some(([n])=>n===16);
    const empty=condition!==null&&typeof condition==='object'&&!Array.isArray(condition)&&Object.keys(condition).length===0;
    const commonId=condition?.Conditions?.[0]?.CommonConditions?.Condition;
    const expansion=expansionIds.get(commonId);
    const eventName=eventIds.get(row.itemId);
    const eligible=[1,2,3,4,5,6,7,8,10,11,13].includes(code)&&(absent||empty||!!expansion);
    if(expansion){
      assert.equal(a.resolvedGate.kind,'expansion_required');assert.equal(a.resolvedGate.expansionName,expansion);
      dlc[expansion]=(dlc[expansion]??0)+1;
    }
    if(eventName){
      assert.equal(code,6);assert.equal(a.resolvedGate.kind,'floating_festival_playable');
      assert.equal(a.resolvedGate.eventName,eventName);assert.equal(a.resolvedGate.missionItemId,2070000629);festival++;
    }
    if(expansion||eventName){
      assert.equal(a.resolvedGate.commonConditionItemId,commonId);
      assert.deepEqual(a.resolvedGate.original,originalConditions.get(commonId));
      assert.equal(a.resolvedGate.sourceConditionSha256,db.release.sourceFilesSha256.Condition);
    }else assert.equal(a.resolvedGate,null);
    assert.equal(a.gateStatus,absent?'field_absent':empty?'explicit_empty':condition===undefined?'unresolved':'configured');
    assert.equal(a.category,eligible?'ordinary_gameplay':eventName?'in_game_limited_event':null);
    if(eventName)assert(v['acquisition.effectiveCategories'].includes('in_game_limited_event'));
    if(eligible){assert(v['acquisition.effectiveCategories'].includes('ordinary_gameplay'));ordinary++;}
    assert.equal(a.sourceFileSha256,db.release.sourceFilesSha256.MemoryShard);
    assert.equal(a.currentAvailabilityVerified,false);assert.equal(a.guaranteedGrantVerified,false);
    assert.deepEqual(details[i].memoryAppearance.evidence,a);
    assert.equal(details[i].memoryAppearanceStatus,'indexed');
    if(a.consummableOverrideResolved)assert.equal(details[i].memoryAppearance.consummableOverrideIdentity.itemId,a.consummableOverrideItemId);
    counts[code]=(counts[code]??0)+1;gates[a.gateStatus]=(gates[a.gateStatus]??0)+1;
  }
  assert.deepEqual(counts,{1:26,2:24,3:24,4:21,5:10,6:28,8:22,9:299,10:14,13:4});
  for(const [code,count] of Object.entries(counts)){
    const result=await db.findItemIdsByField('acquisition.memoryAppearanceCondition',{kind:'equals',value:names[Number(code)]});
    assert.equal(result.length,count);
  }
  assert.equal(tagGroups.size,12);
  assert.equal([...tagGroups.values()].reduce((n,ids)=>n+ids.length,0),302);
  for(const [field,groups] of [['acquisition.memoryOrbItemId',orbGroups],['acquisition.memoryShardTagItemId',tagGroups]]){
    for(const [value,expected] of groups){
      const actual=await db.findItemIdsByField(field,{kind:'equals',value});
      assert.deepEqual([...actual].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b));
    }
  }
  assert.equal(ordinary,170);assert.equal(festival,3);assert.deepEqual(dlc,{Expansion01:25,Expansion02:25,Expansion03:25,Expansion04:25});
  console.log('DB01_MEMORY_APPEARANCE_VERIFIED '+JSON.stringify({items:ids.length,ordinary,festival,dlc,counts,gates}));
});
