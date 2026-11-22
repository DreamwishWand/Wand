/** Original eight-locale weekly duty phrases from SHA-verified Steam v1.26.2 LocDB ZIPs.
 * This public projection retains only 39 whitelisted Liveops descriptions.
 * It is NOT a live clock, duty completion or rewards-eligibility source.
 */
export const STARPATH_LOCALES_SHA='6efa52893a3b3a475e00987940e50b0815f39904350e1e76731aac823ca71507';
export const STARPATH_LOCALES_BYTES=15252;
const LIVEOPS_LOCALE=Object.freeze({ja:'ja',en:'en-US',fr:'fr',it:'it',de:'de','es-ES':'es','pt-BR':'pt-BR','zh-CN':'zh-CN'});
const ok=(v,msg)=>{if(!v)throw new TypeError('Public Star Path locales: '+msg)};
export function verifyStarpathWeeklyLocales(doc,starpath){
  ok(doc!==null&&typeof doc==='object'&&!Array.isArray(doc),'localization table');
  ok(starpath?.seasons?.length===2,'verified season snapshot required');
  const keys=starpath.seasons.flatMap(s=>s.weeklyTasks.flat().map(t=>{
    ok(t?.description===null&&/^Liveops\.[A-Za-z0-9_]+_Description$/.test(t.descriptionKey),'unverified weekly task key');
    return t.descriptionKey.slice(8);
  }));
  ok(keys.length===39&&new Set(keys).size===39,'expected original keys');
  ok(Object.keys(doc).length===39&&Object.keys(doc).every(k=>keys.includes(k)),'untrusted or omitted keys');
  const locales=['ja','en-US','fr','it','de','es','pt-BR','zh-CN'];
  for(const descriptions of Object.values(doc)){
    ok(descriptions!==null&&typeof descriptions==='object'&&!Array.isArray(descriptions)
      &&Object.keys(descriptions).length===8&&locales.every(k=>Object.hasOwn(descriptions,k)),'eight locale coverage');
    for(const value of Object.values(descriptions)){
      ok(typeof value==='string'&&value.length>0&&value.length<=300
        &&!/[\u0000-\u001f<>]/.test(value)&&!value.includes('Liveops.'),'untrusted text');
    }
  }
  return doc;
}
export async function loadStarpathWeeklyLocales(url,starpath,fetcher=fetch){
  const r=await fetcher(url);ok(r.ok,'download failed');
  const b=await r.arrayBuffer();ok(b.byteLength===STARPATH_LOCALES_BYTES,'publication size');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');
  ok(sha===STARPATH_LOCALES_SHA,'publication fingerprint mismatch');
  return verifyStarpathWeeklyLocales(JSON.parse(new TextDecoder().decode(b)),starpath);
}
export function starpathWeeklyDescription(table,key,locale='ja'){
  const target=LIVEOPS_LOCALE[locale];
  if(!target||typeof key!=='string'||!/^Liveops\.[A-Za-z0-9_]+_Description$/.test(key))return null;
  const id=key.slice(8);
  const entry=Object.hasOwn(table||{},id)?table[id]:null;
  return entry?.[target]||null;
}
