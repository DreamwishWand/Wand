import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.mjs';
import {verifyPublicEventFriendshipRewards} from '../src/lib/guide/public-event-friendship-rewards.ts';
import {verifyPublicEventQuestLinks} from '../src/lib/guide/public-event-quest-links.ts';
import {createEventQuestNameSearch,DB03_EVENT_QUEST_SEARCH_SCHEMA}
  from '../src/lib/guide/event-quest-name-search.ts';

const root=new URL('../static/guide/public/',import.meta.url);
async function sources(){
  const [rawQuest,rawEvents,rawLinks]=await Promise.all([
    readFile(new URL('quest-index.json',root),'utf8'),
    readFile(new URL('event-friendship-rewards-1.26.2.json',root),'utf8'),
    readFile(new URL('event-quest-links-1.26.2.json',root),'utf8')
  ]);
  const quests=verifyPublicQuestIndex(JSON.parse(rawQuest));
  const events=verifyPublicEventFriendshipRewards(JSON.parse(rawEvents));
  const links=verifyPublicEventQuestLinks(JSON.parse(rawLinks),events,quests);
  return {quests,events,links};
}
function match(index,events,word,locale='ja'){
  const q=word.normalize('NFKC').toLocaleLowerCase();
  return events.events.filter(event=>event.id!=='TestEv'&&
    index.getEventSearchTerms(event.id,locale).some(term=>
      term.normalize('NFKC').toLocaleLowerCase().includes(q))).map(e=>e.id);
}
test('source-verified 49 Quest IDs enable localized names and exact quest-ID event search',async()=>{
  const {quests,events,links}=await sources();
  const index=createEventQuestNameSearch(events,quests,links);
  assert.equal(index.schema,DB03_EVENT_QUEST_SEARCH_SCHEMA);
  assert.equal(index.gameVersion,'1.26.2');
  assert.equal(index.linkedEvents,8);
  assert.equal(index.linkedQuests,49);
  assert.equal(index.currentAvailabilityVerified,false);
  assert.equal(index.playerProgressVerified,false);
  assert.equal(index.questPrerequisitesVerified,false);
  assert.deepEqual(match(index,events,'動物のオヤツ'),[
    'DreamlightParkFest','DreamlightParkFest_UI_2026']);
  assert.deepEqual(match(index,events,'Critter Snacks','en'),[
    'DreamlightParkFest','DreamlightParkFest_UI_2026']);
  assert.deepEqual(match(index,events,'2070001248'),[
    'DreamlightParkFest','DreamlightParkFest_UI_2026']);
  assert.deepEqual(match(index,events,'実在しないクエスト'),[]);
  assert.deepEqual(index.getEventSearchTerms('TestEv','ja'),[]);
  assert.deepEqual(index.getEventSearchTerms('HauntedFloatingFestival2026','ja'),[]);
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.getEventSearchTerms('DreamlightParkFest_UI_2026','ja')));
  assert.equal(index.getEventSearchTerms('DreamlightParkFest_UI_2026','ja')
    .filter(x=>x==='ドリームライトパークフェス：動物のオヤツ').length,1);
});
test('locale fallback uses already public English names only and never private native keys',async()=>{
  const {quests,events,links}=await sources();
  const altered=structuredClone(quests);
  const row=altered.quests.find(q=>q.id==='2070001248');
  delete row.names.fr;
  const index=createEventQuestNameSearch(events,altered,links);
  assert(index.getEventSearchTerms('DreamlightParkFest_UI_2026','fr')
    .includes('Dreamlight Parks Fest: Critter Snacks'));
  assert(index.getEventSearchTerms('DreamlightParkFest_UI_2026','ja')
    .includes('ドリームライトパークフェス：動物のオヤツ'));
  assert(!index.getEventSearchTerms('DreamlightParkFest_UI_2026','ja')
    .some(t=>t.includes('Story!')));
  const noCopy=index.getEventSearchTerms('__proto__','ja');
  assert.deepEqual(noCopy,[]);
});
test('wrong sources, changed link provenance and missing Quest source fail closed',async()=>{
  const {quests,events,links}=await sources();
  assert.throws(()=>createEventQuestNameSearch(null,quests,links),
    /DB03_EVENT_QUEST_SEARCH_EVENT_SOURCE_REQUIRED/);
  assert.throws(()=>createEventQuestNameSearch(events,quests,null),
    /DB03_EVENT_QUEST_SEARCH_LINK_SOURCE_REQUIRED/);
  const forged=Object.create(links);
  Object.defineProperty(forged,'getEventQuests',{value:()=>[{eventId:'TestEv',questId:'2070001248',
    nativeStaticReference:true,prerequisiteVerified:false,
    playerCompletionVerified:false,liveEventVerified:false}]});
  assert.throws(()=>createEventQuestNameSearch(events,quests,forged),
    /DB03_EVENT_QUEST_SEARCH_RELATION/);
  const omitted=structuredClone(quests);
  omitted.quests=omitted.quests.filter(row=>row.id!=='2070001248');
  assert.throws(()=>createEventQuestNameSearch(events,omitted,links),
    /Public Guide:/);
});
test('Guide event search combines Quest source titles without a new technical UI',async()=>{
  const route=await readFile(new URL('../src/routes/guide/events/+page.svelte',import.meta.url),'utf8');
  assert.match(route,/createEventQuestNameSearch\(eventSource,catalog,links\)/);
  assert.match(route,/questSearch\?\.getEventSearchTerms\(event.id,language\)/);
  assert.match(route,/イベント・クエスト・アイテムを検索/);
  assert.match(route,/if\(source===eventSource\)\s*\{/);
  assert.match(route,/questCatalogue=catalog;eventQuestLinks=links;questNameSearch=names;/);
  assert.match(route,/const matches=links\.getQuestEvents\(requested\[0\]\)/);
});
