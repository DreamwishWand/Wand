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
  assert.deepEqual(result,{series:[{itemId:11,name:'Name 11'}],recipeResults:[],partial:false});
});

test('public labels preserve partial localization and reject source markers, not ordinary names',()=>{
  assert.equal(displayItemName({ja:null,en:'Bench'},'ja'),'Bench');
  assert.equal(displayItemName({ja:null,en:null,fr:'Banc'},'ja'),'Banc');
  assert.equal(displayItemName({ja:'{Placeholder}',en:'  '},'ja'),null);
  assert.equal(usableItemName('2 × 2 Table'),true);
});
