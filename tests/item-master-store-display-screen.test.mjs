import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {openCurrentItemDetails} from '../src/lib/items/public-item-details.ts';

test('reviewed store display gates exclude hidden items and unsupported furniture types, not all other routes',async()=>{
  const requests=[];
  const fetcher=async url=>{
    requests.push(url);
    return new Response(await readFile('static'+url),{status:200});
  };
  const db=await openCurrentItemDatabase('',fetcher);
  const rows=await db.getFieldRows('acquisition.storeDisplayScreen');
  const statuses=new Map(await db.getFieldRows('acquisition.storeDisplayScreenStatus'));
  const types=new Map(await db.getFieldRows('acquisition.furnitureDisplayTypeGate'));
  const catalog=new Map(await db.getFieldRows('acquisition.catalogFacts'));
  const categories=new Map(await db.getFieldRows('nativeCategory'));
  assert.equal(rows.length,8787);
  assert.equal(statuses.size,8787);
  const counts={};const hiddenByCategory={};
  for(const [id,value] of rows){
    assert.equal(value.scope,'generated_furniture_clothing_display');
    assert.equal(value.otherNativeConditionsVerified,false);
    assert.equal(value.storeMembershipVerified,false);
    assert.equal(value.currentAvailabilityVerified,false);
    assert.equal(value.status,statuses.get(id));
    assert.equal(value.furnitureTypeGate,types.get(id)??null);
    assert.equal(value.hidden,catalog.get(id)?.hidden??null);
    counts[value.status]=(counts[value.status]??0)+1;
    const category=categories.get(id);
    if(value.status==='excluded_by_hidden'){
      assert.equal(value.hidden,true);
      hiddenByCategory[category]=(hiddenByCategory[category]??0)+1;
    }
    if(value.status==='excluded_by_furniture_type')assert.equal(value.furnitureTypeGate,false);
    if(value.status==='not_excluded_by_reviewed_gates')assert.equal(value.hidden,false);
  }
  assert.deepEqual(counts,{excluded_by_furniture_type:1458,excluded_by_hidden:1537,not_excluded_by_reviewed_gates:5792});
  assert.deepEqual(hiddenByCategory,{Furniture:1440,Clothing:97});
  const excluded=await db.findItemIdsByField('acquisition.storeDisplayScreenStatus',{kind:'equals',value:'excluded_by_hidden'});
  assert.deepEqual(excluded,rows.filter(([,v])=>v.status==='excluded_by_hidden').map(([id])=>id));
  const details=await openCurrentItemDetails('',fetcher);
  const ids=[40000047,40200001,40300001,50000329,99999999];
  const selected=await details.getSelectedItems(ids,['nativeCategory'],{sourceRelations:true});
  assert.deepEqual(selected.map(row=>row?.storeDisplayScreen?.status??null),[
    'not_excluded_by_reviewed_gates','excluded_by_furniture_type','excluded_by_hidden','excluded_by_hidden',null]);
  assert.equal(selected[4],null);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/acquisition/public/')));
});
