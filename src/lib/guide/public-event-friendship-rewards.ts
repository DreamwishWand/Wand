/**
 * Steam 1.26.2-compatible source-native Mini Event, Floating Festival and
 * default friendship reward configuration. This public projection contains
 * archived static definitions only: no live event, grant, entitlement, save
 * state, or per-character friendship reward is inferred.
 */
export const DB03_EVENT_FRIENDSHIP_REWARD_SCHEMA='wand.db03.public-event-friendship-rewards@1' as const;
export const DB03_EVENT_FRIENDSHIP_REWARD_FILE='event-friendship-rewards-1.26.2.json' as const;
export const DB03_EVENT_FRIENDSHIP_REWARD_SHA='5e77bf56eedc0aca7dbd95f56687998c11acf68503c3dd8812028fec0ca51623' as const;
export const DB03_EVENT_FRIENDSHIP_REWARD_BYTES=14513 as const;
const PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const FRIENDSHIP='90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22';
const LINKS='4802d7f6cfd4f72733ceb5c16dd149aa6e724e118bb5795b6c72ad50ebee3b0c';
const DEFAULTS='4bcb2675ef5152590b9efd67bfa5487cbc2479a31fecf0fab0ad412e1210a9b0';
const ID=/^[1-9][0-9]{0,15}$/;
const EVENT=/^[A-Za-z0-9_!-]{1,128}$/;
const LOCALES=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'] as const;
const STAGES=['FirstIntermediateReward','SecondIntermediateReward','ThirdIntermediateReward','CompletedReward'] as const;
export type PublicNativeEventFamily='mini_event'|'floating_festival';
export interface NativeEventReward {
  readonly relationIndex:number;
  readonly slotIndex:number;
  readonly itemId:string;
  readonly configuredAmount:number|null;
  readonly relationId:string;
  readonly eventId:string;
  readonly eventFamily:PublicNativeEventFamily;
  readonly sourceConfigurationOnly:true;
  readonly grantedVerified:false;
}
export interface NativeEventDefinition {
  readonly id:string;
  readonly kind:PublicNativeEventFamily;
  readonly names:Readonly<Record<string,string>>;
  readonly rewards:readonly NativeEventReward[];
  readonly liveStatusVerified:false;
}
export interface NativeDefaultFriendshipReward {
  readonly relationIndex:number;
  readonly relationId:string;
  readonly level:number;
  readonly stage:typeof STAGES[number];
  readonly itemId:string;
  readonly configuredAmount:number;
  readonly characterSpecificVerified:false;
  readonly grantedVerified:false;
}
export interface NativeEventFriendshipItemRelation {
  readonly kind:'event_reward_candidate'|'default_friendship_reward';
  readonly itemId:string;
  readonly event:NativeEventDefinition|null;
  readonly eventReward:NativeEventReward|null;
  readonly defaultFriendship:NativeDefaultFriendshipReward|null;
  readonly guaranteedGrantVerified:false;
  readonly currentAvailabilityVerified:false;
}
export interface PublicEventFriendshipRewards {
  readonly schema:typeof DB03_EVENT_FRIENDSHIP_REWARD_SCHEMA;
  readonly events:readonly NativeEventDefinition[];
  readonly defaultFriendship:readonly NativeDefaultFriendshipReward[];
  readonly coverage:Readonly<{
    sourceNativeEvents:24;miniEvents:19;floatingFestivals:5;
    eventRewardCandidates:202;defaultFriendshipRewardCandidates:16;
    distinctEventItemIds:139;distinctAllItemIds:141;
    completeHistoricalEvents:false;liveEventAvailabilityVerified:false;
    characterSpecificFriendshipRewardsVerified:false;
  }>;
  getEvent(family:PublicNativeEventFamily,id:string):NativeEventDefinition|null;
  getItemCandidates(itemId:string|number):readonly NativeEventFriendshipItemRelation[];
  getDefaultFriendshipRewards(level?:number):readonly NativeDefaultFriendshipReward[];
}
function ensure(value:unknown,code:string):asserts value {
  if(!value)throw new TypeError('DB03_EVENT_FRIENDSHIP_REWARDS_'+code);
}
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safe=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const goodId=(v:unknown):v is string=>typeof v==='string'&&ID.test(v)&&Number.isSafeInteger(Number(v));
function id(value:string|number):string|null {
  const s=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  return goodId(s)?s:null;
}
const EMPTY=Object.freeze([]) as readonly NativeEventFriendshipItemRelation[];
const EMPTY_DEFAULT=Object.freeze([]) as readonly NativeDefaultFriendshipReward[];

export function verifyPublicEventFriendshipRewards(raw:unknown):PublicEventFriendshipRewards {
  ensure(obj(raw)&&raw.schema===DB03_EVENT_FRIENDSHIP_REWARD_SCHEMA&&
    obj(raw.target)&&raw.target.platform==='Steam'&&raw.target.gameVersion==='1.26.2',
    'SCHEMA_OR_TARGET');
  const source=raw.source;
  ensure(obj(source)&&source.originalExtractVersion==='1.26.1'&&
    source.staticGameFilesIdenticalTo1262===true&&source.protoDbSha256===PROTO&&
    source.defaultFriendshipSha256===FRIENDSHIP&&
    source.originalEventLinksSha256===LINKS&&
    source.originalFriendshipProjectionSha256===DEFAULTS&&
    source.staticCandidatesOnly===true&&source.liveStateVerified===false&&
    source.characterSpecificFriendshipRewardsVerified===false,'SOURCE_PROVENANCE');
  const counts=raw.counts;
  ensure(obj(counts)&&counts.events===24&&counts.miniEvents===19&&
    counts.floatingFestivals===5&&counts.eventRewardCandidates===202&&
    counts.miniEventCandidates===171&&counts.festivalCandidates===31&&
    counts.friendshipDefaultCandidates===16&&counts.distinctEventItemIds===139&&
    counts.distinctAllItemIds===141,'SOURCE_CENSUS');
  ensure(Array.isArray(raw.events)&&raw.events.length===24&&
    Array.isArray(raw.defaultFriendshipRewards)&&raw.defaultFriendshipRewards.length===16,
    'SOURCE_RECORDS');
  const events:NativeEventDefinition[]=[];
  const defaults:NativeDefaultFriendshipReward[]=[];
  const byItem=new Map<string,NativeEventFriendshipItemRelation[]>();
  const byEvent=new Map<string,NativeEventDefinition>();
  const seenSlots=new Set<string>();
  const seenLinks=new Set<number>();
  const distinctEvents=new Set<string>();
  let mini=0,fest=0;
  function link(row:NativeEventFriendshipItemRelation){
    const rows=byItem.get(row.itemId)??[];
    rows.push(Object.freeze(row));byItem.set(row.itemId,rows);
  }
  for(const e of raw.events){
    ensure(obj(e)&&(e.kind==='mini_event'||e.kind==='floating_festival')&&
      typeof e.id==='string'&&EVENT.test(e.id)&&obj(e.names)&&
      typeof e.names.en==='string'&&typeof e.names.ja==='string'&&
      Object.entries(e.names).every(([lang,name])=>LOCALES.includes(lang as typeof LOCALES[number])&&
        typeof name==='string'&&name.length>0&&name.length<=240)&&
      Array.isArray(e.rewards),'EVENT_RECORD');
    const key=e.kind+':'+e.id;
    ensure(!byEvent.has(key),'DUPLICATE_EVENT');
    const names=Object.freeze({...e.names}) as Record<string,string>;
    const rewardRows:NativeEventReward[]=[];
    const kind=e.kind as PublicNativeEventFamily;
    for(const r of e.rewards){
      ensure(Array.isArray(r)&&r.length===4&&safe(r[0])&&r[0]<381&&
        safe(r[1])&&r[1]<1000&&goodId(r[2])&&
        (r[3]===null||safe(r[3])&&r[3]<=1_000_000_000),
        'EVENT_REWARD_TUPLE');
      const n=r[0] as number,pos=r[1] as number,itemId=r[2] as string,amount=r[3] as number|null;
      const slot=key+':'+pos;
      ensure(!seenSlots.has(slot)&&!seenLinks.has(n),'DUPLICATE_SOURCE_LINK');
      seenSlots.add(slot);seenLinks.add(n);distinctEvents.add(itemId);
      const reward:NativeEventReward=Object.freeze({
        relationIndex:n,slotIndex:pos,itemId,configuredAmount:amount,
        relationId:'event/'+n,eventId:e.id as string,eventFamily:kind,
        sourceConfigurationOnly:true,grantedVerified:false
      });
      rewardRows.push(reward);
    }
    ensure(rewardRows.every((r,i)=>r.slotIndex===i),'SOURCE_SLOT_ORDER');
    const event:NativeEventDefinition=Object.freeze({id:e.id as string,kind,names,
      rewards:Object.freeze(rewardRows),liveStatusVerified:false});
    events.push(event);byEvent.set(key,event);
    for(const reward of rewardRows)link({kind:'event_reward_candidate',itemId:reward.itemId,
      event,eventReward:reward,defaultFriendship:null,
      guaranteedGrantVerified:false,currentAvailabilityVerified:false});
    if(kind==='mini_event')mini+=rewardRows.length;else fest+=rewardRows.length;
  }
  ensure(mini===171&&fest===31&&distinctEvents.size===139&&seenLinks.size===202,
    'RECOMPUTED_EVENT_CENSUS');
  const stages=new Set<string>();
  for(const r of raw.defaultFriendshipRewards){
    ensure(Array.isArray(r)&&r.length===5&&safe(r[0])&&r[0]<16&&
      safe(r[1])&&r[1]>=1&&r[1]<=4&&safe(r[2])&&r[2]<4&&
      goodId(r[3])&&safe(r[4])&&r[4]>0&&r[4]<=1_000_000_000,
      'FRIENDSHIP_REWARD_TUPLE');
    const n=r[0] as number,level=r[1] as number,stageIndex=r[2] as number;
    const key=level+':'+stageIndex;
    ensure(n===defaults.length&&!stages.has(key),'DUPLICATE_FRIENDSHIP_STAGE');
    stages.add(key);
    const reward:NativeDefaultFriendshipReward=Object.freeze({
      relationIndex:n,relationId:'friendship/'+n,level,
      stage:STAGES[stageIndex],itemId:r[3] as string,configuredAmount:r[4] as number,
      characterSpecificVerified:false,grantedVerified:false
    });
    defaults.push(reward);
    link({kind:'default_friendship_reward',itemId:reward.itemId,event:null,eventReward:null,
      defaultFriendship:reward,guaranteedGrantVerified:false,
      currentAvailabilityVerified:false});
  }
  ensure(stages.size===16&&byItem.size===141,'RECOMPUTED_FRIENDSHIP_CENSUS');
  for(const values of byItem.values())Object.freeze(values);
  const coverage=Object.freeze({
    sourceNativeEvents:24 as const,miniEvents:19 as const,floatingFestivals:5 as const,
    eventRewardCandidates:202 as const,defaultFriendshipRewardCandidates:16 as const,
    distinctEventItemIds:139 as const,distinctAllItemIds:141 as const,
    completeHistoricalEvents:false as const,liveEventAvailabilityVerified:false as const,
    characterSpecificFriendshipRewardsVerified:false as const
  });
  return Object.freeze({schema:DB03_EVENT_FRIENDSHIP_REWARD_SCHEMA,coverage,
    events:Object.freeze(events),defaultFriendship:Object.freeze(defaults),
    getEvent:(family:PublicNativeEventFamily,key:string)=>byEvent.get(family+':'+key)??null,
    getItemCandidates:(value:string|number)=>byItem.get(id(value)??'')??EMPTY,
    getDefaultFriendshipRewards:(level?:number)=>level===undefined?
      Object.freeze([...defaults]):level>=1&&level<=4?
      Object.freeze(defaults.filter(r=>r.level===level)):EMPTY_DEFAULT
  });
}
/** SHA-checked, statically source-backed public reader. */
export async function loadPublicEventFriendshipRewards(
  url:string,fetcher:typeof fetch=fetch
):Promise<PublicEventFriendshipRewards>{
  ensure(typeof url==='string'&&url.length>0&&url.length<2048,'URL');
  const response=await fetcher(url);
  ensure(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  ensure(bytes.byteLength===DB03_EVENT_FRIENDSHIP_REWARD_BYTES,'PUBLIC_BYTES');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  ensure(sha===DB03_EVENT_FRIENDSHIP_REWARD_SHA,'PUBLIC_SHA');
  return verifyPublicEventFriendshipRewards(
    JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}