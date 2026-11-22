import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGuideRewardIndex} from '../src/lib/guide/reward-relations.ts';
import {DB03_STARPATH_HISTORY_CONTRACT,createGuideStarpathHistory}
  from '../src/lib/guide/starpath-history.ts';

const read=async()=>JSON.parse(await readFile(
  new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url),'utf8'));
const make=async()=>createGuideStarpathHistory(createGuideRewardIndex(await read()));

test('21 official prior-season references are source-tagged, not counterfeit native season IDs',async()=>{
  const history=await make();
  assert.equal(history.contract,DB03_STARPATH_HISTORY_CONTRACT);
  assert.equal(history.coverage.sourceVerifiedNativeSeasonCount,2);
  assert.equal(history.coverage.officialOnlyAnnouncementCount,21);
  assert.equal(history.coverage.reportedDistinctSeasonEvidenceCount,23);
  assert.equal(history.coverage.historicalCatalogueComplete,false);
  assert.equal(history.coverage.nativeRewardMappingsComplete,false);
  assert.equal(history.coverage.onlineStatusVerified,false);
  const official=history.officialAnnouncementsOnly;
  assert.equal(official.length,21);
  assert.equal(new Set(official.map(x=>x.historyKey)).size,21);
  assert.deepEqual(official.map(x=>x.year).reduce((counts,y)=>
    ({...counts,[y]:(counts[y]??0)+1}),{}),
    {2022:3,2023:5,2024:6,2025:5,2026:2});
  for(const entry of official){
    assert.match(entry.historyKey,/^20(?:22|23|24|25|26)\/[a-z0-9-]+$/);
    assert.match(entry.titleEn,/ Star Path$/);
    assert.equal(new URL(entry.officialEvidenceUrl).origin,'https://disneydreamlightvalley.com');
    assert.equal(entry.nativeSeasonId,null);
    assert.equal(entry.rewardItemIdsVerified,false);
    assert.equal(entry.taskDataVerified,false);
    assert.equal(entry.startUtc,null);
    assert.equal(entry.endUtc,null);
    assert(['contemporary_official_news','official_retrospective_reference'].includes(entry.evidenceKind));
    assert(Object.isFrozen(entry));
  }
  assert(Object.isFrozen(official));
  assert.equal(history.getAnnouncement('2022/pixar-fest').titleEn,'Pixar Fest Star Path');
  assert.equal(history.getAnnouncement('2023/centennial').evidenceKind,'official_retrospective_reference');
  assert.equal(history.getAnnouncement('2026/paw-fect-romance').titleEn,'Paw-fect Romance Star Path');
  assert.equal(history.getAnnouncement('__proto__'),null);
  assert.equal(history.getAnnouncement('2026/HauntingElegance2026'),null);
  assert.equal(history.listAnnouncements(2024).length,6);
  assert.equal(history.listAnnouncements(2030).length,0);
  assert.equal(history.listAnnouncements().length,21);
  assert(Object.isFrozen(history.listAnnouncements(2025)));
  assert.deepEqual(history.verifiedNativeSeasons.map(s=>s.id),
    ['HauntingElegance2026','Seafaring2026']);
});

test('official-history references cannot manufacture item provenance or bypass native index source checks',async()=>{
  const source=await read(),base=createGuideRewardIndex(source),history=createGuideStarpathHistory(base);
  assert.equal(base.getItemRelations('120000253').length,1);
  assert.deepEqual(history.officialAnnouncementsOnly.filter(x=>x.rewardItemIdsVerified),[]);
  assert.equal(history.officialAnnouncementsOnly.filter(x=>x.nativeSeasonId!==null).length,0);
  assert.equal(base.getSeasonRewards('2025/winter-warmth').length,0);
  assert.throws(()=>createGuideStarpathHistory({}),/REWARD_INDEX_REQUIRED/);
  const overlapping={...base,seasons:[base.seasons[0],{...base.seasons[1],title:'Pixar Fest Star Path'}]};
  assert.throws(()=>createGuideStarpathHistory(overlapping),/OVERLAPPING_SOURCE_IDENTITY/);
  const page=await readFile(new URL('../src/routes/guide/star-path/+page.svelte',import.meta.url),'utf8');
  assert.match(page,/createGuideStarpathHistory\(sharedRewardIndex\)/);
  assert.match(page,/entry\.officialEvidenceUrl/);
  assert.match(page,/ゲーム内部のシーズンIDと報酬アイテムIDは未確認/);
  assert.doesNotMatch(page,/officialHistory\.getSeasonRewards/);
});
