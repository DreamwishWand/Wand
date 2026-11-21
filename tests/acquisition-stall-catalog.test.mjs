import test from 'node:test';
import assert from 'node:assert/strict';
import { createAcquisitionDatabase } from '../src/lib/acquisition/index.mjs';
import { createStaticStallCatalogIndex } from '../src/lib/acquisition/stall-catalog.mjs';

const source = () => ({
  manifest:{schema:'wand.src02@1',platform:'Steam',gameVersion:'1.26.2'},
  recipes:[], acquisitions:[], relatedItems:[], shopOffers:[],
  lootTables:[
    {lootTableId:2090000001,groups:[
      {index:0,candidates:[{itemId:31,conditionDigest:null},{itemId:31,conditionDigest:null},
        {itemId:32,conditionDigest:'opaque'}],hasDynamicTypeFilters:false},
      {index:1,candidates:[{itemId:31,conditionDigest:null}],eligibilityDigest:'opaque',hasDynamicTypeFilters:true}
    ]},
    {lootTableId:2090000002,groups:[
      {index:3,candidates:[],hasDynamicTypeFilters:true},
      {index:4,candidates:[{itemId:33,conditionDigest:null}],hasDynamicTypeFilters:false}
    ]},
  ],
  stallSources:[
    {stallId:20100004,nameKey:'Stall_B',shopDataKey:'GardeningStall',slotLootTableIds:[2090000001,2090000001],
      unlockWithItemId:null,unlockAtLevel:null,unlockCosts:[{itemId:80000000,amount:1000}],
      upgrades:[{level:1,requiredPlayerLevel:null,benefitType:'gardening',benefitDigest:'a'.repeat(64),cost:{itemId:80000000,amount:null}}],
      inventoryStatus:'static_loot_candidates_only'},
    {stallId:20100003,nameKey:'Stall_A',shopDataKey:'GardeningStall',slotLootTableIds:[2090000002],
      unlockCosts:[{itemId:80000000,amount:null}],upgrades:[],inventoryStatus:'static_loot_candidates_only'},
  ],
});

test('native stall catalogue groups by ShopData key without flattening slot repetitions',()=>{
  const db=createAcquisitionDatabase(source());
  const all=db.listStallStaticCatalogs();
  assert.deepEqual(all.map(s=>s.stallId),[20100003,20100004]);
  assert.equal(db.getStallStaticCatalog(20100004).slotCount,2);
  assert.deepEqual(db.getStallStaticCatalog(20100004).slots.map(s=>s.lootTableId),[2090000001,2090000001]);
  assert.deepEqual(db.getStallStaticCatalog(20100004).candidateItemIds,[31,32]);
  assert.deepEqual(db.getStallStaticCatalog(20100004).slots[0].candidates[0].candidateGroupIndexes,[0,1]);
  assert.equal(db.getStallStaticCatalog(20100004).slotsWithDynamicTypeFilters,2);
  assert.deepEqual(db.getStallsByShopDataKey('GardeningStall').map(s=>s.stallId),[20100003,20100004]);
  assert.equal(db.getStallStaticCatalog(99),null);
  assert.equal(db.getStallsByShopDataKey('Unknown').length,0);
});

test('a dynamic-only loot group is not assumed empty or complete',()=>{
  const db=createAcquisitionDatabase(source());
  const record=db.getStallStaticCatalog(20100003);
  assert.equal(record.slots[0].hasDynamicTypeFilters,true);
  assert.equal(record.slots[0].enumeratedCandidatesExhaustive,false);
  assert.equal(record.slots[0].currentSlotItemId,null);
  assert.equal(record.slots[0].currentSalePrice,null);
  assert.equal(record.currentSalePricesVerified,false);
  assert.equal(record.completeShopCatalogVerified,false);
  assert.equal(record.currentInventoryVerified,false);
  assert.deepEqual(record.candidateItemIds,[33]);
});

test('building unlock and upgrade costs remain separate from retail prices; null not free',()=>{
  const db=createAcquisitionDatabase(source());
  const a=db.getStallStaticCatalog(20100004);
  assert.deepEqual(a.buildingCosts.unlockCosts,[{itemId:80000000,amount:1000,amountVerified:true}]);
  assert.deepEqual(a.buildingCosts.upgrades[0].cost,{itemId:80000000,amount:null,amountVerified:false});
  assert.equal(a.buildingCosts.upgrades[0].costAmountVerified,false);
  assert.equal(a.buildingCosts.unlockSatisfied,'unknown');
  assert.equal(a.buildingCosts.costsAreBuildingNotSalePrices,true);
  const b=db.getStallStaticCatalog(20100003);
  assert.equal(b.buildingCosts.unlockCosts[0].amountVerified,false);
  assert.equal(b.buildingCosts.unlockCosts[0].amount,null);
});

test('catalogue and all nested slot, candidate, group and cost records are immutable',()=>{
  const db=createAcquisitionDatabase(source());
  const row=db.getStallStaticCatalog(20100004);
  const checks=[row,row.slots,row.slots[0],row.slots[0].candidates,
    row.slots[0].candidates[0],row.slots[0].candidates[0].candidateGroupIndexes,
    row.candidateItemIds,row.buildingCosts,row.buildingCosts.unlockCosts,
    row.buildingCosts.unlockCosts[0],row.buildingCosts.upgrades,row.buildingCosts.upgrades[0],
    row.buildingCosts.upgrades[0].cost,db.listStallStaticCatalogs(),db.getStallsByShopDataKey('GardeningStall')];
  assert.ok(checks.every(Object.isFrozen));
  assert.throws(()=>row.slots[0].candidates.push({itemId:1}),TypeError);
  assert.throws(()=>{row.buildingCosts.unlockCosts[0].amount=0;},TypeError);
  assert.deepEqual(db.getStallStaticCatalog(20100004).candidateItemIds,[31,32]);
});

test('shop-sale offers and static building costs stay separate',()=>{
  const input=source();
  input.shopOffers=[{offerId:'one',itemId:31,amount:2},{offerId:'two',itemId:31,amount:3}];
  input.relatedItems=[{itemId:31,inSrc01:true,recipesProducedBy:[],recipesUsedBy:[],acquisitionPaths:[]}];
  const db=createAcquisitionDatabase(input);
  assert.deepEqual(db.getItem(31).shopOffers.map(o=>o.offerId),['one','two']);
  assert.equal(db.getStallStaticCatalog(20100004).currentSalePricesVerified,false);
  assert.equal(db.getStallStaticCatalog(20100004).buildingCosts.unlockCosts[0].amount,1000);
});

test('reject duplicate stall, unknown loot, invalid costs and duplicate group indexes',()=>{
  const input=source();
  input.stallSources.push(structuredClone(input.stallSources[0]));
  assert.throws(()=>createStaticStallCatalogIndex(input),/INVALID_STATIC_STALL_SOURCE/);
  input.stallSources.pop();
  input.stallSources[0].slotLootTableIds=[999];
  assert.throws(()=>createStaticStallCatalogIndex(input),/Unresolved stall loot table/);
  input.stallSources[0].slotLootTableIds=[2090000001];
  input.stallSources[0].unlockCosts=[{itemId:80000000,amount:-1}];
  assert.throws(()=>createStaticStallCatalogIndex(input),/INVALID_STATIC_STALL_COST/);
  input.stallSources[0].unlockCosts=[];
  input.lootTables[0].groups[1].index=0;
  assert.throws(()=>createStaticStallCatalogIndex(input),/INVALID_STATIC_STALL_LOOT_GROUP/);
});