/** Source-authenticated Item ID -> Guide event/friendship reward deep links.
 * A static reward candidate is not a guaranteed award or a current event.
 * This is a read-only cross-service navigation helper for DB-02/Collection.
 */
import type {
  PublicEventFriendshipRewards,NativeEventFriendshipItemRelation
} from './public-event-friendship-rewards.ts';
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
