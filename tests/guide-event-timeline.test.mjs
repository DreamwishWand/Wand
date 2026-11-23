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

test('JST week tracks keep every reset Wednesday in the middle of a Sun–Sat week',()=>{
  const range=guideTimelineWindow(at('2026-11-22T12:00:00Z'));
  assert.equal(range.days.length,35);
  assert.equal(range.firstDay,'2026-11-08');
  assert.equal(range.lastDay,'2026-12-12');
  assert.equal(range.todayDay,'2026-11-22');
  assert.equal(range.days.filter(x=>x.reset).length,5);
  assert.deepEqual(range.days.filter(x=>x.reset).map(x=>x.day),
    ['2026-11-11','2026-11-18','2026-11-25','2026-12-02','2026-12-09']);
  for(let i=0;i<range.days.length;i++)
    assert.equal(range.days[i].reset,i%7===3);
  assert.equal(range.days.filter(x=>x.today).length,1);
  const season=guideTimelineWindow(at('2026-11-22T12:00:00Z'),9);
  assert.equal(season.days.length,63);
  assert.equal(season.days.filter(x=>x.reset).length,9);
  assert.equal(guideTimelineWindow(at('2026-11-22T12:00:00Z'),5,-5).firstDay,
    '2026-10-04');
});
test('real source star paths stay separate task/exchange bands with exact non-midnight JST boundaries',async()=>{
  const data=await events();
  const range=guideTimelineWindow(at('2026-11-22T12:00:00Z'));
  const rows=guideTimelineRows(data,range);
  assert.deepEqual(rows.map(x=>x.event.id),
    ['haunting-elegance-2026','seafaring-2026']);
  assert.deepEqual(rows.map(x=>x.segments.map(s=>s.phase)),
    [['task','exchange'],['task','exchange']]);
  const haunting=rows[0].segments;
  assert.equal(haunting[0].clippedStart,true);
  assert.equal(haunting[1].clippedEnd,false);
  approx(haunting[0].left,0);
  // 2026-12-08 14:00Z corresponds exactly to Dec 8 23:00 JST, i.e.
  // 30 days + 23 hours after Sunday Nov 8 JST, not an all-day deadline.
  const finish=100*(30+23/24)/35;
  approx(haunting[0].left+haunting[0].width,finish);
  approx(haunting[1].left,finish);
  assert(haunting[1].width>0);
});
test('date-only festival covers exactly its announced calendar days, without an invented UTC clock',async()=>{
  const range=guideTimelineWindow(at('2026-11-22T12:00:00Z'),5,-5);
  const festival=guideTimelineRows(await events(),range)
    .find(row=>row.event.id==='haunted-floating-festival-2026');
  assert(festival);
  assert.equal(festival.segments.length,1);
  const s=festival.segments[0];
  assert.equal(s.phase,'limited');
  approx(s.left,100*3/35); // Oct 7 JST
  approx(s.width,100*25/35); // inclusive Oct 31, 25 complete calendar dates
  assert.equal(s.clippedStart,false);
  assert.equal(s.clippedEnd,false);
  assert.equal(festival.event.precision,'date-only');
  assert.equal(Object.hasOwn(festival.event,'startUtc'),false);
});
test('exclusive deadline and exact midnight transitions neither extend nor disappear',()=>{
  const range=guideTimelineWindow(at('2026-11-22T12:00:00Z'));
  const source={
    id:'fixture',kind:'starpath',precision:'utc-instant',
    startUtc:'2026-11-11T15:00:00Z', // 11/12 JST midnight
    taskEndUtcExclusive:'2026-11-12T03:00:00Z', // 11/12 JST noon
    endUtcExclusive:'2026-11-12T15:00:00Z' // 11/13 JST midnight
  };
  const segments=guideTimelineRows([source],range)[0].segments;
  assert.equal(segments.length,2);
  approx(segments[0].width,100*0.5/35);
  approx(segments[1].width,100*0.5/35);
  approx(segments[0].left+segments[0].width,segments[1].left);
  assert.equal(guideTimelineRows([{
    ...source,id:'outside',startUtc:'2026-10-01T00:00:00Z',
    taskEndUtcExclusive:'2026-10-02T00:00:00Z',
    endUtcExclusive:'2026-10-03T00:00:00Z'
  }],range).length,0);
  assert.throws(()=>guideTimelineWindow(NaN),/invalid range/);
  assert.throws(()=>guideTimelineWindow(Date.now(),5,200),/invalid range/);
});
