/** Build-only original seasonal reward bag routes, across all item families.
 * A positive active-event predicate and exact bag/table link are required.
 * No claims of currently active dates, drop probabilities or guaranteed grants.
 */
import {eligibleExplicitLootGroup} from './ordinary-loot-present.mjs';
const id=n=>Number.isSafeInteger(n)&&n>0;
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>obj(v)&&Object.keys(v).every(k=>keys.includes(k));
const positive=v=>v===undefined||v===false;
function activeEvent(tree,known,stack=[]){
  if(stack.length>8||!exact(tree,['Operator','Conditions'])||!(tree.Operator===undefined||tree.Operator===0)||
    !Array.isArray(tree.Conditions)||!tree.Conditions.length)return null;
  const events=[],resolved=[];
  for(const leaf of tree.Conditions){
    if(!obj(leaf)||Object.keys(leaf).length!==1)return null;
    const k=Object.keys(leaf)[0],p=leaf[k];
    if(k==='EventTime'||k==='FloatingFestivalTime'){
      if(!exact(p,['Event','Status','Inversed'])||!positive(p.Inversed)||p.Status!==2||
        typeof p.Event!=='string'||! /^[A-Za-z0-9_]+$/.test(p.Event))return null;
      events.push(p.Event);
    }else if(k==='CommonConditions'){
      if(!exact(p,['Condition','Inversed'])||!positive(p.Inversed)||stack.includes(p.Condition))return null;
      const r=known.get(p.Condition);
      if(r?.nativeCategory!=='Condition')return null;
      const original={...r.nativeProperties,...r.sourceAttributes}.Conditions;
      const next=activeEvent(original,known,[...stack,p.Condition]);
      if(!next)return null;
      events.push(next.eventName);resolved.push({conditionItemId:p.Condition,original},...next.resolved);
    }else if(k==='AreaUnlocked'){
      if(!exact(p,['VillageArea','Inversed'])||!positive(p.Inversed)||!Number.isSafeInteger(p.VillageArea)||p.VillageArea<0)return null;
    }else if(k==='Date'){
      if(!exact(p,['Date','LocalTime','Operator'])||!exact(p.Date,['Seconds'])||!id(p.Date.Seconds)||
        p.Operator!==5||(p.LocalTime!==undefined&&typeof p.LocalTime!=='boolean'))return null;
    }else if(k==='MissionStatus'){
      // The reviewed TrickOrTreat common condition also requires completion
      // of the tutorial quest. Keep this exact positive prerequisite.
      if(!exact(p,['Mission','State','Operator'])||known.get(p.Mission)?.nativeCategory!=='Mission'||
        p.State!==8||(p.Operator!==undefined&&p.Operator!==0))return null;
    }else if(k==='MemoryShard'){
      if(!exact(p,['Operator','Shard'])||p.Operator!==3||known.get(p.Shard)?.nativeCategory!=='MemoryShard')return null;
    }else return null;
  }
  if(!events.length||new Set(events).size!==1)return null;
  return {eventName:events[0],resolved};
}
export function eventLootPresentLinks(rows,source,memories){
  const result=new Map(),sha=source.sourceFilesSha256;
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
    sha.ConditionalEvent!=='693c0f5625ac37b45bbb9543766a99601f854cbdd371c096c39509689f573d47'||
    sha.Condition!=='9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'||
    sha.ActivityItem!=='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2'||
    sha.LootTable!=='580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c')return result;
  const known=new Map(rows.map(r=>[r.itemId,r])),props=r=>({...r.nativeProperties,...r.sourceAttributes});
  const emit=(target,base,extra)=>{
    const list=result.get(target)??[];list.push({...base,targetItemId:target,...extra});result.set(target,list);
  };
  let events=0,occurrences=0;
  for(const row of rows){
    if(row.nativeCategory!=='ConditionalEvent')continue;
    const p=props(row),s=p.Spawn,selector=s?.LootPresentItem?.Item,bagId=selector?.Item?.Item;
    if(selector?.Type!==3||!id(bagId)||!exact(selector.Item,['Item'])||
      (s.RewardOverride!==undefined&&!exact(s.RewardOverride,[])))continue;
    const bag=known.get(bagId);
    if(bag?.sourceClass!=='LootPresentItemData')continue;
    const tableId=props(bag).LootTableItemID,table=known.get(tableId);
    if(table?.nativeCategory!=='LootTable'||!id(s.AmountToSpawn?.Value?.Value)||
      !exact(s.AmountToSpawn,['Value'])||!exact(s.AmountToSpawn.Value,['Value']))continue;
    const gate=activeEvent(p.Conditions,known);
    if(!gate)continue;
    const base={sourceItemId:row.itemId,category:'in_game_limited_event',bagItemId:bagId,tableItemId:tableId,
      eventName:gate.eventName,conditions:p.Conditions,resolvedConditions:gate.resolved,
      spawnSourcePath:'source.Spawn.LootPresentItem.Item.Item.Item',spawnLocation:s.SpawnLocationSource??null,
      configuredSpawnAmount:s.AmountToSpawn.Value.Value,sourceGameVersion:source.target.gameVersion,
      sourceEventSha256:sha.ConditionalEvent,sourceConditionSha256:sha.Condition,sourceActivityItemSha256:sha.ActivityItem,
      sourceLootTableSha256:sha.LootTable,guaranteedGrantVerified:false,currentAvailabilityVerified:false};
    emit(bagId,base,{kind:'event_loot_present_spawn',tableSourcePath:null});events++;occurrences++;
    for(const [gi,g] of (props(table).Rewards?.SubLootTables??[]).entries()){
      if(!eligibleExplicitLootGroup(g))continue;
      for(const [ii,v] of (g.Items??[]).entries()){
        const target=known.get(v.ItemID);
        // Internal event triggers and arbitrary non-collectible definitions are not rewards.
        if(!target||!['ActivityItem','Furniture','Clothing','Companion','Currency','MemoryShard','BoardGame','Skin','Trimming','Tool','Building'].includes(target.nativeCategory)||v.ItemID===bagId)continue;
        const path='source.Rewards.SubLootTables['+gi+'].Items['+ii+']';
        emit(v.ItemID,base,{kind:'event_loot_present_reward',tableSourcePath:path+'.ItemID',minimumRolls:g.Min,maximumRolls:g.Max});occurrences++;
        const nested=v.State?.ConsummableData,memory=memories.get(nested?.ItemID),index=nested?.State?.MemoryShardIndex;
        if(memory&&id(nested.Amount)&&Number.isSafeInteger(index)&&index>=0&&index<memory.configuredShardCount){
          emit(nested.ItemID,base,{kind:'event_loot_present_memory_payload',tableSourcePath:path+'.State.ConsummableData.ItemID',
            orbItemId:v.ItemID,shardIndex:index,configuredConsumableAmount:nested.Amount,minimumRolls:g.Min,maximumRolls:g.Max});occurrences++;
        }
      }
    }
  }
  console.log('DB01_EVENT_LOOT_PRESENT '+JSON.stringify({events,items:result.size,occurrences}));
  return result;
}
