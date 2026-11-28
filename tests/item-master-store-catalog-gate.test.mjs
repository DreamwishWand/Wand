import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveStoreCatalogGate as resolve} from '../tools/db-01-items/store-catalog-gate.mjs';
test('store progression gate only admits audited positive first-acquisition predicates',()=>{
 const sha={Character:'da6794c66a801a1de43a6ac7b7b79d77a663661f3226bc51a249092632777f0f',
 Mission:'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24',
 Tag:'bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4'};
 const known=new Map([[10000012,{nativeCategory:'Character'}],[2000500005,{nativeCategory:'Tag'}],
 [2070000100,{nativeCategory:'Mission'}],[2070000200,{nativeCategory:'Mission'}]]);
 const kinds=new Map([[2070000100,'ordinary_gameplay'],[2070000200,'in_game_limited_event']]);
 const wrap=leaf=>({Conditions:{Conditions:[leaf]}});
 const accepted=[
 [{},'empty',null],[{MinLevel:6},'player_level',null],
 [{CharacterId:10000012,MinFriendship:10},'character_friendship',10000012],
 [wrap({CharacterUnlocked:{Character:10000012}}),'character_unlocked',10000012],
 [wrap({CharacterFriendship:{Character:10000012,Operator:5,FriendshipLevel:10}}),'character_friendship',10000012],
 [wrap({RealmUnlocked:{Universe:2000500005}}),'realm_unlocked',2000500005],
 [wrap({MissionStatus:{Mission:2070000100,State:8}}),'mission_completed',2070000100],
 [wrap({MissionStepStatus:{Mission:2070000100,StepID:12,Status:4}}),'mission_step_completed',2070000100]
 ];
 for(const [original,kind,targetItemId] of accepted)assert.deepEqual(resolve(original,known,kinds,sha),{kind,targetItemId,original});
 for(const original of [{Conditions:{}},{Conditions:{Operator:0,Conditions:[]}},{MinFriendship:1},
 {CharacterId:0,MinFriendship:10},{MinLevel:0,UnlockedByDesignChallenge:''}])
   assert.deepEqual(resolve(original,known,kinds,sha),{kind:'empty',targetItemId:null,original});
 for(const g of [null,{MinFriendship:-1},{MinLevel:41},{UnlockedByDesignChallenge:'x'},
 wrap({HasEverOwned:{Item:40000001}}),wrap({MissionStatus:{Mission:2070000200,State:8}}),
 wrap({MissionStatus:{Mission:2070000100,State:8,Operator:1}}),
 wrap({CharacterUnlocked:{Character:10000012,Inversed:true}}),wrap({CommonConditions:{Condition:2130006851}}),
 {Conditions:{Operator:1,Conditions:[{MissionStatus:{Mission:2070000100,State:8}}]}},{Conditions:{Unknown:1}},{Conditions:null},{Conditions:{},UnlockedByDesignChallenge:'x'},{CharacterId:10000012}])
 assert.equal(resolve(g,known,kinds,sha),null);
 assert.equal(resolve(accepted[3][0],known,kinds,{}),null);
 assert.equal(resolve(accepted[6][0],known,kinds,{}),null);
 assert.equal(resolve(accepted[5][0],known,kinds,{}),null);
});
