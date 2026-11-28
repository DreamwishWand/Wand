/** Source-configured seasonal recurring spawn -> ephemeral/blocker loot -> item.
 * PullWeed calls EphemeralItemData.get_TreasureLootTableItem (RVA 3b83af0)
 * at 49e7339 and 49e73ab. Explicit list and positive event predicate only.
 * Bounded local-date gates require both endpoints and a verified positive
 * mission prerequisite. Keep unbounded dates and random generators separate.
 */
import {activeEvent} from './event-loot-present.mjs';
import {eligibleExplicitLootGroup} from './ordinary-loot-present.mjs';
const id=n=>Number.isSafeInteger(n)&&n>0;
const props=r=>({...r?.nativeProperties,...r?.sourceAttributes});
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,k)=>obj(v)&&Object.keys(v).every(n=>k.includes(n));
const PIN={RecurringEvent:'6266f5f48fcf6b8b0075ca673e0cb04eb036481aad96ebc2efe53657f997e5c9',
 ConditionalEvent:'693c0f5625ac37b45bbb9543766a99601f854cbdd371c096c39509689f573d47',
 Condition:'9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c',
 ActivityItem:'4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2',
 LootTable:'580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c',
 MemoryShard:'e5c017b208dc50e3e4b543a143fe57400429d67151d5fd68938fbda0a4ef5367'};
const FURNITURE='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196';
const MISSION='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
// Only the original explicitly identified Cheshire Chaos definitions are
// admitted as named events; a date-limited condition alone does not identify
// an event. Native ConditionDate.Evaluate uses the LocalTime flag at +0x28,
// Timestamp.ToDateTime and Operations.Evaluate<DateTime> (RVA 17ad8d0).
const DATE_EVENTS=new Map([[2130003317,'Event!CheshireChaosEventActive'],
 [2130003319,'Event!CheshireChaos_ToyStory'],[2130003320,'Event!CheshireChaos_LionKing'],
 [2130003322,'Event!CheshireChaos_Aladdin']]);
function boundedLocalEvent(tree,ref,known,sha){
 if(sha.Furniture!==FURNITURE||sha.Mission!==MISSION||!keys(tree,['Operator','Conditions'])||
   ![undefined,0].includes(tree.Operator)||!Array.isArray(tree.Conditions)||tree.Conditions.length!==1)return null;
 const leaf=tree.Conditions[0],common=leaf?.CommonConditions;
 if(!keys(leaf,['CommonConditions'])||!keys(common,['Condition','Inversed'])||
   ![undefined,false].includes(common.Inversed)||!DATE_EVENTS.has(common.Condition))return null;
 const def=known.get(common.Condition),original=props(def).Conditions;
 if(def?.nativeCategory!=='Condition'||def.nativeKey!==DATE_EVENTS.get(common.Condition)||
   !keys(original,['Operator','Conditions'])||![undefined,0].includes(original.Operator)||
   !Array.isArray(original.Conditions)||original.Conditions.length!==3)return null;
 const [a,b,c]=original.Conditions,start=a?.Date,end=b?.Date,mission=c?.MissionStatus;
 if(!keys(a,['Date'])||!keys(b,['Date'])||!keys(c,['MissionStatus'])||
   ![start,end].every(d=>keys(d,['Operator','Date','LocalTime'])&&d.LocalTime===true&&
     keys(d.Date,['Seconds'])&&id(d.Date.Seconds))||
   start.Operator!==5||end.Operator!==3||start.Date.Seconds>=end.Date.Seconds||
   !keys(mission,['Mission','Operator','State'])||mission.State!==8||![undefined,0].includes(mission.Operator)||
   known.get(mission.Mission)?.nativeCategory!=='Mission'||
   !keys(ref,['RecurringEventItemID','DateLocal'])||!keys(ref.DateLocal,['Seconds'])||
   ref.DateLocal.Seconds!==end.Date.Seconds)return null;
 return {eventName:'CheshireChaos',resolved:[{conditionItemId:common.Condition,original}],
   boundedLocalDateGate:{conditionItemId:common.Condition,missionItemId:mission.Mission,
     startLocalSeconds:start.Date.Seconds,endLocalSeconds:end.Date.Seconds,original}};
}
export function eventRecurringLootLinks(rows,source,memories){
 const result=new Map(),sha=source.sourceFilesSha256;
 if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
  source.sourceIl2cppDumpSha256!=='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'||
  !Object.entries(PIN).every(([k,v])=>sha[k]===v))return result;
 const known=new Map(rows.map(r=>[r.itemId,r])),sources=new Set();
 let occurrences=0;
 for(const event of rows){
  if(event.nativeCategory!=='ConditionalEvent')continue;
  const p=props(event),ref=p.RecurringEvent;
  if(!keys(ref,['RecurringEventItemID','DateUTC','DateLocal','Duration'])||!id(ref.RecurringEventItemID))continue;
  const gate=activeEvent(p.Conditions,known)??boundedLocalEvent(p.Conditions,ref,known,sha);
  if(!gate)continue;
  const recur=known.get(ref.RecurringEventItemID),rp=props(recur);
  if(recur?.sourceClass!=='ItemSpawningRecurringEventItemData'||!keys(rp.ItemList,['Items'])||
    !Array.isArray(rp.ItemList.Items)||!rp.ItemList.Items.length||!id(rp.MinNumberOfSpawn)||
    !id(rp.MaxNumberOfSpawn)||rp.MinNumberOfSpawn>rp.MaxNumberOfSpawn||
    (rp.Conditions!==undefined&&(!keys(rp.Conditions,[])||Object.keys(rp.Conditions).length)))continue;
  for(const [si,entry] of rp.ItemList.Items.entries()){
   if(!keys(entry,['ItemID','Weight'])||!id(entry.ItemID)||!id(entry.Weight))continue;
   const spawned=known.get(entry.ItemID),ep=props(spawned);
   const blocker=spawned?.sourceClass==='FurnitureBlockerItemData';
   // RemoveBlocker.ProcessRemovalAndRewards (RVA 4951ea0) reads the
   // blocker's table ID at +0x50 (49528dc), then calls GenerateThis
   // at 4952a76. Only exact reviewed bounded-event blockers are admitted.
   if(blocker?(!gate.boundedLocalDateGate||!id(ep.RewardLootTableItemID)||id(ep.DefaultRewardItemID)):
      (spawned?.sourceClass!=='EphemeralItemData'||!id(ep.TreasureLootTable)))continue;
   const table=known.get(blocker?ep.RewardLootTableItemID:ep.TreasureLootTable);
   if(table?.nativeCategory!=='LootTable')continue;
   const base={kind:blocker?'event_recurring_blocker_loot':'event_recurring_ephemeral_loot',category:'in_game_limited_event',sourceItemId:event.itemId,
    recurringEventItemId:recur.itemId,tableItemId:table.itemId,
    ...(blocker?{blockerItemId:spawned.itemId,blockerSourcePath:'source.RewardLootTableItemID',
      sourceFurnitureSha256:sha.Furniture,sourceMissionSha256:sha.Mission,boundedLocalDateGate:gate.boundedLocalDateGate}:
      {ephemeralItemId:spawned.itemId,ephemeralSourcePath:'source.TreasureLootTable'}),
    eventName:gate.eventName,conditions:p.Conditions,resolvedConditions:gate.resolved,recurringActivation:ref,
    sourcePath:'source.RecurringEvent.RecurringEventItemID',recurringSourcePath:'source.ItemList.Items['+si+'].ItemID',
    configuredSpawnWeight:entry.Weight,
    configuredSpawnMinimum:rp.MinNumberOfSpawn,configuredSpawnMaximum:rp.MaxNumberOfSpawn,
    sourceGameVersion:source.target.gameVersion,sourceEventSha256:sha.ConditionalEvent,sourceRecurringEventSha256:sha.RecurringEvent,
    sourceConditionSha256:sha.Condition,sourceActivityItemSha256:sha.ActivityItem,sourceLootTableSha256:sha.LootTable,
    sourceMemorySha256:sha.MemoryShard,nativeAssemblySha256:'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653',
    currentAvailabilityVerified:false,guaranteedGrantVerified:false};
   for(const [gi,g] of (props(table).Rewards?.SubLootTables??[]).entries()){
    if(!eligibleExplicitLootGroup(g))continue;
    for(const [ii,v] of (g.Items??[]).entries()){
     const t=known.get(v.ItemID);
     if(!t||!['MemoryShard','ActivityItem','Furniture','Clothing','Companion','Currency','BoardGame','Skin','Trimming','Tool','Building'].includes(t.nativeCategory))continue;
     const memory=memories.get(v.ItemID),index=v.State?.MemoryShardIndex;
     if(memory&&(!Number.isSafeInteger(index)||index<0||index>=memory.configuredShardCount))continue;
     if(t.nativeCategory==='MemoryShard'&&!memory)continue;
     const path='source.Rewards.SubLootTables['+gi+'].Items['+ii+']';
     const emit=(target,tail,extra)=>{
      const list=result.get(target)??[];
      list.push({...base,targetItemId:target,tableSourcePath:path+tail,
       minimumRolls:g.Min,maximumRolls:g.Max,configuredWeight:g.Weight??null,...extra});
      result.set(target,list);occurrences++;sources.add(event.itemId);
     };
     emit(v.ItemID,'.ItemID',memory?{shardIndex:index,configuredShardCount:memory.configuredShardCount}:{});
     const nested=v.State?.ConsummableData,nm=memories.get(nested?.ItemID),ni=nested?.State?.MemoryShardIndex;
     if(t.sourceClass==='ConsummableItemData'&&nm&&keys(v.State,['ConsummableData'])&&
       keys(nested,['ItemID','Amount','State'])&&id(nested.Amount)&&keys(nested.State,['MemoryShardIndex'])&&
       Number.isSafeInteger(ni)&&ni>=0&&ni<nm.configuredShardCount){
       emit(nested.ItemID,'.State.ConsummableData.ItemID',{orbItemId:v.ItemID,configuredConsumableAmount:nested.Amount,
         shardIndex:ni,configuredShardCount:nm.configuredShardCount});
     }
    }
   }
  }
 }
 console.log('DB01_EVENT_RECURRING_LOOT '+JSON.stringify({events:sources.size,items:result.size,occurrences}));
 return result;
}
