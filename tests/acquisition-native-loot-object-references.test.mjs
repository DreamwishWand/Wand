import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_ITEM_LOOT_REFS,FURNITURE_LOOT_REFS
} from '../src/lib/acquisition/native-loot-object-references.data.ts';
import {
  DB02_LOOT_OBJECT_REFERENCES_SCHEMA,
  DB02_LOOT_OBJECT_ORIGINAL_SHA256,
  nativeLootObjectReferenceIndex
} from '../src/lib/acquisition/native-loot-object-references.ts';
import {createAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';
import {projectStructuralSrc02Origins} from '../src/lib/acquisition/native-origins.ts';
import {indexNativeLootSourceFamilies} from '../src/lib/acquisition/native-loot-source-families.ts';

const lookup=nativeLootObjectReferenceIndex;

test('375 published native object references match the independently scanned original source checksum',()=>{
  assert.equal(DB02_LOOT_OBJECT_REFERENCES_SCHEMA,'wand.db02.native-loot-object-references@1');
  const rows=[
    ...ACTIVITY_ITEM_LOOT_REFS.map(([id,suffix,field])=>
      `ActivityItem:${id}:${2090000000+suffix}:${field===11?'.11.1':'.'+field}`),
    ...FURNITURE_LOOT_REFS.map(([id,suffix])=>
      `Furniture:${id}:${2090000000+suffix}:.12`)
  ].sort();
  let hash=2166136261;
  for(const ch of rows.join('\n')){
    hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;
  }
  // SHA-pinned exact originals:
  // 4,050 ActivityItem frames + 6,746 Furniture frames + 960 LootTable frames.
  assert.equal(hash,0x08757996);
  assert.equal(rows.length,375);
  assert.deepEqual(lookup.coverage,{
    originalGameVersion:'1.26.2',originalPlatform:'Steam',
    activityItemReferences:203,furnitureReferences:172,
    allDefinitionReferences:375,distinctObjectItemIds:375,
    distinctReferencedLootTableIds:295,
    directMissionJsonLootTableIdReferences:0,
    directObjectTableReferencesVerified:true,
    gameplayDropSemanticsVerified:false,
    completeAllNativeSourceFamilies:false
  });
  assert.equal(DB02_LOOT_OBJECT_ORIGINAL_SHA256.activityItem,
    '4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2');
  assert.equal(DB02_LOOT_OBJECT_ORIGINAL_SHA256.furniture,
    'cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196');
  assert.equal(DB02_LOOT_OBJECT_ORIGINAL_SHA256.lootTable,
    '580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c');
});

test('Original source object ID directly reverses to source-named Mission LootTable ID',()=>{
  const [chest]=lookup.getObjectLootTableReferences(31400007);
  assert.equal(chest.sourceFamily,'ActivityItem');
  assert.equal(chest.sourceWirePath,'protobuf.8');
  assert.equal(chest.sourceObjectItemId,'31400007');
  assert.equal(chest.lootTableId,'2090000111');
  assert.equal(chest.sourceDefinitionRefVerified,true);
  assert.equal(chest.lootContextVerified,false);
  assert.equal(chest.actualDropVerified,false);
  const byTable=lookup.getLootTableReferrers('2090000111');
  assert.equal(byTable.length,1);
  assert.equal(byTable[0],chest);
  const torch=lookup.getLootTableReferrers(2090000292);
  assert.deepEqual(torch.map(x=>x.sourceObjectItemId),['40600126']);
  assert.equal(torch[0].sourceFamily,'Furniture');
  assert.equal(torch[0].sourceWirePath,'protobuf.12');
  assert.equal(torch[0].lootTableOriginalSha256,
    DB02_LOOT_OBJECT_ORIGINAL_SHA256.lootTable);
  assert.equal(lookup.getObjectLootTableReferences(31500371)[0].sourceWirePath,
    'protobuf.11.1');
  assert(Object.isFrozen(byTable));
  assert(Object.isFrozen(byTable[0]));
  assert.deepEqual(lookup.getLootTableReferrers('2090000272'),[]);
});

function nativeSourceIndex(){
  const fixture=[
    {itemId:31200000,definitionId:2090000111,groupIndex:0,
      nameKey:'Mission!Story!DonaldBag'},
    {itemId:31200000,definitionId:2090000292,groupIndex:0,
      nameKey:'Mission!Story!MRQS133_NightTorch'},
    {itemId:31200001,definitionId:2090000598,groupIndex:0,
      nameKey:'Mission!Story!MRQS140_BrownRockLoot'},
  ];
  const refs=new Map();
  for(const [i,record] of fixture.entries()){
    const list=refs.get(record.itemId)??[];
    list.push({
      type:'loot_table_candidate',itemId:record.itemId,
      definitionId:record.definitionId,groupIndex:record.groupIndex,
      nameKey:record.nameKey,contextVerified:false,conditionDigest:null,
      pathId:`loot:${record.definitionId}:${record.groupIndex}:${i}`,
      source:{kind:'game_native',file:'itemlist/LootTable.json',
        definitionId:record.definitionId}
    });
    refs.set(record.itemId,list);
  }
  const src={
    contract:'wand.src02.private-browser-bundle@1',
    manifestSha256:'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c',
    privateSource:true,publishable:false,verified:true,provenanceMatched:true,
    currentShopOffersVerified:false,currentAvailabilityVerified:false,
    source:{platform:'Steam',gameVersion:'1.26.2'},
    getItem(itemId){
      return {itemId,madeBy:[],shopOffers:[],possibleStalls:[],
        acquisitionPaths:refs.get(itemId)??[]};
    }
  };
  return indexNativeLootSourceFamilies(
    createAcquisitionOriginDatabase(
      projectStructuralSrc02Origins(src,[31200000,31200001])),
    [31200000,31200001]);
}
test('Item ID joins only to objects with exact native LootTable ID; no confirmed drop inferred',()=>{
  const idx=nativeSourceIndex();
  const sources=lookup.getItemPotentialObjectSources('31200000',idx);
  assert.deepEqual(sources.map(x=>x.sourceObject.sourceObjectItemId),
    ['31400007','40600126']);
  assert.equal(sources[0].sourceDefinitionRefVerified,true);
  assert.equal(sources[0].actualDropVerified,false);
  assert.equal(sources[0].currentAvailabilityVerified,false);
  assert.equal(sources[0].staticLootProvenance.kind,'unhashed_structural_candidate');
  assert(Object.isFrozen(sources));
  assert(Object.isFrozen(sources[0]));
  const duplicates=lookup.getItemPotentialObjectSources(31200001,idx);
  assert.equal(duplicates.length,7);
  assert.equal(duplicates.every(x=>x.lootTableId==='2090000598'),true);
  assert.deepEqual(lookup.getItemPotentialObjectSources(1,idx),[]);
});

test('Reject malformed ID and a forged static loot index contract',()=>{
  assert.throws(()=>lookup.getLootTableReferrers('02090000111'),/INVALID_ID/);
  assert.throws(()=>lookup.getObjectLootTableReferences(0),/INVALID_ID/);
  assert.throws(()=>lookup.getItemPotentialObjectSources(1,{
    schema:'not-an-original-loot-source',
    getItemCandidates:()=>[]
  }),/LOOT_ORIGIN_INDEX_REQUIRED/);
});
