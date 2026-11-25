import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';

test('original layout criteria, partial source matches and direct display sequence relations share canonical IDs',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{
    requests.push(url);
    return new Response(await readFile('static'+url),{status:200});
  });
  const {storeLayoutAreas:areas}=await db.getSourceRelations();
  assert.equal(areas.length,27);
  assert.equal(new Set(areas.map(a=>a.key)).size,27);
  const byKey=new Map(areas.map(a=>[a.key,a]));
  assert.deepEqual(byKey.get('StoreLayoutArea_Top').filter.subtypes,[[6,[0,7]]]);
  assert.deepEqual(byKey.get('StoreLayoutArea_Jewelry').filter.subtypes,[[6,[10,13,12,6,11]]]);
  assert.deepEqual(byKey.get('StoreLayoutArea_8x16').filter.grid,{
    minArea:[6,2],maxArea:[8,16],canRotate:true,sizeQualifiers:[3,4],ignoreSizeForTags:[2000300021]});
  assert.equal(byKey.get('StoreLayoutArea_BayWindowFurniture').filter.max,100000);
  const rows=await db.getFieldRows('acquisition.storeLayoutCandidates');
  const types=new Map(await db.getFieldRows('nativeCategory'));
  const counts={Furniture:0,Clothing:0},matched={Furniture:0,Clothing:0};
  assert.equal(rows.length,2448);
  let overlappingClothing=0;
  for(const [id,v] of rows){
    const category=types.get(id);
    counts[category]++;
    if(v.matchingAreaKeys.length)matched[category]++;
    assert.equal(v.storeMembershipVerified,false);
    assert.equal(v.currentAvailabilityVerified,false);
    assert.equal(v.gridPredicateEvaluated,false);
    assert.equal(v.runtimeTagMatchingVerified,false);
    assert(v.matchingAreaKeys.every(k=>byKey.has(k)));
    assert.deepEqual(v.gridReviewAreaKeys,v.matchingAreaKeys.filter(k=>byKey.get(k).filter.grid));
    if(category==='Clothing'&&v.matchingAreaKeys.length>1)overlappingClothing++;
  }
  assert.deepEqual(counts,{Furniture:1544,Clothing:904});
  assert.deepEqual(matched,{Furniture:1544,Clothing:864});
  assert.equal(overlappingClothing,88);
  assert.equal((await db.findItemIdsByField('acquisition.storeLayoutAreaKeys',{kind:'contains',value:'StoreLayoutArea_Top'})).length,205);
  const displays=new Map(await db.getFieldRows('acquisition.storeDisplayDefinition'));
  assert.equal(displays.size,17);
  assert.equal(displays.get(2140000016).alternateOfDisplayItemId,2140000004);
  assert.deepEqual(displays.get(2140000007).shelfSlots,[
    {typeCode:5,amount:1,areaKey:'StoreLayoutArea_Top'},
    {typeCode:6,amount:1,areaKey:'StoreLayoutArea_Bottom'}]);
  const links=await db.getFieldRows('acquisition.storeDisplaySequenceLinks');
  assert.equal(links.length,15);
  assert.equal(links.flatMap(([,v])=>v).length,19);
  for(const [id,v] of links)for(const link of v){
    const seq=displays.get(link.displayItemId).itemSequences[link.sequenceIndex];
    assert.equal(seq.itemIds[link.position],id);
    assert.deepEqual(seq.applyToBuildingIds,link.applyToBuildingIds);
    assert.equal(link.currentAvailabilityVerified,false);
  }
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/acquisition/public/')));
});
