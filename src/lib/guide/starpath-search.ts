/**
 * Source-verified Star Path task search, strictly typed.
 *
 * Search only the authenticated source, language-appropriate descriptions and
 * pinned editorial interpretations; never infer live task progress.
 */
import {actionableStarpathTask,type SourceStarpathTask} from './starpath-task-guidance.ts';

const LOCALES=new Set(['ja','en','fr','it','de','es-ES','pt-BR','zh-CN']);
const normalize=(text:string)=>text.normalize('NFKC').toLocaleLowerCase().replace(/\u00a0/g,' ').trim();

export interface StarpathSearchOptions<T extends SourceStarpathTask>{
  query?: string;
  locale?: string;
  descriptionOf?: (task:T)=>string|null;
  goalTextOf?: (task:T)=>string|null;
}

/** Keep original task order and return all matches; UI owns pagination. */
export function filterStarpathTasks<T extends SourceStarpathTask>(
  seasonId:string,
  tasks:T[],
  {query='',locale='ja',descriptionOf=()=>null,goalTextOf=()=>null}:StarpathSearchOptions<T>={}
):T[]{
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
    ].filter((value):value is string=>typeof value==='string');
    const haystack=normalize(labels.join(' '));
    return words.every(word=>haystack.includes(word));
  });
}
