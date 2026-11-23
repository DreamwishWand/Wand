import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.ts';
import {verifyPublicQuestIndex,publicQuestSection,filterPublicQuests} from '../src/lib/guide/public-guide.ts';
import {
  GUIDE_EVENT_CALENDAR_CONTRACT,GUIDE_EVENT_CALENDAR_AS_OF,GUIDE_EVENT_CALENDAR_SOURCES,
  guideCalendarEvents,eventScheduleState,activeScheduleStarpaths,guideCalendarMonth,guideCalendarEventsInMonth,localGuideDateTime
} from '../src/lib/guide/event-calendar.ts';
import {
  actionableStarpathTask,STARPATH_REVIEWED_DAILY_COUNT,STARPATH_REVIEWED_WEEKLY_COUNT
} from '../src/lib/guide/starpath-task-guidance.ts';
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
    'HauntingElegance2026/Task51':'ジャック・スケリントン',
    'HauntingElegance2026/Task52':'ジャック・スケリントン',
    'HauntingElegance2026/Task59':'スクルージ・マクダック',
    'HauntingElegance2026/Task70':'サリー',
    'HauntingElegance2026/Task76':'ドナルドダック',
    'HauntingElegance2026/Task78':'ヴァネロペ',
    'HauntingElegance2026/Task80':'ジャック・スケリントン',
    'HauntingElegance2026/Task95':'粘土',
    'HauntingElegance2026/Task97':'ジャック・スケリントン',
    'HauntingElegance2026/Task102':'サリー',
    'HauntingElegance2026/Task106':'ニンニク',
    'HauntingElegance2026/Task108':'ジャック・スケリントン',
    'HauntingElegance2026/Task112':'マーリン',
    'HauntingElegance2026/Task02':'村人',
    'HauntingElegance2026/Task14':'スクルージ',
    'HauntingElegance2026/Task24':'グーフィー',
    'HauntingElegance2026/Task31':'Fabric',
    'HauntingElegance2026/Task34':'ミッキーマウス',
    'HauntingElegance2026/Task41':'ドリームスナップ',
    'HauntingElegance2026/Task44':'投票',
    'HauntingElegance2026/Task50':'カボチャ',
    'HauntingElegance2026/Task58':'勇気の森',
    'HauntingElegance2026/Task71':'デイジー',
    'HauntingElegance2026/Task75':'ティアナ',
    'HauntingElegance2026/Task84':'釣り',
    'HauntingElegance2026/Task94':'金色のさざ波',
    'HauntingElegance2026/Task100':'Playful Pumpkin Scarecrow',
    'HauntingElegance2026/Task121':'フローティング',
    'Seafaring2026/Task10':'海藻',
    'Seafaring2026/Task16':'輝きの浜辺',
    'Seafaring2026/Task37':'Natural Rock Paths',
    'Seafaring2026/Task40':'ホタテ',
    'Seafaring2026/Task19':'ピーター・パン',
    'Seafaring2026/Task23':'アリエル',
    'Seafaring2026/Task39':'アリエル',
    'Seafaring2026/Task44':'エリック王子',
    'Seafaring2026/Task55':'エリック王子',
    'HauntingElegance2026/Task35':'Whimsical Pie',
    'HauntingElegance2026/Task42':'ミッキー＆フレンズ',
    'HauntingElegance2026/Task45':'Miracle Pickaxe Polish',
    'HauntingElegance2026/Task47':'5人',
    'HauntingElegance2026/Task68':'レベル2',
    'HauntingElegance2026/Task82':'ジンジャーブレッドハウス',
    'HauntingElegance2026/Task92':'ヴィタリスクリスタル',
    'HauntingElegance2026/Task98':'グーフィー',
    'Seafaring2026/Task24':'ドリームライト',
    'Seafaring2026/Task29':'スターコイン',
    'Seafaring2026/Task50':'ヤシの実',
    'HauntingElegance2026/Week02Task03':'Candy Cane Door',
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
  assert.equal(verifiedDaily,81);
  assert.equal(verifiedWeekly,8);
  const real=snap.seasons[1].tasks.find(t=>t.id==='Task19');
  assert.equal(actionableStarpathTask('HauntingElegance2026',real),null);
  assert.equal(actionableStarpathTask('Seafaring2026',{...real,objectiveKind:'ReadBook'}),null);
  assert.equal(actionableStarpathTask('Seafaring2026',{...real,description:'unverified riddle'}),null);
  assert.equal(actionableStarpathTask('Seafaring2026',{...real,id:'Task999'}),null);
  assert.equal(actionableStarpathTask('Seafaring2026',real,'de'),null);
  const newReviewed=snap.seasons[0].tasks.find(t=>t.id==='Task100');
  assert(newReviewed);
  assert.equal(actionableStarpathTask('HauntingElegance2026',{...newReviewed,objectiveKind:'MineMineral'}),null,
    'new editorial recipe option must reject changed task kind');
  assert.equal(actionableStarpathTask('HauntingElegance2026',{...newReviewed,description:'Craft a different item.'}),null,
    'new editorial recipe option must reject a changed native hint');
  const untouched=snap.seasons[0].tasks.find(t=>t.id==='Task83');
  assert(untouched);
  assert.equal(actionableStarpathTask('HauntingElegance2026',untouched),null,
    'unreviewed tasks still fall back to the immutable in-game text');
  const newWeekly=snap.seasons[0].weeklyTasks.flat().find(t=>t.id==='Week02Task03');
  assert(newWeekly);
  assert.equal(actionableStarpathTask('HauntingElegance2026',{
    ...newWeekly,objectiveKind:'MineMineral'
  }),null,'reviewed weekly interpretation must reject source-kind drift');
  assert.equal(actionableStarpathTask('HauntingElegance2026',{
    ...newWeekly,descriptionKey:'Liveops.OTHER'
  }),null,'reviewed weekly interpretation must reject description key drift');

});

test('Guide month event list uses JST days and exact exclusive UTC end, matching calendar cells',async()=>{
  const real=guideCalendarEvents(await snapshot());
  assert.deepEqual(guideCalendarEventsInMonth(real,'2026-10').map(e=>e.id),
    ['haunting-elegance-2026','seafaring-2026','haunted-floating-festival-2026']);
  assert.deepEqual(guideCalendarEventsInMonth(real,'2026-11').map(e=>e.id),
    ['haunting-elegance-2026','seafaring-2026']);
  const afterUtcMonth={
    id:'starts-in-jst-december',precision:'utc-instant',
    startUtc:'2026-11-30T15:30:00Z',
    taskEndUtcExclusive:'2026-12-01T08:00:00Z',
    endUtcExclusive:'2026-12-01T14:59:59Z'
  };
  const endsAtJstMidnight={
    id:'ends-at-jst-new-year',precision:'utc-instant',
    startUtc:'2026-12-31T13:00:00Z',
    taskEndUtcExclusive:'2026-12-31T14:00:00Z',
    endUtcExclusive:'2026-12-31T15:00:00Z'
  };
  const datesOnly={
    id:'date-only-year-boundary',precision:'date-only',
    startDay:'2026-12-31',endDayInclusive:'2027-01-01'
  };
  const fixtures=[afterUtcMonth,endsAtJstMidnight,datesOnly];
  assert.deepEqual(guideCalendarEventsInMonth(fixtures,'2026-11').map(e=>e.id),[]);
  assert.deepEqual(guideCalendarEventsInMonth(fixtures,'2026-12').map(e=>e.id),
    fixtures.map(e=>e.id));
  assert.deepEqual(guideCalendarEventsInMonth(fixtures,'2027-01').map(e=>e.id),
    ['date-only-year-boundary']);
  for(const month of ['2026-11','2026-12','2027-01']){
    const ids=new Set(guideCalendarMonth(fixtures,month)
      .filter(day=>day.isCurrent).flatMap(day=>day.events.map(event=>event.id)));
    assert.deepEqual(guideCalendarEventsInMonth(fixtures,month).map(e=>e.id),
      fixtures.filter(e=>ids.has(e.id)).map(e=>e.id));
  }
  assert.throws(()=>guideCalendarEventsInMonth(fixtures,'2026-13'),/month range/);
});


test('typed event windows reject forged source and forbid invented UTC clock time on date-only events',async()=>{
  const verified=await snapshot();
  const altered=structuredClone(verified);
  altered.source.fileSha256='0'.repeat(64);
  assert.throws(()=>guideCalendarEvents(altered),/provenance/);
  const entries=guideCalendarEvents(verified);
  assert.deepEqual(entries.map(row=>row.precision),
    ['utc-instant','utc-instant','date-only']);
  assert(entries.every(row=>row.liveVerified===false));
  const festival=entries[2];
  assert.equal(festival.startDay,'2026-10-07');
  assert.equal(Object.hasOwn(festival,'startUtc'),false);
  assert.equal(Object.hasOwn(festival,'taskEndUtcExclusive'),false);
  assert.equal(Object.hasOwn(festival,'endUtcExclusive'),false);
  assert.throws(()=>eventScheduleState({...entries[0],taskEndUtcExclusive:
    entries[0].startUtc}),/event time bounds/);
  const end=at('2026-12-09T14:00:00Z');
  assert.equal(eventScheduleState(entries[0],end),'ended',
    'exclusive task and exchange deadlines remain strict');
});
