import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.mjs';
import {starpathTaskDisplay} from '../src/lib/guide/starpath-task-guidance.mjs';

const load=async()=>verifyPublicStarpath(JSON.parse(await readFile(
  new URL('../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url))));

test('original task description is the main title for an unresolved Star Path duty',async()=>{
  const snapshot=await load();
  const duty=snapshot.seasons.find(x=>x.id==='Seafaring2026').tasks.find(t=>t.id==='Task02');
  assert.equal(duty.description,'Catch any fish.');
  const en=starpathTaskDisplay('Seafaring2026',duty,'en','Catch any fish.');
  assert.deepEqual(en,{headline:'Catch any fish.',
    note:'ゲーム内表記 · 詳細な操作手順は未検証',reviewed:false});
  const fr=starpathTaskDisplay('Seafaring2026',duty,'fr','Attrapez des poissons.');
  assert.equal(fr.headline,'Attrapez des poissons.');
  assert.equal(fr.reviewed,false);
  assert.equal(starpathTaskDisplay('Seafaring2026',duty,'ja',null).headline,duty.description,
    'source-native English fallback is permitted when localized text is unavailable');
});

test('curated solutions appear only in the actual authored languages and matching original IDs',async()=>{
  const snapshot=await load();
  const s=snapshot.seasons.find(x=>x.id==='HauntingElegance2026');
  const duty=s.tasks.find(t=>t.id==='Task17');
  const ja=starpathTaskDisplay(s.id,duty,'ja','ゲーム内の暗号表記');
  assert.equal(ja.reviewed,true);
  assert.match(ja.headline,/ドナルドダック/);
  assert.match(ja.note,/ゲーム内表記：ゲーム内の暗号表記/);
  const en=starpathTaskDisplay(s.id,duty,'en','Hang out with a hot-tempered duck.');
  assert.equal(en.reviewed,true);
  assert.match(en.headline,/Donald Duck/);
  for(const locale of ['fr','it','de','es-ES','pt-BR','zh-CN']){
    const source='Original source: '+locale;
    const result=starpathTaskDisplay(s.id,duty,locale,source);
    assert.equal(result.headline,source);
    assert.equal(result.reviewed,false);
  }
  assert.equal(starpathTaskDisplay('unknown-season',duty,'ja','原本の説明').reviewed,false);
});

test('weekly duties respect source text and do not invent missing translations',async()=>{
  const snapshot=await load();
  const s=snapshot.seasons.find(x=>x.id==='HauntingElegance2026');
  const week=s.weeklyTasks.flat().find(t=>t.id==='Week07Task02');
  const localized='サリーと友情を深める。';
  const reviewed=starpathTaskDisplay(s.id,week,'ja',localized);
  assert.equal(reviewed.reviewed,true);
  assert.match(reviewed.headline,/サリー/);
  assert.match(reviewed.note,/サリーと友情を深める/);
  const fr=starpathTaskDisplay(s.id,week,'fr','Améliorez votre amitié avec Sally.');
  assert.equal(fr.reviewed,false);
  assert.equal(fr.headline,'Améliorez votre amitié avec Sally.');
  const missing=starpathTaskDisplay(s.id,week,'fr',null);
  assert.equal(missing.headline,'説明未確認');
});

test('public Star Path page does not bury 164 unresolved duties behind repeated placeholder titles',async()=>{
  const page=await readFile(new URL('../src/routes/guide/star-path/+page.svelte',import.meta.url),'utf8');
  assert.match(page,/starpathTaskDisplay\(season\.id,t,locale,starpathDailyDescription/);
  assert.match(page,/starpathTaskDisplay\(season\.id,t,locale,starpathWeeklyDescription/);
  assert.doesNotMatch(page,/達成方法は検証中/);
});
