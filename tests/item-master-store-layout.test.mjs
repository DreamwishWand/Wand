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

test('canonical grid facets preserve original unsigned mask bits, serialized size and layer-slot counts',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const grid=new Map(await db.getFieldRows('source.GridAreaData'));
  const floor=new Map(await db.getFieldRows('placement.sourceAcceptedFloorBits'));
  const layers=new Map(await db.getFieldRows('placement.sourceLayerBits'));
  const dimensions=new Map(await db.getFieldRows('placement.sourceSizeXY'));
  const bounds=new Map(await db.getFieldRows('placement.sourceBoundingCellCount'));
  const slots=new Map(await db.getFieldRows('placement.sourceLayerSlotCount'));
  const consistent=new Map(await db.getFieldRows('placement.sourceLayerCountMatchesBounds'));
  const decode=mask=>Array.from({length:32},(_,i)=>2**i).filter(bit=>((mask&bit)>>>0)!==0);
  let floorCount=0,layerCount=0,sizeCount=0,bothCount=0;
  for(const [id,g] of grid){
    if(Object.hasOwn(g,'AcceptedFloorTypesFlag')){
      floorCount++;
      assert.deepEqual(floor.get(id),decode(g.AcceptedFloorTypesFlag));
    }else assert(!floor.has(id));
    if(Object.hasOwn(g,'Layers')){
      layerCount++;
      const union=[...new Set(g.Layers.flatMap(decode))].sort((a,b)=>a-b);
      assert.deepEqual(layers.get(id),union);
      assert.equal(slots.get(id),g.Layers.length);
    }else assert(!layers.has(id)&&!slots.has(id));
    if(Number.isSafeInteger(g.SizeX)&&Number.isSafeInteger(g.SizeY)&&g.SizeX>0&&g.SizeY>0&&Number.isSafeInteger(g.SizeX*g.SizeY)){
      sizeCount++;
      assert.deepEqual(dimensions.get(id),[g.SizeX,g.SizeY]);
      assert.equal(bounds.get(id),g.SizeX*g.SizeY);
      if(Array.isArray(g.Layers)){
        bothCount++;
        assert.equal(consistent.get(id),g.Layers.length===g.SizeX*g.SizeY);
      }else assert(!consistent.has(id));
    }else assert(!dimensions.has(id)&&!bounds.has(id)&&!consistent.has(id));
  }
  assert(floorCount>7000&&sizeCount>7000);
  assert.equal(floor.size,floorCount);assert.equal(layers.size,layerCount);
  assert.equal(slots.size,layerCount);assert.equal(dimensions.size,sizeCount);
  assert.equal(bounds.size,sizeCount);assert.equal(consistent.size,bothCount);
  assert.deepEqual(dimensions.get(40005160),[1,1]);
  assert.deepEqual(layers.get(40005160),[4,64]);
  assert.deepEqual(dimensions.get(40000047),[3,2]);
  assert.equal(bounds.get(40000047),6);
  const surface=await db.findItemIdsByField('placement.sourceAcceptedFloorBits',{kind:'contains',value:4096});
  assert(surface.length>0);
  assert.deepEqual(surface,[...floor].filter(([,bits])=>bits.includes(4096)).map(([id])=>id));
  console.log('DB01_PLACEMENT_SOURCE_CENSUS',JSON.stringify({floorCount,layerCount,sizeCount,bothCount,surfaceCount:surface.length}));
});

test('store layout numeric dimension comparisons are independent of unverified native grid predicates',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const areas=new Map((await db.getSourceRelations()).storeLayoutAreas.map(a=>[a.key,a.filter.grid]));
  const grid=new Map(await db.getFieldRows('source.GridAreaData'));
  const candidates=new Map(await db.getFieldRows('acquisition.storeLayoutCandidates'));
  const comparisons=new Map(await db.getFieldRows('acquisition.storeLayoutDimensionComparisons'));
  let expectedCount=0,entries=0,validSizeCount=0;
  for(const [id,c] of candidates){
    if(!c.gridReviewAreaKeys.length){assert(!comparisons.has(id));continue;}
    expectedCount++;
    const results=comparisons.get(id);
    assert.deepEqual(results.map(v=>v.areaKey),c.gridReviewAreaKeys);
    const g=grid.get(id);
    const size=g&&Number.isSafeInteger(g.SizeX)&&g.SizeX>0&&Number.isSafeInteger(g.SizeY)&&g.SizeY>0?[g.SizeX,g.SizeY]:null;
    for(const comparison of results){
      entries++;
      assert.deepEqual(comparison.sourceSizeXY,size);
      const f=areas.get(comparison.areaKey);
      const numeric=(x,y)=>!(f.minArea&&(x<f.minArea[0]||y<f.minArea[1])||f.maxArea&&(x>f.maxArea[0]||y>f.maxArea[1]));
      assert.equal(comparison.directWithinNumericBounds,size?numeric(...size):null);
      assert.equal(comparison.swappedWithinNumericBounds,size&&f.canRotate===true?numeric(size[1],size[0]):null);
      assert(comparison.directIgnoreSizeTagIds.every(tag=>f.ignoreSizeForTags.includes(tag)));
      assert.equal(comparison.gridPredicateEvaluated,false);
      assert.equal(comparison.storeMembershipVerified,false);
      assert.equal(comparison.currentAvailabilityVerified,false);
      if(size)validSizeCount++;
    }
  }
  assert.equal(comparisons.size,expectedCount);
  assert(expectedCount>0&&entries>0&&validSizeCount>0);
  console.log('DB01_STORE_NUMERIC_BOUNDS_CENSUS',JSON.stringify({expectedCount,entries,validSizeCount}));
});
