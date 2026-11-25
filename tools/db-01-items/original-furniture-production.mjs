/** Build-only original furniture field supplement. Positive default reward
 * references and the complete BeeHouse message, not actual reward grants. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const FURNITURE='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const FACTS='77f025abb2da6faa168b45ada59cf288aadf159e9753280cef02960e7d4ebac7';
const check=(v,c)=>{if(!v)throw Error('DB01_ORIGINAL_FURNITURE_PRODUCTION_'+c);};
export function attachOriginalFurnitureProduction(project,source,byId,agrees){
  if(source.target.platform!=='Steam'||source.sourceFilesSha256?.Furniture!==FURNITURE||
     source.sourceIl2cppDumpSha256!==DUMP)return;
  const bytes=readFileSync(join(project,'data/ddv/item-master','original-furniture-production-steam-1.26.2.json'));
  check(createHash('sha256').update(bytes).digest('hex')===FACTS,'SHA');
  const {blockerDefaultRewards,beeHouse}=JSON.parse(bytes.toString('utf8'));
  check(blockerDefaultRewards.length===63&&new Set(blockerDefaultRewards.map(r=>r[1])).size===52&&beeHouse.length===1,'CENSUS');
  const put=(row,key,value)=>{
    const p=row.sourceAttributes??(row.sourceAttributes={});
    if(Object.hasOwn(row.nativeProperties,key))check(agrees(row.nativeProperties[key],value),'NATIVE_CONFLICT_'+key);
    else{
      if(Object.hasOwn(p,key))check(agrees(p[key],value),'SOURCE_CONFLICT_'+key);
      p[key]=value;
    }
  };
  let previous=0;
  for(const [id,target] of blockerDefaultRewards){
    const r=byId.get(id);
    check(Number.isSafeInteger(id)&&id>previous&&r?.sourceClass==='FurnitureBlockerItemData'&&byId.has(target),'BLOCKER');
    previous=id;put(r,'DefaultRewardItemID',target);
  }
  for(const [id,x,y,target,min,max,cap] of beeHouse){
    const r=byId.get(id);
    check(r?.sourceClass==='FurnitureAncientMachineItemData'&&byId.get(target)?.nativeCategory==='ActivityItem'&&
      [x,y,min,max,cap].every(v=>Number.isSafeInteger(v)&&v>0)&&min<=max,'BEE_HOUSE');
    put(r,'BeeHouse',{EffectZoneSizeX:x,EffectZoneSizeY:y,ProducedItemID:target,
      MinProductionDuration:{Seconds:min},MaxProductionDuration:{Seconds:max},MaxProduced:cap});
  }
}
