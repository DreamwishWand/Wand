import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSaveDiagnosticView, makeSaveCatalogAuditView,
  SAVE_DIAGNOSTIC_VIEW_CONTRACT } from '../src/lib/save/diagnostic-view.mjs';

function fixture(version=643){
  return {
    GameInfo:{Version:version},
    Player:{ContainerInventories:{'23':{ID:23,Inventory:[{ItemID:40000001,Amount:7}]}}},
    World:{GridCollection:{
      Grids:{'10':{ID:10,Objects:{
        '62':{ID:62,ItemID:40000001,State:{Storage:{ContainerInventoryID:23}}}
      }}},
      DiffGrids:{}
    }}
  };
}

test('developer diagnostic view is bounded, anonymous and read-only for both 626 and 643',()=>{
  for(const version of [626,643]){
    const decoded=fixture(version);
    const before=JSON.stringify(decoded);
    const view=makeSaveDiagnosticView(decoded);
    assert.equal(view.contract,SAVE_DIAGNOSTIC_VIEW_CONTRACT);
    assert.equal(view.knownPublicTemplates,440);
    assert.equal(view.referenceRules.length,14);
    assert.equal(view.rootValid,true);
    assert.equal(view.writerAuthorized,false);
    assert.equal(view.exportAuthorized,false);
    assert.equal(view.strictDecoderVerified,false);
    assert.equal(view.referenceClosureVerified,false);
    assert.equal(view.privateIdsIncluded,false);
    assert.equal(view.privateValuesIncluded,false);
    assert.equal(Object.isFrozen(view),true);
    assert.equal(Object.isFrozen(view.referenceRules[0]),true);
    assert.equal(JSON.stringify(decoded),before);
    const text=JSON.stringify(view);
    for(const secret of ['40000001','\"62\"','\"23\"']) assert.equal(text.includes(secret),false);
    const storage=view.referenceRules.find(r=>r.id==='placed_storage_to_container');
    assert.equal(storage.observed,1);
    assert.equal(storage.resolved,1);
  }
});

test('type-conflict counts and absent target indexes are distinguished',()=>{
  const decoded=fixture();
  decoded.Player.ContainerInventories['23'].ID=24;
  decoded.World.GridCollection.Grids['10'].Objects['62'].State.Storage.ContainerInventoryID=99999999;
  const view=makeSaveDiagnosticView(decoded);
  assert.equal(view.referenceStatus,'observed_anomaly');
  const key=view.referenceRules.find(row=>row.id==='container_key_identity');
  assert.equal(key.unresolved,1);
  const storage=view.referenceRules.find(row=>row.id==='placed_storage_to_container');
  assert.equal(storage.unresolved,1);
  assert.equal(JSON.stringify(view).includes('99999999'),false);
});

test('missing or malformed decoded root fails without echoing private values',()=>{
  for(const bad of [
    null,{},{GameInfo:{Version:643},Player:{},World:[]},
    {GameInfo:{Version:'PRIVATE_ACCOUNT'},Player:{},World:{}},
    {GameInfo:{Version:643},Player:[],World:{}}
  ]) assert.throws(()=>makeSaveDiagnosticView(bad),/DB05_DIAGNOSTIC_DECODED_ROOT_REQUIRED/);
});

test('unrecognized private paths and arbitrary personal values never enter browser diagnostics',()=>{
  const input=fixture();
  input.Player.AccountSecret='DO_NOT_ECHO_ACCOUNT_TOKEN';
  input.Player.ContainerInventories['private-key']={ID:23,Inventory:[]};
  input.World.GridCollection.Grids['10'].Objects['private-map-key']={
    ID:99,State:{Storage:{ContainerInventoryID:23}}};
  const view=makeSaveDiagnosticView(input), text=JSON.stringify(view);
  for(const secret of ['DO_NOT_ECHO_ACCOUNT_TOKEN','private-key','private-map-key'])
    assert.equal(text.includes(secret),false);
  assert.equal(view.privateValuesIncluded,false);
});

test('catalog view strips item IDs, raw native file paths and user-supplied source metadata',()=>{
  const report={
    contract:'wand.db05.db01-db04-redacted-audit@1',
    status:'partial_catalog_unresolved',
    source:{sourceVersionLabelsEqual:false,privatePath:'/private/save/SECRET_ACCOUNT'},
    families:[
      {id:'chest_item',observed:3,matched:2,
        unresolvedInPartialCatalog:1,db01Matches:2,db04Matches:1,
        notLookedUp:0,malformed:0,status:'partial_catalog_unresolved',
        actualItemId:'PRIVATE_40000001',nativeAssetPath:'GridData/PRIVATE.json'},
      {id:'PRIVATE_USER_DEFINED_FAMILY',observed:999,
        status:'private-source-data',rawAccountId:'PRIVATE_ACCOUNT'}
    ]
  };
  const view=makeSaveCatalogAuditView(report),text=JSON.stringify(view);
  assert.equal(view.contract,'wand.db05.browser-redacted-catalog-view@1');
  assert.equal(view.families.length,8);
  const chest=view.families.find(row=>row.id==='chest_item');
  assert.equal(chest.matched,2);
  assert.equal(chest.unresolved,1);
  assert.equal(chest.status,'partial_catalog_unresolved');
  assert.equal(view.sourceJointlyVerified,false);
  assert.equal(view.writerAuthorized,false);
  assert.equal(view.exportAuthorized,false);
  for(const secret of ['PRIVATE_40000001','GridData/PRIVATE.json','PRIVATE_ACCOUNT',
    '/private/save','PRIVATE_USER_DEFINED_FAMILY','rawAccountId'])
    assert.equal(text.includes(secret),false,secret);
});

test('unsupported catalog reports and negative or unbounded counts are sanitized',()=>{
  assert.throws(()=>makeSaveCatalogAuditView({}),/DB05_CATALOG_AUDIT_CONTRACT_REQUIRED/);
  const input={contract:'wand.db05.db01-db04-redacted-audit@1',
    status:'UNSAFE_UNKNOWN_STATUS',families:[{
      id:'mount_item',status:'PRIVATE_VALUE',observed:-2,
      matched:9999999999999999,db01Matches:2,db04Matches:0,unresolvedInPartialCatalog:0
    }]};
  const view=makeSaveCatalogAuditView(input);
  assert.equal(view.status,'inconclusive');
  assert.equal(view.families.find(x=>x.id==='mount_item').observed,0);
  assert.equal(view.families.find(x=>x.id==='mount_item').matched,0);
  assert.equal(view.families.find(x=>x.id==='mount_item').status,'inconclusive');
  assert.equal(JSON.stringify(view).includes('PRIVATE_VALUE'),false);
});
