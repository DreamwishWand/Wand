import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicEventFriendshipRewards} from '../src/lib/guide/public-event-friendship-rewards.ts';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.ts';
import {guideCalendarEvents,eventScheduleState} from '../src/lib/guide/event-calendar.ts';
import {GUIDE_NATIVE_EVENT_WINDOWS,GUIDE_NATIVE_EVENT_SCHEDULE_SOURCE_SHA}
  from '../src/lib/guide/native-event-windows.ts';
import {mergeGuideNativeEvents} from '../src/lib/guide/native-event-calendar.ts';
import {guideTimelineWindow,guideTimelineRows} from '../src/lib/guide/event-timeline.ts';
import {viewerEventDateTime} from '../src/lib/guide/viewer-event-time.ts';

const read=async path=>JSON.parse(await readFile(
  new URL('../static/guide/public/'+path,import.meta.url),'utf8'));
const all=async()=>{
  const star=verifyPublicStarpath(await read('starpath-cache-2026-11-22.json'));
  const native=verifyPublicEventFriendshipRewards(await read('event-friendship-rewards-1.26.2.json'));
  return mergeGuideNativeEvents(guideCalendarEvents(star),native);
};

test('game-original event source supplies 18 real Mini Events + 5 Floating Festivals, not test data',()=>{
  assert.equal(GUIDE_NATIVE_EVENT_SCHEDULE_SOURCE_SHA,
    'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623');
  assert.equal(GUIDE_NATIVE_EVENT_WINDOWS.length,23);
  assert.equal(GUIDE_NATIVE_EVENT_WINDOWS.filter(x=>x[0]==='mini').length,18);
  assert.equal(GUIDE_NATIVE_EVENT_WINDOWS.filter(x=>x[0]==='festival').length,5);
  assert(!GUIDE_NATIVE_EVENT_WINDOWS.some(x=>x[1]==='TestEv'));
  const keys=new Set(GUIDE_NATIVE_EVENT_WINDOWS.map(x=>x[1]));
  assert.equal(keys.size,23);
  for(const [kind,id,teaser,start,end] of GUIDE_NATIVE_EVENT_WINDOWS){
    assert(['mini','festival'].includes(kind)&&id);
    assert(Date.parse(teaser)<=Date.parse(start)&&Date.parse(start)<Date.parse(end));
  }
});
test('source-backed seasons merge with historic announcements and never duplicate same run',async()=>{
  const events=await all();
  assert.equal(events.length,34);
  assert.equal(new Set(events.map(e=>e.id)).size,34);
  const native=events.filter(e=>e.kind==='limited-event'&&e.evidence==='verified-game-original');
  assert.equal(native.length,23);
  assert.equal(native.filter(e=>e.category==='floating').length,5);
  assert(native.every(e=>e.href==='/guide/events/?event='+encodeURIComponent(e.nativeEventId)));
  assert(native.every(e=>e.nativeNames.ja&&e.nativeNames.en));
  assert.equal(events.filter(e=>e.id==='haunted-floating-festival-2026').length,1);
  assert.equal(events.filter(e=>e.id==='trick-or-treat-2025').length,1);
  assert.equal(events.filter(e=>e.id==='dreamlight-parks-fest-2026').length,1);
  assert.equal(events.filter(e=>e.kind==='starpath-history').length,2);
  assert.equal(events.filter(e=>e.kind==='starpath').length,2);
});
test('replayability is not deduced from an archived source time',async()=>{
  const events=await all();
  const winter=events.find(e=>e.nativeEventId==='WinterFloatingFestival');
  assert(winter);
  assert.equal(winter.participation,'not-verified');
  assert.equal(winter.sourceStartUtc,'2026-01-07T00:00:00Z');
  assert.equal(winter.sourceEndUtcInclusive,'2026-01-28T23:59:00Z');
  const spring=events.find(e=>e.nativeEventId==='SpringFloatingFestival');
  assert.equal(spring?.startDay,'2026-04-29');
  assert.equal(spring?.endDayInclusive,'2026-05-19');
  const easter=events.find(e=>e.nativeEventId==='Eggstravaganza_UI_2026');
  assert.equal(easter?.sourceStartUtc,'2026-04-01T00:00:00Z');
  assert.equal(easter?.sourceEndUtcInclusive,'2026-04-21T23:59:00Z');
  const before=Date.parse('2026-04-01T00:00:00Z');
  assert.equal(eventScheduleState(easter,before-1),'upcoming');
  assert.equal(eventScheduleState(easter,before),'date-window');
  assert.equal(eventScheduleState(easter,Date.parse(easter.sourceEndUtcInclusive)),'date-window');
  assert.equal(eventScheduleState(easter,Date.parse(easter.sourceEndUtcInclusive)+1),'ended');
});
test('original instants project precisely to viewer-local time and timeline cells',async()=>{
  const events=await all();
  const haunted=events.find(e=>e.nativeEventId==='HauntedFloatingFestival2026');
  assert(haunted);
  assert.match(viewerEventDateTime(haunted.sourceStartUtc,'America/Los_Angeles','ja-JP'),
    /2026\/10\/06 17:00 GMT-7/);
  const range=guideTimelineWindow(Date.parse('2026-10-08T12:00:00Z'),5,0,'America/Los_Angeles');
  const row=guideTimelineRows([haunted],range)[0];
  assert(row&&row.segments.length===1);
  assert.equal(row.segments[0].phase,'limited');
  assert.equal(haunted.nativeNames.ja,'ホーンテッドフローティングフェスティバル');
});
