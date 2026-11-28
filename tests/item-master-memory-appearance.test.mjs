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
  const rows=await db.getItemFields(ids,['source.AppearanceCondition','source.Conditions','source.NumberOfShards','source.ConsummableOverrideItemID','observedFields','acquisition.memoryAppearance','acquisition.effectiveCategories']);
  const details=await readItemAcquisitionSourceDetails(db,ids,'ja');
  const counts={},gates={};let ordinary=0;
  for(const [i,row] of rows.entries()){
    const v=row.values,a=v['acquisition.memoryAppearance'],code=v['source.AppearanceCondition'],condition=v['source.Conditions'];
    assert.equal(a.appearanceConditionCode,code);assert.equal(a.appearanceCondition,names[code]);
    assert.equal(a.configuredShardCount,v['source.NumberOfShards']);
    assert.deepEqual(a.conditions,condition??null);
    assert.equal(a.conditionsFieldPresent,condition!==undefined);
    const absent=condition===undefined&&!v.observedFields.some(([n])=>n===16);
    const empty=condition!==null&&typeof condition==='object'&&!Array.isArray(condition)&&Object.keys(condition).length===0;
    const eligible=[1,2,3,4,5,6,7,8,10,11,13].includes(code)&&(absent||empty);
    assert.equal(a.gateStatus,absent?'field_absent':empty?'explicit_empty':condition===undefined?'unresolved':'configured');
    assert.equal(a.category,eligible?'ordinary_gameplay':null);
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
  console.log('DB01_MEMORY_APPEARANCE_VERIFIED '+JSON.stringify({items:ids.length,ordinary,counts,gates}));
});
