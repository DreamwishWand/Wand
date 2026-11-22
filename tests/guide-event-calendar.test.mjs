import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.mjs';
import {verifyPublicQuestIndex,publicQuestSection,filterPublicQuests} from '../src/lib/guide/public-guide.mjs';
import {
  GUIDE_EVENT_CALENDAR_CONTRACT,GUIDE_EVENT_CALENDAR_AS_OF,GUIDE_EVENT_CALENDAR_SOURCES,
  guideCalendarEvents,eventScheduleState,activeScheduleStarpaths,guideCalendarMonth,localGuideDateTime
} from '../src/lib/guide/event-calendar.mjs';
import {
  actionableStarpathTask,STARPATH_REVIEWED_DAILY_COUNT,STARPATH_REVIEWED_WEEKLY_COUNT
} from '../src/lib/guide/starpath-task-guidance.mjs';
const sourceDir=new URL('../static/guide/public/',import.meta.url);
const snapshot=async()=>verifyPublicStarpath(JSON.parse(await readFile(new URL('starpath-cache-2026-11-22.json',sourceDir))));
const quests=async()=>verifyPublicQuestIndex(JSON.parse(await readFile(new URL('quest-index.json',sourceDir))));
const at=date=>Date.parse(date);
test('Guide event calendar distinguishes owner-cache UTC schedule from unverified online live availability',async()=>{
  const events=guideCalendarEvents(await snapshot());
  assert.equal(GUIDE_EVENT_CALENDAR_CONTRACT,'wand.db03.event-calendar-schedule@1');
  assert.equal(GUIDE_EVENT_CALENDAR_AS_OF,'2026-11-22');
  assert.equal(events.length,3);
  assert.equal(events.filter(e=>e.kind==='starpath').length,2);
  assert.equal(events.filter(e=>e.kind==='limited-event').length,1);
  assert(events.every(e=>e.liveVerified===false));
  assert(events.every(e=>e.sourceUrl.startsWith('https://disneydreamlightvalley.com/')));
  assert.equal(events[0].taskEndUtcExclusive,'2026-12-08T14:00:00Z');
  assert.equal(events[0].endUtcExclusive,'2026-12-09T14:00:00Z');
  assert.equal(events[1].taskEndUtcExclusive,'2026-12-01T14:00:00Z');
  assert.equal(events[2].precision,'date-only');
  assert.equal(events[2].startDay,'2026-10-07');
  assert.equal(events[2].endDayInclusive,'2026-10-31');
  assert(!('startUtc' in events[2]),'do not invent a festival starting hour');
  assert(!('endUtcExclusive' in events[2]),'do not invent a festival deadline hour');
  assert.match(localGuideDateTime(events[1].taskEndUtcExclusive),/2026\/12\/01 23:00 JST/);
});
test('now-driven Star Path task visibility respects exclusive finish and separate reward exchange period',async()=>{
  const ev=guideCalendarEvents(await snapshot());
  const haunting=ev[0],seafaring=ev[1];
  assert.equal(eventScheduleState(haunting,at('2026-09-23T12:59:59Z')),'upcoming');
  assert.equal(eventScheduleState(haunting,at('2026-09-23T13:00:00Z')),'task-window');
  assert.equal(eventScheduleState(haunting,at('2026-12-08T13:59:59Z')),'task-window');
  assert.equal(eventScheduleState(haunting,at('2026-12-08T14:00:00Z')),'exchange-only');
  assert.equal(eventScheduleState(haunting,at('2026-12-09T14:00:00Z')),'ended');
  assert.equal(eventScheduleState(seafaring,at('2026-12-01T14:00:00Z')),'exchange-only');
  assert.equal(eventScheduleState(seafaring,at('2026-12-02T14:00:00Z')),'ended');
  assert.deepEqual(activeScheduleStarpaths(ev,at('2026-11-22T00:00:00Z')).map(e=>e.sourceSeasonId),
    ['HauntingElegance2026','Seafaring2026']);
  assert.deepEqual(activeScheduleStarpaths(ev,at('2026-12-01T14:00:00Z')).map(e=>e.sourceSeasonId),
    ['HauntingElegance2026']);
  assert.equal(activeScheduleStarpaths(ev,at('2026-12-08T14:00:00Z')).length,0);
  assert.equal(activeScheduleStarpaths(ev,at('2027-02-01T00:00:00Z')).length,0);
});
test('exact source hours and inclusive official date-only festival remain visually distinct in monthly calendar',async()=>{
  const ev=guideCalendarEvents(await snapshot());
  const oct=guideCalendarMonth(ev,'2026-10');
  assert(oct.length>=35&&oct.length<=42);
  assert.equal(oct[0].day,'2026-09-28');
  assert.equal(oct.find(c=>c.day==='2026-10-06').events.some(e=>e.id==='haunted-floating-festival-2026'),false);
  assert.equal(oct.find(c=>c.day==='2026-10-07').events.some(e=>e.id==='haunted-floating-festival-2026'),true);
  assert.equal(oct.find(c=>c.day==='2026-10-31').events.some(e=>e.id==='haunted-floating-festival-2026'),true);
  assert.equal(oct.find(c=>c.day==='2026-11-01').events.some(e=>e.id==='haunted-floating-festival-2026'),false);
  const nov=guideCalendarMonth(ev,'2026-11');
  assert(nov.every(day=>day.events.some(e=>e.kind==='starpath')||!day.isCurrent));
  const dec=guideCalendarMonth(ev,'2026-12');
  assert.equal(dec.find(x=>x.day==='2026-12-09').events.some(e=>e.id==='haunting-elegance-2026'&&!e.taskPeriod),true);
  assert.equal(dec.find(x=>x.day==='2026-12-10').events.some(e=>e.id==='haunting-elegance-2026'),false);
  assert.throws(()=>guideCalendarMonth(ev,'2026-00'),/month range/);
  assert.throws(()=>guideCalendarMonth(ev,'2026-13'),/month range/);
  assert.throws(()=>guideCalendarMonth(ev,'2026-1'),/month format/);
});
test('festival without source times only gets date-granularity scheduled state, never an invented hour',async()=>{
  const e=guideCalendarEvents(await snapshot())[2];
  assert.equal(eventScheduleState(e,at('2026-10-06T14:59:59Z')),'upcoming');
  assert.equal(eventScheduleState(e,at('2026-10-06T15:00:00Z')),'date-window');
  assert.equal(eventScheduleState(e,at('2026-10-31T14:59:59Z')),'date-window');
  assert.equal(eventScheduleState(e,at('2026-10-31T15:00:00Z')),'ended');
});
test('source-native quest taxonomies project 733 names into story/realm, village and honest other bucket',async()=>{
  const index=await quests();
  assert.equal(filterPublicQuests(index,{section:'all'}).total,733);
  assert.equal(filterPublicQuests(index,{section:'story'}).total,227);
  assert.equal(filterPublicQuests(index,{section:'friendship'}).total,341);
  assert.equal(filterPublicQuests(index,{section:'other'}).total,165);
  assert.equal(publicQuestSection(index.quests.find(r=>r.id==='2070000620')),'story');
  assert.equal(publicQuestSection(index.quests.find(r=>r.id==='2070000651')),'story');
  assert.equal(publicQuestSection(index.quests.find(r=>r.id==='2070000653')),'friendship');
  assert.equal(publicQuestSection(index.quests.find(r=>r.id==='2070000865')),'other');
  assert.throws(()=>filterPublicQuests(index,{section:'fictional'}),/invalid search/);
});
test('reviewed actionable riddle solutions bind to native season+Task IDs, reject drift and never invent others',async()=>{
  const snap=await snapshot();
  let verifiedDaily=0,verifiedWeekly=0;
  const expected={
    'HauntingElegance2026/Task17':'ドナルドダック',
    'HauntingElegance2026/Task26':'マーリン',
    'Seafaring2026/Task19':'ピーター・パン',
    'Seafaring2026/Task23':'アリエル',
    'Seafaring2026/Task39':'アリエル',
    'Seafaring2026/Task44':'エリック王子',
    'Seafaring2026/Task55':'エリック王子',
    'HauntingElegance2026/Week07Task02':'サリー',
    'Seafaring2026/Week04Task01':'モアナ'
  };
  for(const season of snap.seasons){
    for(const task of season.tasks){
      const row=actionableStarpathTask(season.id,task,'ja');
      if(row)verifiedDaily++;
      const key=season.id+'/'+task.id;
      if(expected[key])assert(row?.action.includes(expected[key]),key);
    }
    for(const week of season.weeklyTasks)for(const task of week){
      const row=actionableStarpathTask(season.id,task,'ja');
      if(row)verifiedWeekly++;
      const key=season.id+'/'+task.id;
      if(expected[key])assert(row?.action.includes(expected[key]),key);
    }
  }
  assert.equal(verifiedDaily,STARPATH_REVIEWED_DAILY_COUNT);
  assert.equal(verifiedWeekly,STARPATH_REVIEWED_WEEKLY_COUNT);
  assert.equal(verifiedDaily,14);
  assert.equal(verifiedWeekly,7);
  const real=snap.seasons[1].tasks.find(t=>t.id==='Task19');
  assert.equal(actionableStarpathTask('HauntingElegance2026',real),null);
  assert.equal(actionableStarpathTask('Seafaring2026',{...real,objectiveKind:'ReadBook'}),null);
  assert.equal(actionableStarpathTask('Seafaring2026',{...real,description:'unverified riddle'}),null);
  assert.equal(actionableStarpathTask('Seafaring2026',{...real,id:'Task999'}),null);
  assert.equal(actionableStarpathTask('Seafaring2026',real,'de'),null);
});
