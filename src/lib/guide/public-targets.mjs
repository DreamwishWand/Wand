/** Public Guide original-source item selector overlays (static candidate semantics only). */
export const GUIDE_TARGET_INDEX_SCHEMA='wand.db03.public-quest-targets@1';
export const GUIDE_TARGET_PART_SCHEMA='wand.db03.public-quest-targets-part@1';
const SOURCE_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const BUNDLE_SHA='9dcf0efbeb4b70fcf4222a295a43690ae6a04fb1ee12a169dc8031f062600d6f';
const PUBLIC_ITEM_INDEX_SHA='06912b156823d920d1b3a2b937ebff3d06e1ca670043db616c907c683b46599f';
const LOCALES=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'];
const ID=/^[1-9][0-9]{0,15}$/;
const SHA=/^[a-f0-9]{64}$/;
function assert(ok,msg){if(!ok)throw new TypeError('Public Guide targets: '+msg)}
function record(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)}
function validatedSource(doc){return doc?.source?.missionSha256===SOURCE_SHA&&doc?.source?.privateBundleSha256===BUNDLE_SHA&&doc?.source?.originalProjectionVersion==='1.26.1'&&doc?.source?.staticConfigurationOnly===true}

export function verifyPublicQuestTargetsIndex(doc){
  assert(record(doc)&&doc.schema===GUIDE_TARGET_INDEX_SCHEMA&&doc.target?.platform==='Steam'&&doc.target?.gameVersion==='1.26.2'&&validatedSource(doc),'untrusted original-source overlay');
  assert(doc.counts?.quests===733&&doc.counts?.targetObjectives===4869&&doc.counts?.candidateOccurrences===4897&&doc.counts?.uniqueCandidateIds===2551&&doc.counts?.parts===8,'source census mismatch');
  assert(record(doc.partFiles)&&Object.keys(doc.partFiles).length===8,'missing item target parts');
  for(let p=0;p<8;p++){
    const f=doc.partFiles[`quest-targets-${String(p).padStart(2,'0')}.json`];
    assert(SHA.test(f?.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&f.bytes<1000000,'invalid overlay sha/size');
  }
  assert(record(doc.itemNames)&&doc.itemNamesSource?.release==='steam-1.26.2-native-itemlist-v1'&&doc.itemNamesSource?.releaseIndexSha256===PUBLIC_ITEM_INDEX_SHA&&doc.itemNamesSource?.verifiedNamesOnly===true,'unverified item name source');
  assert(doc.counts.verifiedPublicItemNames===2059&&doc.counts.unresolvedPublicItemNames===492,'item name coverage mismatch');
  assert(Object.keys(doc.itemNames).length===2059,'item name census mismatch');
  for(const [id,names] of Object.entries(doc.itemNames)){
    assert(ID.test(id)&&record(names)&&Object.keys(names).every(k=>LOCALES.includes(k)&&typeof names[k]==='string'&&names[k].length>0&&names[k].length<=240),'bad normalized item name');
  }
  return doc;
}

export function verifyPublicQuestTargetsPart(index,part,number,publicDetails){
  verifyPublicQuestTargetsIndex(index);
  assert(Number.isInteger(number)&&number>=0&&number<8,'part number');
  assert(record(part)&&part.schema===GUIDE_TARGET_PART_SCHEMA&&part.part===number&&validatedSource(part)&&record(part.quests),'wrong item target partition');
  assert(publicDetails?.part===number&&Array.isArray(publicDetails.quests),'original quest details missing');
  const byQuest=new Map(publicDetails.quests.map(x=>[x.id,x]));
  let rows=0,candidates=0;
  for(const [id,entries] of Object.entries(part.quests)){
    assert(ID.test(id)&&byQuest.has(id)&&Array.isArray(entries)&&entries.length>0,'foreign quest target');
    const quest=byQuest.get(id),seen=new Set();
    for(const x of entries){
      assert(record(x)&&Number.isInteger(x.step)&&Number.isInteger(x.sub)&&Number.isInteger(x.objective),'invalid target location');
      const original=quest.steps[x.step]?.subSteps[x.sub]?.objectives[x.objective];
      assert(original?.type===x.type,'original quest objective type mismatch');
      const key=`${x.step}:${x.sub}:${x.objective}`;assert(!seen.has(key),'duplicate objective target');seen.add(key);
      assert(Array.isArray(x.selectors),'missing selectors');
      for(const s of x.selectors){
        assert(record(s)&&typeof s.role==='string'&&s.role.length<64&&['any','selector'].includes(s.kind)&&['item','itemList','itemGenerator','filterGenerator','unresolved'].includes(s.mode)&&Array.isArray(s.candidates),'invalid selector');
        for(const c of s.candidates){
          assert(record(c)&&ID.test(c.id)&&['direct','alternative'].includes(c.role),'invalid candidate');
          candidates++;
        }
      }
      if(x.amount!==undefined){
        assert(record(x.amount)&&['value','range','dynamic'].includes(x.amount.kind),'invalid configured amount');
        for(const n of ['value','min','max'])if(x.amount[n]!==undefined)assert(Number.isSafeInteger(x.amount[n])&&x.amount[n]>=0,'bad amount');
      }
      rows++;
    }
  }
  return {part:number,quests:part.quests,targetObjectives:rows,candidateOccurrences:candidates};
}

export async function loadPublicQuestTargetsIndex(url,fetcher=fetch){
  const res=await fetcher(url);assert(res.ok,'index download failed');
  return verifyPublicQuestTargetsIndex(await res.json());
}

export async function loadPublicQuestTargetsPart(index,number,url,details,fetcher=fetch){
  const filename=`quest-targets-${String(number).padStart(2,'0')}.json`;
  const file=verifyPublicQuestTargetsIndex(index).partFiles[filename];assert(file&&typeof url==='string','target partition not found');
  const res=await fetcher(url);assert(res.ok,'partition download failed');
  const raw=await res.arrayBuffer();assert(raw.byteLength===file.bytes,'partition byte mismatch');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(x=>x.toString(16).padStart(2,'0')).join('');
  assert(sha===file.sha256,'partition fingerprint mismatch');
  return verifyPublicQuestTargetsPart(index,JSON.parse(new TextDecoder().decode(raw)),number,details);
}

/** Fixed direct selector names are source candidates, not guaranteed player requirements. */
export function itemTargetName(index,itemId,locale='ja'){
  if(!ID.test(itemId)||!LOCALES.includes(locale))return null;
  const names=index?.itemNames?.[itemId];
  return names?.[locale]||names?.en||null;
}

export function originalTargetLookup(part,questId){
  const lookup=Object.create(null);
  for(const x of part.quests[questId]||[])lookup[`${x.step}:${x.sub}:${x.objective}`]=[x];
  return lookup;
}
