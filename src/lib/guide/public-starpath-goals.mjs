/**
 * Immutable, source-SHA-pinned numeric Star Path target overlay.
 * This never contains private objective filters, player progress, UUIDs,
 * or claims about live online availability.
 */
import {verifyPublicStarpath,STARPATH_SOURCE_SHA} from './public-starpath.mjs';

export const STARPATH_GOALS_SCHEMA='wand.db03.starpath-goals@1';
export const STARPATH_GOALS_SHA='3d6a81699f2d3e45e2604e8248ac4a202e49a630ac0269da90fef510cccdd0a3';
export const STARPATH_GOALS_BYTES=12398;
const UNITS=new Set(['items','discussions','changes','interactions','fish','photos','meals',
  'minutes','waterings','currency','duties','gifts','feedings','challenges','diggings',
  'orders','votes','entries','characters']);
const ok=(v,m)=>{if(!v)throw new TypeError('Public Star Path goals: '+m)};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validInt=n=>Number.isSafeInteger(n)&&n>0&&n<=10000000;
export function verifyPublicStarpathGoals(data,starpath){
  verifyPublicStarpath(starpath);
  ok(record(data)&&data.schema===STARPATH_GOALS_SCHEMA,'schema');
  ok(record(data.source)&&data.source.sourceSha256===STARPATH_SOURCE_SHA&&
    data.source.sourceBytes===186442&&data.source.gameVersion==='Steam 1.26.2'&&
    data.source.staticNotPlayerProgress===true,'source provenance');
  ok(Array.isArray(data.seasons)&&data.seasons.length===2,'season census');
  let total=0,typed=0;
  for(let i=0;i<2;i++){
    const source=starpath.seasons[i],season=data.seasons[i];
    ok(record(season)&&season.id===source.id&&
      season.normalCount===source.tasks.length&&
      season.weeklyCount===source.weeklyTasks.flat().length,'season identity');
    const originals=[...source.tasks,...source.weeklyTasks.flat()];
    ok(Array.isArray(season.goals)&&season.goals.length===originals.length,'goal rows');
    const seen=new Set();
    for(let j=0;j<originals.length;j++){
      const row=season.goals[j],task=originals[j];
      ok(record(row)&&row.id===task.id&&row.kind===task.objectiveKind&&
        typeof row.id==='string'&&!seen.has(row.id),'task source identity');
      seen.add(row.id);total++;
      ok(Object.keys(row).every(k=>['id','kind','value','unit','friendshipLevel','companionLevel'].includes(k)),
        'unapproved data key');
      if(Object.hasOwn(row,'value')){
        ok(validInt(row.value)&&UNITS.has(row.unit),'source scalar');
        typed++;
      } else ok(!Object.hasOwn(row,'unit'),'unpaired source unit');
      if(Object.hasOwn(row,'friendshipLevel'))ok(row.kind==='Friend'&&validInt(row.friendshipLevel),'friendship threshold');
      if(Object.hasOwn(row,'companionLevel'))ok(row.kind==='EquipPet'&&validInt(row.companionLevel),'companion threshold');
      if(row.kind==='Friend')ok(validInt(row.friendshipLevel),'missing friendship threshold');
      if(row.kind==='EquipPet')ok(validInt(row.companionLevel),'missing companion threshold');
      if(row.kind==='VisitArea')ok(!('value' in row),'invented visit amount');
    }
  }
  ok(total===185&&typed===178,'verified goal census');
  return data;
}
export async function loadPublicStarpathGoals(url,starpath,fetcher=fetch){
  const r=await fetcher(url);
  ok(r.ok,'download failed');
  const bytes=await r.arrayBuffer();
  ok(bytes.byteLength===STARPATH_GOALS_BYTES,'publication size mismatch');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  ok(hash===STARPATH_GOALS_SHA,'publication fingerprint mismatch');
  return verifyPublicStarpathGoals(JSON.parse(new TextDecoder().decode(bytes)),starpath);
}
const LABELS={
  items:'個',discussions:'回',changes:'回',interactions:'回',
  fish:'匹',photos:'枚',meals:'品',minutes:'分',waterings:'回',
  currency:'',duties:'件',gifts:'個',feedings:'回',challenges:'回',
  diggings:'回',orders:'件',votes:'票',entries:'回',characters:'人'
};
export function starpathGoalLabel(data,seasonId,task){
  if(!data||!task||typeof task.id!=='string')return null;
  const season=data.seasons.find(s=>s.id===seasonId);
  const goal=season?.goals.find(g=>g.id===task.id&&g.kind===task.objectiveKind);
  if(!goal)return null;
  const parts=[];
  if(goal.value!==undefined)parts.push(goal.value.toLocaleString('ja-JP')+(LABELS[goal.unit]??''));
  if(goal.friendshipLevel!==undefined)parts.push('友情Lv.'+goal.friendshipLevel);
  if(goal.companionLevel!==undefined)parts.push('オトモLv.'+goal.companionLevel);
  return parts.length?parts.join(' · '):null;
}
