import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {projectStarpathCache,SCHEMA,SOURCE_SHA,SOURCE_BYTES} from '../tools/src-03-guide/starpath-cache.mjs';
const file=new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url);
test('source-pinned static Star Path census excludes private cache and player data',async()=>{
  const raw=await readFile(file);
  assert.equal(createHash('sha256').update(raw).digest('hex'),'78819b4d36042e3c60b576583149e58541d3ca297fa0c3ba8a9a775009614198');
  const x=JSON.parse(raw);
  assert.equal(x.schema,SCHEMA);
  assert.equal(x.source.fileSha256,SOURCE_SHA);
  assert.equal(x.source.sourceBytes,SOURCE_BYTES);
  assert.equal(x.source.liveAvailabilityVerified,false);
  assert.equal(x.source.seasonCatalogComplete,false);
  assert.deepEqual(x.seasons.map(s=>s.id),['HauntingElegance2026','Seafaring2026']);
  assert.deepEqual(x.seasons.map(s=>s.counts),[
    {rewardPages:6,bonusPages:4,normalRewards:34,bonusRewards:9,vaultRewards:7,dailyTasks:121,weeklyTasks:21,weeks:7},
    {rewardPages:2,bonusPages:1,normalRewards:10,bonusRewards:1,vaultRewards:6,dailyTasks:25,weeklyTasks:18,weeks:6}
  ]);
  assert.equal(x.seasons.reduce((sum,s)=>sum+s.counts.dailyTasks+s.counts.weeklyTasks,0),185);
  for(const s of x.seasons){
    assert(s.weeklyTasks.every(w=>w.every(t=>t.description===null&&t.descriptionKey?.startsWith('Liveops.'))));
    assert(s.rewardPages.every(p=>p.rewards.every(r=>/^\d+$/.test(r.itemId))));
  }
  const text=raw.toString('utf8');
  for(const forbidden of ['CurrencyOnlineId','IconAddress','PlatformFilter','LastAccessTimestamp','LastUpdateTimestamp','PlayFabId','OwnerID','AccountId','playerProgress'])
    assert.equal(text.includes('"'+forbidden+'"'),false,forbidden);
});
test('source fingerprint and season identity mismatches fail closed',()=>{
  const doc={Data:{Season1:JSON.stringify({OnlineId:'Season1'})}};
  const raw=Buffer.from(JSON.stringify(doc));
  const sha=createHash('sha256').update(raw).digest('hex');
  assert.throws(()=>projectStarpathCache(raw),/SOURCE_FINGERPRINT/);
  assert.throws(()=>projectStarpathCache(raw,{expectedSha:sha,expectedBytes:raw.length}),/SEASON_PROVENANCE/);
  doc.Data.Season1=JSON.stringify({OnlineId:'Unexpected',Language:'en-US',Active:true});
  const changed=Buffer.from(JSON.stringify(doc));
  assert.throws(()=>projectStarpathCache(changed,{expectedSha:createHash('sha256').update(changed).digest('hex'),expectedBytes:changed.length}),/SEASON_PROVENANCE/);
});
