/** Source-backed historical profile migration grants. Not standing acquisition.
 * ProfileConditionalUpdateList.Actions -> ConditionalActions.Actions.GiveItem.
 * Native ActionGiveItem.Apply RVA 4F2E740 calls AddItem RVA 4F3F290.
 * Profile version eligibility and actual execution remain unverified.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const id=n=>Number.isSafeInteger(n)&&n>0;
const check=(ok,c)=>{if(!ok)throw Error('DB01_PROFILE_UPDATE_GRANT_'+c)};
export function loadProfileUpdateGrants(project,source,byId,protoSha){
 const result=new Map();
 if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2')return result;
 const bytes=readFileSync(join(project,'data/ddv/item-master/profile-update-grants-steam-1.26.2.json'));
 check(createHash('sha256').update(bytes).digest('hex')==='04006751577950b969f9b4f8f7544109b995d4235dfc626e9520d8d4938c95b7','PROJECTION');
 const d=JSON.parse(bytes);
 check(d.schema==='wand.db01.profile-update-grants@1'&&d.source.platform==='Steam'&&d.source.gameVersion===source.target.gameVersion&&
   d.source.protoDbSha256===protoSha&&protoSha==='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'&&
   d.source.il2cppDumpSha256===source.sourceIl2cppDumpSha256&&source.sourceIl2cppDumpSha256==='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'&&
   d.source.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&d.updates.length===8,'SOURCE');
 const names=new Set();let occurrences=0,canonicalOccurrences=0;
 for(const [updateId,updateRecordIndex,updateRecordSha256,updatePayloadSha256,updateActionPosition,sourceId,sourceRecordIndex,sourceRecordSha256,sourcePayloadSha256,conditions,grants] of d.updates){
   check(/^ProfileUpdate[A-Za-z0-9_]+$/.test(updateId)&&/^[A-Za-z0-9_]+$/.test(sourceId)&&!names.has(sourceId)&&
     [updateRecordIndex,updateActionPosition,sourceRecordIndex].every(n=>Number.isSafeInteger(n)&&n>=0)&&
     [updateRecordSha256,updatePayloadSha256,sourceRecordSha256,sourcePayloadSha256].every(s=>/^[a-f0-9]{64}$/.test(s))&&
     Array.isArray(conditions)&&Array.isArray(grants)&&grants.length>0,'RECORD');
   names.add(sourceId);
   const conditionItemIds=[];
   for(const condition of conditions){
     const entries=Object.entries(condition);
     check(entries.length===1&&['CharacterFriendship','Inventory','MissionStatus','Expansion'].includes(entries[0][0]),'CONDITION');
     const [kind,p]=entries[0];
     const target=kind==='CharacterFriendship'?p.Character:kind==='Inventory'?p.Item:kind==='MissionStatus'?p.Mission:null;
     if(target!==null){check(id(target),'CONDITION_TARGET');conditionItemIds.push(target);}
   }
   for(const [sourcePosition,targetItemId,configuredAmount] of grants){
     check(Number.isSafeInteger(sourcePosition)&&sourcePosition>=0&&id(targetItemId)&&id(configuredAmount),'GRANT');
     occurrences++;
     if(!byId.has(targetItemId))continue;
     const list=result.get(targetItemId)??[];
     list.push({kind:'profile_update_grant',sourceId,targetItemId,configuredAmount,sourcePosition,
       sourcePath:'Actions['+sourcePosition+'].GiveItem',updateId,updateRecordIndex,updateRecordSha256,updatePayloadSha256,updateActionPosition,
       sourceRecordIndex,sourceRecordSha256,sourcePayloadSha256,conditions:{Conditions:conditions},conditionItemIds:[...new Set(conditionItemIds)],
       sourceGameVersion:source.target.gameVersion,sourceProtoDbSha256:protoSha,sourceProjectionSha256:'04006751577950b969f9b4f8f7544109b995d4235dfc626e9520d8d4938c95b7',
       nativeAssemblySha256:d.source.nativeAssemblySha256,nativeGrantActionVerified:true,
       profileVersionEligibilityVerified:false,standingAcquisitionVerified:false,currentAvailabilityVerified:false,guaranteedGrantVerified:false});
     result.set(targetItemId,list);canonicalOccurrences++;
   }
 }
 check(occurrences===14,'CENSUS');
 console.log('DB01_PROFILE_UPDATE_GRANTS '+JSON.stringify({updates:names.size,occurrences,canonicalOccurrences,canonicalItems:result.size}));
 return result;
}
