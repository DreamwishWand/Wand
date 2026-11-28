/** Exact ProtoDb level tables. ProfilePlayer.GetLevelRewards and
 * GetDesignerLevelRewards select oldLevel < configured level <= newLevel.
 * Initial level 1 is retained in the source table, not inferred as a grant.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const id=n=>Number.isSafeInteger(n)&&n>0;
const check=(ok,c)=>{if(!ok)throw Error('DB01_PROFILE_LEVEL_'+c)};
export function buildProfileLevelRewards(project,source,rows,protoSha){
 const result=new Map();
 if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2')return result;
 const d=JSON.parse(readFileSync(join(project,'data/ddv/item-master/profile-level-rewards-steam-1.26.2.json'),'utf8'));
 check(d.schema==='wand.db01.profile-level-rewards@1'&&d.source.platform==='Steam'&&d.source.gameVersion===source.target.gameVersion&&
   d.source.protoDbSha256===protoSha&&protoSha==='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'&&
   d.source.il2cppDumpSha256===source.sourceIl2cppDumpSha256&&source.sourceIl2cppDumpSha256==='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'&&
   d.source.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&d.tables.length===2,'SOURCE');
 const known=new Set(rows.map(r=>r.itemId));
 const pins=[{"kind":"player_level_reward","record":"PlayerInfo","recordIndex":401,"recordSha256":"bc6f11a35b1bf3ca70c15a02ce1ae56981b2fcfbfdfc061b7852ed1ec925817a","payloadSha256":"47f95b74ada81d0a435b93b9636e3aa5105898ad3c5757816c7ffbb394471f7b","pointKind":"xp"},{"kind":"designer_level_reward","record":"DesignerLevelInfo","recordIndex":230,"recordSha256":"200d4eec21f964b1746920771f371497245fd7ff3d3dd7d4a5d4c58af0ae56a6","payloadSha256":"a4c350f1a891437e5b9c55c8b427502fb2d15d8952fe53372157786cb55f93b9","pointKind":"pixel_dust"}];
 let occurrences=0;
 for(const [i,t] of d.tables.entries()){
   const p=pins[i];check(Object.entries(p).every(([k,v])=>t[k]===v)&&t.levels.length===(i?9:50),'TABLE');
   let previous=-1;
   for(const [j,[level,points,rewards]] of t.levels.entries()){
     check(level===j+(i?2:1)&&Number.isSafeInteger(points)&&points>previous&&Array.isArray(rewards)&&rewards.length===(i?1:level===48?2:level===50?0:1),'LEVEL');
     previous=points;
     for(const [position,[targetItemId,configuredAmount]] of rewards.entries()){
       check(id(targetItemId)&&known.has(targetItemId)&&id(configuredAmount),'REWARD');
       if(level===1)continue;
       const l=result.get(targetItemId)??[];
       l.push({kind:t.kind,category:'ordinary_gameplay',targetItemId,configuredAmount,level,configuredPoints:points,pointKind:t.pointKind,
         sourcePath:i?'DesignerLevels['+j+'].ItemReward':'PlayerLevels['+j+'].ItemRewards['+position+']',
         sourceRecord:t.record,sourceRecordIndex:t.recordIndex,sourceRecordSha256:t.recordSha256,sourcePayloadSha256:t.payloadSha256,
         sourceGameVersion:source.target.gameVersion,sourceProtoDbSha256:protoSha,nativeAssemblySha256:d.source.nativeAssemblySha256,
         selectionRule:'old_level_exclusive_new_level_inclusive',currentAvailabilityVerified:false,guaranteedGrantVerified:false});
       result.set(targetItemId,l);occurrences++;
     }
   }
 }
 check(occurrences===58&&result.size===57,'CENSUS');
 console.log('DB01_PROFILE_LEVEL_REWARDS '+JSON.stringify({items:result.size,occurrences}));
 return result;
}
