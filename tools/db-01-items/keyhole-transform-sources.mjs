/** KeyholeConfig.TransformInto is a configured world transformation target,
 * not a verified inventory grant. Preserve levels, positive item requirements,
 * partial-size alternatives and field presence, without publishing raw states.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const id=n=>Number.isSafeInteger(n)&&n>0;
const check=(ok,c)=>{if(!ok)throw Error('DB01_KEYHOLE_TRANSFORM_'+c)};
export function loadKeyholeTransforms(project,source,byId,protoSha){
 const result=new Map();
 if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2')return result;
 const d=JSON.parse(readFileSync(join(project,'data/ddv/item-master/keyhole-transform-steam-1.26.2.json'),'utf8'));
 check(d.schema==='wand.db01.keyhole-transform@1'&&d.source.platform==='Steam'&&d.source.gameVersion===source.target.gameVersion&&
   d.source.protoDbSha256===protoSha&&protoSha==='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'&&
   d.source.il2cppDumpSha256===source.sourceIl2cppDumpSha256&&source.sourceIl2cppDumpSha256==='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'&&
   createHash('sha256').update(JSON.stringify(d.rows)).digest('hex')==='a30c153bd4769c36b0f3f881b5dc4a01d4f8b8b492794a440245afef47872082','SOURCE');
 let levels=0,requirements=0,canonicalOccurrences=0;const targets=new Set(),records=new Set();
 for(const [recordIndex,keyholeId,targetItemId,isBlueprint,keepItemsPlacement,transferToBackpack,trackOnlyBackpack,activeWhenPresent,activeWhenNonempty,configuredLevels] of d.rows){
   check(Number.isSafeInteger(recordIndex)&&recordIndex>=0&&!records.has(recordIndex)&&typeof keyholeId==='string'&&id(targetItemId)&&
     [isBlueprint,keepItemsPlacement,trackOnlyBackpack].every(x=>x===null||x===0||x===1)&&[null,0,1,2].includes(transferToBackpack)&&
     [0,1].includes(activeWhenPresent)&&[0,1].includes(activeWhenNonempty)&&Array.isArray(configuredLevels)&&configuredLevels.length>0,'RECORD');
   records.add(recordIndex);targets.add(targetItemId);
   const requirementLevels=configuredLevels.map(([partialSize,partialNoRepeatSize,items],levelIndex)=>{
     check((partialSize===null||id(partialSize))&&(partialNoRepeatSize===null||id(partialNoRepeatSize))&&
       (partialSize===null||partialNoRepeatSize===null)&&Array.isArray(items),'LEVEL');
     levels++;requirements+=items.length;
     return {levelIndex,partialSize,partialNoRepeatSize,neededItems:items.map(([itemId,configuredAmount,statePresent],sourcePosition)=>{
       check(id(itemId)&&id(configuredAmount)&&[0,1].includes(statePresent),'REQUIREMENT');
       return {itemId,configuredAmount,sourcePosition,statePresent:!!statePresent,canonicalItemResolved:byId.has(itemId)};
     })};
   });
   if(!byId.has(targetItemId))continue;
   const list=result.get(targetItemId)??[];
   list.push({kind:'keyhole_transform_target',keyholeId,targetItemId,sourceRecordIndex:recordIndex,sourcePath:'TransformInto',
     isBlueprint,keepItemsPlacement,transferToBackpack,trackOnlyBackpack,activeWhenPresent:!!activeWhenPresent,activeWhenNonempty:!!activeWhenNonempty,
     requirementLevels,sourceGameVersion:source.target.gameVersion,sourceProtoDbSha256:protoSha,sourceProjectionSha256:'a30c153bd4769c36b0f3f881b5dc4a01d4f8b8b492794a440245afef47872082',
     conditionsSemanticsVerified:false,requiredStateSemanticsVerified:false,inventoryGrantVerified:false,currentAvailabilityVerified:false});
   result.set(targetItemId,list);canonicalOccurrences++;
 }
 check(records.size===58&&targets.size===54&&levels===65&&requirements===193,'CENSUS');
 console.log('DB01_KEYHOLE_TRANSFORMS '+JSON.stringify({records:records.size,targets:targets.size,levels,requirements,canonicalOccurrences,canonicalItems:result.size}));
 return result;
}
