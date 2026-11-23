/** SHA-pinned public projection of exact native Mini Event -> Duty IDs.
 *
 * Cross-service lookup for DB-03 Guide, DB-05 Save, and DB-00 origin joins.
 * No private DutyAch file, native duty names, save, or live event status ships.
 * Source slot positions are static configuration, NOT task chronology.
 */
import type {PublicEventFriendshipRewards} from './public-event-friendship-rewards.ts';

export const DB03_EVENT_DUTY_SCHEMA='wand.db03.public-event-duty-links@1' as const;
export const DB03_EVENT_DUTY_FILE='event-duty-links-1.26.2.json' as const;
export const DB03_EVENT_DUTY_BYTES=2218 as const;
export const DB03_EVENT_DUTY_SHA='c8433a39bc374f8b42ecac64b84aa34368c504bde9c2976f147a2d8ec4a87e2e' as const;
const NATIVE_PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const ORIGINAL_EVENT_LINKS='4802d7f6cfd4f72733ceb5c16dd149aa6e724e118bb5795b6c72ad50ebee3b0c';
const PUBLIC_EVENTS='9b8857dfaa557a458a8e922ea4145895bc698e50d8d1ce0ad68017492f18b5c9';
const ID=/^[1-9][0-9]{0,15}$/;
const EVENT=/^[A-Za-z0-9_!-]{1,128}$/;
const object=(value:unknown):value is Record<string,unknown> =>
  value!==null&&typeof value==='object'&&!Array.isArray(value);
function check(condition:unknown,reason:string):asserts condition{
  if(!condition)throw new TypeError('DB03_EVENT_DUTY_'+reason);
}
export interface EventDutySourceLink {
  readonly eventId:string;
  readonly dutyId:string;
  /** Native protobuf.10[index], never an availability or ordering claim. */
  readonly sourcePosition:number;
  readonly nativeDutyIndexMembershipVerified:true;
  readonly sourceConfigurationOnly:true;
  readonly currentAvailabilityVerified:false;
  readonly dutyUnlockConditionVerified:false;
  readonly playerProgressVerified:false;
  readonly dutyNameVerified:false;
}
export interface PublicEventDutyIndex {
  readonly schema:typeof DB03_EVENT_DUTY_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly coverage:Readonly<{
    originalReferences:84;internalTestReferencesExcluded:5;
    publishedReferences:79;linkedEvents:18;distinctDuties:48;
    sourceOnly:true;currentAvailabilityVerified:false;
    dutyUnlockConditionsVerified:false;playerProgressVerified:false;
    dutyNamesVerified:false;
  }>;
  getEventDuties(eventId:string):readonly EventDutySourceLink[];
  getDutyEvents(dutyId:string|number):readonly EventDutySourceLink[];
}
const EMPTY=Object.freeze([]) as readonly EventDutySourceLink[];
const goodId=(id:unknown):id is string=>typeof id==='string'&&
  ID.test(id)&&Number.isSafeInteger(Number(id));
const normalizeId=(id:unknown):string|null=>{
  const value=typeof id==='number'&&Number.isSafeInteger(id)?String(id):id;
  return goodId(value)?value:null;
};

/** Check source-family, counters, and every referenced ID independently.
 * Caller-provided raw JSON alone is not cryptographic evidence: use loader.
 */
export function verifyPublicEventDutyLinks(
  raw:unknown,
  eventSource:PublicEventFriendshipRewards
):PublicEventDutyIndex{
  check(eventSource?.schema==='wand.db03.public-event-friendship-rewards@1'&&
    eventSource.coverage?.sourceNativeEvents===24&&
    eventSource.coverage?.miniEvents===19&&
    eventSource.coverage?.liveEventAvailabilityVerified===false&&
    typeof eventSource.getEvent==='function','EVENT_SOURCE_REQUIRED');
  check(object(raw)&&raw.schema===DB03_EVENT_DUTY_SCHEMA&&
    object(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2','TARGET');
  const source=raw.source,counts=raw.counts;
  check(object(source)&&
    source.protoDbSha256===NATIVE_PROTO&&
    source.originalEventLinksSha256===ORIGINAL_EVENT_LINKS&&
    source.eventRewardProjectionSha256===PUBLIC_EVENTS&&
    source.dutyOriginalIndexMembershipVerified===true&&
    source.staticMiniEventSourceOnly===true&&
    source.internalTestEventExcluded===true&&
    source.liveEventsVerified===false&&
    source.dutyUnlockConditionsVerified===false&&
    source.playerProgressVerified===false&&
    source.dutyNamesVerified===false,'PROVENANCE');
  check(object(counts)&&counts.originalDutyReferences===84&&
    counts.excludedInternalTestReferences===5&&
    counts.publishedDutyReferences===79&&
    counts.publishedLinkedEvents===18&&
    counts.distinctReferencedDutyIds===48&&
    object(raw.events)&&Object.keys(raw.events).length===18,'COUNTS');
  const byEvent=new Map<string,readonly EventDutySourceLink[]>();
  const byDuty=new Map<string,EventDutySourceLink[]>();
  const distinct=new Set<string>();
  let total=0;
  for(const [eventId,rows] of Object.entries(raw.events)){
    check(EVENT.test(eventId)&&eventId!=='TestEv'&&
      eventSource.getEvent('mini_event',eventId)!==null&&
      Array.isArray(rows)&&rows.length>0&&rows.length<=30,'EVENT');
    const refs:EventDutySourceLink[]=[];
    const seen=new Set<string>();
    for(let i=0;i<rows.length;i++){
      const dutyId=rows[i];
      check(goodId(dutyId),'DUTY_ID');
      check(!seen.has(dutyId),'DUPLICATE_DUTY');seen.add(dutyId);
      distinct.add(dutyId);
      const link=Object.freeze({
        eventId,dutyId,sourcePosition:i,
        nativeDutyIndexMembershipVerified:true as const,
        sourceConfigurationOnly:true as const,
        currentAvailabilityVerified:false as const,
        dutyUnlockConditionVerified:false as const,
        playerProgressVerified:false as const,
        dutyNameVerified:false as const
      });
      refs.push(link);
      let bucket=byDuty.get(dutyId);
      if(!bucket){bucket=[];byDuty.set(dutyId,bucket);}
      bucket.push(link);
      total++;
    }
    byEvent.set(eventId,Object.freeze(refs));
  }
  check(total===79&&byEvent.size===18&&distinct.size===48,'RECOMPUTED_COUNTS');
  const reverse=new Map<string,readonly EventDutySourceLink[]>();
  for(const [id,refs] of byDuty)reverse.set(id,Object.freeze(refs));
  return Object.freeze({
    schema:DB03_EVENT_DUTY_SCHEMA,
    gameVersion:'1.26.2' as const,
    coverage:Object.freeze({
      originalReferences:84 as const,internalTestReferencesExcluded:5 as const,
      publishedReferences:79 as const,linkedEvents:18 as const,
      distinctDuties:48 as const,sourceOnly:true as const,
      currentAvailabilityVerified:false as const,
      dutyUnlockConditionsVerified:false as const,
      playerProgressVerified:false as const,dutyNamesVerified:false as const
    }),
    getEventDuties:(id:string)=>typeof id==='string'?byEvent.get(id)??EMPTY:EMPTY,
    getDutyEvents:(id:string|number)=>reverse.get(normalizeId(id)??'')??EMPTY
  });
}
export async function loadPublicEventDutyLinks(
  eventSource:PublicEventFriendshipRewards,
  url:string,
  fetcher:typeof fetch=fetch
):Promise<PublicEventDutyIndex>{
  check(typeof url==='string'&&url.length>0&&url.length<2048,'URL');
  const response=await fetcher(url);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB03_EVENT_DUTY_BYTES,'BYTES');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(b=>b.toString(16).padStart(2,'0')).join('');
  check(hash===DB03_EVENT_DUTY_SHA,'SHA');
  return verifyPublicEventDutyLinks(
    JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),eventSource);
}


/** Exact public-native Duty ID permalink; only source-linked Mini Events qualify.
 * A link never asserts the Duty was unlocked, completed, or active.
 */
export function guideEventDutyHref(
  index:PublicEventDutyIndex,raw:unknown,base=''
):string|null{
  check(index?.schema===DB03_EVENT_DUTY_SCHEMA&&
    typeof index.getDutyEvents==='function','INDEX_REQUIRED');
  const id=normalizeId(raw);
  if(!id||index.getDutyEvents(id).length===0)return null;
  check(typeof base==='string'&&
    /^\/?(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(base),'BASE');
  const root=base===''?'':('/'+base.replace(/^\/+|\/+$/g,''));
  return root+'/guide/events/?duty='+id;
}
