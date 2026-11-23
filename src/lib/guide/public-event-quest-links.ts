/** Exact static Mini Event -> Quest references from original ProtoDb.
 * Public projection retains only ID relationships, not the private source,
 * player progress, event availability, unlock order or prerequisites.
 */
import {verifyPublicQuestIndex} from './public-guide.mjs';
import type {PublicEventFriendshipRewards} from './public-event-friendship-rewards.ts';

export const DB03_EVENT_QUEST_SCHEMA='wand.db03.public-event-quest-links@1' as const;
export const DB03_EVENT_QUEST_FILE='event-quest-links-1.26.2.json' as const;
export const DB03_EVENT_QUEST_BYTES=1755 as const;
export const DB03_EVENT_QUEST_SHA='968d495ddbc93e6545fddef140182b420ecbb1c092a9a129e515b37af705eea8' as const;
const PROTO_SHA='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const ORIGINAL_LINKS_SHA='4802d7f6cfd4f72733ceb5c16dd149aa6e724e118bb5795b6c72ad50ebee3b0c';
const ORIGINAL_EVENTS_SHA='9b8857dfaa557a458a8e922ea4145895bc698e50d8d1ce0ad68017492f18b5c9';
const ID=/^[1-9][0-9]{0,15}$/;
const EVENT_ID=/^[A-Za-z0-9_!-]{1,128}$/;
const EMPTY=Object.freeze([]) as readonly EventQuestSourceLink[];
const obj=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
function check(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('DB03_EVENT_QUEST_'+code);
}
export interface EventQuestSourceLink {
  readonly eventId:string;
  readonly questId:string;
  /** Zero-based position in native protobuf.11 array; not chronological order. */
  readonly sourcePosition:number;
  readonly nativeStaticReference:true;
  readonly prerequisiteVerified:false;
  readonly liveEventVerified:false;
  readonly playerCompletionVerified:false;
}
export interface PublicEventQuestIndex {
  readonly schema:typeof DB03_EVENT_QUEST_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly coverage:Readonly<{
    originalSourceLinks:66;
    excludedInternalTestLinks:4;
    publicLinks:62;
    linkedEvents:8;
    distinctQuests:49;
    sourceOnly:true;
    currentAvailabilityVerified:false;
    questPrerequisitesVerified:false;
    playerProgressVerified:false;
  }>;
  getEventQuests(eventId:string):readonly EventQuestSourceLink[];
  getQuestEvents(questId:string):readonly EventQuestSourceLink[];
}
/** Requires independently source-verified public Events and Quest catalogue. */
export function verifyPublicEventQuestLinks(
  raw:unknown,
  rewards:PublicEventFriendshipRewards,
  questCatalogue:unknown
):PublicEventQuestIndex{
  check(rewards?.schema==='wand.db03.public-event-friendship-rewards@1'&&
    rewards.coverage?.sourceNativeEvents===24&&
    rewards.coverage?.miniEvents===19&&
    rewards.coverage?.liveEventAvailabilityVerified===false&&
    typeof rewards.getEvent==='function','EVENT_SOURCE_REQUIRED');
  const quests=verifyPublicQuestIndex(questCatalogue);
  const questIds=new Set<string>(quests.quests.map((r:{id:string})=>r.id));
  check(questIds.size===733,'QUEST_SOURCE_REQUIRED');
  check(obj(raw)&&raw.schema===DB03_EVENT_QUEST_SCHEMA&&
    obj(raw.target)&&raw.target.platform==='Steam'&&raw.target.gameVersion==='1.26.2',
    'TARGET');
  const source=raw.source,counts=raw.counts;
  check(obj(source)&&source.protoDbSha256===PROTO_SHA&&
    source.originalEventLinksSha256===ORIGINAL_LINKS_SHA&&
    source.eventRewardProjectionSha256===ORIGINAL_EVENTS_SHA&&
    source.staticMiniEventSourceOnly===true&&
    source.liveEventsVerified===false&&source.prerequisitesVerified===false&&
    source.playerCompletionVerified===false&&
    source.internalTestEventExcluded===true,'SOURCE_PROVENANCE');
  check(obj(counts)&&counts.sourceMiniEventQuestReferences===66&&
    counts.excludedInternalTestReferences===4&&counts.publishedEventQuestReferences===62&&
    counts.publicEventDefinitionsWithQuestLinks===8&&
    counts.distinctReferencedQuestIds===49&&obj(raw.events)&&
    Object.keys(raw.events).length===8,'CENSUS');
  const byEvent=new Map<string,readonly EventQuestSourceLink[]>();
  const byQuest=new Map<string,EventQuestSourceLink[]>();
  const pairs=new Set<string>();
  const distinct=new Set<string>();
  let total=0;
  for(const [eventId,rows] of Object.entries(raw.events)){
    check(EVENT_ID.test(eventId)&&eventId!=='TestEv'&&
      rewards.getEvent('mini_event',eventId)!==null&&
      Array.isArray(rows)&&rows.length>0&&rows.length<50,'EVENT_ID');
    const links:EventQuestSourceLink[]=[];
    for(let pos=0;pos<rows.length;pos++){
      const questId=rows[pos];
      check(typeof questId==='string'&&ID.test(questId)&&
        questIds.has(questId),'QUEST_ID');
      const key=eventId+':'+questId;
      check(!pairs.has(key),'DUPLICATE_REFERENCE');pairs.add(key);
      distinct.add(questId);total++;
      const link:EventQuestSourceLink=Object.freeze({
        eventId,questId,sourcePosition:pos,nativeStaticReference:true,
        prerequisiteVerified:false,liveEventVerified:false,
        playerCompletionVerified:false
      });
      links.push(link);
      const reverse=byQuest.get(questId)??[];
      reverse.push(link);byQuest.set(questId,reverse);
    }
    byEvent.set(eventId,Object.freeze(links));
  }
  check(total===62&&pairs.size===62&&byEvent.size===8&&distinct.size===49,
    'RECOMPUTED_CENSUS');
  for(const [key,rows] of byQuest)byQuest.set(key,Object.freeze(rows) as EventQuestSourceLink[]);
  return Object.freeze({
    schema:DB03_EVENT_QUEST_SCHEMA,gameVersion:'1.26.2' as const,
    coverage:Object.freeze({
      originalSourceLinks:66 as const,excludedInternalTestLinks:4 as const,
      publicLinks:62 as const,linkedEvents:8 as const,distinctQuests:49 as const,
      sourceOnly:true as const,currentAvailabilityVerified:false as const,
      questPrerequisitesVerified:false as const,playerProgressVerified:false as const
    }),
    getEventQuests:(id:string)=>typeof id==='string'?byEvent.get(id)??EMPTY:EMPTY,
    getQuestEvents:(id:string)=>typeof id==='string'?byQuest.get(id)??EMPTY:EMPTY
  });
}
export async function loadPublicEventQuestLinks(
  rewards:PublicEventFriendshipRewards,
  questCatalogue:unknown,
  url:string,
  fetcher:typeof fetch=fetch
):Promise<PublicEventQuestIndex>{
  check(typeof url==='string'&&url.length>0&&url.length<2048,'URL');
  const response=await fetcher(url);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB03_EVENT_QUEST_BYTES,'BYTES');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(b=>b.toString(16).padStart(2,'0')).join('');
  check(sha===DB03_EVENT_QUEST_SHA,'SHA');
  const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  return verifyPublicEventQuestLinks(raw,rewards,questCatalogue);
}


/** Exact public-native Quest ID permalink to source-linked Mini Events.
 * This static association is not a quest prerequisite, availability or progress check.
 */
export function guideEventQuestHref(
  index:PublicEventQuestIndex,raw:unknown,base=''
):string|null{
  check(index?.schema===DB03_EVENT_QUEST_SCHEMA&&
    typeof index.getQuestEvents==='function','INDEX_REQUIRED');
  const value=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  const id=typeof value==='string'&&ID.test(value)&&
    Number.isSafeInteger(Number(value))?value:null;
  if(!id||index.getQuestEvents(id).length===0)return null;
  check(typeof base==='string'&&
    /^\/?(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(base),'BASE');
  const root=base===''?'':('/'+base.replace(/^\/+|\/+$/g,''));
  return root+'/guide/events/?quest='+id;
}
