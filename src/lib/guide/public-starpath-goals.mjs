/**
 * Immutable, source-SHA-pinned numeric Star Path target overlay.
 * This never contains private objective filters, player progress, UUIDs,
 * or claims about live online availability.
 */
import {verifyPublicStarpath,STARPATH_SOURCE_SHA} from './public-starpath.ts';

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
/**
 * Display-only unit translations (not game LocDB strings). All numeric values
 * still come exclusively from the pinned Steam cache. Count nouns are inflected
 * for singular/plural in languages where that changes the visible label.
 */
const UNIT_LABELS={
  ja:{items:'個',discussions:'回',changes:'回',interactions:'回',fish:'匹',
    photos:'枚',meals:'品',minutes:'分',waterings:'回',currency:'',
    duties:'件',gifts:'個',feedings:'回',challenges:'回',diggings:'回',
    orders:'件',votes:'票',entries:'回',characters:'人'},
  en:{items:['item','items'],discussions:['discussion','discussions'],
    changes:['change','changes'],interactions:['interaction','interactions'],
    fish:['fish','fish'],photos:['photo','photos'],meals:['meal','meals'],
    minutes:'min',waterings:['watering','waterings'],currency:'',
    duties:['duty','duties'],gifts:['gift','gifts'],feedings:['feeding','feedings'],
    challenges:['challenge','challenges'],diggings:['dig','digs'],
    orders:['order','orders'],votes:['vote','votes'],entries:['entry','entries'],
    characters:['character','characters']},
  fr:{items:['objet','objets'],discussions:['discussion','discussions'],
    changes:['changement','changements'],interactions:['interaction','interactions'],
    fish:['poisson','poissons'],photos:['photo','photos'],meals:['plat','plats'],
    minutes:'min',waterings:['arrosage','arrosages'],currency:'',
    duties:['tâche','tâches'],gifts:['cadeau','cadeaux'],feedings:['nourrissage','nourrissages'],
    challenges:['défi','défis'],diggings:['excavation','excavations'],
    orders:['commande','commandes'],votes:['vote','votes'],entries:['participation','participations'],
    characters:['personnage','personnages']},
  it:{items:['oggetto','oggetti'],discussions:['conversazione','conversazioni'],
    changes:['cambio','cambi'],interactions:['interazione','interazioni'],
    fish:['pesce','pesci'],photos:['foto','foto'],meals:['piatto','piatti'],
    minutes:'min',waterings:['annaffiatura','annaffiature'],currency:'',
    duties:['incarico','incarichi'],gifts:['regalo','regali'],feedings:['nutrimento','nutrimenti'],
    challenges:['sfida','sfide'],diggings:['scavo','scavi'],
    orders:['ordine','ordini'],votes:['voto','voti'],entries:['partecipazione','partecipazioni'],
    characters:['personaggio','personaggi']},
  de:{items:['Gegenstand','Gegenstände'],discussions:['Gespräch','Gespräche'],
    changes:['Wechsel','Wechsel'],interactions:['Interaktion','Interaktionen'],
    fish:['Fisch','Fische'],photos:['Foto','Fotos'],meals:['Gericht','Gerichte'],
    minutes:'Min.',waterings:['Gießvorgang','Gießvorgänge'],currency:'',
    duties:['Aufgabe','Aufgaben'],gifts:['Geschenk','Geschenke'],feedings:['Fütterung','Fütterungen'],
    challenges:['Herausforderung','Herausforderungen'],diggings:['Grabung','Grabungen'],
    orders:['Bestellung','Bestellungen'],votes:['Stimme','Stimmen'],entries:['Teilnahme','Teilnahmen'],
    characters:['Figur','Figuren']},
  'es-ES':{items:['objeto','objetos'],discussions:['conversación','conversaciones'],
    changes:['cambio','cambios'],interactions:['interacción','interacciones'],
    fish:['pez','peces'],photos:['foto','fotos'],meals:['plato','platos'],
    minutes:'min',waterings:['riego','riegos'],currency:'',
    duties:['tarea','tareas'],gifts:['regalo','regalos'],feedings:['alimentación','alimentaciones'],
    challenges:['desafío','desafíos'],diggings:['excavación','excavaciones'],
    orders:['pedido','pedidos'],votes:['voto','votos'],entries:['participación','participaciones'],
    characters:['personaje','personajes']},
  'pt-BR':{items:['item','itens'],discussions:['conversa','conversas'],
    changes:['troca','trocas'],interactions:['interação','interações'],
    fish:['peixe','peixes'],photos:['foto','fotos'],meals:['prato','pratos'],
    minutes:'min',waterings:['rega','regas'],currency:'',
    duties:['tarefa','tarefas'],gifts:['presente','presentes'],feedings:['alimentação','alimentações'],
    challenges:['desafio','desafios'],diggings:['escavação','escavações'],
    orders:['pedido','pedidos'],votes:['voto','votos'],entries:['participação','participações'],
    characters:['personagem','personagens']},
  'zh-CN':{items:'件',discussions:'次',changes:'次',interactions:'次',
    fish:'条鱼',photos:'张照片',meals:'道菜',minutes:'分钟',waterings:'次',currency:'',
    duties:'项任务',gifts:'份礼物',feedings:'次',challenges:'次',diggings:'次',
    orders:'份订单',votes:'票',entries:'次',characters:'人'}
};
export const STARPATH_GOAL_LOCALES=Object.freeze(Object.keys(UNIT_LABELS));
const GOAL_HEADINGS={
  ja:'目標',en:'Goal',fr:'Objectif',it:'Obiettivo',de:'Ziel',
  'es-ES':'Objetivo','pt-BR':'Meta','zh-CN':'目标'
};
const LEVEL_HEADINGS={
  ja:{friendship:'友情Lv.',companion:'オトモLv.'},
  en:{friendship:'Friendship Lv. ',companion:'Companion Lv. '},
  fr:{friendship:'Amitié niv. ',companion:'Compagnon niv. '},
  it:{friendship:'Amicizia liv. ',companion:'Compagno liv. '},
  de:{friendship:'Freundschaft Lv. ',companion:'Begleiter Lv. '},
  'es-ES':{friendship:'Amistad niv. ',companion:'Compañero niv. '},
  'pt-BR':{friendship:'Amizade nv. ',companion:'Companheiro nv. '},
  'zh-CN':{friendship:'友谊等级',companion:'伙伴等级'}
};
const displayLocale=x=>Object.hasOwn(UNIT_LABELS,x)?x:'ja';
export function starpathGoalHeading(locale='ja'){
  return GOAL_HEADINGS[displayLocale(locale)];
}
export function starpathGoalLabel(data,seasonId,task,locale='ja'){
  if(!data||!task||typeof task.id!=='string')return null;
  const season=data.seasons?.find(s=>s.id===seasonId);
  const goal=season?.goals.find(g=>g.id===task.id&&g.kind===task.objectiveKind);
  if(!goal)return null;
  const language=displayLocale(locale);
  const count=number=>new Intl.NumberFormat(language).format(number);
  const units=UNIT_LABELS[language];
  const labels=LEVEL_HEADINGS[language];
  const parts=[];
  if(goal.value!==undefined){
    const unit=units[goal.unit];
    if(unit===undefined)return null;
    const suffix=Array.isArray(unit)?unit[goal.value===1?0:1]:unit;
    parts.push(count(goal.value)+(language==='ja'||language==='zh-CN'||!suffix?'':' ')+suffix);
  }
  if(goal.friendshipLevel!==undefined)parts.push(labels.friendship+count(goal.friendshipLevel));
  if(goal.companionLevel!==undefined)parts.push(labels.companion+count(goal.companionLevel));
  return parts.length?parts.join(' · '):null;
}

/**
 * One verified source-language conflict (not an inferred player goal).
 * German LocDB text says 20 fish while the authenticated Steam objective and
 * other numeric descriptions say 25. Never silently edit either source.
 */
export function starpathGoalSourceNote(data,seasonId,task,locale,nativeText){
  if(seasonId!=='Seafaring2026'||task?.id!=='Week03Task01'||
    task.objectiveKind!=='CatchFish'||locale!=='de'||
    nativeText!=='Fange 20 Fische am schillernden Strand.')return null;
  const goal=data?.seasons?.find(s=>s.id===seasonId)?.goals.find(
    g=>g.id===task.id&&g.kind===task.objectiveKind);
  if(goal?.value!==25||goal?.unit!=='fish')return null;
  return 'Abweichung im Spieltext: 20 Fische · Zielwert im Spielcache: 25 Fische.';
}
