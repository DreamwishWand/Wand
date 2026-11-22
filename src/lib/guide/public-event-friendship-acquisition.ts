/** DB-03 verified static event/default-friendship rewards into existing DB-02 ItemOrigin. */
import {
  loadPublicEventFriendshipRewards,DB03_EVENT_FRIENDSHIP_REWARD_FILE,
  type PublicEventFriendshipRewards,type NativeEventFriendshipItemRelation,
  type PublicNativeEventFamily
} from './public-event-friendship-rewards.ts';
import type {ItemOrigin,OriginProvenance} from '../acquisition/origins.ts';
export const DB03_EVENT_FRIENDSHIP_ACQUISITION_SCHEMA=
  'wand.db03.public-event-friendship-acquisition@1' as const;
const PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const FRIENDSHIP='90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22';
const ID=/^[1-9][0-9]{0,15}$/;
const PINNED=new WeakSet<object>();
const EMPTY=Object.freeze([]) as readonly ItemOrigin[];
function check(ok:unknown,why:string):asserts ok{
  if(!ok)throw new TypeError('DB03_PUBLIC_EVENT_ACQUISITION_'+why);
}
function itemId(v:string|number):string|null{
  const x=typeof v==='number'&&Number.isSafeInteger(v)?String(v):v;
  return typeof x==='string'&&ID.test(x)&&Number.isSafeInteger(Number(x))?x:null;
}
export interface PublicEventFriendshipAcquisitionIndex{
  readonly schema:typeof DB03_EVENT_FRIENDSHIP_ACQUISITION_SCHEMA;
  readonly sourceIntegrity:'pinned_original_and_public_sha256';
  readonly origins:readonly ItemOrigin[];
  readonly coverage:Readonly<{
    eventRewardCandidates:202;
    friendshipDefaultCandidates:16;
    totalCandidates:218;
    distinctItemIds:141;
    liveEventAvailabilityVerified:false;
    characterSpecificFriendshipRewardsVerified:false;
    guaranteedGrantsVerified:false;
  }>;
  getItemCandidates(id:string|number):readonly ItemOrigin[];
  getEventCandidates(family:PublicNativeEventFamily,key:string):readonly ItemOrigin[];
  getDefaultFriendshipCandidates(level?:number):readonly ItemOrigin[];
}
export function hasPinnedPublicEventFriendshipEvidence(
  value:unknown
):value is PublicEventFriendshipAcquisitionIndex{
  return value!==null&&typeof value==='object'&&PINNED.has(value);
}
function origin(row:NativeEventFriendshipItemRelation,sourceUrl:string):ItemOrigin{
  check(row.guaranteedGrantVerified===false&&row.currentAvailabilityVerified===false&&
    itemId(row.itemId)!==null,'UNVERIFIED_REWARD');
  const event=row.event;
  const eventReward=row.eventReward;
  const friendship=row.defaultFriendship;
  let sourceId:string,sha:string,originId:string,name:string;
  const conditions=[
    'Original source reward configuration only; not a grant, ownership or live availability',
    'Original extracted Steam 1.26.1 game file independently matches Steam 1.26.2'
  ];
  let amount:number|null=null;
  if(row.kind==='event_reward_candidate'){
    check(event!==null&&eventReward!==null&&friendship===null&&
      eventReward.itemId===row.itemId&&eventReward.grantedVerified===false&&
      eventReward.eventId===event.id,'EVENT_REWARD_SOURCE');
    originId='db03:source:event:'+eventReward.relationIndex;
    sourceId='db03:native:mini_event';
    if(event.kind==='floating_festival')sourceId='db03:native:floating_festival';
    sha=PROTO;
    name='Event reward candidate: '+(event.names.en||event.id);
    amount=eventReward.configuredAmount!==null&&eventReward.configuredAmount>0?
      eventReward.configuredAmount:null;
    conditions.push('Original native event key: '+event.id);
    conditions.push('Original reward entry '+(eventReward.slotIndex+1));
    if(eventReward.configuredAmount!==null)
      conditions.push('Configured reward amount '+eventReward.configuredAmount+
        ' (not proof of award)');
  }else{
    check(row.kind==='default_friendship_reward'&&event===null&&eventReward===null&&
      friendship!==null&&friendship.itemId===row.itemId&&
      friendship.characterSpecificVerified===false&&friendship.grantedVerified===false,
      'FRIENDSHIP_REWARD_SOURCE');
    originId='db03:source:friendship:'+friendship.relationIndex;
    sourceId='db03:native:friendship_default';sha=FRIENDSHIP;
    name='Default friendship level '+friendship.level+' reward definition';
    amount=friendship.configuredAmount;
    conditions.push('Default friendship rewards only; no character-specific link');
    conditions.push('Default friendship level '+friendship.level+', stage '+friendship.stage);
    conditions.push('Configured reward amount '+amount+' (not proof of award)');
  }
  const provenance:OriginProvenance=Object.freeze({
    sourceId,kind:'verified_game_native' as const,sourceUrl,
    checkedOn:'2026-11-22',gameVersion:'1.26.2',sha256:sha
  });
  return Object.freeze({
    originId,itemId:row.itemId,kind:(event?'event_reward':'friendship_reward') as
      'event_reward'|'friendship_reward',
    routeStatus:'static_candidate_only' as const,campaignId:null,name,productId:null,
    quantity:amount,price:null,accessTier:'not_applicable' as const,
    window:Object.freeze({start:null,endExclusive:null}),salePeriods:Object.freeze([]),
    conditions:Object.freeze(conditions),source:provenance,
    availability:'not_live_verified' as const
  });
}
export async function loadPinnedPublicEventFriendshipAcquisition(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PublicEventFriendshipAcquisitionIndex>{
  check(typeof basePath==='string'&&(basePath===''||
    /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(basePath)),
    'INVALID_BASE_PATH');
  const url=basePath+'/guide/public/'+DB03_EVENT_FRIENDSHIP_REWARD_FILE;
  const source:PublicEventFriendshipRewards=await loadPublicEventFriendshipRewards(url,fetcher);
  check(source.coverage.eventRewardCandidates===202&&
    source.coverage.defaultFriendshipRewardCandidates===16&&
    source.coverage.distinctAllItemIds===141&&
    source.coverage.liveEventAvailabilityVerified===false&&
    source.coverage.characterSpecificFriendshipRewardsVerified===false,
    'UNVERIFIED_NATIVE_REWARDS');
  const byItem=new Map<string,ItemOrigin[]>();
  const byEvent=new Map<string,ItemOrigin[]>();
  const byFriendship=new Map<number,ItemOrigin[]>();
  const origins:ItemOrigin[]=[];
  const seen=new Set<string>();
  const ids=new Set<string>();
  let events=0,defaults=0;
  for(const item of source.events){
    for(const reward of item.rewards){
      const relations=source.getItemCandidates(reward.itemId);
      const ref=relations.find(r=>r.eventReward===reward);
      check(ref!==undefined,'MISSING_EVENT_REVERSE_INDEX');
      const row=origin(ref,url);
      check(!seen.has(row.originId),'DUPLICATE_ORIGIN');
      seen.add(row.originId);ids.add(row.itemId);origins.push(row);events++;
      const a=byItem.get(row.itemId)??[];a.push(row);byItem.set(row.itemId,a);
      const key=item.kind+':'+item.id;
      const list=byEvent.get(key)??[];list.push(row);byEvent.set(key,list);
    }
  }
  for(const reward of source.defaultFriendship){
    const ref=source.getItemCandidates(reward.itemId).find(r=>r.defaultFriendship===reward);
    check(ref!==undefined,'MISSING_FRIENDSHIP_REVERSE_INDEX');
    const row=origin(ref,url);
    check(!seen.has(row.originId),'DUPLICATE_ORIGIN');
    seen.add(row.originId);ids.add(row.itemId);origins.push(row);defaults++;
    const a=byItem.get(row.itemId)??[];a.push(row);byItem.set(row.itemId,a);
    const list=byFriendship.get(reward.level)??[];
    list.push(row);byFriendship.set(reward.level,list);
  }
  check(events===202&&defaults===16&&origins.length===218&&ids.size===141,
    'PROJECTION_CENSUS');
  for(const map of [byItem,byEvent,byFriendship])
    for(const rows of map.values())Object.freeze(rows);
  const data:PublicEventFriendshipAcquisitionIndex=Object.freeze({
    schema:DB03_EVENT_FRIENDSHIP_ACQUISITION_SCHEMA,
    sourceIntegrity:'pinned_original_and_public_sha256' as const,
    origins:Object.freeze(origins),
    coverage:Object.freeze({eventRewardCandidates:202 as const,
      friendshipDefaultCandidates:16 as const,totalCandidates:218 as const,
      distinctItemIds:141 as const,liveEventAvailabilityVerified:false as const,
      characterSpecificFriendshipRewardsVerified:false as const,
      guaranteedGrantsVerified:false as const}),
    getItemCandidates(id:string|number){return byItem.get(itemId(id)??'')??EMPTY;},
    getEventCandidates(family:PublicNativeEventFamily,key:string){
      return byEvent.get(family+':'+key)??EMPTY;
    },
    getDefaultFriendshipCandidates(level?:number){
      return level===undefined?Object.freeze([...origins.filter(r=>r.kind==='friendship_reward')]):
        byFriendship.get(level)??EMPTY;
    }
  });
  PINNED.add(data);
  return data;
}