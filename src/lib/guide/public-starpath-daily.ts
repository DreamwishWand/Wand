/** Steam v1.26.2 source-pinned, daily Star Path Task descriptions.
 *
 * Original English cache text must match the published LocDB English field.
 * These native strings never establish player progress or live online events.
 */
import {
  STARPATH_ORIGINAL_LOCALES,STARPATH_TASK_LOCALE_MAP,
  assertStarpathLocalization,isStarpathLanguage,isStarpathRecord,
  isStarpathSeasonId,
  type SourceStarpathSeason,type StarpathDailyParts,type StarpathSeasonId,
  type StarpathLocalizedPart,type StarpathBinaryFetcher
} from './starpath-locale-contract.ts';

interface DailyRelease{
  readonly file:string;readonly count:number;readonly bytes:number;readonly sha256:string;
}
export const STARPATH_DAILY_RELEASE:Readonly<Record<StarpathSeasonId,DailyRelease>>=
  Object.freeze({
    HauntingElegance2026:Object.freeze({
      file:'starpath-daily-haunting-2026-11-22.json',count:121,bytes:45280,
      sha256:'5cb5a3809eec14be3cc24191b6bd8f39a20624c69eafcc57e61246bd85ffaddc'
    }),
    Seafaring2026:Object.freeze({
      file:'starpath-daily-seafaring-2026-11-22.json',count:25,bytes:10315,
      sha256:'6d308bd67caceea376054ae18f4b6e8953cecfdd8aff2507bc9dae058dd45beb'
    })
  });
const TASK=/^Task[0-9]{2,3}$/;
const normalize=(value:string):string=>value.replace(/\u00a0/g,' ').trim();
function check(value:unknown,message:string):asserts value{
  assertStarpathLocalization(value,'daily '+message);
}

export function verifyStarpathDailyPart(
  part:unknown,season:SourceStarpathSeason
):StarpathLocalizedPart{
  const meta=season&&isStarpathSeasonId(season.id)?STARPATH_DAILY_RELEASE[season.id]:null;
  check(meta&&Array.isArray(season.tasks)&&season.tasks.length===meta.count,
    'season identity');
  check(isStarpathRecord(part)&&Object.keys(part).length===meta.count,
    'key census');
  const expected=new Set(season.tasks.map(task=>{
    check(typeof task.id==='string'&&TASK.test(task.id),'task ID');
    return season.id+'_'+task.id+'_Description';
  }));
  check(expected.size===meta.count,'duplicate task');
  for(const [key,translations] of Object.entries(part)){
    check(expected.has(key)&&isStarpathRecord(translations)&&
      Object.keys(translations).length===8&&
      STARPATH_ORIGINAL_LOCALES.every(locale=>Object.hasOwn(translations,locale)),
      'unknown or incomplete language keys');
    for(const value of Object.values(translations)){
      check(typeof value==='string'&&value.length>0&&value.length<=300&&
        !/[<>\x00-\x1f]/.test(value),'invalid native text');
    }
  }
  for(const task of season.tasks){
    const key=season.id+'_'+task.id+'_Description';
    const entry=part[key];
    check(isStarpathRecord(entry)&&typeof entry['en-US']==='string'&&
      typeof task.description==='string'&&
      normalize(entry['en-US'])===normalize(task.description),
      'English source mismatch');
  }
  return part as StarpathLocalizedPart;
}

export async function loadStarpathDailyPart(
  basePath:string,season:SourceStarpathSeason,
  fetcher:StarpathBinaryFetcher=fetch
):Promise<StarpathLocalizedPart>{
  const info=season&&isStarpathSeasonId(season.id)?STARPATH_DAILY_RELEASE[season.id]:null;
  check(info&&typeof basePath==='string','unrecognized season');
  const response=await fetcher(basePath+info.file);
  check(response.ok,'download failed');
  const raw=await response.arrayBuffer();
  check(raw.byteLength===info.bytes,'publication size mismatch');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)))
    .map(value=>value.toString(16).padStart(2,'0')).join('');
  check(sha===info.sha256,'publication fingerprint mismatch');
  return verifyStarpathDailyPart(JSON.parse(new TextDecoder().decode(raw)),season);
}

export async function loadStarpathDailyLocales(
  basePath:string,seasons:readonly SourceStarpathSeason[],
  fetcher:StarpathBinaryFetcher=fetch
):Promise<StarpathDailyParts>{
  check(Array.isArray(seasons)&&seasons.length===2,'two season evidence');
  const names=seasons.map(season=>season.id);
  check(new Set(names).size===2&&names.every(id=>isStarpathSeasonId(id)),
    'season census');
  const parts=await Promise.all(seasons.map(season=>loadStarpathDailyPart(
    basePath,season,fetcher)));
  return Object.freeze(Object.fromEntries(seasons.map((season,i)=>[
    season.id,parts[i]
  ])) as StarpathDailyParts);
}

export function starpathDailyDescription(
  parts:StarpathDailyParts|null|undefined,
  seasonId:string,taskId:string,locale:string='ja'
):string|null{
  if(!isStarpathSeasonId(seasonId)||!TASK.test(taskId)||
    !isStarpathLanguage(locale))return null;
  const key=seasonId+'_'+taskId+'_Description';
  const part=parts&&Object.hasOwn(parts,seasonId)?parts[seasonId]:null;
  const phrase=part&&Object.hasOwn(part,key)?part[key]:null;
  return phrase?.[STARPATH_TASK_LOCALE_MAP[locale]]||null;
}
