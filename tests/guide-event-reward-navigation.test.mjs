import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  verifyPublicEventFriendshipRewards
} from '../src/lib/guide/public-event-friendship-rewards.ts';
import {verifyEventRewardItemLabels} from '../src/lib/guide/event-reward-item-labels.ts';
import {
  DB03_EVENT_REWARD_NAVIGATION_SCHEMA,
  guideEventRewardItemHref,guideEventRewardOccurrenceHref,
  resolveEventRewardItemDestination,resolveEventRewardOccurrenceDestination,
  relatedEventRewardIds,guideEventRewardCollectionHref
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

test('source-exact event+Item permalinks retain historic edition and filter only genuine matches',()=>{
  const shared='40004651';
  assert.deepEqual(relatedEventRewardIds(guide,shared),
    ['HauntedFloatingFestival','HauntedFloatingFestival2026']);
  const href=guideEventRewardOccurrenceHref(
    guide,'HauntedFloatingFestival2026',shared,'/Wand');
  assert.equal(href,'/Wand/guide/events/?event=HauntedFloatingFestival2026&item=40004651');
  assert.deepEqual(resolveEventRewardOccurrenceDestination(
    guide,new URL(href,'https://example.invalid').search),{
      eventId:'HauntedFloatingFestival2026',
      eventFamily:'floating_festival',itemId:shared,
      sourceConfigurationOnly:true,currentAvailabilityVerified:false
  });
  assert.equal(resolveEventRewardOccurrenceDestination(guide,
    '?event=HauntedFloatingFestival&item=40004651')?.eventId,'HauntedFloatingFestival');
  assert.equal(guideEventRewardOccurrenceHref(
    guide,'HauntedFloatingFestival2026','40006319'),'\/guide/events/?event=HauntedFloatingFestival2026&item=40006319');
  assert.equal(relatedEventRewardIds(guide,'40006319').length,1);
});
test('cross-event Item links are counted from source records and exclude TestEv',()=>{
  const all=new Set(guide.events.flatMap(e=>e.rewards.map(r=>r.itemId)));
  const multi=[...all].filter(itemId=>relatedEventRewardIds(guide,itemId).length>1);
  assert.equal(multi.length,57);
  for(const e of guide.events.filter(e=>e.id!=='TestEv'))
    for(const r of e.rewards){
      const url=guideEventRewardOccurrenceHref(guide,e.id,r.itemId);
      assert(url?.includes('?event='));
      assert.equal(resolveEventRewardOccurrenceDestination(guide,url.slice(url.indexOf('?')))?.eventId,e.id);
    }
  assert.equal(guideEventRewardOccurrenceHref(guide,'TestEv','40002421'),null);
});
test('malformed, forged, mismatched and ambiguous event-reward pairs cannot create links',()=>{
  for(const search of [
    '?event=HauntedFloatingFestival2026&item=40002421',
    '?event=HauntedFloatingFestival2026&item=00040004651',
    '?event=HauntedFloatingFestival2026&item=40004651&item=40006319',
    '?event=HauntedFloatingFestival2026&event=HauntedFloatingFestival&item=40004651',
    '?event=HauntedFloatingFestival2026&item=40004651&quest=20700001',
    '?event=TestEv&item=40002421',
    '?event=NotAnEvent&item=40004651',
    '?event=HauntedFloatingFestival2026',
    '?item=40004651',
    '?event=HauntedFloatingFestival2026&item=40004651&'+('x'.repeat(2050))
  ])assert.equal(resolveEventRewardOccurrenceDestination(guide,search),null,search);
  for(const bad of ['../secret','//bad.site','https://bad.site','/Wand?x=1'])
    assert.throws(()=>guideEventRewardOccurrenceHref(
      guide,'HauntedFloatingFestival2026','40004651',bad),/BASE/);
  assert.equal(guideEventRewardOccurrenceHref(guide,'HauntedFloatingFestival2026','40002421'),null);
  assert.throws(()=>relatedEventRewardIds({...guide,coverage:{...guide.coverage,sourceNativeEvents:1}},'40004651'),/SOURCE_REQUIRED/);
});

test('only 109 native reward Items in published DB-00 receive Collection links',async()=>{
  const names=verifyEventRewardItemLabels(JSON.parse(await readFile(
    new URL('../static/guide/public/event-reward-item-labels-1.26.2.json',import.meta.url),
    'utf8')),guide);
  const items=[...new Set([
    ...guide.events.flatMap(event=>event.rewards.map(reward=>reward.itemId)),
    ...guide.defaultFriendship.map(reward=>reward.itemId)
  ])];
  const valid=items.map(itemId=>guideEventRewardCollectionHref(
    guide,names,null,itemId,'/Wand')).filter(Boolean);
  assert.equal(items.length,141);
  assert.equal(valid.length,109);
  assert.equal(guideEventRewardCollectionHref(guide,names,null,'40006319','/Wand'),
    '/Wand/collection/?item=40006319');
  assert.equal(guideEventRewardCollectionHref(guide,names,null,'80000000','/Wand'),null);
  assert.equal(guideEventRewardCollectionHref(guide,names,null,'80100000'),null);
  assert.equal(guideEventRewardCollectionHref(guide,null,null,'40006319'),null,
    'do not link until source-verified names have loaded');
  for(const itemId of ['0','00040006319','__proto__','999999999999999','99999999999999999',
    'javascript:alert(1)',null]){
    assert.equal(guideEventRewardCollectionHref(guide,names,null,itemId),null);
  }
  for(const base of ['//evil','/Wand/../evil','https://evil.site']){
    assert.throws(()=>guideEventRewardCollectionHref(guide,names,null,'40006319',base),
      /COLLECTION_INVALID_ITEM_LINK/);
  }
  assert.throws(()=>guideEventRewardCollectionHref({...guide,schema:'forged'},
    names,null,'40006319'),/DB03_EVENT_COLLECTION_SOURCE_REQUIRED/);
});
