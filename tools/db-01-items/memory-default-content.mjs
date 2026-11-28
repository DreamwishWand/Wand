/** Build-only exact ConsummableItemData.DefaultItem memory content.
 * Native ConsumeItem ValidateThis and ApplyThis select the explicit state
 * ConsummableData first; TryGetDefaultContent is the fallback only.
 * Never propagate a category from a shared orb or a stateful grant.
 */
const ACT='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2';
const MEM='e5c017b208dc50e3e4b543a143fe57400429d67151d5fd68938fbda0a4ef5367';
const MIS='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const EVENT='693c0f5625ac37b45bbb9543766a99601f854cbdd371c096c39509689f573d47';
const COND='9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
const NATIVE='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653';
const id=n=>Number.isSafeInteger(n)&&n>0;
const props=r=>({...r?.nativeProperties,...r?.sourceAttributes});
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const push=(m,k,v)=>{const list=m.get(k)??[];list.push(v);m.set(k,list);};
export function buildMemoryDefaultContent(rows,source,memories,flows,objectives){
 const candidates=new Map(),classified=new Map(),sha=source.sourceFilesSha256;
 if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
   source.sourceIl2cppDumpSha256!=='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'||
   sha.ActivityItem!==ACT||sha.MemoryShard!==MEM||sha.Mission!==MIS||sha.ConditionalEvent!==EVENT||sha.Condition!==COND)
   return {candidates,classified};
 const known=new Map(rows.map(r=>[r.itemId,r]));
 let total=0,invalid=0;
 const routeCounts={};
 for(const orb of rows){
   if(orb.nativeCategory!=='ActivityItem'||orb.sourceClass!=='ConsummableItemData')continue;
   const payload=props(orb).DefaultItem,mem=memories.get(payload?.ItemID);
   if(mem?.appearanceConditionCode!==9)continue;
   total++;
   const index=payload.State?.MemoryShardIndex;
   const valid=exact(payload,['ItemID','Amount','State'])&&id(payload.Amount)&&exact(payload.State,['MemoryShardIndex'])&&
     Number.isSafeInteger(index)&&index>=0&&index<mem.configuredShardCount;
   if(!valid)invalid++;
   const base={orbItemId:orb.itemId,targetItemId:payload.ItemID,defaultSourcePath:'source.DefaultItem.ItemID',
     defaultContent:payload,configuredConsumableAmount:id(payload.Amount)?payload.Amount:null,
     shardIndex:Number.isSafeInteger(index)?index:null,configuredShardCount:mem.configuredShardCount,shardIndexValid:valid,
     sourceGameVersion:source.target.gameVersion,sourceActivityItemSha256:ACT,sourceMemorySha256:MEM,
     nativeAssemblySha256:NATIVE,currentAvailabilityVerified:false,guaranteedGrantVerified:false};
   push(candidates,payload.ItemID,base);
   if(!valid)continue;
   const emit=(routeKind,category,sourceItemId,sourcePath,configuredGrantAmount,extra)=>{
     if(!['ordinary_gameplay','in_game_limited_event'].includes(category)||!id(configuredGrantAmount)||!id(sourceItemId))return;
     push(classified,payload.ItemID,{...base,kind:'memory_default_consumable_grant',routeKind,category,sourceItemId,sourcePath,
       configuredGrantAmount,explicitGrantStateAbsent:true,...extra});
     routeCounts[routeKind]=(routeCounts[routeKind]??0)+1;
   };
   // Original intro exporter requires direct Item choice with only field 1;
   // no state override. Ingredient selectors are deliberately not admitted.
   for(const l of flows.ordinaryIntro.get(orb.itemId)??[]){
     const f=flows.byQuest.get(l.questId)?.[l.flowIndex];
     if(f?.selectorKind!=='item'||f.itemId!==orb.itemId)continue;
     emit('quest_intro','ordinary_gameplay',l.questId,l.sourcePath,l.configuredAmount,{sourceMissionSha256:MIS});
   }
   for(const l of objectives.get(orb.itemId)??[]){
     if(!exact(l.originalGrant?.ItemToGive?.ItemToGive?.Item?.Item,['Item'])||
       l.originalGrant.ItemToGive.ItemToGive.Item.Item.Item!==orb.itemId)continue;
     emit('quest_objective',l.category,l.sourceItemId,l.sourcePath,l.configuredAmount,{sourceMissionSha256:MIS});
   }
   // GiveItem uses repeated ItemInstance. Only exact state-free entries are
   // eligible. Mailbox and swap are separate, not assumed equivalent.
   for(const l of flows.conditionalQuest.get(orb.itemId)??[]){
     if(l.role!=='conditional_grant')continue;
     const i=/^source\.GiveItem\.Items\[(\d+)\]\.ItemID$/.exec(l.sourcePath);
     const grant=i&&props(known.get(l.sourceItemId)).GiveItem?.Items?.[Number(i[1])];
     if(!exact(grant,['ItemID','Amount'])||grant.ItemID!==orb.itemId||grant.Amount!==l.configuredAmount)continue;
     emit('conditional_grant',l.category,l.sourceItemId,l.sourcePath,l.configuredAmount,{sourceEventSha256:EVENT,sourceConditionSha256:COND});
   }
 }
 if(total!==113||candidates.size!==94||invalid!==2)throw Error('DB01_MEMORY_DEFAULT_CENSUS '+JSON.stringify({total,items:candidates.size,invalid}));
 console.log('DB01_MEMORY_DEFAULT_CONTENT '+JSON.stringify({orbs:total,memories:candidates.size,invalid,classifiedItems:classified.size,routeCounts}));
 return {candidates,classified};
}
