import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  verifyPublicEventFriendshipRewards
} from '../src/lib/guide/public-event-friendship-rewards.ts';
import {
  DB03_EVENT_REWARD_NAVIGATION_SCHEMA,
  guideEventRewardItemHref,
  resolveEventRewardItemDestination
} from '../src/lib/guide/event-reward-navigation.ts';

const raw=JSON.parse(await readFile(
  new URL('../static/guide/public/event-friendship-rewards-1.26.2.json',import.meta.url),
  'utf8'));
const guide=verifyPublicEventFriendshipRewards(raw);

test('native source candidate deep links are exact and cannot assert a live award',()=>{
  assert.equal(DB03_EVENT_REWARD_NAVIGATION_SCHEMA,
    'wand.db03.event-reward-navigation@1');
  const item=resolveEventRewardItemDestination(guide,'40006319');
  assert.deepEqual(item,{
    itemId:'40006319',eventId:'HauntedFloatingFestival2026',
    section:'event',candidateCount:1,staticSourceOnly:true,
    currentAvailabilityVerified:false
  });
  assert(Object.isFrozen(item));
  assert.equal(guideEventRewardItemHref(item.itemId,'/Wand'),
    '/Wand/guide/events/?item=40006319');
  assert.equal(guideEventRewardItemHref(40006319,'Wand'),
    '/Wand/guide/events/?item=40006319');
  assert.equal(guideEventRewardItemHref('40006319'),
    '/guide/events/?item=40006319');
});
test('shared default friendship currencies resolve to their own source section',()=>{
  for(const id of ['80000000','80100000']){
    const link=resolveEventRewardItemDestination(guide,id);
    assert.equal(link.section,'default_friendship');
    assert.equal(link.eventId,null);
    assert.equal(link.itemId,id);
    assert.equal(link.currentAvailabilityVerified,false);
    assert.equal(link.candidateCount,id==='80000000'?12:4);
  }
});
test('internal native TestEv definition never creates a user-facing event deep link',()=>{
  assert.equal(resolveEventRewardItemDestination(guide,'40002421'),null);
  const shared=resolveEventRewardItemDestination(guide,'40001573');
  assert(shared);
  assert.notEqual(shared.eventId,'TestEv');
});
test('unknown, unsafe or malformed ids never become navigable source assertions',()=>{
  for(const id of ['',0,-1,1.5,'0001','01','__proto__',
    'javascript:alert(1)','999999999999999','99999999999999999',null]){
    assert.equal(resolveEventRewardItemDestination(guide,id),null);
    if(id==='999999999999999')continue; // valid ID but not source-linked
    assert.equal(guideEventRewardItemHref(id),null);
  }
  for(const base of ['../private','/Wand/../secret','https://example.com','//evil'])
    assert.throws(()=>guideEventRewardItemHref('40006319',base),
      /DB03_EVENT_REWARD_NAVIGATION_BASE/);
  assert.throws(()=>resolveEventRewardItemDestination({
    ...guide,schema:'forged'
  },'40006319'),/SOURCE_REQUIRED/);
});
test('Pages deployment contract is preserved by Svelte route title without changing the UI heading',async()=>{
  const page=await readFile(new URL('../src/routes/guide/events/+page.svelte',import.meta.url),'utf8');
  assert.match(page,/<title>期間限定イベント・友情報酬/);
  assert.match(page,/<h1>イベント・友情報酬<\/h1>/);
  assert.match(page,/resolveEventRewardItemDestination\(read,params.get\('item'\)\)/);
  assert.match(page,/<span class="label">報酬候補 \{selectedRewards.length\}/);
});
