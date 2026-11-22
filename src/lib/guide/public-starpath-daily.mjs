/** Source-verified Steam v1.26.2 Liveops daily Star Path descriptions.
 * Original English cache descriptions exactly match the original LocDB keys.
 * Strict public SHA-pinned data only; no inferred player task state.
 */
export const STARPATH_DAILY_RELEASE=Object.freeze({
  HauntingElegance2026:Object.freeze({file:'starpath-daily-haunting-2026-11-22.json',count:121,bytes:45280,sha256:'5cb5a3809eec14be3cc24191b6bd8f39a20624c69eafcc57e61246bd85ffaddc'}),
  Seafaring2026:Object.freeze({file:'starpath-daily-seafaring-2026-11-22.json',count:25,bytes:10315,sha256:'6d308bd67caceea376054ae18f4b6e8953cecfdd8aff2507bc9dae058dd45beb'})
});
const LOCALES=Object.freeze({ja:'ja',en:'en-US',fr:'fr',it:'it',de:'de','es-ES':'es','pt-BR':'pt-BR','zh-CN':'zh-CN'});
const LANGS=Object.values(LOCALES);
const assert=(ok,msg)=>{if(!ok)throw new TypeError('Star Path daily locales: '+msg)};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const normalize=x=>x.replace(/\u00a0/g,' ').trim();

/** Verify 8-language closure and cache-English equality for one exact season. */
export function verifyStarpathDailyPart(part,season){
  const meta=season&&Object.hasOwn(STARPATH_DAILY_RELEASE,season.id)?STARPATH_DAILY_RELEASE[season.id]:null;
  assert(meta&&Array.isArray(season.tasks)&&season.tasks.length===meta.count,'season identity');
  assert(record(part)&&Object.keys(part).length===meta.count,'daily key census');
  const expected=new Set(season.tasks.map(t=>{
    assert(typeof t.id==='string'&&/^Task[0-9]{2,3}$/.test(t.id),'task ID');
    return season.id+'_'+t.id+'_Description';
  }));
  assert(expected.size===meta.count,'duplicate daily task');
  for(const [key,translations] of Object.entries(part)){
    assert(expected.has(key)&&record(translations)&&Object.keys(translations).length===8
      &&LANGS.every(locale=>Object.hasOwn(translations,locale)),'unknown or incomplete language keys');
    for(const text of Object.values(translations)){
      assert(typeof text==='string'&&text.length>0&&text.length<=300
        &&!/[<>\x00-\x1f]/.test(text),'invalid native text');
    }
  }
  for(const task of season.tasks){
    const key=season.id+'_'+task.id+'_Description';
    assert(typeof task.description==='string'&&normalize(part[key]['en-US'])===normalize(task.description),'English source mismatch');
  }
  return part;
}

export async function loadStarpathDailyPart(basePath,season,fetcher=fetch){
  const info=season&&Object.hasOwn(STARPATH_DAILY_RELEASE,season.id)?STARPATH_DAILY_RELEASE[season.id]:null;
  assert(info&&typeof basePath==='string','unrecognized season');
  const response=await fetcher(basePath+info.file);assert(response.ok,'download failed');
  const raw=await response.arrayBuffer();
  assert(raw.byteLength===info.bytes,'publication size mismatch');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  assert(sha===info.sha256,'publication fingerprint mismatch');
  return verifyStarpathDailyPart(JSON.parse(new TextDecoder().decode(raw)),season);
}
export async function loadStarpathDailyLocales(basePath,seasons,fetcher=fetch){
  assert(Array.isArray(seasons)&&seasons.length===2,'two season evidence');
  const names=seasons.map(s=>s.id);
  assert(new Set(names).size===2&&names.every(id=>Object.hasOwn(STARPATH_DAILY_RELEASE,id)),'season census');
  const parts=await Promise.all(seasons.map(s=>loadStarpathDailyPart(basePath,s,fetcher)));
  return Object.fromEntries(seasons.map((s,i)=>[s.id,parts[i]]));
}
export function starpathDailyDescription(parts,seasonId,taskId,locale='ja'){
  if(!Object.hasOwn(STARPATH_DAILY_RELEASE,seasonId)||!/^Task[0-9]{2,3}$/.test(taskId||''))return null;
  const lang=Object.hasOwn(LOCALES,locale)?LOCALES[locale]:null;
  if(!lang)return null;
  const key=seasonId+'_'+taskId+'_Description';
  const part=parts?.[seasonId];
  const phrases=part&&Object.hasOwn(part,key)?part[key]:null;
  return phrases?.[lang]||null;
}
