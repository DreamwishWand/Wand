import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.mjs';
import {verifyStarpathDailyPart,starpathDailyDescription} from '../src/lib/guide/public-starpath-daily.mjs';
import {verifyStarpathWeeklyLocales,starpathWeeklyDescription} from '../src/lib/guide/public-starpath-locales.mjs';
import {verifyPublicStarpathGoals,starpathGoalLabel} from '../src/lib/guide/public-starpath-goals.mjs';
import {filterStarpathTasks} from '../src/lib/guide/starpath-search.mjs';

const dir=new URL('../static/guide/public/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,dir),'utf8'));
async function data(){
  const catalog=verifyPublicStarpath(await read('starpath-cache-2026-11-22.json'));
  const daily={};
  for(const s of catalog.seasons){
    const name=s.id==='HauntingElegance2026'
      ?'starpath-daily-haunting-2026-11-22.json'
      :'starpath-daily-seafaring-2026-11-22.json';
    daily[s.id]=verifyStarpathDailyPart(await read(name),s);
  }
  const weekly=verifyStarpathWeeklyLocales(await read('starpath-weekly-locales-2026-11-22.json'),catalog);
  const goals=verifyPublicStarpathGoals(await read('starpath-goals-2026-11-22.json'),catalog);
  const dailySearch=(s,query,locale='ja')=>filterStarpathTasks(s.id,s.tasks,{
    query,locale,
    descriptionOf:t=>starpathDailyDescription(daily,s.id,t.id,locale),
    goalTextOf:t=>starpathGoalLabel(goals,s.id,t)
  });
  const weeklySearch=(s,query,locale='ja')=>s.weeklyTasks.flatMap(w=>filterStarpathTasks(s.id,w,{
    query,locale,
    descriptionOf:t=>starpathWeeklyDescription(weekly,t.descriptionKey,locale),
    goalTextOf:t=>starpathGoalLabel(goals,s.id,t)
  }));
  return {seasons:catalog.seasons,dailySearch,weeklySearch};
}
const ids=rows=>rows.map(x=>x.id);

test('complete non-filtered catalog remains 146 normal / 39 weekly duties in source order',async()=>{
  const {seasons,dailySearch,weeklySearch}=await data();
  assert.deepEqual(seasons.map(s=>s.tasks.length),[121,25]);
  assert.deepEqual(seasons.map(s=>s.weeklyTasks.flat().length),[21,18]);
  for(const s of seasons){
    assert.deepEqual(ids(dailySearch(s,'  ')),ids(s.tasks));
    assert.deepEqual(ids(weeklySearch(s,'  ')),ids(s.weeklyTasks.flat()));
  }
  assert.deepEqual(ids(dailySearch(seasons[1],'ＴＡＳＫ１９')),['Task19'],'Unicode width normalization and original IDs');
});

test('Japanese search finds verified decoded character riddles not explicitly named in the native hint',async()=>{
  const {seasons,dailySearch,weeklySearch}=await data();
  const halloween=seasons[0],sea=seasons[1];
  assert(ids(dailySearch(halloween,'ジャック')).includes('Task52'),
    'Pumpkin King => source-guarded Jack Skellington');
  assert(ids(dailySearch(halloween,'サリー')).includes('Task70'),
    'patchwork Villager => source-guarded Sally');
  assert(ids(dailySearch(halloween,'ドナルド')).includes('Task76'),
    'hot-tempered duck => source-guarded Donald Duck');
  assert(ids(dailySearch(sea,'ピーター・パン')).includes('Task19'));
  assert(ids(weeklySearch(halloween,'Candy Cane Door')).includes('Week02Task03'));
  assert(ids(weeklySearch(sea,'アリエル')).includes('Week02Task01'));
  assert(ids(weeklySearch(halloween,'サリー')).includes('Week07Task02'));
});

test('search respects source locale, exact original daily/weekly words, and multi-token AND matches',async()=>{
  const {seasons,dailySearch,weeklySearch}=await data();
  const sea=seasons[1],halloween=seasons[0];
  assert.deepEqual(ids(dailySearch(sea,'Attrape des poissons','fr')),['Task02']);
  assert(ids(dailySearch(sea,'魚を釣る  Task02')).includes('Task02'));
  assert(!ids(dailySearch(sea,'魚を釣る Task19')).includes('Task19'),
    'all query terms must be present in the same duty');
  assert(ids(weeklySearch(sea,'Fange 20 Fische','de')).includes('Week03Task01'),
    'do not silently alter German 20 vs Japanese 25 source difference');
  const task=halloween.tasks.find(t=>t.id==='Task52');
  const results=filterStarpathTasks(halloween.id,[task],{
    locale:'fr',query:'Hang out with Jack Skellington',
    descriptionOf:()=> 'Passe du temps avec le roi des citrouilles.'
  });
  assert.equal(results.length,0,
    'English editorial action must never be searched or presented as a French translation');
});

test('numeric goal search finds source-pinned 10-minute hangouts and source-exact weekly counts',async()=>{
  const {seasons,dailySearch,weeklySearch}=await data();
  assert(ids(dailySearch(seasons[0],'10分')).includes('Task17'));
  assert(ids(weeklySearch(seasons[1],'20匹')).includes('Week01Task01'));
});

test('untrusted query and input validation fail closed',()=>{
  const task={id:'Task17',description:'Hello',objectiveKind:'HangoutWithCharacter'};
  assert.throws(()=>filterStarpathTasks('HauntingElegance2026',[task],{query:'x'.repeat(121)}),/invalid input/);
  assert.throws(()=>filterStarpathTasks('HauntingElegance2026',[task],{locale:'invalid'}),/invalid input/);
  assert.throws(()=>filterStarpathTasks('HauntingElegance2026',[task],{descriptionOf:'oops'}),/invalid input/);
  assert.deepEqual(filterStarpathTasks('HauntingElegance2026',[task],{
    query:'hello',descriptionOf:()=>null
  }),[task]);
});
