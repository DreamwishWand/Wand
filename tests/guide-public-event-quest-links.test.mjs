import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.mjs';
import {verifyPublicEventFriendshipRewards} from '../src/lib/guide/public-event-friendship-rewards.ts';
import {
  verifyPublicEventQuestLinks,loadPublicEventQuestLinks,
  DB03_EVENT_QUEST_BYTES,DB03_EVENT_QUEST_SHA,DB03_EVENT_QUEST_FILE
} from '../src/lib/guide/public-event-quest-links.ts';

const root=new URL('../static/guide/public/',import.meta.url);
async function loadSources(){
  const [questText,eventText,bytes]=await Promise.all([
    readFile(new URL('quest-index.json',root),'utf8'),
    readFile(new URL('event-friendship-rewards-1.26.2.json',root),'utf8'),
    readFile(new URL(DB03_EVENT_QUEST_FILE,root))
  ]);
  const quests=verifyPublicQuestIndex(JSON.parse(questText));
  const events=verifyPublicEventFriendshipRewards(JSON.parse(eventText));
  return {quests,events,bytes,raw:JSON.parse(bytes.toString('utf8'))};
}
test('62 authenticated native Mini Event references link eight playable Events to 49 Quests',async()=>{
  const {quests,events,bytes,raw}=await loadSources();
  assert.equal(bytes.byteLength,DB03_EVENT_QUEST_BYTES);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),DB03_EVENT_QUEST_SHA);
  const links=verifyPublicEventQuestLinks(raw,events,quests);
  assert.equal(links.coverage.originalSourceLinks,66);
  assert.equal(links.coverage.excludedInternalTestLinks,4);
  assert.equal(links.coverage.publicLinks,62);
  assert.equal(links.coverage.linkedEvents,8);
  assert.equal(links.coverage.distinctQuests,49);
  assert.equal(links.coverage.currentAvailabilityVerified,false);
  assert.equal(links.coverage.questPrerequisitesVerified,false);
  assert.equal(links.coverage.playerProgressVerified,false);
  const park=links.getEventQuests('DreamlightParkFest_UI_2026');
  assert.equal(park.length,19);
  assert.equal(park[6].questId,'2070001248');
  assert.equal(park[6].sourcePosition,6);
  assert.equal(links.getEventQuests('ClickAndMagic_UI_2026').length,7);
  assert.equal(links.getEventQuests('TestEv').length,0);
  assert.equal(links.getEventQuests('__proto__').length,0);
  const reverse=links.getQuestEvents('2070001248');
  assert.deepEqual(reverse.map(x=>x.eventId),
    ['DreamlightParkFest','DreamlightParkFest_UI_2026']);
  assert(reverse.every(x=>x.nativeStaticReference===true&&
    !x.liveEventVerified&&!x.prerequisiteVerified&&!x.playerCompletionVerified));
  assert(Object.isFrozen(links));
  assert(Object.isFrozen(park));
  assert(Object.isFrozen(park[0]));
  assert(Object.isFrozen(reverse));
  assert.deepEqual(links.getQuestEvents('2070000653'),[]);
});
test('all native links resolve to verified Quest and Event source IDs and round-trip',async()=>{
  const {quests,events,raw}=await loadSources();
  const reader=verifyPublicEventQuestLinks(raw,events,quests);
  const known=new Set(quests.quests.map(x=>x.id));
  let total=0;
  for(const [id,questIds] of Object.entries(raw.events)){
    assert(events.getEvent('mini_event',id));
    const links=reader.getEventQuests(id);
    assert.equal(links.length,questIds.length);
    for(const link of links){
      assert(known.has(link.questId));
      assert.equal(link.questId,questIds[link.sourcePosition]);
      assert(reader.getQuestEvents(link.questId).some(ref=>ref===link));
      total++;
    }
  }
  assert.equal(total,62);
});
test('new public Event-Quest source reader fails closed on inconsistent pins or IDs',async()=>{
  const {quests,events,bytes,raw}=await loadSources();
  const stub=buffer=>async()=>new Response(buffer,{status:200});
  const reader=await loadPublicEventQuestLinks(events,quests,'/Wand/guide/public/'+
    DB03_EVENT_QUEST_FILE,stub(bytes));
  assert.equal(reader.getEventQuests('Eggstravaganza').length,2);
  const altered=Buffer.from(bytes);altered[75]^=1;
  await assert.rejects(loadPublicEventQuestLinks(events,quests,'/',stub(altered)),
    /DB03_EVENT_QUEST_SHA/);
  await assert.rejects(loadPublicEventQuestLinks(events,quests,'/',stub('bad')),
    /DB03_EVENT_QUEST_BYTES/);
  let v=structuredClone(raw);v.source.prerequisitesVerified=true;
  assert.throws(()=>verifyPublicEventQuestLinks(v,events,quests),/SOURCE_PROVENANCE/);
  v=structuredClone(raw);v.events.DreamlightParkFest[0]='9999999999';
  assert.throws(()=>verifyPublicEventQuestLinks(v,events,quests),/QUEST_ID/);
  v=structuredClone(raw);v.events.TestEv=['2070000653'];
  assert.throws(()=>verifyPublicEventQuestLinks(v,events,quests),/CENSUS/);
  v=structuredClone(raw);v.events.Eggstravaganza[1]=v.events.Eggstravaganza[0];
  assert.throws(()=>verifyPublicEventQuestLinks(v,events,quests),/DUPLICATE_REFERENCE/);
  v=structuredClone(raw);v.events.DreamlightParkFest.shift();
  assert.throws(()=>verifyPublicEventQuestLinks(v,events,quests),/RECOMPUTED_CENSUS/);
});
test('the public Guide and Quest routes link by actual ID without enabling private-source publication',async()=>{
  const [events,quests]=await Promise.all([
    readFile(new URL('../src/routes/guide/events/+page.svelte',import.meta.url),'utf8'),
    readFile(new URL('../src/routes/guide/quests/+page.svelte',import.meta.url),'utf8')
  ]);
  assert.match(events,/loadPublicEventQuestLinks/);
  assert.match(events,/questCatalogue=catalog;eventQuestLinks=links/);
  assert.match(events,/guide\/quests\/\?quest=/);
  assert.match(events,/原本に関連付けられたクエスト/);
  assert.match(quests,/loadRelatedEventLinks/);
  assert.match(quests,/relatedEventSource=events;relatedEventIndex=links/);
  assert.match(quests,/guide\/events\/\?event=/);
  assert.match(quests,/関連イベント（/);
});
