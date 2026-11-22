/**
 * Owner-local DB-03 event/quest/default-friendship reward candidate index.
 *
 * Source bytes remain in private Drive or a user-chosen local File. NEVER ship,
 * auto-fetch, upload, or embed the underlying original game extracts here.
 * Source v1.26.1 and the public Star Path v1.26.2 are not merged as a
 * same-version database; each link retains its original provenance.
 */
import type {QuestItemSourceFlow} from '../acquisition/quest-item-bridge.mjs';
import type {GuideRewardIndex,GuideItemRelation} from './reward-relations';

export const DB03_PRIVATE_REWARD_CONTRACT='wand.db03.private-reward-evidence@1' as const;
export const DB03_PRIVATE_REWARD_SOURCE=Object.freeze({
  eventLinks:{bytes:257544,sha256:'4802d7f6cfd4f72733ceb5c16dd149aa6e724e118bb5795b6c72ad50ebee3b0c'},
  questFlows:{bytes:519368,sha256:'682f5730c614332668ea1b2558622babbc36009d0f6ab305331a9d7091d8ae5a'},
  friendshipDefaults:{bytes:7432,sha256:'4bcb2675ef5152590b9efd67bfa5487cbc2479a31fecf0fab0ad412e1210a9b0'}
} as const);
export type PrivateRewardFamily='mini_event'|'floating_festival'|'quest_intro'|'quest_loot'|'friendship_default';
export type EventRewardFamily='mini_event'|'floating_festival';
export interface PrivateGuideRewardCandidate {
  readonly relationId:string;
  readonly itemId:string;
  /** Native event key, quest ID, or source default friendship level marker. */
  readonly originId:string;
  readonly originFamily:PrivateRewardFamily;
  readonly sourceGameVersion:'1.26.1';
  readonly sourceFile:string;
  readonly sourceDefinitionSha256:string;
  readonly sourceField:string;
  readonly indexMembership:'present'|'not_in_supplied_index'|'present_in_optional_partial_index'|'not_in_optional_partial_index'|'not_applicable';
  readonly amount:number|null;
  readonly level:number|null;
  readonly rewardStage:string|null;
  readonly guaranteedGrant:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly characterSpecificVerified:false;
}
export interface PrivateRewardCoverage {
  readonly eventRewardCandidates:number;
  readonly miniEventCandidates:number;
  readonly festivalCandidates:number;
  readonly questRewardCandidates:number;
  readonly introGrantCandidates:number;
  readonly lootCandidates:number;
  readonly defaultFriendshipRewardCandidates:number;
  readonly sourceGameVersion:'1.26.1';
  readonly sourceIntegrity:'structure_only'|'pinned_original_sha256';
  readonly historicalEventsComplete:false;
  readonly currentAvailabilityVerified:false;
  readonly playerProgressVerified:false;
  readonly characterSpecificRewardsVerified:false;
}
export interface PrivateGuideRewardIndex {
  readonly contract:typeof DB03_PRIVATE_REWARD_CONTRACT;
  readonly coverage:Readonly<PrivateRewardCoverage>;
  readonly candidates:readonly PrivateGuideRewardCandidate[];
  getItemCandidates(itemId:string|number):readonly PrivateGuideRewardCandidate[];
  getEventCandidates(family:EventRewardFamily,eventId:string):readonly PrivateGuideRewardCandidate[];
  getQuestCandidates(questId:string):readonly PrivateGuideRewardCandidate[];
  getDefaultFriendshipCandidates(level?:number):readonly PrivateGuideRewardCandidate[];
}
export type PrivateRewardRaw={
  eventLinks:unknown;
  questFlows:unknown;
  friendshipDefaults:unknown;
};
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[1-9][0-9]{0,15}$/;
const EVENT_KEY=/^[A-Za-z0-9_!-]{1,128}$/;
const EMPTY=Object.freeze([]) as readonly PrivateGuideRewardCandidate[];
const lock=<T extends object>(obj:T):Readonly<T>=>Object.freeze(obj);
const invalid=(code:string):never=>{throw new TypeError('DB03_PRIVATE_REWARD_'+code);};
function ensure(ok:unknown,code:string):asserts ok{if(!ok)invalid(code);}
function object(x:unknown):x is Record<string,unknown>{
  return !!x&&typeof x==='object'&&!Array.isArray(x);
}
function itemId(x:unknown):string{
  const value=typeof x==='number'&&Number.isSafeInteger(x)?String(x):x;
  ensure(typeof value==='string'&&ID.test(value)&&Number.isSafeInteger(Number(value)),'ITEM_ID');
  return value;
}
function sha(x:unknown,field:string):string{
  ensure(typeof x==='string'&&SHA.test(x),'SOURCE_SHA_'+field);
  return x;
}
function bytesOf(input:Uint8Array|ArrayBuffer,size:number):Uint8Array{
  const value=input instanceof ArrayBuffer?new Uint8Array(input):input;
  ensure(value instanceof Uint8Array&&value.byteLength===size,'SOURCE_BYTES');
  return Uint8Array.from(value);
}
async function pinnedFile(input:Uint8Array|ArrayBuffer,kind:keyof typeof DB03_PRIVATE_REWARD_SOURCE):Promise<unknown>{
  const spec=DB03_PRIVATE_REWARD_SOURCE[kind],copy=bytesOf(input,spec.bytes);
  ensure(!!globalThis.crypto?.subtle,'SHA_UNAVAILABLE');
  // WebCrypto's BufferSource requires ArrayBuffer, not an ArrayBufferLike
  // backing store; detach caller-controlled bytes before calculating the hash.
  const sealed=new ArrayBuffer(copy.byteLength);
  new Uint8Array(sealed).set(copy);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',sealed)),
    x=>x.toString(16).padStart(2,'0')).join('');
  ensure(hash===spec.sha256,'SOURCE_DIGEST_'+kind);
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(copy));}
  catch{invalid('SOURCE_JSON_'+kind);}
}

const eventKinds=Object.freeze({
  static_mini_event_reward_candidate:171,
  static_festival_reward_candidate:31
});
const flowKinds=Object.freeze({
  intro_item_grant_candidate:70,
  substep_handoff_definition:293,
  post_mission_cleanup_reference:824,
  additional_reward_loot_candidate:330
});
type EventLink={
  fromFamily:string;fromId:string;toFamily:string;toId:string;
  relationKind:string;sourceField:string;
  targetIndexMembership:string;
  source:{file:string;sha256:string;definitionWireSha256:string;referenceWireSha256:string};
};
type EventFile={
  schema:string;source:string;status:string;itemIndexCoverage:string;
  counts:{total:number;byRelationKind:Record<string,number>};links:EventLink[];
};
type QuestFile={
  schema:string;target:{platform:string;gameVersion:string};
  links:QuestItemSourceFlow[];
};
type FriendshipRow={
  id:string;level:number;nativeRewardId:string;amount:number;
  rewardStage:string;scope:string;
  source:{file:string;sha256:string};
};
type FriendshipFile={
  schema:string;scope:string;target:{platform:string;gameVersion:string};
  records:FriendshipRow[];
};
const SOURCE_PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const SOURCE_FRIENDSHIP='90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22';

/**
 * Structural projection is useful for synthetic tests, but is NOT authenticated
 * until loadPinnedPrivateGuideRewardIndex has checked all exact file digests.
 */
function projectPrivateRewardIndex(data:PrivateRewardRaw,sourceIntegrity:PrivateRewardCoverage['sourceIntegrity']):PrivateGuideRewardIndex{
  ensure(object(data.eventLinks)&&object(data.questFlows)&&object(data.friendshipDefaults),'INPUTS');
  const eventFile=data.eventLinks as unknown as EventFile;
  const questFile=data.questFlows as unknown as QuestFile;
  const friendshipFile=data.friendshipDefaults as unknown as FriendshipFile;
  ensure(eventFile.schema==='wand.db03.guide-event-links@1'&&
    eventFile.source==='archived_verified_protoDb_projection'&&
    eventFile.status==='static_source_links_only_not_live_events_or_player_inventory'&&
    eventFile.counts?.total===381&&Array.isArray(eventFile.links)&&eventFile.links.length===381&&
    eventFile.counts.byRelationKind?.static_mini_event_reward_candidate===171&&
    eventFile.counts.byRelationKind?.static_festival_reward_candidate===31,
    'EVENT_SOURCE_CONTRACT');
  ensure(questFile.schema==='wand.db03.item-flows@1'&&
    questFile.target?.platform==='Steam'&&questFile.target.gameVersion==='1.26.1'&&
    Array.isArray(questFile.links)&&questFile.links.length===1517,
    'QUEST_SOURCE_CONTRACT');
  ensure(friendshipFile.schema==='wand.db03.native-guide@1'&&
    friendshipFile.scope==='default_friendship_levels_only'&&
    friendshipFile.target?.platform==='Steam'&&friendshipFile.target.gameVersion==='1.26.1'&&
    Array.isArray(friendshipFile.records)&&friendshipFile.records.length===16,
    'FRIENDSHIP_SOURCE_CONTRACT');
  const all:PrivateGuideRewardCandidate[]=[];
  const byItem=new Map<string,PrivateGuideRewardCandidate[]>();
  const byEvent=new Map<string,PrivateGuideRewardCandidate[]>();
  const byQuest=new Map<string,PrivateGuideRewardCandidate[]>();
  const byLevel=new Map<number,PrivateGuideRewardCandidate[]>();
  const counters=new Map<string,number>();

  function push(candidate:PrivateGuideRewardCandidate){
    const item=byItem.get(candidate.itemId)??[];
    item.push(candidate);byItem.set(candidate.itemId,item);
    all.push(candidate);
    if(candidate.originFamily==='mini_event'||candidate.originFamily==='floating_festival'){
      const key=candidate.originFamily+':'+candidate.originId;
      const rows=byEvent.get(key)??[];
      rows.push(candidate);byEvent.set(key,rows);
    }else if(candidate.originFamily==='quest_intro'||candidate.originFamily==='quest_loot'){
      const rows=byQuest.get(candidate.originId)??[];
      rows.push(candidate);byQuest.set(candidate.originId,rows);
    }else if(candidate.level!==null){
      const rows=byLevel.get(candidate.level)??[];
      rows.push(candidate);byLevel.set(candidate.level,rows);
    }
  }
  for(const [i,link] of eventFile.links.entries()){
    ensure(object(link)&&typeof link.relationKind==='string','EVENT_LINK');
    counters.set(link.relationKind,(counters.get(link.relationKind)??0)+1);
    if(!Object.hasOwn(eventKinds,link.relationKind))continue;
    const mini=link.relationKind==='static_mini_event_reward_candidate';
    ensure(link.toFamily==='items'&&
      link.fromFamily===(mini?'miniEvents':'floatingFestivals')&&
      EVENT_KEY.test(link.fromId)&&typeof link.sourceField==='string'&&
      link.source?.file==='ddv_Data/StreamingAssets/protoDb.bin'&&
      link.source.sha256===SOURCE_PROTO&&
      sha(link.source.definitionWireSha256,'EVENT_DEFINITION')&&
      sha(link.source.referenceWireSha256,'EVENT_REFERENCE')&&
      ['present_in_optional_partial_index','not_in_optional_partial_index']
        .includes(link.targetIndexMembership),'EVENT_REWARD_PROVENANCE');
    push(lock({
      relationId:'event/'+i,itemId:itemId(link.toId),originId:link.fromId,
      originFamily:mini?'mini_event':'floating_festival',
      sourceGameVersion:'1.26.1',sourceFile:link.source.file,
      sourceDefinitionSha256:link.source.definitionWireSha256,
      sourceField:link.sourceField,
      indexMembership:link.targetIndexMembership as PrivateGuideRewardCandidate['indexMembership'],
      amount:null,level:null,rewardStage:null,
      guaranteedGrant:false,currentAvailabilityVerified:false,
      playerOwnershipVerified:false,characterSpecificVerified:false
    }));
  }
  for(const [kind,count] of Object.entries(eventFile.counts.byRelationKind))
    ensure(counters.get(kind)===count,'EVENT_KIND_CENSUS');
  ensure(counters.size===Object.keys(eventFile.counts.byRelationKind).length,
    'EVENT_UNEXPECTED_KIND');
  const questCounters=new Map<string,number>();
  for(const [i,flow] of questFile.links.entries()){
    ensure(object(flow)&&typeof flow.flowKind==='string','QUEST_FLOW');
    questCounters.set(flow.flowKind,(questCounters.get(flow.flowKind)??0)+1);
    if(flow.flowKind!=='intro_item_grant_candidate'&&
      flow.flowKind!=='additional_reward_loot_candidate')continue;
    ensure(ID.test(flow.questId)&&sha(flow.nativeWireSha256,'QUEST_WIRE')&&
      typeof flow.sourceField==='string'&&flow.sourceField.startsWith('protobuf.')&&
      ['present','not_in_supplied_index'].includes(flow.indexMembership),
      'QUEST_REWARD_PROVENANCE');
    let amount:null|number=null;
    if(flow.configuredAmount!==undefined){
      const raw=flow.configuredAmount;
      if(typeof raw==='number')amount=raw;
      else if(raw?.kind==='value'){
        sha(raw.sourceWireSha256,'AMOUNT_WIRE');amount=raw.value;
      }
      ensure(amount===null||(Number.isSafeInteger(amount)&&amount>=0),'QUEST_AMOUNT');
    }
    push(lock({
      relationId:'quest/'+i,itemId:itemId(flow.itemId),originId:flow.questId,
      originFamily:flow.flowKind==='intro_item_grant_candidate'?'quest_intro':'quest_loot',
      sourceGameVersion:'1.26.1',sourceFile:'ddv_Data/StreamingAssets/itemlist/Mission.json',
      sourceDefinitionSha256:flow.nativeWireSha256,
      sourceField:flow.sourceField,indexMembership:flow.indexMembership,
      amount,level:null,rewardStage:null,
      guaranteedGrant:false,currentAvailabilityVerified:false,
      playerOwnershipVerified:false,characterSpecificVerified:false
    }));
  }
  for(const [kind,count] of Object.entries(flowKinds))
    ensure(questCounters.get(kind)===count,'QUEST_KIND_CENSUS');
  ensure(questCounters.size===Object.keys(flowKinds).length,'QUEST_UNEXPECTED_KIND');
  const stages=['FirstIntermediateReward','SecondIntermediateReward',
    'ThirdIntermediateReward','CompletedReward'];
  for(const [i,reward] of friendshipFile.records.entries()){
    ensure(object(reward)&&typeof reward.id==='string'&&reward.id.length<100&&
      Number.isSafeInteger(reward.level)&&reward.level>=1&&reward.level<=10&&
      Number.isSafeInteger(reward.amount)&&reward.amount>0&&
      stages.includes(reward.rewardStage)&&
      reward.scope==='default_friendship_level_not_character_specific'&&
      reward.source?.file==='ddv_Data/StreamingAssets/friendship_levels_default.json'&&
      reward.source.sha256===SOURCE_FRIENDSHIP,'FRIENDSHIP_REWARD_SOURCE');
    push(lock({
      relationId:'friendship/'+i,itemId:itemId(reward.nativeRewardId),
      originId:'default_friendship_level_'+reward.level,
      originFamily:'friendship_default',sourceGameVersion:'1.26.1',
      sourceFile:reward.source.file,sourceDefinitionSha256:reward.source.sha256,
      sourceField:reward.rewardStage,indexMembership:'not_applicable',
      amount:reward.amount,level:reward.level,rewardStage:reward.rewardStage,
      guaranteedGrant:false,currentAvailabilityVerified:false,
      playerOwnershipVerified:false,characterSpecificVerified:false
    }));
  }
  ensure(all.length===618&&
    all.filter(r=>r.originFamily==='mini_event').length===171&&
    all.filter(r=>r.originFamily==='floating_festival').length===31&&
    all.filter(r=>r.originFamily==='quest_intro').length===70&&
    all.filter(r=>r.originFamily==='quest_loot').length===330&&
    all.filter(r=>r.originFamily==='friendship_default').length===16,
    'CANDIDATE_CENSUS');
  for(const [id,values] of byItem)byItem.set(id,lock(values) as PrivateGuideRewardCandidate[]);
  for(const [id,values] of byEvent)byEvent.set(id,lock(values) as PrivateGuideRewardCandidate[]);
  for(const [id,values] of byQuest)byQuest.set(id,lock(values) as PrivateGuideRewardCandidate[]);
  for(const [id,values] of byLevel)byLevel.set(id,lock(values) as PrivateGuideRewardCandidate[]);
  const coverage=lock({
    eventRewardCandidates:202,miniEventCandidates:171,festivalCandidates:31,
    questRewardCandidates:400,introGrantCandidates:70,lootCandidates:330,
    defaultFriendshipRewardCandidates:16,
    sourceGameVersion:'1.26.1' as const,sourceIntegrity,
    historicalEventsComplete:false as const,currentAvailabilityVerified:false as const,
    playerProgressVerified:false as const,characterSpecificRewardsVerified:false as const
  });
  const rows=lock(all);
  return lock({
    contract:DB03_PRIVATE_REWARD_CONTRACT,
    coverage,candidates:rows,
    getItemCandidates:(id:string|number)=>byItem.get(itemId(id))??EMPTY,
    getEventCandidates:(family:EventRewardFamily,id:string)=>{
      ensure((family==='mini_event'||family==='floating_festival')&&
        typeof id==='string'&&EVENT_KEY.test(id),'EVENT_ID');
      return byEvent.get(family+':'+id)??EMPTY;
    },
    getQuestCandidates:(id:string)=>{
      ensure(typeof id==='string'&&ID.test(id),'QUEST_ID');
      return byQuest.get(id)??EMPTY;
    },
    getDefaultFriendshipCandidates:(level?:number)=>{
      if(level===undefined)return rows.filter(c=>c.originFamily==='friendship_default');
      ensure(Number.isSafeInteger(level)&&level>=1&&level<=10,'FRIENDSHIP_LEVEL');
      return byLevel.get(level)??EMPTY;
    }
  });
}
export function createStructuralPrivateRewardIndex(data:PrivateRewardRaw):PrivateGuideRewardIndex{
  return projectPrivateRewardIndex(data,'structure_only');
}
export async function loadPinnedPrivateGuideRewardIndex(inputs:{
  eventLinks:Uint8Array|ArrayBuffer;
  questFlows:Uint8Array|ArrayBuffer;
  friendshipDefaults:Uint8Array|ArrayBuffer;
}):Promise<PrivateGuideRewardIndex>{
  ensure(object(inputs),'INPUTS');
  const [eventLinks,questFlows,friendshipDefaults]=await Promise.all([
    pinnedFile(inputs.eventLinks,'eventLinks'),
    pinnedFile(inputs.questFlows,'questFlows'),
    pinnedFile(inputs.friendshipDefaults,'friendshipDefaults')
  ]);
  return projectPrivateRewardIndex({eventLinks,questFlows,friendshipDefaults},
    'pinned_original_sha256');
}

export interface CombinedGuideRewardOrigin {
  readonly itemId:string;
  readonly originalVersion:string;
  readonly kind:'public_starpath'|'owner_private_historical';
  readonly starpath:GuideItemRelation|null;
  readonly historical:PrivateGuideRewardCandidate|null;
}
/** Pure composition: never asserts cross-version semantic equivalence. */
export function combineGuideItemOrigins(
  publicIndex:GuideRewardIndex,
  privateIndex:PrivateGuideRewardIndex,
  id:string|number
):readonly CombinedGuideRewardOrigin[]{
  ensure(publicIndex?.contract==='wand.db03.reward-relations@1'&&
    privateIndex?.contract===DB03_PRIVATE_REWARD_CONTRACT,'INVALID_CROSS_SOURCE');
  const latest=publicIndex.getItemRelations(id).map(r=>lock({
    itemId:r.itemId,originalVersion:'1.26.2',kind:'public_starpath' as const,
    starpath:r,historical:null
  }));
  const old=privateIndex.getItemCandidates(id).map(r=>lock({
    itemId:r.itemId,originalVersion:'1.26.1',kind:'owner_private_historical' as const,
    starpath:null,historical:r
  }));
  return lock([...latest,...old]);
}
