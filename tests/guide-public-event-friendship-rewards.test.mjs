import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadPublicEventFriendshipRewards,verifyPublicEventFriendshipRewards,
  DB03_EVENT_FRIENDSHIP_REWARD_BYTES,DB03_EVENT_FRIENDSHIP_REWARD_SHA,
  DB03_EVENT_FRIENDSHIP_REWARD_FILE} from '../src/lib/guide/public-event-friendship-rewards.ts';
import {loadPinnedPublicEventFriendshipAcquisition,
  hasPinnedPublicEventFriendshipEvidence} from '../src/lib/guide/public-event-friendship-acquisition.ts';
import {loadPinnedPublicQuestAcquisition} from '../src/lib/guide/public-quest-acquisition.ts';
import {loadUnifiedAcquisitionOriginDatabase} from '../src/lib/acquisition/origins.ts';
const DIR=new URL('../static/guide/public/',import.meta.url);
const loadFile=async(name)=>readFile(new URL(name,DIR));
const fileNames=[DB03_EVENT_FRIENDSHIP_REWARD_FILE,'quest-index.json',
  'quest-rewards-1.26.2.json','starpath-cache-2026-11-22.json'];
const fixture=async()=>new Map(await Promise.all(fileNames.map(async name=>[name,await loadFile(name)])));
function fetcher(files){return async url=>{
  const key=String(url).split('/').at(-1);
  return files.has(key)?new Response(files.get(key),{status:200}):new Response('missing',{status:404});
};}
test('21K-or-less native source projection keeps all 24 event labels, 202 item and 16 default friendship relations',async()=>{
  const bytes=await loadFile(DB03_EVENT_FRIENDSHIP_REWARD_FILE);
  assert.equal(bytes.byteLength,DB03_EVENT_FRIENDSHIP_REWARD_BYTES);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),DB03_EVENT_FRIENDSHIP_REWARD_SHA);
  const source=verifyPublicEventFriendshipRewards(JSON.parse(bytes.toString('utf8')));
  assert.equal(source.events.length,24);
  assert.equal(source.coverage.miniEvents,19);
  assert.equal(source.coverage.floatingFestivals,5);
  assert.equal(source.coverage.eventRewardCandidates,202);
  assert.equal(source.defaultFriendship.length,16);
  assert.equal(source.coverage.distinctAllItemIds,141);
  assert.equal(source.coverage.liveEventAvailabilityVerified,false);
  const haunted=source.getEvent('floating_festival','HauntedFloatingFestival2026');
  assert(haunted);
  assert.equal(haunted.names.ja,'ホーンテッドフローティングフェスティバル');
  assert.equal(haunted.rewards.length,9);
  assert(haunted.rewards.every(r=>source.getItemCandidates(r.itemId).some(x=>x.eventReward===r)));
  assert.equal(source.getEvent('mini_event','HauntedFloatingFestival2026'),null);
  assert.equal(source.getDefaultFriendshipRewards(4).length,4);
  assert(source.getDefaultFriendshipRewards(4).every(r=>!r.characterSpecificVerified));
  assert.equal(source.getDefaultFriendshipRewards(5).length,0);
  assert(source.getItemCandidates('80000000').every(r=>r.kind==='default_friendship_reward'));
  assert.equal(source.getItemCandidates('__proto__').length,0);
});
test('pinned public acquisition origins preserve source relation IDs and do not invent live grants',async()=>{
  const files=await fixture(),read=fetcher(files);
  const view=await loadPinnedPublicEventFriendshipAcquisition('/Wand',read);
  assert(hasPinnedPublicEventFriendshipEvidence(view));
  assert.equal(view.origins.length,218);
  assert.equal(view.coverage.eventRewardCandidates,202);
  assert.equal(view.coverage.friendshipDefaultCandidates,16);
  assert.equal(view.coverage.distinctItemIds,141);
  assert(Object.isFrozen(view.origins));
  const ids=new Set();
  let events=0,friends=0;
  for(const x of view.origins){
    assert(!ids.has(x.originId));ids.add(x.originId);
    assert.equal(x.routeStatus,'static_candidate_only');
    assert.equal(x.availability,'not_live_verified');
    assert.equal(x.source.kind,'verified_game_native');
    assert.equal(x.campaignId,null);
    assert(x.conditions.some(z=>z.includes('not a grant')));
    assert(view.getItemCandidates(x.itemId).includes(x));
    assert(Object.isFrozen(x));
    if(x.kind==='event_reward')events++;
    else if(x.kind==='friendship_reward')friends++;
  }
  assert.equal(events,202);assert.equal(friends,16);
  assert.equal(view.getDefaultFriendshipCandidates(4).length,4);
  assert.equal(view.getEventCandidates('floating_festival','HauntedFloatingFestival2026').length,9);
  assert.equal(view.getItemCandidates('999999999999999').length,0);
  assert(!hasPinnedPublicEventFriendshipEvidence({...view}));
});
test('DB-02 common origin ledger combines 67 Star Path, 395 Quest and 218 event/default-friendship references',async()=>{
  const files=await fixture(),read=fetcher(files);
  const quest=await loadPinnedPublicQuestAcquisition('/Wand',read);
  const e=await loadPinnedPublicEventFriendshipAcquisition('/Wand',read);
  const db=await loadUnifiedAcquisitionOriginDatabase(read,null,'/Wand',[],null,quest,e);
  assert.equal(db.getCoverage().linkedRoutes,680);
  assert.equal(db.getCoverage().routesBySourceKind.verified_game_native,613);
  assert.equal(db.getCoverage().routesBySourceKind.verified_liveops_cache,67);
  assert.equal(db.getCoverage().originCoverageComplete,false);
  assert(db.getItem('80100000').origins.some(o=>o.kind==='friendship_reward'));
  assert(db.getItem('80000000').origins.some(o=>o.kind==='quest_reward'));
  assert(db.getItem('170000115').origins.some(o=>o.kind.startsWith('star_path')));
  for(const row of e.origins){
    assert(db.getOrigin(row.originId).includes(row));
    assert(db.getItem(row.itemId).origins.includes(row));
  }
});
test('reject forged collection, corrupted pinned asset and version mismatch',async()=>{
  const files=await fixture(),read=fetcher(files);
  const q=await loadPinnedPublicQuestAcquisition('/Wand',read);
  const original=await loadPinnedPublicEventFriendshipAcquisition('/Wand',read);
  await assert.rejects(loadUnifiedAcquisitionOriginDatabase(read,null,'/Wand',[],null,q,{...original}),
    /PINNED_PUBLIC_EVENT_FRIENDSHIP_REQUIRED/);
  const modified=new Map(files),bad=Buffer.from(files.get(DB03_EVENT_FRIENDSHIP_REWARD_FILE));
  bad[bad.length-60]^=1;modified.set(DB03_EVENT_FRIENDSHIP_REWARD_FILE,bad);
  await assert.rejects(loadPinnedPublicEventFriendshipAcquisition('/Wand',fetcher(modified)),
    /PUBLIC_SHA/);
  const json=JSON.parse(files.get(DB03_EVENT_FRIENDSHIP_REWARD_FILE).toString('utf8'));
  json.target.gameVersion='1.26.1';
  assert.throws(()=>verifyPublicEventFriendshipRewards(json),/SCHEMA_OR_TARGET/);
  await assert.rejects(loadPinnedPublicEventFriendshipAcquisition('/Wand/../x',read),
    /INVALID_BASE_PATH/);
});