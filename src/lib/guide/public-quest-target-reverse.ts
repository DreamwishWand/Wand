/** Steam 1.26.2 public Quest objective Item-ID reverse index.
 * Original Mission 1.26.1 static data independently matches 1.26.2.
 * Candidate references are NOT proof of mandatory requirements, completion,
 * ownership or availability. Alternative lists remain alternatives.
 */
import {verifyPublicQuestIndex} from './public-guide.mjs';

export const DB03_QUEST_TARGET_REVERSE_SCHEMA='wand.db03.public-quest-target-reverse@1' as const;
export const DB03_QUEST_TARGET_REVERSE_FILE='quest-target-reverse-1.26.2.json' as const;
export const DB03_QUEST_TARGET_REVERSE_BYTES=168501 as const;
export const DB03_QUEST_TARGET_REVERSE_SHA='967f1bc885a13ba5bdc99c4e965e1288b9227170f888e0ac85d944799cff6d20' as const;
const SOURCE_INDEX_SHA='5aac453729d05c6de8cbf301b3c9d678c235c96683a739ab87dbc5d5f70e0f69';
const SOURCE_MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const SOURCE_PARTS=Object.freeze([
  'e0ae3e567ea4e43daf938d09a66654b4c831b02f73c5ee858926b6827c9f11d3',
  '843469453d8e1003f068e1059212053d41bafb192bdaac8df676892f89b8e5f9',
  '3c77b003491bf2acd51530b8917a54ac13024604cbe061f3bf325031c05735c6',
  '3959e12a0cd9c09080af75ce8d5bd4ad8283afc3f6271c0acff2b358358b3d5e',
  '62c5bc4d99ca261b7b62b12b192145569026c00b343013bfa33e33d3d5f2eddc',
  'da10b34160489616a5ada54f78961378110f5fbd83be94a3b7ccf9c51752771b',
  'f6a343aeb15f327b1282f59f72cdb61939036a9ed18fd9acfea7ba6bda4b760d',
  '77975d17f174c8402b0b3506b7e80b4215f32bfe04f48338304079c10a7a6213',
]);
const ID=/^[1-9][0-9]{0,15}$/;
const EMPTY=Object.freeze([]) as readonly QuestTargetItemReference[];
const object=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const good=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<100000;
function check(v:unknown,code:string):asserts v{
  if(!v)throw new TypeError('DB03_QUEST_TARGET_REVERSE_'+code);
}
function normalized(raw:unknown):string|null{
  const id=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  return typeof id==='string'&&ID.test(id)&&Number.isSafeInteger(Number(id))?id:null;
}
export type QuestTargetItemRole='direct'|'alternative';
export interface QuestTargetItemReference {
  readonly itemId:string;
  readonly questId:string;
  /** Source zero-based location within the original Quest steps. */
  readonly step:number;
  readonly subStep:number;
  readonly objectiveIndex:number;
  readonly selectorIndex:number;
  readonly candidateIndex:number;
  readonly role:QuestTargetItemRole;
  readonly sourceCandidateOnly:true;
  readonly mandatoryRequirementVerified:false;
  readonly playerProgressVerified:false;
}
export interface PublicQuestTargetReverseReader {
  readonly schema:typeof DB03_QUEST_TARGET_REVERSE_SCHEMA;
  readonly coverage:Readonly<{
    knownQuests:733; sourceTargetObjectives:4869; sourceCandidateOccurrences:4897;
    distinctItemIds:2551; distinctQuestsWithTargetObjectives:639;
    distinctQuestsWithExplicitCandidates:627;
    directOccurrences:4641; alternativeOccurrences:256;
    mandatoryRequirementVerified:false;playerProgressVerified:false;
  }>;
  getItemCandidates(raw:unknown):readonly QuestTargetItemReference[];
  getQuestCandidates(questId:string):readonly QuestTargetItemReference[];
  getItemQuestIds(raw:unknown):readonly string[];
}
type Row=[string,number,number,number,number,number,number];
function isRow(raw:unknown):raw is Row{
  return Array.isArray(raw)&&raw.length===7&&normalized(raw[0])===raw[0]&&
    raw.slice(1,6).every(good)&&(raw[6]===0||raw[6]===1);
}
/** Requires an already checked public Quest catalogue; the loader pins bytes. */
export function verifyPublicQuestTargetReverse(raw:unknown,catalog:unknown):PublicQuestTargetReverseReader{
  const quests=verifyPublicQuestIndex(catalog);
  const known=new Set<string>(quests.quests.map((q:{id:string})=>q.id));
  check(object(raw)&&raw.schema===DB03_QUEST_TARGET_REVERSE_SCHEMA&&
    object(raw.target)&&raw.target.platform==='Steam'&&raw.target.gameVersion==='1.26.2',
    'TARGET');
  const source=raw.source;
  check(object(source)&&source.originalMissionVersion==='1.26.1'&&
    source.originalMissionSha256===SOURCE_MISSION_SHA&&
    source.targetIndexSha256===SOURCE_INDEX_SHA&&
    source.originalSourceCandidatesOnly===true&&source.playerRequirementOrProgressVerified===false&&
    Array.isArray(source.targetPartSha256)&&source.targetPartSha256.length===8&&
    source.targetPartSha256.every((s:unknown,i:number)=>s===SOURCE_PARTS[i]),'PROVENANCE');
  const c=raw.counts;
  check(object(c)&&c.knownQuests===733&&c.sourceTargetObjectives===4869&&
    c.sourceCandidateOccurrences===4897&&c.distinctItemIds===2551&&
    c.distinctQuestsWithTargetObjectives===639&&
    c.distinctQuestsWithExplicitCandidates===627&&c.directOccurrences===4641&&
    c.alternativeOccurrences===256&&object(raw.items)&&
    Object.keys(raw.items).length===2551,'CENSUS');
  const byItem=new Map<string,readonly QuestTargetItemReference[]>();
  const byQuest=new Map<string,QuestTargetItemReference[]>();
  const unique=new Set<string>();
  const questSet=new Set<string>();
  let total=0,direct=0,alternative=0;
  for(const [itemId,list] of Object.entries(raw.items)){
    check(normalized(itemId)===itemId&&Array.isArray(list)&&list.length>0,'ITEM_ID');
    const rows:QuestTargetItemReference[]=[];
    for(const v of list){
      check(isRow(v)&&known.has(v[0]),'OBJECTIVE_ROW');
      const [questId,step,subStep,objectiveIndex,selectorIndex,candidateIndex,roleFlag]=v;
      const key=[questId,step,subStep,objectiveIndex,selectorIndex,candidateIndex].join(':');
      check(!unique.has(key),'DUPLICATE_SOURCE_POSITION');unique.add(key);
      const role=roleFlag===0?'direct' as const:'alternative' as const;
      if(roleFlag===0)direct++;else alternative++;
      questSet.add(questId);
      const ref:QuestTargetItemReference=Object.freeze({itemId,questId,step,subStep,objectiveIndex,
        selectorIndex,candidateIndex,role,sourceCandidateOnly:true as const,
        mandatoryRequirementVerified:false as const,playerProgressVerified:false as const});
      rows.push(ref);
      const all=byQuest.get(questId)??[];all.push(ref);byQuest.set(questId,all);
      total++;
    }
    byItem.set(itemId,Object.freeze(rows));
  }
  check(total===4897&&direct===4641&&alternative===256&&
    questSet.size===627&&unique.size===4897,'RECOMPUTED_CENSUS');
  for(const [id,rows] of byQuest)byQuest.set(id,Object.freeze(rows) as QuestTargetItemReference[]);
  const coverage=Object.freeze({knownQuests:733 as const,sourceTargetObjectives:4869 as const,
    sourceCandidateOccurrences:4897 as const,distinctItemIds:2551 as const,
    distinctQuestsWithTargetObjectives:639 as const,
    distinctQuestsWithExplicitCandidates:627 as const,directOccurrences:4641 as const,
    alternativeOccurrences:256 as const,mandatoryRequirementVerified:false as const,
    playerProgressVerified:false as const});
  return Object.freeze({schema:DB03_QUEST_TARGET_REVERSE_SCHEMA,coverage,
    getItemCandidates:(raw:unknown)=>byItem.get(normalized(raw)??'')??EMPTY,
    getQuestCandidates:(id:string)=>byQuest.get(id)??EMPTY,
    getItemQuestIds:(raw:unknown)=>{
      const rows=byItem.get(normalized(raw)??'')??EMPTY;
      return Object.freeze([...new Set(rows.map(ref=>ref.questId))]);
    }
  });
}
export async function loadPublicQuestTargetReverse(
  catalog:unknown,url:string,fetcher:typeof fetch=fetch
):Promise<PublicQuestTargetReverseReader>{
  check(typeof url==='string'&&url.length>0&&url.length<2048,'URL');
  const response=await fetcher(url);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB03_QUEST_TARGET_REVERSE_BYTES,'BYTES');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(sha===DB03_QUEST_TARGET_REVERSE_SHA,'SHA');
  return verifyPublicQuestTargetReverse(
    JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),catalog);
}
export function guideQuestTargetItemHref(rawId:unknown,base=''):string|null{
  const itemId=normalized(rawId);
  if(!itemId)return null;
  check(typeof base==='string'&&/^\/?(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(base),'BASE');
  const root=base.replace(/^\/+|\/+$/g,'');
  return (root?'/'+root:'')+'/guide/quests/?target='+itemId;
}
