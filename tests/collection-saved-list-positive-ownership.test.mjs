import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVED_LIST_OWNERSHIP_CONTRACT,
  sanitizePositiveListInventoryOwnership
} from '../src/lib/collection/saved-list-positive-ownership.ts';
import {projectSavedPositiveListInventory as projectPositiveListInventoryOwnership}
  from './helpers/rust-collection-discovery.mjs';

const role=(id,type,Inventory)=>({ID:id,CompatibleItemType:type,Inventory});
const save=(ListInventories,Version=643)=>({
  GameInfo:{Version},
  Player:{Secret:'private-player',ListInventories},
  World:{privateFields:'not-forwarded'}
});

test('only explicitly positive ListInventory Amount imports as owned candidate, never missing',async()=>{
  const root=save({
    '0':role(0,'Furniture',{
      '40005160':{Amount:2,Marker:'Favorite'},
      '40006110':{Amount:0,Marker:'IsNew'},
      '40005161':{Amount:1,Marker:'Hidden'}
    }),
    '1':role(1,5,{'50000001':{Amount:1}}),
    '2':role(2,'ActivityItem',{'30200221':{Amount:10}}),
    '4':role(4,16,{'160000001':{Amount:1}}),
    '7':role(7,'Skin',{'170000001':{Amount:100}})
  });
  const original=structuredClone(root);
  const got=await projectPositiveListInventoryOwnership(root);
  assert.deepEqual(root,original);
  assert.equal(got.contract,SAVED_LIST_OWNERSHIP_CONTRACT);
  assert.equal(got.status,'positive_stock_observed');
  assert.equal(got.saveSchema,643);
  assert.equal(got.positiveReferences,6);
  assert.equal(got.zeroReferences,1);
  assert.equal(got.inspectedRoles,5);
  assert.equal(got.matchedRoles,5);
  assert.equal(got.missingStatusInferred,false);
  assert.equal(got.zeroAmountMeansMissing,false);
  assert.deepEqual(got.entries,[
    {itemId:30200221,role:'ActivityItem'},
    {itemId:40005160,role:'Furniture'},
    {itemId:40005161,role:'Furniture'},
    {itemId:50000001,role:'Clothing'},
    {itemId:160000001,role:'Trimming'},
    {itemId:170000001,role:'Skin'}
  ]);
  const json=JSON.stringify(got);
  assert.ok(!json.includes('private-player'));
  assert.ok(!json.includes('privateFields'));
  assert.ok(!json.includes('Marker'));
  assert.ok(!json.includes('Favorite'));
  assert.ok(!json.includes('"Amount":'));
  assert.deepEqual(sanitizePositiveListInventoryOwnership(structuredClone(got)),got);
});

test('12 native ListInventory roles are recognized with compatible type and canonical ID',async()=>{
  const cases=[
    [0,'Furniture',4,40005160],
    [1,'Clothing',5,50000001],
    [2,'ActivityItem',3,30200221],
    [3,'Makeup',14,140000001],
    [4,'Trimming',16,160000001],
    [5,'Building',2,20000001],
    [7,'Skin',17,170000001],
    [8,'BoardGame',18,180000001],
    [9,'AvatarFeature',7,70100024],
    [10,'PhotoMode',19,190000023],
    [11,'MountGear',21,210600006],
    [12,'Environment',6,60000001]
  ];
  const map={};
  for(const [key,type,itemType,id] of cases) {
    map[String(key)]=role(key,key%2===0?type:itemType,{
      [id]:{Amount:2,Marker:'private marker'}
    });
  }
  // Role 6 has both collectible Decal and non-collectible Texture
  // definitions under the same ItemType 10; without concrete type evidence
  // it is explicitly excluded from automatic ownership inference.
  map['6']=role(6,'TouchOfMagic',{'100000731':{Amount:8}});
  const got=await projectPositiveListInventoryOwnership(save(map));
  assert.equal(got.status,'positive_stock_observed');
  assert.equal(got.inspectedRoles,12);
  assert.equal(got.matchedRoles,12);
  assert.equal(got.positiveReferences,12);
  assert.equal(got.entries.length,12);
  assert.deepEqual(got.entries,
    cases.map(([,type,,id])=>({itemId:id,role:type})).sort((a,b)=>a.itemId-b.itemId));
  assert.ok(!got.entries.some(row=>row.role==='TouchOfMagic'));
  assert.deepEqual(sanitizePositiveListInventoryOwnership(got),got);
});

test('role-mismatched native amount, even positive, must not become owned',async()=>{
  const actual=await projectPositiveListInventoryOwnership(save({
    '3':role(3,'Makeup',{'140000001':{Amount:0},'140000002':{Amount:4}}),
    '9':role(9,'AvatarFeature',{'70000001':{Amount:-1}}),
    '11':role(11,'MountGear',{'190000023':{Amount:1}})
  }));
  assert.equal(actual.status,'partial_inconclusive');
  assert.deepEqual(actual.entries,[{itemId:140000002,role:'Makeup'}]);
  assert.equal(actual.zeroReferences,1);
  assert.equal(actual.invalidReferences,2);
  assert.deepEqual(sanitizePositiveListInventoryOwnership(actual),actual);
});

test('zero, missing and untrusted amounts leave manual status untouched',async()=>{
  const got=await projectPositiveListInventoryOwnership(save({
    '0':role(0,'Furniture',{
      '40005160':{Amount:0},
      '40005161':{Marker:'Hidden'},
      '40005162':{Amount:-1},
      '40005163':{Amount:1.5},
      '40005164':{Amount:'5'},
      '40005165':{Amount:2147483648},
      '50000001':{Amount:1},
      '040005160':{Amount:1}
    })
  }));
  assert.equal(got.status,'partial_inconclusive');
  assert.equal(got.zeroReferences,1);
  assert.equal(got.invalidReferences,7);
  assert.deepEqual(got.entries,[]);
  assert.deepEqual(sanitizePositiveListInventoryOwnership(got),got);
});

test('role descriptors are required, and unknown/changed inventories are not claimed owned',async()=>{
  const got=await projectPositiveListInventoryOwnership(save({
    '0':role(0,'Clothing',{'40005160':{Amount:1}}),
    '1':role(99,'Clothing',{'50000001':{Amount:1}}),
    '2':{ID:2,Inventory:{'30200221':{Amount:1}}},
    '4':role(4,'Trimming',{'160000001':{Amount:3}})
  }));
  assert.equal(got.status,'partial_inconclusive');
  assert.equal(got.unverifiedRoles,3);
  assert.deepEqual(got.entries,[{itemId:160000001,role:'Trimming'}]);
  assert.deepEqual(sanitizePositiveListInventoryOwnership(got),got);
});

test('unsupported schema, absent inventory and empty observed inventory never fabricate missing',async()=>{
  const cases=[
    [save({'0':role(0,'Furniture',{'40005160':{Amount:1}})},999),'unsupported_schema'],
    [{GameInfo:{Version:643},Player:{},World:{}},'not_observed'],
    [save([]),'incompatible_structure'],
    [save({'0':role(0,'Furniture',{})}),'observed_no_positive_stock'],
    [save({'1':role(1,'Clothing',{'50000001':{Amount:2}})},624),'positive_stock_observed']
  ];
  for(const [source,status] of cases) {
    const got=await projectPositiveListInventoryOwnership(source);
    assert.equal(got.status,status);
    assert.equal(got.missingStatusInferred,false);
    assert.deepEqual(sanitizePositiveListInventoryOwnership(got),got);
  }
});

test('strict worker sanitizer strips private fields and rejects forged ownership signals',async()=>{
  const base=await projectPositiveListInventoryOwnership(save({
    '0':role(0,'Furniture',{'40005160':{Amount:2}})
  }));
  const annotated=structuredClone(base);
  annotated.privateAccount='not-forwarded';
  const clean=sanitizePositiveListInventoryOwnership(annotated);
  assert.equal(Object.hasOwn(clean,'privateAccount'),false);
  for(const edit of [
    x=>{x.entries[0].Amount=100;},
    x=>{x.entries[0].role='Clothing';},
    x=>{x.entries[0].itemId=40005161.5;},
    x=>{x.positiveReferences=0;},
    x=>{x.missingStatusInferred=true;},
    x=>{x.saveSchema=999;},
    x=>{x.status='observed_no_positive_stock';}
  ]){
    const forged=structuredClone(base);
    edit(forged);
    assert.throws(()=>sanitizePositiveListInventoryOwnership(forged),
      /SAVED_LIST_OWNERSHIP_INVALID_WORKER_REPLY/);
  }
});
