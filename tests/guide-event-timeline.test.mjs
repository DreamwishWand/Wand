import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {guideCalendarEvents} from '../src/lib/guide/event-calendar.ts';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.ts';
import {guideTimelineWindow,guideTimelineRows} from '../src/lib/guide/event-timeline.ts';

const at=value=>Date.parse(value);
const snapshot=async()=>verifyPublicStarpath(JSON.parse(await readFile(
  new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url),'utf8'
)));
const events=async()=>guideCalendarEvents(await snapshot());
const approx=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} expected ${b}`);

test('today is four days into a future-first local five-week timeline',()=>{
  const range=guideTimelineWindow(at('2026-11-22T12:00:00Z'));
  assert.equal(range.firstDay,'2026-11-18');
  assert.equal(range.lastDay,'2026-12-22');
  assert.equal(range.days.length,35);
  assert.equal(range.days.findIndex(x=>x.today),4);
  assert.equal(range.todayDay,'2026-11-22');
  assert(range.todayPosition>10&&range.todayPosition<15);
  assert.deepEqual(range.days.filter(x=>x.reset).map(x=>x.day),
    ['2026-11-18','2026-11-25','2026-12-02','2026-12-09','2026-12-16']);
  assert.equal(guideTimelineWindow(at('2026-11-22T12:00:00Z'),9).days.length,63);
  assert.equal(guideTimelineWindow(at('2026-11-22T12:00:00Z'),5,-5).firstDay,'2026-10-14');
  assert.equal(guideTimelineWindow(at('2026-11-22T12:00:00Z'),5,5).firstDay,'2026-12-23');
});
test('same UTC instant projects different date cells for users in different timezones',()=>{
  const now=at('2026-11-23T00:30:00Z');
  const tokyo=guideTimelineWindow(now,5,0,'Asia/Tokyo');
  const losAngeles=guideTimelineWindow(now,5,0,'America/Los_Angeles');
  assert.equal(tokyo.todayDay,'2026-11-23');
  assert.equal(losAngeles.todayDay,'2026-11-22');
  assert.equal(tokyo.firstDay,'2026-11-19');
  assert.equal(losAngeles.firstDay,'2026-11-18');
  for(const range of [tokyo,losAngeles]){
    assert.equal(range.days.filter(x=>x.today).length,1);
    assert.equal(range.days.filter(x=>x.reset).length,5);
  }
});
test('DST days have real 23- and 25-hour lengths with exact source UTC projection',()=>{
  const spring=guideTimelineWindow(at('2026-03-08T12:00:00Z'),5,0,'America/Los_Angeles');
  const fall=guideTimelineWindow(at('2026-11-01T12:00:00Z'),5,0,'America/Los_Angeles');
  const length=(range,day)=>{
    const i=range.days.findIndex(d=>d.day===day);
    assert(i>=0);return (range.starts[i+1]-range.starts[i])/3_600_000;
  };
  assert.equal(length(spring,'2026-03-08'),23);
  assert.equal(length(fall,'2026-11-01'),25);
  for(const range of [spring,fall])assert(range.todayPosition>10&&range.todayPosition<15);
});
test('real star paths keep exact task/exchange boundary at local fractions',async()=>{
  const range=guideTimelineWindow(at('2026-11-22T12:00:00Z'));
  const rows=guideTimelineRows(await events(),range);
  assert.deepEqual(rows.map(x=>x.event.id),
    ['haunting-elegance-2026','seafaring-2026']);
  assert.deepEqual(rows.map(x=>x.segments.map(s=>s.phase)),
    [['task','exchange'],['task','exchange']]);
  const h=rows[0].segments;
  assert.equal(h[0].clippedStart,true);
  approx(h[0].left,0);
  // Dec 8 23:00 JST is 20 whole days + 23 hours from Nov 18 00:00 JST.
  const finish=100*(20+23/24)/35;
  approx(h[0].left+h[0].width,finish);
  approx(h[1].left,finish);
});
test('floating festival is still date-only and classified separately from Star Paths',async()=>{
  const range=guideTimelineWindow(at('2026-11-22T12:00:00Z'),5,-5);
  const festival=guideTimelineRows(await events(),range)
    .find(row=>row.event.id==='haunted-floating-festival-2026');
  assert(festival);
  assert.equal(festival.event.category,'floating');
  assert.equal(festival.event.precision,'date-only');
  assert.equal(Object.hasOwn(festival.event,'startUtc'),false);
  assert.equal(festival.segments.length,1);
  const s=festival.segments[0];
  assert.equal(s.phase,'limited');
  assert.equal(s.clippedStart,true); // Oct 7 festival started before Oct 14
  approx(s.left,0);
  approx(s.width,100*18/35); // Oct 14..31 inclusive
});
test('phase transitions stay contiguous and invalid source times fail closed',()=>{
  const range=guideTimelineWindow(at('2026-11-22T12:00:00Z'));
  const source={
    id:'fixture',kind:'starpath',precision:'utc-instant',
    startUtc:'2026-11-18T15:00:00Z',
    taskEndUtcExclusive:'2026-11-19T03:00:00Z',
    endUtcExclusive:'2026-11-19T15:00:00Z'
  };
  const segments=guideTimelineRows([source],range)[0].segments;
  assert.equal(segments.length,2);
  approx(segments[0].width,100*.5/35);
  approx(segments[1].width,100*.5/35);
  approx(segments[0].left+segments[0].width,segments[1].left);
  assert.equal(guideTimelineRows([{
    ...source,startUtc:'2026-10-01T00:00:00Z',
    taskEndUtcExclusive:'2026-10-02T00:00:00Z',
    endUtcExclusive:'2026-10-03T00:00:00Z'
  }],range).length,0);
  assert.throws(()=>guideTimelineWindow(NaN),/invalid range/);
  assert.throws(()=>guideTimelineWindow(Date.now(),5,521),/invalid range/);
});

test('archive reaches 2022 launch without inventing a playable historic Star Path season',async()=>{
  const range=guideTimelineWindow(at('2026-11-22T12:00:00Z'),5,-220);
  assert(range.days.some(d=>d.day==='2022-09-06'));
  const rows=guideTimelineRows(await events(),range);
  assert.equal(rows.length,1);
  assert.equal(rows[0].event.id,'pixar-fest-star-path-2022');
  assert.deepEqual(rows[0].segments.map(s=>s.phase),['historic']);
  assert.equal(rows[0].event.precision,'date-only');
  assert.equal(rows[0].event.kind,'starpath-history');
  assert.equal(rows[0].event.officialEndUtc,'2022-10-11T13:00:00Z');
  assert.equal(Object.hasOwn(rows[0].event,'taskEndUtcExclusive'),false,
    '2022 task and grace boundaries must not be fabricated');
});

test('dated archived in-game events are visible independently of the liveops cache',async()=>{
  const all=await events();
  const cases=[
    ['2023-10-25','trick-or-treat-2023'],
    ['2024-10-24','trick-or-treat-2024'],
    ['2025-10-23','haunted-floating-festival-2025'],
    ['2026-10-20','trick-or-treat-2026']
  ];
  for(const [day,id] of cases){
    const now=at(day+'T12:00:00Z');
    const range=guideTimelineWindow(now,5,0,'UTC');
    const rows=guideTimelineRows(all,range);
    assert(rows.some(row=>row.event.id===id),id);
  }
  assert.equal(all.filter(e=>e.kind==='starpath-history').length,1);
  assert.equal(all.filter(e=>e.kind==='starpath').length,2);
});
