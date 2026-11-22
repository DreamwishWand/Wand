/** Public Steam v1.26.2 cached Star Path snapshot; never evaluate live state. */
export const STARPATH_CACHE_SCHEMA='wand.db03.public-starpath-cache@1';
export const STARPATH_SOURCE_SHA='4168d6ec580b04893f701dec5f0509589d39fb2e838d08bac724a9720caecf14';
export const STARPATH_PUBLIC_SHA='78819b4d36042e3c60b576583149e58541d3ca297fa0c3ba8a9a775009614198';
const assert=(ok,msg)=>{if(!ok)throw new TypeError('Public Star Path: '+msg)};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const ID=/^[1-9][0-9]{0,15}$/;
export function verifyPublicStarpath(data){
  assert(record(data)&&data.schema===STARPATH_CACHE_SCHEMA,'schema');
  assert(data.source?.fileSha256===STARPATH_SOURCE_SHA&&data.source?.sourceBytes===186442
    &&data.source?.platform==='Steam'&&data.source?.ownerDeclaredGameVersion==='1.26.2'
    &&data.source?.cacheCaptureDate==='2026-11-22'
    &&data.source?.liveAvailabilityVerified===false&&data.source?.seasonCatalogComplete===false,'provenance');
  assert(Array.isArray(data.seasons)&&data.seasons.length===2,'seasons');
  const ids=['HauntingElegance2026','Seafaring2026'];
  const expected=[[6,4,34,9,7,121,21,7],[2,1,10,1,6,25,18,6]];
  for(let i=0;i<2;i++){
    const s=data.seasons[i],c=s?.counts;
    assert(s?.id===ids[i]&&typeof s.title==='string'&&s.title.length>0&&s.locale==='en-US'
      &&s.definitionVersion===12602&&typeof s.startUtc==='string'
      &&s.startUtc<s.finishUtcExclusive&&s.finishUtcExclusive<s.endUtcExclusive,'season identity');
    assert([c?.rewardPages,c?.bonusPages,c?.normalRewards,c?.bonusRewards,c?.vaultRewards,c?.dailyTasks,c?.weeklyTasks,c?.weeks]
      .every((v,j)=>v===expected[i][j]),'season census');
    assert(Array.isArray(s.rewardPages)&&s.rewardPages.length===c.rewardPages
      &&Array.isArray(s.bonusPages)&&s.bonusPages.length===c.bonusPages
      &&Array.isArray(s.vaultRewards)&&s.vaultRewards.length===c.vaultRewards
      &&Array.isArray(s.tasks)&&s.tasks.length===c.dailyTasks
      &&Array.isArray(s.weeklyTasks)&&s.weeklyTasks.length===c.weeks,'season collections');
    for(const p of [...s.rewardPages,...s.bonusPages]){
      assert(Array.isArray(p.rewards),'reward page');
      for(const r of p.rewards)assert(record(r)&&ID.test(r.itemId)&&Number.isSafeInteger(r.amount)&&r.amount>0&&
        typeof r.premium==='boolean'&&typeof r.bonus==='boolean'&&typeof r.recurrent==='boolean','reward');
    }
    for(const r of s.vaultRewards)assert(record(r)&&ID.test(r.itemId),'vault reward');
    const weekly=s.weeklyTasks.flat(),tasks=[...s.tasks,...weekly];
    assert(weekly.length===c.weeklyTasks,'weekly census');
    assert(tasks.every(t=>record(t)&&typeof t.id==='string'&&typeof t.objectiveKind==='string'&&
      Number.isSafeInteger(t.tokenReward)&&t.tokenReward>=0&&
      (t.description===null||typeof t.description==='string')&&
      (t.descriptionKey===null||typeof t.descriptionKey==='string')),'task');
    assert(weekly.every(t=>t.description===null&&t.descriptionKey?.startsWith('Liveops.')),'unresolved localization');
  }
  return data;
}
export async function loadPublicStarpath(url,fetcher=fetch){
  const response=await fetcher(url);assert(response.ok,'download failed');
  const raw=await response.arrayBuffer();assert(raw.byteLength===34617,'publication size mismatch');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  assert(hash===STARPATH_PUBLIC_SHA,'publication fingerprint mismatch');
  return verifyPublicStarpath(JSON.parse(new TextDecoder().decode(raw)));
}
