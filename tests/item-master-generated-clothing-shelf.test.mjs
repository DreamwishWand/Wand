import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('original furniture and clothing shelf routes preserve native price intervals and set unlock fallback',async()=>{
 const db=await openCurrentItemDatabase('',async u=>new Response(await readFile('static'+u),{status:200}));
 const actual=new Map(await db.getFieldRows('acquisition.ordinaryGeneratedStoreShelfSources'));
 assert(actual.size>0);
 const [candidates,prices,gates,sets,overrides,evolved,category,classes]=await Promise.all([
  'acquisition.storeInstalledShelfCandidates','acquisition.catalogFacts','source.SetItemID',
  'source.CatalogVisibilityConditions','source.PriceOverride','source.IsEvolvedAsset','acquisition.effectiveCategories','sourceClass'
 ].map(async f=>new Map(await db.getFieldRows(f))));
 const providers=JSON.parse(await readFile('data/ddv/item-master/original-price-amounts-steam-1.26.2.json','utf8'));
 const costs=new Map(providers.map(([id,provider,buy])=>[id,{provider,buy}]));
 const expected=new Set(),effectivePrices=new Map();
 // Independent comparison: use exact public override objects and the source
 // provider ledger; the native matching-currency branch wins even when no
 // provider exists or its recorded amount differs.
 for(const [id,override] of overrides){
   const provider=costs.get(id);
   if(!override||typeof override!=='object'||Array.isArray(override))continue;
   if(Object.keys(override).length===0){
     if(provider?.buy.length===1&&provider.buy[0][0]===80000000&&Number.isSafeInteger(provider.buy[0][1])&&provider.buy[0][1]>0&&provider.buy[0][1]<=2147483647)
       effectivePrices.set(id,{amount:provider.buy[0][1],source:provider.provider===274?'dynamic_cache':'static',record:provider.provider});
   }else if(Object.keys(override).length===1&&override.Price&&Object.keys(override.Price).length===2&&
     override.Price.Id===80000000&&Number.isSafeInteger(override.Price.Amount)&&override.Price.Amount>0&&override.Price.Amount<=2147483647&&
     ['FurnitureItemData','ClothingItemData'].includes(classes.get(id))){
     effectivePrices.set(id,{amount:override.Price.Amount,source:'explicit_override',record:null});
   }
 }
 for(const [id,links] of candidates){
   const facts=prices.get(id),setId=gates.get(id),setGate=sets.get(setId);
   if(!Number.isInteger(setId)||setId<0||setId>0&&(!setGate||Object.keys(setGate).length)||
      !facts?.flagsKnown||facts.exclusionFlags.length||facts.gateStatus!=='empty_source_gate'||
      evolved.get(id)===true||!effectivePrices.has(id))continue;
   if(links.some(l=>(l.sourceItemFileSha256===db.release.sourceFilesSha256.Clothing&&!l.gridReviewRequired&&!l.directTagReviewRequired||
       l.sourceItemFileSha256===db.release.sourceFilesSha256.Furniture&&l.gridReviewRequired&&l.nativeGrid?.status==='passed'&&l.nativeGrid.directTagPredicateVerified===true)&&
     Array.isArray(l.priceTables)&&l.priceTables.some(t=>Array.isArray(t.Thresholds)&&t.Thresholds.length)))expected.add(id);
 }
 assert.deepEqual([...actual.keys()].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b));
 for(const [id,links] of actual){
   assert(category.get(id).includes('ordinary_gameplay'));
   for(const l of links){
     const match=candidates.get(id).find(c=>c.displayItemId===l.sourceItemId&&c.buildingSourcePath===l.sourcePath&&c.shelfSlotIndex===l.shelfSlotIndex);
     assert(match);const ts=match.priceTables[l.tableIndex].Thresholds;
     assert.equal(l.sourceDirectTagPredicateVerified,true);
     assert.deepEqual(l.nativeGrid,match.nativeGrid);
     if(l.itemNativeCategory==='Furniture')assert.equal(l.nativeGrid.status,'passed');
     const price=effectivePrices.get(id),cost=price.amount;
     assert.equal(l.configuredPurchaseAmount,cost);
     assert.equal(l.priceSource,price.source);assert.equal(l.priceProviderRecordIndex,price.record);
     assert.equal(l.minimum,l.bandIndex===0?1:ts[l.bandIndex-1]);
     assert.equal(l.maximum,l.bandIndex===ts.length?2147483647:ts[l.bandIndex]-1);
     assert(cost>=l.minimum&&cost<=l.maximum);
     assert.equal(l.setItemId,gates.get(id)||null);
     assert.equal(l.inheritedSetGateEmpty,true);
     assert.equal(l.runtimeStockVerified,false);assert.equal(l.storeMembershipVerified,false);assert.equal(l.currentAvailabilityVerified,false);
   }
 }
 const overrideIds=[...actual].filter(([,links])=>links.some(l=>l.priceSource==='explicit_override')).map(([id])=>id);
 console.log('DB01_GENERATED_SHELF_EXPLICIT_OVERRIDES '+JSON.stringify({items:overrideIds.length,
   differingProvider:overrideIds.filter(id=>costs.has(id)&&!costs.get(id).buy.some(([currency,amount])=>currency===80000000&&amount===effectivePrices.get(id).amount)).length,
   noProvider:overrideIds.filter(id=>!costs.has(id)).length}));
 const ids=[...new Set([...actual.keys()].slice(0,20).concat(overrideIds))],details=await readItemAcquisitionSourceDetails(db,ids,'ja');
 for(const d of details)assert.deepEqual(d.classificationExtensions.filter(l=>l.family==='storeGeneratedShelf').map(l=>l.evidence),actual.get(d.itemId));
});
