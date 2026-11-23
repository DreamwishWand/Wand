import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  STARPATH_CACHE_SCHEMA,STARPATH_SOURCE_SHA,STARPATH_PUBLIC_SHA,
  STARPATH_PUBLIC_BYTES,STARPATH_PUBLIC_SEASONS,
  verifyPublicStarpath,loadPublicStarpath
} from '../src/lib/guide/public-starpath.ts';

const filename=new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url);
const file=()=>readFile(filename);
const decoded=async()=>JSON.parse(await file());
const modified=(original,change)=>{
  const copy=structuredClone(original);
  change(copy);
  return copy;
};
const bytes=buffer=>buffer.buffer.slice(
  buffer.byteOffset,buffer.byteOffset+buffer.byteLength
);

test('typed source cache exactly authenticates two Steam 1.26.2 seasons and source-only 67 reward slots / 185 tasks',async()=>{
  const raw=await file();
  assert.equal(raw.length,STARPATH_PUBLIC_BYTES);
  assert.equal(createHash('sha256').update(raw).digest('hex'),STARPATH_PUBLIC_SHA);
  const data=verifyPublicStarpath(JSON.parse(raw));
  assert.equal(data.schema,STARPATH_CACHE_SCHEMA);
  assert.equal(data.source.fileSha256,STARPATH_SOURCE_SHA);
  assert.equal(data.source.liveAvailabilityVerified,false);
  assert.equal(data.source.seasonCatalogComplete,false);
  assert.deepEqual(data.seasons.map(s=>s.id),STARPATH_PUBLIC_SEASONS);
  assert.deepEqual(data.seasons.map(s=>s.counts),
    [ {rewardPages:6,bonusPages:4,normalRewards:34,bonusRewards:9,
       vaultRewards:7,dailyTasks:121,weeklyTasks:21,weeks:7},
      {rewardPages:2,bonusPages:1,normalRewards:10,bonusRewards:1,
       vaultRewards:6,dailyTasks:25,weeklyTasks:18,weeks:6} ]);
  const rewardSlots=data.seasons.reduce((n,s)=>n+
    s.rewardPages.flatMap(page=>page.rewards).length+
    s.bonusPages.flatMap(page=>page.rewards).length+s.vaultRewards.length,0);
  const tasks=data.seasons.reduce((n,s)=>n+s.tasks.length+
    s.weeklyTasks.flat().length,0);
  assert.equal(rewardSlots,67);
  assert.equal(tasks,185);
  assert.equal(data.seasons[0].bonusPages[2].layout,undefined,
    'original bonus page 3 has no native layout');
  assert.equal(data.seasons[0].bonusPages[3].layout,undefined,
    'original currency-conversion page has no native layout');
  assert.equal(data.seasons[1].bonusPages[0].layout,undefined,
    'Seafaring conversion page has no native layout');
  assert(data.seasons.every(s=>Date.parse(s.startUtc)<Date.parse(s.finishUtcExclusive)&&
    Date.parse(s.finishUtcExclusive)<Date.parse(s.endUtcExclusive)));
  assert.equal(data.seasons[0].finishUtcExclusive,'2026-12-08T14:00:00Z');
  assert.equal(data.seasons[0].endUtcExclusive,'2026-12-09T14:00:00Z');
});
test('typed source rejects forged provenance and does not infer online or historical completeness',async()=>{
  const actual=await decoded();
  const mutations=[
    [o=>{o.source.fileSha256='0'.repeat(64)},/provenance/],
    [o=>{o.source.seasonCatalogComplete=true},/provenance/],
    [o=>{o.source.liveAvailabilityVerified=true},/provenance/],
    [o=>{o.seasons[1].id='Seafaring2025'},/season identity/],
    [o=>{o.seasons.pop()},/seasons/],
    [o=>{o.seasons[0].endUtcExclusive='2026-12-01T14:00:00Z'},/season identity/],
    [o=>{o.seasons[0].startUtc='2026-09-23T13:00:00+00:00'},/season identity/],
    [o=>{o.seasons[0].rewardPages[0].rewards.pop()},/source reward census/],
    [o=>{o.seasons[0].rewardPages[0].rewards[0].itemId='__proto__'},/reward/],
    [o=>{o.seasons[0].vaultRewards[0].alternateItemId='__proto__'},/vault alternative/],
    [o=>{o.seasons[0].tasks[0].id='__proto__'},/task/],
    [o=>{o.seasons[0].tasks[1].id=o.seasons[0].tasks[0].id},/duplicate task/],
    [o=>{o.seasons[0].weeklyTasks[0][0].descriptionKey='Liveops.__proto__'},/unresolved localization/],
    [o=>{o.seasons[0].weeklyTasks[0][0].description='finished'},/unresolved localization/],
    [o=>{o.seasons[0].weeklyTasks[0][0].id='Week02Task01'},/unresolved localization|weekly source position/]
  ];
  for(const [change,message] of mutations)
    assert.throws(()=>verifyPublicStarpath(modified(actual,change)),message);
});
test('browser source reader checks exact public byte size and SHA-256 before JSON parsing',async()=>{
  const raw=await file();
  const source=await loadPublicStarpath('local/snapshot',async()=>({
    ok:true,arrayBuffer:async()=>bytes(raw)
  }));
  assert.equal(source.seasons.length,2);
  const altered=Buffer.from(raw);
  altered[140]^=1;
  await assert.rejects(()=>loadPublicStarpath('local/snapshot',async()=>({
    ok:true,arrayBuffer:async()=>bytes(altered)
  })),/publication fingerprint mismatch/);
  await assert.rejects(()=>loadPublicStarpath('local/snapshot',async()=>({
    ok:true,arrayBuffer:async()=>bytes(raw.subarray(1))
  })),/publication size mismatch/);
  await assert.rejects(()=>loadPublicStarpath('local/snapshot',async()=>({
    ok:false
  })),/download failed/);
});
