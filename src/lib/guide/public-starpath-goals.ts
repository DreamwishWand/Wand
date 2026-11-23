/** Original SHA-pinned Steam v1.26.2 numeric Star Path goal overlay.
 * Source scalar values and level thresholds are static game config, NEVER
 * live online state, player progress, or private objective selectors.
 */
import {verifyPublicStarpath,STARPATH_SOURCE_SHA,
  type PublicStarpathSeasonId,type PublicStarpathTask
} from './public-starpath.ts';
import type {WandLanguage} from '../ui/preferences.ts';

export const STARPATH_GOALS_SCHEMA='wand.db03.starpath-goals@1' as const;
export const STARPATH_GOALS_SHA=
  '3d6a81699f2d3e45e2604e8248ac4a202e49a630ac0269da90fef510cccdd0a3' as const;
export const STARPATH_GOALS_BYTES=12398 as const;
export type StarpathGoalUnit=
  'items'|'discussions'|'changes'|'interactions'|'fish'|'photos'|'meals'|
  'minutes'|'waterings'|'currency'|'duties'|'gifts'|'feedings'|
  'challenges'|'diggings'|'orders'|'votes'|'entries'|'characters';
type UnitDisplay=string|readonly [string,string];

export interface PublicStarpathGoal{
  readonly id:string;
  readonly kind:string;
  readonly value?:number;
  readonly unit?:StarpathGoalUnit;
  readonly friendshipLevel?:number;
  readonly companionLevel?:number;
}
export interface PublicStarpathGoalSeason{
  readonly id:PublicStarpathSeasonId;
  readonly normalCount:number;
  readonly weeklyCount:number;
  readonly goals:readonly PublicStarpathGoal[];
}
export interface PublicStarpathGoals{
  readonly schema:typeof STARPATH_GOALS_SCHEMA;
  readonly source:Readonly<{
    sourceSha256:typeof STARPATH_SOURCE_SHA;
    sourceBytes:186442;
    gameVersion:'Steam 1.26.2';
    staticNotPlayerProgress:true;
  }>;
  readonly seasons:readonly PublicStarpathGoalSeason[];
}
type BinaryResponse=Pick<Response,'ok'|'arrayBuffer'>;
const UNITS:ReadonlySet<string>=new Set([
  'items','discussions','changes','interactions','fish','photos','meals',
  'minutes','waterings','currency','duties','gifts','feedings',
  'challenges','diggings','orders','votes','entries','characters'
]);
function check(value:unknown,message:string):asserts value{
  if(!value)throw new TypeError('Public Star Path goals: '+message);
}
function record(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function validInt(value:unknown):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&
    value>0&&value<=10000000;
}
export function verifyPublicStarpathGoals(
  data:unknown,starpath:unknown
):PublicStarpathGoals{
  const snapshot=verifyPublicStarpath(starpath);
  check(record(data)&&data.schema===STARPATH_GOALS_SCHEMA,'schema');
  const provenance=data.source;
  check(record(provenance)&&provenance.sourceSha256===STARPATH_SOURCE_SHA&&
    provenance.sourceBytes===186442&&
    provenance.gameVersion==='Steam 1.26.2'&&
    provenance.staticNotPlayerProgress===true,'source provenance');
  check(Array.isArray(data.seasons)&&data.seasons.length===2,'season census');
  let total=0,typed=0;
  for(let i=0;i<2;i++){
    const source=snapshot.seasons[i],season:unknown=data.seasons[i];
    check(record(season)&&season.id===source.id&&
      season.normalCount===source.tasks.length&&
      season.weeklyCount===source.weeklyTasks.flat().length,'season identity');
    const originals=[...source.tasks,...source.weeklyTasks.flat()];
    check(Array.isArray(season.goals)&&
      season.goals.length===originals.length,'goal rows');
    const seen=new Set<string>();
    for(let j=0;j<originals.length;j++){
      const row:unknown=season.goals[j],task=originals[j];
      check(record(row)&&row.id===task.id&&
        row.kind===task.objectiveKind&&typeof row.id==='string'&&
        !seen.has(row.id),'task source identity');
      seen.add(row.id);total++;
      check(Object.keys(row).every(key=>[
        'id','kind','value','unit','friendshipLevel','companionLevel'
      ].includes(key)),'unapproved data key');
      if(Object.hasOwn(row,'value')){
        check(validInt(row.value)&&typeof row.unit==='string'&&
          UNITS.has(row.unit),'source scalar');
        typed++;
      }else check(!Object.hasOwn(row,'unit'),'unpaired source unit');
      if(Object.hasOwn(row,'friendshipLevel'))
        check(row.kind==='Friend'&&validInt(row.friendshipLevel),
          'friendship threshold');
      if(Object.hasOwn(row,'companionLevel'))
        check(row.kind==='EquipPet'&&validInt(row.companionLevel),
          'companion threshold');
      if(row.kind==='Friend')
        check(validInt(row.friendshipLevel),'missing friendship threshold');
      if(row.kind==='EquipPet')
        check(validInt(row.companionLevel),'missing companion threshold');
      if(row.kind==='VisitArea')
        check(!Object.hasOwn(row,'value'),'invented visit amount');
    }
  }
  check(total===185&&typed===178,'verified goal census');
  return data as unknown as PublicStarpathGoals;
}
/** Byte-check before JSON parsing and validate every goal against cached Task ID. */
export async function loadPublicStarpathGoals(
  url:string,starpath:unknown,
  fetcher:(url:string)=>Promise<BinaryResponse>=fetch
):Promise<PublicStarpathGoals>{
  const response=await fetcher(url);check(response.ok,'download failed');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===STARPATH_GOALS_BYTES,'publication size mismatch');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(hash===STARPATH_GOALS_SHA,'publication fingerprint mismatch');
  return verifyPublicStarpathGoals(JSON.parse(
    new TextDecoder('utf-8',{fatal:true}).decode(bytes)),starpath);
}

/**
 * Display-only unit translations (not game LocDB strings). All numeric values
 * still come exclusively from the pinned Steam cache. Count nouns are inflected
 * for singular/plural in languages where that changes the visible label.
 */
const UNIT_LABELS:Readonly<Record<WandLanguage,Readonly<Record<StarpathGoalUnit,UnitDisplay>>>>={
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
export const STARPATH_GOAL_LOCALES:readonly WandLanguage[]=Object.freeze(Object.keys(UNIT_LABELS) as WandLanguage[]);
const GOAL_HEADINGS:Readonly<Record<WandLanguage,string>>={
  ja:'目標',en:'Goal',fr:'Objectif',it:'Obiettivo',de:'Ziel',
  'es-ES':'Objetivo','pt-BR':'Meta','zh-CN':'目标'
};
const LEVEL_HEADINGS:Readonly<Record<WandLanguage,Readonly<{friendship:string;companion:string}>>>={
  ja:{friendship:'友情Lv.',companion:'オトモLv.'},
  en:{friendship:'Friendship Lv. ',companion:'Companion Lv. '},
  fr:{friendship:'Amitié niv. ',companion:'Compagnon niv. '},
  it:{friendship:'Amicizia liv. ',companion:'Compagno liv. '},
  de:{friendship:'Freundschaft Lv. ',companion:'Begleiter Lv. '},
  'es-ES':{friendship:'Amistad niv. ',companion:'Compañero niv. '},
  'pt-BR':{friendship:'Amizade nv. ',companion:'Companheiro nv. '},
  'zh-CN':{friendship:'友谊等级',companion:'伙伴等级'}
};
const displayLocale=(value:string):WandLanguage=>Object.hasOwn(UNIT_LABELS,value)?value as WandLanguage:'ja';
export function starpathGoalHeading(locale:string='ja'):string{
  return GOAL_HEADINGS[displayLocale(locale)];
}
export function starpathGoalLabel(
  data:PublicStarpathGoals|null|undefined,seasonId:string,
  task:Pick<PublicStarpathTask,'id'|'objectiveKind'>|null|undefined,
  locale:string='ja'
):string|null{
  if(!data||!task||typeof task.id!=='string')return null;
  const season=data.seasons?.find(s=>s.id===seasonId);
  const goal=season?.goals.find(g=>g.id===task.id&&g.kind===task.objectiveKind);
  if(!goal)return null;
  const language=displayLocale(locale);
  const count=(number:number):string=>new Intl.NumberFormat(language).format(number);
  const units=UNIT_LABELS[language];
  const labels=LEVEL_HEADINGS[language];
  const parts:string[]=[];
  if(goal.value!==undefined){
    if(!goal.unit)return null;
    const unit=units[goal.unit];
    if(unit===undefined)return null;
    const suffix=typeof unit==='string'?unit:unit[goal.value===1?0:1];
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
export function starpathGoalSourceNote(
  data:PublicStarpathGoals|null|undefined,seasonId:string,
  task:Pick<PublicStarpathTask,'id'|'objectiveKind'>|null|undefined,
  locale:string,nativeText:string|null
):string|null{
  if(seasonId!=='Seafaring2026'||task?.id!=='Week03Task01'||
    task.objectiveKind!=='CatchFish'||locale!=='de'||
    nativeText!=='Fange 20 Fische am schillernden Strand.')return null;
  const goal=data?.seasons?.find(s=>s.id===seasonId)?.goals.find(
    g=>g.id===task.id&&g.kind===task.objectiveKind);
  if(goal?.value!==25||goal?.unit!=='fish')return null;
  return 'Abweichung im Spieltext: 20 Fische · Zielwert im Spielcache: 25 Fische.';
}
