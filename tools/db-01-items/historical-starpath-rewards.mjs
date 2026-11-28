/** Historical original Switch season membership, not a live offer or
 * a verified claim. Resolve standalone vault definitions only by exact ref. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const SRC='36c2f64d849a5c7e2350b874e9e9443795c0675381a185d801649b587b093b60';
const DUMP='6e649926a8da4bc4f1d0bd4744ffaeea89701ef3c1a823b036e6733e915ba9a4';
const PAYLOAD='92396d259cb5db1f247d2d4b3826a3e8c0ffc2aecc226ff6c3049c2f416a3ff4';
const POPCITY_SRC='6433b7f00b2d746a28b0d57367f2ba0f8274ab94821ec5be5ffeb881fc553ac2';
const POPCITY_DUMP='d3239fbb823427c9f0bb4b77e27f271c154619843561a3a78c4449b6fdd70158';
const POPCITY_PAYLOAD='80385aaf4953cab76eb3bd8eb822727f04e88e3294538777a7c798cc574e0761';
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
  const emit=(itemId,amount,premium,alternate,seasonId,index,digest,kind,pageIndex,rewardIndex,vault,origin={version:'1.24.1',sha:SRC,unresolvedVaultDefinitionId:null})=>{
    check(id(itemId)&&id(amount)&&[null,0,1].includes(premium)&&(alternate===null||id(alternate)),'REWARD');
    occurrences++;allIds.add(itemId);
    const evidence={seasonId,kind,pageIndex,rewardIndex,configuredAmount:amount,premiumOnly:premium===1,
      premiumFieldPresent:premium!==null,sourcePlatform:'Switch',sourceGameVersion:origin.version,sourceProtoDbSha256:origin.sha,
      sourceSeasonRecordIndex:index,sourceSeasonSha256:digest,
      sourcePath:kind==='vault'?'VaultRewards.Id':(kind==='bonus'?'BonusRewards.Pages':'RewardsPages')+'['+pageIndex+'].Rewards['+rewardIndex+']',
      vaultRewardSourcePath:kind==='vault'?'Rewards['+rewardIndex+']':null,
      vaultDefinitionId:vault?.key??null,vaultDefinitionRecordIndex:vault?.index??null,vaultDefinitionSha256:vault?.digest??null,
      unresolvedVaultDefinitionId:origin.unresolvedVaultDefinitionId,alternateItemId:alternate,guaranteedGrantVerified:false,currentAvailabilityVerified:false};
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
  // Later Switch archive contains only Pop City, with an explicit empty vault
  // payload. Missing referenced vault is not evidence of a zero-reward vault.
  const pop=JSON.parse(readFileSync(join(project,'data/ddv/item-master/historical-starpath-rewards-switch-1.24.11.json'),'utf8'));
  check(pop.schema===raw.schema&&pop.source.platform==='Switch'&&pop.source.gameVersion==='1.24.11'&&
    pop.source.protoDbSha256===POPCITY_SRC&&pop.source.il2cppDumpSha256===POPCITY_DUMP&&pop.source.protoDbRecords===1861&&
    pop.payloadBytes===999&&pop.payloadSha256===POPCITY_PAYLOAD,'POPCITY_SOURCE');
  const popBytes=Buffer.from(JSON.stringify(pop.payload));
  check(popBytes.length===999&&createHash('sha256').update(popBytes).digest('hex')===POPCITY_PAYLOAD,'POPCITY_PAYLOAD');
  const [popSeasons,popVaults]=pop.payload;
  check(popSeasons.length===1&&popVaults.length===0,'POPCITY_RECORDS');
  const [seasonId,index,digest,version,pages,bonus,vaultKey]=popSeasons[0];
  check(seasonId==='PopCity2026'&&!seen.has(seasonId)&&index===1627&&sha(digest)&&version===null&&
    pages.length===6&&bonus.length===3&&vaultKey==='PopCity2026_VR','POPCITY_SEASON');
  seen.add(seasonId);
  const popIds=new Set();let popCount=0;
  for(const [kind,group] of [['normal',pages],['bonus',bonus]])for(const [pageIndex,page] of group.entries()){
    for(const [rewardIndex,r] of page.entries()){
      popCount++;popIds.add(r[0]);
      emit(...r,seasonId,index,digest,kind,pageIndex,rewardIndex,null,{version:'1.24.11',sha:POPCITY_SRC,unresolvedVaultDefinitionId:vaultKey});
    }
  }
  check(popCount===40&&popIds.size===34&&occurrences===1072,'POPCITY_CENSUS');
  const coverage={seasons:seen.size,linkedVaultDefinitions:linked.size,unlinkedVaultDefinitions:vaultById.size-linked.size,
    unresolvedVaultDefinitionIds:[vaultKey],popCityOccurrences:popCount,popCityItemIds:popIds.size,
    occurrences,distinctHistoricalItemIds:allIds.size,matchedOccurrences,matchedItems:byItem.size,unresolvedItemIds:[...unresolved].sort((a,b)=>a-b),
    alternateOccurrences,alternateItems:alternates.size,seasonCatalogComplete:false,currentAvailabilityVerified:false};
  console.log('DB01_HISTORICAL_STARPATH '+JSON.stringify(coverage));
  return {byItem,alternates,coverage};
}
