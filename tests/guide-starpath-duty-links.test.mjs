import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.ts';
import {resolveStarpathDutyLink,resolveStarpathSeasonLink,starpathDutyHref,starpathSeasonHref} from '../src/lib/guide/starpath-duty-link.ts';

const load=async()=>verifyPublicStarpath(JSON.parse(await readFile(
  new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url),'utf8')));

test('normal and weekly Star Path deep links resolve only authenticated source task IDs',async()=>{
  const data=await load();
  assert.deepEqual(data.seasons.map(s=>s.tasks.length),[121,25]);
  assert.deepEqual(data.seasons.map(s=>s.weeklyTasks.flat().length),[21,18]);
  const haunt=data.seasons[0],sea=data.seasons[1];
  for(const season of data.seasons){
    for(const [tab,rows] of [
      ['tasks',season.tasks],['weekly',season.weeklyTasks.flat()]
    ]){
      for(const [index,task] of rows.entries()){
        const url=starpathDutyHref('/Wand',season.id,task.id);
        assert.equal(url,'/Wand/guide/star-path/?season='+season.id+'&task='+task.id);
        assert.deepEqual(resolveStarpathDutyLink(new URL(url,'https://example.org').search,data),
          {seasonId:season.id,taskId:task.id,tab,index},'no source task may be unaddressable');
      }
    }
  }
  assert.equal(resolveStarpathDutyLink('?season=HauntingElegance2026&task=Task120',data)?.index,
    haunt.tasks.findIndex(t=>t.id==='Task120'));
  assert.equal(resolveStarpathDutyLink('?season=Seafaring2026&task=Task47',data)?.tab,'tasks');
  assert.equal(resolveStarpathDutyLink('?season=HauntingElegance2026&task=Week02Task03',data)?.tab,'weekly');
  assert.notEqual(haunt.id,sea.id);
});

test('missing, ambiguous, forged, foreign and unsafe Star Path duty URLs fail closed',async()=>{
  const data=await load();
  const invalid=[
    '?season=HauntingElegance2026',
    '?task=Task01',
    '?season=HauntingElegance2026&task=Task999',
    '?season=HauntingElegance2026&task=Week09Task01',
    '?season=Seafaring2026&task=Week07Task01',
    '?season=Seafaring2026&task=Task01', // Seafaring Task01 does not exist
    '?season=HauntingElegance2026&task=Task01&task=Task02',
    '?season=HauntingElegance2026&task=Task01&reward=HauntingElegance2026%2Fnormal-1%2F1',
    '?season=HauntingElegance2026&season=Seafaring2026&task=Task01',
    '?season=hauntingelegance2026&task=Task01',
    '?season=HauntingElegance2026&task=task01',
    '?season=HauntingElegance2026&task=__proto__',
    '?season=HauntingElegance2026&task=%2FTask01',
    '?season=HauntingElegance2026&task=Task1',
    '?season=HauntingElegance2026&task=Week01Task0011',
    '?season=HauntingElegance2026&task=Task01&query='+('a'.repeat(2050))
  ];
  for(const query of invalid)
    assert.equal(resolveStarpathDutyLink(query,data),null,query);
  for(const malformed of [null,{},[],{seasons:[]},{seasons:[{id:'HauntingElegance2026',tasks:[],weeklyTasks:[]},{id:'Seafaring2026'}]}])
    assert.equal(resolveStarpathDutyLink('?season=HauntingElegance2026&task=Task01',malformed),null);
  assert.equal(resolveStarpathDutyLink(1,data),null);
  const duplicate=structuredClone(data);
  duplicate.seasons[0].tasks.push({...duplicate.seasons[0].tasks[0]});
  assert.equal(resolveStarpathDutyLink('?season=HauntingElegance2026&task=Task01',duplicate),null);
  for(const [base,season,task] of [
    ['/Wand?inject=1','Seafaring2026','Task47'],
    ['//evil.test','Seafaring2026','Task47'],
    ['/Wand','Other2026','Task47'],
    ['/Wand','Seafaring2026','Nope']
  ])assert.throws(()=>starpathDutyHref(base,season,task),/invalid link/);
  assert.equal(starpathDutyHref('','HauntingElegance2026','Task120'),
    '/guide/star-path/?season=HauntingElegance2026&task=Task120');
});

test('permalink display is a Svelte+TypeScript UI link, not persisted task state',async()=>{
  const page=await readFile(new URL('../src/routes/guide/star-path/+page.svelte',import.meta.url),'utf8');
  assert.match(page,/resolveStarpathDutyLink\(window\.location\.search,catalog\)/);
  assert.match(page,/Math\.max\(60,link\.index\+1\)/);
  assert.match(page,/window\.addEventListener\('popstate',restoreLink\)/);
  assert.match(page,/starpathDutyHref\(base,season\.id,t\.id\)/);
  assert.doesNotMatch(page,/localStorage|sessionStorage|fetch\(.*save/i);
});

test('calendar season links open the correct Star Path and reject forged links',async()=>{
  const data=await load();
  for(const season of data.seasons){
    const href=starpathSeasonHref('/Wand',season.id);
    assert.equal(href,'/Wand/guide/star-path/?season='+season.id);
    assert.equal(resolveStarpathSeasonLink(new URL(href,'https://example.org').search,data),season.id);
  }
  assert.equal(starpathSeasonHref('','Seafaring2026'),'/guide/star-path/?season=Seafaring2026');
  for(const query of [
    '?season=Other2026','?season=Seafaring2026&season=HauntingElegance2026',
    '?season=Seafaring2026&task=Task47',
    '?season=Seafaring2026&reward=Seafaring2026%2Freward',
    '?season=seafaring2026','?season=Seafaring2026&'+('x'.repeat(2100))
  ])assert.equal(resolveStarpathSeasonLink(query,data),null,query);
  const duplicate=structuredClone(data);
  duplicate.seasons[1].id=duplicate.seasons[0].id;
  assert.equal(resolveStarpathSeasonLink('?season=HauntingElegance2026',duplicate),null);
  for(const [base,id] of [
    ['//malicious.example','Seafaring2026'],['/Wand?x=1','Seafaring2026'],['/Wand','Other2026']
  ])assert.throws(()=>starpathSeasonHref(base,id),/invalid link/);
  const hub=await readFile(new URL('../src/routes/guide/+page.svelte',import.meta.url),'utf8');
  const route=await readFile(new URL('../src/routes/guide/star-path/+page.svelte',import.meta.url),'utf8');
  assert.equal((hub.match(/starpathSeasonHref\(base,event\.sourceSeasonId\)/g)||[]).length,1,
    'Guide uses a single typed eventHref resolver for calendar and detail navigation');
  assert.match(route,/resolveStarpathSeasonLink\(window\.location\.search,catalog\)/);
});
