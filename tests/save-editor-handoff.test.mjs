import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSaveEditorHandoff,inspectSaveEditorHandoff,
  SAVE_EDITOR_HANDOFF_CONTRACT
} from '../src/lib/save/editor-handoff.mjs';

function profile(version=643){
  return {
    GameInfo:{Version:version,PrivatePlatformToken:'PRIVATE_PLATFORM_TOKEN'},
    Player:{
      AccountSecret:'USER_SECRET_NEVER_LEAK',
      ListInventories:{'611111111':{Inventory:{
        '812345678':{Amount:1,Marker:'PRIVATE_MARKER'}
      }}},
      ContainerInventories:{'622222222':{ID:622222222,Size:10,
        ParentItemID:null,Inventory:[{ItemID:833333333,Amount:2,
          State:null}]}},
      CollectionSets:[{GroupData:[{
        GroupsCollectionItems:{'899999999':{State:'UNKNOWN_PRIVATE'}}
      }]}],
      AchievementsData:[{AchievementID:2110000001,CurAmount:0,
        State:'PRIVATE_ON_GOING'}]
    },
    World:{
      MissionSlots:{'71':{Slots:[{MissionId:2110000002}]}},
      GridCollection:{
        Grids:{'10':{ID:10,GridDataPath:'GridData/PRIVATE_UNKNOWN.json',
          Objects:{'20':{ID:20,ItemID:922222222,State:null}}}},
        DiffGrids:{'30':{ID:30,ModifiedObjects:{
          '40':{ID:40,ItemID:922222222,State:null}
        },RemovedObjects:[]}}
      },
      PlayerHouses:[]
    }
  };
}
const link=(r,id)=>r.catalogCandidates.find(x=>x.id===id);
test('public editor handoff is exact 60+14+8+1 backed native candidate model',()=>{
 const x=getSaveEditorHandoff();
 assert.equal(x.schema,SAVE_EDITOR_HANDOFF_CONTRACT);
 assert.equal(x.handoffScope.expectedReadsetTemplates,60);
 assert.equal(x.handoffScope.expectedReferenceRules,14);
 assert.equal(x.handoffScope.expectedExistingCandidateLinks,8);
 assert.equal(x.handoffScope.expectedUnverifiedReadsetOnlyCandidates,1);
 assert.equal(x.links.length,9);
 assert.equal(x.safety.editorWriterAuthorized,false);
 assert.equal(x.safety.exportAuthorized,false);
 assert.equal(x.safety.sourceCatalogCoverageComplete,false);
 assert.equal(x.safety.byteExactP1gRoundtripVerified,false);
 assert.equal(x.links.every(r=>r.writable===false&&r.joinStrength==='candidate_only'),true);
 assert.equal(x.handoffScope.deferredCatalogFamilies.includes('mount_item'),true);
 assert.equal(x.handoffScope.deferredCatalogFamilies.includes('village_scene'),true);
 const world=x.links.find(r=>r.id==='native_grid_source_path');
 assert.equal(world.catalog,'DB-04');
 assert.equal(world.fieldId,'grid_source_path');
 assert.equal(x.links.some(r=>r.fieldId==='grid_identity'&&r.catalog==='DB-04'),false);
 const nullable=x.links.find(r=>r.id==='container_parent_item');
 assert.equal(nullable.sourceFamily,null);
 assert.equal(nullable.evidence,'readset_candidate_only_no_proven_catalog_join');
 assert.equal(Object.isFrozen(x),true);
 assert.equal(Object.isFrozen(x.links[0]),true);
});
test('version-neutral anonymous editor handoff sees only source candidate presence',()=>{
 const a=profile(643),before=JSON.stringify(a);
 const x=inspectSaveEditorHandoff(a);
 const y=inspectSaveEditorHandoff(profile(626));
 assert.deepEqual(x,y);
 assert.equal(JSON.stringify(a),before);
 assert.equal(x.contract,SAVE_EDITOR_HANDOFF_CONTRACT);
 assert.equal(x.status,'read_only_evidence');
 assert.equal(x.registeredEditorFields,60);
 assert.equal(x.referenceGraph.fixedRules,14);
 assert.equal(x.catalogCandidates.length,9);
 assert.equal(link(x,'inventory_item_key').status,'candidate_field_observed');
 assert.equal(link(x,'chest_item').status,'candidate_field_observed');
 assert.equal(link(x,'collection_item_key').status,'candidate_field_observed');
 assert.equal(link(x,'placed_grid_object_item').status,'candidate_field_observed');
 assert.equal(link(x,'modified_grid_object_item').status,'candidate_field_observed');
 assert.equal(link(x,'native_grid_source_path').status,'candidate_field_observed');
 assert.equal(link(x,'active_mission_slot').status,'candidate_field_observed');
 assert.equal(link(x,'achievement_duty_id').status,'candidate_field_observed');
 assert.equal(link(x,'container_parent_item').status,'candidate_field_observed');
 assert.equal(x.catalogCandidates.every(r=>!r.sourceIdMatchVerified&&!r.writerAuthorized),true);
 assert.equal(x.candidateCatalogSourceVerificationExternallyRequired,true);
 assert.equal(x.saveWriterAuthorized,false);
 assert.equal(x.exportAuthorized,false);
 assert.equal(x.originalP1gRoundtripVerified,false);
 assert.equal(x.losslessUnknownFieldPreservationVerified,false);
 assert.equal(x.unknownFieldsMustRemainUnmodified,true);
 assert.equal(Object.isFrozen(x),true);
 assert.equal(Object.isFrozen(x.referenceGraph),true);
 const publicJson=JSON.stringify(x);
 for(const privatePart of ['USER_SECRET','PRIVATE_','611111111','622222222',
  '812345678','833333333','899999999','922222222','2110000001',
  '2110000002','GridData/PRIVATE_UNKNOWN']){
   assert.equal(publicJson.includes(privatePart),false,privatePart);
 }
});
test('owner-deleted missions and world objects remain missing optional evidence',()=>{
 const save=profile();
 delete save.World.MissionSlots;
 delete save.World.GridCollection.DiffGrids;
 delete save.Player.AchievementsData;
 const r=inspectSaveEditorHandoff(save);
 assert.equal(link(r,'active_mission_slot').status,'not_observed');
 assert.equal(link(r,'achievement_duty_id').status,'not_observed');
 assert.equal(link(r,'modified_grid_object_item').status,'not_observed');
 assert.equal(r.missingObjectsAreNotCorruption,true);
 assert.equal(r.defaultDiffGridsAreNotPlayerEdits,true);
 assert.equal(r.saveWriterAuthorized,false);
});
test('unexpected optional field shape is only a diagnostic',()=>{
 const save=profile(999);
 save.Player.ContainerInventories['622222222'].ParentItemID='PRIVATE_INVALID_KIND';
 save.World.GridCollection.Grids['10'].GridDataPath=123;
 const r=inspectSaveEditorHandoff(save);
 assert.equal(r.status,'observed_kind_difference');
 assert.equal(link(r,'container_parent_item').status,'observed_kind_difference');
 assert.equal(link(r,'native_grid_source_path').status,'observed_kind_difference');
 assert.equal(r.gameVersionIsNotCompatibilityGate,true);
 assert.equal(r.saveWriterAuthorized,false);
});
test('invalid decoded root is rejected without making compatibility claims',()=>{
 for(const invalid of [null,{}, {GameInfo:{Version:643},Player:[],World:{}}]){
   assert.throws(()=>inspectSaveEditorHandoff(invalid),
     /DB05_EDITOR_HANDOFF_STRICT_ROOT_REQUIRED/);
 }
});
