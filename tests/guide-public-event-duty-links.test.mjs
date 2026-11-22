import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPublicEventFriendshipRewards}
  from '../src/lib/guide/public-event-friendship-rewards.ts';
import {
  DB03_EVENT_DUTY_SCHEMA,DB03_EVENT_DUTY_FILE,DB03_EVENT_DUTY_BYTES,
  DB03_EVENT_DUTY_SHA,verifyPublicEventDutyLinks,loadPublicEventDutyLinks,guideEventDutyHref
} from '../src/lib/guide/public-event-duty-links.ts';

const root=new URL('../static/guide/public/',import.meta.url);
async function originals(){
  const [eventsRaw,bytes]=await Promise.all([
    readFile(new URL('event-friendship-rewards-1.26.2.json',root)),
    readFile(new URL(DB03_EVENT_DUTY_FILE,root))
  ]);
  return {
    events:verifyPublicEventFriendshipRewards(JSON.parse(eventsRaw.toString('utf8'))),
    raw:JSON.parse(bytes.toString('utf8')),bytes
  };
}
test('public native graph has exactly 79 source-verified Duty refs across 18 events',async()=>{
  const {events,raw,bytes}=await originals();
  assert.equal(bytes.length,DB03_EVENT_DUTY_BYTES);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),DB03_EVENT_DUTY_SHA);
  const graph=verifyPublicEventDutyLinks(raw,events);
  assert.equal(graph.schema,DB03_EVENT_DUTY_SCHEMA);
  assert.equal(graph.gameVersion,'1.26.2');
  assert.deepEqual(graph.coverage,{
    originalReferences:84,
    internalTestReferencesExcluded:5,
    publishedReferences:79,
    linkedEvents:18,
    distinctDuties:48,
    sourceOnly:true,currentAvailabilityVerified:false,
    dutyUnlockConditionsVerified:false,playerProgressVerified:false,
    dutyNamesVerified:false
  });
  assert.equal(graph.getEventDuties('DreamlightParkFest_UI_2026').length,11);
  assert.deepEqual(graph.getEventDuties('DreamlightParkFest_UI_2026').map(x=>x.dutyId).slice(-2),
    ['2110100299','2110100374']);
  assert.deepEqual(graph.getEventDuties('SummerSizzle_UI_2026').map(x=>x.dutyId),
    ['2110100234','2110100235','2110100376']);
  assert.equal(graph.getEventDuties('TestEv').length,0);
  assert.equal(graph.getEventDuties('__proto__').length,0);
  assert.deepEqual(graph.getDutyEvents('2110100289').map(x=>x.eventId),
    ['LuckyYou_UI_2026','StPatrick']);
  assert.deepEqual(graph.getDutyEvents(2110100135).map(x=>x.eventId),
    ['TrickOrTreat','TrickOrTreat_2026']);
  assert.equal(graph.getDutyEvents('99999999').length,0);
  assert.equal(graph.getDutyEvents('0').length,0);
  assert.equal(graph.getDutyEvents('2110100135x').length,0);
  assert(Object.isFrozen(graph));
  assert(Object.isFrozen(graph.coverage));
  assert(Object.isFrozen(graph.getEventDuties('DreamlightParkFest')));
  assert(Object.isFrozen(graph.getEventDuties('DreamlightParkFest')[0]));
  assert(Object.isFrozen(graph.getDutyEvents('2110100289')));
});
test('every native duty joins a real public Mini Event and has a reversible static ID edge',async()=>{
  const {events,raw}=await originals();
  const graph=verifyPublicEventDutyLinks(raw,events);
  const distinct=new Set();
  let n=0;
  for(const [eventId,ids] of Object.entries(raw.events)){
    const sourceEvent=events.getEvent('mini_event',eventId);
    assert(sourceEvent);
    assert.notEqual(sourceEvent.id,'TestEv');
    const links=graph.getEventDuties(eventId);
    assert.equal(links.length,ids.length);
    for(const [index,link] of links.entries()){
      assert.equal(link.dutyId,ids[index]);
      assert.equal(link.sourcePosition,index);
      assert.equal(link.nativeDutyIndexMembershipVerified,true);
      assert.equal(link.sourceConfigurationOnly,true);
      assert.equal(link.currentAvailabilityVerified,false);
      assert.equal(link.dutyUnlockConditionVerified,false);
      assert.equal(link.playerProgressVerified,false);
      assert.equal(link.dutyNameVerified,false);
      assert(graph.getDutyEvents(link.dutyId).includes(link));
      distinct.add(link.dutyId);n++;
    }
  }
  assert.equal(n,79);
  assert.equal(distinct.size,48);
});
test('bytes and SHA checks fail closed for edited, truncated or inaccessible source graphs',async()=>{
  const {events,bytes}=await originals();
  const stub=buffer=>async()=>new Response(buffer,{status:200});
  const good=await loadPublicEventDutyLinks(events,'/Wand/guide/public/'+
    DB03_EVENT_DUTY_FILE,stub(bytes));
  assert.equal(good.coverage.publishedReferences,79);
  const edited=Buffer.from(bytes);edited[55]^=1;
  await assert.rejects(loadPublicEventDutyLinks(events,'/',stub(edited)),
    /DB03_EVENT_DUTY_SHA/);
  await assert.rejects(loadPublicEventDutyLinks(events,'/',stub('bad')),
    /DB03_EVENT_DUTY_BYTES/);
  await assert.rejects(loadPublicEventDutyLinks(events,'/',async()=>
    new Response('missing',{status:404})),/DB03_EVENT_DUTY_DOWNLOAD_FAILED/);
});
test('forged source statuses, internal TestEv and invalid or duplicated Duty IDs are rejected',async()=>{
  const {events,raw}=await originals();
  let edited=structuredClone(raw);edited.source.dutyNamesVerified=true;
  assert.throws(()=>verifyPublicEventDutyLinks(edited,events),/PROVENANCE/);
  edited=structuredClone(raw);edited.source.dutyOriginalIndexMembershipVerified=false;
  assert.throws(()=>verifyPublicEventDutyLinks(edited,events),/PROVENANCE/);
  edited=structuredClone(raw);edited.target.gameVersion='1.26.3';
  assert.throws(()=>verifyPublicEventDutyLinks(edited,events),/TARGET/);
  edited=structuredClone(raw);edited.events.TestEv=['2110100135'];
  assert.throws(()=>verifyPublicEventDutyLinks(edited,events),/COUNTS/);
  edited=structuredClone(raw);edited.events.DreamlightParkFest[0]='0';
  assert.throws(()=>verifyPublicEventDutyLinks(edited,events),/DUTY_ID/);
  edited=structuredClone(raw);edited.events.DreamlightParkFest[0]=
    edited.events.DreamlightParkFest[1];
  assert.throws(()=>verifyPublicEventDutyLinks(edited,events),/DUPLICATE_DUTY/);
  edited=structuredClone(raw);edited.events.DreamlightParkFest.shift();
  assert.throws(()=>verifyPublicEventDutyLinks(edited,events),/RECOMPUTED_COUNTS/);
  edited=structuredClone(raw);edited.events.DreamlightParkFest=[];
  assert.throws(()=>verifyPublicEventDutyLinks(edited,events),/EVENT/);
  edited=structuredClone(raw);edited.events.DreamlightParkFest[0]='11111111111111111';
  assert.throws(()=>verifyPublicEventDutyLinks(edited,events),/DUTY_ID/);
});

test('native Duty reverse permalinks require an existing source ID and preserve shared Event membership',async()=>{
  const {events,raw}=await originals();
  const graph=verifyPublicEventDutyLinks(raw,events);
  assert.equal(guideEventDutyHref(graph,'2110100289','/Wand'),
    '/Wand/guide/events/?duty=2110100289');
  assert.deepEqual(graph.getDutyEvents('2110100289').map(x=>x.eventId),
    ['LuckyYou_UI_2026','StPatrick']);
  assert.equal(guideEventDutyHref(graph,2110100135),
    '/guide/events/?duty=2110100135');
  for(const id of ['0','0002110100289','2110100289x','99999999',Number.MAX_SAFE_INTEGER+1,null]){
    assert.equal(guideEventDutyHref(graph,id,'/Wand'),null);
  }
  assert.throws(()=>guideEventDutyHref(graph,'2110100289','/../private'),
    /DB03_EVENT_DUTY_BASE/);
  assert.throws(()=>guideEventDutyHref(null,'2110100289'),
    /DB03_EVENT_DUTY_INDEX_REQUIRED/);
});
