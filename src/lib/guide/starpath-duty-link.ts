/**
 * Public, source-verified Star Path duty permalinks.
 *
 * These select static Guide content only. A link does not indicate a completed,
 * unlocked or currently available task, nor imply a running game event.
 */
export type StarpathDutyTab = 'tasks' | 'weekly';
export interface StarpathDutySelection {
  seasonId: 'HauntingElegance2026' | 'Seafaring2026';
  taskId: string;
  tab: StarpathDutyTab;
  index: number;
}
interface Duty { id: string }
interface Season {
  id: string;
  tasks: Duty[];
  weeklyTasks: Duty[][];
}
interface Catalog { seasons: Season[] }
const SEASONS = new Set(['HauntingElegance2026','Seafaring2026']);
const NORMAL = /^Task[0-9]{2,3}$/;
const WEEKLY = /^Week[0-9]{2}Task[0-9]{2,3}$/;
const APP_BASE = /^(?:|\/(?:[A-Za-z0-9_-]+)(?:\/[A-Za-z0-9_-]+)*)$/;

/**
 * Fail closed on unverified, ambiguous, duplicate and foreign links. Exact
 * membership comes from the authenticated public Star Path catalog loaded by
 * the route, not from the apparent syntax of the ID.
 */
export function resolveStarpathDutyLink(search: string, catalog: unknown): StarpathDutySelection|null {
  if(typeof search!=='string'||search.length>2048)return null;
  if(!catalog||typeof catalog!=='object')return null;
  const seasons=(catalog as Partial<Catalog>).seasons;
  if(!Array.isArray(seasons)||seasons.length!==2)return null;
  const params=new URLSearchParams(search);
  const seasonParams=params.getAll('season'), taskParams=params.getAll('task');
  if(seasonParams.length!==1||taskParams.length!==1||params.has('reward'))return null;
  const seasonId=seasonParams[0],taskId=taskParams[0];
  if(!SEASONS.has(seasonId)||!(NORMAL.test(taskId)||WEEKLY.test(taskId)))return null;
  const source=seasons.find(s=>s?.id===seasonId);
  if(!source||!Array.isArray(source.tasks)||!Array.isArray(source.weeklyTasks))return null;
  const weekly=WEEKLY.test(taskId);
  const rows=weekly?source.weeklyTasks.flat():source.tasks;
  const index=rows.findIndex(row=>row?.id===taskId);
  if(index<0||rows.filter(row=>row?.id===taskId).length!==1)return null;
  return {
    seasonId:seasonId as StarpathDutySelection['seasonId'],
    taskId,tab:weekly?'weekly':'tasks',index
  };
}

/** A stable URL independent of event schedule or current user progress. */
export function starpathDutyHref(base: string, seasonId: string, taskId: string): string {
  if(typeof base!=='string'||!APP_BASE.test(base)||
    !SEASONS.has(seasonId)||!(NORMAL.test(taskId)||WEEKLY.test(taskId)))
    throw new TypeError('Star Path permalink: invalid link');
  return base+'/guide/star-path/?season='+seasonId+'&task='+taskId;
}

/** A season-only permalink selects a source-verified static season, not
 * player progress, a claimed active event, or a reward entitlement. */
export function resolveStarpathSeasonLink(search:string,catalog:unknown):StarpathDutySelection['seasonId']|null{
  if(typeof search!=='string'||search.length>2048||
    !catalog||typeof catalog!=='object')return null;
  const seasons=(catalog as Partial<Catalog>).seasons;
  if(!Array.isArray(seasons)||seasons.length!==2)return null;
  const params=new URLSearchParams(search);
  const requested=params.getAll('season');
  if(requested.length!==1||params.has('task')||params.has('reward')||
    !SEASONS.has(requested[0]))return null;
  const ids=seasons.map(season=>season?.id);
  if(ids.some(id=>typeof id!=='string'||!SEASONS.has(id))||
    new Set(ids).size!==2||ids.filter(id=>id===requested[0]).length!==1)return null;
  return requested[0] as StarpathDutySelection['seasonId'];
}

/** Calendar links preserve the selected public Star Path season. */
export function starpathSeasonHref(base:string,seasonId:string):string{
  if(typeof base!=='string'||!APP_BASE.test(base)||!SEASONS.has(seasonId))
    throw new TypeError('Star Path permalink: invalid link');
  return base+'/guide/star-path/?season='+seasonId;
}
