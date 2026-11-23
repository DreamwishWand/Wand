import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterOwnedSlots,ownedCategoryOptions,ownedSlotLocation,pendingOwnedAmount
} from '../src/lib/save/owned-slot-view.ts';

const slots=[
  {kind:'inventory',inventoryId:'100',itemId:'30000031',amount:7},
  {kind:'chest',containerId:'202',slotIndex:0,itemId:40000001,amount:1},
  {kind:'chest',containerId:'202',slotIndex:1,itemId:40000001,amount:2},
  {kind:'chest',containerId:'203',slotIndex:0,itemId:40000001,amount:3},
  {kind:'inventory',inventoryId:'100',itemId:'777',amount:9}
];
const context=(itemId,name,category,nativeCategory)=>({
  itemId,match:'current_db00',name,nameVerified:!!name,
  category,nativeCategory,contentIds:[],dlcOwnershipVerified:false,
  editingAllowedByCatalog:false
});
const metadata=new Map([
  ['30000031',context('30000031','ピュアナイトシャード',null,'ActivityItem')],
  ['40000001',context('40000001','展示用チェア','Furniture','Furniture')]
]);
const filter=(options={})=>filterOwnedSlots(slots,metadata,{
  location:'all',category:'all',query:'',...options
});

test('filtering uses real DB names and native category only as read-only display',()=>{
  assert.equal(filter({query:'ピュアナイト'}).length,1);
  assert.equal(filter({query:'展示用チェア'}).length,3);
  assert.equal(filter({query:'Furniture'}).length,3);
  assert.equal(filter({query:'ACTIVITYITEM'}).length,1);
  assert.equal(filter({query:'777'}).length,1,
    'an unknown catalog item remains selectable by numeric ID');
  assert.equal(filter({location:'chest'}).length,3);
  assert.equal(filter({location:'inventory'}).length,2);
  assert.equal(filter({query:'202 / Slot 1'}).length,1,
    'saved Chest container and exact index disambiguate identical items');
});

test('category filtering is distinct from Inventory/Chest location and has unknown fallback',()=>{
  assert.deepEqual(ownedCategoryOptions(slots,metadata),[
    {value:'category:ActivityItem',label:'ActivityItem',count:1},
    {value:'category:Furniture',label:'Furniture',count:3},
    {value:'unclassified',label:'分類未確認',count:1}
  ]);
  assert.equal(filter({category:'category:Furniture'}).length,3);
  assert.equal(filter({category:'category:Furniture',location:'inventory'}).length,0);
  assert.equal(filter({category:'category:Furniture',location:'chest'}).length,3);
  assert.equal(filter({category:'unclassified'}).length,1);
  assert.equal(filter({category:'category:Missing'}).length,0);
});

test('queued amount badges require exact native slot identities and originals',()=>{
  const changes=[
    {target:{kind:'chest',containerId:'202',slotIndex:1,itemId:40000001},
      expected:2,replacement:900},
    {target:{kind:'inventory',inventoryId:'100',itemId:'30000031'},
      expected:7,replacement:500},
    {target:{kind:'chest',containerId:'203',slotIndex:0,itemId:40000001},
      expected:4,replacement:400}
  ];
  assert.equal(pendingOwnedAmount(slots[0],changes),500);
  assert.equal(pendingOwnedAmount(slots[1],changes),null);
  assert.equal(pendingOwnedAmount(slots[2],changes),900);
  assert.equal(pendingOwnedAmount(slots[3],changes),null,
    'mismatching expected Amount must not mark stale target as queued');
  assert.equal(pendingOwnedAmount(slots[4],changes),null);
  assert.equal(ownedSlotLocation(slots[2]),'Chest 202 / Slot 1');
  assert.equal(ownedSlotLocation(slots[0]),'Inventory 100');
});
