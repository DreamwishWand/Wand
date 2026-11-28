/** Offline integration of original ProtoDb template evidence, not live contents or grants. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const SHA='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const CP='f0830f95341b52386a2268e146c2541229f02f1801b6f2ae2398b4b9b3b18e2f';
const DP='35f22a0dd42826921ce462c93b7a21910b2ff7c653a9b93a127a12bbeaab5813';
const check=(v,c)=>{if(!v)throw Error('DB01_CONFIGURED_INVENTORY_'+c)};
const names=['Backpack','HomeStorage','Catalog','Wardrobe','Pantry','Makeup','Trimming','Buildings','Decals','Skins','AvatarFeatures','Figurines','PhotoMode','MountGear','EnvironmentalFX'];
const counts=[0,3,4,74,0,42,8,6,90,14,25,0,12,11,0];
export function loadConfiguredInventorySources(project,source,byId,protoSha){
  const result=new Map();
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2')return result;
  check(protoSha===SHA,'PROTO');
  const load=(name,pin,schema)=>{
    const b=readFileSync(join(project,'static/acquisition/public',name+'-1.26.2.json'));
    check(createHash('sha256').update(b).digest('hex')===pin,'PIN_'+name);
    const d=JSON.parse(b);
    check(d.schema===schema&&d.target.platform==='Steam'&&d.target.gameVersion==='1.26.2'&&
      d.source.originalProtoDbSha256===SHA&&d.source.originalProtoDbBytes===1335720,'SOURCE_'+name);
    return d;
  };
  const c=load('container-inventory',CP,'wand.db02.static-container-contents@1');
  const d=load('default-inventories',DP,'wand.db02.static-default-inventories@1');
  check(c.source.originalRecordType==='Meta.ContainerInventory'&&c.source.originalFileEquivalentTo1262===true&&
    c.source.personalSaveContentsIncluded===false&&c.source.guaranteedLootVerified===false&&
    c.source.liveContentsVerified===false&&c.source.containerSpawnVerified===false&&
    d.source.recordType==='Meta.DefaultInventories'&&d.source.byteEquivalentToTargetVersion===true&&
    d.source.privateSaveIncluded===false&&d.source.playerInventoryVerified===false&&
    d.source.newPlayerGrantVerified===false&&d.source.configuredDefaultsOnly===true,'SEMANTICS');
  const cids=new Set(),dids=new Set(),templates=new Set();
  let slots=0,entries=0,populated=0,canonical=0,unindexed=0;
  function add(row,kind,name,type,field,pin,ids){
    check(Array.isArray(row)&&row.length===3,'TUPLE');
    const [pos,raw,amount]=row,i=Number(raw);
    check(Number.isSafeInteger(pos)&&pos>=0&&typeof raw==='string'&&/^[1-9][0-9]{0,15}$/.test(raw)&&
      Number.isSafeInteger(i)&&Number.isSafeInteger(amount)&&amount>0,'ENTRY');
    ids.add(i);
    if(!byId.has(i)){unindexed++;return;}
    canonical++;
    const list=result.get(i)??[];
    list.push({kind,sourceId:name,sourcePosition:pos,configuredAmount:amount,sourceInventoryType:type,
      sourceFieldNumber:field,sourceGameVersion:'1.26.1',sourceProtoDbSha256:SHA,sourceProjectionSha256:pin,
      currentAvailabilityVerified:false,grantVerified:false,playerOwnershipVerified:false});
    result.set(i,list);
  }
  check(c.containers.length===88&&d.groups.length===15,'GROUP_COUNT');
  for(const [name,rows] of c.containers){
    check(typeof name==='string'&&/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,100}$/.test(name)&&
      !templates.has(name)&&Array.isArray(rows),'CONTAINER');
    templates.add(name);if(rows.length)populated++;
    let previous=-1;
    for(const row of rows){
      check(row[0]>previous,'SLOT_ORDER');previous=row[0];slots++;
      add(row,'configured_container_slot',name,'container',3,CP,cids);
    }
  }
  for(const [j,[name,field,type,rows]] of d.groups.entries()){
    check(name===names[j]&&field===j+1&&type===(j<2?'container':'list')&&rows.length===counts[j],'DEFAULT_GROUP');
    for(const [index,row] of rows.entries()){
      check(row[0]===index,'ENTRY_ORDER');entries++;
      add(row,'configured_default_inventory_entry',name,type,field,DP,dids);
    }
  }
  check(populated===84&&slots===146&&entries===289&&cids.size===115&&dids.size===288&&
    new Set([...cids,...dids]).size===401,'CENSUS');
  console.log('DB01_CONFIGURED_INVENTORIES '+JSON.stringify({sourceOccurrences:slots+entries,canonicalOccurrences:canonical,
    sourceOnlyOccurrences:unindexed,canonicalItemCount:result.size,sourceDistinctItemIds:401}));
  return result;
}
