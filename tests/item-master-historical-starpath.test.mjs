import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';

test('all 24 historical Star Path seasons preserve exact normal, bonus and referenced vault reward occurrences',async()=>{
  const raw=JSON.parse(await readFile('data/ddv/item-master/historical-starpath-rewards-switch-1.24.1.json','utf8'));
  const bytes=inflateSync(Buffer.from(raw.packed,'base64'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),raw.payloadSha256);
  const [seasons,vaults]=JSON.parse(bytes),byVault=new Map(vaults.map(([id,index,sha,rewards])=>[id,{index,sha,rewards}]));
  assert.equal(seasons.length,23);assert.equal(vaults.length,3);
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const all=new Set((await db.getFieldRows('nativeCategory')).map(([id])=>id));
  const expected=[],alternates=[],linked=new Set(),historicalIds=new Set();
  let occurrences=0;
  const key=(itemId,seasonId,kind,pageIndex,rewardIndex,amount,premium,alt)=>JSON.stringify([itemId,seasonId,kind,pageIndex,rewardIndex,amount,premium,alt]);
  for(const [seasonId,index,sha,version,pages,bonus,ref] of seasons){
    const append=(kind,pageIndex,page)=>{
      for(const [rewardIndex,[itemId,amount,premium,alt]] of page.entries()){
        historicalIds.add(itemId);occurrences++;
        const k=key(itemId,seasonId,kind,pageIndex,rewardIndex,amount,premium,alt);
        if(all.has(itemId))expected.push(k);
        if(alt!==null&&all.has(alt))alternates.push(k);
      }
    };
    for(const [i,p] of pages.entries())append('normal',i,p);
    for(const [i,p] of bonus.entries())append('bonus',i,p);
    if(ref!==null){linked.add(ref);append('vault',null,byVault.get(ref).rewards);}
  }
  assert.equal(occurrences,1032);assert.equal(historicalIds.size,863);assert.equal(linked.size,2);
  const pop=JSON.parse(await readFile('data/ddv/item-master/historical-starpath-rewards-switch-1.24.11.json','utf8'));
  assert.equal(createHash('sha256').update(JSON.stringify(pop.payload)).digest('hex'),pop.payloadSha256);
  const [[popSeason],popVaults]=pop.payload;
  const [popId,popIndex,popSha,popVersion,popPages,popBonus,popRef]=popSeason;
  assert.equal(popId,'PopCity2026');assert.equal(popRef,'PopCity2026_VR');assert.equal(popVaults.length,0);
  let popCount=0;
  for(const [kind,group] of [['normal',popPages],['bonus',popBonus]])for(const [pageIndex,page] of group.entries()){
    for(const [rewardIndex,[itemId,amount,premium,alt]] of page.entries()){
      historicalIds.add(itemId);popCount++;
      if(all.has(itemId))expected.push(key(itemId,popId,kind,pageIndex,rewardIndex,amount,premium,alt));
    }
  }
  assert.equal(popCount,40);
  const fields=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const result=await db.getFieldRows('acquisition.historicalStarpathSources');
  const category=new Map(await db.getFieldRows('acquisition.effectiveCategories'));
  const seasonIds=new Map(await db.getFieldRows('acquisition.historicalStarpathSeasonIds'));
  const asKey=(id,l)=>key(id,l.seasonId,l.kind,l.pageIndex,l.rewardIndex,l.configuredAmount,l.premiumFieldPresent?Number(l.premiumOnly):null,l.alternateItemId);
  assert.deepEqual(result.flatMap(([id,ls])=>ls.map(l=>{
    assert.equal(l.sourcePlatform,'Switch');
    const source=l.seasonId==='PopCity2026'?pop:raw;
    assert.equal(l.sourceGameVersion,source.source.gameVersion);
    assert.equal(l.sourceProtoDbSha256,source.source.protoDbSha256);
    assert.equal(l.unresolvedVaultDefinitionId,l.seasonId==='PopCity2026'?popRef:null);
    if(l.seasonId==='PopCity2026'){assert.equal(l.sourceSeasonRecordIndex,popIndex);assert.equal(l.sourceSeasonSha256,popSha);assert.notEqual(l.kind,'vault');}
    assert.equal(l.currentAvailabilityVerified,false);assert.equal(l.guaranteedGrantVerified,false);
    assert(category.get(id).includes('star_path'));
    assert.equal(l.premiumOnly,l.premiumFieldPresent&&l.premiumOnly);
    if(l.kind==='vault'){
      assert(linked.has(l.vaultDefinitionId));assert.equal(l.vaultDefinitionSha256,byVault.get(l.vaultDefinitionId).sha);
      assert.equal(l.sourcePath,'VaultRewards.Id');assert.equal(l.vaultRewardSourcePath,'Rewards['+l.rewardIndex+']');
    }
    return asKey(id,l);
  })).sort(),expected.sort());
  for(const [id,ls] of result)assert.deepEqual(seasonIds.get(id),[...new Set(ls.map(l=>l.seasonId))].sort());
  const alt=fields.has('acquisition.historicalStarpathAlternateSources')?await db.getFieldRows('acquisition.historicalStarpathAlternateSources'):[];
  assert.deepEqual(alt.flatMap(([id,ls])=>ls.map(l=>{
    assert.equal(l.alternateCandidate,true);assert.equal(l.alternateItemId,id);return asKey(l.primaryItemId,l);
  })).sort(),alternates.sort());
  const ids=result.map(([id])=>id),details=await readItemAcquisitionSourceDetails(db,ids.slice(0,10),'ja');
  for(const [i,r] of details.entries()){
    assert.equal(r.classificationExtensionStatus.historicalStarpath,'indexed');
    assert.deepEqual(r.classificationExtensions.filter(e=>e.family==='historicalStarpath').map(e=>e.evidence),result[i][1]);
  }
  console.log('DB01_HISTORICAL_STARPATH_VERIFIED '+JSON.stringify({matchedItems:result.length,matchedOccurrences:expected.length,unresolvedIds:historicalIds.size-result.length,alternateOccurrences:alternates.length}));
});


test('shared Star Path filter columns cover every primary reward from both source families without cross-season access leakage',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const historical=await db.getFieldRows('acquisition.historicalStarpathSources');
  const known=new Set((await db.getFieldRows('itemId')).map(([id])=>id));
  const current=JSON.parse(await readFile('static/guide/public/starpath-cache-2026-11-22.json','utf8'));
  const keys=new Map();
  const add=(id,season,premium)=>{
    if(!known.has(id))return;
    const set=keys.get(id)??new Set();set.add(season+':'+(premium?'premium':'free'));keys.set(id,set);
  };
  for(const [id,rows] of historical)for(const r of rows)add(id,r.seasonId,r.premiumOnly);
  for(const s of current.seasons){
    for(const r of [...s.rewardPages.flatMap(p=>p.rewards),...s.bonusPages.flatMap(p=>p.rewards),...s.vaultRewards])add(Number(r.itemId),s.id,r.premium);
  }
  const expected=[...keys].sort((a,b)=>a[0]-b[0]).map(([id,v])=>[id,[...v].sort()]);
  const actual=await db.getFieldRows('acquisition.starpathSeasonAccessKeys');
  assert.deepEqual(actual,expected);
  assert.deepEqual(await db.getFieldRows('acquisition.starpathSeasonIds'),expected.map(([id,ks])=>[id,[...new Set(ks.map(k=>k.split(':')[0]))].sort()]));
  assert.deepEqual(await db.getFieldRows('acquisition.starpathRewardAccess'),expected.map(([id,ks])=>[id,[...new Set(ks.map(k=>k.split(':')[1]))].sort()]));
  const seasonKeys=[...new Set(expected.flatMap(([,v])=>v))];
  assert.equal(new Set(seasonKeys.map(k=>k.split(':')[0])).size,26);
  for(const key of seasonKeys){
    const ids=await db.findItemIdsByField('acquisition.starpathSeasonAccessKeys',{kind:'contains',value:key});
    assert.deepEqual(ids,expected.filter(([,ks])=>ks.includes(key)).map(([id])=>id));
  }
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
  console.log('DB01_STARPATH_FILTER_VERIFIED '+JSON.stringify({items:actual.length,seasons:26,seasonAccessKeys:seasonKeys.length}));
});
