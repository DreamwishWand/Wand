/** Source-configured seasonal recurring spawn -> ephemeral loot -> item.
 * PullWeed calls EphemeralItemData.get_TreasureLootTableItem (RVA 3b83af0)
 * at 49e7339 and 49e73ab. Explicit list and positive event predicate only.
 * Keep date-only and generic random item generators separate.
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
  const gate=activeEvent(p.Conditions,known);
  if(!gate)continue;
  const recur=known.get(ref.RecurringEventItemID),rp=props(recur);
  if(recur?.sourceClass!=='ItemSpawningRecurringEventItemData'||!keys(rp.ItemList,['Items'])||
    !Array.isArray(rp.ItemList.Items)||!rp.ItemList.Items.length||!id(rp.MinNumberOfSpawn)||
    !id(rp.MaxNumberOfSpawn)||rp.MinNumberOfSpawn>rp.MaxNumberOfSpawn||
    (rp.Conditions!==undefined&&(!keys(rp.Conditions,[])||Object.keys(rp.Conditions).length)))continue;
  for(const [si,entry] of rp.ItemList.Items.entries()){
   if(!keys(entry,['ItemID','Weight'])||!id(entry.ItemID)||!id(entry.Weight))continue;
   const ephemeral=known.get(entry.ItemID),ep=props(ephemeral);
   if(ephemeral?.sourceClass!=='EphemeralItemData'||!id(ep.TreasureLootTable))continue;
   const table=known.get(ep.TreasureLootTable);
   if(table?.nativeCategory!=='LootTable')continue;
   const base={kind:'event_recurring_ephemeral_loot',category:'in_game_limited_event',sourceItemId:event.itemId,
    recurringEventItemId:recur.itemId,ephemeralItemId:ephemeral.itemId,tableItemId:table.itemId,
    eventName:gate.eventName,conditions:p.Conditions,resolvedConditions:gate.resolved,recurringActivation:ref,
    sourcePath:'source.RecurringEvent.RecurringEventItemID',recurringSourcePath:'source.ItemList.Items['+si+'].ItemID',
    ephemeralSourcePath:'source.TreasureLootTable',configuredSpawnWeight:entry.Weight,
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
     const list=result.get(v.ItemID)??[];
     list.push({...base,targetItemId:v.ItemID,tableSourcePath:'source.Rewards.SubLootTables['+gi+'].Items['+ii+'].ItemID',
      minimumRolls:g.Min,maximumRolls:g.Max,configuredWeight:g.Weight??null,
      ...(memory?{shardIndex:index,configuredShardCount:memory.configuredShardCount}:{})});
     result.set(v.ItemID,list);occurrences++;sources.add(event.itemId);
    }
   }
  }
 }
 console.log('DB01_EVENT_RECURRING_LOOT '+JSON.stringify({events:sources.size,items:result.size,occurrences}));
 return result;
}
