/** Build-only source facts. Individual friendship rewards are distinct from
 * default-level rewards. Shop display lists and design unlock gates are not
 * proven live sales/grants. All projections are keyed by canonical Item ID.
 */
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadConfiguredInventorySources} from './configured-inventory-sources.mjs';
import {loadContainerFurnitureSources} from './container-furniture-sources.mjs';
const SHA=/^[a-f0-9]{64}$/;
const check=(ok,code)=>{if(!ok)throw Error('DB01_PROTODB_ACQUISITION_'+code)};
const digest=b=>createHash('sha256').update(b).digest('hex');
export function loadProtoDbAcquisition(project,source,byId){
  const version=source.target.gameVersion;
  check(/^\d+\.\d+\.\d+$/.test(version),'VERSION');
  const path=join(project,'data/ddv/item-master','original-protodb-acquisition-steam-'+version+'.json');
  const result={byItem:new Map(),byOwner:new Map(),shopDisplay:new Map(),preDlc:new Map(),designUnlock:new Map(),inventoryTemplates:new Map(),containerFurniture:new Map()};
  if(!existsSync(path))return result;
  const d=JSON.parse(readFileSync(path,'utf8'));
  check(d.schema==='wand.db01.original-protodb-acquisition@1'&&d.target.platform==='Steam'&&
    d.target.gameVersion===version&&SHA.test(d.sourceProtoDbSha256)&&
    d.sourceIl2cppDumpSha256===source.sourceIl2cppDumpSha256&&
    ['Furniture','Clothing','Trimming'].every(k=>d.sourceFiles[k]===source.sourceFilesSha256[k]),'SOURCE');
  check(Object.keys(d.sourceRecords).length===4&&['Friendship','PetFriendship','Store_Default','Store_PreDLC'].every(k=>{
    const a=d.sourceRecords[k];return Array.isArray(a)&&a.length===2&&Number.isSafeInteger(a[0])&&a[0]>=0&&SHA.test(a[1]);
  }),'RECORDS');
  const bytes=inflateSync(Buffer.from(d.packed,'base64'),{maxOutputLength:8*1024*1024});
  check(bytes.length===d.payloadBytes&&digest(bytes)===d.payloadSha256,'PAYLOAD_SHA');
  const [characters,pets,store,preDlc,design]=JSON.parse(bytes);
  const item=(id,category)=>Number.isSafeInteger(id)&&id>0&&byId.has(id)&&(!category||byId.get(id).nativeCategory===category);
  const add=(map,id,value)=>{const list=map.get(id)??[];list.push(value);map.set(id,list);};
  for(const [list,kind,category,record,ownerCount,rewardCount] of [
    [characters,'character_friendship_reward','Character','Friendship',d.coverage.characterOwners,d.coverage.characterRewardOccurrences],
    [pets,'pet_friendship_reward','Companion','PetFriendship',d.coverage.petOwners,d.coverage.petRewardOccurrences]
  ]){
    check(Array.isArray(list)&&list.length===ownerCount,'OWNER_CENSUS');
    let count=0;const seen=new Set();
    for(const [owner,rewards] of list){
      check(item(owner,category)&&!seen.has(owner)&&Array.isArray(rewards)&&rewards.length>0,'OWNER');
      seen.add(owner);const levels=new Set();
      for(const [level,id,amount] of rewards){
        check(Number.isSafeInteger(level)&&level>=1&&level<=10&&!levels.has(level)&&item(id)&&
          (amount===null||Number.isSafeInteger(amount)&&amount>0),'REWARD');
        levels.add(level);count++;
        const shared={kind,sourceId:owner,level,rewardStage:'Tier1Reward',amount,
          sourceRecord:record,sourceRecordIndex:d.sourceRecords[record][0],
          sourceProtoDbSha256:d.sourceProtoDbSha256,currentAvailabilityVerified:false};
        add(result.byItem,id,shared);
        add(result.byOwner,owner,{...shared,itemId:id});
      }
    }
    check(count===rewardCount,'REWARD_CENSUS');
  }
  check(result.byItem.size===d.coverage.friendshipItemIds,'ITEM_CENSUS');
  check(Array.isArray(store)&&store.length===2&&Array.isArray(preDlc)&&preDlc.length===1,'STORE_SHAPE');
  for(const [i,category,n] of [[0,'Furniture',d.coverage.storeFurniture],[1,'Clothing',d.coverage.storeClothing]]){
    check(Array.isArray(store[i])&&store[i].length===n&&new Set(store[i]).size===n&&store[i].every(id=>item(id,category)),'STORE_LIST');
    store[i].forEach((id,index)=>result.shopDisplay.set(id,{kind:'configured_store_display',sourceId:'Store_Default',
      sourceRecordIndex:d.sourceRecords.Store_Default[0],sourceField:i===0?'FurnituresToDisplay':'ClothingsToDisplay',
      sourcePosition:index,sourceProtoDbSha256:d.sourceProtoDbSha256,currentAvailabilityVerified:false}));
  }
  check(preDlc[0].length===d.coverage.preDlcItems&&new Set(preDlc[0]).size===preDlc[0].length&&
    preDlc[0].every(id=>item(id,'Furniture')||item(id,'Clothing')),'PREDLC_LIST');
  preDlc[0].forEach((id,index)=>result.preDlc.set(id,{kind:'pre_dlc_store_list_member',sourceId:'Store_PreDLC',
    sourceRecordIndex:d.sourceRecords.Store_PreDLC[0],sourceField:'ItemListPreDLC',sourcePosition:index,
    sourceProtoDbSha256:d.sourceProtoDbSha256,currentAvailabilityVerified:false}));
  check(Array.isArray(design)&&design.length===d.coverage.designUnlocks,'DESIGN_CENSUS');
  for(const [id,challenge,index] of design){
    check((item(id,'Furniture')||item(id,'Clothing')||item(id,'Trimming'))&&!result.designUnlock.has(id)&&
      typeof challenge==='string'&&/^DreamSnap[A-Za-z0-9_]+$/.test(challenge)&&
      Number.isSafeInteger(index)&&index>=0&&
      byId.get(id).sourceAttributes?.CatalogVisibilityConditions?.UnlockedByDesignChallenge===challenge,'DESIGN_UNLOCK');
    result.designUnlock.set(id,{kind:'design_challenge_catalog_unlock',sourceId:challenge,
      sourceRecordIndex:index,sourceField:'CatalogVisibilityConditions.UnlockedByDesignChallenge',
      sourceProtoDbSha256:d.sourceProtoDbSha256,currentAvailabilityVerified:false});
  }
  result.inventoryTemplates=loadConfiguredInventorySources(project,source,byId,d.sourceProtoDbSha256);
  result.containerFurniture=loadContainerFurnitureSources(project,source,byId,d.sourceProtoDbSha256,result.inventoryTemplates);
  console.log('DB01_PROTO_ACQUISITION '+JSON.stringify({friendshipItems:result.byItem.size,
    friendshipOwners:result.byOwner.size,storeDisplay:result.shopDisplay.size,
    preDlc:result.preDlc.size,designUnlock:result.designUnlock.size}));
  return result;
}
