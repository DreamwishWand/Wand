/** Conservative first-acquisition progression gates. Original 1.26.2
 * CatalogVisibilityConditions.CanBuyState calls ConditionsList.Evaluate;
 * min level and character friendship are positive threshold comparisons.
 * Never infer ordinary acquisition from ownership, event or design gates.
 */
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>obj(v)&&Object.keys(v).every(k=>allowed.includes(k));
const positive=n=>Number.isSafeInteger(n)&&n>0;
// Original Character.json: these 20 referenced IDs are not debug, sidekick,
// sync-online or online-category characters; unlock type StoryReward/Secret.
const CHARACTERS=new Set([10000137,10000135,10000156,10000158,10000025,10000162,10000166,10000179,10000180,10000182,
 10000187,10000184,10000012,10000194,10000186,10000212,10000200,10000203,10000199,10000001]);
// Authenticated UniverseTag definitions: Frozen, ToyStory, LionKing, WallE.
const REALMS=new Set([2000500005,2000500006,2000500010,2000500013]);
const TAG_SHA='bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4';
// CatalogVisibilityConditions.get_IsDefined does not consider MinFriendship
// unless CharacterId is non-invalid (Item.Invalid = 0); empty condition
// lists are also ignored. CanBuyState returns undefined and the caller
// falls back to the set gate. Retain the original object as evidence.
function nativeUndefined(g){
 if(!keys(g,['MinLevel','CharacterId','MinFriendship','Conditions','UnlockedByDesignChallenge']))return false;
 if((g.MinLevel??0)!==0||(g.CharacterId??0)!==0||
   (g.MinFriendship!==undefined&&(!Number.isSafeInteger(g.MinFriendship)||g.MinFriendship<0))||
   (g.UnlockedByDesignChallenge!==undefined&&g.UnlockedByDesignChallenge!==''))return false;
 if(g.Conditions===undefined)return true;
 const c=g.Conditions;
 return keys(c,['Operator','Conditions'])&&[undefined,0].includes(c.Operator)&&
  (c.Conditions===undefined||Array.isArray(c.Conditions)&&c.Conditions.length===0);
}
export function resolveStoreCatalogGate(g,known,questKinds,sha){
 if(!obj(g))return null;
 const result=(kind,targetItemId=null)=>({kind,targetItemId,original:g});
 if(nativeUndefined(g))return result('empty');
 if(keys(g,['MinLevel'])&&positive(g.MinLevel)&&g.MinLevel<=40)return result('player_level');
 const char=n=>sha?.Character==='da6794c66a801a1de43a6ac7b7b79d77a663661f3226bc51a249092632777f0f'&&CHARACTERS.has(n)&&known.get(n)?.nativeCategory==='Character';
 if(keys(g,['CharacterId','MinFriendship'])&&char(g.CharacterId)&&positive(g.MinFriendship)&&g.MinFriendship<=10)
   return result('character_friendship',g.CharacterId);
 if(!keys(g,['Conditions'])||!keys(g.Conditions,['Operator','Conditions'])||
    ![undefined,0].includes(g.Conditions.Operator)||!Array.isArray(g.Conditions.Conditions)||g.Conditions.Conditions.length!==1)return null;
 const leaf=g.Conditions.Conditions[0];
 if(!obj(leaf)||Object.keys(leaf).length!==1)return null;
 const [kind]=Object.keys(leaf),v=leaf[kind];
 if(!obj(v))return null;
 const mission=n=>sha?.Mission==='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'&&
  known.get(n)?.nativeCategory==='Mission'&&questKinds.get(n)==='ordinary_gameplay';
 if(kind==='MissionStatus'&&keys(v,['Mission','State','Operator'])&&mission(v.Mission)&&v.State===8&&[undefined,0].includes(v.Operator))
   return result('mission_completed',v.Mission);
 if(kind==='MissionStepStatus'&&keys(v,['Mission','StepID','Status'])&&mission(v.Mission)&&Number.isSafeInteger(v.StepID)&&v.StepID>=0&&v.Status===4)
   return result('mission_step_completed',v.Mission);
 if(kind==='CharacterUnlocked'&&keys(v,['Character','Inversed'])&&char(v.Character)&&[undefined,false].includes(v.Inversed))
   return result('character_unlocked',v.Character);
 if(kind==='CharacterFriendship'&&keys(v,['Character','Operator','FriendshipLevel'])&&char(v.Character)&&v.Operator===5&&positive(v.FriendshipLevel)&&v.FriendshipLevel<=10)
   return result('character_friendship',v.Character);
 if(kind==='RealmUnlocked'&&keys(v,['Universe','Inversed'])&&sha?.Tag===TAG_SHA&&REALMS.has(v.Universe)&&known.get(v.Universe)?.nativeCategory==='Tag'&&[undefined,false].includes(v.Inversed))
   return result('realm_unlocked',v.Universe);
 return null;
}
