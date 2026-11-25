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

test('configured cost projection retains exact original amount presence, currency and purpose',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const categories=new Map(await db.getFieldRows('nativeCategory'));
  const all=new Map(),kinds=new Map();
  const emit=(id,kind,sourcePath,cost,upgradeLevel=null)=>{
    if(cost===undefined||cost===null||typeof cost!=='object'||Array.isArray(cost))return;
    const currencyFieldPresent=Object.hasOwn(cost,'Id'),amountFieldPresent=Object.hasOwn(cost,'Amount');
    const currencyItemId=currencyFieldPresent?cost.Id:null;
    const value={kind,sourcePath,currencyItemId,amount:amountFieldPresent?cost.Amount:null,
      currencyFieldPresent,amountFieldPresent,currencyDefinitionResolved:categories.get(currencyItemId)==='Currency',
      upgradeLevel,runtimeCostVerified:false};
    const list=all.get(id)??[];list.push(value);all.set(id,list);
    kinds.set(kind,(kinds.get(kind)??0)+1);
  };
  const fields=new Set((await db.getFieldCatalog()).map(f=>f.field));
  for(const [field,kind,category] of [
    ['PriceOverride.Price','purchase_override',null],
    ['SpecificUnlockCost','building_specific_unlock','Building'],
    ['UnlockCost','building_unlock','Building'],
    ['UpgradeInfo','building_upgrade','Building'],
    ['AutoCooker.ActionCost','machine_action','Furniture'],
    ['Gardener.ActionCost','machine_action','Furniture']
  ]){
    const path='source.'+field;
    if(!fields.has(path))continue;
    for(const [id,value] of await db.getFieldRows(path)){
      if(category?categories.get(id)!==category:!['Furniture','Clothing'].includes(categories.get(id)))continue;
      if(field==='UpgradeInfo'&&Array.isArray(value)){
        value.forEach((u,i)=>emit(id,kind,path+'['+i+'].Cost',u?.Cost,Number.isSafeInteger(u?.Level)?u.Level:null));
      }else if(field==='UnlockCost'){
        if(Array.isArray(value))value.forEach((v,i)=>emit(id,kind,path+'['+i+']',v));
      }else emit(id,kind,path,value);
    }
  }
  const actual=new Map(await db.getFieldRows('cost.configuredOccurrences'));
  const keys=new Map(await db.getFieldRows('cost.configuredKindCurrencyKeys'));
  const amountKeys=new Map(await db.getFieldRows('cost.configuredKindCurrencyAmountKeys'));
  const kindKeys=new Map(await db.getFieldRows('cost.configuredKinds'));
  const sorted=a=>[...new Set(a)].sort();
  assert.equal(actual.size,all.size);assert.equal(kindKeys.size,all.size);
  for(const [id,expected] of all){
    const sortRows=a=>[...a].sort((x,y)=>x.sourcePath.localeCompare(y.sourcePath));
    assert.deepEqual(sortRows(actual.get(id)),sortRows(expected));
    assert.deepEqual(kindKeys.get(id),sorted(expected.map(x=>x.kind)));
    const resolved=expected.filter(x=>x.currencyDefinitionResolved);
    const withAmount=resolved.filter(x=>x.amountFieldPresent);
    assert.deepEqual(keys.get(id),resolved.length?sorted(resolved.map(x=>JSON.stringify([x.kind,x.currencyItemId]))):undefined);
    assert.deepEqual(amountKeys.get(id),withAmount.length?sorted(withAmount.map(x=>JSON.stringify([x.kind,x.currencyItemId,x.amount]))):undefined);
  }
  const shoe=actual.get(40000047).find(x=>x.kind==='purchase_override');
  assert.equal(shoe.amount,16000);assert.equal(shoe.currencyItemId,80000000);
  const upgrade=actual.get(20000011).find(x=>x.kind==='building_upgrade');
  assert.equal(upgrade.upgradeLevel,1);assert.equal(upgrade.amount,null);assert.equal(upgrade.amountFieldPresent,false);
  assert(actual.get(40800001).some(x=>x.kind==='machine_action'&&x.currencyItemId===80000003&&x.amount===25));
  const ids=await db.findItemIdsByField('cost.configuredKindCurrencyAmountKeys',{kind:'contains',value:JSON.stringify(['purchase_override',80000000,16000])});
  assert(ids.includes(40000047));
  assert(!actual.get(40005160)?.some(x=>x.kind==='purchase_override'));
  console.log('DB01_CONFIGURED_COST_CENSUS',JSON.stringify({itemIds:all.size,occurrences:Object.fromEntries(kinds)}));
});

test('approved original purchase and sale prices match every sanitized source row',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const rows=JSON.parse(await readFile('data/ddv/item-master/original-price-amounts-steam-1.26.2.json','utf8'));
  const meta=db.release.originalPriceProjection;
  assert.equal(meta.publicationAuthorized,true);
  assert.equal(meta.runtimePriceVerified,false);
  assert.equal(meta.itemCount,9537);
  assert.equal(meta.purchaseEntries,9416);
  assert.equal(meta.sellEntries,1192);
  assert.equal(meta.purchaseExplicitAmounts,9036);
  assert.equal(meta.sellExplicitAmounts,718);
  assert.equal(meta.currencyCount,8);
  const provider=new Map(await db.getFieldRows('price.sourceProviderKind'));
  const buy=new Map(await db.getFieldRows('price.purchaseCosts'));
  const sell=new Map(await db.getFieldRows('price.sellCosts'));
  const source=new Map(await db.getFieldRows('price.sourceRecordIndex'));
  const cats=new Map(await db.getFieldRows('nativeCategory'));
  const keys=(costs)=>costs.map(([currencyItemId,amount])=>({currencyItemId,amount,amountFieldPresent:amount!==null}));
  assert.equal(provider.size,9537);
  assert.equal(source.size,9537);
  assert.equal(buy.size,9056);
  assert.equal(sell.size,1149);
  for(const [id,ordinal,purchases,sales] of rows){
    assert(cats.has(id));
    assert.equal(provider.get(id),ordinal===274?'dynamic_cache':'static');
    assert.equal(source.get(id),ordinal);
    assert.deepEqual(buy.get(id)??[],keys(purchases));
    assert.deepEqual(sell.get(id)??[],keys(sales));
    for(const [currency] of [...purchases,...sales])assert.equal(cats.get(currency),'Currency');
  }
  const omitted=rows.find(r=>r[3].some(c=>c[1]===null));
  const noPrice=[...cats.keys()].find(id=>!provider.has(id));
  const [actual,missing,unknown,duplicate,staticRow]=await db.getOriginalItemPrices([omitted[0],noPrice,2147483647,omitted[0],30000031]);
  assert.equal(actual.status,'configured');assert.equal(actual.providerKind,'dynamic_cache');
  assert(actual.sellCosts.some(c=>c.amount===null&&!c.amountFieldPresent));
  assert.deepEqual(actual,duplicate);assert.equal(actual.runtimePriceVerified,false);
  assert.equal(missing.status,'no_source_row');assert.equal(unknown,null);
  assert.deepEqual(staticRow.sellCosts,[{currencyItemId:80000000,amount:70,amountFieldPresent:true}]);
  assert.deepEqual(staticRow.purchaseCosts,[{currencyItemId:80000000,amount:70,amountFieldPresent:true}]);
  const matches=await db.findItemIdsByField('price.sellAmountKeys',{kind:'contains',value:JSON.stringify([80000000,70])});
  assert.deepEqual(matches,rows.filter(r=>r[3].some(([currency,amount])=>currency===80000000&&amount===70)).map(r=>r[0]));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});

test('native meal recipe slot matching consumes fixed slots before selectors and preserves recorded duplicates',async()=>{
  const {matchNativeMealSlots}=await import('../src/lib/acquisition/source-meal-sell-price.ts');
  const member=(itemId,type=2001400000,tags=[])=>({itemId,knownCookingClass:true,cookingTypeId:type,directTagIds:tags});
  const slots=[{kind:'type',id:2001400000},{kind:'fixed',id:30200045}];
  const matches=matchNativeMealSlots(slots,[member(30200045),member(30200045),member(30200045)]);
  assert.deepEqual(matches.map(x=>[x.recipeSlotIndex,x.adjusted]),[[1,true],[0,true],[null,false]]);
  const tagSlots=[{kind:'all_tags',ids:[2001200001,2001200002]},{kind:'alternatives',ids:[30200045]}];
  assert.deepEqual(matchNativeMealSlots(tagSlots,[member(30200045,2001400000,[2001200001,2001200002]),member(30200045)]).map(x=>x.adjusted),[true,true]);
  assert.deepEqual(matchNativeMealSlots(tagSlots,[member(30200045,2001400000,[2001200001]),member(30200045)]).map(x=>x.adjusted),[null,null]);
});
test('actual original fixed cooking recipe joins recorded material occurrences and original sell price fields',async()=>{
  const {estimateSourceMealSellPrice}=await import('../src/lib/acquisition/source-meal-sell-price.ts');
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const recipeId=2050000004;
  const [recipe]=await db.getItemFields([recipeId],['source.ResultItemID','source.Ingredients']);
  const mealId=recipe.values['source.ResultItemID'];
  const ingredients=recipe.values['source.Ingredients'].map(x=>x.ItemID);
  assert.deepEqual(ingredients,[31100053,31100001,30200045,30200090]);
  const result=await estimateSourceMealSellPrice(db,mealId,recipeId,[...ingredients,ingredients[0]]);
  assert.equal(result.ingredients.length,5);
  assert.deepEqual(result.ingredients.map(x=>x.adjusted),[true,true,true,true,false]);
  const prices=await db.getOriginalItemPrices([...ingredients,ingredients[0]]);
  for(const [i,row] of result.ingredients.entries()){
    const sell=prices[i].sellCosts.find(x=>x.currencyItemId===80000000);
    assert.equal(row.sourceUnitSellAmount,sell?.amount??null);
    assert.equal(row.conditionalUnitSellAmount,sell?sell.amount??0:1);
    assert.equal(row.conditionalContribution,i===4?row.conditionalUnitSellAmount:Math.trunc(Math.imul(row.conditionalUnitSellAmount,result.ingredientPercentage)/100));
  }
  assert.equal(result.sourceSnapshotEstimate,result.ingredients.reduce((sum,x)=>(sum+x.conditionalContribution)|0,0));
  assert.equal(result.actualSellPrice,null);
  assert.equal(result.runtimePriceVerified,false);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});

test('lowest ingredient source selection uses actual fixed recipe, mission exclusion and exact ties',async()=>{
  const {estimateSourceLowestMealSellPrice,getSourceMealRecipeIds}=await import('../src/lib/acquisition/source-meal-sell-price.ts');
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  assert((await getSourceMealRecipeIds(db,30300005)).includes(2050000004));
  const fixed=await estimateSourceLowestMealSellPrice(db,30300005,2050000004);
  assert.deepEqual(fixed.selectedIngredientIds,[31100053,31100001,30200045,30200090]);
  assert.equal(fixed.estimate.sourceSnapshotEstimate,673);
  assert.equal(fixed.estimate.starRating,4);
  assert.equal(fixed.actualSellPrice,null);
  const fish=await estimateSourceLowestMealSellPrice(db,30300010,2050000009);
  assert.equal(fish.slots[0].candidateCount,52);
  assert.deepEqual(fish.slots[0].tiedItemIds,[31000053,31000054,31000055,31000056]);
  assert.equal(fish.slots[0].minimumUnitAmount,1);
  assert.equal(fish.estimate.sourceSnapshotEstimate,412);
  assert.equal(fish.estimate.ingredients[0].priceSource,'native_default_if_lookup_fails');
  assert.equal(fish.nativeTieOrderVerified,false);
  const tag=await estimateSourceLowestMealSellPrice(db,30300132,2050000138);
  assert.equal(tag.slots[0].status,'source_minimum');
  assert.equal(tag.slots[0].candidateCount,8);
  assert.deepEqual(tag.selectedIngredientIds,[30200015]);
  assert.equal(tag.estimate.sourceSnapshotEstimate,26);
  assert.equal(tag.estimate.tagMatchingBasis,'original_direct_tags_only');
  const succotash=await estimateSourceLowestMealSellPrice(db,30300706,2050000663);
  assert.equal(succotash.slots[2].candidateCount,24);
  assert.deepEqual(succotash.selectedIngredientIds,[30200225,30200010,30200143]);
  assert.equal(succotash.estimate.sourceSnapshotEstimate,260);
  assert.equal(succotash.actualSellPrice,null);
  const puzzle=await estimateSourceLowestMealSellPrice(db,30300494,2050000467);
  assert(puzzle.slots.some(s=>s.status==='no_source_candidate'));
  assert.equal(puzzle.estimate,null);
  const ingredientIds=await db.findItemIdsByFields([
    {field:'sourceClass',anyOf:['CropItemData','FishItemData','IngredientItemData'].map(value=>({kind:'equals',value}))},
    {field:'source.CookingIngredientType',anyOf:[{kind:'present'}]}
  ]);
  assert.equal(ingredientIds.length,469);
  const mission=await db.getItemFields(ingredientIds,['source.IsMissionItem']);
  assert.equal(mission.filter(r=>r.values['source.IsMissionItem']===true).length,248);
});

test('source sale flags distinguish mission/unsellable from missing price on all fixed cooking ingredients',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const original=JSON.parse(await readFile('data/ddv/item-master/original-sale-flags-steam-1.26.2.json','utf8'));
  const flags=await db.getOriginalItemSaleFlags(original.map(r=>r[0]));
  assert.equal(flags.length,1087);
  for(const [i,[itemId,mission,unsellable]] of original.entries()){
    assert.deepEqual(flags[i],{itemId,status:'source_flags',isMissionItem:mission===1,missionFieldPresent:mission!==null,
      unsellable:unsellable===1,unsellableFieldPresent:unsellable!==null,runtimeSaleEligibilityVerified:false});
  }
  const recipes=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'RecipeItemData'});
  assert.equal(recipes.length,625);
  const rows=await db.getItemFields(recipes,['source.Ingredients']);
  const fixed=[...new Set(rows.flatMap(r=>r.values['source.Ingredients'].flatMap(s=>s.ItemID?[s.ItemID]:[])))].sort((a,b)=>a-b);
  assert.equal(fixed.length,371);
  const [prices,saleFlags]=await Promise.all([db.getOriginalItemPrices(fixed),db.getOriginalItemSaleFlags(fixed)]);
  const missing=prices.map((p,i)=>({p,f:saleFlags[i]})).filter(({p})=>!p.sellCosts.some(c=>c.currencyItemId===80000000&&c.amountFieldPresent));
  assert.equal(missing.length,160);
  assert(missing.every(({f})=>f.isMissionItem===true));
  assert.equal(missing.filter(({f})=>f.unsellable).length,106);
  const priced=prices.map((p,i)=>({p,f:saleFlags[i]})).filter(({p})=>p.sellCosts.some(c=>c.currencyItemId===80000000&&c.amountFieldPresent));
  assert.equal(priced.length,211);
  assert(priced.every(({f})=>!f.isMissionItem&&!f.unsellable));
  const [uncovered,unknown,duplicate]=await db.getOriginalItemSaleFlags([40000047,2147483647,original[0][0]]);
  assert.equal(uncovered.status,'not_covered');assert.equal(unknown,null);assert.deepEqual(duplicate,flags[0]);
  const puzzle=await db.findItemIdsByFields([
    {field:'sourceClass',anyOf:[{kind:'equals',value:'IngredientItemData'}]},
    {field:'source.CookingIngredientType',anyOf:[{kind:'equals',value:2001400020}]}
  ]);
  assert.equal(puzzle.length,54);
  assert((await db.getOriginalItemSaleFlags(puzzle)).every(f=>f.isMissionItem));
});
