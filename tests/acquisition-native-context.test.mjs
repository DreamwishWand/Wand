import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStructuralSrc02Origins} from '../src/lib/acquisition/native-origins.ts';
import {createAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';

// Representative synthetic paths using the original r5 source field shapes.
// No owner-private native record or save is included in this test.
function path(type,itemId,definitionId,extra){
  return {
    itemId,type,definitionId,
    pathId:(type==='loot_table_candidate'?'loot':type)+':'+definitionId+
      (type==='loot_table_candidate'?':0:0':''),
    nameKey:'Test:'+type,
    source:{kind:'game_native',file:type==='loot_table_candidate'?
      'itemlist/LootTable.json':type==='growing'?
      'itemlist/ActivityItem.json':'itemlist/ActivityData.json',definitionId},
    conditionDigest:null,...extra
  };
}
const DATA=new Map([
  [31000029,[path('fishing',31000029,2050100000,{
    areaIds:[6,16],rarity:4,weathers:['HeavyRain'],timeOfDays:['Nighttime']
  })]],
  [31600022,[path('mining',31600022,2050200022,{
    areaId:0,sceneId:null,rarity:3
  })]],
  [30200000,[path('growing',30200000,30400010,{
    seedItemId:30400010,producedAmount:1,growthSeconds:900,
    villageAreaIds:[2],wateringCount:1
  })]],
  [80000003,[path('timebending',80000003,2050400000,{
    locations:[{areaId:null,sceneId:1540000101},{areaId:null,sceneId:1540000000}],
    minHourglassLevel:2,amount:null,minMax:{min:400,max:500}
  })]],
  [80000000,[path('loot_table_candidate',80000000,2090000000,{
    contextVerified:false,groupIndex:0
  })]]
]);
function bundle(replace={}) {
  return {
    contract:'wand.src02.private-browser-bundle@1',
    manifestSha256:'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c',
    privateSource:true,publishable:false,verified:true,provenanceMatched:true,
    currentShopOffersVerified:false,currentAvailabilityVerified:false,
    source:{platform:'Steam',gameVersion:'1.26.2'},
    getItem(id) {
      const paths=replace[id]??DATA.get(id)??[];
      return {itemId:id,madeBy:[],acquisitionPaths:paths,shopOffers:[],
        possibleStalls:[]};
    }
  };
}
test('Fishing and mining native location codes and rarity survive acquisition projection',()=>{
  const output=projectStructuralSrc02Origins(bundle(),[31000029,31600022]);
  assert.deepEqual(output.map(x=>x.kind),['fishing','mining']);
  assert.deepEqual(output[0].nativeDetails.areaIds,[6,16]);
  assert.deepEqual(output[0].nativeDetails.timeOfDays,['Nighttime']);
  assert.deepEqual(output[0].nativeDetails.weathers,['HeavyRain']);
  assert.deepEqual(output[1].nativeDetails.areaIds,[0]);
  assert.equal(output[1].nativeDetails.rarity,3);
  assert.equal(output[0].routeStatus,'static_candidate_only');
  const db=createAcquisitionOriginDatabase(output);
  assert.equal(db.getItem(31000029).origins.length,1);
  assert.equal(db.getItem(31600022).origins.length,1);
});

test('Crop seed ID, grow time and yield are preserved without inventing seed acquisition',()=>{
  // All 100 source r5 ActivityItem growing rows omit top-level definitionId.
  const growing={...DATA.get(30200000)[0]};
  delete growing.definitionId;
  const row=projectStructuralSrc02Origins(bundle({30200000:[growing]}),[30200000])[0];
  assert.equal(row.nativeDetails.definitionId,'30400010');
  assert.equal(row.kind,'farming');
  assert.equal(row.quantity,1);
  assert.equal(row.nativeDetails.seedItemId,'30400010');
  assert.equal(row.nativeDetails.growthSeconds,900);
  assert.equal(row.nativeDetails.yieldedQuantity,1);
  assert.deepEqual(row.nativeDetails.areaIds,[2]);
  assert(row.conditions.some(x=>x.includes('Requires seed Item ID: 30400010')));
  const db=createAcquisitionOriginDatabase([row]);
  assert.equal(db.getItem(30400010).origins.length,0);
});

test('Timebending has its own acquisition kind and retains scene and range evidence',()=>{
  const row=projectStructuralSrc02Origins(bundle(),[80000003])[0];
  assert.equal(row.kind,'timebending');
  assert.equal(row.quantity,null);
  assert.deepEqual(row.nativeDetails.sceneIds,[1540000101,1540000000]);
  assert.equal(row.nativeDetails.minHourglassLevel,2);
  assert.deepEqual(row.nativeDetails.amountRange,{min:400,max:500});
  assert.deepEqual(row.nativeDetails.areaIds,[]);
  assert.equal(createAcquisitionOriginDatabase([row]).getItem(80000003).origins.length,1);
});

test('Native LootTable membership without gameplay context can never be confirmed as a drop',()=>{
  const row=projectStructuralSrc02Origins(bundle(),[80000000])[0];
  assert.equal(row.kind,'loot');
  assert.equal(row.routeStatus,'static_candidate_only');
  assert.equal(row.nativeDetails.family,'loot_table_candidate');
  assert.equal(row.nativeDetails.lootTableId,'2090000000');
  assert.equal(row.nativeDetails.lootGroupIndex,0);
  assert.equal(row.nativeDetails.lootContextVerified,false);
  assert(row.conditions.some(x=>x.includes('does not verify a gameplay acquisition context')));
  assert.throws(()=>createAcquisitionOriginDatabase([{
    ...row,routeStatus:'confirmed_source_link',
    source:{...row.source,kind:'verified_game_native',sha256:'a'.repeat(64)}
  }]),/DB02_ORIGINS_LOOT_CONTEXT_NOT_VERIFIED/);
  const malformed=path('loot_table_candidate',80000000,2090000000,{
    contextVerified:true,groupIndex:0
  });
  assert.throws(()=>projectStructuralSrc02Origins(bundle({80000000:[malformed]}),[80000000]),
    /DB02_NATIVE_ORIGINS_LOOT_CONTEXT_UNVERIFIED_REQUIRED/);
});

test('Static stall slots and native candidate group indices remain separate origin IDs',()=>{
  const original=bundle();
  const source={
    ...original,
    getItem(id) {return {
      itemId:id,acquisitionPaths:[],madeBy:[],shopOffers:[],
      possibleStalls:[{
        stallId:20100000,nameKey:'Test stall',
        status:'static_candidate_not_verified_for_sale',
        hasConditionalFilter:true,
        slots:[
          {slotIndex:0,lootTableId:2090000033,candidateGroupIndexes:[0,2]},
          {slotIndex:1,lootTableId:2090000034,candidateGroupIndexes:[1]}
        ]
      }]
    };}
  };
  const routes=projectStructuralSrc02Origins(source,[31700017]);
  assert.equal(routes.length,2);
  assert(routes.every(x=>x.kind==='game_shop'&&x.routeStatus==='static_candidate_only'));
  assert.equal(new Set(routes.map(x=>x.originId)).size,2);
  assert.deepEqual(routes[0].nativeDetails.candidateGroupIndexes,[0,2]);
  assert.equal(routes[1].nativeDetails.lootTableId,'2090000034');
  assert.equal(routes[1].nativeDetails.stallSlotIndex,1);
  assert.equal(routes[0].nativeDetails.conditionalFilter,true);
  assert.equal(createAcquisitionOriginDatabase(routes).getItem(31700017).origins.length,2);
});

test('Unknown original path types, wrong file provenance and invalid group indices fail closed',()=>{
  assert.throws(()=>projectStructuralSrc02Origins(bundle({31000029:[
    {...DATA.get(31000029)[0],type:'unknown'}
  ]}),[31000029]),/UNSUPPORTED_NATIVE_PATH/);
  assert.throws(()=>projectStructuralSrc02Origins(bundle({31000029:[
    {...DATA.get(31000029)[0],source:{kind:'game_native',
      file:'itemlist/LootTable.json',definitionId:2050100000}}
  ]}),[31000029]),/PATH_SOURCE/);
  assert.throws(()=>projectStructuralSrc02Origins(bundle({80000000:[
    {...DATA.get(80000000)[0],groupIndex:-1}
  ]}),[80000000]),/NATIVE_NUMBER/);
});
