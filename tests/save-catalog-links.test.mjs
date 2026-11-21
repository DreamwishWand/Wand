import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldCatalog } from '../src/lib/world/catalog.mjs';
import {
  createSaveSourceCatalogBridge, getSaveCatalogLinkRules
} from '../src/lib/save/registry.mjs';

const sha='a'.repeat(64);
function db01(version='1.26.2',custom=null) {
  const lookups=[];
  const rows=new Map([
    [40000001,{itemId:40000001,catalogDomain:'item',nativeCategory:'Furniture'}],
    [40000002,{itemId:40000002,catalogDomain:'definition_unclassified',nativeCategory:'Mount'}]
  ]);
  return {
    source:{privateOnly:true,gameVersion:version,nativeSourceManifestSha256:sha},
    lookups,
    async getItem(id) {
      lookups.push(id);
      if(custom) return custom(id);
      return rows.get(id)??null;
    }
  };
}
function db04(version='1.26.1') {
  return createWorldCatalog({
    manifest:{schema:'wand.db04.world@1',status:'partial_game_native_evidence',gameVersion:version},
    objects:[{itemId:40000001,nativeType:'Furniture',footprint:null}],
    scenes:[{sceneId:1540000000,nativeName:'synthetic scene'}],
    grids:[{gridId:'GridData/Villages/Meadow.json',nativeFloorTypePalette:[]}],
    layouts:[],worlds:[],areas:[],layoutObjects:[]
  });
}
function save(version=643) {
  return {
    GameInfo:{Version:version},
    Player:{
      ContainerInventories:{'8':{ID:8,Inventory:[{ItemID:40000001,Amount:5},{ItemID:0,Amount:0}]}},
      ListInventories:{'1':{Inventory:{'40000001':{Amount:1}}}},
      CollectionSets:[{GroupData:[{GroupsCollectionItems:{'40000002':true}}]}],
      Mounts:[{MountItemID:40000002}]
    },
    World:{
      GridCollection:{
        Grids:{'0':{ID:0,GridDataPath:'GridData/Villages/Meadow.json',
          Objects:{'7':{ID:7,ItemID:40000001}}}},
        DiffGrids:{'10':{ID:10,ModifiedObjects:{'3':{ID:3,ItemID:40000003}}}}
      },
      Villages:[{SceneItemId:1540000000}]
    }
  };
}
function family(report,id) {return report.families.find(row=>row.id===id);}

test('eight public native source link rules exist in frozen read-only contract',()=>{
  const r=getSaveCatalogLinkRules();
  assert.equal(r.schema,'wand.db05.db01-db04-join-rules@1');
  assert.equal(r.families.length,8);
  assert.ok(Object.isFrozen(r.families));
  assert.ok(Object.isFrozen(r.families[0]));
  assert.equal(r.policy.db04GridIdIsNativeSourcePathNotSaveNumericGridId,true);
  assert.equal(r.policy.writerAuthorized,false);
  assert.equal(r.policy.sourceGameVersionEqualityIsNotProof,true);
});

test('DB-01 private ID-bucket loader and DB-04 world object links stay partial and private',async()=>{
  const items=db01(),world=db04(),bridge=createSaveSourceCatalogBridge(items,world);
  assert.equal(bridge.contract,'wand.db05.db01-db04-readonly-link@1');
  assert.equal(bridge.source.sourceVersionLabelsEqual,false);
  const matched=await bridge.lookupItem(40000001);
  assert.equal(matched.classification,'both_partial_catalogs_candidate');
  assert.equal(matched.db01Item.nativeCategory,'Furniture');
  assert.equal(matched.db04WorldObject.nativeType,'Furniture');
  assert.equal(matched.ownershipVerified,false);
  assert.equal(matched.writerAuthorized,false);
  assert.equal((await bridge.lookupItem(40000002)).classification,'db01_id_candidate');
  assert.equal((await bridge.lookupItem(40000003)).classification,'unresolved_in_partial_catalogs');
  assert.deepEqual(items.lookups,[40000001,40000002,40000003]);
  await bridge.lookupItem(40000001);
  assert.deepEqual(items.lookups,[40000001,40000002,40000003]);
});

test('synthetic 626/643 save audits eight domains without leaking IDs or grid source paths',async()=>{
  for(const version of [626,643]){
    const items=db01(), bridge=createSaveSourceCatalogBridge(items,db04());
    const report=await bridge.auditSave(save(version));
    assert.equal(report.contract,'wand.db05.db01-db04-redacted-audit@1');
    assert.equal(report.examinedFamilies,8);
    assert.equal(report.families.length,8);
    assert.equal(report.distinctItemIdsExamined,3);
    assert.deepEqual(items.lookups.slice().sort((a,b)=>a-b),[40000001,40000002,40000003]);
    assert.equal(family(report,'chest_item').zeroSentinels,1);
    assert.equal(family(report,'chest_item').matched,1);
    assert.equal(family(report,'inventory_item_key').matched,1);
    assert.equal(family(report,'collection_item_key').unclassifiedDefinitions,1);
    assert.equal(family(report,'placed_grid_object_item').bothCatalogsMatch,1);
    assert.equal(family(report,'modified_grid_object_item').unresolvedInPartialCatalog,1);
    assert.equal(family(report,'mount_item').db01Matches,1);
    assert.equal(family(report,'village_scene').db04Matches,1);
    assert.equal(family(report,'native_grid_source_path').db04Matches,1);
    assert.equal(report.status,'partial_catalog_unresolved');
    assert.equal(report.sourceMismatchObserved,true);
    assert.equal(report.catalogCoverageComplete,false);
    assert.equal(report.writerAuthorized,false);
    assert.equal(report.sourceAndSaveJointlyVerified,false);
    const output=JSON.stringify(report);
    for(const token of ['40000001','40000002','40000003','1540000000',
      'GridData/Villages/Meadow.json', '"8"', 'synthetic scene'])
      assert.equal(output.includes(token),false,token);
  }
});

test('unknown item in the partial catalog never means save corruption or no entitlement',async()=>{
  const bridge=createSaveSourceCatalogBridge(db01(),db04());
  const result=await bridge.auditSave(save());
  assert.equal(family(result,'modified_grid_object_item').status,'partial_catalog_unresolved');
  assert.equal(result.ownershipVerified,false);
  assert.equal(result.allExistingItemsVerified,false);
  assert.equal(result.exportAuthorized,false);
});

test('DB-04 grid identities are exact asset paths, not numerically equal save IDs',async()=>{
  const bridge=createSaveSourceCatalogBridge(db01(),db04());
  const doc=save();
  doc.World.GridCollection.Grids['0'].GridDataPath='0';
  const first=await bridge.auditSave(doc);
  assert.equal(family(first,'native_grid_source_path').matched,0);
  assert.equal(family(first,'native_grid_source_path').unresolvedInPartialCatalog,1);
  doc.World.GridCollection.Grids['0'].GridDataPath='GridData/Villages/Meadow.JSON';
  const second=await bridge.auditSave(doc);
  assert.equal(family(second,'native_grid_source_path').matched,0);
  doc.World.GridCollection.Grids['0'].GridDataPath='GridData/Villages/Meadow.json';
  const third=await bridge.auditSave(doc);
  assert.equal(family(third,'native_grid_source_path').matched,1);
});

test('malformed dynamic keys and secret values are only counted, never serialized',async()=>{
  const bridge=createSaveSourceCatalogBridge(db01(),db04());
  const doc=save();
  doc.Player.ListInventories['1'].Inventory['PRIVATE_USER_KEY']={Amount:10};
  doc.Player.ListInventories['1'].Inventory['040000001']={Amount:10};
  doc.World.GridCollection.Grids['0'].Objects['PRIVATE_PLACEMENT']={
    ID:'SECRET_SAVE_ID',ItemID:'SECRET_SAVE_ITEM'
  };
  doc.World.UnexpectedPersonalSecret='SECRET_ACCOUNT_CONTENT';
  const before=JSON.stringify(doc);
  const report=await bridge.auditSave(doc);
  assert.equal(JSON.stringify(doc),before);
  assert.equal(family(report,'inventory_item_key').malformed,2);
  assert.equal(family(report,'placed_grid_object_item').malformed,1);
  assert.equal(family(report,'placed_grid_object_item').status,'observed_type_issue');
  assert.equal(report.status,'observed_type_issue');
  const serialized=JSON.stringify(report);
  for(const privateText of ['PRIVATE_USER_KEY','040000001','PRIVATE_PLACEMENT',
      'SECRET_SAVE_ID','SECRET_SAVE_ITEM','SECRET_ACCOUNT_CONTENT'])
    assert.equal(serialized.includes(privateText),false);
});

test('both cap types prevent unbounded private disk IO and report incomplete coverage',async()=>{
  const items=db01(),bridge=createSaveSourceCatalogBridge(items,db04());
  const doc=save();
  const extra=doc.Player.ListInventories['1'].Inventory;
  for(let i=0;i<50;i++)extra[String(60000000+i)]={Amount:i};
  const limited=await bridge.auditSave(doc,{maxPerFamily:4,maxDistinctItemLookups:1});
  assert.ok(family(limited,'inventory_item_key').sampled);
  assert.equal(family(limited,'inventory_item_key').status,'sampled_inconclusive');
  assert.ok(limited.distinctItemIdsUnexamined>0);
  assert.equal(items.lookups.length,1);
  assert.equal(limited.catalogCoverageComplete,false);
  await assert.rejects(bridge.auditSave(doc,{maxPerFamily:10000}),/DB05_CATALOG_AUDIT_LIMIT_INVALID/);
  await assert.rejects(bridge.auditSave(doc,{maxDistinctItemLookups:500}),/DB05_CATALOG_AUDIT_LIMIT_INVALID/);
});

test('same game version labels still cannot grant source or writer compatibility',async()=>{
  const bridge=createSaveSourceCatalogBridge(db01('1.26.2'),db04('1.26.2'));
  assert.equal(bridge.source.sourceVersionLabelsEqual,true);
  assert.equal(bridge.source.crossCatalogProvenanceVerified,false);
  const result=await bridge.auditSave(save(626));
  assert.equal(result.sourceMismatchObserved,false);
  assert.equal(result.source.sourceAndSaveJointlyVerified,false);
  assert.equal(result.placementPermissionVerified,false);
  assert.equal(result.ownershipVerified,false);
  assert.equal(result.writerAuthorized,false);
});

test('client validation, bad decoded roots and bad private ID responses fail closed',async()=>{
  assert.throws(()=>createSaveSourceCatalogBridge({},db04()),/DB05_PRIVATE_DB01_CLIENT_REQUIRED/);
  assert.throws(()=>createSaveSourceCatalogBridge(db01(),{}),/DB05_PARTIAL_DB04_CATALOG_REQUIRED/);
  const bridge=createSaveSourceCatalogBridge(db01(),db04());
  await assert.rejects(bridge.auditSave({GameInfo:{Version:643},Player:{},World:[]}),
    /DB05_SAVE_ROOT_STRUCTURE_INVALID/);
  for(const invalid of [0,-1,'40000001',NaN,Number.MAX_SAFE_INTEGER+1]) {
    await assert.rejects(bridge.lookupItem(invalid),/DB05_EXACT_POSITIVE_ITEM_ID_REQUIRED/);
  }
  const malicious=db01('1.26.2',async()=>{throw new Error('PRIVATE_129995_ITEM_PATH');});
  const guarded=createSaveSourceCatalogBridge(malicious,db04());
  await assert.rejects(guarded.lookupItem(40000001),error=>{
    assert.equal(error.message,'DB05_PRIVATE_DB01_LOOKUP_FAILED');
    assert.equal(error.message.includes('PRIVATE_129995_ITEM_PATH'),false);
    return true;
  });
  const wrong=db01('1.26.2',async()=>({itemId:123,catalogDomain:'item'}));
  await assert.rejects(createSaveSourceCatalogBridge(wrong,db04()).lookupItem(40000001),
    /DB05_DB01_ITEM_ID_MISMATCH/);
});
