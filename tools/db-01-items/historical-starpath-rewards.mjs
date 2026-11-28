/** Historical original Switch season membership, not a live offer or
 * a verified claim. Resolve standalone vault definitions only by exact ref. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const SRC='36c2f64d849a5c7e2350b874e9e9443795c0675381a185d801649b587b093b60';
const DUMP='6e649926a8da4bc4f1d0bd4744ffaeea89701ef3c1a823b036e6733e915ba9a4';
const PAYLOAD='92396d259cb5db1f247d2d4b3826a3e8c0ffc2aecc226ff6c3049c2f416a3ff4';
const check=(ok,why)=>{if(!ok)throw Error('DB01_HISTORICAL_STARPATH_'+why)};
const id=v=>Number.isSafeInteger(v)&&v>0;
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const name=v=>typeof v==='string'&&/^[A-Za-z0-9_]+$/.test(v);
export function loadHistoricalStarpathRewards(project,source,rows){
  const byItem=new Map(),alternates=new Map();
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2')return {byItem,alternates,coverage:null};
  const raw=JSON.parse(readFileSync(join(project,'data/ddv/item-master/historical-starpath-rewards-switch-1.24.1.json'),'utf8'));
  check(raw.schema==='wand.db01.historical-starpath-rewards@1'&&raw.source.platform==='Switch'&&raw.source.gameVersion==='1.24.1'&&
    raw.source.protoDbSha256===SRC&&raw.source.il2cppDumpSha256===DUMP&&raw.source.protoDbRecords===3118&&
    raw.payloadSha256===PAYLOAD&&raw.payloadBytes===25500,'SOURCE');
  const bytes=inflateSync(Buffer.from(raw.packed,'base64'),{maxOutputLength:25500});
  check(bytes.length===25500&&createHash('sha256').update(bytes).digest('hex')===PAYLOAD,'PAYLOAD');
  const [seasons,vaults]=JSON.parse(bytes);
  check(seasons.length===23&&vaults.length===3,'RECORDS');
  const known=new Set(rows.map(r=>r.itemId)),seen=new Set(),vaultById=new Map(),linked=new Set(),allIds=new Set(),unresolved=new Set();
  let occurrences=0,matchedOccurrences=0,alternateOccurrences=0;
  for(const [key,index,digest,rewards] of vaults){
    check(name(key)&&!vaultById.has(key)&&Number.isSafeInteger(index)&&sha(digest)&&Array.isArray(rewards),'VAULT_RECORD');
    vaultById.set(key,{index,digest,rewards});
  }
  const emit=(itemId,amount,premium,alternate,seasonId,index,digest,kind,pageIndex,rewardIndex,vault)=>{
    check(id(itemId)&&id(amount)&&[null,0,1].includes(premium)&&(alternate===null||id(alternate)),'REWARD');
    occurrences++;allIds.add(itemId);
    const evidence={seasonId,kind,pageIndex,rewardIndex,configuredAmount:amount,premiumOnly:premium===1,
      premiumFieldPresent:premium!==null,sourcePlatform:'Switch',sourceGameVersion:'1.24.1',sourceProtoDbSha256:SRC,
      sourceSeasonRecordIndex:index,sourceSeasonSha256:digest,
      sourcePath:kind==='vault'?'VaultRewards.Id':(kind==='bonus'?'BonusRewards.Pages':'RewardsPages')+'['+pageIndex+'].Rewards['+rewardIndex+']',
      vaultRewardSourcePath:kind==='vault'?'Rewards['+rewardIndex+']':null,
      vaultDefinitionId:vault?.key??null,vaultDefinitionRecordIndex:vault?.index??null,vaultDefinitionSha256:vault?.digest??null,
      alternateItemId:alternate,guaranteedGrantVerified:false,currentAvailabilityVerified:false};
    if(known.has(itemId)){
      const list=byItem.get(itemId)??[];list.push(evidence);byItem.set(itemId,list);matchedOccurrences++;
    }else unresolved.add(itemId);
    if(alternate!==null&&known.has(alternate)){
      const list=alternates.get(alternate)??[];list.push({...evidence,primaryItemId:itemId,alternateCandidate:true});alternates.set(alternate,list);alternateOccurrences++;
    }
  };
  for(const [seasonId,index,digest,version,pages,bonus,vaultKey] of seasons){
    check(name(seasonId)&&!seen.has(seasonId)&&Number.isSafeInteger(index)&&sha(digest)&&version===null&&
      Array.isArray(pages)&&Array.isArray(bonus),'SEASON');seen.add(seasonId);
    for(const [kind,group] of [['normal',pages],['bonus',bonus]])for(const [pageIndex,page] of group.entries()){
      check(Array.isArray(page),'PAGE');
      for(const [rewardIndex,r] of page.entries())emit(...r,seasonId,index,digest,kind,pageIndex,rewardIndex,null);
    }
    if(vaultKey!==null){
      const vault=vaultById.get(vaultKey);check(vault,'VAULT_REF');linked.add(vaultKey);
      for(const [rewardIndex,r] of vault.rewards.entries())emit(...r,seasonId,index,digest,'vault',null,rewardIndex,{key:vaultKey,...vault});
    }
  }
  check(occurrences===1032&&allIds.size===863&&linked.size===2,'CENSUS');
  const coverage={seasons:seen.size,linkedVaultDefinitions:linked.size,unlinkedVaultDefinitions:vaultById.size-linked.size,
    occurrences,distinctHistoricalItemIds:allIds.size,matchedOccurrences,matchedItems:byItem.size,unresolvedItemIds:[...unresolved].sort((a,b)=>a-b),
    alternateOccurrences,alternateItems:alternates.size,seasonCatalogComplete:false,currentAvailabilityVerified:false};
  console.log('DB01_HISTORICAL_STARPATH '+JSON.stringify(coverage));
  return {byItem,alternates,coverage};
}
