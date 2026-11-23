/** Source-authenticated Steam 1.26.2 Quest Item selector overlays.
 * Source data describes static candidates, never a mandatory player inventory
 * requirement, ownership, completed objective, or guaranteed reward.
 */
import {collectionItemHref} from '../collection/item-permalink.ts';

export const GUIDE_TARGET_INDEX_SCHEMA='wand.db03.public-quest-targets@1' as const;
export const GUIDE_TARGET_PART_SCHEMA='wand.db03.public-quest-targets-part@1' as const;
const SOURCE_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const BUNDLE_SHA='9dcf0efbeb4b70fcf4222a295a43690ae6a04fb1ee12a169dc8031f062600d6f';
const PUBLIC_ITEM_INDEX_SHA='06912b156823d920d1b3a2b937ebff3d06e1ca670043db616c907c683b46599f';
const LOCALES=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'] as const;
type NativeLocale=typeof LOCALES[number];
const LANGUAGES=new Set<string>(LOCALES);
const ID=/^[1-9][0-9]{0,15}$/;
const SHA=/^[a-f0-9]{64}$/;

export interface PublicQuestTargetIndex{
  readonly schema:typeof GUIDE_TARGET_INDEX_SCHEMA;
  readonly target:Readonly<{platform:'Steam';gameVersion:'1.26.2'}>;
  readonly source:Readonly<{
    missionSha256:string;privateBundleSha256:string;
    originalProjectionVersion:'1.26.1';staticConfigurationOnly:true;
  }>;
  readonly counts:Readonly<{
    quests:733;targetObjectives:4869;candidateOccurrences:4897;
    uniqueCandidateIds:2551;parts:8;
    verifiedPublicItemNames:2059;unresolvedPublicItemNames:492;
  }>;
  readonly partFiles:Readonly<Record<string,Readonly<{bytes:number;sha256:string}>>>;
  readonly itemNamesSource:Readonly<{
    release:'steam-1.26.2-native-itemlist-v1';
    releaseIndexSha256:string;verifiedNamesOnly:true;
  }>;
  readonly itemNames:Readonly<Record<string,Readonly<Partial<Record<NativeLocale,string>>>>>;
}
export type QuestItemCandidateRole='direct'|'alternative';
export interface PublicQuestTargetCandidate{
  readonly id:string;readonly role:QuestItemCandidateRole;
}
export interface PublicQuestTargetSelector{
  readonly role:string;
  readonly kind:'any'|'selector';
  readonly mode:'item'|'itemList'|'itemGenerator'|'filterGenerator'|'unresolved';
  readonly candidates:readonly PublicQuestTargetCandidate[];
}
export interface PublicQuestTargetAmount{
  readonly kind:'value'|'range'|'dynamic';
  readonly value?:number;readonly min?:number;readonly max?:number;
}
export interface PublicQuestTargetEntry{
  readonly step:number;readonly sub:number;readonly objective:number;
  readonly type:string;
  readonly selectors:readonly PublicQuestTargetSelector[];
  readonly amount?:PublicQuestTargetAmount;
}
export interface PublicQuestTargetPart{
  readonly part:number;
  readonly quests:Readonly<Record<string,readonly PublicQuestTargetEntry[]>>;
  readonly targetObjectives:number;
  readonly candidateOccurrences:number;
}
interface SourceQuestDetail{
  readonly id:string;
  readonly steps:readonly {
    readonly subSteps:readonly {readonly objectives:readonly {readonly type:string}[]}[];
  }[];
}
type SourceDetails={readonly part:number;readonly quests:readonly SourceQuestDetail[]};
type ByteResponse=Pick<Response,'ok'|'arrayBuffer'>;
type JsonResponse=Pick<Response,'ok'|'json'>;

function check(value:unknown,message:string):asserts value{
  if(!value)throw new TypeError('Public Guide targets: '+message);
}
function record(v:unknown):v is Record<string,unknown>{
  return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function canonicalId(value:unknown):value is string{
  return typeof value==='string'&&ID.test(value)&&
    Number.isSafeInteger(Number(value));
}
function provenance(doc:Record<string,unknown>):boolean{
  const s=doc.source;
  return record(s)&&s.missionSha256===SOURCE_SHA&&
    s.privateBundleSha256===BUNDLE_SHA&&
    s.originalProjectionVersion==='1.26.1'&&
    s.staticConfigurationOnly===true;
}
function validPosition(value:unknown):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&
    value>=0&&value<100000;
}
function validAmount(value:unknown):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
}

/** Validate the authenticated public index and all eight partition hashes. */
export function verifyPublicQuestTargetsIndex(doc:unknown):PublicQuestTargetIndex{
  check(record(doc)&&doc.schema===GUIDE_TARGET_INDEX_SCHEMA&&
    record(doc.target)&&doc.target.platform==='Steam'&&
    doc.target.gameVersion==='1.26.2'&&provenance(doc),
    'untrusted original-source overlay');
  const counts=doc.counts;
  check(record(counts)&&counts.quests===733&&counts.targetObjectives===4869&&
    counts.candidateOccurrences===4897&&counts.uniqueCandidateIds===2551&&
    counts.parts===8,'source census mismatch');
  check(record(doc.partFiles)&&Object.keys(doc.partFiles).length===8,
    'missing item target parts');
  for(let i=0;i<8;i++){
    const file=doc.partFiles['quest-targets-'+String(i).padStart(2,'0')+'.json'];
    check(record(file)&&typeof file.sha256==='string'&&SHA.test(file.sha256)&&
      typeof file.bytes==='number'&&Number.isSafeInteger(file.bytes)&&
      file.bytes>0&&file.bytes<1000000,'invalid overlay sha/size');
  }
  const namesSource=doc.itemNamesSource;
  check(record(doc.itemNames)&&record(namesSource)&&
    namesSource.release==='steam-1.26.2-native-itemlist-v1'&&
    namesSource.releaseIndexSha256===PUBLIC_ITEM_INDEX_SHA&&
    namesSource.verifiedNamesOnly===true,'unverified item name source');
  check(counts.verifiedPublicItemNames===2059&&
    counts.unresolvedPublicItemNames===492,'item name coverage mismatch');
  check(Object.keys(doc.itemNames).length===2059,'item name census mismatch');
  for(const [id,names] of Object.entries(doc.itemNames)){
    check(canonicalId(id)&&record(names)&&
      Object.keys(names).every(locale=>LANGUAGES.has(locale)&&
        typeof names[locale]==='string'&&
        (names[locale] as string).length>0&&
        (names[locale] as string).length<=240),'bad normalized item name');
  }
  return doc as unknown as PublicQuestTargetIndex;
}
function validateDetails(details:unknown,number:number):Map<string,SourceQuestDetail>{
  check(record(details)&&details.part===number&&Array.isArray(details.quests),
    'original quest details missing');
  const quests=new Map<string,SourceQuestDetail>();
  for(const item of details.quests){
    check(record(item)&&canonicalId(item.id)&&
      Array.isArray(item.steps)&&!quests.has(item.id),
      'original quest details missing');
    quests.set(item.id,item as unknown as SourceQuestDetail);
  }
  return quests;
}
/** Verify each source selector at its original Quest step/objective position.
 * Alternative and dynamic/filter candidates remain explicitly non-mandatory.
 */
export function verifyPublicQuestTargetsPart(
  index:unknown,part:unknown,number:number,publicDetails:unknown
):PublicQuestTargetPart{
  verifyPublicQuestTargetsIndex(index);
  check(Number.isInteger(number)&&number>=0&&number<8,'part number');
  check(record(part)&&part.schema===GUIDE_TARGET_PART_SCHEMA&&
    part.part===number&&provenance(part)&&record(part.quests),
    'wrong item target partition');
  const byQuest=validateDetails(publicDetails,number);
  let rows=0,candidates=0;
  for(const [id,entries] of Object.entries(part.quests)){
    check(canonicalId(id)&&byQuest.has(id)&&
      Array.isArray(entries)&&entries.length>0,'foreign quest target');
    const quest=byQuest.get(id)!;
    const seen=new Set<string>();
    for(const entry of entries){
      check(record(entry)&&validPosition(entry.step)&&
        validPosition(entry.sub)&&validPosition(entry.objective),
        'invalid target location');
      const original=quest.steps[entry.step]?.subSteps?.[entry.sub]
        ?.objectives?.[entry.objective];
      check(original?.type===entry.type,'original quest objective type mismatch');
      const key=entry.step+':'+entry.sub+':'+entry.objective;
      check(!seen.has(key),'duplicate objective target');seen.add(key);
      check(Array.isArray(entry.selectors),'missing selectors');
      for(const sel of entry.selectors){
        check(record(sel)&&typeof sel.role==='string'&&sel.role.length<64&&
          (sel.kind==='any'||sel.kind==='selector')&&
          (sel.mode==='item'||sel.mode==='itemList'||sel.mode==='itemGenerator'||
           sel.mode==='filterGenerator'||sel.mode==='unresolved')&&
          Array.isArray(sel.candidates),'invalid selector');
        for(const candidate of sel.candidates){
          check(record(candidate)&&canonicalId(candidate.id)&&
            (candidate.role==='direct'||candidate.role==='alternative'),
            'invalid candidate');
          candidates++;
        }
      }
      if(entry.amount!==undefined){
        check(record(entry.amount)&&
          (entry.amount.kind==='value'||entry.amount.kind==='range'||
           entry.amount.kind==='dynamic'),'invalid configured amount');
        for(const field of ['value','min','max'] as const){
          if(entry.amount[field]!==undefined)
            check(validAmount(entry.amount[field]),'bad amount');
        }
      }
      rows++;
    }
  }
  return {
    part:number,
    quests:part.quests as Readonly<Record<string,readonly PublicQuestTargetEntry[]>>,
    targetObjectives:rows,candidateOccurrences:candidates
  };
}
export async function loadPublicQuestTargetsIndex(
  url:string,fetcher:(url:string)=>Promise<JsonResponse>=fetch
):Promise<PublicQuestTargetIndex>{
  const response=await fetcher(url);check(response.ok,'index download failed');
  return verifyPublicQuestTargetsIndex(await response.json());
}
export async function loadPublicQuestTargetsPart(
  index:PublicQuestTargetIndex,number:number,url:string,details:unknown,
  fetcher:(url:string)=>Promise<ByteResponse>=fetch
):Promise<PublicQuestTargetPart>{
  const filename='quest-targets-'+String(number).padStart(2,'0')+'.json';
  const file=verifyPublicQuestTargetsIndex(index).partFiles[filename];
  check(file&&typeof url==='string','target partition not found');
  const response=await fetcher(url);check(response.ok,'partition download failed');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===file.bytes,'partition byte mismatch');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(sha===file.sha256,'partition fingerprint mismatch');
  return verifyPublicQuestTargetsPart(index,
    JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),number,details);
}
/** Unverified native Item names remain null, not guessed translations. */
export function itemTargetName(
  index:PublicQuestTargetIndex|null|undefined,itemId:string,locale:string='ja'
):string|null{
  if(!canonicalId(itemId)||!LANGUAGES.has(locale))return null;
  const names=index?.itemNames?.[itemId];
  return names?.[locale as NativeLocale]||names?.en||null;
}
/** Display-only lookup by exact verified Quest objective location. */
export function originalTargetLookup(
  part:PublicQuestTargetPart,questId:string
):Record<string,readonly PublicQuestTargetEntry[]>{
  const result=Object.create(null) as Record<string,readonly PublicQuestTargetEntry[]>;
  if(!canonicalId(questId))return result;
  for(const row of part.quests[questId]??[])
    result[row.step+':'+row.sub+':'+row.objective]=[row];
  return result;
}

/** Open a source-confirmed DB-00 public Item directly in Collection.
 * Original target candidates alone never establish that an Item exists in
 * the published Item catalogue. Target names are linked only if verified
 * against the exact Steam 1.26.2 release index, never a guessed name.
 */
export function guideQuestTargetCollectionHref(
  index:PublicQuestTargetIndex|null|undefined,rawItemId:unknown,base=''
):string|null{
  if(!index)return null;
  check(index.schema===GUIDE_TARGET_INDEX_SCHEMA&&
    index.target?.platform==='Steam'&&index.target.gameVersion==='1.26.2'&&
    index.counts?.uniqueCandidateIds===2551&&
    index.counts?.verifiedPublicItemNames===2059&&
    index.counts?.unresolvedPublicItemNames===492&&
    index.itemNamesSource?.release==='steam-1.26.2-native-itemlist-v1'&&
    index.itemNamesSource.releaseIndexSha256===PUBLIC_ITEM_INDEX_SHA&&
    index.itemNamesSource.verifiedNamesOnly===true&&
    record(index.itemNames),'Collection link requires source-verified DB-00 Item names');
  const itemId=typeof rawItemId==='number'&&Number.isSafeInteger(rawItemId)?
    String(rawItemId):rawItemId;
  if(!canonicalId(itemId)||!Object.hasOwn(index.itemNames,itemId)||
    !itemTargetName(index,itemId,'en'))return null;
  return collectionItemHref(base,Number(itemId));
}
