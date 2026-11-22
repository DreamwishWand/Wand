import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.mjs';
import {verifyStarpathWeeklyLocales,starpathWeeklyDescription,loadStarpathWeeklyLocales,STARPATH_LOCALES_SHA,STARPATH_LOCALES_BYTES} from '../src/lib/guide/public-starpath-locales.mjs';
import {STARPATH_REWARD_NAME_INDEX_SHA,VERIFIED_STARPATH_REWARD_NAMES,STARPATH_UNRESOLVED_REWARD_IDS,starpathRewardName} from '../src/lib/guide/starpath-reward-names.mjs';
const root=new URL('../static/',import.meta.url);
const hex=raw=>createHash('sha256').update(raw).digest('hex');
const file=async path=>readFile(new URL(path,root));
const seasonPath='guide/public/starpath-cache-2026-11-22.json';
const localePath='guide/public/starpath-weekly-locales-2026-11-22.json';
test('2026 Steam Liveops weekly locale projection has 39 keys, 8 source languages, and exact immutable digest',async()=>{
  const raw=await file(localePath);
  assert.equal(raw.length,STARPATH_LOCALES_BYTES);
  assert.equal(hex(raw),STARPATH_LOCALES_SHA);
  const seasons=verifyPublicStarpath(JSON.parse(await file(seasonPath)));
  const data=verifyStarpathWeeklyLocales(JSON.parse(raw),seasons);
  assert.equal(Object.keys(data).length,39);
  assert.equal(Object.values(data).reduce((sum,r)=>sum+Object.keys(r).length,0),312);
  assert.equal(starpathWeeklyDescription(data,'Liveops.HauntingElegance2026_Week01Task01_Description','ja'),'オレンジの宝石を20個採掘する');
  assert.equal(starpathWeeklyDescription(data,'Liveops.HauntingElegance2026_Week01Task01_Description','en'),'Mine 20 orange gems.');
  // Keep the original locale disagreement instead of silently reconciling it.
  assert.equal(starpathWeeklyDescription(data,'Liveops.Seafaring2026_Week03Task01_Description','de'),'Fange 20 Fische am schillernden Strand.');
  assert.equal(starpathWeeklyDescription(data,'Liveops.Seafaring2026_Week03Task01_Description','ja'),'輝きの浜辺で魚を25匹釣る');
  assert.equal(starpathWeeklyDescription(data,'Liveops.__proto__','ja'),null);
  assert.throws(()=>verifyStarpathWeeklyLocales({...data,extra:{ja:'fake'}},seasons),/untrusted or omitted keys/);
  assert.throws(()=>verifyStarpathWeeklyLocales(Object.fromEntries(Object.entries(data).slice(1)),seasons),/untrusted or omitted keys/);
  assert.throws(()=>verifyStarpathWeeklyLocales({...data,[Object.keys(data)[0]]:{...data[Object.keys(data)[0]],ja:'<img src=x>'}},seasons),/untrusted text/);
});
test('public weekly overlay rejects malicious bytes before JSON parse',async()=>{
  const raw=await file(localePath);
  const fetcher=async()=>({ok:true,arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)});
  const seasons=verifyPublicStarpath(JSON.parse(await file(seasonPath)));
  const result=await loadStarpathWeeklyLocales('test-local-file',seasons,fetcher);
  assert.equal(Object.keys(result).length,39);
  const changed=Buffer.from(raw);changed[75]^=1;
  const bad=async()=>({ok:true,arrayBuffer:async()=>changed.buffer.slice(changed.byteOffset,changed.byteOffset+changed.byteLength)});
  await assert.rejects(()=>loadStarpathWeeklyLocales('test-corrupted',seasons,bad),/fingerprint mismatch/);
});
test('43 verified reward names exactly match SHA-pinned public DB-01 rows and 17 remain unresolved',async()=>{
  const base='ddv/game-db/releases/steam-1.26.2-native-itemlist-v1/';
  const indexRaw=await file(base+'index.json');
  assert.equal(hex(indexRaw),STARPATH_REWARD_NAME_INDEX_SHA);
  const index=JSON.parse(indexRaw);assert.equal(index.id,'steam-1.26.2-native-itemlist-v1');
  const match=new Map(),ids=new Set();
  const snapshot=JSON.parse(await file(seasonPath));
  for(const s of snapshot.seasons)for(const r of [...s.rewardPages.flatMap(p=>p.rewards),...s.bonusPages.flatMap(p=>p.rewards),...s.vaultRewards]){
    ids.add(r.itemId);if(r.alternateItemId)ids.add(r.alternateItemId);
  }
  assert.equal(ids.size,60);
  for(const shard of index.shards){
    const raw=await file(base+shard.file);
    assert.equal(raw.length,shard.bytes);
    assert.equal(hex(raw),shard.sha256);
    for(const row of JSON.parse(raw).items)if(ids.has(row.id)&&row.nameStatus==='verified')match.set(row.id,row.names);
  }
  assert.equal(match.size,43);assert.equal(Object.keys(VERIFIED_STARPATH_REWARD_NAMES).length,43);
  for(const [id,names]of match){
    assert.deepEqual(VERIFIED_STARPATH_REWARD_NAMES[id],names,id);
    for(const locale of ['ja','en','fr','it','de','es-ES','pt-BR','zh-CN'])assert.equal(starpathRewardName(id,locale),names[locale]||names.en);
  }
  assert.equal(STARPATH_UNRESOLVED_REWARD_IDS.length,17);
  assert.deepEqual(new Set(STARPATH_UNRESOLVED_REWARD_IDS),new Set([...ids].filter(id=>!match.has(id))));
  assert.equal(starpathRewardName(STARPATH_UNRESOLVED_REWARD_IDS[0]),null);
  assert.equal(starpathRewardName('__proto__'),null);
});
