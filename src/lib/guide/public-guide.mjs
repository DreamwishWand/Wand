/** Public, factual Quest Guide projections. No local file chooser, uploads or live-state evaluation. */
export const PUBLIC_GUIDE_INDEX_SCHEMA = 'wand.db03.public-guide-quests@1';
export const PUBLIC_GUIDE_DETAIL_SCHEMA = 'wand.db03.public-guide-details@1';
export const PUBLIC_GUIDE_LOCALES = Object.freeze(['ja','en','fr','it','de','es-ES','zh-CN','pt-BR']);
/** Display only: flatten known in-game formatting tags without executing HTML
 * or inventing unresolved {ItemName}/{TargetAmount} values.
 */
export function formatPublicGuideText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<nbsp>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<\/?(?:ActivityItem|nobr|smallcaps)>/gi, '')
    .replace(/[\u200b\u00ad]/g, '')
    .trim();
}

const ID = /^[1-9]\d{0,15}$/;
const HASH = /^[a-f0-9]{64}$/;
function assert(ok, msg) { if(!ok) throw new TypeError('Public Guide: '+msg); }
function plain(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function translated(v) { return plain(v) && Object.entries(v).every(([k,s]) => PUBLIC_GUIDE_LOCALES.includes(k) && typeof s==='string' && s.length>0 && s.length<=480); }
function source(doc, schema) {return plain(doc) && doc.schema === schema && doc.target?.platform==='Steam' && doc.target?.gameVersion==='1.26.2' && doc.provenance?.originalProjectionVersion==='1.26.1' && doc.provenance?.missionFullFileSha256==='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24' && doc.provenance?.sourceIsStaticNotPlayerProgress===true;}
export function verifyPublicQuestIndex(index) {
  assert(source(index, PUBLIC_GUIDE_INDEX_SCHEMA),'unsupported original-source quest catalogue');
  assert(index.counts?.quests===733 && index.counts?.steps===7878 && index.counts?.objectives===11782 && index.counts?.detailParts===8,'source census mismatch');
  assert(Array.isArray(index.quests) && index.quests.length===733 && plain(index.detailFiles),'missing quest records');
  const expected=Array.from({length:8},(_,i)=>`quest-details-${String(i).padStart(2,'0')}.json`);
  assert(Object.keys(index.detailFiles).length===8 && expected.every(name=>HASH.test(index.detailFiles[name]?.sha256) && index.detailFiles[name]?.bytes>0 && index.detailFiles[name]?.bytes<2000000),'invalid detail SHA manifest');
  assert(plain(index.characters) && plain(index.groups),'missing source labels');
  const ids=new Set();
  for(const r of index.quests) {
    assert(plain(r) && typeof r.id==='string' && ID.test(r.id) && !ids.has(r.id) && translated(r.names) ,'bad or duplicate quest');
    assert(Number.isInteger(r.detailPart) && r.detailPart>=0 && r.detailPart<8,'invalid quest detail part');
    assert(Array.isArray(r.objectiveKinds) && r.objectiveKinds.every(x=>typeof x==='string' && x.length<100),'invalid objective types');
    assert(Array.isArray(r.scope) && r.scope.every(x=>typeof x==='string' && x.length<200),'invalid scope');
    ids.add(r.id);
  }
  return index;
}
/** Resolve a shareable quest URL only after the complete public index is verified.
 * Unknown, malformed or duplicate quest IDs never select unrelated content.
 * The link identifies a static source quest, not player unlock/progress state.
 */
export function findPublicQuestByLink(index,search='') {
  verifyPublicQuestIndex(index);
  if(typeof search!=='string'||search.length>2048)return null;
  const ids=new URLSearchParams(search).getAll('quest');
  if(ids.length!==1||!ID.test(ids[0]))return null;
  return index.quests.find(row=>row.id===ids[0])||null;
}
/** Native Mission prefix classification, not a runtime friendship prerequisite. */
export function publicQuestSection(row) {
  const prefix=typeof row?.internalName==='string'?row.internalName.split('!')[0]:'';
  if(prefix==='Story'||prefix==='Realm')return 'story';
  if(prefix==='Village')return 'friendship';
  return 'other';
}
export function filterPublicQuests(index,{query='',locale='ja',character='',objective='',section='all',offset=0,limit=40}={}) {
  verifyPublicQuestIndex(index);
  assert(PUBLIC_GUIDE_LOCALES.includes(locale) && typeof query==='string' && query.length<=120 && typeof character==='string' && typeof objective==='string' && ['all','story','friendship','other'].includes(section) && Number.isInteger(offset) && offset>=0 && Number.isInteger(limit) && limit>0 && limit<=100,'invalid search');
  const words=query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matched=index.quests.filter(r=>{
    if(section!=='all'&&publicQuestSection(r)!==section)return false;
    if(character && r.characterId!==character)return false;
    if(objective && !r.objectiveKinds.includes(objective))return false;
    if(!words.length)return true;
    const labels=[r.id,r.internalName||'',...Object.values(r.names),...Object.values(index.characters[r.characterId]||{})].join(' ').normalize('NFKC').toLowerCase();
    return words.every(w=>labels.includes(w));
  });
  matched.sort((a,b)=> (a.names[locale]||a.names.en||a.id).localeCompare(b.names[locale]||b.names.en||b.id,locale==='ja'?'ja':'en')||a.id.localeCompare(b.id));
  return {total:matched.length,rows:matched.slice(offset,offset+limit)};
}
export function verifyPublicQuestPart(index,part,partNumber) {
  verifyPublicQuestIndex(index);
  assert(Number.isInteger(partNumber) && partNumber>=0 && partNumber<8,'part number');
  assert(source(part,PUBLIC_GUIDE_DETAIL_SCHEMA) && part.part===partNumber && Array.isArray(part.quests),'wrong quest part');
  const byId=new Map(index.quests.map(r=>[r.id,r]));const seen=new Set();
  for(const q of part.quests) {
    assert(plain(q)&&typeof q.id==='string'&&byId.get(q.id)?.detailPart===partNumber&&!seen.has(q.id),'foreign/duplicate quest detail');
    assert(Number.isInteger(q.objectiveCount)&&q.objectiveCount>=0&&Array.isArray(q.steps),'bad detail census');
    let objectives=0;
    for(const step of q.steps){
      assert(plain(step) && Number.isInteger(step.index) && Array.isArray(step.subSteps) && (step.text===undefined||translated(step.text)),'invalid source step');
      for(const sub of step.subSteps){
        assert(plain(sub)&&Array.isArray(sub.objectives),'invalid source substep');
        for(const o of sub.objectives){assert(plain(o)&&typeof o.type==='string'&&o.type.length<120&&(o.text===undefined||translated(o.text)),'invalid objective text');objectives++;}
      }
    }
    assert(objectives===q.objectiveCount,'objective census mismatch');seen.add(q.id);
  }
  assert(seen.size===index.quests.filter(q=>q.detailPart===partNumber).length,'missing quest details');
  return part;
}
export async function loadPublicQuestPart(index,partNumber,url,fetcher=fetch) {
  verifyPublicQuestIndex(index);
  const name=`quest-details-${String(partNumber).padStart(2,'0')}.json`;
  const expected=index.detailFiles[name];assert(expected && typeof url==='string','missing detail file');
  const res=await fetcher(url);assert(res.ok,'detail download failed');
  const bytes=await res.arrayBuffer();assert(bytes.byteLength===expected.bytes,'detail byte-size mismatch');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  assert(sha===expected.sha256,'detail fingerprint mismatch');
  return verifyPublicQuestPart(index,JSON.parse(new TextDecoder().decode(bytes)),partNumber);
}
