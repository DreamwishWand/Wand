import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';
import {projectStructuralSrc02Origins} from '../src/lib/acquisition/native-origins.ts';
import {indexNativeLootSourceFamilies} from '../src/lib/acquisition/native-loot-source-families.ts';
import {
  indexMissionLootQuestCandidates,loadMissionLootQuestCandidates,
  loadPinnedQuestItemReferenceEvidence,DB02_MISSION_LOOT_QUEST_SCHEMA
} from '../src/lib/acquisition/mission-loot-quest-candidates.ts';

// Real, publicly published, source-verified DB-03 quest identity catalogue.
const guide=JSON.parse(readFileSync(new URL(
  '../static/guide/public/quest-index.json',import.meta.url),'utf8'));
function path(itemId,tableId,groupIndex,nameKey) {
  return {
    type:'loot_table_candidate',itemId,definitionId:tableId,groupIndex,
    nameKey,contextVerified:false,conditionDigest:null,
    pathId:'loot:'+tableId+':'+groupIndex+':0',
    source:{kind:'game_native',file:'itemlist/LootTable.json',definitionId:tableId}
  };
}
const samples=new Map([
  [120000000,[
    path(120000000,2090000106,0,'Mission!Village!VLG_Moan_040_PuaReward')
  ]],
  [31500024,[
    path(31500024,2090000109,0,'Mission!Village!VLG_Moan_030_HouseNightThorn')
  ]],
  [31000013,[
    path(31000013,2090000111,0,'Mission!Story!DonaldBag')
  ]],
  [31200003,[
    path(31200003,2090000110,0,'Mission!Village!VLG_Minn_020')
  ]],
  [31700022,[
    path(31700022,2090000988,0,'Mission!Story!MRQS133_NightTorch')
  ]],
  [31201177,[
    path(31201177,2090000999,0,'Mission!Village!Jasmine!VLG_Jasm_030_IceChestKeyLoot')
  ]],
  [31201085,[
    path(31201085,2090001888,0,'Mission!Village!Lady!SEC_Lady_020_MeatballBlocker')
  ]]
]);
function fakeBundle(){
  return {
    contract:'wand.src02.private-browser-bundle@1',
    manifestSha256:'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c',
    privateSource:true,publishable:false,verified:true,provenanceMatched:true,
    currentShopOffersVerified:false,currentAvailabilityVerified:false,
    source:{platform:'Steam',gameVersion:'1.26.2'},
    getItem(id){
      return {itemId:id,madeBy:[],shopOffers:[],possibleStalls:[],
        acquisitionPaths:samples.get(id)??[]};
    }
  };
}
function setup(){
  const ids=[...samples.keys()];
  const originals=projectStructuralSrc02Origins(fakeBundle(),ids);
  const index=indexNativeLootSourceFamilies(
    createAcquisitionOriginDatabase(originals),ids);
  return {originals,loot:index};
}

test('Mission names identify actual DB-03 Quest IDs only by unique native-code prefix',()=>{
  const {loot}=setup();
  const index=indexMissionLootQuestCandidates(loot,guide);
  assert.equal(index.schema,DB02_MISSION_LOOT_QUEST_SCHEMA);
  assert.equal(index.coverage.questDefinitions,733);
  assert.equal(index.coverage.nativeMissionLootTables,7);
  assert.equal(index.coverage.uniquelyNamedQuestTables,4);
  assert.equal(index.coverage.unmatchedNativeMissionTables,3);
  assert.equal(index.coverage.explicitLootQuestLinksVerified,0);
  assert.equal(index.coverage.privateQuestItemFlows,'not_supplied');
  const pua=index.getQuestCandidates(2070000723);
  assert.equal(pua.length,1);
  assert.equal(pua[0].questInternalName,'Village!Moana!Moana!VLG_Moan_040');
  assert.equal(pua[0].questNameEn,'The Search for Pua');
  assert.equal(pua[0].itemId,'120000000');
  assert.equal(pua[0].lootTableId,'2090000106');
  assert.equal(pua[0].lootGroupIndex,0);
  assert.equal(pua[0].nameMatch,'native_quest_code_prefix');
  assert.equal(pua[0].sourceExplicitLootQuestReferenceVerified,false);
  assert.equal(pua[0].guaranteedRewardVerified,false);
  assert.equal(pua[0].lootAcquisitionContextVerified,false);
  assert.equal(pua[0].currentQuestAvailabilityVerified,false);
  assert.deepEqual(pua[0].separateQuestItemFlowKinds,[]);
  assert.deepEqual(index.getItemCandidates(31500024).map(r=>r.questId),
    ['2070000722']);
  assert.equal(index.getQuestCandidates(2070000735)[0].nameMatch,
    'exact_native_quest_code');
  assert.equal(index.getQuestCandidates(2070001210)[0].itemId,'31201177');
  assert.equal(index.getLootTableCandidates(2090000106)[0],pua[0]);
  assert.equal(index.getLootOriginCandidate('native:path:loot:2090000106:0:0'),pua[0]);
  assert(Object.isFrozen(pua));
  assert(Object.isFrozen(pua[0]));
});

test('Unrelated story prefixes and Mission name scopes must not manufacture quest links',()=>{
  const {loot}=setup();
  const index=indexMissionLootQuestCandidates(loot,guide);
  assert.equal(index.getItemCandidates(31000013).length,0);
  assert.equal(index.getItemCandidates(31700022).length,0);
  assert.equal(index.getItemCandidates(31201085).length,0);
  assert.deepEqual(index.getQuestCandidates(2070000934),[]);
  assert.equal(index.coverage.namedCandidateRoutes,4);
  assert.equal(index.coverage.namedItemIds,4);
});

test('The public quest loader reads only first-party Guide bytes and preserves candidate status',async()=>{
  const {loot}=setup();
  let requested;
  const index=await loadMissionLootQuestCandidates(loot,'/Wand',async url=>{
    requested=url;
    const bytes=readFileSync(new URL('../static/guide/public/quest-index.json',import.meta.url));
    return {ok:true,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  });
  assert.equal(requested,'/Wand/guide/public/quest-index.json');
  assert.equal(index.getQuestCandidates(2070000723).length,1);
  await assert.rejects(loadMissionLootQuestCandidates(loot,'/../unsafe',
    async()=>({ok:false})),/INVALID_BASE_PATH/);
});

test('Unbranded quest-flow objects cannot be used as independent native corroboration',async()=>{
  const {loot}=setup();
  assert.throws(()=>indexMissionLootQuestCandidates(loot,guide,{
    verified:true,privateSource:true,publishable:false,
    getItemQuestReferences:()=>[{questId:'2070000723',itemId:'120000000',
      sourceFlow:{flowKind:'intro_item_grant_candidate'}}]
  }),/PINNED_PRIVATE_QUEST_REFERENCES_REQUIRED/);
  await assert.rejects(loadPinnedQuestItemReferenceEvidence(
    new Uint8Array([1]),new Uint8Array([1]),fakeBundle()
  ),/PINNED_SRC02_REQUIRED/);
});
