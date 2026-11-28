import test from 'node:test';
import assert from 'node:assert/strict';
import {buildShopRuntimePrefix} from '../src/lib/media/shop-runtime-items.ts';
const v={gameVersion:'1.26.2',revisionSha256:'a'.repeat(64),components:[{itemId:1,quantity:3,image:'guid:a'},{itemId:2,quantity:1,image:'guid:b'},{itemId:1,quantity:2}]};
const row=(itemId,sourceClass,extra={})=>({itemId,values:{sourceClass,...extra}});
test('ordinary items retain source order, quantity and duplicates',()=>{
 const r=buildShopRuntimePrefix(v,[row(1,'FurnitureItemData'),row(2,'ClothingItemData'),row(1,'FurnitureItemData')],true);
 assert.equal(r.complete,true);assert.deepEqual(r.items.map(x=>[x.itemId,x.quantity,x.address]),[[1,3,'guid:a'],[2,1,'guid:b'],[1,2,null]]);
});
test('each expansion boundary stops the prefix without shifting later contents',()=>{
 for(const [cls,extra,indexed,reason] of [['ToolItemData',{'acquisition.evolutionChain':[{targetItemId:42}]},true,'evolution'],['ClothingItemData',{},false,'evolution_index'],['CharacterSkinItemData',{},true,'quest'],['CritterItemData',{},true,'companion_reward'],['Unknown',{},true,'unknown_item']]){
  const r=buildShopRuntimePrefix(v,[row(1,'FurnitureItemData'),row(2,cls,extra),row(1,'FurnitureItemData')],indexed);
  assert.equal(r.complete,false);assert.equal(r.blockedBy,reason);assert.equal(r.items.length,2);
 }
 assert.equal(buildShopRuntimePrefix(v,[row(2,'FurnitureItemData')],true).items.length,1);
 assert.equal(buildShopRuntimePrefix({...v,gameVersion:'1.24.1'},[],true).items.length,0);
});
