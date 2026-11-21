import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEditorReadset,inspectEditorReadset,SAVE_EDITOR_READSET_CONTRACT
} from '../src/lib/save/editor-readset.mjs';

function fixture(version=643){
  return {
    GameInfo:{Version:version,PrivateDeviceIdentifier:'NEVER_SHARE'},
    Player:{
      Account:'PRIVATE_AUTH_ACCOUNT',
      ListInventories:{
        '101101':{
          ID:101101,CompatibleItemType:'PRIVATE_GAME_CATEGORY',
          Inventory:{'550001':{Amount:7,Marker:'PRIVATE_MARKER'}}
        }
      },
      ContainerInventories:{
        '202202':{ID:202202,Size:16,ExtraSize:0,
          BelongsToPlayer:false,ParentItemID:null,
          Inventory:[{ItemID:440001,Amount:2,State:null},
            {ItemID:440002,Amount:1,State:{PrivateNested:'KEEP'}}]}
      },
      CollectionSets:[{
        CollectionDefinitionID:330001,
        GroupData:[{GroupIndex:0,State:'PRIVATE_STATE',
          GroupsCollectionItems:{'881100':{PRIVATE_VALUE:2}}}]
      }],
      AchievementsData:[{
        AchievementID:2210000001,CurAmount:0,MaxAmount:0,
        ClaimedRewardMilestone:0,State:'AchievementState_OnGoing',
        TypesCollected:[],ItemsUsed:[]
      }]
    },
    World:{
      MissionSlots:{'4':{Slots:[
        {MissionId:90000001,PrivateObject:'SENSITIVE'}
      ]}},
      QuestInfo:{MissionsCompleted:[]},
      GridCollection:{
        Grids:{'8':{
          ID:8,GridDataPath:'PRIVATE/GridData/Name',
          Objects:{'1':{ID:1,ItemID:1000002,
            State:{Private:'SENSITIVE'},X:0,Y:0}}
        }},
        DiffGrids:{'9':{
          ID:9,ModifiedObjects:{
            '42':{ID:42,ItemID:1000002,State:null}
          },
          RemovedObjects:[]
        }}
      },
      PlayerHouses:[{}]
    }
  };
}
const byId=(r,id)=>r.fields.find(row=>row.id===id);
test('source-observed editor readset retains exactly 60 public field templates without write permission',()=>{
  const d=getEditorReadset();
  assert.equal(d.schema,'wand.db05.editor-readset@1');
  assert.equal(d.fields.length,60);
  assert.equal(d.evidence.schemaVersionObserved,643);
  assert.equal(d.evidence.sourceBuildIndependentlyVerified,false);
  assert.equal(d.policy.editorWriterAuthorized,false);
  assert.equal(d.policy.unknownFieldsMustNotBeReconstructed,true);
  assert.equal(d.fields.every(f=>f.writable===false&&f.requiredInAllSaves===false),true);
  assert.equal(new Set(d.fields.map(f=>f.id)).size,60);
  assert.equal(Object.isFrozen(d),true);
  assert.equal(Object.isFrozen(d.fields[0]),true);
  assert.deepEqual(d.fields.find(x=>x.id==='container_parent_item').allowedJsonKinds,['integer','null']);
  assert.deepEqual(d.fields.find(x=>x.id==='grid_object_state').allowedJsonKinds,['object','null']);
  assert.deepEqual(d.fields.find(x=>x.id==='container_slot_state').allowedJsonKinds,['object','null']);
});
test('owner clean-style 643 and unknown future schema observe 60 field kinds without wrong Type issues',()=>{
  const a=fixture();
  const before=JSON.stringify(a);
  const x=inspectEditorReadset(a),y=inspectEditorReadset(fixture(999));
  assert.deepEqual(x,y);
  assert.equal(JSON.stringify(a),before);
  assert.equal(x.contract,SAVE_EDITOR_READSET_CONTRACT);
  assert.equal(x.knownFieldTemplateCount,60);
  assert.equal(x.status,'observed_field_kinds_only');
  assert.equal(byId(x,'container_parent_item').observed,1);
  assert.equal(byId(x,'container_parent_item').mismatched,0);
  assert.equal(byId(x,'container_slot_state').observed,2);
  assert.equal(byId(x,'container_slot_state').mismatched,0);
  assert.equal(byId(x,'grid_object_state').mismatched,0);
  assert.equal(byId(x,'diff_modified_state').mismatched,0);
  assert.equal(byId(x,'diff_removed_objects').observed,1);
  assert.equal(byId(x,'diff_removed_objects').children,0);
  assert.equal(byId(x,'list_inventory_quantity').observed,1);
  assert.equal(byId(x,'mission_id').observed,1);
  assert.equal(x.fields.some(r=>r.sampled),false);
  assert.equal(x.sourceBuildIndependentlyVerified,false);
  assert.equal(x.editorWriterAuthorized,false);
  assert.equal(x.exportAuthorized,false);
  const text=JSON.stringify(x);
  for(const hidden of [
    'PRIVATE','101101','202202','2210000001','550001','881100',
    '440001','1000002','90000001','SENSITIVE','GridData/Name'
  ]) assert.equal(text.includes(hidden),false,hidden);
  assert.equal(Object.isFrozen(x),true);
  assert.equal(Object.isFrozen(x.fields[0]),true);
});
test('legitimately absent objects in previously modified save remain unobserved, not corrupt',()=>{
  const s=fixture();
  delete s.Player.AchievementsData;
  delete s.World.MissionSlots;
  delete s.World.GridCollection.DiffGrids;
  delete s.Player.ContainerInventories;
  const r=inspectEditorReadset(s);
  assert.equal(r.status,'observed_field_kinds_only');
  assert.equal(byId(r,'achievement_id').notObserved,true);
  assert.equal(byId(r,'mission_slot_groups').notObserved,true);
  assert.equal(byId(r,'diff_grid_map').notObserved,true);
  assert.equal(byId(r,'container_map').notObserved,true);
  assert.equal(r.absentObjectsAreNotCorruption,true);
  assert.equal(r.ownerModificationsNotInferred,true);
  assert.equal(r.gameVersionIsNotShapeGate,true);
});
test('unexpected observed kind differences are only diagnostics, not Writer validation',()=>{
  const s=fixture();
  s.Player.ContainerInventories['202202'].ParentItemID='PRIVATE_BAD_ID';
  s.World.GridCollection.Grids['8'].Objects['1'].State=[];
  s.World.GridCollection.DiffGrids['9'].RemovedObjects={};
  const r=inspectEditorReadset(s);
  assert.equal(r.status,'observed_kind_difference');
  assert.equal(byId(r,'container_parent_item').mismatched,1);
  assert.equal(byId(r,'grid_object_state').mismatched,1);
  assert.equal(byId(r,'diff_removed_objects').mismatched,1);
  assert.equal(r.editorWriterAuthorized,false);
});
test('more than 16,384 nested objects marks sampling without inventing missing references',()=>{
  const s=fixture();
  const entries={};
  for(let i=0;i<16500;i++)entries[String(i)]={ID:i,ItemID:1000002,State:null};
  s.World.GridCollection.Grids['8'].Objects=entries;
  const r=inspectEditorReadset(s);
  assert.equal(r.status,'sampled_inconclusive');
  assert.equal(byId(r,'grid_object').sampled,true);
  assert.equal(byId(r,'grid_object_item').sampled,true);
  assert.equal(r.editorWriterAuthorized,false);
});
test('wrong root and invalid optional nested types fail closed or show branch issues',()=>{
  assert.throws(()=>inspectEditorReadset({}),/DB05_EDITOR_READSET_DECODED_ROOT_INVALID/);
  assert.throws(()=>inspectEditorReadset({GameInfo:{Version:643},Player:[],World:{}}),
    /DB05_EDITOR_READSET_DECODED_ROOT_INVALID/);
  const s=fixture();
  s.World.GridCollection.Grids['8'].Objects=99;
  const r=inspectEditorReadset(s);
  assert.equal(r.status,'observed_kind_difference');
  assert.ok(byId(r,'grid_object').branchTypeIssues>0);
  assert.equal(r.strictCodecRoundtripVerified,false);
});
