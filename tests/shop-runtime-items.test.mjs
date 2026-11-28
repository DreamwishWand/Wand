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

test('native evolution steps append in configuration order, quantity one, no inherited explicit image',()=>{
 const chain=[42,41].map((targetItemId,stepIndex)=>({kind:'item_evolution',sourceGameVersion:'1.26.2',baseItemId:2,targetItemId,stepIndex,previousConfiguredTargetItemId:stepIndex?42:null}));
 const rows=[row(1,'FurnitureItemData'),row(2,'ToolItemData',{'acquisition.evolutionChain':chain}),row(1,'FurnitureItemData')];
 const targets=new Map(chain.map(step=>[step.targetItemId,row(step.targetItemId,'ToolItemData',{'acquisition.evolutionSource':step})]));
 const result=buildShopRuntimePrefix(v,rows,true,targets);
 assert.equal(result.complete,true);
 assert.deepEqual(result.items.map(x=>[x.itemId,x.quantity,x.address]),[[1,3,'guid:a'],[2,1,'guid:b'],[42,1,null],[41,1,null],[1,2,null]]);
 assert.deepEqual(result.items.slice(2,4).map(x=>x.evolutionStep),[0,1]);
 assert.equal(buildShopRuntimePrefix(v,rows,true,new Map([[42,targets.get(42)]])).blockedBy,'evolution');
 assert.equal(buildShopRuntimePrefix(v,rows,true,new Map([[42,targets.get(42)],[41,row(41,'ClothingItemData',{'acquisition.evolutionSource':chain[1]})]])).blockedBy,'evolution');
});

test('explicit non-notable Pet skips the friendship reward; missing or true is unresolved',()=>{
 const first=row(1,'FurnitureItemData'),last=row(1,'FurnitureItemData');
 assert.equal(buildShopRuntimePrefix(v,[first,row(2,'PetItemData',{'source.IsNotable':false}),last],true).complete,true);
 for(const val of [true,null,undefined])assert.equal(buildShopRuntimePrefix(v,[first,row(2,'PetItemData',val===undefined?{}:{'source.IsNotable':val}),last],true).blockedBy,'companion_reward');
});

test('notable companion uses exact owner level 5 Tier1 reward before next content',()=>{
 const reward={kind:'pet_friendship_reward',sourceId:2,level:5,rewardStage:'Tier1Reward',amount:1,itemId:40004121,sourceRecord:'PetFriendship',sourceRecordIndex:400,sourceProtoDbSha256:'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'};
 const build=rewards=>buildShopRuntimePrefix(v,[row(1,'FurnitureItemData'),row(2,'PetItemData',{'source.IsNotable':true,'acquisition.individualFriendshipRewards':rewards}),row(1,'FurnitureItemData')],true);
 const result=build([{...reward,level:2,itemId:31400131},reward]);
 assert.equal(result.complete,true);
 assert.deepEqual(result.items.map(x=>[x.itemId,x.quantity,x.address]),[[1,3,'guid:a'],[2,1,'guid:b'],[40004121,1,null],[1,2,null]]);
 assert.equal(result.items[2].companionReward,true);
 for(const bad of [[],[{...reward,sourceId:99}],[{...reward,amount:null}],[{...reward,rewardStage:'LevelReward'}],[{...reward,sourceRecord:'Friendship'}],[reward,reward]])assert.equal(build(bad).blockedBy,'companion_reward');
});
