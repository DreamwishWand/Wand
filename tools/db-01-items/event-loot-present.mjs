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
// A configured blocker reward may be a loot present with an explicitly
// empty payload. Native ConsumeItem.Types.GetLootPresentRewards resolves
// LootTableItemID (field 8, offset 0x50) and generates from its table when
// the supplied MultiItemInstance contains zero items. A nonempty payload
// is an override and must not inherit the table's rewards.
const props=r=>({...r?.nativeProperties,...r?.sourceAttributes});
const singleAnd=(tree,kind)=>exact(tree,['Operator','Conditions'])&&
  (tree.Operator===undefined||tree.Operator===0)&&tree.Conditions?.length===1&&
  exact(tree.Conditions[0],[kind])?tree.Conditions[0][kind]:null;
const selectorItem=(s,type)=>s?.Type===type&&exact(s.Item,['Item'])&&id(s.Item.Item)?s.Item.Item:null;
const positiveAmount=s=>id(s?.AmountToSpawn?.Value?.Value)&&exact(s.AmountToSpawn,['Value'])&&exact(s.AmountToSpawn.Value,['Value']);
const blocker=(s,known)=>known.get(selectorItem(s?.FurnitureItem?.Item,4))?.sourceClass==='FurnitureBlockerItemData';
const NATIVE='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653';
function inventoryGatedOverrideRoutes(rows,source,known){
  const sha=source.sourceFilesSha256,result=new Map(),precursors=new Map();
  if(sha.Furniture!=='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196'||
    sha.Mission!=='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'||
    sha.ActivityData!=='2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296'||
    source.sourceIl2cppDumpSha256!=='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08')return result;
  const add=(target,v)=>{const a=precursors.get(target)??[];a.push(v);precursors.set(target,a);};
  for(const row of rows){
    const p=props(row);
    if(row.sourceClass==='FishingDataItemData'){
      const target=p.Result?.ItemID,gate=activeEvent(p.Conditions,known);
      if(!gate||!id(target)||known.get(target)?.nativeCategory!=='ActivityItem'||
         !exact(p.Result,['ItemID'])||!id(p.WeightPercentage))continue;
      add(target,{kind:'event_fishing_result',sourceItemId:row.itemId,sourcePath:'source.Result.ItemID',
        eventName:gate.eventName,originalConditions:p.Conditions,resolvedConditions:gate.resolved,
        sourceFileSha256:sha.ActivityData});
    }
    if(row.nativeCategory!=='ConditionalEvent')continue;
    const s=p.Spawn,target=s?.RewardOverride?.ItemID,step=singleAnd(p.Conditions,'MissionStepStatus');
    if(!blocker(s,known)||!positiveAmount(s)||!id(target)||known.get(target)?.nativeCategory!=='ActivityItem'||
      !exact(s.RewardOverride,['ItemID'])||!exact(step,['Mission','StepID','Status'])||step.Status!==2)continue;
    const mission=known.get(step.Mission),mp=props(mission);
    if(mission?.nativeCategory!=='Mission'||!id(step.Mission)||!Number.isSafeInteger(step.StepID??0)||
      (step.StepID??0)<0||mp.Steps?.filter(v=>(v.StepID??0)===(step.StepID??0)).length!==1)continue;
    const available=mp.AvailableConditions;
    if(!exact(available,['Operator','Conditions'])||(available.Operator!==undefined&&available.Operator!==0)||
      !Array.isArray(available.Conditions)||available.Conditions.length!==2)continue;
    const [inventory,common]=available.Conditions;
    if(!exact(inventory,['Inventory'])||!exact(inventory.Inventory,['Item','Operator','Amount'])||
      !id(inventory.Inventory.Item)||inventory.Inventory.Operator!==4||(inventory.Inventory.Amount??0)!==0||
      !exact(common,['CommonConditions']))continue;
    const gate=activeEvent({Conditions:[common]},known);
    if(!gate)continue;
    add(target,{kind:'event_quest_blocker_note',sourceItemId:row.itemId,sourcePath:'source.Spawn.RewardOverride.ItemID',
      eventName:gate.eventName,missionItemId:mission.itemId,originalConditions:p.Conditions,
      missionAvailableConditions:available,resolvedConditions:gate.resolved,
      sourceFileSha256:sha.ConditionalEvent});
  }
  for(const row of rows){
    if(row.nativeCategory!=='ConditionalEvent')continue;
    const p=props(row),s=p.Spawn,inv=singleAnd(p.Conditions,'Inventory'),override=s?.RewardOverride;
    if(!blocker(s,known)||!positiveAmount(s)||s.RemoveWhenDone!==true||
      !exact(inv,['Item','Operator','Amount'])||inv.Operator!==4||(inv.Amount??0)!==0||
      !id(inv.Item)||!exact(override,['ItemID','State'])||!exact(override.State,['LootPresentData'])||
      !exact(override.State.LootPresentData,[])||!id(override.ItemID)||
      known.get(override.ItemID)?.sourceClass!=='LootPresentItemData')continue;
    const routes=precursors.get(inv.Item)??[];
    if(!routes.length||new Set(routes.map(v=>v.eventName)).size!==1)continue;
    // A note obtained through a quest blocker must have a matching explicit
    // pickup objective for the resulting treasure chest in that same quest.
    const matched=routes.filter(v=>{
      if(v.kind==='event_fishing_result')return true;
      const steps=props(known.get(v.missionItemId)).Steps??[];
      return steps.some(st=>(st.SubSteps??[]).some(sub=>(sub.Objectives??[]).some(o=>
        selectorItem(o.PickUp?.RegularItem?.Item,3)===override.ItemID)));
    });
    if(!matched.length)continue;
    result.set(row.itemId,{bagItemId:override.ItemID,eventName:matched[0].eventName,
      resolved:matched.flatMap(v=>v.resolvedConditions),inventoryItemId:inv.Item,
      blockerItemId:selectorItem(s.FurnitureItem.Item,4),precursors:matched,
      rewardOverride:override,sourceFurnitureSha256:sha.Furniture,
      sourceMissionSha256:sha.Mission,sourceActivityDataSha256:sha.ActivityData,
      nativeAssemblySha256:NATIVE});
  }
  console.log('DB01_EVENT_REWARD_OVERRIDE '+JSON.stringify({events:result.size,precursors:precursors.size,
    byKind:Object.fromEntries(['event_quest_blocker_note','event_fishing_result'].map(k=>[k,[...result.values()].filter(v=>v.precursors.some(p=>p.kind===k)).length]))}));
  return result;
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
  const overrides=inventoryGatedOverrideRoutes(rows,source,known);
  let events=0,occurrences=0;
  for(const row of rows){
    if(row.nativeCategory!=='ConditionalEvent')continue;
    const p=props(row),s=p.Spawn,selector=s?.LootPresentItem?.Item,override=overrides.get(row.itemId);
    const bagId=override?.bagItemId??selectorItem(selector,3);
    if(!id(bagId)||!override&&(s.RewardOverride!==undefined&&!exact(s.RewardOverride,[])))continue;
    const bag=known.get(bagId);
    if(bag?.sourceClass!=='LootPresentItemData')continue;
    const tableId=props(bag).LootTableItemID,table=known.get(tableId);
    if(table?.nativeCategory!=='LootTable'||!id(s.AmountToSpawn?.Value?.Value)||
      !exact(s.AmountToSpawn,['Value'])||!exact(s.AmountToSpawn.Value,['Value']))continue;
    const gate=override??activeEvent(p.Conditions,known);
    if(!gate)continue;
    const base={sourceItemId:row.itemId,category:'in_game_limited_event',bagItemId:bagId,tableItemId:tableId,
      eventName:gate.eventName,conditions:p.Conditions,resolvedConditions:gate.resolved,
      spawnSourcePath:override?'source.Spawn.RewardOverride.ItemID':'source.Spawn.LootPresentItem.Item.Item.Item',spawnLocation:s.SpawnLocationSource??null,
      ...(override?{inventoryItemId:override.inventoryItemId,blockerItemId:override.blockerItemId,precursors:override.precursors,
        rewardOverride:override.rewardOverride,sourceFurnitureSha256:override.sourceFurnitureSha256,
        sourceMissionSha256:override.sourceMissionSha256,sourceActivityDataSha256:override.sourceActivityDataSha256,
        nativeAssemblySha256:override.nativeAssemblySha256}:{}),
      configuredSpawnAmount:s.AmountToSpawn.Value.Value,sourceGameVersion:source.target.gameVersion,
      sourceEventSha256:sha.ConditionalEvent,sourceConditionSha256:sha.Condition,sourceActivityItemSha256:sha.ActivityItem,
      sourceLootTableSha256:sha.LootTable,guaranteedGrantVerified:false,currentAvailabilityVerified:false};
    emit(bagId,base,{kind:override?'event_loot_present_override':'event_loot_present_spawn',tableSourcePath:null});events++;occurrences++;
    for(const [gi,g] of (props(table).Rewards?.SubLootTables??[]).entries()){
      if(!eligibleExplicitLootGroup(g))continue;
      for(const [ii,v] of (g.Items??[]).entries()){
        const target=known.get(v.ItemID);
        // Internal event triggers and arbitrary non-collectible definitions are not rewards.
        if(!target||!['ActivityItem','Furniture','Clothing','Companion','Currency','MemoryShard','BoardGame','Skin','Trimming','Tool','Building'].includes(target.nativeCategory)||v.ItemID===bagId)continue;
        const path='source.Rewards.SubLootTables['+gi+'].Items['+ii+']';
        // For a direct memory payload, preserve the exact valid piece,
        // instead of promoting a generic memory reference as a grant.
        const directMemory=memories.get(v.ItemID),directIndex=v.State?.MemoryShardIndex;
        if(!directMemory||Number.isSafeInteger(directIndex)&&directIndex>=0&&directIndex<directMemory.configuredShardCount){
          emit(v.ItemID,base,{kind:'event_loot_present_reward',tableSourcePath:path+'.ItemID',minimumRolls:g.Min,maximumRolls:g.Max,
            ...(directMemory?{shardIndex:directIndex,configuredShardCount:directMemory.configuredShardCount}: {})});occurrences++;
        }
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
