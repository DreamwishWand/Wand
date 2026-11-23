/** Source-backed Star Path task localization contracts.
 *
 * The player language is not a native LocDB locale code. A task name from
 * these overlays is a STATIC original-description string; it never indicates
 * live season availability or individual completion.
 */
import {verifyPublicStarpath} from './public-starpath.mjs';
import type {WandLanguage} from '../ui/preferences';

export type StarpathSeasonId='HauntingElegance2026'|'Seafaring2026';
export type StarpathOriginalLocale=
  'ja'|'en-US'|'fr'|'it'|'de'|'es'|'pt-BR'|'zh-CN';

export const STARPATH_TASK_LOCALE_MAP:Readonly<Record<WandLanguage,StarpathOriginalLocale>>=
  Object.freeze({
    ja:'ja',en:'en-US',fr:'fr',it:'it',de:'de',
    'es-ES':'es','pt-BR':'pt-BR','zh-CN':'zh-CN'
  });
export const STARPATH_ORIGINAL_LOCALES:readonly StarpathOriginalLocale[]=
  Object.freeze(Object.values(STARPATH_TASK_LOCALE_MAP));
export const STARPATH_SEASON_IDS:readonly StarpathSeasonId[]=
  Object.freeze(['HauntingElegance2026','Seafaring2026']);

export interface SourceStarpathTask{
  readonly id:string;
  readonly description:string|null;
  readonly descriptionKey:string|null;
}
export interface SourceStarpathSeason{
  readonly id:string;
  readonly tasks:readonly SourceStarpathTask[];
  readonly weeklyTasks:readonly (readonly SourceStarpathTask[])[];
}
export interface SourceStarpathSnapshot{
  readonly seasons:readonly SourceStarpathSeason[];
}
export type StarpathLocalizedDescription=Readonly<Record<StarpathOriginalLocale,string>>;
export type StarpathLocalizedPart=Readonly<Record<string,StarpathLocalizedDescription>>;
export type StarpathDailyParts=Readonly<Partial<Record<StarpathSeasonId,StarpathLocalizedPart>>>;
export type StarpathBytesResponse=Pick<Response,'ok'|'arrayBuffer'>;
export type StarpathBinaryFetcher=(url:string)=>Promise<StarpathBytesResponse>;

const starpathIds=new Set<string>(STARPATH_SEASON_IDS);
export function isStarpathSeasonId(value:unknown):value is StarpathSeasonId{
  return typeof value==='string'&&starpathIds.has(value);
}
export function isStarpathLanguage(value:unknown):value is WandLanguage{
  return typeof value==='string'&&Object.hasOwn(STARPATH_TASK_LOCALE_MAP,value);
}
export function isStarpathRecord(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
export function assertStarpathLocalization(ok:unknown,message:string):asserts ok{
  if(!ok)throw new TypeError('Star Path locales: '+message);
}

/** The legacy source-provenance validator is retained as the single authority
 * for the original 2-season Steam 1.26.2 cache until its own typed migration.
 * This function additionally exposes only the structural fields used here.
 */
export function verifyStarpathLocaleSnapshot(source:unknown):SourceStarpathSnapshot{
  verifyPublicStarpath(source);
  assertStarpathLocalization(isStarpathRecord(source)&&Array.isArray(source.seasons)&&
    source.seasons.length===2,'verified 2-season source');
  for(const row of source.seasons){
    assertStarpathLocalization(isStarpathRecord(row)&&isStarpathSeasonId(row.id)&&
      Array.isArray(row.tasks)&&Array.isArray(row.weeklyTasks)&&
      row.tasks.every(task=>isStarpathRecord(task)&&typeof task.id==='string'&&
        (task.description===null||typeof task.description==='string'))&&
      row.weeklyTasks.every(week=>Array.isArray(week)&&week.every(task=>
        isStarpathRecord(task)&&typeof task.id==='string'&&
        typeof task.descriptionKey==='string')),
      'invalid source task contract');
  }
  return source as unknown as SourceStarpathSnapshot;
}
