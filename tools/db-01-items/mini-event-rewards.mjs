/** MiniEventData.Rewards is an event association, not a grant action.
 * Native get_TimeLimitedItems (RVA 3711D40) projects ItemId (3716150)
 * and excludes ItemType.ActivityItem=3/Currency=8 (37161B0).
 * TestEv is excluded. Missing Amount/FeaturingPriority stays null.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const id=n=>Number.isSafeInteger(n)&&n>0;
const check=(ok,c)=>{if(!ok)throw Error('DB01_MINI_EVENT_'+c)};
export function loadMiniEventRewards(project,source,byId,protoSha){
 const result=new Map();
 if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2')return result;
 const bytes=readFileSync(join(project,'data/ddv/item-master/mini-event-rewards-steam-1.26.2.json'));
 check(createHash('sha256').update(bytes).digest('hex')==='15e7e08a8eb1555a0e431512f4273a3275bb239ec9b453eb738915c4b624dc8d','PROJECTION_PIN');
 const d=JSON.parse(bytes);
 check(d.schema==='wand.db01.mini-event-rewards@1'&&d.source.platform==='Steam'&&d.source.gameVersion===source.target.gameVersion&&
   d.source.protoDbSha256===protoSha&&protoSha==='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'&&
   d.source.il2cppDumpSha256===source.sourceIl2cppDumpSha256&&source.sourceIl2cppDumpSha256==='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'&&
   d.source.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&d.events.length===18,'SOURCE');
 const records=new Set(),ids=new Set(),eligible=new Set();let occurrences=0,eligibleOccurrences=0,canonicalOccurrences=0;
 for(const [eventId,recordIndex,recordSha,payloadSha,rewards] of d.events){
   check(/^[A-Za-z][A-Za-z0-9_]+$/.test(eventId)&&eventId!=='TestEv'&&recordIndex>=1947&&recordIndex<=1965&&recordIndex!==1949&&
     !records.has(recordIndex)&&/^[a-f0-9]{64}$/.test(recordSha)&&/^[a-f0-9]{64}$/.test(payloadSha)&&Array.isArray(rewards),'RECORD');
   records.add(recordIndex);
   for(const [sourcePosition,[targetItemId,configuredAmount,featuringPriority]] of rewards.entries()){
     check(id(targetItemId)&&(configuredAmount===null||id(configuredAmount))&&(featuringPriority===null||id(featuringPriority)),'REWARD');
     ids.add(targetItemId);occurrences++;
     if([3,8].includes(Math.floor(targetItemId/10000000)))continue;
     eligible.add(targetItemId);eligibleOccurrences++;
     const row=byId.get(targetItemId);
     if(!row)continue;
     check(!['ActivityItem','Currency'].includes(row.nativeCategory),'NATIVE_CATEGORY');
     const list=result.get(targetItemId)??[];
     list.push({kind:'mini_event_reward_association',category:'in_game_limited_event',eventId,targetItemId,configuredAmount,featuringPriority,
       sourcePosition,sourcePath:'Rewards['+sourcePosition+'].ItemId',sourceRecordIndex:recordIndex,sourceRecordSha256:recordSha,
       sourcePayloadSha256:payloadSha,sourceGameVersion:source.target.gameVersion,sourceProtoDbSha256:protoSha,
       nativeAssemblySha256:d.source.nativeAssemblySha256,nativeTimeLimitedMembershipVerified:true,
       exactGrantMechanismVerified:false,guaranteedGrantVerified:false,currentAvailabilityVerified:false});
     result.set(targetItemId,list);canonicalOccurrences++;
   }
 }
 check(occurrences===166&&ids.size===112&&eligibleOccurrences===163&&eligible.size===110,'CENSUS');
 console.log('DB01_MINI_EVENT_REWARDS '+JSON.stringify({events:records.size,occurrences,eligibleOccurrences,eligibleItems:eligible.size,canonicalOccurrences,canonicalItems:result.size}));
 return result;
}
