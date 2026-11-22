import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  STARPATH_NATIVE_REVISION_CONTRACT,STARPATH_NATIVE_REVISION_FILE,
  STARPATH_NATIVE_REVISION_PUBLIC_SHA,STARPATH_NATIVE_REVISION_PUBLIC_BYTES,
  loadStarpathNativeRevisionEvidence,verifyStarpathNativeRevisionEvidence
} from '../src/lib/guide/starpath-native-revision.ts';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.mjs';
import {createGuideRewardIndex} from '../src/lib/guide/reward-relations.ts';
import {createGuideStarpathHistory} from '../src/lib/guide/starpath-history.ts';

async function source(){
  const [bytes,raw]=await Promise.all([
    readFile(new URL('../static/guide/public/'+STARPATH_NATIVE_REVISION_FILE,import.meta.url)),
    readFile(new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url),'utf8')
  ]);
  return {bytes,doc:JSON.parse(bytes.toString('utf8')),catalog:verifyPublicStarpath(JSON.parse(raw))};
}
test('two actual Steam cache SHA pins support one unchanged 50-slot source-native season',async()=>{
  const {bytes,doc,catalog}=await source();
  assert.equal(bytes.length,STARPATH_NATIVE_REVISION_PUBLIC_BYTES);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),STARPATH_NATIVE_REVISION_PUBLIC_SHA);
  assert.equal(doc.schema,STARPATH_NATIVE_REVISION_CONTRACT);
  const reader=verifyStarpathNativeRevisionEvidence(doc,catalog);
  assert.equal(reader.evidence.sources.length,2);
  assert.deepEqual(reader.evidence.sources.map(r=>r.gameVersion),['1.25.0','1.26.2']);
  assert.deepEqual(reader.evidence.sources.map(r=>r.seasonIds),[
    ['HauntingElegance2026'],['HauntingElegance2026','Seafaring2026']
  ]);
  const stable=reader.getVerifiedSeasonRevision('HauntingElegance2026');
  assert.equal(stable,reader.matchedSeason);
  assert.equal(stable.rewardSlotsWithIdenticalFullSourceDefinition,50);
  assert.equal(stable.dailyTasksWithSameIdAndNonDescriptionFields,121);
  assert.equal(stable.unchangedWeeklyTasks,true);
  assert.deepEqual(stable.descriptionEdits.map(r=>r.taskId),['Task15','Task64','Task100']);
  assert.deepEqual(stable.platformFilter.later.excludes,['AppleArcade']);
  assert.equal(stable.platformFilter.earlier,'absent_from_source');
  assert.equal(reader.getVerifiedSeasonRevision('Seafaring2026'),null);
  assert.equal(reader.getVerifiedSeasonRevision('PixarFest2022'),null);
  assert.equal(reader.unseenHistoricalSeasonIdsVerified,0);
  assert(Object.isFrozen(reader));
  assert(Object.isFrozen(stable.descriptionEdits));
  assert(Object.isFrozen(reader.evidence.sources));
});
test('two cache snapshots do not fabricate historical Season Item-ID associations',async()=>{
  const {doc,catalog}=await source();
  const reader=verifyStarpathNativeRevisionEvidence(doc,catalog);
  const rewards=createGuideRewardIndex(catalog),history=createGuideStarpathHistory(rewards);
  assert.equal(rewards.seasons.length,2);
  assert.equal(rewards.getSeasonRewards('HauntingElegance2026').length,50);
  assert.equal(reader.matchedSeason.rewardSlotsWithIdenticalFullSourceDefinition,
    rewards.getSeasonRewards('HauntingElegance2026').length);
  assert.equal(rewards.getSeasonRewards('Seafaring2026').length,17);
  assert.equal(history.officialAnnouncementsOnly.length,21);
  assert(history.officialAnnouncementsOnly.every(row=>
    row.nativeSeasonId===null&&row.rewardItemIdsVerified===false));
  assert.equal(reader.evidence.historicalSeasonCatalogComplete,false);
  assert.equal(reader.evidence.liveStatusVerified,false);
});
test('browser loader rejects tampered public data, accepts exactly pinned asset',async()=>{
  const {bytes,catalog}=await source();
  const reader=await loadStarpathNativeRevisionEvidence(
    '/Wand/guide/public/'+STARPATH_NATIVE_REVISION_FILE,catalog,
    async()=>new Response(bytes,{status:200})
  );
  assert.equal(reader.getVerifiedSeasonRevision('HauntingElegance2026')?.descriptionEdits.length,3);
  const mutated=Buffer.from(bytes);
  mutated[mutated.indexOf(Buffer.from('Task100'))]=0x78;
  await assert.rejects(loadStarpathNativeRevisionEvidence('/test',catalog,
    async()=>new Response(mutated,{status:200})),/PUBLIC_ASSET_SHA/);
  await assert.rejects(loadStarpathNativeRevisionEvidence('/test',catalog,
    async()=>new Response(Buffer.from('bad'),{status:200})),/PUBLIC_ASSET_BYTES/);
  await assert.rejects(loadStarpathNativeRevisionEvidence('/test',catalog,
    async()=>new Response('',{status:404})),/DOWNLOAD_FAILED/);
});
test('source version/season IDs/changed task descriptions must match published cache',async()=>{
  const {doc,catalog}=await source();
  const modified=()=>{
    return structuredClone(doc);
  };
  let v=modified();
  v.evidence.sources[0].sourceSha256='0'.repeat(64);
  assert.throws(()=>verifyStarpathNativeRevisionEvidence(v,catalog),/ORIGINAL_SOURCE_MISMATCH/);
  v=modified();
  v.onlyInLaterSnapshot.push('PixarFest2022');
  assert.throws(()=>verifyStarpathNativeRevisionEvidence(v,catalog),/SNAPSHOT_COVERAGE/);
  v=modified();
  v.matchedSeason.rewardSlotsWithIdenticalFullSourceDefinition=49;
  assert.throws(()=>verifyStarpathNativeRevisionEvidence(v,catalog),/REVISION_CONTRACT/);
  v=modified();
  v.matchedSeason.descriptionEdits[1].later='not from current original';
  assert.throws(()=>verifyStarpathNativeRevisionEvidence(v,catalog),/UNVERIFIED_TASK_DESCRIPTION/);
  v=modified();
  v.matchedSeason.platformFilter.later.excludes=['Xbox'];
  assert.throws(()=>verifyStarpathNativeRevisionEvidence(v,catalog),/PLATFORM_FILTER_EVIDENCE/);
  v=modified();
  v.evidence.liveStatusVerified=true;
  assert.throws(()=>verifyStarpathNativeRevisionEvidence(v,catalog),/PROVENANCE/);
});
test('public Guide displays the source-supported version comparison without original files',async()=>{
  const route=await readFile(new URL('../src/routes/guide/star-path/+page.svelte',import.meta.url),'utf8');
  const module=await readFile(new URL('../src/lib/guide/starpath-native-revision.ts',import.meta.url),'utf8');
  assert.match(route,/loadStarpathNativeRevisionEvidence/);
  assert.match(route,/versionEvidence\?\.getVerifiedSeasonRevision\(season\.id\)/);
  assert.match(route,/報酬.*枠.*同一/);
  assert.doesNotMatch(module,/localStorage|sessionStorage|Cache\/liveops\/battlepasses.dat|FileReader/);
});
