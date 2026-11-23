/** Source-derived, local-only Steam v1.26.2 Quest Guide.
 *
 * Eight public detail partitions originate from the Mission source verified
 * byte-identical across v1.26.1 and v1.26.2. This is a STATIC game catalogue:
 * no player progress, Save upload, server availability or entitlement.
 */
export const PUBLIC_GUIDE_INDEX_SCHEMA='wand.db03.public-guide-quests@1' as const;
export const PUBLIC_GUIDE_DETAIL_SCHEMA='wand.db03.public-guide-details@1' as const;
export const PUBLIC_GUIDE_LOCALES=Object.freeze([
  'ja','en','fr','it','de','es-ES','zh-CN','pt-BR'
] as const);
export type PublicGuideLocale=typeof PUBLIC_GUIDE_LOCALES[number];
export type PublicQuestSection='all'|'story'|'friendship'|'other';
export type PublicGuideNames=Readonly<Partial<Record<PublicGuideLocale,string>>>;
export const PUBLIC_GUIDE_SOURCE_SHA=
  'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24' as const;
const LOCALES=new Set<string>(PUBLIC_GUIDE_LOCALES);
const SECTION=new Set<string>(['all','story','friendship','other']);
const ID=/^[1-9]\d{0,15}$/;
const HASH=/^[a-f0-9]{64}$/;

export interface PublicGuideProvenance {
  readonly originalProjectionVersion:'1.26.1';
  readonly missionFullFileSha256:typeof PUBLIC_GUIDE_SOURCE_SHA;
  readonly sourceIsStaticNotPlayerProgress:true;
  readonly eightLocaleOriginalPayloadsIdentical?:true;
  readonly missionSourceIdenticalAcrossVersions?:true;
}
export interface PublicGuideSourceHeader {
  readonly target:Readonly<{platform:'Steam';gameVersion:'1.26.2'}>;
  readonly provenance:PublicGuideProvenance;
}
export interface PublicQuestIndexRow {
  readonly id:string;
  readonly names:PublicGuideNames;
  readonly internalName:string;
  readonly characterId:string;
  readonly groupId:string;
  readonly detailPart:number;
  readonly objectiveKinds:readonly string[];
  readonly scope:readonly string[];
  readonly update:string|null;
}
export interface PublicQuestGroup {
  readonly rawName:string;
  readonly names:PublicGuideNames;
}
export interface PublicQuestFileDigest {
  readonly bytes:number;
  readonly sha256:string;
}
export interface PublicQuestIndex extends PublicGuideSourceHeader {
  readonly schema:typeof PUBLIC_GUIDE_INDEX_SCHEMA;
  readonly counts:Readonly<{
    quests:733;steps:7878;objectives:11782;detailParts:8;
  }>;
  readonly quests:readonly PublicQuestIndexRow[];
  readonly detailFiles:Readonly<Record<string,Readonly<PublicQuestFileDigest>>>;
  readonly characters:Readonly<Record<string,PublicGuideNames>>;
  readonly groups:Readonly<Record<string,Readonly<PublicQuestGroup>>>;
}
export interface PublicQuestObjective {
  readonly type:string;
  readonly text?:PublicGuideNames;
}
export interface PublicQuestSubStep {
  readonly index:number;
  readonly objectives:readonly PublicQuestObjective[];
}
export interface PublicQuestStep {
  readonly index:number;
  readonly text?:PublicGuideNames;
  readonly subSteps:readonly PublicQuestSubStep[];
}
export interface PublicQuestDetailRow {
  readonly id:string;
  readonly objectiveCount:number;
  readonly steps:readonly PublicQuestStep[];
  readonly configuredFriendshipRange?:Readonly<{min:number;max:number}>;
}
export interface PublicQuestPart extends PublicGuideSourceHeader {
  readonly schema:typeof PUBLIC_GUIDE_DETAIL_SCHEMA;
  readonly part:number;
  readonly quests:readonly PublicQuestDetailRow[];
}
export interface PublicQuestSearch {
  readonly query?:string;
  readonly locale?:PublicGuideLocale;
  readonly character?:string;
  readonly objective?:string;
  readonly section?:PublicQuestSection;
  readonly offset?:number;
  readonly limit?:number;
}
export interface PublicQuestResults{
  readonly total:number;
  readonly rows:readonly PublicQuestIndexRow[];
}
type BinaryResponse=Pick<Response,'ok'|'arrayBuffer'>;

function check(ok:unknown,message:string):asserts ok{
  if(!ok)throw new TypeError('Public Guide: '+message);
}
function record(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function canonicalId(value:unknown):value is string{
  return typeof value==='string'&&ID.test(value)&&Number.isSafeInteger(Number(value));
}
function names(value:unknown):value is PublicGuideNames{
  return record(value)&&Object.entries(value).every(([lang,label])=>
    LOCALES.has(lang)&&typeof label==='string'&&label.length>0&&label.length<=480);
}
function source(value:unknown,schema:string):value is Record<string,unknown>{
  if(!record(value)||value.schema!==schema)return false;
  const target=value.target,provenance=value.provenance;
  return record(target)&&target.platform==='Steam'&&
    target.gameVersion==='1.26.2'&&record(provenance)&&
    provenance.originalProjectionVersion==='1.26.1'&&
    provenance.missionFullFileSha256===PUBLIC_GUIDE_SOURCE_SHA&&
    provenance.sourceIsStaticNotPlayerProgress===true;
}
function nativeText(value:unknown,max=240):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=max;
}
function position(value:unknown):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&
    value>=0&&value<100000;
}
function indexRow(value:unknown):value is PublicQuestIndexRow{
  if(!record(value))return false;
  return canonicalId(value.id)&&names(value.names)&&
    nativeText(value.internalName,400)&&
    canonicalId(value.characterId)&&canonicalId(value.groupId)&&
    position(value.detailPart)&&value.detailPart<8&&
    (value.update===null||nativeText(value.update,240))&&
    Array.isArray(value.objectiveKinds)&&
    value.objectiveKinds.every(x=>nativeText(x,99))&&
    Array.isArray(value.scope)&&
    value.scope.every(x=>nativeText(x,199));
}
/** Display-only formatting: strip known native UI markers without executing
 * HTML or inventing any unresolved Item/Target placeholders. */
export function formatPublicGuideText(value:unknown):string{
  if(typeof value!=='string')return '';
  return value.replace(/<nbsp>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,' ')
    .replace(/<\/?(?:ActivityItem|nobr|smallcaps)>/gi,'')
    .replace(/[\u200b\u00ad]/g,'')
    .trim();
}
/** Fail closed for malformed 733-Quest identity, manifest, label and source
 * census. Index is structural source evidence; byte-SHA is enforced on each
 * lazy-loaded detail shard by loadPublicQuestPart. */
export function verifyPublicQuestIndex(data:unknown):PublicQuestIndex{
  check(source(data,PUBLIC_GUIDE_INDEX_SCHEMA),
    'unsupported original-source quest catalogue');
  const counts=data.counts;
  check(record(counts)&&counts.quests===733&&counts.steps===7878&&
    counts.objectives===11782&&counts.detailParts===8,
    'source census mismatch');
  check(Array.isArray(data.quests)&&data.quests.length===733&&
    record(data.detailFiles),'missing quest records');
  const parts=data.detailFiles;
  check(Object.keys(parts).length===8,'invalid detail SHA manifest');
  for(let n=0;n<8;n++){
    const filename='quest-details-'+String(n).padStart(2,'0')+'.json';
    const file=parts[filename];
    check(record(file)&&typeof file.sha256==='string'&&
      HASH.test(file.sha256)&&typeof file.bytes==='number'&&
      Number.isSafeInteger(file.bytes)&&file.bytes>0&&
      file.bytes<2000000,'invalid detail SHA manifest');
  }
  check(record(data.characters)&&record(data.groups)&&
    Object.keys(data.characters).length===142&&
    Object.keys(data.groups).length===289,
    'missing source labels');
  for(const [id,label] of Object.entries(data.characters))
    check(canonicalId(id)&&names(label),'invalid source character label');
  for(const [id,group] of Object.entries(data.groups))
    check(canonicalId(id)&&record(group)&&
      nativeText(group.rawName,400)&&names(group.names),
      'invalid original quest group');
  const seen=new Set<string>();
  for(const quest of data.quests){
    check(indexRow(quest)&&!seen.has(quest.id),'bad or duplicate quest');
    seen.add(quest.id);
    check(Object.hasOwn(data.characters,quest.characterId)&&
      Object.hasOwn(data.groups,quest.groupId),
      'foreign source character/group');
  }
  return data as unknown as PublicQuestIndex;
}
/** Exactly one canonical native quest deep-link; ambiguous URL => no result. */
export function findPublicQuestByLink(
  index:PublicQuestIndex,search:string=''
):PublicQuestIndexRow|null{
  verifyPublicQuestIndex(index);
  if(typeof search!=='string'||search.length>2048)return null;
  const ids=new URLSearchParams(search).getAll('quest');
  if(ids.length!==1||!canonicalId(ids[0]))return null;
  return index.quests.find(row=>row.id===ids[0])??null;
}
/** Native Mission prefixes are only a display classification. */
export function publicQuestSection(
  row:Pick<PublicQuestIndexRow,'internalName'>|null|undefined
):Exclude<PublicQuestSection,'all'>{
  const prefix=typeof row?.internalName==='string'?
    row.internalName.split('!')[0]:'';
  if(prefix==='Story'||prefix==='Realm')return 'story';
  if(prefix==='Village')return 'friendship';
  return 'other';
}
/** Search the verified native Quest names, characters and objective classes.
 * Empty localized Quest names remain unresolved, not guessed. */
export function filterPublicQuests(
  index:PublicQuestIndex,
  {query='',locale='ja',character='',objective='',section='all',offset=0,limit=40}:
    PublicQuestSearch={}
):PublicQuestResults{
  verifyPublicQuestIndex(index);
  check(LOCALES.has(locale)&&typeof query==='string'&&query.length<=120&&
    typeof character==='string'&&typeof objective==='string'&&
    SECTION.has(section)&&position(offset)&&
    Number.isInteger(limit)&&limit>0&&limit<=100,'invalid search');
  const words=query.normalize('NFKC').toLowerCase().trim()
    .split(/\s+/).filter(Boolean);
  const matched=index.quests.filter(row=>{
    if(section!=='all'&&publicQuestSection(row)!==section)return false;
    if(character&&row.characterId!==character)return false;
    if(objective&&!row.objectiveKinds.includes(objective))return false;
    if(words.length===0)return true;
    const characterNames=Object.hasOwn(index.characters,row.characterId)
      ?index.characters[row.characterId]:{};
    const labels=[
      row.id,row.internalName,...Object.values(row.names),
      ...Object.values(characterNames)
    ].join(' ').normalize('NFKC').toLowerCase();
    return words.every(word=>labels.includes(word));
  });
  matched.sort((a,b)=>
    (a.names[locale]||a.names.en||a.id)
      .localeCompare(b.names[locale]||b.names.en||b.id,
        locale==='ja'?'ja':'en')||
    a.id.localeCompare(b.id));
  return {total:matched.length,rows:matched.slice(offset,offset+limit)};
}
/** Check one original source-aligned 0..7 shard, including 1:1 Quest
 * membership and per-Quest objective counts. Content is not player state. */
export function verifyPublicQuestPart(
  index:PublicQuestIndex,part:unknown,partNumber:number
):PublicQuestPart{
  verifyPublicQuestIndex(index);
  check(Number.isInteger(partNumber)&&partNumber>=0&&partNumber<8,
    'part number');
  check(source(part,PUBLIC_GUIDE_DETAIL_SCHEMA)&&
    part.part===partNumber&&Array.isArray(part.quests),
    'wrong quest part');
  const expected=new Map(index.quests.map(row=>[row.id,row.detailPart]));
  const seen=new Set<string>();
  for(const raw of part.quests){
    check(record(raw)&&canonicalId(raw.id)&&
      expected.get(raw.id)===partNumber&&!seen.has(raw.id),
      'foreign/duplicate quest detail');
    check(typeof raw.objectiveCount==='number'&&
      Number.isSafeInteger(raw.objectiveCount)&&raw.objectiveCount>=0&&
      Array.isArray(raw.steps),'bad detail census');
    let count=0;
    for(const step of raw.steps){
      check(record(step)&&position(step.index)&&
        Array.isArray(step.subSteps)&&
        (step.text===undefined||names(step.text)),
        'invalid source step');
      for(const sub of step.subSteps){
        check(record(sub)&&position(sub.index)&&
          Array.isArray(sub.objectives),'invalid source substep');
        for(const objective of sub.objectives){
          check(record(objective)&&typeof objective.type==='string'&&
            objective.type.length<120&&
            (objective.text===undefined||names(objective.text)),
            'invalid objective text');
          count++;
        }
      }
    }
    if(raw.configuredFriendshipRange!==undefined){
      const range=raw.configuredFriendshipRange;
      check(record(range)&&position(range.min)&&position(range.max)&&
        range.min<=range.max,'invalid friendship range');
    }
    check(count===raw.objectiveCount,'objective census mismatch');
    seen.add(raw.id);
  }
  check(seen.size===index.quests.filter(row=>
    row.detailPart===partNumber).length,'missing quest details');
  return part as unknown as PublicQuestPart;
}
/** Verify byte count + full SHA-256 BEFORE decoding public Quest detail JSON. */
export async function loadPublicQuestPart(
  index:PublicQuestIndex,partNumber:number,url:string,
  fetcher:(url:string)=>Promise<BinaryResponse>=fetch
):Promise<PublicQuestPart>{
  verifyPublicQuestIndex(index);
  check(Number.isInteger(partNumber)&&partNumber>=0&&partNumber<8,
    'part number');
  const filename='quest-details-'+String(partNumber).padStart(2,'0')+'.json';
  const expected=index.detailFiles[filename];
  check(expected&&typeof url==='string','missing detail file');
  const response=await fetcher(url);
  check(response.ok,'detail download failed');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===expected.bytes,'detail byte-size mismatch');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(value=>value.toString(16).padStart(2,'0')).join('');
  check(hash===expected.sha256,'detail fingerprint mismatch');
  return verifyPublicQuestPart(index,
    JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),
    partNumber);
}
