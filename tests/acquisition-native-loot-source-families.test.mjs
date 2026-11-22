import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';
import {projectStructuralSrc02Origins} from '../src/lib/acquisition/native-origins.ts';
import {indexNativeLootSourceFamilies} from '../src/lib/acquisition/native-loot-source-families.ts';

// Synthetic copies of the r5 field shape only. No owner-private rows published.
const paths=new Map([
  [80000000,[
    {itemId:80000000,definitionId:2090000000,groupIndex:0,
      nameKey:'Chest!LootPresent1',pathId:'loot:2090000000:0:0'}
  ]],
  [30200086,[
    {itemId:30200086,definitionId:2090000002,groupIndex:0,
      nameKey:'Critters!UrbanCritterBasic',pathId:'loot:2090000002:0:0'},
    {itemId:30200086,definitionId:2090000023,groupIndex:1,
      nameKey:'Mission!ExampleQuestRewards',pathId:'loot:2090000023:1:0'}
  ]],
  [31700022,[
    {itemId:31700022,definitionId:2090000002,groupIndex:1,
      nameKey:'Critters!UrbanCritterBasic',pathId:'loot:2090000002:1:0'},
    {itemId:31700022,definitionId:2090000024,groupIndex:0,
      nameKey:'PoolingStall!Stall2_Meadow!pool',pathId:'loot:2090000024:0:0'}
  ]]
]);
function fakeBundle(custom=paths){
  return {
    contract:'wand.src02.private-browser-bundle@1',
    manifestSha256:'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c',
    privateSource:true,publishable:false,verified:true,provenanceMatched:true,
    currentShopOffersVerified:false,currentAvailabilityVerified:false,
    source:{platform:'Steam',gameVersion:'1.26.2'},
    getItem(id){
      return {
        itemId:id,madeBy:[],shopOffers:[],possibleStalls:[],
        acquisitionPaths:(custom.get(id)??[]).map(entry=>({
          type:'loot_table_candidate',conditionDigest:null,
          contextVerified:false,...entry,
          source:{kind:'game_native',file:'itemlist/LootTable.json',
            definitionId:entry.definitionId}
        }))
      };
    }
  };
}
function fixture(ids=[80000000,30200086,31700022],rows=paths){
  const native=projectStructuralSrc02Origins(fakeBundle(rows),ids);
  const origins=createAcquisitionOriginDatabase(native);
  return {native,origins,index:indexNativeLootSourceFamilies(origins,ids)};
}

test('Source-native family, table and exact native key indexes preserve all candidate links',()=>{
  const {native,index}=fixture();
  assert.equal(native.length,5);
  assert.equal(index.schema,'wand.db02.native-loot-source-families@1');
  assert.deepEqual(index.coverage,{
    indexedItemIds:3,distinctCandidateItemIds:3,candidateRoutes:5,
    sourceFamilies:4,nativeLootTableIds:4,
    inputCatalogScope:'caller_supplied_item_ids',
    acquisitionContextVerified:false,liveStockVerified:false,
    completeAllGameItemScopes:false
  });
  assert.deepEqual(index.listFamilies().map(x=>x.sourceFamily),
    ['Critters','Chest','Mission','PoolingStall']);
  assert.equal(index.getFamilyCandidates('Critters').length,2);
  assert.equal(index.getLootTableCandidates(2090000002).length,2);
  assert.equal(index.getLootTableCandidates('2090000002')[1].groupIndex,1);
  assert.deepEqual(index.getItemCandidates(30200086).map(x=>x.sourceFamily),
    ['Critters','Mission']);
  assert.equal(index.getNativeNameCandidates('PoolingStall!Stall2_Meadow!pool').length,1);
  assert.equal(index.getNativeNameCandidates('Chest!LootPresent1')[0].lootTableId,
    '2090000000');
  assert.equal(index.listFamilies().find(x=>x.sourceFamily==='Critters').itemIds,2);
  assert.equal(index.listFamilies().find(x=>x.sourceFamily==='Critters').lootTableIds,1);
  assert.equal(index.getLootTableCandidates(2090000002)[0].acquisitionContextVerified,false);
  assert.equal(index.getLootTableCandidates(2090000002)[0].routeStatus,'static_candidate_only');
  assert.equal(index.getLootTableCandidates(2090000002)[0].source.kind,
    'unhashed_structural_candidate');
  assert(Object.isFrozen(index.getFamilyCandidates('Critters')));
  assert(Object.isFrozen(index.getFamilyCandidates('Critters')[0]));
  assert(Object.isFrozen(index.listFamilies()));
});

test('Caller scope stays explicit: no false negatives for item IDs excluded from a partial join',()=>{
  const {index}=fixture([80000000]);
  assert.equal(index.coverage.indexedItemIds,1);
  assert.equal(index.coverage.candidateRoutes,1);
  assert.equal(index.getFamilyCandidates('Critters').length,0);
  assert.equal(index.getItemCandidates(31700022).length,0);
  assert.equal(index.getLootTableCandidates(2090000002).length,0);
  assert.equal(index.coverage.completeAllGameItemScopes,false);
});

test('A native table ID cannot silently carry contradictory original name families',()=>{
  const bad=new Map(paths);
  bad.set(31700022,[{
    itemId:31700022,definitionId:2090000002,groupIndex:1,
    nameKey:'Mission!DifferentNativeKey',pathId:'loot:2090000002:1:0'
  }]);
  const native=projectStructuralSrc02Origins(fakeBundle(bad),[30200086,31700022]);
  const origins=createAcquisitionOriginDatabase(native);
  assert.throws(()=>indexNativeLootSourceFamilies(origins,[30200086,31700022]),
    /TABLE_NAME_CONFLICT/);
});
test('Native LootTable group path/byte provenance cannot be rewritten into a confirmed loot drop',()=>{
  const {native,origins}=fixture();
  assert.throws(()=>createAcquisitionOriginDatabase([{
    ...native[0],routeStatus:'confirmed_source_link',
    source:{...native[0].source,kind:'verified_game_native',sha256:'a'.repeat(64)}
  }]),/LOOT_CONTEXT_NOT_VERIFIED/);
  assert.throws(()=>indexNativeLootSourceFamilies(origins,[0]),/INVALID_ID/);
  assert.throws(()=>indexNativeLootSourceFamilies(origins,[80000000,80000000,0]),
    /INVALID_ID/);
  assert.throws(()=>indexNativeLootSourceFamilies(origins,[]).getNativeNameCandidates('Mission!\nBad'),
    /INVALID_SOURCE_NAME/);
});
