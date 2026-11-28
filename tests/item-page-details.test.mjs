import test from 'node:test';
import assert from 'node:assert/strict';
import {usableItemName,displayItemName} from '../src/lib/items/display-name.ts';
import {itemPageNativeFacts,readItemPageRelations} from '../src/lib/items/item-page-details.ts';
test('source dimensions and explicit energy retain absent/zero distinctions',()=>{
  assert.deepEqual(itemPageNativeFacts({nativeCategory:'Furniture',sourceAttributes:{GridAreaData:{SizeX:2,SizeY:3},ManaRecovered:5}}),{footprint:{x:2,y:3},energy:null});
  assert.deepEqual(itemPageNativeFacts({nativeCategory:'ActivityItem',sourceAttributes:{ManaRecovered:0}}),{footprint:null,energy:0});
  assert.deepEqual(itemPageNativeFacts({nativeCategory:'Building',sourceAttributes:{GridAreaData:{SizeX:2}}}),{footprint:null,energy:null});
});
test('series tiles resolve exact set edges and omit unverified and technical definitions',async()=>{
  const db={getItemReferences:async()=>[[10,'sourceSetItemId'],[11,'sourceSetItemId'],[12,'sourceSetItemId'],[13,'sourceSetItemId'],[14,'tags[0].id'],[11,'sourceSetItemId']],
    getItemFields:async ids=>ids.map(id=>({itemId:id,values:{definitionScope:id===12?'other_definition':'item_definition',nameVerified:id!==13,'names.en':id===13?'{DoNotTranslate}':'Name '+id}}))};
  const result=await readItemPageRelations(db,{itemId:10,sourceSetItemId:100,nativeCategory:'Furniture'},'en');
  assert.deepEqual(result,{series:[{itemId:11,name:'Name 11'}],recipeResults:[],parent:[],styles:[],gear:[],partial:false});
});

test('public labels preserve partial localization and reject source markers, not ordinary names',()=>{
  assert.equal(displayItemName({ja:null,en:'Bench'},'ja'),'Bench');
  assert.equal(displayItemName({ja:null,en:null,fr:'Banc'},'ja'),'Banc');
  assert.equal(displayItemName({ja:'{Placeholder}',en:'  '},'ja'),null);
  assert.equal(usableItemName('2 × 2 Table'),true);
});

import {resolveNativeParent,readNativeEntityRelations} from '../src/lib/items/native-entity-parent.ts';
test('native entity links refuse wrong types and conflicting parents',()=>{
 const types=new Map([[1,{nativeType:'Character',code:0}],[2,{nativeType:'Companion',code:3}],[3,{nativeType:'Character',code:0}]]);
 assert.equal(resolveNativeParent({nativeType:'Skin',code:0},{'source.CharacterItemID':1,'source.BaseItemID':2},types),1);
 assert.equal(resolveNativeParent({nativeType:'Skin',code:0},{'source.CharacterItemID':1,'source.BaseItemID':3},types),null);
 assert.equal(resolveNativeParent({nativeType:'MountGear',code:0},{'source.MountItemID':2},types),2);
 assert.equal(resolveNativeParent({nativeType:'Skin',code:4},{'source.BaseItemID':1},types),null);
});
test('reverse lookup verifies source fields and separates mount styles and gear',async()=>{
 const records=new Map([[2,{nativeCategory:'Companion','itemType.subtypeCode':3}],[4,{nativeCategory:'Skin','itemType.subtypeCode':4,'source.MountItemID':2}],[5,{nativeCategory:'MountGear','itemType.subtypeCode':0,'source.BaseItemID':2}],[6,{nativeCategory:'Furniture','itemType.subtypeCode':0,'source.BaseItemID':2}]]);
 const db={getFieldCatalog:async()=>['source.MountItemID','source.BaseItemID'].map(field=>({field})),getItemReferences:async()=>[[4,'source.MountItemID'],[5,'source.BaseItemID'],[6,'source.BaseItemID'],[7,'tags[0].id']],getItemFields:async ids=>ids.map(itemId=>records.has(itemId)?{itemId,values:records.get(itemId)}:null)};
 assert.deepEqual(await readNativeEntityRelations(db,2,{nativeType:'Companion',code:3}),{parent:null,styles:[4],gear:[5]});
 assert.deepEqual(await readNativeEntityRelations(db,4,{nativeType:'Skin',code:4}),{parent:2,styles:[],gear:[]});
});

import {readItemPlacementHint,readItemBundleContext} from '../src/lib/items/item-page-source-context.ts';
test('ordinary placement reads the published source hint without guessing unknown placement',async()=>{
 const db={getFieldCatalog:async()=>[{field:'placement.sourceOrdinaryScopeHint'}],getItemFields:async ids=>ids.map(itemId=>({itemId,values:{'placement.sourceOrdinaryScopeHint':itemId===1?'both':'unknown'}}))};
 assert.equal(await readItemPlacementHint(db,1,'Furniture'),'both');
 assert.equal(await readItemPlacementHint(db,2,'Furniture'),null);
 assert.equal(await readItemPlacementHint(db,1,'ActivityItem'),null);
});
test('bundle display uses only revisions with actual membership and hides source IDs',async()=>{
 const db={getPremiumBundleMembership:async()=>[{bundleIds:['a','b','c'],currentBundleIds:['a'],legacyBundleIds:['b','c']}],getPremiumBundleLocalizedText:async()=>[{bundleId:'a',current:{displayTitle:'New'},legacy:{displayTitle:'Old'}},{bundleId:'b',current:{displayTitle:'Unrelated'},legacy:{displayTitle:'Original'}},{bundleId:'c',current:{displayTitle:'Wrong'},legacy:{displayTitle:null}}]};
 assert.deepEqual(await readItemBundleContext(db,1,'en'),{count:3,names:['New','Original']});
});
