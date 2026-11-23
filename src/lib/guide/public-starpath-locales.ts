/** SHA-verified native 8-locale weekly Star Path Task descriptions.
 *
 * Exactly 39 published LocDB descriptions are used. We do not harmonize
 * different original-language numbers, simulate a live season, or change
 * save-file progress.
 */
import {
  STARPATH_ORIGINAL_LOCALES,STARPATH_TASK_LOCALE_MAP,
  assertStarpathLocalization,isStarpathLanguage,isStarpathRecord,
  verifyStarpathLocaleSnapshot,
  type StarpathLocalizedPart,type StarpathBinaryFetcher
} from './starpath-locale-contract.ts';

export const STARPATH_LOCALES_SHA=
  '6efa52893a3b3a475e00987940e50b0815f39904350e1e76731aac823ca71507';
export const STARPATH_LOCALES_BYTES=15252;
const KEY=/^Liveops\.[A-Za-z0-9_]+_Description$/;
function check(value:unknown,message:string):asserts value{
  assertStarpathLocalization(value,'weekly '+message);
}

export function verifyStarpathWeeklyLocales(
  doc:unknown,starpath:unknown
):StarpathLocalizedPart{
  check(isStarpathRecord(doc),'localization table');
  const snapshot=verifyStarpathLocaleSnapshot(starpath);
  const keys=snapshot.seasons.flatMap(season=>season.weeklyTasks.flat().map(task=>{
    check(task.description===null&&typeof task.descriptionKey==='string'&&
      KEY.test(task.descriptionKey),'unverified weekly task key');
    return task.descriptionKey.slice('Liveops.'.length);
  }));
  check(keys.length===39&&new Set(keys).size===39,'expected original keys');
  const expected=new Set(keys);
  check(Object.keys(doc).length===39&&
    Object.keys(doc).every(key=>expected.has(key)),
    'untrusted or omitted keys');
  for(const description of Object.values(doc)){
    check(isStarpathRecord(description)&&Object.keys(description).length===8&&
      STARPATH_ORIGINAL_LOCALES.every(locale=>Object.hasOwn(description,locale)),
      'eight locale coverage');
    for(const phrase of Object.values(description)){
      check(typeof phrase==='string'&&phrase.length>0&&phrase.length<=300&&
        !/[\u0000-\u001f<>]/.test(phrase)&&!phrase.includes('Liveops.'),
        'untrusted text');
    }
  }
  return doc as StarpathLocalizedPart;
}

export async function loadStarpathWeeklyLocales(
  url:string,starpath:unknown,fetcher:StarpathBinaryFetcher=fetch
):Promise<StarpathLocalizedPart>{
  const response=await fetcher(url);
  check(response.ok,'download failed');
  const raw=await response.arrayBuffer();
  check(raw.byteLength===STARPATH_LOCALES_BYTES,'publication size');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)))
    .map(value=>value.toString(16).padStart(2,'0')).join('');
  check(sha===STARPATH_LOCALES_SHA,'publication fingerprint mismatch');
  return verifyStarpathWeeklyLocales(JSON.parse(new TextDecoder().decode(raw)),starpath);
}

export function starpathWeeklyDescription(
  table:StarpathLocalizedPart|null|undefined,key:string,locale:string='ja'
):string|null{
  if(!isStarpathLanguage(locale)||typeof key!=='string'||!KEY.test(key))
    return null;
  const id=key.slice('Liveops.'.length);
  const entry=table&&Object.hasOwn(table,id)?table[id]:null;
  return entry?.[STARPATH_TASK_LOCALE_MAP[locale]]||null;
}
