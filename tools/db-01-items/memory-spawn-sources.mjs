/** Source-configured memory spawn routes; not proof of a live grant.
 * Use the existing Guide taxonomy and strict quest-gate interpretation.
 */
import {questGate} from './conditional-quest-acquisition.mjs';
const id=n=>Number.isSafeInteger(n)&&n>0;
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>obj(v)&&Object.keys(v).every(k=>keys.includes(k));
function gate(tree,known,questKinds){
  if(!exact(tree,['Operator','Conditions'])||!(tree.Operator===undefined||tree.Operator===0)||!Array.isArray(tree.Conditions)||!tree.Conditions.length)return null;
  const questGates=[],sceneItemIds=[],characterItemIds=[],additionalGates=[];
  for(const [i,leaf] of tree.Conditions.entries()){
    if(!obj(leaf)||Object.keys(leaf).length!==1)return null;
    const v=leaf.CurrentScene;
    if(v!==undefined){
      if(!exact(v,['Scene','Inversed'])||!(v.Inversed===undefined||v.Inversed===false)||known.get(v.Scene)?.nativeCategory!=='Scene')return null;
      sceneItemIds.push(v.Scene);continue;
    }
    const k=Object.keys(leaf)[0],p=leaf[k];
    // These additional requirements remain exact source predicates. A
    // configured friendship comparison is not interpreted as a live level.
    // AreaUnlocked's absent VillageArea remains absent (no guessed area).
    const unlocked=k==='CharacterUnlocked'&&exact(p,['Character','Inversed'])&&
      known.get(p.Character)?.nativeCategory==='Character'&&(p.Inversed===undefined||p.Inversed===false);
    const friendship=k==='CharacterFriendship'&&exact(p,['Character','FriendshipLevel','Operator'])&&
      known.get(p.Character)?.nativeCategory==='Character'&&id(p.FriendshipLevel)&&p.FriendshipLevel<=10&&p.Operator===5;
    const area=k==='AreaUnlocked'&&exact(p,['VillageArea','Inversed'])&&
      (p.VillageArea===undefined||Number.isSafeInteger(p.VillageArea)&&p.VillageArea>=0)&&
      (p.Inversed===undefined||p.Inversed===false);
    if(unlocked||friendship||area){
      if(unlocked||friendship)characterItemIds.push(p.Character);
      additionalGates.push({kind:k,sourcePath:'source.Conditions.Conditions['+i+'].'+k,original:p});
      continue;
    }
    // Only reviewed conjunctive predicates are admitted. Preserve indices.
    if(leaf.CommonConditions||leaf.SubConditions)return null;
    const parsed=questGate({Conditions:[leaf]},new Map(),questKinds);
    if(!parsed?.length)return null;
    questGates.push(...parsed.map(p=>({...p,sourcePath:p.sourcePath.replace('Conditions[0]','Conditions['+i+']')})));
  }
  if(!questGates.length||new Set(questGates.map(p=>p.category)).size!==1)return null;
  return {category:questGates[0].category,questGates,sceneItemIds:[...new Set(sceneItemIds)],characterItemIds:[...new Set(characterItemIds)],additionalGates};
}
export function buildMemorySpawnSources(rows,source,memories,questKinds){
  const result=new Map();
  if(!memories.size||!questKinds||source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
    source.sourceFilesSha256.ConditionalEvent!=='693c0f5625ac37b45bbb9543766a99601f854cbdd371c096c39509689f573d47'||
    source.sourceFilesSha256.Condition!=='9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'||
    source.sourceFilesSha256.Mission!=='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24')return result;
  const known=new Map(rows.map(r=>[r.itemId,r]));
  let occurrences=0,invalid=0,classifiedOccurrences=0;const classifiedIds=new Set();
  for(const row of rows){
    if(row.nativeCategory!=='ConditionalEvent')continue;
    const p={...row.nativeProperties,...row.sourceAttributes},s=p.Spawn,r=s?.RewardOverride;
    if(!r)continue;
    const direct=memories.has(r.ItemID),nested=r.State?.ConsummableData;
    const target=direct?r.ItemID:nested?.ItemID,memory=memories.get(target);
    if(memory?.appearanceConditionCode!==9)continue;
    const state=direct?r.State:nested?.State,index=state?.MemoryShardIndex;
    const amount=s.AmountToSpawn?.Value?.Value;
    const shardIndexValid=Number.isSafeInteger(index)&&index>=0&&index<memory.configuredShardCount;
    const exactAmount=exact(s.AmountToSpawn,['Value'])&&exact(s.AmountToSpawn.Value,['Value'])&&id(amount);
    const gateResult=shardIndexValid&&exactAmount&&exact(state,['MemoryShardIndex'])&&(direct||id(nested?.Amount))?gate(p.Conditions,known,questKinds):null;
    const record={kind:gateResult?'quest_gated_memory_spawn':'configured_memory_spawn',sourceItemId:row.itemId,
      targetItemId:target,sourcePath:direct?'source.Spawn.RewardOverride.ItemID':'source.Spawn.RewardOverride.State.ConsummableData.ItemID',
      shardIndex:Number.isSafeInteger(index)?index:null,shardIndexValid,configuredShardCount:memory.configuredShardCount,
      configuredAmount:exactAmount?amount:null,configuredConsumableAmount:direct?null:nested?.Amount??null,
      orbItemId:direct?null:r.ItemID,spawnLocationKinds:Object.keys(s.SpawnLocationSource??{}),
      conditions:p.Conditions??null,category:gateResult?.category??null,questGates:gateResult?.questGates??[],sceneItemIds:gateResult?.sceneItemIds??[],
      characterItemIds:gateResult?.characterItemIds??[],additionalGates:gateResult?.additionalGates??[],
      sourceGameVersion:source.target.gameVersion,sourceEventSha256:source.sourceFilesSha256.ConditionalEvent,
      sourceConditionSha256:source.sourceFilesSha256.Condition,sourceMissionSha256:source.sourceFilesSha256.Mission,
      sourceMemorySha256:source.sourceFilesSha256.MemoryShard,guaranteedGrantVerified:false,currentAvailabilityVerified:false};
    const list=result.get(target)??[];list.push(record);result.set(target,list);occurrences++;
    if(!shardIndexValid)invalid++;
    if(gateResult){classifiedOccurrences++;classifiedIds.add(target);}
  }
  console.log('DB01_MEMORY_SPAWN '+JSON.stringify({items:result.size,occurrences,invalid,classifiedOccurrences,classifiedItems:classifiedIds.size}));
  return result;
}
