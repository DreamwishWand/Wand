/**
 * Source-first Star Path duty discovery.
 *
 * Indexed words come only from the verified public cache, verified 8-locale
 * descriptions, source-pinned scalar goals, and exact-ID editorial actions.
 * Editorial answers are searched only in the languages in which they exist.
 * The filter does not infer player progress or current server availability.
 */
import {actionableStarpathTask} from './starpath-task-guidance.mjs';

const LOCALES=new Set(['ja','en','fr','it','de','es-ES','pt-BR','zh-CN']);
const normalize=text=>text.normalize('NFKC').toLocaleLowerCase().replace(/\u00a0/g,' ').trim();

/**
 * Preserve original order and return all matches; the UI decides how much
 * to render and how to progressively append. Do not use opaque source keys
 * as translations or accept query strings as a source of task identities.
 */
/**
 * @param {string} seasonId
 * @param {any[]} tasks
 * @param {{query?:string,locale?:string,descriptionOf?:(task:any)=>string|null,goalTextOf?:(task:any)=>string|null}} [options]
 */
export function filterStarpathTasks(seasonId,tasks,{
  query='',locale='ja',descriptionOf=()=>null,goalTextOf=()=>null
}={}){
  if(typeof seasonId!=='string'||!Array.isArray(tasks)||
      typeof query!=='string'||query.length>120||!LOCALES.has(locale)||
      typeof descriptionOf!=='function'||typeof goalTextOf!=='function')
    throw new TypeError('Star Path search: invalid input');
  const words=normalize(query).split(/\s+/).filter(Boolean);
  if(!words.length)return tasks;
  return tasks.filter(task=>{
    if(!task||typeof task.id!=='string')return false;
    const native=descriptionOf(task);
    const editorial=(locale==='ja'||locale==='en')
      ?actionableStarpathTask(seasonId,task,locale)?.action:null;
    const target=goalTextOf(task);
    const labels=[
      task.id,task.objectiveKind,task.description,
      native,editorial,target
    ].filter(value=>typeof value==='string');
    const haystack=normalize(labels.join(' '));
    return words.every(word=>haystack.includes(word));
  });
}
