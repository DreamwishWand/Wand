import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.mjs';
import {
  STARPATH_GOALS_SCHEMA,STARPATH_GOALS_SHA,STARPATH_GOALS_BYTES,
  verifyPublicStarpathGoals,loadPublicStarpathGoals,starpathGoalLabel
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
