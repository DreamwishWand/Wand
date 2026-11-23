import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.ts';
import {
  STARPATH_GOALS_SCHEMA,STARPATH_GOALS_SHA,STARPATH_GOALS_BYTES,
  verifyPublicStarpathGoals,loadPublicStarpathGoals,starpathGoalLabel,
  starpathGoalHeading,starpathGoalSourceNote,STARPATH_GOAL_LOCALES
} from '../src/lib/guide/public-starpath-goals.mjs';

const cacheFile=new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url);
const overlayFile=new URL('../static/guide/public/starpath-goals-2026-11-22.json',import.meta.url);
const snapshot=async()=>verifyPublicStarpath(JSON.parse(await readFile(cacheFile,'utf8')));
const publicGoals=async()=>JSON.parse(await readFile(overlayFile,'utf8'));
const changed=(data,modify)=>{const copy=structuredClone(data);modify(copy);return copy;};

test('source-pinned numeric projection includes all 185 real cached tasks and authenticates public bytes',async()=>{
  const source=await snapshot(), raw=await readFile(overlayFile);
  assert.equal(raw.byteLength,STARPATH_GOALS_BYTES);
  assert.equal(createHash('sha256').update(raw).digest('hex'),STARPATH_GOALS_SHA);
  const goals=verifyPublicStarpathGoals(JSON.parse(raw.toString('utf8')),source);
  assert.equal(goals.schema,STARPATH_GOALS_SCHEMA);
  assert.equal(goals.source.staticNotPlayerProgress,true);
  assert.equal(goals.seasons.reduce((n,s)=>n+s.goals.length,0),185);
  assert.equal(goals.seasons.reduce((n,s)=>n+s.goals.filter(x=>x.value!==undefined).length,0),178);
  assert.equal(goals.seasons[0].normalCount,121);
  assert.equal(goals.seasons[0].weeklyCount,21);
  assert.equal(goals.seasons[1].normalCount,25);
  assert.equal(goals.seasons[1].weeklyCount,18);
  assert(!/OnlineId|FilterGenerator|ItemList|CharacterID|PlayFab|playerId/.test(raw.toString('utf8')),
    'private objective selectors and player identifiers must never be published');
});

test('goal labels are source-exact counts, duration, votes and explicit level thresholds',async()=>{
  const source=await snapshot(),data=verifyPublicStarpathGoals(await publicGoals(),source);
  const get=(sid,id)=>source.seasons.find(s=>s.id===sid).tasks.concat(
    source.seasons.find(s=>s.id===sid).weeklyTasks.flat()).find(t=>t.id===id);
  const h='HauntingElegance2026',s='Seafaring2026';
  assert.equal(starpathGoalLabel(data,h,get(h,'Task01')),'3個');
  assert.equal(starpathGoalLabel(data,h,get(h,'Task17')),'10分');
  assert.equal(starpathGoalLabel(data,h,get(h,'Task47')),'5人 · 友情Lv.5');
  assert.equal(starpathGoalLabel(data,h,get(h,'Task51')),null,'visit requirement has no explicit numeric scalar');
  assert.equal(starpathGoalLabel(data,h,get(h,'Task68')),'オトモLv.2');
  assert.equal(starpathGoalLabel(data,h,get(h,'Task80')),'友情Lv.4');
  assert.equal(starpathGoalLabel(data,h,get(h,'Week02Task03')),'1枚');
  assert.equal(starpathGoalLabel(data,s,get(s,'Task02')),'10匹');
  assert.equal(starpathGoalLabel(data,s,get(s,'Task37')),'100個');
  assert.equal(starpathGoalLabel(null,h,get(h,'Task17')),null);
  assert.equal(starpathGoalLabel(data,h,{id:'Task999',objectiveKind:'PickUp'}),null);
});

test('overlay refuses altered task identity, counts, types and smuggled raw-source fields',async()=>{
  const source=await snapshot(),original=await publicGoals();
  const bad=[
    copy=>{copy.seasons[0].goals[0].id='Task999'},
    copy=>{copy.seasons[0].goals[0].kind='CatchFish'},
    copy=>{copy.seasons[0].goals[0].value=0},
    copy=>{copy.seasons[0].goals[0].unit='garbage'},
    copy=>{copy.seasons[0].goals[0].CharacterID='secret'},
    copy=>{copy.seasons[0].goals[0].sourceUUID='secret'},
    copy=>{copy.seasons[0].goals[0].value=undefined},
    copy=>{copy.seasons[0].goals[50].value=1;copy.seasons[0].goals[50].unit='items'},
    copy=>{copy.seasons[0].goals.pop()},
    copy=>{copy.source.staticNotPlayerProgress=false}
  ];
  for(const edit of bad){
    assert.throws(()=>verifyPublicStarpathGoals(changed(original,edit),source),/Public Star Path goals:/);
  }
});

test('browser loader rejects any changed same-size bytes before parsing',async()=>{
  const source=await snapshot(),raw=await readFile(overlayFile);
  const fake=data=>async()=>({ok:true,arrayBuffer:async()=>Uint8Array.from(data).buffer});
  const original=await loadPublicStarpathGoals('test-goals.json',source,fake(raw));
  assert.equal(original.seasons.length,2);
  const tampered=Buffer.from(raw);
  const position=tampered.indexOf(Buffer.from('Task17'));
  assert(position>0);
  tampered[position+4]=tampered[position+4]===55?56:55;
  assert.equal(tampered.byteLength,raw.byteLength);
  await assert.rejects(()=>loadPublicStarpathGoals('test-goals.json',source,fake(tampered)),
    /publication fingerprint mismatch/);
});

test('all eight display locales retain exact source numeric goals with idiomatic units',async()=>{
  const source=await snapshot(),goals=verifyPublicStarpathGoals(await publicGoals(),source);
  const get=(season,id)=>source.seasons.find(s=>s.id===season).tasks.concat(
    source.seasons.find(s=>s.id===season).weeklyTasks.flat()).find(t=>t.id===id);
  const h='HauntingElegance2026',s='Seafaring2026',weekly=get(s,'Week03Task01');
  assert.deepEqual(STARPATH_GOAL_LOCALES,['ja','en','fr','it','de','es-ES','pt-BR','zh-CN']);
  const heading={ja:'目標',en:'Goal',fr:'Objectif',it:'Obiettivo',de:'Ziel',
    'es-ES':'Objetivo','pt-BR':'Meta','zh-CN':'目标'};
  const fish={ja:'25匹',en:'25 fish',fr:'25 poissons',it:'25 pesci',de:'25 Fische',
    'es-ES':'25 peces','pt-BR':'25 peixes','zh-CN':'25条鱼'};
  for(const locale of STARPATH_GOAL_LOCALES){
    assert.equal(starpathGoalHeading(locale),heading[locale],locale);
    assert.equal(starpathGoalLabel(goals,s,weekly,locale),fish[locale],locale);
  }
  assert.equal(starpathGoalLabel(goals,h,get(h,'Task01'),'en'),'3 items');
  assert.equal(starpathGoalLabel(goals,h,get(h,'Task17'),'en'),'10 min');
  assert.equal(starpathGoalLabel(goals,h,get(h,'Task47'),'en'),'5 characters · Friendship Lv. 5');
  assert.equal(starpathGoalLabel(goals,h,get(h,'Task68'),'fr'),'Compagnon niv. 2');
  assert.equal(starpathGoalLabel(goals,h,get(h,'Task80'),'de'),'Freundschaft Lv. 4');
  assert.equal(starpathGoalLabel(goals,h,get(h,'Task09'),'en'),'1 photo','singular noun');
  assert.equal(starpathGoalLabel(goals,h,get(h,'Task17'),'zh-CN'),'10分钟');
  assert.equal(starpathGoalLabel(goals,h,get(h,'Task17'),'ja'),'10分','Japanese legacy displays unchanged');
  assert.equal(starpathGoalLabel(goals,h,get(h,'Task17'),'invalid'),'10分','unknown locale safe fallback');
  assert.equal(starpathGoalHeading('invalid'),'目標');
  for(const season of source.seasons){
    for(const task of [...season.tasks,...season.weeklyTasks.flat()]){
      const japanese=starpathGoalLabel(goals,season.id,task,'ja');
      for(const locale of STARPATH_GOAL_LOCALES){
        const actual=starpathGoalLabel(goals,season.id,task,locale);
        assert.equal(actual===null,japanese===null,season.id+'/'+task.id+'/'+locale);
        if(actual!==null){
          assert(actual.length<120 && !actual.includes('undefined') && !actual.includes('NaN'),
            season.id+'/'+task.id+'/'+locale);
        }
      }
    }
  }
});
test('German weekly source text discrepancy is visible, source-guarded and not silently corrected',async()=>{
  const source=await snapshot(),data=verifyPublicStarpathGoals(await publicGoals(),source);
  const season='Seafaring2026',task=source.seasons[1].weeklyTasks.flat().find(t=>t.id==='Week03Task01');
  const german='Fange 20 Fische am schillernden Strand.';
  assert.equal(starpathGoalLabel(data,season,task,'de'),'25 Fische');
  assert.match(starpathGoalSourceNote(data,season,task,'de',german),/20 Fische.*25 Fische/);
  assert.equal(starpathGoalSourceNote(data,season,task,'ja','輝きの浜辺で魚を25匹釣る'),null);
  assert.equal(starpathGoalSourceNote(data,season,{...task,objectiveKind:'MineMineral'},'de',german),null);
  assert.equal(starpathGoalSourceNote(data,season,task,'de','Fange 25 Fische am schillernden Strand.'),null);
  assert.equal(starpathGoalSourceNote(null,season,task,'de',german),null);
  const fake=structuredClone(data);
  const entry=fake.seasons[1].goals.find(t=>t.id==='Week03Task01');
  entry.value=20;
  assert.equal(starpathGoalSourceNote(fake,season,task,'de',german),null,
    'source note requires original 25-goal value');
});
