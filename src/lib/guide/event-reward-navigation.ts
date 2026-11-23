/** Source-authenticated Item ID -> Guide event/friendship reward deep links.
 * A static reward candidate is not a guaranteed award or a current event.
 * This is a read-only cross-service navigation helper for DB-02/Collection.
 */
import type {
  PublicEventFriendshipRewards,NativeEventFriendshipItemRelation
} from './public-event-friendship-rewards.ts';
import type {EventRewardItemLabelIndex} from './event-reward-item-labels.ts';
import type {PublicEventRewardNameRefresh} from './public-event-reward-db00-refresh.ts';
import {collectionItemHref} from '../collection/item-permalink.ts';
export const DB03_EVENT_REWARD_NAVIGATION_SCHEMA='wand.db03.event-reward-navigation@1' as const;
const ITEM_ID=/^[1-9][0-9]{0,15}$/;
export interface EventRewardItemDestination{
  readonly itemId:string;
  readonly eventId:string|null;
  readonly section:'event'|'default_friendship';
  readonly candidateCount:number;
  readonly staticSourceOnly:true;
  readonly currentAvailabilityVerified:false;
}
function id(value:unknown):string|null{
  const text=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  return typeof text==='string'&&ITEM_ID.test(text)&&Number.isSafeInteger(Number(text))?text:null;
}
export function resolveEventRewardItemDestination(
  source:PublicEventFriendshipRewards,rawId:unknown
):EventRewardItemDestination|null{
  if(source?.schema!=='wand.db03.public-event-friendship-rewards@1'||
    source.coverage?.distinctAllItemIds!==141||typeof source.getItemCandidates!=='function')
    throw new TypeError('DB03_EVENT_REWARD_NAVIGATION_SOURCE_REQUIRED');
  const value=id(rawId);
  if(!value)return null;
  const matches:readonly NativeEventFriendshipItemRelation[]=source.getItemCandidates(value);
  if(!matches.length)return null;
  // An internal TestEv reward never becomes a user-facing event link.
  const event=matches.find(row=>row.kind==='event_reward_candidate'&&
    row.event!==null&&row.event.id!=='TestEv'&&
    row.eventReward?.itemId===value)?.event;
  if(event){
    return Object.freeze({itemId:value,eventId:event.id,section:'event' as const,
      candidateCount:matches.length,staticSourceOnly:true as const,
      currentAvailabilityVerified:false as const});
  }
  if(matches.some(row=>row.kind==='default_friendship_reward'&&
    row.defaultFriendship?.itemId===value))
    return Object.freeze({itemId:value,eventId:null,
      section:'default_friendship' as const,candidateCount:matches.length,
      staticSourceOnly:true as const,currentAvailabilityVerified:false as const});
  return null;
}
/** Direct link is safe even when the item has no known Guide reward link.
 * Consumers can check resolveEventRewardItemDestination first.
 */
export function guideEventRewardItemHref(rawId:unknown,base=''):string|null{
  const itemId=id(rawId);
  if(!itemId)return null;
  if(typeof base!=='string'||!/^\/?(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(base))
    throw new TypeError('DB03_EVENT_REWARD_NAVIGATION_BASE');
  const root=base===''?'':('/'+base.replace(/^\/+|\/+$/g,''));
  return root+'/guide/events/?item='+itemId;
}

/** A source-exact event+Item pair. Unlike a generic Item link this never
 * selects the first of several historical event definitions by accident. */
export interface EventRewardOccurrenceDestination{
  readonly eventId:string;
  readonly eventFamily:'mini_event'|'floating_festival';
  readonly itemId:string;
  readonly sourceConfigurationOnly:true;
  readonly currentAvailabilityVerified:false;
}
function requireEventSource(source:PublicEventFriendshipRewards):void{
  if(source?.schema!=='wand.db03.public-event-friendship-rewards@1'||
    source.coverage?.sourceNativeEvents!==24||
    source.coverage?.eventRewardCandidates!==202||
    !Array.isArray(source.events)||typeof source.getItemCandidates!=='function')
    throw new TypeError('DB03_EVENT_REWARD_OCCURRENCE_SOURCE_REQUIRED');
}
function matchedEvent(
  source:PublicEventFriendshipRewards,eventId:unknown,rawItemId:unknown
):EventRewardOccurrenceDestination|null{
  requireEventSource(source);
  const itemId=id(rawItemId);
  if(typeof eventId!=='string'||itemId===null||eventId==='TestEv')return null;
  const events=source.events.filter(event=>event.id===eventId&&
    event.rewards.some(reward=>reward.itemId===itemId&&
      reward.sourceConfigurationOnly===true&&reward.grantedVerified===false));
  if(events.length!==1)return null;
  const event=events[0];
  return Object.freeze({eventId:event.id,eventFamily:event.kind,itemId,
    sourceConfigurationOnly:true as const,currentAvailabilityVerified:false as const});
}
export function resolveEventRewardOccurrenceDestination(
  source:PublicEventFriendshipRewards,search:unknown
):EventRewardOccurrenceDestination|null{
  requireEventSource(source);
  if(typeof search!=='string'||search.length>2048)return null;
  const params=new URLSearchParams(search);
  const eventIds=params.getAll('event'),items=params.getAll('item');
  if(eventIds.length!==1||items.length!==1||
    ['scene','quest','duty'].some(key=>params.has(key)))return null;
  return matchedEvent(source,eventIds[0],items[0]);
}
export function guideEventRewardOccurrenceHref(
  source:PublicEventFriendshipRewards,eventId:unknown,rawItemId:unknown,
  base=''
):string|null{
  const match=matchedEvent(source,eventId,rawItemId);
  if(!match)return null;
  if(typeof base!=='string'||!/^\/?(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(base))
    throw new TypeError('DB03_EVENT_REWARD_OCCURRENCE_BASE');
  const root=base===''?'':'/'+base.replace(/^\/+|\/+$/g,'');
  return root+'/guide/events/?event='+encodeURIComponent(match.eventId)+'&item='+match.itemId;
}
/** Source-confirmed other-event references; no live or eligibility implication. */
export function relatedEventRewardIds(
  source:PublicEventFriendshipRewards,rawItemId:unknown
):readonly string[]{
  requireEventSource(source);
  const itemId=id(rawItemId);
  if(!itemId)return Object.freeze([]);
  const known=new Set(source.events.filter(event=>event.id!=='TestEv').map(event=>event.kind+':'+event.id));
  const ids=new Set<string>();
  for(const relation of source.getItemCandidates(itemId)){
    if(relation.kind!=='event_reward_candidate'||!relation.event||
      !relation.eventReward||relation.eventReward.itemId!==itemId||
      relation.eventReward.sourceConfigurationOnly!==true||
      relation.eventReward.grantedVerified!==false||
      !known.has(relation.event.kind+':'+relation.event.id))continue;
    ids.add(relation.event.id);
  }
  return Object.freeze([...ids]);
}

/** Source-confirmed public DB-00 membership -> native Collection inspector.
 * A name from an external site, a reward occurrence alone, or an unknown
 * Item ID must never imply that this Item exists in the published catalogue.
 */
export function guideEventRewardCollectionHref(
  source:PublicEventFriendshipRewards,
  labels:EventRewardItemLabelIndex|null,
  updated:PublicEventRewardNameRefresh|null,
  rawItemId:unknown,base=''
):string|null{
  if(source?.schema!=='wand.db03.public-event-friendship-rewards@1'||
    source.coverage?.distinctAllItemIds!==141||
    typeof source.getItemCandidates!=='function')
    throw new TypeError('DB03_EVENT_COLLECTION_SOURCE_REQUIRED');
  const itemId=id(rawItemId);
  if(!itemId||!labels||!source.getItemCandidates(itemId).length)return null;
  if(labels.schema!=='wand.db03.event-reward-item-labels@1'||
    labels.gameVersion!=='1.26.2'||
    labels.coverage?.rewardItemIds!==141||
    labels.coverage?.verifiedNames!==109||
    typeof labels.getItem!=='function')
    throw new TypeError('DB03_EVENT_COLLECTION_LABELS_REQUIRED');
  const row=labels.getItem(itemId);
  if(row?.itemId!==itemId)return null;
  let verified=row.status==='verified'&&row.names!==null;
  if(!verified&&updated){
    if(updated.schema!=='wand.db03.public-reward-name-refresh@1'||
      updated.currentVersionOnly!==true||
      updated.privateSourceUsed!==false||
      updated.playerOwnershipVerified!==false||
      !Array.isArray(updated.newVerifiedItemIds))
      throw new TypeError('DB03_EVENT_COLLECTION_REFRESH_REQUIRED');
    verified=updated.newVerifiedItemIds.includes(itemId)&&
      typeof updated.getDisplayName(itemId,'ja')==='string';
  }
  return verified?collectionItemHref(base,Number(itemId)):null;
}
